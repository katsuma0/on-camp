#!/usr/bin/env node
/* Zero-dependency CI check for on-camp (no browser, no npm install).
 *
 *   1. Every JS file passes `node --check` (syntax).
 *   2. The parks data parses (data/parks.js -> window.PARKS) and is non-trivial.
 *   3. The share module (share.js) loads, exposes its API, and its
 *      encode/decode round-trips unicode safely into a #/shared/ deep link.
 *   4. Every local file referenced by index.html exists, and share.js loads
 *      before app.js.
 *   5. Every local file precached by the service worker (CORE) exists, the
 *      cache version is declared, and share.js and the design system
 *      (assets/ios.css + assets/icons.svg) are precached.
 *
 * Exit code is non-zero if anything fails.
 */
'use strict';
var cp = require('child_process');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var fails = [], passes = 0;
function ok(n) { passes++; console.log('  ✓ ' + n); }
function bad(n, d) { fails.push(n + (d ? ', ' + d : '')); console.log('  ✗ ' + n + (d ? ', ' + d : '')); }
function rel(p) { return path.join(ROOT, p); }

// ---- 1. syntax ----
console.log('\n[1] Syntax (node --check)');
['app.js', 'share.js', 'map.js', 'service-worker.js',
 'data/parks.js', 'data/park-pins.js', 'data/ecosystem.js', 'tools/check.js'].forEach(function (f) {
  if (!fs.existsSync(rel(f))) { bad(f, 'missing'); return; }
  try { cp.execFileSync(process.execPath, ['--check', rel(f)], { stdio: 'pipe' }); ok(f); }
  catch (e) { bad(f, 'syntax error'); }
});

// ---- 2. parks data ----
console.log('\n[2] Parks data');
try {
  global.window = global.window || {};
  require(rel('data/parks.js'));
  var P = global.window.PARKS_DATA;
  if (Array.isArray(P) && P.length > 20) ok('parks parse (' + P.length + ')'); else bad('parks count', 'got ' + (P && P.length));
  var badP = (P || []).filter(function (x) { return !x.id || !x.name; });
  if (badP.length) bad('parks missing id/name', String(badP.length)); else ok('all parks have id + name');
} catch (e) { bad('parks data load', e.message); }

// ---- 3. share module ----
console.log('\n[3] Share module');
try {
  global.window = global.window || {};
  require(rel('share.js'));
  var OS = global.window.OnShare;
  if (!OS) bad('OnShare defined', 'window.OnShare missing');
  else {
    var need = ['config', 'encode', 'decode', 'link', 'makeCard', 'share'];
    var miss = need.filter(function (m) { return typeof OS[m] !== 'function'; });
    if (miss.length) bad('OnShare API', 'missing ' + miss.join(', ')); else ok('OnShare exposes ' + need.join('/'));
    var round = OS.decode(OS.encode({ t: 'camp-review', title: 'Aaron', x: 'ábc/+=' }));
    if (round && round.title === 'Aaron' && round.x === 'ábc/+=') ok('encode/decode round-trips (unicode-safe)'); else bad('encode/decode', JSON.stringify(round));
    OS.config({ app: 'on-camp', base: 'https://katsuma0.github.io/on-camp/' });
    if (/on-camp\/#\/shared\//.test(OS.link({ t: 'camp-review' }))) ok('link builds a #/shared/ deep link'); else bad('link format', OS.link({ t: 'camp-review' }));
  }
} catch (e) { bad('share module load', e.message); }

// ---- 4. index.html references ----
console.log('\n[4] index.html references');
try {
  var idx = fs.readFileSync(rel('index.html'), 'utf8');
  var refs = [];
  (idx.match(/(?:src|href)="([^"]+)"/g) || []).forEach(function (m) {
    var u = m.replace(/^(?:src|href)="/, '').replace(/"$/, '');
    if (/^(https?:|data:|mailto:|#|\/\/)/.test(u)) return;
    refs.push(u.split('#')[0].split('?')[0]);
  });
  var idxMissing = refs.filter(function (u) { return u && !fs.existsSync(rel(u)); });
  if (idxMissing.length) bad('index.html references a missing file', idxMissing.join(', ')); else ok('all ' + refs.length + ' local references exist');
  if (/share\.js/.test(idx) && idx.indexOf('share.js') < idx.indexOf('app.js')) ok('share.js loads before app.js'); else bad('share.js order', 'missing or after app.js');
  if (/id="view-shared"/.test(idx)) ok('receive view (#view-shared) present'); else bad('receive view', 'view-shared missing');
} catch (e) { bad('index.html', e.message); }

// ---- 5. service worker ----
console.log('\n[5] Service worker');
try {
  var sw = fs.readFileSync(rel('service-worker.js'), 'utf8');
  var cm = sw.match(/const CACHE = '([^']+)'/);
  if (cm) ok('cache version declared (' + cm[1] + ')'); else bad('cache version', 'no CACHE constant');
  var core = (sw.match(/const CORE = \[([\s\S]*?)\];/) || [])[1] || '';
  var locals = (core.match(/'\.\/[^']*'/g) || []).map(function (s) { return s.replace(/'/g, '').replace(/^\.\//, ''); }).filter(Boolean);
  var swMissing = locals.filter(function (p) { return p && !fs.existsSync(rel(p)); });
  if (swMissing.length) bad('precached file missing', swMissing.join(', ')); else ok('all ' + locals.length + ' precached files exist');
  if (/'\.\/share\.js'/.test(sw)) ok('share.js is precached'); else bad('share.js precache', 'not in CORE');
  if (/'\.\/assets\/ios\.css'/.test(sw) && /'\.\/assets\/icons\.svg'/.test(sw)) ok('design system (ios.css + icons.svg) is precached'); else bad('design system precache', 'assets/ios.css or assets/icons.svg not in CORE');
  if (!/styles\.css/.test(sw)) ok('retired styles.css is not precached'); else bad('styles.css precache', 'still referenced by CORE');
} catch (e) { bad('service worker', e.message); }

console.log('\n' + (fails.length ? ('FAILED: ' + fails.length + ' check(s)\n - ' + fails.join('\n - ')) : ('ALL ' + passes + ' CHECKS PASSED')));
process.exit(fails.length ? 1 : 0);
