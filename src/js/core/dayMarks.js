// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// Mark specific days with a color — weekends, public holidays, blackout dates — independent of
// any event. Mirrors the day-rule shape LookUI's own lkDate uses for holidays/disabledDates
// (specific day / yearly day / range / function), extended with per-rule `color` and a `weekday`
// rule (e.g. weekends), since here a match drives a background tint rather than one fixed style.
//
// Rule shapes (mix freely in one array):
//   'YYYY-MM-DD'                                    — one specific day
//   'MM-DD'                                         — every year on this month/day (e.g. a national holiday)
//   { date: 'YYYY-MM-DD', color, label? }
//   { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', color, label? }   — inclusive range
//   { weekday: number[], color, label? }            — 0 (Sun) … 6 (Sat), every week (e.g. weekends)
//   (date: Date) => string | { color, label? } | false        — a function, used as the matcher itself

import { toDate, startOfDay, toIsoDate } from './dateMath.js';

const DEFAULT_COLOR = '#ef9a9a';

function normalizeColor(rule) {
  return rule?.color || DEFAULT_COLOR;
}

/**
 * @param {Array|Object|Function} input
 * @returns {null|((date: Date) => { color: string, label: string|null } | false)} null when there are no rules at all
 */
export function compileDayMarks(input) {
  if (typeof input === 'function') {
    return (date) => {
      const result = input(date);
      if (!result) return false;
      return typeof result === 'string'
        ? { color: result, label: null }
        : { color: result.color || DEFAULT_COLOR, label: result.label ?? null };
    };
  }

  const list = Array.isArray(input) ? input : (input == null ? [] : [input]);
  if (!list.length) return null;

  const days = new Map(); // 'yyyy-mm-dd' -> { color, label }
  const yearly = new Map(); // 'mm-dd' -> { color, label }
  const weekdays = new Map(); // 0-6 -> { color, label }
  const spans = []; // { a, b, color, label }

  list.forEach((item) => {
    if (item && typeof item === 'object' && Array.isArray(item.weekday)) {
      const entry = { color: normalizeColor(item), label: item.label ?? null };
      item.weekday.forEach((w) => weekdays.set(Number(w), entry));
      return;
    }
    if (item && typeof item === 'object' && !(item instanceof Date) && (item.from != null || item.to != null)) {
      const a = toDate(item.from);
      const b = toDate(item.to);
      spans.push({
        a: a ? startOfDay(a).getTime() : -Infinity,
        b: b ? startOfDay(b).getTime() : Infinity,
        color: normalizeColor(item),
        label: item.label ?? null,
      });
      return;
    }

    let value = item;
    let color = DEFAULT_COLOR;
    let label = null;
    if (item && typeof item === 'object' && !(item instanceof Date)) {
      value = item.date;
      color = normalizeColor(item);
      label = item.label ?? null;
    }

    if (typeof value === 'string' && /^\d{2}-\d{2}$/.test(value.trim())) {
      yearly.set(value.trim(), { color, label });
      return;
    }

    const d = toDate(value);
    if (d) days.set(toIsoDate(d), { color, label });
  });

  if (!days.size && !yearly.size && !weekdays.size && !spans.length) return null;

  return (date) => {
    const key = toIsoDate(date);
    if (days.has(key)) return days.get(key);
    const md = key.slice(5);
    if (yearly.has(md)) return yearly.get(md);
    if (weekdays.has(date.getDay())) return weekdays.get(date.getDay());
    const t = startOfDay(date).getTime();
    const span = spans.find((s) => t >= s.a && t <= s.b);
    return span || false;
  };
}
