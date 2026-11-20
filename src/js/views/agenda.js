// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// Agenda/list view — events in the visible range, grouped by day.

import { lkI18n } from '@lookui/core';
import {
  addDays, isSameDay, startOfDay, formatTime, rangeDays,
} from '../core/dateMath.js';
import { addDaysInZone, startOfDayInZone, isSameDayInZone } from '../core/timezone.js';
import { bindText } from '../core/i18nText.js';
import { compileDayMarks } from '../core/dayMarks.js';
import { resolveEventIcon } from '../core/eventIcon.js';

lkI18n.define('calendar', { noEvents: 'No events', allDay: 'All day' });

/**
 * @param {Element} container
 * @param {Object} [opts]
 * @param {number} [opts.rangeDays=30] — how many days ahead of `date` to list
 * @param {string} [opts.locale]
 * @param {string} [opts.timezone] — an IANA zone (e.g. 'America/New_York') "today", day grouping
 *   and displayed times are computed in; omit to use the viewer's own machine zone (unchanged
 *   pre-timezone-support behavior) — see core/timezone.js
 * @param {Array|Function} [opts.markedDays] — color specific days independent of any event; a
 *   marked day with no events still gets a (otherwise empty) group so it stays visible — see
 *   core/dayMarks.js for the rule shapes
 * @param {Function} [opts.eventIcon] — (event) => icon spec, for events with no `event.icon` of
 *   their own — see core/eventIcon.js for the icon spec shapes
 * @param {Object} [opts.text]
 * @param {Function} [opts.onEventClick]
 * @returns {{ render: Function, destroy: Function, rangeFor: Function }}
 */
export function createAgendaView(container, opts = {}) {
  const rangeDaysCount = opts.rangeDays || 30;
  const tx = bindText('calendar', opts.text);
  let dayMarks = compileDayMarks(opts.markedDays);
  const zone = opts.timezone || null;
  const zStartOfDay = (d) => (zone ? startOfDayInZone(d, zone) : startOfDay(d));
  const zAddDays = (d, n) => (zone ? addDaysInZone(d, n, zone) : addDays(d, n));
  const zIsSameDay = (a, b) => (zone ? isSameDayInZone(a, b, zone) : isSameDay(a, b));
  const dtfOpts = (fmtOpts) => (zone ? { ...fmtOpts, timeZone: zone } : fmtOpts);
  // The imported `rangeDays()` enumerates via the plain (browser-local) startOfDay/addDays —
  // reimplemented here off the zone-aware wrappers above so a configured `zone` doesn't get lost
  // partway through.
  function zRangeDays(start, end) {
    if (!zone) return rangeDays(start, end);
    const days = [];
    let cur = zStartOfDay(start);
    const last = zStartOfDay(end);
    while (cur <= last) {
      days.push(cur);
      cur = zAddDays(cur, 1);
    }
    return days;
  }

  container.classList.add('lkc-agenda');

  function rangeFor(date) {
    return { start: zStartOfDay(date), end: zAddDays(zStartOfDay(date), rangeDaysCount) };
  }

  function render(date, instances) {
    container.textContent = '';

    const byDay = new Map();
    instances.forEach((event) => {
      const key = zStartOfDay(event.start).getTime();
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(event);
    });

    // A marked day (weekend, holiday, …) with no events of its own still gets a group, so
    // it stays visible in the list instead of silently disappearing.
    if (dayMarks) {
      const { start, end } = rangeFor(date);
      zRangeDays(start, end).forEach((day) => {
        const key = zStartOfDay(day).getTime();
        if (!byDay.has(key) && dayMarks(day)) byDay.set(key, []);
      });
    }

    if (!byDay.size) {
      const empty = document.createElement('div');
      empty.className = 'lkc-agenda__empty';
      empty.textContent = tx.t('noEvents');
      container.appendChild(empty);
      return;
    }

    Array.from(byDay.keys()).sort((a, b) => a - b).forEach((key) => {
      const day = new Date(key);
      const mark = dayMarks?.(day);
      const group = document.createElement('div');
      group.className = 'lkc-agenda__group';
      if (zIsSameDay(day, new Date())) group.classList.add('lkc-agenda__group--today');
      if (mark) {
        group.classList.add('lkc-agenda__group--marked');
        group.style.setProperty('--lkc-mark-color', mark.color);
      }

      const heading = document.createElement('div');
      heading.className = 'lkc-agenda__heading';
      heading.textContent = new Intl.DateTimeFormat(opts.locale, dtfOpts({ weekday: 'long', month: 'long', day: 'numeric' })).format(day);
      if (mark?.label) {
        const label = document.createElement('span');
        label.className = 'lkc-agenda__heading-mark';
        label.textContent = mark.label;
        heading.appendChild(label);
      }
      group.appendChild(heading);

      byDay.get(key).sort((a, b) => a.start - b.start).forEach((event) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'lkc-agenda__item';
        if (event.color) row.style.setProperty('--lkc-event-color', event.color);

        const time = document.createElement('span');
        time.className = 'lkc-agenda__time';
        time.textContent = event.allDay ? tx.t('allDay') : formatTime(event.start, opts.locale, undefined, event.timezone || zone);

        const title = document.createElement('span');
        title.className = 'lkc-agenda__title';
        title.textContent = event.title || '';

        const iconSpec = event.icon ?? opts.eventIcon?.(event);
        const iconNode = iconSpec != null ? resolveEventIcon(iconSpec) : null;
        if (iconNode) {
          iconNode.classList.add('lkc-event__icon');
          iconNode.setAttribute('aria-hidden', 'true');
        }

        row.appendChild(time);
        if (iconNode) row.appendChild(iconNode);
        row.appendChild(title);
        row.addEventListener('click', (e) => opts.onEventClick?.(event, e));
        group.appendChild(row);
      });

      container.appendChild(group);
    });
  }

  function setMarkedDays(rules) {
    dayMarks = compileDayMarks(rules);
  }

  function destroy() {
    tx.destroy();
    container.textContent = '';
    container.classList.remove('lkc-agenda');
  }

  return {
    render, destroy, rangeFor, setMarkedDays,
  };
}
