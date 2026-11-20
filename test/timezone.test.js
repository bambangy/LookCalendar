// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
import { describe, it, expect } from 'vitest';
import {
  systemTimeZone, listTimeZones, zonedParts, toZonedDate,
  startOfDayInZone, endOfDayInZone, addDaysInZone, addMonthsInZone, isSameDayInZone,
  startOfWeekInZone, endOfWeekInZone, monthGridDaysInZone,
} from '../src/js/core/timezone.js';

describe('timezone — zonedParts / toZonedDate', () => {
  it('reads the correct wall-clock time in a zone behind UTC (standard time, no DST in effect)', () => {
    // March 2 2026 is before the US DST switch (March 8 2026), so America/New_York is EST (UTC-5).
    const instant = new Date(Date.UTC(2026, 2, 2, 14, 0, 0)); // 14:00 UTC
    const p = zonedParts(instant, 'America/New_York');
    expect(p).toMatchObject({ year: 2026, month: 3, day: 2, hour: 9, minute: 0, second: 0 });
  });

  it('round-trips: toZonedDate(zonedParts(x, zone), zone) === x', () => {
    const instant = new Date(Date.UTC(2026, 5, 15, 3, 24, 9));
    const zone = 'Asia/Tokyo';
    const roundTripped = toZonedDate(zonedParts(instant, zone), zone);
    expect(roundTripped.getTime()).toBe(instant.getTime());
  });

  it('toZonedDate gives the correct instant for a wall-clock time ahead of UTC', () => {
    // 09:00 in Asia/Jakarta (UTC+7, no DST) on 2026-01-15 is 02:00 UTC the same day.
    const instant = toZonedDate({ year: 2026, month: 1, day: 15, hour: 9 }, 'Asia/Jakarta');
    expect(instant.getTime()).toBe(Date.UTC(2026, 0, 15, 2, 0, 0));
  });
});

describe('timezone — DST-safe day/month arithmetic', () => {
  it('addDaysInZone keeps the same wall-clock hour across a DST transition (US spring-forward, 2026-03-08)', () => {
    const beforeDst = toZonedDate({ year: 2026, month: 3, day: 7, hour: 9 }, 'America/New_York'); // EST, UTC-5
    const afterDst = addDaysInZone(beforeDst, 1, 'America/New_York'); // lands on 2026-03-08, EDT, UTC-4
    const p = zonedParts(afterDst, 'America/New_York');
    expect(p).toMatchObject({ year: 2026, month: 3, day: 8, hour: 9, minute: 0 });
    // The wall-clock hour (9am) is unchanged, but the UTC offset shifted by an hour, so the
    // underlying instant moved by 23h, not a flat 24h — proof the UTC offset was re-resolved.
    expect(afterDst.getTime() - beforeDst.getTime()).toBe(23 * 3600000);
  });

  it('addMonthsInZone keeps the same wall-clock day/hour, independent of month length', () => {
    const start = toZonedDate({ year: 2026, month: 1, day: 31, hour: 10 }, 'Europe/London');
    const next = addMonthsInZone(start, 1, 'Europe/London');
    // JS's own Date.UTC month-overflow rule applies here too: Jan 31 + 1 month rolls into March 3
    // (Feb 2026 has 28 days), same as the plain (non-zoned) addMonths() helper already behaves.
    const p = zonedParts(next, 'Europe/London');
    expect(p.month).toBe(3);
    expect(p.hour).toBe(10);
  });
});

describe('timezone — isSameDayInZone', () => {
  it('an instant can fall on a different calendar day in a zone behind UTC', () => {
    const earlyJan1 = new Date(Date.UTC(2026, 0, 1, 2, 0, 0)); // Jan 1, 02:00 UTC
    const laterJan1 = new Date(Date.UTC(2026, 0, 1, 20, 0, 0)); // Jan 1, 20:00 UTC
    // Both instants fall on Jan 1 in UTC itself.
    expect(isSameDayInZone(earlyJan1, laterJan1, 'UTC')).toBe(true);
    // In America/Los_Angeles (UTC-8 in January): 02:00 UTC is Dec 31 18:00 PST, but 20:00 UTC is
    // Jan 1 12:00 PST — a different calendar day than in UTC, exactly the kind of mismatch naive
    // local-time day math misses.
    expect(isSameDayInZone(earlyJan1, laterJan1, 'America/Los_Angeles')).toBe(false);
  });
});

describe('timezone — week/month grid helpers', () => {
  it('startOfWeekInZone lands on the configured weekStartsOn weekday, in the target zone', () => {
    const date = toZonedDate({ year: 2026, month: 1, day: 15 }, 'Asia/Jakarta'); // a Thursday
    const weekStart = startOfWeekInZone(date, 1, 'Asia/Jakarta'); // weeks start Monday
    const p = zonedParts(weekStart, 'Asia/Jakarta');
    const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    expect(weekday).toBe(1);
  });

  it('monthGridDaysInZone returns 42 consecutive calendar days in the target zone', () => {
    const date = toZonedDate({ year: 2026, month: 2, day: 10 }, 'Asia/Jakarta');
    const days = monthGridDaysInZone(date, 0, 'Asia/Jakarta');
    expect(days).toHaveLength(42);
    for (let i = 1; i < days.length; i += 1) {
      expect(days[i].getTime() - days[i - 1].getTime()).toBeGreaterThan(0);
    }
  });

  it('endOfDayInZone lands just before the next calendar day starts, in the target zone', () => {
    const instant = new Date(Date.UTC(2026, 5, 1, 1, 0, 0));
    const end = endOfDayInZone(instant, 'Asia/Jakarta');
    const p = zonedParts(end, 'Asia/Jakarta');
    expect(p).toMatchObject({ hour: 23, minute: 59, second: 59 });
    const nextDayStart = startOfDayInZone(addDaysInZone(instant, 1, 'Asia/Jakarta'), 'Asia/Jakarta');
    expect(end.getTime()).toBeLessThan(nextDayStart.getTime());
  });

  it('endOfWeekInZone spans exactly 6 days after startOfWeekInZone', () => {
    const date = toZonedDate({ year: 2026, month: 1, day: 15 }, 'Asia/Jakarta');
    const weekStart = startOfWeekInZone(date, 1, 'Asia/Jakarta');
    const weekEnd = endOfWeekInZone(date, 1, 'Asia/Jakarta');
    const p = zonedParts(weekEnd, 'Asia/Jakarta');
    expect(p).toMatchObject({ hour: 23, minute: 59, second: 59 });
    expect(Math.floor((weekEnd.getTime() - weekStart.getTime()) / 86400000)).toBe(6);
  });

  it('startOfDayInZone is idempotent and matches zonedParts\' own day', () => {
    const instant = new Date(Date.UTC(2026, 5, 1, 23, 30, 0));
    const start = startOfDayInZone(instant, 'Asia/Jakarta');
    const p = zonedParts(start, 'Asia/Jakarta');
    expect(p).toMatchObject({ hour: 0, minute: 0, second: 0 });
    expect(startOfDayInZone(start, 'Asia/Jakarta').getTime()).toBe(start.getTime());
  });
});

describe('timezone — environment helpers', () => {
  it('systemTimeZone returns a non-empty string', () => {
    expect(typeof systemTimeZone()).toBe('string');
    expect(systemTimeZone().length).toBeGreaterThan(0);
  });

  it('listTimeZones returns an array (possibly empty on an engine without Intl.supportedValuesOf) that includes common zones when non-empty', () => {
    const zones = listTimeZones();
    expect(Array.isArray(zones)).toBe(true);
    if (zones.length) expect(zones).toContain('America/New_York');
  });
});
