// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// End-to-end smoke test against the real DOM-facing modules (not just the pure core logic),
// to catch import/export mismatches against @lookui/core's actual public surface.
import {
  describe, it, expect, afterEach, vi,
} from 'vitest';
import { lkCalendar, createEventForm, createMonthView, createCalendarStore } from '../src/js/index.js';

let container;

afterEach(() => {
  container?.remove();
  document.body.querySelectorAll('.lk-composable-dialog, .lk-popup-proxy').forEach((n) => n.remove());
  container = null;
});

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

// Lets any pending microtasks (promise .then chains from async beforeConfirm guards) settle,
// and lkDialog's destroyOnClose exit-animation timer (~200ms, JS-timeout based since jsdom
// fires no real CSS transitionend) run to completion so the closed dialog actually leaves the DOM.
// 600ms (not 300ms) because the full suite running under load occasionally needed more real
// wall-clock time than a single isolated test does for that same timer to fire.
function flush() {
  return new Promise((resolve) => { setTimeout(resolve, 600); });
}

describe('lkCalendar smoke test', () => {
  it('mounts a month view, shows an added event, and tears down cleanly', () => {
    const el = mount();
    const cal = lkCalendar(el, { date: new Date(2026, 0, 15) });

    expect(el.querySelector('.lkc-month')).toBeTruthy();
    expect(el.querySelector('.lkc-toolbar__title').textContent).toMatch(/2026/);

    cal.addEvent({ title: 'Kickoff', start: new Date(2026, 0, 15, 9), end: new Date(2026, 0, 15, 10) });
    expect(el.querySelector('.lkc-event__title').textContent).toBe('Kickoff');

    cal.changeView('week');
    expect(el.querySelector('.lkc-timegrid')).toBeTruthy();

    cal.changeView('agenda');
    expect(el.querySelector('.lkc-agenda')).toBeTruthy();
    expect(el.querySelector('.lkc-agenda__item').textContent).toContain('Kickoff');

    cal.destroy();
    expect(el.querySelector('.lkc-calendar')).toBeFalsy();
  });

  it('opens the built-in create dialog from the toolbar "new event" button', () => {
    const el = mount();
    const cal = lkCalendar(el, { date: new Date(2026, 0, 15) });

    el.querySelector('.lkc-toolbar button.lk-btn--primary').click();

    expect(document.querySelector('.lk-modal')).toBeTruthy();
    expect(document.querySelector('.lkc-form')).toBeTruthy();
    cal.destroy();
  });

  it('createEventForm wires title/all-day/calendar fields without a host calendar', () => {
    const form = createEventForm({
      calendars: [{ id: 'work', name: 'Work' }],
      event: { title: 'Review', start: new Date(), end: new Date(Date.now() + 3600000) },
    });
    expect(form.el.querySelector('[name="title"]').value).toBe('Review');
    expect(form.validate()).toBe(true);
    const values = form.getValues();
    expect(values.title).toBe('Review');
    expect(values.calendarId).toBe('work');
    form.destroy();
  });

  it('createEventForm shows the event\'s existing date in the start/end lkDate fields (regression: lkDate needs input:true to bind its display text)', () => {
    const form = createEventForm({
      calendars: [{ id: 'work', name: 'Work' }],
      event: { title: 'Review', start: new Date(2026, 0, 15, 9, 0), end: new Date(2026, 0, 15, 10, 0) },
    });
    const startInput = form.el.querySelector('[data-field="start"]');
    const endInput = form.el.querySelector('[data-field="end"]');
    expect(startInput.value).not.toBe('');
    expect(endInput.value).not.toBe('');
    expect(startInput.value).toMatch(/2026/);
    form.destroy();
  });

  it('createEventForm defaults to a blank icon/color for a new event, and getValues() reflects a pick', () => {
    const form = createEventForm({
      calendars: [{ id: 'work', name: 'Work' }],
    });
    expect(form.getValues().icon).toBe(null);
    expect(form.getValues().color).toBe(null);

    const iconField = form.form.get('icon');
    const colorField = form.form.get('color');
    expect(iconField).toBeTruthy();
    expect(colorField).toBeTruthy();

    iconField.value = 'star-fill';
    colorField.setValue('#5c6bc0');
    expect(form.getValues().icon).toBe('star-fill');
    expect(form.getValues().color).toBe('#5c6bc0');

    form.destroy();
  });

  it('createEventForm shows an existing event\'s icon/color, and preserves a non-string icon spec untouched', () => {
    const form = createEventForm({
      calendars: [{ id: 'work', name: 'Work' }],
      event: {
        title: 'Launch', icon: 'calendar', color: '#ff7043',
        start: new Date(2026, 0, 15, 9), end: new Date(2026, 0, 15, 10),
      },
    });
    expect(form.form.get('icon').value).toBe('calendar');
    expect(form.form.get('color').value).toBe('#ff7043');
    expect(form.getValues().icon).toBe('calendar');
    expect(form.getValues().color).toBe('#ff7043');
    form.destroy();

    // event.icon is an emoji spec (not a plain lookui name) — the built-in picker's curated
    // dropdown has no matching option for it, but getValues() shouldn't silently null it out
    // unless the user actually touches the icon field.
    const emojiForm = createEventForm({
      calendars: [{ id: 'work', name: 'Work' }],
      event: {
        title: 'Launch', icon: { emoji: '🚀' },
        start: new Date(2026, 0, 15, 9), end: new Date(2026, 0, 15, 10),
      },
    });
    expect(emojiForm.getValues().icon).toEqual({ emoji: '🚀' });
    emojiForm.destroy();
  });

  it('clicking an event chip opens the built-in edit dialog, in month and week view alike', () => {
    const el = mount();
    const cal = lkCalendar(el, { date: new Date(2026, 0, 15) });
    cal.addEvent({ title: 'Kickoff', start: new Date(2026, 0, 15, 9), end: new Date(2026, 0, 15, 10) });

    const monthChip = el.querySelector('.lkc-event:not(.lkc-event--spacer)');
    expect(monthChip.textContent).toContain('Kickoff');
    monthChip.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.lk-modal')).toBeTruthy();
    document.querySelector('.lk-modal__close').click();

    cal.changeView('week');
    const weekChip = el.querySelector('.lkc-event--timed');
    expect(weekChip.textContent).toContain('Kickoff');
    weekChip.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.lk-modal')).toBeTruthy();

    cal.destroy();
  });

  it('event chips are keyboard-focusable and open the edit dialog on Enter/Space, in month and week view alike', () => {
    const el = mount();
    const cal = lkCalendar(el, { date: new Date(2026, 0, 15) });
    cal.addEvent({ title: 'Kickoff', start: new Date(2026, 0, 15, 9), end: new Date(2026, 0, 15, 10) });

    const monthChip = el.querySelector('.lkc-event:not(.lkc-event--spacer)');
    expect(monthChip.tabIndex).toBe(0);
    expect(monthChip.getAttribute('role')).toBe('button');
    expect(monthChip.getAttribute('aria-label')).toContain('Kickoff');
    monthChip.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.querySelector('.lk-modal')).toBeTruthy();
    document.querySelector('.lk-modal__close').click();

    cal.changeView('week');
    const weekChip = el.querySelector('.lkc-event--timed');
    expect(weekChip.tabIndex).toBe(0);
    weekChip.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(document.querySelector('.lk-modal')).toBeTruthy();

    cal.destroy();
  });

  it('month view\'s day grid is keyboard-navigable: arrow keys move the active cell, Enter/Space opens the create dialog for the focused day', () => {
    const el = mount();
    const cal = lkCalendar(el, { date: new Date(2026, 0, 15) });

    const grid = el.querySelector('.lkc-month__grid');
    expect(grid.getAttribute('role')).toBe('grid');

    const cells = Array.from(el.querySelectorAll('.lkc-month__cell'));
    const tabbable = cells.filter((c) => c.tabIndex === 0);
    expect(tabbable).toHaveLength(1); // roving tabindex: exactly one stop

    const startIdx = cells.indexOf(tabbable[0]);
    tabbable[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const afterMove = cells.filter((c) => c.tabIndex === 0);
    expect(afterMove).toHaveLength(1);
    expect(cells.indexOf(afterMove[0])).toBe(startIdx + 1);

    afterMove[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.querySelector('.lk-modal')).toBeTruthy();

    cal.destroy();
  });

  it('week/day time-grid header lays out one column per visible day (regression: --lkc-days must reach every grid)', () => {
    const el = mount();
    const cal = lkCalendar(el, { date: new Date(2026, 0, 15), view: 'week' });

    expect(el.querySelector('.lkc-timegrid').style.getPropertyValue('--lkc-days')).toBe('7');
    expect(el.querySelectorAll('.lkc-timegrid__headcell')).toHaveLength(7);
    expect(el.querySelectorAll('.lkc-timegrid__col')).toHaveLength(7);

    cal.changeView('day');
    expect(el.querySelector('.lkc-timegrid').style.getPropertyValue('--lkc-days')).toBe('1');
    expect(el.querySelectorAll('.lkc-timegrid__headcell')).toHaveLength(1);

    cal.destroy();
  });

  it('newEventForm / editEventForm let the create and edit dialogs use distinct templates', () => {
    const el = mount();
    const seen = [];
    const cal = lkCalendar(el, {
      date: new Date(2026, 0, 15),
      newEventForm: ({ mode }) => { seen.push(mode); return '<input name="title" />'; },
      editEventForm: ({ mode }) => { seen.push(mode); return '<input name="title" />'; },
    });
    cal.addEvent({ title: 'Kickoff', start: new Date(2026, 0, 15, 9), end: new Date(2026, 0, 15, 10) });

    el.querySelector('.lkc-toolbar button.lk-btn--primary').click();
    document.querySelector('.lk-modal__close').click();

    const chip = el.querySelector('.lkc-event:not(.lkc-event--spacer)');
    chip.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(seen).toEqual(['create', 'edit']);
    cal.destroy();
  });

  it('multiDayStyle controls whether a multi-day month-view event renders as one continuous bar or separate per-day blocks', () => {
    const el = mount();
    const continuousCal = lkCalendar(el, { date: new Date(2026, 0, 15) }); // default: 'continuous'
    continuousCal.addEvent({ title: 'Offsite', allDay: true, start: new Date(2026, 0, 12), end: new Date(2026, 0, 14) });
    expect(el.querySelector('.lkc-event--continuous')).toBeTruthy();
    continuousCal.destroy();

    const blockCal = lkCalendar(el, { date: new Date(2026, 0, 15), multiDayStyle: 'block' });
    blockCal.addEvent({ title: 'Offsite', allDay: true, start: new Date(2026, 0, 12), end: new Date(2026, 0, 14) });
    expect(el.querySelector('.lkc-event--continuous')).toBeFalsy();
    blockCal.destroy();
  });

  it('markedDays tints weekend cells/columns/agenda groups with no event required', () => {
    const el = mount();
    const cal = lkCalendar(el, {
      date: new Date(2026, 0, 15), // January 2026
      markedDays: [{ weekday: [0, 6], color: '#eceff1', label: 'Weekend' }],
    });

    const markedCell = el.querySelector('.lkc-month__cell--marked');
    expect(markedCell).toBeTruthy();
    expect(markedCell.style.getPropertyValue('--lkc-mark-color')).toBe('#eceff1');
    expect(markedCell.title).toBe('Weekend');

    cal.changeView('week');
    expect(el.querySelector('.lkc-timegrid__col--marked')).toBeTruthy();
    expect(el.querySelector('.lkc-timegrid__headcell--marked')).toBeTruthy();

    cal.changeView('agenda');
    // No events were ever added — only markedDays should still produce visible groups.
    expect(el.querySelector('.lkc-agenda__group--marked')).toBeTruthy();
    expect(el.querySelector('.lkc-agenda__heading-mark').textContent).toBe('Weekend');

    cal.destroy();
  });

  it('setMarkedDays updates the rules on an already-mounted calendar', () => {
    const el = mount();
    const cal = lkCalendar(el, { date: new Date(2026, 0, 15) });
    expect(el.querySelector('.lkc-month__cell--marked')).toBeFalsy();

    cal.setMarkedDays([{ weekday: [0, 6], color: '#eceff1' }]);
    expect(el.querySelector('.lkc-month__cell--marked')).toBeTruthy();

    cal.destroy();
  });

  it('shows a live "now" line on today\'s time-grid column by default, and can be turned off', () => {
    const el = mount();
    const cal = lkCalendar(el, { date: new Date(), view: 'week' });

    const nowLine = el.querySelector('.lkc-timegrid__now');
    expect(nowLine).toBeTruthy();
    expect(nowLine.hidden).toBe(false);
    cal.destroy();

    const cal2 = lkCalendar(el, { date: new Date(), view: 'week', showNowLine: false });
    expect(el.querySelector('.lkc-timegrid__now')).toBeFalsy();
    cal2.destroy();
  });

  it('businessHours shades the hours/days outside it in week/day view', () => {
    const el = mount();
    const cal = lkCalendar(el, {
      date: new Date(2026, 0, 15), // Thursday
      view: 'week',
      businessHours: { start: 9, end: 17, days: [1, 2, 3, 4, 5] },
    });

    expect(el.querySelectorAll('.lkc-timegrid__offhours').length).toBeGreaterThan(0);
    cal.destroy();
  });

  it('opens a date-jump picker from the toolbar and keeps it in sync with the visible date', () => {
    const el = mount();
    const cal = lkCalendar(el, { date: new Date(2026, 0, 15) });

    const jumpBtn = el.querySelectorAll('.lkc-toolbar__nav button')[3];
    expect(jumpBtn.getAttribute('aria-label')).toBeTruthy();
    jumpBtn.click();
    expect(document.querySelector('.lk-date')).toBeTruthy();

    cal.next();
    expect(el.querySelector('.lkc-toolbar__title').textContent).toMatch(/2026/);
    cal.destroy();
  });

  it('hideWeekends renders only the visible weekday columns and keeps drag-select day mapping intact', () => {
    const el = mount();
    const cal = lkCalendar(el, { date: new Date(2026, 0, 15), hideWeekends: true });

    expect(el.querySelector('.lkc-month').style.getPropertyValue('--lkc-month-cols')).toBe('5');
    expect(el.querySelectorAll('.lkc-month__weekday')).toHaveLength(5);
    expect(el.querySelectorAll('.lkc-month__cell').length % 5).toBe(0);

    cal.destroy();
  });

  it('time-grid drag-to-create still works on a second attempt after a re-render in between (regression)', () => {
    const el = mount();
    const cal = lkCalendar(el, { date: new Date(2026, 0, 11), view: 'week', startHour: 0, endHour: 24, slotMinutes: 30, slotHeight: 24 });

    function mockColumnRects() {
      el.querySelectorAll('.lkc-timegrid__col').forEach((col, i) => {
        col.getBoundingClientRect = () => ({
          left: i * 100, right: i * 100 + 100, top: 0, bottom: 2000, width: 100, height: 2000,
        });
      });
    }

    function drag(x, y1, y2) {
      const columns = el.querySelector('.lkc-timegrid__columns');
      columns.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: x, clientY: y1 }));
      window.dispatchEvent(new window.PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y2 }));
      window.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y2 }));
    }

    mockColumnRects();
    drag(50, 0, 48); // column 0
    expect(document.querySelector('.lk-modal')).toBeTruthy();
    // Confirming the create dialog adds an event, which re-renders the view (fresh <col> elements).
    document.querySelector('.lk-modal [name="title"]').value = 'First';
    document.querySelector('.lk-modal .lk-btn--primary').click();

    mockColumnRects(); // the columns were recreated by the re-render
    drag(250, 0, 48); // column 2, a second gesture after the DOM was rebuilt
    expect(document.querySelectorAll('.lk-modal').length).toBeGreaterThan(0);

    cal.destroy();
  });

  it('prev/next page the agenda view by a full agendaRangeDays window (regression: used to only shift by 1 day)', () => {
    const el = mount();
    const cal = lkCalendar(el, {
      date: new Date(2026, 0, 1),
      view: 'agenda',
      agendaRangeDays: 10,
      events: [
        { title: 'Early', start: new Date(2026, 0, 2, 9), end: new Date(2026, 0, 2, 10) },
        { title: 'Late', start: new Date(2026, 0, 25, 9), end: new Date(2026, 0, 25, 10) },
      ],
    });

    expect(el.querySelector('.lkc-agenda__item').textContent).toContain('Early');
    const firstTitle = el.querySelector('.lkc-toolbar__title').textContent;

    cal.next();
    const secondTitle = el.querySelector('.lkc-toolbar__title').textContent;
    expect(secondTitle).not.toBe(firstTitle);
    expect(cal.date.getDate()).toBe(11); // Jan 1 + 10-day window

    cal.next();
    expect(el.querySelector('.lkc-agenda__item')?.textContent || '').not.toContain('Early');

    cal.prev();
    cal.prev();
    expect(el.querySelector('.lkc-agenda__item').textContent).toContain('Early');
    expect(el.querySelector('.lkc-toolbar__title').textContent).toBe(firstTitle);

    cal.destroy();
  });

  it('editing a recurring occurrence asks "this/following/all" and "this" only changes that one instance', async () => {
    const el = mount();
    const cal = lkCalendar(el, {
      date: new Date(2026, 0, 1),
      events: [{
        id: 'series', title: 'Daily sync',
        start: new Date(2026, 0, 1, 9), end: new Date(2026, 0, 1, 9, 15),
        recurrence: { freq: 'daily', count: 10 },
      }],
    });

    // Open the edit dialog on the Jan 3 occurrence.
    const chips = Array.from(el.querySelectorAll('.lkc-event:not(.lkc-event--spacer)'));
    chips[2].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(document.querySelectorAll('.lk-modal')).toHaveLength(1);

    document.querySelector('.lk-modal [name="title"]').value = 'Special agenda';
    document.querySelector('.lk-modal .lk-btn--primary').click(); // Save

    // The recurrence-scope picker should now be open on top of the edit dialog.
    expect(document.querySelectorAll('.lk-modal')).toHaveLength(2);
    const scopeButtons = document.querySelectorAll('.lkc-recurrence-scope__btn');
    expect(scopeButtons).toHaveLength(3);

    scopeButtons[0].click(); // "This event"
    await flush();

    expect(document.querySelectorAll('.lk-modal')).toHaveLength(0);

    const instances = cal.store.between(new Date(2026, 0, 1), new Date(2026, 0, 11));
    expect(instances).toHaveLength(10);
    const jan3 = instances.find((e) => e.start.getDate() === 3);
    expect(jan3.title).toBe('Special agenda');
    expect(jan3.masterId).toBeUndefined();
    expect(instances.filter((e) => e.title === 'Daily sync')).toHaveLength(9);

    cal.destroy();
  });

  it('deleting a recurring occurrence with scope "following" removes it and every later one', async () => {
    const el = mount();
    const cal = lkCalendar(el, {
      date: new Date(2026, 0, 1),
      events: [{
        id: 'series', title: 'Daily sync',
        start: new Date(2026, 0, 1, 9), end: new Date(2026, 0, 1, 9, 15),
        recurrence: { freq: 'daily', count: 10 },
      }],
    });

    const chips = Array.from(el.querySelectorAll('.lkc-event:not(.lkc-event--spacer)'));
    chips[4].dispatchEvent(new window.MouseEvent('click', { bubbles: true })); // Jan 5
    document.querySelector('.lkc-dialog__delete').click();

    const scopeButtons = document.querySelectorAll('.lkc-recurrence-scope__btn');
    scopeButtons[1].click(); // "This and following events"
    await flush();

    expect(document.querySelectorAll('.lk-modal')).toHaveLength(0);
    const instances = cal.store.between(new Date(2026, 0, 1), new Date(2026, 0, 11));
    expect(instances).toHaveLength(4);
    expect(instances.every((e) => e.start.getDate() < 5)).toBe(true);

    cal.destroy();
  });

  it('editing or deleting a non-recurring event never shows the scope picker', async () => {
    const el = mount();
    const cal = lkCalendar(el, { date: new Date(2026, 0, 15) });
    cal.addEvent({ title: 'Kickoff', start: new Date(2026, 0, 15, 9), end: new Date(2026, 0, 15, 10) });

    const chip = el.querySelector('.lkc-event:not(.lkc-event--spacer)');
    chip.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    document.querySelector('.lk-modal [name="title"]').value = 'Renamed';
    document.querySelector('.lk-modal .lk-btn--primary').click();
    await flush();

    expect(document.querySelectorAll('.lkc-recurrence-scope__btn')).toHaveLength(0);
    expect(document.querySelectorAll('.lk-modal')).toHaveLength(0);
    expect(cal.store.all()[0].title).toBe('Renamed');

    cal.destroy();
  });

  it('a timed event chip shows a start-end time range and an icon, in both month and week view', () => {
    const el = mount();
    const cal = lkCalendar(el, {
      date: new Date(2026, 0, 15),
      events: [{
        title: 'Kickoff', icon: 'calendar',
        start: new Date(2026, 0, 15, 9), end: new Date(2026, 0, 15, 10),
      }],
    });

    const monthChip = el.querySelector('.lkc-event--timed');
    expect(monthChip.classList.contains('lkc-event--timed')).toBe(true);
    expect(monthChip.querySelector('.lkc-event__time-row')).toBeTruthy();
    const monthTime = monthChip.querySelector('.lkc-event__time').textContent;
    expect(monthTime).toMatch(/9.*AM/i);
    expect(monthTime).toMatch(/10.*AM/i);
    expect(monthChip.querySelector('.lkc-event__icon.lk-icon--calendar')).toBeTruthy();
    expect(monthChip.querySelector('.lkc-event__title').textContent).toBe('Kickoff');

    cal.changeView('week');
    const weekChip = el.querySelector('.lkc-event--timed');
    const weekTime = weekChip.querySelector('.lkc-event__time').textContent;
    expect(weekTime).toMatch(/9.*AM/i);
    expect(weekTime).toMatch(/10.*AM/i);
    expect(weekChip.querySelector('.lkc-event__icon.lk-icon--calendar')).toBeTruthy();

    cal.destroy();
  });

  it('an all-day event chip shows an icon but no time row (there is no time range to show)', () => {
    const el = mount();
    const cal = lkCalendar(el, {
      date: new Date(2026, 0, 15),
      events: [{
        title: 'Offsite', icon: { emoji: '🏖️' }, allDay: true,
        start: new Date(2026, 0, 12), end: new Date(2026, 0, 14),
      }],
    });

    const chip = el.querySelector('.lkc-event:not(.lkc-event--spacer)');
    expect(chip.classList.contains('lkc-event--timed')).toBe(false);
    expect(chip.querySelector('.lkc-event__time-row')).toBeFalsy();
    expect(chip.querySelector('.lkc-event__icon-emoji').textContent).toBe('🏖️');
    expect(chip.querySelector('.lkc-event__title').textContent).toBe('Offsite');

    cal.destroy();
  });

  it('opts.eventIcon supplies an icon for events with no icon of their own; event.icon always wins', () => {
    const el = mount();
    const cal = lkCalendar(el, {
      date: new Date(2026, 0, 15),
      eventIcon: (event) => (event.title === 'Has own icon' ? null : 'star-fill'),
      events: [
        { title: 'No own icon', start: new Date(2026, 0, 15, 9), end: new Date(2026, 0, 15, 10) },
        { title: 'Has own icon', icon: 'heart-fill', start: new Date(2026, 0, 16, 9), end: new Date(2026, 0, 16, 10) },
      ],
    });

    const chips = Array.from(el.querySelectorAll('.lkc-event--timed'));
    const withTemplateIcon = chips.find((c) => c.textContent.includes('No own icon'));
    const withOwnIcon = chips.find((c) => c.textContent.includes('Has own icon'));
    expect(withTemplateIcon.querySelector('.lk-icon--star-fill')).toBeTruthy();
    expect(withOwnIcon.querySelector('.lk-icon--heart-fill')).toBeTruthy();
    expect(withOwnIcon.querySelector('.lk-icon--star-fill')).toBeFalsy();

    cal.destroy();
  });

  it('agenda view also renders an event icon next to the title', () => {
    const el = mount();
    const cal = lkCalendar(el, {
      date: new Date(2026, 0, 15),
      view: 'agenda',
      events: [{ title: 'Kickoff', icon: 'calendar', start: new Date(2026, 0, 15, 9), end: new Date(2026, 0, 15, 10) }],
    });

    const row = el.querySelector('.lkc-agenda__item');
    expect(row.querySelector('.lkc-event__icon.lk-icon--calendar')).toBeTruthy();

    cal.destroy();
  });

  it('a continuous multi-day bar is a single chip, spanning every day it crosses, not one per day', () => {
    const el = mount();
    const cal = lkCalendar(el, {
      date: new Date(2026, 0, 15),
      events: [{
        title: 'Conference', icon: { emoji: '🎤' }, allDay: true,
        start: new Date(2026, 0, 12), end: new Date(2026, 0, 16),
      }],
    });

    const chips = Array.from(el.querySelectorAll('.lkc-event--continuous'));
    expect(chips.length).toBe(1);
    const chip = chips[0];
    expect(chip.classList.contains('lkc-event--start')).toBe(true);
    expect(chip.classList.contains('lkc-event--end')).toBe(true);
    expect(chip.querySelector('.lkc-event__title').textContent).toBe('Conference');
    // 4 days (12th–15th, clipped to the visible grid) -> width spans 4 columns.
    expect(chip.style.width).toMatch(/^calc\(4 \* 100%/);

    // The other 3 days it crosses get an invisible spacer reserving the row slot, not a chip.
    const row = chip.closest('.lkc-month__events');
    const siblingSpacers = Array.from(row.parentElement.parentElement.querySelectorAll('.lkc-month__cell'))
      .flatMap((cell) => Array.from(cell.querySelectorAll('.lkc-event--spacer')));
    expect(siblingSpacers.length).toBeGreaterThanOrEqual(3);

    cal.destroy();
  });

  it('a continuous multi-day *timed* bar also merges into a single spanning chip', () => {
    const el = mount();
    const cal = lkCalendar(el, {
      date: new Date(2026, 0, 15),
      events: [{
        title: 'Workshop',
        start: new Date(2026, 0, 12, 9),
        end: new Date(2026, 0, 14, 17),
      }],
    });

    const chips = Array.from(el.querySelectorAll('.lkc-event--continuous'));
    expect(chips.length).toBe(1);
    expect(chips[0].querySelector('.lkc-event__title').textContent).toBe('Workshop');
    expect(chips[0].style.width).toMatch(/^calc\(3 \* 100%/);

    cal.destroy();
  });

  it('opts.timezone pins "today" to Asia/Tokyo\'s date, even though the machine\'s own instant is still the previous day there', () => {
    // June 15 23:30 UTC is already June 16 in Asia/Tokyo (UTC+9) — exactly the kind of day a
    // naive local-time calendar would get wrong for a viewer whose machine isn't in that zone.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 5, 15, 23, 30, 0)));
    try {
      const el = mount();
      const cal = lkCalendar(el, { date: new Date(Date.UTC(2026, 5, 16)), timezone: 'Asia/Tokyo' });
      expect(el.querySelector('.lkc-month__cell--today .lkc-month__date').textContent).toBe('16');
      cal.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opts.timezone pins "today" to America/Los_Angeles\'s date, even though another zone would already see the next day', () => {
    // Same instant, opposite side: June 15 23:30 UTC is still June 15 in America/Los_Angeles
    // (UTC-7 in June).
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 5, 15, 23, 30, 0)));
    try {
      const el = mount();
      const cal = lkCalendar(el, { date: new Date(Date.UTC(2026, 5, 16)), timezone: 'America/Los_Angeles' });
      expect(el.querySelector('.lkc-month__cell--today .lkc-month__date').textContent).toBe('15');
      cal.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opts.timezone formats event chip times in the configured zone, not the machine\'s own', () => {
    const el = mount();
    // 09:00 Asia/Jakarta (UTC+7, no DST) on 2026-01-15 is 02:00 UTC the same day.
    const start = new Date(Date.UTC(2026, 0, 15, 2, 0, 0));
    const cal = lkCalendar(el, {
      date: new Date(2026, 0, 15),
      timezone: 'Asia/Jakarta',
      events: [{ title: 'Standup', start, end: new Date(start.getTime() + 30 * 60000) }],
    });
    const chip = el.querySelector('.lkc-event--timed');
    expect(chip.querySelector('.lkc-event__time').textContent).toMatch(/9|09/);
    cal.destroy();
  });

  it('calendar.exportICS()/importICS() round-trip events through the calendar\'s own store', () => {
    const el = mount();
    const cal = lkCalendar(el, { date: new Date(2026, 0, 15) });
    cal.addEvent({
      title: 'Daily standup',
      start: new Date(2026, 0, 15, 9), end: new Date(2026, 0, 15, 9, 15),
      recurrence: { freq: 'daily', count: 5 },
    });

    const ics = cal.exportICS();
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Daily standup');
    expect(ics).toContain('RRULE:FREQ=DAILY;COUNT=5');
    cal.destroy();

    const cal2 = lkCalendar(el, { date: new Date(2026, 0, 15) });
    const imported = cal2.importICS(ics);
    expect(imported).toHaveLength(1);
    expect(imported[0].title).toBe('Daily standup');
    expect(el.querySelector('.lkc-event__title').textContent).toBe('Daily standup');
    cal2.destroy();
  });

  it('createMonthView renders independently of lkCalendar, driven by a standalone store', () => {
    const el = mount();
    const store = createCalendarStore({
      events: [{ title: 'Standalone', start: new Date(2026, 0, 10, 9), end: new Date(2026, 0, 10, 10) }],
    });
    const view = createMonthView(el, {});
    const days = store.between(new Date(2026, 0, 1), new Date(2026, 1, 1));
    view.render(new Date(2026, 0, 1), days, store.calendars());

    expect(el.querySelector('.lkc-event__title').textContent).toBe('Standalone');
    view.destroy();
  });
});
