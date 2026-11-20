// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
import { describe, it, expect } from 'vitest';
import { compileDayMarks } from '../src/js/core/dayMarks.js';

describe('compileDayMarks', () => {
  it('returns null when there are no rules', () => {
    expect(compileDayMarks([])).toBeNull();
    expect(compileDayMarks(null)).toBeNull();
    expect(compileDayMarks(undefined)).toBeNull();
  });

  it('matches a specific day', () => {
    const matcher = compileDayMarks([{ date: '2026-01-01', color: '#ff0000', label: "New Year's" }]);
    expect(matcher(new Date(2026, 0, 1))).toEqual({ color: '#ff0000', label: "New Year's" });
    expect(matcher(new Date(2026, 0, 2))).toBe(false);
  });

  it('matches a plain date string with the default color', () => {
    const matcher = compileDayMarks(['2026-03-17']);
    expect(matcher(new Date(2026, 2, 17)).color).toBeTruthy();
    expect(matcher(new Date(2026, 2, 18))).toBe(false);
  });

  it('matches a yearly (MM-DD) rule across different years', () => {
    const matcher = compileDayMarks([{ date: '08-17', color: '#c62828', label: 'Independence Day' }]);
    expect(matcher(new Date(2026, 7, 17)).label).toBe('Independence Day');
    expect(matcher(new Date(2030, 7, 17)).label).toBe('Independence Day');
    expect(matcher(new Date(2026, 7, 18))).toBe(false);
  });

  it('matches weekends via a weekday rule', () => {
    const matcher = compileDayMarks([{ weekday: [0, 6], color: '#eceff1', label: 'Weekend' }]);
    expect(matcher(new Date(2026, 0, 3)).label).toBe('Weekend'); // Saturday
    expect(matcher(new Date(2026, 0, 4)).label).toBe('Weekend'); // Sunday
    expect(matcher(new Date(2026, 0, 5))).toBe(false); // Monday
  });

  it('matches an inclusive date range', () => {
    const matcher = compileDayMarks([{ from: '2026-12-24', to: '2026-12-26', color: '#8d6e63' }]);
    expect(matcher(new Date(2026, 11, 24))).toBeTruthy();
    expect(matcher(new Date(2026, 11, 25))).toBeTruthy();
    expect(matcher(new Date(2026, 11, 26))).toBeTruthy();
    expect(matcher(new Date(2026, 11, 23))).toBe(false);
    expect(matcher(new Date(2026, 11, 27))).toBe(false);
  });

  it('accepts a function as the matcher itself', () => {
    const matcher = compileDayMarks((date) => (date.getDate() === 15 ? '#5c6bc0' : false));
    expect(matcher(new Date(2026, 0, 15))).toEqual({ color: '#5c6bc0', label: null });
    expect(matcher(new Date(2026, 0, 16))).toBe(false);
  });

  it('mixes rule types in one array', () => {
    const matcher = compileDayMarks([
      { weekday: [0, 6], color: '#eceff1' },
      { date: '08-17', color: '#c62828' },
      '2026-05-01',
    ]);
    expect(matcher(new Date(2026, 0, 3))).toBeTruthy(); // Saturday
    expect(matcher(new Date(2026, 7, 17))).toBeTruthy(); // yearly holiday
    expect(matcher(new Date(2026, 4, 1))).toBeTruthy(); // specific day
    expect(matcher(new Date(2026, 4, 4))).toBe(false); // an ordinary Monday
  });
});
