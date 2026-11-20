// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// IANA-timezone-aware calendar-day math, built entirely on native `Intl` — no date library.
//
// Every event/instance in this library stays a plain JS `Date` (a real instant — UTC underneath,
// whatever its own local clock showed when it was constructed). A `Date` by itself has no opinion
// about *which* timezone's wall clock it should be read back in, and by default this library reads
// it back in whatever machine happens to be running the code — "naive", in the sense that the same
// stored instant renders a different wall-clock time (and can even fall on a different calendar
// day) on two viewers' machines in different zones, and a "daily at 9am" recurrence drifts off its
// intended local time across a DST transition unless 9am is pinned to a specific zone.
//
// `opts.timezone` (an IANA name, e.g. 'America/New_York') on `lkCalendar()`/`createCalendarStore()`/
// each view fixes *which* zone "today", grid-day boundaries, displayed times and recurrence cadence
// are computed in, independent of the viewer's own machine. `event.timezone` overrides it for one
// event's own recurrence cadence (e.g. a weekly meeting that's always 9am in its organizer's city).
// Leaving `timezone` unset keeps every existing behavior exactly as it was — this module is never
// consulted unless a caller opts in.

/** The IANA zone this machine is currently running in, e.g. 'Asia/Jakarta'. */
export function systemTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Every IANA zone name this JS engine recognizes, or `[]` on an engine without `Intl.supportedValuesOf`. */
export function listTimeZones() {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
}

/** The wall-clock date/time `date` (a real instant) reads as when viewed in `timeZone`. */
export function zonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = {};
  formatter.formatToParts(date).forEach(({ type, value }) => { parts[type] = value; });
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0; // some engines report midnight as "24" with hour12: false
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/**
 * The real instant for wall-clock `{ year, month, day, hour?, minute?, second? }` as seen in
 * `timeZone` — the inverse of `zonedParts`. This is the one function you need to correctly
 * construct "9am in America/New_York" regardless of what zone the code constructing it runs in.
 */
export function toZonedDate({
  year, month, day, hour = 0, minute = 0, second = 0,
}, timeZone) {
  const wantUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = wantUtc;
  // The zone's UTC offset at `guess` may not be the offset at the moment we actually want (it can
  // differ right around a DST transition), so re-resolve it against our own improving guess a
  // couple of times rather than assuming one lookup is enough.
  for (let i = 0; i < 2; i += 1) {
    const seen = zonedParts(new Date(guess), timeZone);
    const seenUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
    const diff = wantUtc - seenUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/** The real instant for the start (00:00:00) of the calendar day `date` falls on in `timeZone`. */
export function startOfDayInZone(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return toZonedDate({ year: p.year, month: p.month, day: p.day }, timeZone);
}

/**
 * The real instant for the end (23:59:59, second-precision) of the calendar day `date` falls on
 * in `timeZone` — close enough to the plain `endOfDay()`'s 23:59:59.999 for range-query purposes
 * (compared against event instants with `<`/`<=`, a sub-second gap is immaterial).
 */
export function endOfDayInZone(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return toZonedDate({
    year: p.year, month: p.month, day: p.day, hour: 23, minute: 59, second: 59,
  }, timeZone);
}

/** `date` shifted by `n` *calendar* days as counted in `timeZone` (DST-safe: re-resolves the UTC offset for the new day, instead of just adding `n * 86400000` ms). */
export function addDaysInZone(date, n, timeZone) {
  const p = zonedParts(date, timeZone);
  return toZonedDate({ ...p, day: p.day + n }, timeZone);
}

/** `date` shifted by `n` *calendar* months as counted in `timeZone`. */
export function addMonthsInZone(date, n, timeZone) {
  const p = zonedParts(date, timeZone);
  return toZonedDate({ ...p, month: p.month + n }, timeZone);
}

/** Do `a` and `b` fall on the same calendar day when viewed in `timeZone`? */
export function isSameDayInZone(a, b, timeZone) {
  const pa = zonedParts(a, timeZone);
  const pb = zonedParts(b, timeZone);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

/**
 * The day of the week (0 = Sunday … 6 = Saturday) of the calendar day `date` falls on in
 * `timeZone` — a calendar date's weekday depends only on its (year, month, day) triple, never on
 * a timezone, so this just reads it off a zone-independent `Date.UTC` of that triple.
 */
export function weekdayInZone(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/** Start of the week (in `timeZone`) containing `date` (`weekStartsOn`: 0 = Sunday … 6 = Saturday). */
export function startOfWeekInZone(date, weekStartsOn, timeZone) {
  const dayStart = startOfDayInZone(date, timeZone);
  const shift = (weekdayInZone(dayStart, timeZone) - weekStartsOn + 7) % 7;
  return addDaysInZone(dayStart, -shift, timeZone);
}

/** End of the week (in `timeZone`) containing `date` — see `endOfDayInZone`'s precision note. */
export function endOfWeekInZone(date, weekStartsOn, timeZone) {
  return endOfDayInZone(addDaysInZone(startOfWeekInZone(date, weekStartsOn, timeZone), 6, timeZone), timeZone);
}

/** The 42-day (6-week) grid a month view renders, aligned to `weekStartsOn`, as calendar days in `timeZone`. */
export function monthGridDaysInZone(date, weekStartsOn, timeZone) {
  const p = zonedParts(date, timeZone);
  const first = toZonedDate({ year: p.year, month: p.month, day: 1 }, timeZone);
  const gridStart = startOfWeekInZone(first, weekStartsOn, timeZone);
  const days = [];
  for (let i = 0; i < 42; i += 1) days.push(addDaysInZone(gridStart, i, timeZone));
  return days;
}
