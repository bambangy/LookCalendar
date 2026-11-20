// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
import { describe, it, expect } from 'vitest';
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, monthGridDays, addDays, isSameDay, toDate,
} from '../src/js/core/dateMath.js';

describe('dateMath', () => {
  it('startOfWeek / endOfWeek respect weekStartsOn', () => {
    const wed = new Date(2026, 2, 11); // Wed 11 Mar 2026
    expect(startOfWeek(wed, 0).getDay()).toBe(0);
    expect(startOfWeek(wed, 1).getDay()).toBe(1);
    expect(endOfWeek(wed, 1).getDay()).toBe(0);
  });

  it('startOfMonth / endOfMonth bound the month', () => {
    const mid = new Date(2026, 1, 14); // Feb 2026
    expect(startOfMonth(mid).getDate()).toBe(1);
    expect(endOfMonth(mid).getMonth()).toBe(1);
    expect(endOfMonth(mid).getDate()).toBe(28);
  });

  it('monthGridDays always returns a 42-day grid aligned to weekStartsOn', () => {
    const days = monthGridDays(new Date(2026, 1, 1), 1);
    expect(days).toHaveLength(42);
    expect(days[0].getDay()).toBe(1);
    expect(isSameDay(days[41], addDays(days[0], 41))).toBe(true);
  });

  it('toDate parses ISO date strings without timezone drift', () => {
    const d = toDate('2026-03-11');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(11);
  });

  it('toDate falls back when given garbage', () => {
    expect(toDate('not a date', null)).toBeNull();
  });
});
