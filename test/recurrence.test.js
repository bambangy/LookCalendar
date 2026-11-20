// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
import { describe, it, expect } from 'vitest';
import { expandRecurrence } from '../src/js/core/recurrence.js';

const rangeStart = new Date(2026, 0, 1);
const rangeEnd = new Date(2026, 2, 31, 23, 59);

describe('expandRecurrence', () => {
  it('expands a daily rule within range', () => {
    const event = {
      id: 'e1',
      start: new Date(2026, 0, 1, 9, 0),
      end: new Date(2026, 0, 1, 10, 0),
      recurrence: { freq: 'daily', interval: 1, count: 5 },
    };
    const out = expandRecurrence(event, rangeStart, rangeEnd);
    expect(out).toHaveLength(5);
    expect(out[0].start.getDate()).toBe(1);
    expect(out[4].start.getDate()).toBe(5);
    expect(out[0].masterId).toBe('e1');
  });

  it('expands a weekly rule on specific weekdays', () => {
    const event = {
      id: 'e2',
      start: new Date(2026, 0, 5, 14, 0), // Monday
      end: new Date(2026, 0, 5, 15, 0),
      recurrence: { freq: 'weekly', byWeekday: [1, 3], count: 6 },
    };
    const out = expandRecurrence(event, rangeStart, rangeEnd);
    expect(out).toHaveLength(6);
    out.forEach((inst) => expect([1, 3]).toContain(inst.start.getDay()));
  });

  it('respects `until`', () => {
    const event = {
      id: 'e3',
      start: new Date(2026, 0, 1, 9, 0),
      end: new Date(2026, 0, 1, 9, 30),
      recurrence: { freq: 'daily', until: new Date(2026, 0, 3) },
    };
    const out = expandRecurrence(event, rangeStart, rangeEnd);
    expect(out.every((e) => e.start <= new Date(2026, 0, 3, 23, 59))).toBe(true);
    expect(out.length).toBeLessThanOrEqual(4);
  });

  it('skips exdates', () => {
    const event = {
      id: 'e4',
      start: new Date(2026, 0, 1, 9, 0),
      end: new Date(2026, 0, 1, 9, 30),
      recurrence: { freq: 'daily', count: 3, exdates: ['2026-01-02'] },
    };
    const out = expandRecurrence(event, rangeStart, rangeEnd);
    expect(out.some((e) => e.start.getDate() === 2)).toBe(false);
  });

  it('expands monthly on the same day-of-month', () => {
    const event = {
      id: 'e5',
      start: new Date(2026, 0, 15, 9, 0),
      end: new Date(2026, 0, 15, 10, 0),
      recurrence: { freq: 'monthly', count: 3 },
    };
    const out = expandRecurrence(event, rangeStart, rangeEnd);
    expect(out.map((e) => e.start.getMonth())).toEqual([0, 1, 2]);
    expect(out.every((e) => e.start.getDate() === 15)).toBe(true);
  });

  it('returns nothing outside the query range', () => {
    const event = {
      id: 'e6',
      start: new Date(2026, 0, 1, 9, 0),
      end: new Date(2026, 0, 1, 9, 30),
      recurrence: { freq: 'daily', count: 2 },
    };
    const out = expandRecurrence(event, new Date(2027, 0, 1), new Date(2027, 11, 31));
    expect(out).toHaveLength(0);
  });
});
