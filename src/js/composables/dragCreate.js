// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// Generic pointer-drag selection over a grid of cells (day cells in month view,
// time slots in week/day view). Views supply `cellAt(point, target)` to map a
// pointer position to "their" notion of a cell; this composable only tracks the gesture.

/**
 * @param {Element} container — element that receives the pointerdown
 * @param {Function} cellAt — (point:{x,y}, target:Element) => any | null — the "cell" under the pointer
 * @param {Function} [isHandle] — (target:Element) => boolean — only start a drag from within these targets
 * @param {Function} [onStart] — (cell, event)
 * @param {Function} [onChange] — (startCell, currentCell, event)
 * @param {Function} [onEnd] — (startCell, endCell, event)
 * @returns {{ destroy: Function }}
 */
export function createDragCreate({ container, cellAt, isHandle, onStart, onChange, onEnd }) {
  let active = false;
  let startCell = null;

  function point(e) {
    return { x: e.clientX, y: e.clientY };
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    if (isHandle && !isHandle(e.target)) return;
    const cell = cellAt(point(e), e.target);
    if (!cell) return;
    // Without this, the browser starts its own native text/range selection as the pointer
    // moves. Besides the visible selection highlight, a stale Selection whose anchor node gets
    // removed by the next render() can leave the browser's selection machinery in a state that
    // interferes with later drags — this is what breaks "select again after the first time".
    e.preventDefault();
    active = true;
    startCell = cell;
    onStart?.(cell, e);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  }

  function onPointerMove(e) {
    if (!active) return;
    e.preventDefault();
    const cell = cellAt(point(e), e.target);
    if (cell != null) onChange?.(startCell, cell, e);
  }

  function onPointerUp(e) {
    if (!active) return;
    active = false;
    const cell = cellAt(point(e), e.target);
    onEnd?.(startCell, cell ?? startCell, e);
    window.removeEventListener('pointermove', onPointerMove);
    startCell = null;
  }

  container.addEventListener('pointerdown', onPointerDown);

  return {
    destroy() {
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    },
  };
}
