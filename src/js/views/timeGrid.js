// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// Time-grid view — backs both the week view (days: 7) and the day view (days: 1). A standalone
// renderer: give it a container and call render(date, instances, calendars) whenever your data
// or the visible range changes.

import { lkI18n } from '@lookui/core';
import {
  addDays, startOfWeek, startOfDay, isSameDay, weekdayLabels, formatTime,
} from '../core/dateMath.js';
import {
  addDaysInZone, startOfWeekInZone, startOfDayInZone, isSameDayInZone, zonedParts, toZonedDate,
  weekdayInZone,
} from '../core/timezone.js';
import { packColumns } from '../core/layout.js';
import { bindText } from '../core/i18nText.js';
import { compileDayMarks } from '../core/dayMarks.js';
import { createDragCreate } from '../composables/dragCreate.js';
import { createDragMove } from '../composables/dragMove.js';
import { createResizeHandle } from '../composables/resize.js';
import { appendChipContent } from './chipContent.js';

lkI18n.define('calendar', { allDay: 'All day' });

function makeChipFocusable(chip, onOpen) {
  chip.tabIndex = 0;
  chip.setAttribute('role', 'button');
  chip.setAttribute('aria-label', chip.textContent);
  chip.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onOpen(e);
  });
}

const MIN_EVENT_MINUTES = 15;

function snap(minutes, step) {
  return Math.round(minutes / step) * step;
}

/**
 * @param {Element} container
 * @param {Object} [opts]
 * @param {number} [opts.days=7] — 7 for week, 1 for day
 * @param {number} [opts.weekStartsOn=0]
 * @param {number} [opts.startHour=0]
 * @param {number} [opts.endHour=24]
 * @param {number} [opts.slotMinutes=30]
 * @param {number} [opts.slotHeight=24] — px per slot
 * @param {string} [opts.locale]
 * @param {string} [opts.timezone] — an IANA zone (e.g. 'America/New_York') "today", the visible
 *   days' boundaries, and displayed times are computed in; omit to use the viewer's own machine
 *   zone (unchanged pre-timezone-support behavior) — see core/timezone.js
 * @param {Array|Function} [opts.markedDays] — color specific days independent of any event
 *   (weekends, public holidays, blackout dates) — see core/dayMarks.js for the rule shapes
 * @param {boolean} [opts.showNowLine=true] — a live line across today's column at the current time
 * @param {Object} [opts.businessHours] — shade the hours/days outside of it: { start: 9, end: 17,
 *   days: [1,2,3,4,5] }; any key you omit keeps that dimension unrestricted
 * @param {Function} [opts.eventIcon] — (event) => icon spec, for events with no `event.icon` of
 *   their own — see core/eventIcon.js for the icon spec shapes
 * @param {Object} [opts.text]
 * @param {Function} [opts.onSelect] — ({ start, end, allDay })
 * @param {Function} [opts.onEventClick]
 * @param {Function} [opts.onEventMove] — (event, { start, end })
 * @param {Function} [opts.onEventResize] — (event, { start, end })
 * @returns {{ render: Function, destroy: Function }}
 */
export function createTimeGridView(container, opts = {}) {
  const days = opts.days || 7;
  const weekStartsOn = opts.weekStartsOn ?? 0;
  const startHour = opts.startHour ?? 0;
  const endHour = opts.endHour ?? 24;
  const slotMinutes = opts.slotMinutes || 30;
  const slotHeight = opts.slotHeight || 24;
  const pxPerMinute = slotHeight / slotMinutes;
  const totalMinutes = (endHour - startHour) * 60;
  const tx = bindText('calendar', opts.text);
  let dayMarks = compileDayMarks(opts.markedDays);
  const showNowLine = opts.showNowLine !== false;
  const businessHours = opts.businessHours || null;
  const zone = opts.timezone || null;
  const zStartOfWeek = (d, w) => (zone ? startOfWeekInZone(d, w, zone) : startOfWeek(d, w));
  const zStartOfDay = (d) => (zone ? startOfDayInZone(d, zone) : startOfDay(d));
  const zAddDays = (d, n) => (zone ? addDaysInZone(d, n, zone) : addDays(d, n));
  const zIsSameDay = (a, b) => (zone ? isSameDayInZone(a, b, zone) : isSameDay(a, b));
  const zWeekday = (d) => (zone ? weekdayInZone(d, zone) : d.getDay());
  const dtfOpts = (fmtOpts) => (zone ? { ...fmtOpts, timeZone: zone } : fmtOpts);
  // `dayDate` is one of `currentDays` (that calendar day's real start-of-day instant) — this gives
  // the real instant for `startHour`:00 on that same calendar day, correctly in `zone` when one is
  // set (a plain `.setHours(startHour)` would apply the *browser's* zone instead).
  function zDayStartAtHour(dayDate) {
    if (!zone) { const d = new Date(dayDate); d.setHours(startHour, 0, 0, 0); return d; }
    return toZonedDate({ ...zonedParts(dayDate, zone), hour: startHour, minute: 0, second: 0 }, zone);
  }

  container.classList.add('lkc-timegrid', days === 1 ? 'lkc-timegrid--day' : 'lkc-timegrid--week');
  // Set once, here: --lkc-days is read by .lkc-timegrid__head, __allday and __columns alike,
  // and CSS custom properties inherit down the DOM, so every one of them picks this up.
  container.style.setProperty('--lkc-days', String(days));

  const head = document.createElement('div');
  head.className = 'lkc-timegrid__head';
  const allDayRow = document.createElement('div');
  allDayRow.className = 'lkc-timegrid__allday';
  const body = document.createElement('div');
  body.className = 'lkc-timegrid__body';
  const timeCol = document.createElement('div');
  timeCol.className = 'lkc-timegrid__times';
  const columns = document.createElement('div');
  columns.className = 'lkc-timegrid__columns';
  body.appendChild(timeCol);
  body.appendChild(columns);
  container.appendChild(head);
  container.appendChild(allDayRow);
  container.appendChild(body);

  for (let h = startHour; h < endHour; h += 1) {
    const label = document.createElement('div');
    label.className = 'lkc-timegrid__time';
    label.style.height = `${(60 / slotMinutes) * slotHeight}px`;
    label.textContent = formatTime(new Date(2000, 0, 1, h, 0), opts.locale, { hour: 'numeric' });
    timeCol.appendChild(label);
  }

  let currentDays = [];
  const colEls = [];
  const handles = [];

  function dayIndexAt(x) {
    for (let i = 0; i < colEls.length; i += 1) {
      const rect = colEls[i].getBoundingClientRect();
      if (x >= rect.left && x < rect.right) return i;
    }
    return x < colEls[0]?.getBoundingClientRect().left ? 0 : colEls.length - 1;
  }

  function minutesAt(y, colIndex) {
    const rect = colEls[colIndex].getBoundingClientRect();
    const scrollTop = body.scrollTop;
    const offset = (y - rect.top) + scrollTop;
    const minutes = snap(offset / pxPerMinute, slotMinutes);
    return Math.min(Math.max(minutes, 0), totalMinutes);
  }

  function pointToTime(point) {
    const colIndex = dayIndexAt(point.x);
    if (colIndex < 0) return null;
    const minutes = minutesAt(point.y, colIndex);
    const date = new Date(zDayStartAtHour(currentDays[colIndex]).getTime() + minutes * 60000);
    return { colIndex, minutes, date };
  }

  const preview = document.createElement('div');
  preview.className = 'lkc-timegrid__preview';
  preview.hidden = true;

  const nowLine = document.createElement('div');
  nowLine.className = 'lkc-timegrid__now';
  nowLine.hidden = true;

  function updateNowLine() {
    if (!showNowLine || !currentDays.length) return;
    const now = new Date();
    const todayIdx = currentDays.findIndex((d) => zIsSameDay(d, now));
    const minutesSinceStart = todayIdx === -1 ? -1 : (now.getTime() - currentDays[todayIdx].getTime()) / 60000 - startHour * 60;
    if (todayIdx === -1 || minutesSinceStart < 0 || minutesSinceStart > totalMinutes) {
      nowLine.hidden = true;
      return;
    }
    const col = colEls[todayIdx];
    if (col && !col.contains(nowLine)) col.appendChild(nowLine);
    nowLine.hidden = false;
    nowLine.style.top = `${minutesSinceStart * pxPerMinute}px`;
  }

  const nowLineTimer = showNowLine ? setInterval(updateNowLine, 30000) : null;

  const selection = createDragCreate({
    container: columns,
    cellAt: (point) => pointToTime(point),
    isHandle: (t) => !t.closest('.lkc-event'),
    onStart(cell) {
      if (!colEls[cell.colIndex].contains(preview)) colEls[cell.colIndex].appendChild(preview);
      preview.hidden = false;
      preview.style.top = `${cell.minutes * pxPerMinute}px`;
      preview.style.height = `${slotMinutes * pxPerMinute}px`;
    },
    onChange(startCell, cell) {
      if (!colEls[startCell.colIndex].contains(preview)) colEls[startCell.colIndex].appendChild(preview);
      const a = Math.min(startCell.minutes, cell.minutes);
      const b = Math.max(startCell.minutes, cell.minutes) + slotMinutes;
      preview.style.top = `${a * pxPerMinute}px`;
      preview.style.height = `${Math.max(b - a, slotMinutes) * pxPerMinute}px`;
    },
    onEnd(startCell, cell) {
      preview.hidden = true;
      if (startCell.colIndex !== cell.colIndex) return;
      const a = Math.min(startCell.minutes, cell.minutes);
      const b = Math.max(startCell.minutes, cell.minutes) + slotMinutes;
      const dayStart = zDayStartAtHour(currentDays[startCell.colIndex]);
      const start = new Date(dayStart.getTime() + a * 60000);
      const end = new Date(start.getTime() + (b - a) * 60000);
      opts.onSelect?.({ start, end, allDay: false });
    },
  });

  function renderHead() {
    head.textContent = '';
    const labels = days === 7 ? weekdayLabels(opts.locale, weekStartsOn, 'short') : null;
    currentDays.forEach((day, i) => {
      const cell = document.createElement('div');
      cell.className = 'lkc-timegrid__headcell';
      if (zIsSameDay(day, new Date())) cell.classList.add('lkc-timegrid__headcell--today');
      const mark = dayMarks?.(day);
      if (mark) {
        cell.classList.add('lkc-timegrid__headcell--marked');
        cell.style.setProperty('--lkc-mark-color', mark.color);
        if (mark.label) cell.title = mark.label;
      }
      const dow = document.createElement('div');
      dow.className = 'lkc-timegrid__headcell-dow';
      dow.textContent = labels ? labels[i] : new Intl.DateTimeFormat(opts.locale, dtfOpts({ weekday: 'long' })).format(day);
      const num = document.createElement('div');
      num.className = 'lkc-timegrid__headcell-num';
      num.textContent = new Intl.DateTimeFormat(opts.locale, dtfOpts({ day: 'numeric', month: days === 1 ? 'long' : undefined })).format(day);
      cell.appendChild(dow);
      cell.appendChild(num);
      head.appendChild(cell);
    });
  }

  function buildTimedChip(event, col) {
    const startMin = Math.max(0, (event.start - col.day) / 60000 - startHour * 60);
    const endMin = Math.min(totalMinutes, (event.end - col.day) / 60000 - startHour * 60);
    const packed = col.packed.find((p) => p.event === event);
    const width = 100 / (packed?.cols || 1);
    const left = width * (packed?.col || 0);

    const chip = document.createElement('div');
    chip.className = 'lkc-event lkc-event--timed';
    chip.dataset.id = event.recurrenceId || event.id;
    if (event.color) chip.style.setProperty('--lkc-event-color', event.color);
    chip.style.top = `${startMin * pxPerMinute}px`;
    chip.style.height = `${Math.max(endMin - startMin, MIN_EVENT_MINUTES) * pxPerMinute}px`;
    chip.style.left = `${left}%`;
    chip.style.width = `calc(${width}% - 2px)`;

    appendChipContent(chip, event, { locale: opts.locale, eventIcon: opts.eventIcon, timezone: event.timezone || zone });

    function open(e) {
      if (chip.dataset.dragged === '1') { delete chip.dataset.dragged; return; }
      opts.onEventClick?.(event, e);
    }
    chip.addEventListener('click', open);
    makeChipFocusable(chip, open);

    if (event.editable !== false) {
      const move = createDragMove({
        el: chip,
        onStart() { chip.classList.add('lkc-event--dragging'); },
        onMove(dx, dy) {
          const dayWidth = colEls[0].getBoundingClientRect().width;
          const dMin = snap(dy / pxPerMinute, slotMinutes);
          const dDay = days === 7 ? Math.round(dx / dayWidth) : 0;
          chip.style.transform = `translate(${dDay * dayWidth}px, ${dMin * pxPerMinute}px)`;
        },
        onDrop(moved, dx, dy) {
          chip.classList.remove('lkc-event--dragging');
          chip.style.transform = '';
          if (!moved) return;
          chip.dataset.dragged = '1';
          const dayWidth = colEls[0].getBoundingClientRect().width;
          const dMin = snap(dy / pxPerMinute, slotMinutes);
          const dDay = days === 7 ? Math.round(dx / dayWidth) : 0;
          if (!dMin && !dDay) { delete chip.dataset.dragged; return; }
          const duration = event.end.getTime() - event.start.getTime();
          const nextStart = new Date(event.start.getTime() + dDay * 86400000 + dMin * 60000);
          opts.onEventMove?.(event, { start: nextStart, end: new Date(nextStart.getTime() + duration) });
        },
      });
      handles.push(move);

      const grip = document.createElement('div');
      grip.className = 'lkc-event__resize';
      chip.appendChild(grip);
      const resizer = createResizeHandle({
        handle: grip,
        axis: 'y',
        onStart() { chip.classList.add('lkc-event--resizing'); },
        onResize(delta) {
          const dMin = snap(delta / pxPerMinute, slotMinutes);
          const baseHeight = Math.max(endMin - startMin, MIN_EVENT_MINUTES) * pxPerMinute;
          chip.style.height = `${Math.max(baseHeight + dMin * pxPerMinute, slotMinutes * pxPerMinute)}px`;
        },
        onDrop(delta) {
          chip.classList.remove('lkc-event--resizing');
          const dMin = snap(delta / pxPerMinute, slotMinutes);
          if (!dMin) return;
          const nextEnd = new Date(event.end.getTime() + dMin * 60000);
          if (nextEnd.getTime() - event.start.getTime() < MIN_EVENT_MINUTES * 60000) return;
          opts.onEventResize?.(event, { start: event.start, end: nextEnd });
        },
      });
      handles.push(resizer);
    }

    return chip;
  }

  function buildOffHoursOverlays(day, col) {
    if (!businessHours) return;

    const overlay = (topMin, heightMin) => {
      const el = document.createElement('div');
      el.className = 'lkc-timegrid__offhours';
      el.style.top = `${topMin * pxPerMinute}px`;
      el.style.height = `${heightMin * pxPerMinute}px`;
      col.appendChild(el);
    };

    if (Array.isArray(businessHours.days) && !businessHours.days.includes(zWeekday(day))) {
      overlay(0, totalMinutes);
      return;
    }

    const bStart = Math.max(startHour, businessHours.start ?? startHour);
    const bEnd = Math.min(endHour, businessHours.end ?? endHour);
    if (bStart > startHour) overlay(0, (bStart - startHour) * 60);
    if (bEnd < endHour) overlay((bEnd - startHour) * 60, (endHour - bEnd) * 60);
  }

  function buildAllDayChip(event) {
    const startIdx = Math.max(0, Math.round((zStartOfDay(event.start) - currentDays[0]) / 86400000));
    const endIdx = Math.min(days - 1, Math.round((zStartOfDay(event.end) - currentDays[0]) / 86400000));
    const chip = document.createElement('div');
    chip.className = 'lkc-event lkc-event--allday';
    if (event.color) chip.style.setProperty('--lkc-event-color', event.color);
    chip.style.gridColumn = `${startIdx + 1} / ${endIdx + 2}`;
    appendChipContent(chip, event, { locale: opts.locale, eventIcon: opts.eventIcon, timezone: event.timezone || zone });
    const open = (e) => opts.onEventClick?.(event, e);
    chip.addEventListener('click', open);
    makeChipFocusable(chip, open);
    return chip;
  }

  function render(date, instances, calendars = []) {
    currentDays = days === 7
      ? Array.from({ length: 7 }, (_, i) => zAddDays(zStartOfWeek(date, weekStartsOn), i))
      : [zStartOfDay(date)];

    renderHead();

    columns.textContent = '';
    allDayRow.textContent = '';
    handles.splice(0).forEach((h) => h.destroy());
    colEls.length = 0;

    const timedByDay = currentDays.map((day) => ({
      day,
      events: instances.filter((e) => !e.allDay && e.start < zAddDays(day, 1) && e.end > day),
    }));
    timedByDay.forEach((col) => { col.packed = packColumns(col.events); });

    const allDayEvents = instances.filter((e) => e.allDay
      && e.start < zAddDays(currentDays[days - 1], 1) && e.end > currentDays[0]);
    allDayEvents.forEach((event) => allDayRow.appendChild(buildAllDayChip(event)));

    currentDays.forEach((day, i) => {
      const col = document.createElement('div');
      col.className = 'lkc-timegrid__col';
      if (zIsSameDay(day, new Date())) col.classList.add('lkc-timegrid__col--today');
      const mark = dayMarks?.(day);
      if (mark) {
        col.classList.add('lkc-timegrid__col--marked');
        col.style.setProperty('--lkc-mark-color', mark.color);
        if (mark.label) col.title = mark.label;
      }
      col.style.height = `${totalMinutes * pxPerMinute}px`;

      buildOffHoursOverlays(day, col);

      for (let m = 0; m < totalMinutes; m += 60) {
        const line = document.createElement('div');
        line.className = 'lkc-timegrid__hourline';
        line.style.top = `${m * pxPerMinute}px`;
        col.appendChild(line);
      }

      timedByDay[i].events.forEach((event) => col.appendChild(buildTimedChip(event, timedByDay[i])));

      columns.appendChild(col);
      colEls.push(col);
    });

    updateNowLine();
  }

  function setMarkedDays(rules) {
    dayMarks = compileDayMarks(rules);
  }

  function destroy() {
    selection.destroy();
    handles.forEach((h) => h.destroy());
    if (nowLineTimer) clearInterval(nowLineTimer);
    tx.destroy();
    container.textContent = '';
    container.classList.remove('lkc-timegrid', 'lkc-timegrid--day', 'lkc-timegrid--week');
  }

  return {
    render, destroy, setMarkedDays,
  };
}
