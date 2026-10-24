// Shared harness for "Ne Giysem?" outfit QA: static server, Open-Meteo fixture builder, page driver, extractor.
// Usage: const H = require('./harness'); const app = await H.open({hour:9}); await app.weather(fix); await app.prefs({feel,act,hours}); const r = await app.read();
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = process.env.APP_DIR || path.join(__dirname, '..', '..', 'web');
const pad = n => String(n).padStart(2, '0');
const DATE = '2026-10-24'; // local Istanbul date used for the fixed clock and the fixtures

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
      const ext = path.extname(f), ct = {'.html':'text/html; charset=utf-8', '.js':'text/javascript', '.webmanifest':'application/manifest+json', '.png':'image/png', '.svg':'image/svg+xml'}[ext] || 'application/octet-stream';
      r.writeHead(200, {'content-type': ct}); fs.createReadStream(f).pipe(r);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

// Fixture: cur = current conditions; hour(h, i) = per-hour overrides (h = local hour of day, i = index from local midnight)
function fx(o) {
  const cur = Object.assign({app:15, t:null, code:2, wind:12, gust:20, dir:40, rh:60, precip:0, isDay:1}, o.cur || {});
  if (cur.t == null) cur.t = cur.app + 1;
  const H = {time:[], temperature_2m:[], apparent_temperature:[], precipitation_probability:[], weather_code:[], wind_speed_10m:[], wind_direction_10m:[], is_day:[]};
  const days = [];
  const d0 = Date.UTC(2026, 9, 24, 0, 0); // local midnight expressed as a UTC-like clock (strings are local)
  for (let i = 0; i < 168; i++) {
    const d = new Date(d0 + i * 3600e3), h = d.getUTCHours();
    const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
    if (h === 0) days.push(day);
    const ov = Object.assign({app:cur.app, p:5, code:cur.code, wind:cur.wind, dir:cur.dir, isDay: h >= 7 && h < 18 ? 1 : 0}, o.hour ? (o.hour(h, i) || {}) : {});
    H.time.push(`${day}T${pad(h)}:00`);
    H.apparent_temperature.push(ov.app); H.temperature_2m.push(ov.t != null ? ov.t : +(ov.app + 1).toFixed(1));
    H.precipitation_probability.push(ov.p); H.weather_code.push(ov.code); H.wind_speed_10m.push(ov.wind); H.wind_direction_10m.push(ov.dir); H.is_day.push(ov.isDay);
  }
  return {latitude:40.99, longitude:29.03, utc_offset_seconds:10800, timezone:'Europe/Istanbul',
    current:{time:`${DATE}T09:00`, temperature_2m:cur.t, apparent_temperature:cur.app, relative_humidity_2m:cur.rh, precipitation:cur.precip,
      weather_code:cur.code, wind_speed_10m:cur.wind, wind_gusts_10m:cur.gust, wind_direction_10m:cur.dir, is_day:cur.isDay},
    hourly:H, daily:{time:days, uv_index_max:days.map(() => o.uv == null ? 3 : o.uv), sunset:days.map(x => x + 'T18:10')}};
}

async function open(opts = {}) {
  const srv = await serve(), port = srv.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({viewport:{width:412, height:915}, deviceScaleFactor:1, timezoneId:'Europe/Istanbul', locale:'tr-TR', hasTouch:false, reducedMotion:'reduce'});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/ERR_FAILED/.test(m.text())) errors.push('console.' + m.type() + ': ' + m.text()); });
  let fixture = fx({});
  let meteoCalls = 0;
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.route(/bigdatacloud/, r => r.abort());
  await page.route(/api\.open-meteo\.com\/v1\/forecast/, r => { meteoCalls++; r.fulfill({status:200, contentType:'application/json', body:JSON.stringify(fixture)}); });
  const hour = opts.hour == null ? 9 : opts.hour;
  await page.clock.setFixedTime(new Date(Date.UTC(2026, 9, 24, hour - 3, opts.minute || 0)));
  await page.addInitScript(st => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('negiysem:v2', JSON.stringify(st)); sessionStorage.setItem('seeded', '1'); } },
    Object.assign({places:[{id:'p1', name:'Kadıköy', sub:'İstanbul', lat:40.99, lon:29.03}], sel:'p1', hours:opts.hours || 6, feel:'normal', act:'city', mode:'manual', dayMode:true}, opts.store || {}));
  const app = {page, errors, port,
    async load(fix) { if (fix) fixture = fix; await page.goto(`http://127.0.0.1:${port}/`); await app.idle(); },
    async idle() {
      await page.waitForFunction(() => !document.getElementById('refresh').classList.contains('busy') && !/alınıyor|bulunuyor/.test(document.getElementById('status').textContent), null, {timeout:5000});
    },
    async weather(fix) { fixture = fix; const n = meteoCalls; await page.evaluate(() => document.getElementById('refresh').click()); await page.waitForFunction(() => true);
      const t0 = Date.now(); while (meteoCalls === n && Date.now() - t0 < 4000) await new Promise(r => setTimeout(r, 10)); await app.idle(); },
    async setHour(h, m) { await page.clock.setFixedTime(new Date(Date.UTC(2026, 9, 24, h - 3, m || 0))); },
    async prefs(p) { for (const k of ['hours', 'feel', 'act']) if (p[k] != null) await page.evaluate(([k, v]) => document.querySelector(`.seg[data-key="${k}"] button[data-val="${v}"]`).click(), [k, String(p[k])]); },
    async read() {
      return page.evaluate(() => {
        const q = s => [...document.querySelectorAll(s)], tx = e => e ? e.textContent : '';
        return {
          head: tx(document.getElementById('headline')),
          pills: q('#pills .pill').map(tx),
          wear: q('#wear .stk').map(s => ({label: tx(s.querySelector('.lab')), aria: s.getAttribute('aria-label')})),
          take: q('#take .mini').map(s => ({label: s.textContent, aria: s.getAttribute('aria-label')})),
          takeHidden: document.getElementById('take').hidden,
          tips: q('#tips li').map(tx),
          feels: tx(document.getElementById('nowFeels')), big: tx(document.getElementById('bigTemp')), cond: tx(document.getElementById('nowCond')),
          lv: getComputedStyle(document.documentElement).getPropertyValue('--lv').trim(), night: document.documentElement.getAttribute('data-night'),
          slots: q('#slotList .row-i').map(r => tx(r.querySelector('dt')) + ' | ' + tx(r.querySelector('dd'))),
          facts: q('#facts .fact').map(tx), status: tx(document.getElementById('status')),
          hours: q('#hours .h').map(h => tx(h))
        };
      });
    },
    async tip(kind, i) { // kind 'w' or 't'
      await page.evaluate(k => { const n = document.querySelector(`[data-k="${k}"]`); n && n.click(); }, kind + ':' + i);
      return page.evaluate(() => { const c = document.getElementById('tipCard'); return c.hidden ? null : c.innerText; });
    },
    async shot(file) { await page.screenshot({path:file, fullPage:false}); },
    async close() { await browser.close(); srv.close(); }
  };
  return app;
}

// Compact one-line summary of a result
function brief(r) {
  return `"${r.head}" | wear: ${r.wear.map(w => w.label).join(', ')} | take: ${r.take.map(t => t.label).join(', ') || '-'} | pills: ${r.pills.join(' / ')}${r.tips.length ? ' | tips: ' + r.tips.join(' / ') : ''}`;
}
// Text-quality checks over everything visible
function textIssues(r) {
  const all = [r.head, ...r.pills, ...r.wear.map(w => w.label + ' ' + w.aria), ...r.take.map(t => t.label + ' ' + t.aria), ...r.tips, r.feels, ...r.slots, ...r.facts, ...r.hours];
  const bad = [];
  all.forEach(s => {
    if (/undefined|NaN|null|Infinity|\[object/.test(s)) bad.push('bad token: ' + s);
    if (/ {2,}/.test(s)) bad.push('double space: ' + s);
    if (/\{|\}/.test(s)) bad.push('brace: ' + s);
    if (/-\d+°/.test(s)) bad.push('hyphen minus degree: ' + s);
    if (/\d\.\d°/.test(s)) bad.push('unrounded: ' + s);
    if (/ ,|,,|\.\.|;\./.test(s)) bad.push('punct: ' + s);
  });
  return bad;
}
module.exports = {open, fx, brief, textIssues, DATE};
