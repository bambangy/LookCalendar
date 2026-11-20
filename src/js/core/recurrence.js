// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// A deliberately small recurrence engine — not a full RRULE parser.
//
// rule: {
//   freq: 'daily' | 'weekly' | 'monthly',
//   interval?: number = 1,
//   byWeekday?: number[]   — 0 (Sun) … 6 (Sat); 'weekly' only, defaults to the start day
//   until?: Date | string,
//   count?: number,
//   exdates?: (Date | string)[]  — instances to skip (matched by day)
// }
//
// The event shape stays the plain { start, end, ... } used everywhere else: expand() turns one
// master event + a rule into concrete { ...event, start, end, isRecurring: true, recurrenceId } entries.

import { addDays, addMonths, startOfDay, toDate } from './dateMath.js';
import {
  addDaysInZone, addMonthsInZone, startOfDayInZone, zonedParts, weekdayInZone,
} from './timezone.js';

const DAY_MS = 86400000;

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayKeyInZone(date, zone) {
  const p = zonedParts(date, zone);
  return `${p.year}-${p.month - 1}-${p.day}`; // 0-based month, matching dayKey()'s convention
}

/**
 * Expand a recurring event into concrete instances overlapping [rangeStart, rangeEnd].
 * @param {Object} event — must have `start`/`end` (Date) and `recurrence` (the rule above);
 *   `event.timezone` (an IANA zone) pins its *cadence* to that zone's wall clock — "daily at 9am"
 *   keeps meaning 9am in that zone across a DST transition, instead of drifting with whatever
 *   zone the day-arithmetic below would otherwise run in
 * @param {Date} rangeStart
 * @param {Date} rangeEnd
 * @param {number} [hardLimit=1000] — safety cap on generated instances
 * @param {string} [timezone] — fallback zone (e.g. from `createCalendarStore({ timezone })`) used
 *   when the event sets no `timezone` of its own; omit both to keep the exact pre-timezone-support
 *   behavior (the machine's own local time)
 * @returns {Array<Object>} events shaped like the master, with start/end replaced per instance
 */
export function expandRecurrence(event, rangeStart, rangeEnd, hardLimit = 1000, timezone) {
  const rule = event.recurrence;
  if (!rule || !rule.freq) return [];

  const zone = event.timezone || timezone || null;
  const zAddDays = (d, n) => (zone ? addDaysInZone(d, n, zone) : addDays(d, n));
  const zAddMonths = (d, n) => (zone ? addMonthsInZone(d, n, zone) : addMonths(d, n));
  const zStartOfDay = (d) => (zone ? startOfDayInZone(d, zone) : startOfDay(d));
  const zDayKey = (d) => (zone ? dayKeyInZone(d, zone) : dayKey(d));
  const zWeekday = (d) => (zone ? weekdayInZone(d, zone) : d.getDay());

  const interval = Math.max(1, Number(rule.interval) || 1);
  const until = rule.until ? toDate(rule.until) : null;
  const count = rule.count ? Number(rule.count) : null;
  const exdates = new Set((rule.exdates || []).map((d) => zDayKey(startOfDay(toDate(d) || d))));
  const durationMs = event.end.getTime() - event.start.getTime();

  const out = [];
  let seq = 0;
  let generated = 0;

  function emit(start) {
    generated += 1;
    if (until && start > until) return false;
    if (exdates.has(zDayKey(start))) return true;
    const end = new Date(start.getTime() + durationMs);
    if (start <= rangeEnd && end >= rangeStart) {
      out.push({
        ...event,
        start,
        end,
        isRecurring: true,
        recurrenceId: `${event.id}:${zDayKey(start)}`,
        masterId: event.id,
      });
    }
    return true;
  }

  if (rule.freq === 'daily') {
    let cursor = new Date(event.start);
    while (generated < hardLimit && (!count || seq < count)) {
      if (cursor > rangeEnd && (until ? cursor > until : true)) break;
      if (!emit(cursor)) break;
      seq += 1;
      cursor = zAddDays(cursor, interval);
    }
    return out;
  }

  if (rule.freq === 'weekly') {
    const weekdays = Array.isArray(rule.byWeekday) && rule.byWeekday.length
      ? [...new Set(rule.byWeekday)].sort((a, b) => a - b)
      : [zWeekday(event.start)];

    let weekStart = zStartOfDay(zAddDays(event.start, -zWeekday(event.start)));
    const eventDayStart = zStartOfDay(event.start);
    let week = 0;
    while (generated < hardLimit && (!count || seq < count)) {
      if (weekStart.getTime() - interval * 7 * DAY_MS > rangeEnd.getTime() && (until ? weekStart > until : true)) break;
      for (const wd of weekdays) {
        if (count && seq >= count) break;
        const day = zAddDays(weekStart, wd);
        if (day < eventDayStart) continue;
        if (!emit(day)) { week = Infinity; break; }
        seq += 1;
      }
      if (week === Infinity) break;
      week += 1;
      weekStart = zAddDays(weekStart, 7 * interval);
      if (weekStart > zAddDays(rangeEnd, 7 * interval) && (!until || weekStart > until)) break;
    }
    return out;
  }

  if (rule.freq === 'monthly') {
    let cursor = new Date(event.start);
    while (generated < hardLimit && (!count || seq < count)) {
      if (cursor > rangeEnd && (until ? cursor > until : true)) break;
      if (!emit(cursor)) break;
      seq += 1;
      cursor = zAddMonths(cursor, interval);
    }
    return out;
  }

  return out;
}
