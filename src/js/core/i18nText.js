// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// Per-component text binding, built only on @lookui/core's public `lkI18n` API
// (LookUI's own `bindText` helper is internal and not exported — this mirrors it exactly).

import { lkI18n } from '@lookui/core';

/**
 * @param {string} ns
 * @param {Object} [own] — opts.text
 * @param {Function} [refresh] — called when the locale or a dictionary changes
 */
export function bindText(ns, own, refresh) {
  let overrides = own && typeof own === 'object' ? { ...own } : {};
  const prefix = `${ns}.`;
  const SHARED = /^(common|validation)\./;

  const absolute = () => {
    const out = {};
    for (const [k, v] of Object.entries(overrides)) out[k.startsWith(prefix) || SHARED.test(k) ? k : prefix + k] = v;
    return out;
  };
  let resolved = absolute();

  const off = typeof refresh === 'function' ? lkI18n.onChange(() => refresh()) : null;

  return {
    t: (key, params) => lkI18n.t(prefix + key, params, resolved),
    tf: (key, params) => lkI18n.t(key, params, resolved),
    get: () => ({ ...overrides }),
    set(next) {
      overrides = next && typeof next === 'object' ? { ...next } : {};
      resolved = absolute();
      if (typeof refresh === 'function') refresh();
    },
    destroy() { if (off) off(); },
  };
}
