// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// Overlap-packing algorithms. Pure functions: input events, output placement — no DOM.

/**
 * Pack same-day timed events into side-by-side columns (classic day/week-view layout).
 * @param {Array<{start:Date,end:Date}>} events — already filtered to one day
 * @returns {Array<{event:Object,col:number,cols:number}>}
 */
export function packColumns(events) {
  const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end);
  const columns = []; // array of arrays of events, each column holding non-overlapping events
  const placement = new Map(); // event -> { col, group }
  const groups = []; // collision clusters, each { events:Set, cols:number }

  function overlaps(a, b) {
    return a.start < b.end && a.end > b.start;
  }

  sorted.forEach((event) => {
    let col = columns.findIndex((c) => !overlaps(c[c.length - 1], event));
    if (col === -1) {
      col = columns.length;
      columns.push([]);
    }
    columns[col].push(event);

    let group = groups.find((g) => [...g.events].some((e) => overlaps(e, event)));
    if (!group) {
      group = { events: new Set(), cols: 0 };
      groups.push(group);
    } else {
      // Merge any other groups this event bridges
      const bridged = groups.filter((g) => g !== group && [...g.events].some((e) => overlaps(e, event)));
      bridged.forEach((g) => {
        g.events.forEach((e) => group.events.add(e));
        groups.splice(groups.indexOf(g), 1);
      });
    }
    group.events.add(event);
    group.cols = Math.max(group.cols, col + 1);
    placement.set(event, { col, group });
  });

  return sorted.map((event) => {
    const p = placement.get(event);
    return { event, col: p.col, cols: p.group.cols };
  });
}

/**
 * Lane-assign multi-day "bar" events (month view / all-day row) across a fixed set of day
 * columns so a bar never collides with another bar in the same lane.
 * @param {Array<{event:Object,startIdx:number,endIdx:number}>} spans — day-column index range (inclusive)
 * @returns {Array<{event:Object,startIdx:number,endIdx:number,lane:number}>}
 */
export function packLanes(spans) {
  const sorted = [...spans].sort((a, b) => a.startIdx - b.startIdx || (b.endIdx - b.startIdx) - (a.endIdx - a.startIdx));
  const lanes = []; // lane -> last occupied endIdx

  return sorted.map((span) => {
    let lane = lanes.findIndex((lastEnd) => lastEnd < span.startIdx);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(span.endIdx);
    } else {
      lanes[lane] = span.endIdx;
    }
    return { ...span, lane };
  });
}

export function laneCount(packed) {
  return packed.reduce((max, s) => Math.max(max, s.lane + 1), 0);
}
