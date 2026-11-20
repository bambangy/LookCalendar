// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// A small, pleasant categorical palette + a deterministic hash, so an event with no explicit
// color and no calendar color gets a distinct, stable color instead of every uncolored event
// defaulting to the same --lkc-event-color. "Stable" means the same event id always picks the
// same color across renders and reloads — it is never re-randomized on the fly.

const PALETTE = [
  '#5c6bc0', '#00bcd4', '#26a69a', '#66bb6a', '#ffca28',
  '#ff7043', '#ec407a', '#ab47bc', '#29b6f6', '#8d6e63',
  '#9ccc65', '#78909c',
];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** A stable color for `seed` (typically an event id), picked from a small fixed palette. */
export function autoColor(seed) {
  return PALETTE[hashString(String(seed)) % PALETTE.length];
}

export { PALETTE };
