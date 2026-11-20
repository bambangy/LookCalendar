// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// Pointer-drag for an event block's resize handle (its bottom edge in a time grid,
// its trailing edge in a month-view bar). Reports a raw pixel delta along one axis.

/**
 * @param {Element} handle — the resize grip element
 * @param {'x'|'y'} [axis='y']
 * @param {Function} [onStart] — (event)
 * @param {Function} [onResize] — (delta, event) — px moved along `axis` since start
 * @param {Function} [onDrop] — (delta, event)
 * @returns {{ destroy: Function }}
 */
export function createResizeHandle({ handle, axis = 'y', onStart, onResize, onDrop }) {
  let dragging = false;
  let startPos = 0;

  function pos(e) {
    return axis === 'y' ? e.clientY : e.clientX;
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    e.stopPropagation();
    // See dragCreate.js: without this the browser's native text selection kicks in and can
    // leave the Selection API in a state that breaks later drags once the DOM is re-rendered.
    e.preventDefault();
    dragging = true;
    startPos = pos(e);
    onStart?.(e);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  }

  function onPointerMove(e) {
    if (!dragging) return;
    e.preventDefault();
    onResize?.(pos(e) - startPos, e);
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener('pointermove', onPointerMove);
    onDrop?.(pos(e) - startPos, e);
  }

  handle.addEventListener('pointerdown', onPointerDown);

  return {
    destroy() {
      handle.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    },
  };
}
