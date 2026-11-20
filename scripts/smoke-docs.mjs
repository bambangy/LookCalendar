// One-off check (not part of the test suite): load each docs page in jsdom with scripts
// actually executing, against the real dist/ build, and report any runtime errors.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const pages = [
  'index.html', 'views.html', 'recurrence.html', 'customization.html', 'theming.html', 'api.html',
  'api-calendar-store.html', 'api-month-view.html', 'api-timegrid-view.html', 'api-agenda-view.html',
  'api-event-form.html', 'api-ics.html',
];
let failed = false;

for (const page of pages) {
  const url = new URL(`../docs/${page}`, import.meta.url);
  const errors = [];
  const dom = new JSDOM(readFileSync(url, 'utf8'), {
    url: url.href,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
  });
  dom.window.onerror = (msg) => errors.push(msg);
  dom.window.addEventListener('error', (e) => errors.push(e.error?.stack || e.message));

  await new Promise((resolve) => {
    if (dom.window.document.readyState === 'complete') resolve();
    else dom.window.addEventListener('load', resolve);
    setTimeout(resolve, 1500);
  });

  if (errors.length) {
    failed = true;
    console.log(`\n❌ ${page}`);
    errors.forEach((e) => console.log('  ', e));
  } else {
    console.log(`✅ ${page}`);
  }
  dom.window.close();
}

process.exit(failed ? 1 : 0);
