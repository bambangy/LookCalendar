// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// lkCalendar — the orchestrator. Thin on its own: owns a calendarStore, the active view
// renderer and the toolbar, and opens the built-in lkDialog + createEventForm for CRUD.
// Every piece it wires (month/timeGrid/agenda views, createEventForm, calendarStore) is
// independently importable if you only want part of this.

import {
  lkDialog, lkIcon, lkI18n, lkDate,
} from '@lookui/core';
import { createCalendarStore } from '../core/calendarStore.js';
import { exportICS, importICS } from '../core/ics.js';
import { guard } from '../core/guard.js';
import { bindText } from '../core/i18nText.js';
import {
  toDate, startOfDay, endOfDay, startOfWeek, endOfWeek, addDays, addMonths, monthGridDays,
} from '../core/dateMath.js';
import {
  startOfDayInZone, endOfDayInZone, startOfWeekInZone, endOfWeekInZone, addDaysInZone,
  addMonthsInZone, monthGridDaysInZone, toZonedDate, zonedParts,
} from '../core/timezone.js';
import { createMonthView } from '../views/month.js';
import { createTimeGridView } from '../views/timeGrid.js';
import { createAgendaView } from '../views/agenda.js';
import { createEventForm } from './eventForm.js';

lkI18n.define('calendar', {
  today: 'Today',
  month: 'Month',
  week: 'Week',
  day: 'Day',
  agenda: 'Agenda',
  newEvent: 'New event',
  createEvent: 'New event',
  editEvent: 'Edit event',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  jumpToDate: 'Jump to date',
  editRecurring: 'Edit recurring event',
  deleteRecurring: 'Delete recurring event',
  scopeThis: 'This event',
  scopeFollowing: 'This and following events',
  scopeAll: 'All events',
});

const VIEWS = ['month', 'week', 'day', 'agenda'];

function resolveEl(target) {
  const node = typeof target === 'string' ? document.querySelector(target) : target;
  if (!node) throw new Error(`LookCalendar.lkCalendar: element not found — "${target}"`);
  return node;
}

/**
 * @param {Element|string} el — mount point
 * @param {Object} [opts]
 * @param {'month'|'week'|'day'|'agenda'} [opts.view='month']
 * @param {Date|string} [opts.date]
 * @param {Array}  [opts.events] — ignored if `opts.store` is given
 * @param {Array}  [opts.calendars] — [{ id, name, color }]
 * @param {Object} [opts.store] — a calendarStore from createCalendarStore(); owns its own lifecycle if given
 * @param {string} [opts.locale]
 * @param {string} [opts.timezone] — an IANA zone (e.g. 'America/New_York') "today", every view's
 *   day/week/month boundaries, displayed times and recurring events' cadence are computed in;
 *   omit to use the viewer's own machine zone (unchanged pre-timezone-support behavior). An
 *   individual event's own `event.timezone` overrides this for that event's recurrence cadence —
 *   see core/timezone.js.
 * @param {number} [opts.weekStartsOn=0]
 * @param {boolean} [opts.editable=true]
 * @param {boolean} [opts.selectable=true]
 * @param {number}  [opts.startHour=0] [opts.endHour=24] [opts.slotMinutes=30] [opts.slotHeight=24] — time-grid tuning
 * @param {boolean} [opts.showNowLine=true] — week/day view: a live line across today's column at the current time
 * @param {Object}  [opts.businessHours] — week/day view: shade hours/days outside it —
 *   { start: 9, end: 17, days: [1,2,3,4,5] }; any key you omit keeps that dimension unrestricted
 * @param {boolean} [opts.hideWeekends=false] — month view: don't render Saturday/Sunday columns
 * @param {number}  [opts.maxEventsPerDay=3] — month-view lane cap before "+N more"
 * @param {'continuous'|'block'} [opts.multiDayStyle='continuous'] — month view: render a multi-day
 *   event as one seamless bar across its days ('continuous'), or as a separate chip per day ('block')
 * @param {boolean} [opts.autoColor=true] — give an event with no explicit/calendar color a stable,
 *   deterministic color from a small palette instead of the single CSS default; ignored if `opts.store` is given
 * @param {Array|Function} [opts.markedDays] — color specific days independent of any event
 *   (weekends, public holidays, blackout dates) — see core/dayMarks.js for the rule shapes
 * @param {Function} [opts.eventIcon] — (event) => icon spec, for events with no `event.icon` of
 *   their own — see core/eventIcon.js for the icon spec shapes (a LookUI icon name, { html }, { url }, { emoji }, …)
 * @param {number}  [opts.agendaRangeDays=30]
 * @param {string|Function} [opts.eventForm] — replaces the built-in form markup for BOTH create and
 *   edit (see eventForm.js); a function template also receives `mode: 'create' | 'edit'`
 * @param {string|Function} [opts.newEventForm] — replaces `eventForm` for the create dialog only
 * @param {string|Function} [opts.editEventForm] — replaces `eventForm` for the edit dialog only
 * @param {Object}  [opts.text] — i18n overrides (namespace 'calendar')
 * @param {Function} [opts.beforeCreate] — (values, ctx) — false/Promise<false> vetoes
 * @param {Function} [opts.beforeChange] — (values, ctx)
 * @param {Function} [opts.beforeRemove] — (event, ctx)
 * @param {Function} [opts.beforeViewChange] — (view, ctx)
 * @param {Function} [opts.beforeDateChange] — (date, ctx)
 * @param {Function} [opts.onCreate] [opts.onChange] [opts.onRemove]
 * @param {Function} [opts.onViewChange] [opts.onDateChange]
 * @param {Function} [opts.onEventClick] — (event, domEvent) — fires before the built-in edit dialog opens
 * @returns {Object} api
 */
export function lkCalendar(el, opts = {}) {
  const container = resolveEl(el);
  const options = {
    view: 'month',
    date: new Date(),
    events: [],
    calendars: [{ id: 'default', name: 'Calendar', color: null }],
    locale: undefined,
    timezone: null,
    weekStartsOn: 0,
    editable: true,
    selectable: true,
    startHour: 0,
    endHour: 24,
    slotMinutes: 30,
    slotHeight: 24,
    showNowLine: true,
    businessHours: null,
    hideWeekends: false,
    maxEventsPerDay: 3,
    multiDayStyle: 'continuous',
    autoColor: true,
    markedDays: null,
    eventIcon: null,
    agendaRangeDays: 30,
    eventForm: null,
    newEventForm: null,
    editEventForm: null,
    text: null,
    ...opts,
  };

  const ownsStore = !opts.store;
  const store = opts.store || createCalendarStore({
    events: options.events, calendars: options.calendars, autoColor: options.autoColor,
    timezone: options.timezone,
  });

  const zone = options.timezone || null;
  const zStartOfDay = (d) => (zone ? startOfDayInZone(d, zone) : startOfDay(d));
  const zEndOfDay = (d) => (zone ? endOfDayInZone(d, zone) : endOfDay(d));
  const zStartOfWeek = (d, w) => (zone ? startOfWeekInZone(d, w, zone) : startOfWeek(d, w));
  const zEndOfWeek = (d, w) => (zone ? endOfWeekInZone(d, w, zone) : endOfWeek(d, w));
  const zAddDays = (d, n) => (zone ? addDaysInZone(d, n, zone) : addDays(d, n));
  const zAddMonths = (d, n) => (zone ? addMonthsInZone(d, n, zone) : addMonths(d, n));
  const zMonthGridDays = (d, w) => (zone ? monthGridDaysInZone(d, w, zone) : monthGridDays(d, w));
  const dtfOpts = (fmtOpts) => (zone ? { ...fmtOpts, timeZone: zone } : fmtOpts);

  let view = VIEWS.includes(options.view) ? options.view : 'month';
  let date = toDate(options.date) || new Date();
  let activeView = null;

  const tx = bindText('calendar', options.text, () => { buildToolbarTexts(); render(); });

  container.classList.add('lkc-calendar');

  const toolbar = document.createElement('div');
  toolbar.className = 'lkc-toolbar';
  const nav = document.createElement('div');
  nav.className = 'lkc-toolbar__nav';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button'; prevBtn.className = 'lk-btn lk-btn--secondary lk-btn--sm lk-btn--icon';
  prevBtn.appendChild(lkIcon('chevron-left', { size: 'sm' }));
  const todayBtn = document.createElement('button');
  todayBtn.type = 'button'; todayBtn.className = 'lk-btn lk-btn--secondary lk-btn--sm';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button'; nextBtn.className = 'lk-btn lk-btn--secondary lk-btn--sm lk-btn--icon';
  nextBtn.appendChild(lkIcon('chevron-right', { size: 'sm' }));
  const jumpBtn = document.createElement('button');
  jumpBtn.type = 'button'; jumpBtn.className = 'lk-btn lk-btn--secondary lk-btn--sm lk-btn--icon';
  jumpBtn.appendChild(lkIcon('calendar', { size: 'sm' }));
  nav.appendChild(prevBtn); nav.appendChild(todayBtn); nav.appendChild(nextBtn); nav.appendChild(jumpBtn);

  const title = document.createElement('div');
  title.className = 'lkc-toolbar__title';

  const viewSwitch = document.createElement('div');
  viewSwitch.className = 'lkc-toolbar__views';
  const viewButtons = new Map();
  VIEWS.forEach((v) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lkc-toolbar__view-btn';
    btn.addEventListener('click', () => changeView(v, 'user'));
    viewSwitch.appendChild(btn);
    viewButtons.set(v, btn);
  });

  const newEventBtn = document.createElement('button');
  newEventBtn.type = 'button';
  newEventBtn.className = 'lk-btn lk-btn--primary lk-btn--sm';
  newEventBtn.addEventListener('click', () => {
    const start = zone
      ? toZonedDate({ ...zonedParts(date, zone), hour: 9, minute: 0, second: 0 }, zone)
      : (() => { const d = new Date(date); d.setHours(9, 0, 0, 0); return d; })();
    openCreateDialog({ start, end: new Date(start.getTime() + 60 * 60000), allDay: false });
  });

  toolbar.appendChild(nav);
  toolbar.appendChild(title);
  toolbar.appendChild(viewSwitch);
  toolbar.appendChild(newEventBtn);

  const viewport = document.createElement('div');
  viewport.className = 'lkc-viewport';

  container.appendChild(toolbar);
  container.appendChild(viewport);

  function buildToolbarTexts() {
    todayBtn.textContent = tx.t('today');
    newEventBtn.textContent = tx.t('newEvent');
    jumpBtn.setAttribute('aria-label', tx.t('jumpToDate'));
    VIEWS.forEach((v) => { viewButtons.get(v).textContent = tx.t(v); });
  }

  function updateViewButtons() {
    VIEWS.forEach((v) => viewButtons.get(v).classList.toggle('lkc-toolbar__view-btn--active', v === view));
  }

  function visibleRange() {
    if (view === 'month') {
      const days = zMonthGridDays(date, options.weekStartsOn);
      return { start: days[0], end: zEndOfDay(days[41]) };
    }
    if (view === 'week') return { start: zStartOfWeek(date, options.weekStartsOn), end: zEndOfWeek(date, options.weekStartsOn) };
    if (view === 'day') return { start: zStartOfDay(date), end: zEndOfDay(date) };
    return activeView.rangeFor(date);
  }

  function updateTitle() {
    jumpPicker.value = date; // silent — does not re-fire onChange
    const { start, end } = visibleRange();
    if (view === 'month') {
      title.textContent = new Intl.DateTimeFormat(options.locale, dtfOpts({ month: 'long', year: 'numeric' })).format(date);
    } else if (view === 'day') {
      title.textContent = new Intl.DateTimeFormat(options.locale, dtfOpts({ dateStyle: 'full' })).format(date);
    } else if (view === 'week') {
      const fmt = new Intl.DateTimeFormat(options.locale, dtfOpts({ month: 'short', day: 'numeric' }));
      title.textContent = `${fmt.format(start)} – ${fmt.format(end)}`;
    } else {
      // Agenda: the window moves by agendaRangeDays, so show the actual range — "Month Year"
      // alone often wouldn't change at all between pages and made prev/next look broken.
      const fmt = new Intl.DateTimeFormat(options.locale, dtfOpts({ month: 'short', day: 'numeric', year: 'numeric' }));
      title.textContent = `${fmt.format(start)} – ${fmt.format(zAddDays(end, -1))}`;
    }
  }

  function render() {
    const { start, end } = visibleRange();
    const instances = store.between(start, end);
    updateTitle();
    activeView.render(date, instances, store.calendars());
  }

  function commonViewOpts() {
    return {
      locale: options.locale,
      timezone: options.timezone,
      weekStartsOn: options.weekStartsOn,
      markedDays: options.markedDays,
      eventIcon: options.eventIcon,
      text: options.text,
      onEventClick(event, domEvent) {
        options.onEventClick?.(event, { domEvent, component: api });
        if (options.editable !== false) openEditDialog(event);
      },
      onSelect: options.selectable === false ? undefined : (selection) => openCreateDialog(selection),
      onEventMove: (event, patch) => commitEventPatch(event, patch),
      onEventResize: (event, patch) => commitEventPatch(event, patch),
      onShowMore: (day, events) => openDayPopover(day, events),
    };
  }

  function mountView() {
    activeView?.destroy();
    viewport.textContent = '';
    const common = commonViewOpts();
    if (view === 'month') {
      activeView = createMonthView(viewport, {
        ...common,
        maxEventsPerDay: options.maxEventsPerDay,
        multiDayStyle: options.multiDayStyle,
        hideWeekends: options.hideWeekends,
      });
    } else if (view === 'week' || view === 'day') {
      activeView = createTimeGridView(viewport, {
        ...common,
        days: view === 'week' ? 7 : 1,
        startHour: options.startHour,
        endHour: options.endHour,
        slotMinutes: options.slotMinutes,
        slotHeight: options.slotHeight,
        showNowLine: options.showNowLine,
        businessHours: options.businessHours,
      });
    } else {
      activeView = createAgendaView(viewport, { ...common, rangeDays: options.agendaRangeDays });
    }
  }

  function go(nextDate, source) {
    guard(options, 'dateChange', nextDate, { source, component: api }, (d) => {
      date = d;
      render();
      options.onDateChange?.(date, { component: api });
    });
  }

  function navStep() {
    if (view === 'month') return 'month';
    if (view === 'week') return 7;
    if (view === 'agenda') return options.agendaRangeDays || 30;
    return 1;
  }

  function prev() {
    const step = navStep();
    go(step === 'month' ? zAddMonths(date, -1) : zAddDays(date, -step), 'user');
  }

  function next() {
    const step = navStep();
    go(step === 'month' ? zAddMonths(date, 1) : zAddDays(date, step), 'user');
  }
  function goToday() { go(new Date(), 'user'); }

  function changeView(nextView, source = 'api') {
    if (!VIEWS.includes(nextView) || nextView === view) return;
    guard(options, 'viewChange', nextView, { source, component: api }, (v) => {
      view = v;
      mountView();
      updateViewButtons();
      render();
      options.onViewChange?.(view, { component: api });
    });
  }

  // --- Recurrence scope ("this / following / all") ----------------------------------------

  // Same prompt every mainstream calendar app shows before applying an edit/delete to one
  // instance of a recurring event. Resolves 'this' | 'following' | 'all', or null if the user
  // backed out — the caller should treat null as "don't apply the edit".
  function askRecurrenceScope(kind) {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (value) => { if (!settled) { settled = true; resolve(value); } };

      const content = document.createElement('div');
      content.className = 'lkc-recurrence-scope';
      [['this', 'scopeThis'], ['following', 'scopeFollowing'], ['all', 'scopeAll']].forEach(([value, key]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lk-btn lk-btn--secondary lkc-recurrence-scope__btn';
        btn.textContent = tx.t(key);
        btn.addEventListener('click', () => { settle(value); dialog.close('select', 'user'); });
        content.appendChild(btn);
      });

      const dialog = lkDialog({
        title: tx.t(kind === 'remove' ? 'deleteRecurring' : 'editRecurring'),
        content,
        showCancel: true,
        showClose: false,
        cancelText: tx.t('cancel'),
        destroyOnClose: true,
        onCancel() { settle(null); },
        onDestroy() { settle(null); },
      });
    });
  }

  // --- CRUD dialogs -----------------------------------------------------------------------

  function openCreateDialog(selection) {
    const seed = { calendarId: store.calendars()[0]?.id, ...selection };
    const form = createEventForm({
      event: seed,
      calendars: store.calendars(),
      locale: options.locale,
      text: options.text,
      mode: 'create',
      template: options.newEventForm || options.eventForm,
    });
    let pending = null;
    const dialog = lkDialog({
      title: tx.t('createEvent'),
      content: form.el,
      confirmText: tx.t('save'),
      cancelText: tx.t('cancel'),
      destroyOnClose: true,
      beforeConfirm() {
        if (!form.validate()) return false;
        pending = form.getValues();
        return typeof options.beforeCreate === 'function'
          ? options.beforeCreate(pending, { source: 'user', component: api })
          : undefined;
      },
      onConfirm() {
        const created = store.add(pending);
        options.onCreate?.(created, { component: api });
        render();
      },
      onDestroy() { form.destroy(); },
    });
    return dialog;
  }

  function openEditDialog(event) {
    const masterId = event.masterId || event.id;
    const form = createEventForm({
      event,
      calendars: store.calendars(),
      locale: options.locale,
      text: options.text,
      mode: 'edit',
      template: options.editEventForm || options.eventForm,
    });
    let pending = null;
    let scope = 'all';
    const dialog = lkDialog({
      title: tx.t('editEvent'),
      content: form.el,
      confirmText: tx.t('save'),
      cancelText: tx.t('cancel'),
      destroyOnClose: true,
      beforeConfirm() {
        if (!form.validate()) return false;
        pending = form.getValues();
        const runGuard = () => (typeof options.beforeChange === 'function'
          ? options.beforeChange(pending, { source: 'user', component: api, event })
          : undefined);
        if (!event.masterId) return runGuard();
        return askRecurrenceScope('change').then((chosen) => {
          if (!chosen) return false;
          scope = chosen;
          return runGuard();
        });
      },
      onConfirm() {
        const updated = event.masterId
          ? store.updateOccurrence(event, pending, scope)
          : store.update(masterId, pending);
        options.onChange?.(updated, { component: api });
        render();
      },
      onDestroy() { form.destroy(); },
    });

    if (event.editable !== false) {
      const footer = dialog.dialogEl.querySelector('.lk-modal__footer');
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'lk-btn lk-btn--negative lkc-dialog__delete';
      delBtn.textContent = tx.t('delete');
      delBtn.addEventListener('click', async () => {
        let delScope = 'all';
        if (event.masterId) {
          const chosen = await askRecurrenceScope('remove');
          if (!chosen) return;
          delScope = chosen;
        }
        guard(options, 'remove', event, { source: 'user', component: api }, () => {
          if (event.masterId) store.removeOccurrence(event, delScope);
          else store.remove(masterId);
          options.onRemove?.(event, { component: api });
          dialog.close('delete', 'user');
          render();
        });
      });
      footer?.insertBefore(delBtn, footer.firstChild);
    }
    return dialog;
  }

  function commitEventPatch(event, patch) {
    const masterId = event.masterId || event.id;
    function apply(scope) {
      guard(options, 'change', patch, { source: 'user', component: api, event }, (v) => {
        const updated = event.masterId
          ? store.updateOccurrence(event, v, scope)
          : store.update(masterId, v);
        options.onChange?.(updated, { component: api });
        render();
      });
    }
    if (event.masterId) {
      askRecurrenceScope('change').then((scope) => {
        if (scope) apply(scope);
        else render(); // user backed out — snap the dragged chip back to its real position
      });
    } else {
      apply('all');
    }
  }

  function openDayPopover(day, events) {
    const list = document.createElement('div');
    list.className = 'lkc-day-popover';
    if (!events.length) {
      const empty = document.createElement('div');
      empty.className = 'lkc-agenda__empty';
      empty.textContent = tx.t('noEvents');
      list.appendChild(empty);
    }
    events.forEach((event) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'lkc-agenda__item';
      if (event.color) row.style.setProperty('--lkc-event-color', event.color);
      row.textContent = event.title || '';
      row.addEventListener('click', () => {
        dialog.close('select', 'user');
        if (options.editable !== false) openEditDialog(event);
      });
      list.appendChild(row);
    });
    const dialog = lkDialog({
      title: new Intl.DateTimeFormat(options.locale, { dateStyle: 'full' }).format(day),
      content: list,
      showCancel: false,
      confirmText: tx.t('cancel'),
      destroyOnClose: true,
    });
    return dialog;
  }

  const jumpPicker = lkDate(jumpBtn, {
    value: date,
    locale: options.locale,
    onChange(v) { if (v) go(v, 'user'); },
  });

  const unsubscribe = store.on(() => render());

  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);
  todayBtn.addEventListener('click', goToday);

  buildToolbarTexts();
  updateViewButtons();
  mountView();
  render();

  function destroy() {
    unsubscribe();
    activeView?.destroy();
    jumpPicker.destroy();
    tx.destroy();
    if (ownsStore) store.destroy();
    container.textContent = '';
    container.classList.remove('lkc-calendar');
  }

  const api = {
    el: container,
    store,
    get date() { return new Date(date); },
    set date(v) { go(toDate(v) || date, 'api'); },
    get view() { return view; },
    set view(v) { changeView(v, 'api'); },
    next,
    prev,
    today: goToday,
    changeView,
    addEvent(input) { const event = store.add(input); render(); return event; },
    updateEvent(id, patch) { const event = store.update(id, patch); render(); return event; },
    removeEvent(id) { const ok = store.remove(id); render(); return ok; },
    getEvent(id) { return store.get(id); },
    refresh: render,
    setMarkedDays(rules) {
      options.markedDays = rules;
      activeView.setMarkedDays?.(rules);
      render();
    },
    exportICS(icsOpts) { return exportICS(store.all(), { timezone: options.timezone, ...icsOpts }); },
    importICS(text) {
      const added = importICS(text).map((input) => store.add(input));
      render();
      return added;
    },
    destroy,
    get text() { return tx.get(); },
    set text(v) { tx.set(v); },
  };

  return api;
}
