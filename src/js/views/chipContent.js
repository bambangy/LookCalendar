// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// Shared chip-content builder for month.js and timeGrid.js: an icon (if any) + the time range
// (timed events) or just the title (all-day events). Kept separate from each view's own chip
// *wrapper* (position, drag handles, start/end modifiers differ per view) so both views render
// identical, icon-aware content without duplicating the markup.

import { formatTime } from '../core/dateMath.js';
import { resolveEventIcon } from '../core/eventIcon.js';

/**
 * @param {Element} chip — the chip wrapper to append content into
 * @param {Object} event
 * @param {Object} [opts]
 * @param {string} [opts.locale]
 * @param {Function} [opts.eventIcon] — (event) => icon spec; `event.icon` takes priority over this
 * @param {string} [opts.timezone] — IANA zone the displayed time is formatted in; omit to use the
 *   viewer's own machine zone (unchanged pre-timezone-support behavior)
 */
export function appendChipContent(chip, event, opts = {}) {
  const iconSpec = event.icon ?? opts.eventIcon?.(event);
  const iconNode = iconSpec != null ? resolveEventIcon(iconSpec) : null;
  if (iconNode) {
    iconNode.classList.add('lkc-event__icon');
    // Decorative — the chip's own accessible name (its text content, including the title) already
    // says everything a screen reader needs; this only matters for consumers of resolveEventIcon()
    // that don't also set an overriding aria-label on their container (an aria-label wins over
    // aria-hidden descendants anyway, so this is a no-op for the chip itself).
    iconNode.setAttribute('aria-hidden', 'true');
  }

  if (event.allDay) {
    if (iconNode) chip.appendChild(iconNode);
    const title = document.createElement('span');
    title.className = 'lkc-event__title';
    title.textContent = event.title || '';
    chip.appendChild(title);
    return;
  }

  chip.classList.add('lkc-event--timed');

  const timeRow = document.createElement('span');
  timeRow.className = 'lkc-event__time-row';
  if (iconNode) timeRow.appendChild(iconNode);
  const time = document.createElement('span');
  time.className = 'lkc-event__time';
  time.textContent = `${formatTime(event.start, opts.locale, undefined, opts.timezone)} – ${formatTime(event.end, opts.locale, undefined, opts.timezone)}`;
  timeRow.appendChild(time);
  chip.appendChild(timeRow);

  const title = document.createElement('span');
  title.className = 'lkc-event__title';
  title.textContent = event.title || '';
  chip.appendChild(title);
}
