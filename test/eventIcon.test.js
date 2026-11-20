// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
import { describe, it, expect } from 'vitest';
import { resolveEventIcon } from '../src/js/core/eventIcon.js';

describe('resolveEventIcon', () => {
  it('returns null for no icon', () => {
    expect(resolveEventIcon(null)).toBeNull();
    expect(resolveEventIcon(undefined)).toBeNull();
  });

  it('treats a plain string as a LookUI icon name', () => {
    const el = resolveEventIcon('calendar');
    expect(el).toBeInstanceOf(window.Node);
    expect(el.classList.contains('lk-icon')).toBe(true);
    expect(el.classList.contains('lk-icon--calendar')).toBe(true);
  });

  it('{ lookui, size } picks an explicit icon and size', () => {
    const el = resolveEventIcon({ lookui: 'star-fill', size: 'sm' });
    expect(el.classList.contains('lk-icon--star-fill')).toBe(true);
    expect(el.classList.contains('lk-icon--sm')).toBe(true);
  });

  it('{ html } inserts raw markup', () => {
    const el = resolveEventIcon({ html: '<svg data-test="x"></svg>' });
    expect(el.className).toBe('lkc-event__icon-html');
    expect(el.querySelector('svg[data-test="x"]')).toBeTruthy();
  });

  it('{ url } renders an <img>', () => {
    const el = resolveEventIcon({ url: 'https://example.com/pin.png', alt: 'Pin' });
    expect(el.tagName).toBe('IMG');
    expect(el.src).toBe('https://example.com/pin.png');
    expect(el.alt).toBe('Pin');
  });

  it('{ emoji } renders the glyph as text', () => {
    const el = resolveEventIcon({ emoji: '🎉' });
    expect(el.textContent).toBe('🎉');
  });

  it('accepts a Node directly, cloning it', () => {
    const node = document.createElement('span');
    node.textContent = 'x';
    const el = resolveEventIcon(node);
    expect(el).not.toBe(node);
    expect(el.textContent).toBe('x');
  });

  it('accepts a function, resolving its return value', () => {
    const el = resolveEventIcon(() => 'calendar');
    expect(el.classList.contains('lk-icon--calendar')).toBe(true);
  });

  it('returns null for an unrecognized object shape', () => {
    expect(resolveEventIcon({ nonsense: true })).toBeNull();
  });
});
