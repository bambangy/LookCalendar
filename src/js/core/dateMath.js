// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// Pure date-math helpers shared by every view. No DOM, no dependency on @lookui/core.

export function toDate(value, fallback = null) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? fallback : new Date(value);
  if (value == null || value === '') return fallback;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? fallback : d;
  }
  if (typeof value === 'string') {
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? fallback : d;
  }
  return fallback;
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

export function isSameDay(a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Start of the week containing `date` (weekStartsOn: 0 = Sunday … 6 = Saturday). */
export function startOfWeek(date, weekStartsOn = 0) {
  const d = startOfDay(date);
  const shift = (d.getDay() - weekStartsOn + 7) % 7;
  return addDays(d, -shift);
}

export function endOfWeek(date, weekStartsOn = 0) {
  return endOfDay(addDays(startOfWeek(date, weekStartsOn), 6));
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date) {
  return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

/** The 42-day (6-week) grid a month view renders, aligned to `weekStartsOn`. */
export function monthGridDays(date, weekStartsOn = 0) {
  const first = startOfMonth(date);
  const gridStart = startOfWeek(first, weekStartsOn);
  const days = [];
  for (let i = 0; i < 42; i += 1) days.push(addDays(gridStart, i));
  return days;
}

export function rangeDays(start, end) {
  const days = [];
  let cur = startOfDay(start);
  const last = startOfDay(end);
  while (cur <= last) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  return days;
}

export function clamp(date, min, max) {
  let d = date;
  if (min && d < min) d = min;
  if (max && d > max) d = max;
  return d;
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

export function minutesBetween(a, b) {
  return (b.getTime() - a.getTime()) / 60000;
}

export function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function weekdayLabels(locale, weekStartsOn = 0, format = 'short') {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: format });
  const base = new Date(2023, 0, 1); // a Sunday
  const labels = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() + ((i + weekStartsOn) % 7));
    labels.push(formatter.format(d));
  }
  return labels;
}

export function formatTime(date, locale, opts = { hour: 'numeric', minute: '2-digit' }, timezone) {
  return new Intl.DateTimeFormat(locale, timezone ? { ...opts, timeZone: timezone } : opts).format(date);
}
