import { readFileSync } from 'node:fs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const banner = `/*!
 * LookCalendar v${pkg.version}
 * (c) 2026 ${pkg.author.name} | ${pkg.homepage}
 * Released under the ${pkg.license} License. This notice must be retained in all copies.
 */`;

const DIST = process.env.LOOK_DIST || 'dist';

const umd = {
  format: 'umd',
  name: 'LookCalendar',
  exports: 'named',
  sourcemap: false,
  banner,
  globals: { '@lookui/core': 'Look' },
};

export default {
  input: 'src/js/index.js',
  external: ['@lookui/core'],

  output: [
    { ...umd, file: DIST + '/look-calendar.js' },
    { ...umd, file: DIST + '/look-calendar.min.js', plugins: [terser()] },
    { file: DIST + '/look-calendar.esm.js', format: 'es', sourcemap: false, banner },
    { file: DIST + '/look-calendar.cjs', format: 'cjs', exports: 'named', sourcemap: false, banner },
  ],

  plugins: [
    resolve(),
  ],
};
