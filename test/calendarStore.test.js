// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
import { describe, it, expect, vi } from 'vitest';
import { createCalendarStore } from '../src/js/core/calendarStore.js';
import { PALETTE } from '../src/js/core/color.js';

describe('createCalendarStore', () => {
  it('adds, updates and removes events', () => {
    const store = createCalendarStore();
    const event = store.add({ title: 'Standup', start: new Date(2026, 0, 1, 9), end: new Date(2026, 0, 1, 9, 30) });
    expect(store.get(event.id).title).toBe('Standup');

    const updated = store.update(event.id, { title: 'Daily standup' });
    expect(updated.title).toBe('Daily standup');
    expect(store.all()).toHaveLength(1);

    expect(store.remove(event.id)).toBe(true);
    expect(store.get(event.id)).toBeNull();
  });

  it('notifies listeners on mutation', () => {
    const store = createCalendarStore();
    const fn = vi.fn();
    store.on(fn);
    const event = store.add({ title: 'X', start: new Date(), end: new Date() });
    store.update(event.id, { title: 'Y' });
    store.remove(event.id);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn.mock.calls.map((c) => c[0])).toEqual(['add', 'update', 'remove']);
  });

  it('between() returns events overlapping the range, including expanded recurrences', () => {
    const store = createCalendarStore({
      events: [
        { id: 'single', title: 'One-off', start: new Date(2026, 0, 5, 9), end: new Date(2026, 0, 5, 10) },
        {
          id: 'recurring',
          title: 'Daily sync',
          start: new Date(2026, 0, 1, 9),
          end: new Date(2026, 0, 1, 9, 15),
          recurrence: { freq: 'daily', count: 10 },
        },
      ],
    });

    const out = store.between(new Date(2026, 0, 4), new Date(2026, 0, 6, 23, 59));
    const titles = out.map((e) => e.title);
    expect(titles).toContain('One-off');
    expect(titles.filter((t) => t === 'Daily sync').length).toBeGreaterThan(0);
    expect(out.every((e, i) => i === 0 || out[i - 1].start <= e.start)).toBe(true);
  });

  it('manages calendars', () => {
    const store = createCalendarStore({ calendars: [{ id: 'work', name: 'Work', color: '#5c6bc0' }] });
    expect(store.getCalendar('work').name).toBe('Work');
    store.setCalendars([{ id: 'home', name: 'Home' }]);
    expect(store.calendars()).toHaveLength(1);
    expect(store.getCalendar('work')).toBeNull();
  });

  describe('effective event color', () => {
    it('falls back to the calendar color when the event has none', () => {
      const store = createCalendarStore({ calendars: [{ id: 'work', name: 'Work', color: '#5c6bc0' }] });
      const event = store.add({ calendarId: 'work', title: 'Standup', start: new Date(2026, 0, 1, 9), end: new Date(2026, 0, 1, 10) });
      expect(event.color).toBe('#5c6bc0');
      expect(store.get(event.id).color).toBe('#5c6bc0');
      expect(store.all()[0].color).toBe('#5c6bc0');
      expect(store.between(new Date(2026, 0, 1), new Date(2026, 0, 2))[0].color).toBe('#5c6bc0');
    });

    it('an explicit event color always wins over the calendar color', () => {
      const store = createCalendarStore({ calendars: [{ id: 'work', name: 'Work', color: '#5c6bc0' }] });
      const event = store.add({
        calendarId: 'work', color: '#ff0000', title: 'Urgent', start: new Date(2026, 0, 1, 9), end: new Date(2026, 0, 1, 10),
      });
      expect(event.color).toBe('#ff0000');
    });

    it('defaults (autoColor: true) to a stable, deterministic palette color when neither the event nor its calendar has one', () => {
      const store = createCalendarStore();
      const event = store.add({ title: 'Plain', start: new Date(2026, 0, 1, 9), end: new Date(2026, 0, 1, 10) });
      expect(PALETTE).toContain(event.color);
      // Same event, read again: same color every time (not re-randomized per read).
      expect(store.get(event.id).color).toBe(event.color);
      expect(store.all()[0].color).toBe(event.color);
    });

    it('autoColor: false keeps the old behavior — null, so the CSS default applies', () => {
      const store = createCalendarStore({ autoColor: false });
      const event = store.add({ title: 'Plain', start: new Date(2026, 0, 1, 9), end: new Date(2026, 0, 1, 10) });
      expect(event.color).toBeNull();
    });

    it('auto-assigned instances of a recurring event all share the same color', () => {
      const store = createCalendarStore({
        events: [{
          title: 'Daily sync', start: new Date(2026, 0, 1, 9), end: new Date(2026, 0, 1, 9, 15),
          recurrence: { freq: 'daily', count: 5 },
        }],
      });
      const out = store.between(new Date(2026, 0, 1), new Date(2026, 0, 10));
      expect(out.length).toBeGreaterThan(1);
      const colors = new Set(out.map((e) => e.color));
      expect(colors.size).toBe(1);
      expect(PALETTE).toContain([...colors][0]);
    });

    it('tracks a calendar recolor — existing events pick it up immediately', () => {
      const store = createCalendarStore({ calendars: [{ id: 'work', name: 'Work', color: '#5c6bc0' }] });
      const event = store.add({ calendarId: 'work', title: 'Standup', start: new Date(2026, 0, 1, 9), end: new Date(2026, 0, 1, 10) });
      expect(store.get(event.id).color).toBe('#5c6bc0');
      store.setCalendars([{ id: 'work', name: 'Work', color: '#00bcd4' }]);
      expect(store.get(event.id).color).toBe('#00bcd4');
    });

    it('resolves the calendar color for recurring instances too', () => {
      const store = createCalendarStore({
        calendars: [{ id: 'work', name: 'Work', color: '#5c6bc0' }],
        events: [{
          calendarId: 'work', title: 'Daily sync', start: new Date(2026, 0, 1, 9), end: new Date(2026, 0, 1, 9, 15),
          recurrence: { freq: 'daily', count: 3 },
        }],
      });
      const out = store.between(new Date(2026, 0, 1), new Date(2026, 0, 5));
      expect(out.length).toBeGreaterThan(0);
      expect(out.every((e) => e.color === '#5c6bc0')).toBe(true);
    });
  });

  describe('updateOccurrence / removeOccurrence — "this / following / all" editing', () => {
    function dailySeries() {
      return createCalendarStore({
        events: [{
          id: 'series',
          title: 'Daily sync',
          start: new Date(2026, 0, 1, 9, 0),
          end: new Date(2026, 0, 1, 9, 15),
          recurrence: { freq: 'daily', count: 10 },
        }],
      });
    }

    function occurrencesBetween(store) {
      return store.between(new Date(2026, 0, 1), new Date(2026, 0, 11));
    }

    it('"this" carves one occurrence out of the series without touching the others', () => {
      const store = dailySeries();
      const instances = occurrencesBetween(store);
      expect(instances).toHaveLength(10);
      const third = instances[2]; // Jan 3

      const changed = store.updateOccurrence(third, { title: 'Daily sync (special agenda)' }, 'this');
      expect(changed.title).toBe('Daily sync (special agenda)');
      expect(changed.recurrence).toBeNull(); // the exception is a standalone event now

      const after = occurrencesBetween(store);
      expect(after).toHaveLength(10); // still 10 — one exdated, one exception added back
      const jan3 = after.find((e) => e.start.getDate() === 3);
      expect(jan3.title).toBe('Daily sync (special agenda)');
      expect(jan3.masterId).toBeUndefined(); // no longer generated by the series
      // every other occurrence is untouched
      expect(after.filter((e) => e.title === 'Daily sync').length).toBe(9);
    });

    it('"following" ends the old series and starts a new one from that occurrence onward', () => {
      const store = dailySeries();
      const instances = occurrencesBetween(store);
      const fifth = instances[4]; // Jan 5

      store.updateOccurrence(fifth, { title: 'Daily sync (new time)', color: '#ab47bc' }, 'following');

      const after = occurrencesBetween(store);
      const before = after.filter((e) => e.start < fifth.start);
      const fromSplit = after.filter((e) => e.start >= fifth.start);

      expect(before.length).toBe(4); // Jan 1-4 unaffected
      expect(before.every((e) => e.title === 'Daily sync')).toBe(true);
      expect(fromSplit.length).toBeGreaterThan(0);
      expect(fromSplit.every((e) => e.title === 'Daily sync (new time)')).toBe(true);
      expect(fromSplit.every((e) => e.color === '#ab47bc')).toBe(true);
    });

    it('"all" behaves exactly like update() on the whole series', () => {
      const store = dailySeries();
      const instances = occurrencesBetween(store);
      store.updateOccurrence(instances[2], { title: 'Renamed' }, 'all');
      const after = occurrencesBetween(store);
      expect(after.every((e) => e.title === 'Renamed')).toBe(true);
    });

    it('a non-recurring instance always behaves as "all" regardless of scope', () => {
      const store = createCalendarStore({
        events: [{ id: 'single', title: 'One-off', start: new Date(2026, 0, 1, 9), end: new Date(2026, 0, 1, 10) }],
      });
      const instance = store.get('single');
      const updated = store.updateOccurrence(instance, { title: 'Renamed' }, 'this');
      expect(updated.title).toBe('Renamed');
      expect(updated.id).toBe('single');
    });

    it('removeOccurrence("this") removes just that date, the rest of the series remains', () => {
      const store = dailySeries();
      const instances = occurrencesBetween(store);
      const third = instances[2];
      expect(store.removeOccurrence(third, 'this')).toBe(true);
      const after = occurrencesBetween(store);
      expect(after).toHaveLength(9);
      expect(after.some((e) => e.start.getDate() === 3)).toBe(false);
      expect(after.some((e) => e.start.getDate() === 4)).toBe(true);
    });

    it('removeOccurrence("following") removes this and every later occurrence, keeps earlier ones', () => {
      const store = dailySeries();
      const instances = occurrencesBetween(store);
      const fifth = instances[4];
      expect(store.removeOccurrence(fifth, 'following')).toBe(true);
      const after = occurrencesBetween(store);
      expect(after).toHaveLength(4);
      expect(after.every((e) => e.start < fifth.start)).toBe(true);
    });

    it('removeOccurrence("all") removes the entire series', () => {
      const store = dailySeries();
      const instances = occurrencesBetween(store);
      expect(store.removeOccurrence(instances[2], 'all')).toBe(true);
      expect(occurrencesBetween(store)).toHaveLength(0);
    });

    it('editing the same occurrence again after it became a standalone exception just updates it directly', () => {
      const store = dailySeries();
      const third = occurrencesBetween(store)[2];
      const exception = store.updateOccurrence(third, { title: 'First edit' }, 'this');

      const reEdited = store.updateOccurrence(exception, { title: 'Second edit' }, 'this');
      expect(reEdited.title).toBe('Second edit');
      expect(reEdited.id).toBe(exception.id); // same standalone event, not a new one

      const after = occurrencesBetween(store);
      expect(after.filter((e) => e.title === 'Second edit')).toHaveLength(1);
    });
  });

  describe('timezone-aware recurrence (opts.timezone / event.timezone)', () => {
    it('a daily recurrence keeps the same wall-clock hour in its zone across a DST transition, when `timezone` is set', () => {
      // 09:00 America/New_York on 2026-03-07 (EST, UTC-5) — the US DST switch is 2026-03-08.
      const start = new Date(Date.UTC(2026, 2, 7, 14, 0, 0));
      const store = createCalendarStore({
        timezone: 'America/New_York',
        events: [{
          id: 'standup', title: 'Standup', start, end: new Date(start.getTime() + 15 * 60000),
          recurrence: { freq: 'daily', count: 3 },
        }],
      });
      const instances = store.between(new Date(2026, 2, 1), new Date(2026, 2, 15));
      expect(instances).toHaveLength(3);
      // Without zone-awareness, "every day" would add a flat 24h each time, drifting the UTC hour
      // by one once DST kicks in on the 8th — these should all still read 09:00 in New York.
      const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false });
      instances.forEach((i) => expect(formatter.format(i.start)).toMatch(/09|9/));
    });

    it('per-event `timezone` overrides the store-level default for that event\'s own cadence', () => {
      const storeZone = 'Asia/Jakarta'; // UTC+7, no DST
      const eventZone = 'America/New_York'; // UTC-5 in March (no DST yet)
      const start = new Date(Date.UTC(2026, 2, 2, 14, 0, 0)); // 09:00 America/New_York
      const store = createCalendarStore({
        timezone: storeZone,
        events: [{
          id: 'standup', title: 'Standup', timezone: eventZone,
          start, end: new Date(start.getTime() + 15 * 60000),
          recurrence: { freq: 'daily', count: 2 },
        }],
      });
      const instances = store.between(new Date(2026, 2, 1), new Date(2026, 2, 10));
      expect(instances).toHaveLength(2);
      const formatter = new Intl.DateTimeFormat('en-US', { timeZone: eventZone, hour: '2-digit', hour12: false });
      instances.forEach((i) => expect(formatter.format(i.start)).toMatch(/09|9/));
    });

    it('with no `timezone` set anywhere, recurrence expands exactly as before (the machine\'s own local time)', () => {
      const start = new Date(2026, 2, 7, 9, 0);
      const store = createCalendarStore({
        events: [{
          id: 'standup', title: 'Standup', start, end: new Date(start.getTime() + 15 * 60000),
          recurrence: { freq: 'daily', count: 3 },
        }],
      });
      const instances = store.between(new Date(2026, 2, 1), new Date(2026, 2, 15));
      expect(instances).toHaveLength(3);
      instances.forEach((i) => expect(i.start.getHours()).toBe(9));
    });
  });
});
