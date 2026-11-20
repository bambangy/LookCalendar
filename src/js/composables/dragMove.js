// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// Pointer-drag for moving an existing event block. Reports raw pixel deltas; the
// view converts them to day/slot deltas (grid cell size differs per view).

/**
 * @param {Element} el — the event chip/block being dragged
 * @param {number} [threshold=4] — px of movement before a drag counts as a drag (vs. a click)
 * @param {Function} [onStart] — (event)
 * @param {Function} [onMove] — (dx, dy, event)
 * @param {Function} [onDrop] — (moved:boolean, dx, dy, event)
 * @returns {{ destroy: Function }}
 */
export function createDragMove({ el, threshold = 4, onStart, onMove, onDrop }) {
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;

  function onPointerDown(e) {
    if (e.button !== 0) return;
    // See dragCreate.js: without this the browser's native text selection kicks in and can
    // leave the Selection API in a state that breaks later drags once the DOM is re-rendered.
    e.preventDefault();
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  }

  function onPointerMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved) {
      if (Math.hypot(dx, dy) < threshold) return;
      moved = true;
      onStart?.(e);
    }
    onMove?.(dx, dy, e);
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    window.removeEventListener('pointermove', onPointerMove);
    onDrop?.(moved, dx, dy, e);
  }

  el.addEventListener('pointerdown', onPointerDown);

  return {
    destroy() {
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    },
  };
}
