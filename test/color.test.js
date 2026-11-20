// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
import { describe, it, expect } from 'vitest';
import { autoColor, PALETTE } from '../src/js/core/color.js';

describe('autoColor', () => {
  it('always returns a color from the palette', () => {
    ['a', 'b', 'lc-abc123', '', 'event-42'].forEach((seed) => {
      expect(PALETTE).toContain(autoColor(seed));
    });
  });

  it('is deterministic — the same seed always yields the same color', () => {
    const seed = 'lc-mwopgptz-1';
    const first = autoColor(seed);
    for (let i = 0; i < 10; i += 1) expect(autoColor(seed)).toBe(first);
  });

  it('coerces a non-string seed', () => {
    expect(() => autoColor(42)).not.toThrow();
    expect(PALETTE).toContain(autoColor(42));
  });

  it('spreads across more than one palette entry for a handful of distinct ids', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `lc-${i}`);
    const colors = new Set(ids.map((id) => autoColor(id)));
    expect(colors.size).toBeGreaterThan(1);
  });
});
