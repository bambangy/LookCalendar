// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// iCalendar (RFC 5545) import/export — interop with Google Calendar, Outlook, Apple Calendar and
// anything else that speaks .ics. Deliberately small, matching core/recurrence.js's own scope:
// RRULE is mapped to/from our simple { freq, interval, byWeekday, until, count, exdates } model
// (daily/weekly/monthly only) rather than implementing full RFC 5545 recurrence — an imported
// event whose RRULE doesn't fit that shape (YEARLY, BYSETPOS, BYMONTH, …) comes back as a single,
// non-recurring event at its DTSTART instead of being dropped or thrown on.

import { zonedParts, toZonedDate } from './timezone.js';

const CRLF = '\r\n';
const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']; // index = our 0 (Sun) … 6 (Sat)

// --- text escaping (RFC 5545 §3.3.11) -------------------------------------------------------

function escapeText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function unescapeText(s) {
  return String(s ?? '').replace(/\\n/gi, '\n').replace(/\\([\\;,])/g, '$1');
}

// Lines over 75 octets are "folded" with a CRLF + a single leading space; readers must unfold
// before parsing and producers should fold on write, though in practice most real-world readers
// (and every major calendar app) accept a single long line too — we fold anyway for RFC compliance.
function foldLine(line) {
  if (line.length <= 75) return line;
  let out = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length) {
    out += `${CRLF} ${rest.slice(0, 74)}`;
    rest = rest.slice(74);
  }
  return out;
}

function unfold(text) {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

// --- date formatting / parsing ---------------------------------------------------------------

function pad(n, len = 2) { return String(n).padStart(len, '0'); }

/** `DATE` value (all-day): YYYYMMDD, read in `timezone` if given (else the machine's own zone). */
function formatIcsDate(date, timezone) {
  const p = timezone ? zonedParts(date, timezone) : {
    year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
  };
  return `${p.year}${pad(p.month)}${pad(p.day)}`;
}

/** `DATE-TIME` value in UTC: YYYYMMDDTHHMMSSZ. */
function formatIcsUtc(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T`
    + `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/** `DATE-TIME` value as local wall-clock in `timezone` (no trailing Z — paired with a TZID param). */
function formatIcsLocal(date, timezone) {
  const p = zonedParts(date, timezone);
  return `${p.year}${pad(p.month)}${pad(p.day)}T${pad(p.hour)}${pad(p.minute)}${pad(p.second)}`;
}

/**
 * Parses a DTSTART/DTEND/EXDATE/UNTIL value + its parameters into `{ date, allDay, timezone }`.
 * @param {string} value — e.g. '20260302T090000Z', '20260302T090000', '20260302'
 * @param {Object} params — e.g. { VALUE: 'DATE', TZID: 'America/New_York' }
 */
function parseIcsDateTime(value, params = {}) {
  const allDay = params.VALUE === 'DATE' || /^\d{8}$/.test(value);
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const year = Number(y); const month = Number(mo); const day = Number(d);
  if (allDay) return { date: new Date(year, month - 1, day), allDay: true, timezone: null };
  const hour = Number(h || 0); const minute = Number(mi || 0); const second = Number(s || 0);
  if (z) return { date: new Date(Date.UTC(year, month - 1, day, hour, minute, second)), allDay: false, timezone: null };
  if (params.TZID) {
    return {
      date: toZonedDate({
        year, month, day, hour, minute, second,
      }, params.TZID),
      allDay: false,
      timezone: params.TZID,
    };
  }
  // A "floating" local time with no TZID and no Z — read in whatever zone runs this code, same as
  // every other naive Date in this library when no timezone is configured.
  return { date: new Date(year, month - 1, day, hour, minute, second), allDay: false, timezone: null };
}

// --- RRULE <-> our recurrence model -----------------------------------------------------------

/** Our `{ freq, interval, byWeekday, until, count, exdates }` -> an RFC 5545 `RRULE` value, or `null`. */
function ruleToRrule(rule, allDay, timezone) {
  if (!rule || !['daily', 'weekly', 'monthly'].includes(rule.freq)) return null;
  const parts = [`FREQ=${rule.freq.toUpperCase()}`];
  if (rule.interval && rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.freq === 'weekly' && Array.isArray(rule.byWeekday) && rule.byWeekday.length) {
    parts.push(`BYDAY=${rule.byWeekday.map((d) => WEEKDAY_CODES[d]).join(',')}`);
  }
  if (rule.count) parts.push(`COUNT=${rule.count}`);
  if (rule.until) {
    const until = rule.until instanceof Date ? rule.until : new Date(rule.until);
    parts.push(`UNTIL=${allDay ? formatIcsDate(until, timezone) : formatIcsUtc(until)}`);
  }
  return parts.join(';');
}

/** An RFC 5545 `RRULE` value -> our model, or `null` if its FREQ isn't one we expand (see module note). */
function rruleToRule(rrule) {
  const params = Object.fromEntries(rrule.split(';').map((kv) => {
    const i = kv.indexOf('=');
    return [kv.slice(0, i), kv.slice(i + 1)];
  }));
  const freq = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly' }[params.FREQ];
  if (!freq) return null; // YEARLY, or missing FREQ entirely — outside our deliberately small model
  const rule = { freq };
  if (params.INTERVAL) rule.interval = Number(params.INTERVAL);
  if (params.COUNT) rule.count = Number(params.COUNT);
  if (params.UNTIL) {
    const parsed = parseIcsDateTime(params.UNTIL);
    if (parsed) rule.until = parsed.date;
  }
  if (freq === 'weekly' && params.BYDAY) {
    rule.byWeekday = params.BYDAY.split(',')
      .map((code) => WEEKDAY_CODES.indexOf(code.replace(/^[+-]?\d+/, '')))
      .filter((i) => i !== -1);
  }
  return rule;
}

// --- export ------------------------------------------------------------------------------------

/**
 * Serializes events into an RFC 5545 VCALENDAR string — one VEVENT per event, suitable for
 * downloading as a `.ics` file or importing into Google Calendar/Outlook/Apple Calendar.
 * @param {Array<Object>} events — masters, not expanded instances (a recurring event's own
 *   `recurrence` is re-serialized as a single RRULE, not one VEVENT per occurrence) — pass
 *   `store.all()`, not `store.between()`
 * @param {Object} [opts]
 * @param {string} [opts.calendarName] — X-WR-CALNAME
 * @param {string} [opts.productId='-//LookCalendar//EN']
 * @returns {string}
 */
export function exportICS(events, opts = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${opts.productId || '-//LookCalendar//EN'}`,
    'CALSCALE:GREGORIAN',
  ];
  if (opts.calendarName) lines.push(`X-WR-CALNAME:${escapeText(opts.calendarName)}`);

  const stamp = formatIcsUtc(new Date());
  events.forEach((event) => {
    const zone = event.timezone || opts.timezone || null;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.id}@lookcalendar`);
    lines.push(`DTSTAMP:${stamp}`);
    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(event.start, zone)}`);
      lines.push(`DTEND;VALUE=DATE:${formatIcsDate(event.end, zone)}`);
    } else if (zone) {
      lines.push(`DTSTART;TZID=${zone}:${formatIcsLocal(event.start, zone)}`);
      lines.push(`DTEND;TZID=${zone}:${formatIcsLocal(event.end, zone)}`);
    } else {
      lines.push(`DTSTART:${formatIcsUtc(event.start)}`);
      lines.push(`DTEND:${formatIcsUtc(event.end)}`);
    }
    lines.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    const rrule = ruleToRrule(event.recurrence, event.allDay, zone);
    if (rrule) lines.push(`RRULE:${rrule}`);
    (event.recurrence?.exdates || []).forEach((d) => {
      const date = d instanceof Date ? d : new Date(d);
      if (event.allDay) lines.push(`EXDATE;VALUE=DATE:${formatIcsDate(date, zone)}`);
      else if (zone) lines.push(`EXDATE;TZID=${zone}:${formatIcsLocal(date, zone)}`);
      else lines.push(`EXDATE:${formatIcsUtc(date)}`);
    });
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}

// --- import --------------------------------------------------------------------------------

/**
 * Parses an RFC 5545 VCALENDAR string into events shaped for `store.add()`/`createCalendarStore({ events })`.
 * @param {string} ics
 * @returns {Array<Object>} `{ id, title, start, end, allDay, description, timezone?, recurrence? }`
 *   — a VEVENT whose RRULE doesn't fit this library's small recurrence model (see module note)
 *   comes back with no `recurrence` at all, just its single DTSTART/DTEND.
 */
export function importICS(ics) {
  const lines = unfold(String(ics)).split(/\r\n|\n|\r/).filter(Boolean);
  const events = [];
  let current = null;

  function parseLine(line) {
    const colon = line.indexOf(':');
    if (colon === -1) return null;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const [name, ...paramParts] = head.split(';');
    const params = Object.fromEntries(paramParts.map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i), p.slice(i + 1)];
    }));
    return { name: name.toUpperCase(), value, params };
  }

  lines.forEach((raw) => {
    const parsed = parseLine(raw);
    if (!parsed) return;
    const { name, value, params } = parsed;
    if (name === 'BEGIN' && value === 'VEVENT') { current = { exdates: [] }; return; }
    if (name === 'END' && value === 'VEVENT') {
      if (current?.start) {
        const event = {
          id: current.uid || undefined,
          title: current.title || '',
          start: current.start,
          end: current.end || current.start,
          allDay: !!current.allDay,
        };
        if (current.description) event.description = current.description;
        if (current.timezone) event.timezone = current.timezone;
        if (current.rrule) {
          const rule = rruleToRule(current.rrule);
          if (rule) {
            if (current.exdates.length) rule.exdates = current.exdates;
            event.recurrence = rule;
          }
        }
        events.push(event);
      }
      current = null;
      return;
    }
    if (!current) return;
    if (name === 'UID') current.uid = value;
    else if (name === 'SUMMARY') current.title = unescapeText(value);
    else if (name === 'DESCRIPTION') current.description = unescapeText(value);
    else if (name === 'RRULE') current.rrule = value;
    else if (name === 'DTSTART') {
      const parsedDate = parseIcsDateTime(value, params);
      if (parsedDate) { current.start = parsedDate.date; current.allDay = parsedDate.allDay; current.timezone = parsedDate.timezone; }
    } else if (name === 'DTEND') {
      const parsedDate = parseIcsDateTime(value, params);
      if (parsedDate) current.end = parsedDate.date;
    } else if (name === 'EXDATE') {
      const parsedDate = parseIcsDateTime(value, params);
      if (parsedDate) current.exdates.push(parsedDate.date);
    }
  });

  return events;
}
