// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookCalendar
// Builds dist/look-calendar.min.css from dist/look-calendar.css.

import { readFileSync, writeFileSync } from 'node:fs';
import postcss from 'postcss';
import cssnano from 'cssnano';

const css = readFileSync('dist/look-calendar.css', 'utf8');
const result = await postcss([cssnano({ preset: ['default', { svgo: false }] })])
  .process(css, { from: 'dist/look-calendar.css', to: 'dist/look-calendar.min.css' });

writeFileSync('dist/look-calendar.min.css', result.css);
