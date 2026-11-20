// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// Month view — a standalone renderer usable without lkCalendar(): hand it a container and a
// calendarStore and it renders/updates itself; the orchestrator only wires it to a toolbar
// and the built-in event form.

import { lkI18n } from '@lookui/core';
import {
  monthGridDays, startOfDay, isSameDay, weekdayLabels,
} from '../core/dateMath.js';
import {
  monthGridDaysInZone, startOfDayInZone, isSameDayInZone, zonedParts,
} from '../core/timezone.js';
import { packLanes, laneCount } from '../core/layout.js';
import { bindText } from '../core/i18nText.js';
import { compileDayMarks } from '../core/dayMarks.js';
import { createDragCreate } from '../composables/dragCreate.js';
import { createDragMove } from '../composables/dragMove.js';
import { appendChipContent } from './chipContent.js';

lkI18n.define('calendar', { more: '+{count} more', monthGrid: 'Calendar' });

const MAX_LANES = 3;

/**
 * @param {Element} container
 * @param {Object} [opts]
 * @param {string} [opts.locale]
 * @param {string} [opts.timezone] — an IANA zone (e.g. 'America/New_York') "today", the visible
 *   month's day grid, and displayed times are computed in; omit to use the viewer's own machine
 *   zone (unchanged pre-timezone-support behavior) — see core/timezone.js
 * @param {number} [opts.weekStartsOn=0]
 * @param {boolean} [opts.hideWeekends=false] — don't render Saturday/Sunday columns
 * @param {number} [opts.maxEventsPerDay=3]
 * @param {'continuous'|'block'} [opts.multiDayStyle='continuous'] — a multi-day event as one
 *   seamless bar across its days, or as a separate chip per day
 * @param {Array|Function} [opts.markedDays] — color specific days independent of any event
 *   (weekends, public holidays, blackout dates) — see core/dayMarks.js for the rule shapes
 * @param {Function} [opts.eventIcon] — (event) => icon spec, for events with no `event.icon` of
 *   their own — see core/eventIcon.js for the icon spec shapes
 * @param {Object} [opts.text]
 * @param {Function} [opts.onSelect] — ({ start, end, allDay:true })
 * @param {Function} [opts.onEventClick] — (event, domEvent)
 * @param {Function} [opts.onEventMove] — (event, { start, end })
 * @param {Function} [opts.onShowMore] — (date, events)
 * @returns {{ render: Function, destroy: Function }}
 */
export function createMonthView(container, opts = {}) {
  const weekStartsOn = opts.weekStartsOn ?? 0;
  const maxLanes = opts.maxEventsPerDay || MAX_LANES;
  const continuous = opts.multiDayStyle !== 'block';
  const tx = bindText('calendar', opts.text);
  let dayMarks = compileDayMarks(opts.markedDays);
  const zone = opts.timezone || null;
  // Zone-aware day math only when a timezone is actually configured — otherwise every one of
  // these is the exact function it always was (the machine's own local time).
  const zMonthGridDays = (d, w) => (zone ? monthGridDaysInZone(d, w, zone) : monthGridDays(d, w));
  const zStartOfDay = (d) => (zone ? startOfDayInZone(d, zone) : startOfDay(d));
  const zIsSameDay = (a, b) => (zone ? isSameDayInZone(a, b, zone) : isSameDay(a, b));
  const zMonthOf = (d) => (zone ? zonedParts(d, zone).month - 1 : d.getMonth());
  const zDateOf = (d) => (zone ? zonedParts(d, zone).day : d.getDate());
  const dtfOpts = (fmtOpts) => (zone ? { ...fmtOpts, timeZone: zone } : fmtOpts);
  function dayDiff(a, b) {
    return Math.round((zStartOfDay(b) - zStartOfDay(a)) / 86400000);
  }

  // Which of the 7 positions in a week row (0 = weekStartsOn's own day) are actually rendered.
  // Fixed per instance: hideWeekends isn't a live-toggle option today.
  const visiblePositions = Array.from({ length: 7 }, (_, p) => p)
    .filter((p) => !opts.hideWeekends || ![0, 6].includes((weekStartsOn + p) % 7));
  const numCols = visiblePositions.length;
  // The right-edge cell of each row can't rely on :nth-child(7n) once the column count varies.
  function markLastColumn(cell, colIdx) {
    cell.classList.toggle('lkc-month__cell--col-last', colIdx === numCols - 1);
  }

  container.classList.add('lkc-month');
  container.style.setProperty('--lkc-month-cols', String(numCols));

  const head = document.createElement('div');
  head.className = 'lkc-month__weekdays';
  container.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'lkc-month__grid';
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', tx.t('monthGrid'));
  container.appendChild(grid);

  let currentDays = [];
  const cellEls = []; // parallel to cellDays — the actual rendered cell elements, in order
  const cellDays = []; // parallel to cellEls — the Date each one represents (hideWeekends-safe)
  const dragHandles = [];
  let activeCellIdx = 0;

  // Roving tabindex (the standard keyboard pattern for a grid of cells): exactly one cell is ever
  // tab-stoppable; arrow keys move which one, so Tab enters/exits the whole grid in one stop
  // instead of stepping through all 42 days.
  function setActiveCell(idx, { focus = false } = {}) {
    if (!cellEls.length) return;
    activeCellIdx = Math.min(Math.max(idx, 0), cellEls.length - 1);
    cellEls.forEach((c, i) => { c.tabIndex = i === activeCellIdx ? 0 : -1; });
    if (focus) cellEls[activeCellIdx].focus();
  }

  function onGridKeydown(e) {
    const cell = e.target.closest('.lkc-month__cell');
    if (!cell) return;
    const idx = cellEls.indexOf(cell);
    if (idx === -1) return;
    const move = {
      ArrowRight: 1, ArrowLeft: -1, ArrowDown: numCols, ArrowUp: -numCols,
      Home: -(idx % numCols), End: numCols - 1 - (idx % numCols),
    }[e.key];
    if (move != null) {
      e.preventDefault();
      setActiveCell(idx + move, { focus: true });
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      opts.onSelect?.({ start: cellDays[idx], end: cellDays[idx], allDay: true });
    }
  }
  grid.addEventListener('keydown', onGridKeydown);
  grid.addEventListener('focusin', (e) => {
    const cell = e.target.closest('.lkc-month__cell');
    if (!cell) return;
    const idx = cellEls.indexOf(cell);
    if (idx !== -1) activeCellIdx = idx;
  });

  function cellAt(point) {
    const el = document.elementFromPoint(point.x, point.y);
    const cell = el?.closest('.lkc-month__cell');
    if (!cell) return null;
    const idx = cellEls.indexOf(cell);
    return idx === -1 ? null : idx;
  }

  const selection = createDragCreate({
    container: grid,
    cellAt,
    isHandle: (t) => !t.closest('.lkc-event') && !t.closest('.lkc-month__more'),
    onStart(idx) {
      cellEls.forEach((c) => c.classList.remove('lkc-month__cell--selected'));
    },
    onChange(startIdx, idx) {
      const [a, b] = startIdx <= idx ? [startIdx, idx] : [idx, startIdx];
      cellEls.forEach((c, i) => c.classList.toggle('lkc-month__cell--selected', i >= a && i <= b));
    },
    onEnd(startIdx, idx) {
      cellEls.forEach((c) => c.classList.remove('lkc-month__cell--selected'));
      const [a, b] = startIdx <= idx ? [startIdx, idx] : [idx, startIdx];
      opts.onSelect?.({ start: cellDays[a], end: cellDays[b], allDay: true });
    },
  });

  function renderWeekdayHeader() {
    head.textContent = '';
    const labels = weekdayLabels(opts.locale, weekStartsOn);
    visiblePositions.forEach((p) => {
      const cell = document.createElement('div');
      cell.className = 'lkc-month__weekday';
      cell.setAttribute('role', 'columnheader');
      cell.textContent = labels[p];
      head.appendChild(cell);
    });
  }

  function buildChip(span, dayIdx, events) {
    const chip = document.createElement('div');
    chip.className = 'lkc-event';
    chip.dataset.id = span.event.recurrenceId || span.event.id;
    if (span.event.color) chip.style.setProperty('--lkc-event-color', span.event.color);

    const isContinuousSpan = continuous && span.startIdx !== span.endIdx;
    if (isContinuousSpan) {
      // A continuous bar is one event, not one per day: a single chip (planted on the start day,
      // see render()'s loop — the other days it crosses get an invisible spacer, not a chip of
      // their own) stretched with an explicit width to visually cover every column it spans, so
      // the time/title render once and the bar reads as one shape instead of per-day pieces
      // separated by each cell's own border. z-index lifts it above those cells' borders/backgrounds,
      // which would otherwise paint over the part of the bar that overflows past its own column
      // (later siblings always paint over an earlier sibling's overflowing content).
      chip.classList.add('lkc-event--continuous', 'lkc-event--start', 'lkc-event--end');
      const count = span.endIdx - span.startIdx + 1;
      chip.style.width = `calc(${count} * 100% + ${count - 1} * (2 * var(--lk-space-1) + var(--lk-border-width)) - 2 * var(--lk-space-1))`;
    } else {
      if (dayIdx === span.startIdx) chip.classList.add('lkc-event--start');
      if (dayIdx === span.endIdx) chip.classList.add('lkc-event--end');
    }

    appendChipContent(chip, span.event, { locale: opts.locale, eventIcon: opts.eventIcon, timezone: span.event.timezone || zone });

    chip.tabIndex = 0;
    chip.setAttribute('role', 'button');
    chip.setAttribute('aria-label', chip.textContent);

    function open(e) {
      if (chip.dataset.dragged === '1') { delete chip.dataset.dragged; return; }
      opts.onEventClick?.(span.event, e);
    }
    chip.addEventListener('click', open);
    chip.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      open(e);
    });

    if (span.event.editable !== false) {
      const handle = createDragMove({
        el: chip,
        onStart() { chip.classList.add('lkc-event--dragging'); },
        onMove(dx) {
          const cellWidth = cellEls[0]?.getBoundingClientRect().width || 1;
          const deltaDays = Math.round(dx / cellWidth);
          chip.style.transform = `translateX(${deltaDays * cellWidth}px)`;
        },
        onDrop(moved, dx) {
          chip.classList.remove('lkc-event--dragging');
          chip.style.transform = '';
          if (!moved) return;
          chip.dataset.dragged = '1';
          const cellWidth = cellEls[0]?.getBoundingClientRect().width || 1;
          const deltaDays = Math.round(dx / cellWidth);
          if (!deltaDays) { delete chip.dataset.dragged; return; }
          const duration = span.event.end.getTime() - span.event.start.getTime();
          const nextStart = new Date(span.event.start.getTime() + deltaDays * 86400000);
          const nextEnd = new Date(nextStart.getTime() + duration);
          opts.onEventMove?.(span.event, { start: nextStart, end: nextEnd });
        },
      });
      dragHandles.push(handle);
    }

    return chip;
  }

  function render(date, instances, calendars = []) {
    currentDays = zMonthGridDays(date, weekStartsOn);
    renderWeekdayHeader();
    grid.textContent = '';
    cellEls.length = 0;
    cellDays.length = 0;
    dragHandles.splice(0).forEach((h) => h.destroy());

    const today = zStartOfDay(new Date());
    const calendarColor = new Map(calendars.map((c) => [c.id, c.color]));

    // Clamp a 0-6 week position that may fall on a hidden day to the nearest visible column:
    // forward for a span's start, backward for its end — so a Fri-Mon event in a hidden-weekend
    // view still shows (clipped to Fri/Mon) instead of vanishing.
    function visibleColFor(pos, roundUp) {
      if (roundUp) {
        const hit = visiblePositions.find((p) => p >= pos);
        return hit == null ? visiblePositions.length - 1 : visiblePositions.indexOf(hit);
      }
      const hit = [...visiblePositions].reverse().find((p) => p <= pos);
      return hit == null ? 0 : visiblePositions.indexOf(hit);
    }

    for (let week = 0; week < 6; week += 1) {
      const weekDays = currentDays.slice(week * 7, week * 7 + 7);
      const weekStart = weekDays[0];
      const weekEnd = weekDays[6];
      const visibleWeekDays = visiblePositions.map((p) => weekDays[p]);

      const weekCells = visibleWeekDays.map((day, colIdx) => {
        const cell = document.createElement('div');
        cell.className = 'lkc-month__cell';
        cell.setAttribute('role', 'gridcell');
        cell.tabIndex = -1;
        if (zMonthOf(day) !== zMonthOf(date)) cell.classList.add('lkc-month__cell--muted');
        if (zIsSameDay(day, today)) cell.classList.add('lkc-month__cell--today');
        markLastColumn(cell, colIdx);

        const mark = dayMarks?.(day);
        if (mark) {
          cell.classList.add('lkc-month__cell--marked');
          cell.style.setProperty('--lkc-mark-color', mark.color);
          if (mark.label) cell.title = mark.label;
        }

        const dateLabel = document.createElement('div');
        dateLabel.className = 'lkc-month__date';
        dateLabel.textContent = String(zDateOf(day));
        cell.appendChild(dateLabel);
        cell.setAttribute('aria-label', new Intl.DateTimeFormat(opts.locale, dtfOpts({
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        })).format(day));

        const body = document.createElement('div');
        body.className = 'lkc-month__events';
        cell.appendChild(body);

        grid.appendChild(cell);
        cellEls.push(cell);
        cellDays.push(day);
        return { cell, body, day };
      });

      const weekInstances = instances.filter((e) => e.start < new Date(weekEnd.getTime() + 86400000) && e.end > weekStart);
      const spans = weekInstances
        .map((event) => {
          const rawStart = Math.max(0, dayDiff(weekStart, event.start));
          const rawEnd = Math.min(6, dayDiff(weekStart, new Date(event.end.getTime() - 1)));
          return {
            event,
            rawStart,
            rawEnd,
            startIdx: visibleColFor(rawStart, true),
            endIdx: visibleColFor(rawEnd, false),
          };
        })
        // Confined entirely to hidden day(s) (e.g. a weekend-only event when hideWeekends is on).
        .filter((s) => visiblePositions.some((p) => p >= s.rawStart && p <= s.rawEnd));
      const packed = packLanes(spans);

      for (let lane = 0; lane < Math.min(laneCount(packed), maxLanes); lane += 1) {
        const span = packed.find((s) => s.lane === lane);
        if (!span) continue;
        for (let d = 0; d <= numCols - 1; d += 1) {
          const hit = packed.find((s) => s.lane === lane && d >= s.startIdx && d <= s.endIdx);
          // A continuous multi-day span only gets one real chip, on its start day — every other
          // day it crosses just reserves the slot (an invisible spacer) so lane-stacking/row-height
          // stays correct, while the one real chip visually spans across them (see buildChip()).
          const isSpanContinuation = hit && continuous && hit.startIdx !== hit.endIdx && d !== hit.startIdx;
          if (hit && !isSpanContinuation) {
            weekCells[d].body.appendChild(buildChip(hit, d, weekInstances));
          } else if (hit || packed.some((s) => s.lane === lane)) {
            const spacer = document.createElement('div');
            spacer.className = 'lkc-event lkc-event--spacer';
            weekCells[d].body.appendChild(spacer);
          }
        }
      }

      for (let d = 0; d <= numCols - 1; d += 1) {
        const hiddenCount = packed.filter((s) => s.lane >= maxLanes && d >= s.startIdx && d <= s.endIdx).length;
        if (hiddenCount > 0) {
          const more = document.createElement('button');
          more.type = 'button';
          more.className = 'lkc-month__more';
          more.textContent = tx.t('more', { count: hiddenCount });
          more.addEventListener('click', (e) => {
            e.stopPropagation();
            const dayEvents = instances.filter((ev) => ev.start < new Date(weekCells[d].day.getTime() + 86400000) && ev.end > weekCells[d].day);
            opts.onShowMore?.(weekCells[d].day, dayEvents, more);
          });
          weekCells[d].body.appendChild(more);
        }
      }
    }

    const todayIdx = cellDays.findIndex((d) => zIsSameDay(d, today));
    setActiveCell(todayIdx !== -1 ? todayIdx : activeCellIdx);
  }

  function setMarkedDays(rules) {
    dayMarks = compileDayMarks(rules);
  }

  function destroy() {
    selection.destroy();
    dragHandles.forEach((h) => h.destroy());
    tx.destroy();
    container.textContent = '';
    container.classList.remove('lkc-month');
  }

  return {
    render, destroy, setMarkedDays,
  };
}
