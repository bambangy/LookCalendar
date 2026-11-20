// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// The built-in create/edit event form. Entirely built on @lookui/core: lkForm drives
// values/validation, lkCheckbox/lkDropdown style the native controls, lkDate supplies the
// start/end pickers. Pass `template` (a string or `(ctx) => string`) to replace the markup —
// wiring looks up fields by the same contract the default template follows:
//
//   [name="title"]        text input/textarea
//   [name="allDay"]       checkbox
//   [data-field="start"]  text input — becomes an lkDate trigger
//   [data-field="end"]    text input — becomes an lkDate trigger
//   [name="calendarId"]   <select> — becomes an lkDropdown
//   [name="icon"]         <select> — becomes an lkDropdown over a curated @lookui/core icon list
//   [name="color"]        text input — becomes an lkColor swatch+picker
//   [name="description"]  textarea (optional)
//
// Any field your template omits is simply not wired; add your own markup/components around it
// and read them yourself via `form.el` / `form.form` (the underlying lkForm instance).
//
// A template function also receives `mode` ('create' | 'edit') in its ctx, so one template can
// render a leaner "quick add" form and a fuller "edit" form from the same function — or pass
// `opts.newEventForm` / `opts.editEventForm` to lkCalendar to use two entirely separate templates.

import {
  lkForm, lkDate, lkCheckbox, lkDropdown, lkColor, lkIcon, lkI18n,
} from '@lookui/core';
import { startOfDay, endOfDay } from '../core/dateMath.js';
import { bindText } from '../core/i18nText.js';

lkI18n.define('calendar', {
  'form.title': 'Title',
  'form.titlePlaceholder': 'Add title',
  'form.allDay': 'All day',
  'form.starts': 'Starts',
  'form.ends': 'Ends',
  'form.calendar': 'Calendar',
  'form.icon': 'Icon',
  'form.iconPlaceholder': 'None',
  'form.color': 'Color',
  'form.description': 'Description',
});

// A curated subset of @lookui/core's icon set for the default icon picker — covers the common
// calendar-event cases without listing all 100+ icons. A custom `template`/`eventIcon`, or
// editing `event.icon` programmatically, can still use any icon name, emoji, image, or node;
// the built-in picker only edits the plain-icon-name case.
const DEFAULT_EVENT_ICONS = [
  'calendar', 'clock', 'bell', 'star-fill', 'heart-fill', 'mail',
  'chat', 'users', 'user', 'pin', 'alert-triangle', 'circle-check',
];

function iconOptionNode(item) {
  const node = document.createElement('span');
  node.className = 'lkc-form__icon-option';
  const icon = lkIcon(item.value, { size: 'xs' });
  icon.setAttribute('aria-hidden', 'true');
  node.appendChild(icon);
  const label = document.createElement('span');
  label.textContent = item.label;
  node.appendChild(label);
  return node;
}

function defaultTemplate(t) {
  return `
    <div class="lkc-form__row">
      <label class="lkc-form__label">${t('form.title')}</label>
      <input class="lk-input lkc-form__input" name="title" type="text" placeholder="${t('form.titlePlaceholder')}" />
    </div>
    <label class="lkc-form__checkbox">
      <input type="checkbox" name="allDay" />
      <span>${t('form.allDay')}</span>
    </label>
    <div class="lkc-form__row lkc-form__row--split">
      <div>
        <label class="lkc-form__label">${t('form.starts')}</label>
        <input class="lk-input lkc-form__input" type="text" data-field="start" readonly />
      </div>
      <div>
        <label class="lkc-form__label">${t('form.ends')}</label>
        <input class="lk-input lkc-form__input" type="text" data-field="end" readonly />
      </div>
    </div>
    <div class="lkc-form__row">
      <label class="lkc-form__label">${t('form.calendar')}</label>
      <select name="calendarId"></select>
    </div>
    <div class="lkc-form__row lkc-form__row--split">
      <div>
        <label class="lkc-form__label">${t('form.icon')}</label>
        <select name="icon"></select>
      </div>
      <div>
        <label class="lkc-form__label">${t('form.color')}</label>
        <input class="lkc-form__input" type="text" name="color" />
      </div>
    </div>
    <div class="lkc-form__row">
      <label class="lkc-form__label">${t('form.description')}</label>
      <textarea class="lk-input lkc-form__input" name="description" rows="3"></textarea>
    </div>
  `;
}

/**
 * @param {Object} [opts]
 * @param {Object} [opts.event] — existing event when editing (null/undefined when creating)
 * @param {Array}  [opts.calendars] — [{ id, name, color }]
 * @param {string} [opts.locale]
 * @param {'create'|'edit'} [opts.mode] — defaults to 'edit' when `event.id` is set, else 'create'; passed to a function `template`
 * @param {Object} [opts.text] — i18n overrides, keys relative to 'form.' or absolute
 * @param {string|Function} [opts.template] — replaces the default markup (see field contract above)
 * @returns {{ el: Element, form: Object, getValues: Function, validate: Function, destroy: Function }}
 */
export function createEventForm(opts = {}) {
  const { event = null, calendars = [], locale } = opts;
  const mode = opts.mode || (event?.id ? 'edit' : 'create');
  const tx = bindText('calendar', opts.text);

  const el = document.createElement('form');
  el.className = 'lkc-form';
  el.noValidate = true;
  el.innerHTML = typeof opts.template === 'function'
    ? opts.template({ event, calendars, locale, mode, t: tx.t })
    : (opts.template || defaultTemplate(tx.t));

  const titleInput = el.querySelector('[name="title"]');
  const allDayInput = el.querySelector('[name="allDay"]');
  const startInput = el.querySelector('[data-field="start"]');
  const endInput = el.querySelector('[data-field="end"]');
  const calendarSelect = el.querySelector('[name="calendarId"]');
  const iconSelect = el.querySelector('[name="icon"]');
  const colorInput = el.querySelector('[name="color"]');
  const descriptionInput = el.querySelector('[name="description"]');

  let start = event?.start ? new Date(event.start) : new Date();
  let end = event?.end ? new Date(event.end) : new Date(start.getTime() + 30 * 60000);

  if (titleInput) titleInput.value = event?.title ?? '';
  if (descriptionInput) descriptionInput.value = event?.description ?? '';

  const fields = {};
  let allDayField = null;
  if (allDayInput) {
    allDayField = lkCheckbox(allDayInput, { checked: !!event?.allDay });
  }

  let calendarField = null;
  if (calendarSelect) {
    calendarField = lkDropdown(calendarSelect, {
      items: calendars.map((c) => ({ value: c.id, label: c.name })),
      value: event?.calendarId ?? calendars[0]?.id ?? 'default',
    });
    fields.calendarId = calendarField;
  }

  // Only a plain @lookui/core icon name is editable from the built-in picker (a curated list,
  // not the full icon set) — an emoji/image/HTML/node icon set programmatically survives
  // untouched unless the user actually picks something here.
  const initialIconIsCustom = event?.icon != null && typeof event.icon !== 'string';
  let iconTouched = false;
  let iconField = null;
  if (iconSelect) {
    iconField = lkDropdown(iconSelect, {
      items: DEFAULT_EVENT_ICONS.map((name) => ({ value: name, label: name })),
      value: typeof event?.icon === 'string' ? event.icon : '',
      placeholder: tx.t('form.iconPlaceholder'),
      clearable: true,
      template: iconOptionNode,
      selectedTemplate: iconOptionNode,
      onChange() { iconTouched = true; },
    });
    fields.icon = iconField;
  }

  let colorField = null;
  if (colorInput) {
    colorField = lkColor(colorInput, {
      value: event?.color ?? null,
      clearable: true,
    });
    fields.color = colorField;
  }

  let startPicker = null;
  let endPicker = null;
  if (startInput) {
    startPicker = lkDate(startInput, {
      value: start,
      time: true,
      locale,
      // Without this, lkDate has no reason to write its display text back into the trigger
      // (it only binds automatically when given a displayFormat): the field would stay blank.
      input: true,
      onChange(v) {
        if (!v) return;
        start = v;
        if (end < start) {
          end = new Date(start.getTime() + 30 * 60000);
          endPicker?.setValue(end);
        }
      },
    });
  }
  if (endInput) {
    endPicker = lkDate(endInput, {
      value: end,
      time: true,
      locale,
      input: true,
      onChange(v) { if (v) end = v; },
    });
  }

  const form = lkForm(el, { fields, native: false });

  function getValues() {
    const raw = form.getValues();
    const isAllDay = allDayField ? !!allDayField.checked : !!event?.allDay;
    return {
      title: titleInput ? titleInput.value.trim() : (event?.title ?? ''),
      allDay: isAllDay,
      start: isAllDay ? startOfDay(start) : start,
      end: isAllDay ? endOfDay(end) : end,
      calendarId: calendarField ? calendarField.value : (event?.calendarId ?? calendars[0]?.id ?? 'default'),
      icon: iconField
        ? ((iconTouched || !initialIconIsCustom) ? (iconField.value || null) : event.icon)
        : (event?.icon ?? null),
      color: colorField ? (colorField.value || null) : (event?.color ?? null),
      description: raw.description ?? (descriptionInput ? descriptionInput.value : ''),
    };
  }

  function validate() {
    if (!titleInput) return true;
    const ok = titleInput.value.trim().length > 0;
    titleInput.classList.toggle('lkc-form__input--invalid', !ok);
    return ok;
  }

  function destroy() {
    startPicker?.destroy();
    endPicker?.destroy();
    calendarField?.destroy();
    iconField?.destroy();
    colorField?.destroy();
    allDayField?.destroy();
    form.destroy();
    tx.destroy();
  }

  return { el, form, getValues, validate, destroy };
}
