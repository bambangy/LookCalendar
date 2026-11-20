// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
import { describe, it, expect } from 'vitest';
import { packColumns, packLanes, laneCount } from '../src/js/core/layout.js';

function at(h1, h2) {
  return { start: new Date(2026, 0, 1, h1, 0), end: new Date(2026, 0, 1, h2, 0) };
}

describe('packColumns', () => {
  it('gives non-overlapping events a single shared column', () => {
    const a = at(9, 10);
    const b = at(10, 11);
    const out = packColumns([a, b]);
    expect(out.every((p) => p.cols === 1 && p.col === 0)).toBe(true);
  });

  it('splits overlapping events into side-by-side columns', () => {
    const a = at(9, 11);
    const b = at(10, 12);
    const out = packColumns([a, b]);
    const cols = out.map((p) => p.col).sort();
    expect(cols).toEqual([0, 1]);
    expect(out.every((p) => p.cols === 2)).toBe(true);
  });

  it('reuses a freed column for a later non-overlapping event', () => {
    const a = at(9, 10);
    const b = at(9, 10);
    const c = at(10, 11);
    const out = packColumns([a, b, c]);
    const forC = out.find((p) => p.event === c);
    expect(forC.col).toBeLessThan(2);
  });
});

describe('packLanes / laneCount', () => {
  it('keeps non-overlapping spans on the same lane', () => {
    const spans = [
      { event: 'a', startIdx: 0, endIdx: 1 },
      { event: 'b', startIdx: 2, endIdx: 3 },
    ];
    const packed = packLanes(spans);
    expect(packed.every((s) => s.lane === 0)).toBe(true);
    expect(laneCount(packed)).toBe(1);
  });

  it('bumps overlapping spans to a new lane', () => {
    const spans = [
      { event: 'a', startIdx: 0, endIdx: 3 },
      { event: 'b', startIdx: 1, endIdx: 2 },
    ];
    const packed = packLanes(spans);
    expect(laneCount(packed)).toBe(2);
  });
});
