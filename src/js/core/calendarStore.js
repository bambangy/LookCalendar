// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// calendarStore — the event/calendar model. Usable entirely on its own (no view, no DOM)
// if you only want the data layer and plan to render it yourself.

import {
  toDate, startOfDay, endOfDay, addDays, toIsoDate,
} from './dateMath.js';
import { expandRecurrence } from './recurrence.js';
import { autoColor } from './color.js';

let seq = 0;
function nextId() {
  seq += 1;
  return `lc-${Date.now().toString(36)}-${seq}`;
}

function normalizeEvent(input) {
  const start = toDate(input.start);
  if (!start) throw new Error('LookCalendar.calendarStore: event.start is required.');
  const end = toDate(input.end) || new Date(start.getTime() + 30 * 60000);
  return {
    id: input.id != null ? String(input.id) : nextId(),
    calendarId: input.calendarId ?? 'default',
    title: input.title ?? '',
    start,
    end,
    allDay: !!input.allDay,
    color: input.color ?? null,
    recurrence: input.recurrence ?? null,
    editable: input.editable !== false,
    data: input.data ?? null,
    ...Object.fromEntries(Object.entries(input).filter(([k]) => ![
      'id', 'calendarId', 'title', 'start', 'end', 'allDay', 'color', 'recurrence', 'editable', 'data',
    ].includes(k))),
  };
}

/**
 * @param {Object} [opts]
 * @param {Array}  [opts.events] — initial events
 * @param {Array}  [opts.calendars] — [{ id, name, color }]
 * @param {boolean} [opts.autoColor=true] — give an event with no explicit color and no calendar
 *   color a stable, deterministic color from a small palette (keyed on its id) instead of
 *   letting it fall through to the single CSS default (--lkc-event-color). Set `false` to keep
 *   every uncolored event on that one default color.
 * @param {string} [opts.timezone] — an IANA zone (e.g. 'America/New_York') recurring events'
 *   cadence is computed in by default (an event's own `event.timezone` overrides this). Leaving
 *   it unset keeps recurrence expansion exactly as it was: cadence follows the machine's own
 *   local time — see core/timezone.js.
 * @returns {Object} store
 */
export function createCalendarStore(opts = {}) {
  const events = new Map();
  const calendars = new Map();
  const listeners = new Set();
  const autoColorEnabled = opts.autoColor !== false;
  const timezone = opts.timezone || null;

  (opts.calendars || [{ id: 'default', name: 'Calendar', color: null }]).forEach((c) => {
    calendars.set(c.id, { id: c.id, name: c.name ?? c.id, color: c.color ?? null });
  });
  (opts.events || []).forEach((e) => {
    const n = normalizeEvent(e);
    events.set(n.id, n);
  });

  function emit(type, payload) {
    listeners.forEach((fn) => fn(type, payload));
  }

  // An event's *effective* color: its own `color` if set, else its calendar's color, else (when
  // autoColor is on, the default) a stable color hashed from its id, else null (the CSS default,
  // --lkc-event-color). Computed at read time — never baked into storage — so recoloring a
  // calendar (setCalendars) is reflected by every event in it immediately.
  function present(event) {
    if (event.color) return event;
    const calColor = calendars.get(event.calendarId)?.color ?? null;
    if (calColor) return { ...event, color: calColor };
    if (autoColorEnabled) return { ...event, color: autoColor(event.masterId || event.id) };
    return event;
  }

  function add(input) {
    const event = normalizeEvent(input);
    events.set(event.id, event);
    emit('add', event);
    return present(event);
  }

  function update(id, patch) {
    const current = events.get(String(id));
    if (!current) return null;
    const next = normalizeEvent({ ...current, ...patch, id: current.id });
    events.set(next.id, next);
    emit('update', { event: present(next), previous: present(current) });
    return present(next);
  }

  function remove(id) {
    const current = events.get(String(id));
    if (!current) return false;
    events.delete(String(id));
    emit('remove', present(current));
    return true;
  }

  // Adds `date` (the occurrence's original, un-edited start) to a recurrence rule's `exdates`,
  // so the next expansion skips generating that slot — used to carve a single occurrence out of
  // a series without touching the rest of it.
  function withExdate(rule, date) {
    return { ...rule, exdates: [...(rule.exdates || []), toIsoDate(startOfDay(date))] };
  }

  /**
   * Apply an edit to one instance of a (possibly recurring) event, the way every mainstream
   * calendar app asks "this event / this and following / all events".
   *
   * @param {Object} instance — an event *instance* as returned by `between()` (carries `masterId`
   *   for a recurring occurrence; a plain, non-recurring event works too and always behaves as 'all')
   * @param {Object} patch
   * @param {'this'|'following'|'all'} [scope='this']
   * @returns {Object|null} the event that was actually changed — the master for 'all'/'following',
   *   or the new standalone exception event for 'this'
   */
  function updateOccurrence(instance, patch, scope = 'this') {
    const masterId = instance.masterId || instance.id;
    const master = events.get(String(masterId));
    if (!master) return null;
    if (!instance.masterId || !master.recurrence || scope === 'all') {
      return update(masterId, patch);
    }

    if (scope === 'following') {
      const until = endOfDay(addDays(startOfDay(instance.start), -1));
      update(masterId, { recurrence: { ...master.recurrence, until } });
      const next = normalizeEvent({
        ...master,
        ...patch,
        id: undefined,
        start: patch.start ?? instance.start,
        end: patch.end ?? instance.end,
        recurrence: patch.recurrence !== undefined ? patch.recurrence : { ...master.recurrence, until: undefined },
      });
      events.set(next.id, next);
      emit('add', next);
      return present(next);
    }

    // scope === 'this': carve this date out of the master, replace it with a standalone event.
    update(masterId, { recurrence: withExdate(master.recurrence, instance.start) });
    const exception = normalizeEvent({
      ...master,
      ...patch,
      id: undefined,
      start: patch.start ?? instance.start,
      end: patch.end ?? instance.end,
      recurrence: null,
      recurringEventId: masterId,
      originalStart: toIsoDate(startOfDay(instance.start)),
    });
    events.set(exception.id, exception);
    emit('add', exception);
    return present(exception);
  }

  /**
   * Remove one instance of a (possibly recurring) event — same 'this'/'following'/'all' scopes
   * as `updateOccurrence`.
   * @returns {boolean}
   */
  function removeOccurrence(instance, scope = 'this') {
    const masterId = instance.masterId || instance.id;
    const master = events.get(String(masterId));
    if (!master) return false;
    if (!instance.masterId || !master.recurrence || scope === 'all') {
      return remove(masterId);
    }
    if (scope === 'following') {
      const until = endOfDay(addDays(startOfDay(instance.start), -1));
      update(masterId, { recurrence: { ...master.recurrence, until } });
      return true;
    }
    update(masterId, { recurrence: withExdate(master.recurrence, instance.start) });
    return true;
  }

  function get(id) {
    const event = events.get(String(id));
    return event ? present(event) : null;
  }

  function all() {
    return Array.from(events.values()).map(present);
  }

  function setCalendars(list) {
    calendars.clear();
    (list || []).forEach((c) => calendars.set(c.id, { id: c.id, name: c.name ?? c.id, color: c.color ?? null }));
    emit('calendars', allCalendars());
  }

  function allCalendars() {
    return Array.from(calendars.values());
  }

  function getCalendar(id) {
    return calendars.get(id) || null;
  }

  /**
   * Every concrete instance (recurring events expanded) overlapping [rangeStart, rangeEnd],
   * sorted by start time.
   */
  function between(rangeStart, rangeEnd) {
    const out = [];
    events.forEach((event) => {
      if (event.recurrence) {
        out.push(...expandRecurrence(event, rangeStart, rangeEnd, 1000, timezone));
        return;
      }
      if (event.start < rangeEnd && event.end > rangeStart) out.push(event);
    });
    return out.sort((a, b) => a.start - b.start || a.end - b.end).map(present);
  }

  function on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function destroy() {
    listeners.clear();
    events.clear();
    calendars.clear();
  }

  return {
    add,
    update,
    remove,
    updateOccurrence,
    removeOccurrence,
    get,
    all,
    between,
    setCalendars,
    calendars: allCalendars,
    getCalendar,
    on,
    destroy,
    timezone,
  };
}
