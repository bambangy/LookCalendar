// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
import { describe, it, expect } from 'vitest';
import { exportICS, importICS } from '../src/js/core/ics.js';

describe('exportICS', () => {
  it('serializes a basic timed event as a UTC DATE-TIME', () => {
    const ics = exportICS([{
      id: 'e1', title: 'Kickoff', start: new Date(Date.UTC(2026, 0, 15, 9, 0, 0)), end: new Date(Date.UTC(2026, 0, 15, 10, 0, 0)),
    }]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:e1@lookcalendar');
    expect(ics).toContain('SUMMARY:Kickoff');
    expect(ics).toContain('DTSTART:20260115T090000Z');
    expect(ics).toContain('DTEND:20260115T100000Z');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('serializes an all-day event with VALUE=DATE, no time component', () => {
    const ics = exportICS([{
      id: 'e2', title: 'Offsite', allDay: true, start: new Date(2026, 0, 12), end: new Date(2026, 0, 14),
    }]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260112');
    expect(ics).toContain('DTEND;VALUE=DATE:20260114');
  });

  it('serializes a zoned event as a local wall-clock time with a TZID parameter', () => {
    // 09:00 America/New_York on 2026-01-15 (EST, UTC-5) is 14:00 UTC.
    const start = new Date(Date.UTC(2026, 0, 15, 14, 0, 0));
    const ics = exportICS([{
      id: 'e3', title: 'Standup', timezone: 'America/New_York', start, end: new Date(start.getTime() + 15 * 60000),
    }]);
    expect(ics).toContain('DTSTART;TZID=America/New_York:20260115T090000');
    expect(ics).toContain('DTEND;TZID=America/New_York:20260115T091500');
  });

  it('escapes commas, semicolons, backslashes and newlines in text fields', () => {
    const ics = exportICS([{
      id: 'e4', title: 'A, B; C\\D', description: 'line one\nline two', start: new Date(2026, 0, 1), end: new Date(2026, 0, 1, 1),
    }]);
    expect(ics).toContain('SUMMARY:A\\, B\\; C\\\\D');
    expect(ics).toContain('DESCRIPTION:line one\\nline two');
  });

  it('serializes a daily/weekly/monthly recurrence rule as RRULE, with EXDATE lines', () => {
    const daily = exportICS([{
      id: 'd', title: 'Daily', start: new Date(2026, 0, 1, 9), end: new Date(2026, 0, 1, 10),
      recurrence: { freq: 'daily', interval: 2, count: 5 },
    }]);
    expect(daily).toContain('RRULE:FREQ=DAILY;INTERVAL=2;COUNT=5');

    const weekly = exportICS([{
      id: 'w', title: 'Weekly', start: new Date(2026, 0, 1, 9), end: new Date(2026, 0, 1, 10),
      recurrence: { freq: 'weekly', byWeekday: [1, 3, 5], exdates: ['2026-01-07'] },
    }]);
    expect(weekly).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(weekly).toContain('EXDATE:20260107T000000Z');

    const monthly = exportICS([{
      id: 'm', title: 'Monthly', start: new Date(2026, 0, 1, 9), end: new Date(2026, 0, 1, 10),
      recurrence: { freq: 'monthly', until: new Date(Date.UTC(2026, 11, 31)) },
    }]);
    expect(monthly).toContain('RRULE:FREQ=MONTHLY;UNTIL=20261231T000000Z');
  });

  it('a recurrence frequency outside the small model (e.g. none set) produces no RRULE line', () => {
    const ics = exportICS([{ id: 'x', title: 'Once', start: new Date(2026, 0, 1), end: new Date(2026, 0, 1, 1) }]);
    expect(ics).not.toContain('RRULE');
  });

  it('folds lines longer than 75 octets per RFC 5545', () => {
    const ics = exportICS([{
      id: 'long', title: 'A'.repeat(120), start: new Date(2026, 0, 1), end: new Date(2026, 0, 1, 1),
    }]);
    const rawLines = ics.split('\r\n');
    expect(rawLines.some((l) => l.startsWith(' '))).toBe(true); // a folded continuation line
    expect(rawLines.every((l) => l.length <= 75 || l.startsWith(' '))).toBe(true);
  });
});

describe('importICS', () => {
  it('parses a minimal VEVENT (UTC DATE-TIME)', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN',
      'BEGIN:VEVENT',
      'UID:abc123@example.com',
      'DTSTART:20260115T090000Z',
      'DTEND:20260115T100000Z',
      'SUMMARY:Kickoff',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const events = importICS(ics);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('abc123@example.com');
    expect(events[0].title).toBe('Kickoff');
    expect(events[0].start.getTime()).toBe(Date.UTC(2026, 0, 15, 9, 0, 0));
    expect(events[0].end.getTime()).toBe(Date.UTC(2026, 0, 15, 10, 0, 0));
    expect(events[0].allDay).toBe(false);
  });

  it('parses an all-day VEVENT (VALUE=DATE)', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20260112',
      'DTEND;VALUE=DATE:20260114',
      'SUMMARY:Offsite',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const [event] = importICS(ics);
    expect(event.allDay).toBe(true);
    expect(event.start).toEqual(new Date(2026, 0, 12));
  });

  it('parses a TZID local DATE-TIME into the correct instant, tagging event.timezone', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART;TZID=America/New_York:20260115T090000',
      'DTEND;TZID=America/New_York:20260115T093000',
      'SUMMARY:Standup',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const [event] = importICS(ics);
    expect(event.timezone).toBe('America/New_York');
    expect(event.start.getTime()).toBe(Date.UTC(2026, 0, 15, 14, 0, 0)); // EST, UTC-5
  });

  it('unescapes commas, semicolons, backslashes and newlines, and unfolds continuation lines', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART:20260101T090000Z',
      'DTEND:20260101T100000Z',
      'SUMMARY:A\\, B\\; C\\\\D',
      'DESCRIPTION:line one\\nline two continues\r\n  on a folded line',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const [event] = importICS(ics);
    expect(event.title).toBe('A, B; C\\D');
    expect(event.description).toBe('line one\nline two continues on a folded line');
  });

  it('parses RRULE (daily/weekly/monthly) and EXDATE into the small recurrence model', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART:20260101T090000Z',
      'DTEND:20260101T100000Z',
      'SUMMARY:Standup',
      'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR;COUNT=10',
      'EXDATE:20260107T000000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const [event] = importICS(ics);
    expect(event.recurrence).toMatchObject({ freq: 'weekly', interval: 1, count: 10, byWeekday: [1, 3, 5] });
    expect(event.recurrence.exdates).toHaveLength(1);
  });

  it('drops recurrence (but keeps the event) when RRULE uses a FREQ outside the small model', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART:20260101T090000Z',
      'DTEND:20260101T100000Z',
      'SUMMARY:Anniversary',
      'RRULE:FREQ=YEARLY',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const [event] = importICS(ics);
    expect(event.title).toBe('Anniversary');
    expect(event.recurrence).toBeUndefined();
  });

  it('ignores unrecognized properties (ORGANIZER, ATTENDEE, STATUS, …) instead of choking on a real export', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
      'BEGIN:VEVENT',
      'DTSTART:20260115T090000Z',
      'DTEND:20260115T100000Z',
      'DTSTAMP:20260101T000000Z',
      'UID:abc123@google.com',
      'ORGANIZER;CN=Jane Doe:mailto:jane@example.com',
      'ATTENDEE;CN=John Smith;PARTSTAT=ACCEPTED:mailto:john@example.com',
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'TRANSP:OPAQUE',
      'SUMMARY:Kickoff',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const events = importICS(ics);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Kickoff');
    expect(events[0].id).toBe('abc123@google.com');
  });

  it('parses multiple VEVENTs from one VCALENDAR', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT', 'DTSTART:20260101T090000Z', 'DTEND:20260101T100000Z', 'SUMMARY:One', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART:20260102T090000Z', 'DTEND:20260102T100000Z', 'SUMMARY:Two', 'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(importICS(ics).map((e) => e.title)).toEqual(['One', 'Two']);
  });
});

describe('exportICS / importICS round trip', () => {
  it('preserves title, allDay, start/end and a simple recurrence rule through export -> import', () => {
    const original = [
      {
        id: 'e1', title: 'Daily standup', start: new Date(2026, 0, 5, 9, 0), end: new Date(2026, 0, 5, 9, 15),
        recurrence: { freq: 'daily', interval: 1, count: 10 },
      },
      { id: 'e2', title: 'Offsite', allDay: true, start: new Date(2026, 1, 10), end: new Date(2026, 1, 12) },
    ];
    const reimported = importICS(exportICS(original));
    expect(reimported).toHaveLength(2);
    expect(reimported[0].title).toBe('Daily standup');
    expect(reimported[0].start.getTime()).toBe(original[0].start.getTime());
    // interval: 1 is the implicit RRULE default, so the exporter omits it for cleanliness and
    // it doesn't round-trip as an explicit key — semantically equivalent either way.
    expect(reimported[0].recurrence).toMatchObject({ freq: 'daily', count: 10 });
    expect(reimported[0].recurrence.interval ?? 1).toBe(1);
    expect(reimported[1].title).toBe('Offsite');
    expect(reimported[1].allDay).toBe(true);
  });

  it('preserves a zoned event\'s displayed wall-clock time and zone through export -> import', () => {
    const start = new Date(Date.UTC(2026, 0, 15, 14, 0, 0)); // 09:00 America/New_York
    const original = [{
      id: 'e1', title: 'Standup', timezone: 'America/New_York', start, end: new Date(start.getTime() + 30 * 60000),
    }];
    const [reimported] = importICS(exportICS(original));
    expect(reimported.timezone).toBe('America/New_York');
    expect(reimported.start.getTime()).toBe(start.getTime());
  });
});
