// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// Regression: none of these composables called preventDefault() on pointerdown/pointermove,
// so the browser's native text/range selection kicked in during every drag gesture. Visually
// that's the "cursor/selection highlight while dragging" bug; functionally, a stale Selection
// whose anchor node gets removed by the next render() could leave the browser's selection
// machinery in a state that broke drag-to-select on the *next* attempt. Both composables must
// suppress the native selection unconditionally once a gesture is actually underway.
import { describe, it, expect, vi } from 'vitest';
import { createDragCreate } from '../src/js/composables/dragCreate.js';
import { createDragMove } from '../src/js/composables/dragMove.js';
import { createResizeHandle } from '../src/js/composables/resize.js';

function pointerEvent(type, opts = {}) {
  return new window.PointerEvent(type, { bubbles: true, button: 0, clientX: 0, clientY: 0, ...opts });
}

describe('createDragCreate', () => {
  it('calls preventDefault on pointerdown when a cell is found, and on pointermove while active', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    createDragCreate({ container, cellAt: () => 'cell-a' });

    const down = pointerEvent('pointerdown');
    const downSpy = vi.spyOn(down, 'preventDefault');
    container.dispatchEvent(down);
    expect(downSpy).toHaveBeenCalled();

    const move = pointerEvent('pointermove');
    const moveSpy = vi.spyOn(move, 'preventDefault');
    window.dispatchEvent(move);
    expect(moveSpy).toHaveBeenCalled();

    window.dispatchEvent(pointerEvent('pointerup'));
    container.remove();
  });

  it('does not call preventDefault when cellAt finds nothing (lets an ordinary click through)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    createDragCreate({ container, cellAt: () => null });

    const down = pointerEvent('pointerdown');
    const downSpy = vi.spyOn(down, 'preventDefault');
    container.dispatchEvent(down);
    expect(downSpy).not.toHaveBeenCalled();
    container.remove();
  });
});

describe('createDragMove', () => {
  it('calls preventDefault on pointerdown and while dragging', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    createDragMove({ el, threshold: 0 });

    const down = pointerEvent('pointerdown');
    const downSpy = vi.spyOn(down, 'preventDefault');
    el.dispatchEvent(down);
    expect(downSpy).toHaveBeenCalled();

    const move = pointerEvent('pointermove', { clientX: 10, clientY: 10 });
    const moveSpy = vi.spyOn(move, 'preventDefault');
    window.dispatchEvent(move);
    expect(moveSpy).toHaveBeenCalled();

    window.dispatchEvent(pointerEvent('pointerup', { clientX: 10, clientY: 10 }));
    el.remove();
  });
});

describe('createResizeHandle', () => {
  it('calls preventDefault on pointerdown and while resizing', () => {
    const handle = document.createElement('div');
    document.body.appendChild(handle);
    createResizeHandle({ handle });

    const down = pointerEvent('pointerdown');
    const downSpy = vi.spyOn(down, 'preventDefault');
    handle.dispatchEvent(down);
    expect(downSpy).toHaveBeenCalled();

    const move = pointerEvent('pointermove', { clientY: 10 });
    const moveSpy = vi.spyOn(move, 'preventDefault');
    window.dispatchEvent(move);
    expect(moveSpy).toHaveBeenCalled();

    window.dispatchEvent(pointerEvent('pointerup', { clientY: 10 }));
    handle.remove();
  });
});
