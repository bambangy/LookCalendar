// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// Same cancelable `before<Action>` convention LookUI's own components use (guard(), applyBase()
// aren't part of @lookui/core's public API, so this is a small, self-contained reimplementation
// kept API-compatible with it — see Look.lkDate / Look.lkForm for the pattern this mirrors).

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const isThenable = (r) => r != null && typeof r.then === 'function';

/**
 * @param {Object} opts — reads `before<Name>`
 * @param {string} name — action name in camelCase: 'create', 'change', 'remove', 'viewChange', …
 * @param {*} payload
 * @param {Object} ctx — passed to the hook as the 2nd argument ({ source, component, … })
 * @param {Function} proceed — (payload) => void
 * @returns {boolean|Promise<boolean>}
 */
export function guard(opts, name, payload, ctx, proceed) {
  const hook = opts && opts[`before${cap(name)}`];

  const finish = (next) => {
    if (next === false) return false;
    const value = next === undefined || next === true || next === null ? payload : next;
    proceed(value);
    return true;
  };

  let result;
  if (typeof hook === 'function') {
    try {
      result = payload === undefined ? hook(ctx) : hook(payload, ctx);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`LookCalendar: before${cap(name)} threw`, err);
      return false;
    }
  }

  if (isThenable(result)) {
    return result.then(finish, (err) => {
      // eslint-disable-next-line no-console
      console.error(`LookCalendar: before${cap(name)} rejected`, err);
      return false;
    });
  }
  return finish(result);
}
