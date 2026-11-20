// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// Resolves an event's icon into a renderable DOM node. An icon can be:
//   'calendar'                         — a LookUI icon name (Look.lkIcon(name))
//   { lookui: 'calendar-fill', size }   — same, explicit
//   { html: '<svg>...</svg>' }         — raw markup (trusted — the caller supplied it)
//   { url: 'https://.../pin.png' }     — an <img>
//   { emoji: '🎉' }                     — a plain text/emoji glyph
//   a Node                             — used as-is (cloned)
//   a function                         — called with no arguments, its result resolved the same way
//
// Precedence between a per-event icon and a calendar-wide `eventIcon` template is the caller's
// job (views do `event.icon ?? opts.eventIcon?.(event)`) — this module only turns one spec into a node.

import { lkIcon } from '@lookui/core';

export function resolveEventIcon(spec) {
  if (spec == null) return null;
  if (typeof spec === 'function') return resolveEventIcon(spec());
  if (typeof spec === 'string') return lkIcon(spec, { size: 'xs' });
  if (typeof Node !== 'undefined' && spec instanceof Node) return spec.cloneNode(true);

  if (typeof spec === 'object') {
    if (spec.lookui) return lkIcon(spec.lookui, { size: spec.size || 'xs' });
    if (spec.html) {
      const el = document.createElement('span');
      el.className = 'lkc-event__icon-html';
      el.innerHTML = spec.html;
      return el;
    }
    if (spec.url) {
      const img = document.createElement('img');
      img.src = spec.url;
      img.alt = spec.alt || '';
      img.className = 'lkc-event__icon-img';
      return img;
    }
    if (spec.emoji) {
      const el = document.createElement('span');
      el.className = 'lkc-event__icon-emoji';
      el.textContent = spec.emoji;
      return el;
    }
  }

  return null;
}
