// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// LookCalendar — main entry point. Re-exports the orchestrator (lkCalendar), every view
// renderer and composable it is built from, and the standalone data layer (calendarStore),
// so any piece can be imported on its own.

export { lkCalendar } from './components/calendar.js';
export { createEventForm } from './components/eventForm.js';

export { createMonthView } from './views/month.js';
export { createTimeGridView } from './views/timeGrid.js';
export { createAgendaView } from './views/agenda.js';

export { createCalendarStore } from './core/calendarStore.js';
export { expandRecurrence } from './core/recurrence.js';
export { autoColor, PALETTE as eventColorPalette } from './core/color.js';
export { resolveEventIcon } from './core/eventIcon.js';
export { exportICS, importICS } from './core/ics.js';
export * as calendarLayout from './core/layout.js';
export * as calendarDateMath from './core/dateMath.js';
export * as calendarTimezone from './core/timezone.js';

export { createDragCreate } from './composables/dragCreate.js';
export { createDragMove } from './composables/dragMove.js';
export { createResizeHandle } from './composables/resize.js';

export const version = '0.1.0';
export const author = 'Bambang Yudhotomo';
export const license = 'MIT';
export const homepage = 'https://github.com/bambangy/LookCalendar';
