# LookCalendar

[![CI](https://github.com/bambangy/LookCalendar/actions/workflows/ci.yml/badge.svg)](https://github.com/bambangy/LookCalendar/actions/workflows/ci.yml)
[![CodeQL](https://github.com/bambangy/LookCalendar/actions/workflows/codeql.yml/badge.svg)](https://github.com/bambangy/LookCalendar/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/bambangy/LookCalendar/badge)](https://scorecard.dev/viewer/?uri=github.com/bambangy/LookCalendar)
[![npm](https://img.shields.io/npm/v/@lookui/calendar)](https://www.npmjs.com/package/@lookui/calendar)
[![dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)](package.json)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A modular, imperative calendar & scheduler built on [`@lookui/core`](https://github.com/bambangy/LookUI) — month, week, day and agenda views; drag-to-create, drag-to-move, resize; keyboard accessible; simple recurrence with timezone support; `.ics` import/export; and a built-in, fully customizable create/edit event form. Think TUI Calendar's feature set, but composed from independently-usable pieces instead of one monolithic widget.

```js
import { lkCalendar } from '@lookui/calendar';

lkCalendar('#calendar', {
  view: 'month',
  calendars: [{ id: 'work', name: 'Work', color: '#5c6bc0' }],
  events: [{ calendarId: 'work', title: 'Kickoff', start: '2026-03-02T09:00', end: '2026-03-02T10:00' }],
});
```

## 📖 Documentation → **[bambangy.github.io/LookCalendar](https://bambangy.github.io/LookCalendar/docs/)**

An interactive HTML site, not a wall of markdown — every demo is the real, running library:

- [Overview](./docs/index.html) — a live, editable `lkCalendar()` demo
- [Views](./docs/views.html) — month/week/day/agenda renderers used standalone, no orchestrator
- [Events & recurrence](./docs/recurrence.html) — the event model, plus a live recurrence-rule builder
- [Customization](./docs/customization.html) — swap the built-in event form's markup, live
- [Theming](./docs/theming.html) — a live token playground (colors, radius, dark mode)
- API reference — options, methods, guard hooks, i18n: [lkCalendar](./docs/api.html), [createCalendarStore](./docs/api-calendar-store.html), [createMonthView](./docs/api-month-view.html), [createTimeGridView](./docs/api-timegrid-view.html), [createAgendaView](./docs/api-agenda-view.html), [createEventForm](./docs/api-event-form.html), [exportICS / importICS](./docs/api-ics.html)

Open `docs/index.html` directly in a browser after `npm run build` (it loads `../dist/look-calendar.js`/`.css`), or serve the repo with any static file server.

## Install

```bash
npm install @lookui/core @lookui/calendar
```

`@lookui/core` is a **peer dependency** — load its `look.css` before `look-calendar.css`.

## Modular by design

Every piece `lkCalendar` is built from is independently importable:

```js
import {
  lkCalendar,           // the whole thing: toolbar + view + built-in CRUD dialog — docs/api.html
  createCalendarStore,  // just the event/calendar data model — docs/api-calendar-store.html
  createMonthView,      // just the month grid renderer — docs/api-month-view.html
  createTimeGridView,   // just the week/day renderer — docs/api-timegrid-view.html
  createAgendaView,     // just the list renderer — docs/api-agenda-view.html
  createEventForm,      // just the built-in create/edit form — docs/api-event-form.html
  exportICS, importICS, // .ics interop (Google Calendar / Outlook / Apple Calendar) — docs/api-ics.html
} from '@lookui/calendar';
```

Each has its own complete API reference (full options/properties/methods) linked above, not just a usage snippet.

## License & trademark

LookCalendar is released under the [MIT License](LICENSE).
Copyright (c) 2026 Bambang Yudhotomo.

"LookUI" and "Look UI" are trademarks of Bambang Yudhotomo; see LookUI's own README for its
trademark terms. "LookCalendar" names this project specifically.
