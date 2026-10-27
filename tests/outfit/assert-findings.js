// Regression checks for the reported outfit findings. Each check states the EXPECTED (correct) behaviour,
// so it FAILS on the current build and should PASS once fixed. Exit code = number of failures.
const H = require('./harness');
const wetFx = (app, code, precip, p, extra = {}) => H.fx(Object.assign({cur:{app, code, precip, wind:10, gust:18}, uv:2, hour: () => ({p, code})}, extra));
const lab = l => l.map(x => x.label);
const C = [];
const check = (sev, name, setup, pred) => C.push({sev, name, setup, pred});

check('important', 'Snow is not reported as rain (73, precip 1.2 mm, -2°)', {fix:wetFx(-2, 73, 1.2, 90)},
  r => !r.pills.some(p => /Yağmur/.test(p)) && !r.wear.concat(r.take).some(i => /yağmur yağıyor/.test(i.aria)));
check('important', 'Sport in rain: no umbrella', {fix:wetFx(18, 63, 1, 90), prefs:{act:'sport'}},
  r => !lab(r.take).includes('Şemsiye') && !/Şemsiye/.test(r.head));
check('important', 'Rain + gust 60 at 15°: a rain/hooded outer layer is WORN (not only carried)', {fix:wetFx(15, 63, 2, 90, {cur:{app:15, code:63, precip:2, wind:25, gust:60, dir:220}})},
  r => lab(r.wear).some(l => ['Yağmurluk','Mont','Kaban','Şişme mont','Parka','İnce ceket','Rüzgârlık'].includes(l)));
check('important', 'Freezing rain (66) at -1°: non-slip shoes or an ice warning', {fix:wetFx(-1, 66, 1, 80)},
  r => lab(r.wear).includes('Kaymaz bot') || r.tips.concat(r.pills).some(t => /buz|kayga|don/i.test(t)));
check('important', 'Missing current apparent_temperature is not read as 0° (air 13°)', {fix:(() => { const f = H.fx({cur:{app:12, code:2}}); f.current.apparent_temperature = null; return f; })()},
  r => !/Hissedilen 0°/.test(r.feels) && !lab(r.wear).includes('Şişme mont'));
check('important', 'Missing hourly apparent_temperature is skipped, not read as 0°', {fix:(() => { const f = H.fx({cur:{app:12, code:2}}); f.hourly.apparent_temperature[11] = null; return f; })()},
  r => !r.pills.some(p => / 0°$/.test(p)) && !lab(r.take).includes('Bere'));
check('important', 'Info card "Hissedilen" matches the shown feels-like (sport, 5°)', {fix:H.fx({cur:{app:5, code:2}}), prefs:{act:'sport'}, hour:13},
  r => !r.wear.some(w => /Hissedilen 11°/.test(w.aria)));
check('minor', 'Umbrella is not suggested together with "use a hood instead of an umbrella" (wind 50, p45)', {fix:H.fx({cur:{app:12, code:3, wind:50, gust:80, dir:200}, uv:2, hour: () => ({wind:50, code:3, p:45})})},
  r => !(r.take.some(t => /Şemsiye/.test(t.label)) && r.tips.some(t => /şemsiye yerine/.test(t))));
check('minor', 'Gust-driven wind pill shows the gust, not 20 km/sa', {fix:H.fx({cur:{app:10, code:2, wind:20, gust:60, dir:30}, uv:2, hour: () => ({wind:20, code:2, p:5})})},
  r => r.pills.some(p => /60/.test(p)));
check('minor', 'Field at 30°: trousers card does not say thick/very-cold', {fix:H.fx({cur:{app:30, code:0}, uv:6, hour: () => ({code:0, p:0})}), prefs:{act:'field'}, hour:13},
  r => !r.slots.some(s => /Uzun pantolon/.test(s) && /Kalın|Çok soğukta/.test(s)));
check('minor', 'At -12° gloves are not "in case the weather changes"', {fix:H.fx({cur:{app:-12, code:3}, uv:1})},
  r => !r.take.some(t => t.label === 'Eldiven' && /değişirse/.test(t.aria)));
check('minor', 'Water bottle reason is not "in case it gets cooler" (sport 18°)', {fix:H.fx({cur:{app:18, code:2}}), prefs:{act:'sport'}},
  r => !r.take.some(t => t.label === 'Su' && /serinlerse|değişirse/.test(t.aria)));
check('minor', 'Sport, 18° now -> 12° at 21:00: some extra layer is suggested', {fix:H.fx({cur:{app:18, code:2}, uv:3, hour: h => ({app: h <= 15 ? 18 : h >= 21 ? 12 : 18 - (h - 15), code:2, p:5})}), prefs:{act:'sport'}, hour:15},
  r => r.take.some(t => ['Uzun kollu','Rüzgârlık','Sweatshirt','Hırka','İnce ceket'].includes(t.label)));
check('questionable', 'No cap at 23:00', {fix:H.fx({cur:{app:27, code:0, isDay:0}, uv:9, hour: () => ({code:0, p:0})}), prefs:{hours:3}, hour:23},
  r => !lab(r.wear).includes('Şapka'));
check('questionable', 'No raincoat with shorts at 30° (umbrella is enough)', {fix:wetFx(30, 80, 2, 70, {uv:8}), hour:13},
  r => !lab(r.wear).includes('Yağmurluk'));
// How hard it rains (mm an hour) changes the rain gear: drizzle needs no raincoat, heavy rain more than an umbrella.
const rainFx = (app, code, mm, extra = {}) => H.fx(Object.assign({cur:{app, code, precip:mm, wind:10, gust:18}, uv:2, hour: () => ({p:85, code, mm})}, extra));
check('important', 'Drizzle (0.3 mm/h, 12°): umbrella in the bag, no raincoat or boots, the pill says drizzle', {fix:rainFx(12, 61, 0.3)},
  r => !lab(r.wear).includes('Yağmurluk') && !lab(r.wear).includes('Su geçirmez ayakkabı') && lab(r.take).includes('Şemsiye') && r.pills.some(p => /Çisel/.test(p)));
check('important', 'Ordinary rain (2 mm/h, 12°): raincoat or waterproof outer layer, umbrella and waterproof shoes as before', {fix:rainFx(12, 63, 2)},
  r => lab(r.take).includes('Şemsiye') && lab(r.wear).includes('Su geçirmez ayakkabı') && r.pills.some(p => /Yağmur/.test(p)));
check('important', 'Heavy rain (9 mm/h) at 28°: a light raincoat is worn and the headline says an umbrella alone won\'t do', {fix:rainFx(28, 63, 9), hour:13},
  r => lab(r.wear).includes('İnce yağmurluk') && /Kuvvetli yağmur/.test(r.head) && /şemsiye tek başına yetmez/.test(r.head));
check('minor', 'Thunder with little rain is not called drizzle', {fix:rainFx(18, 95, 0.3)},
  r => !r.pills.some(p => /Çisel/.test(p)));
// Beta test (Oct 2026): the outfit agrees with the warning cards.
check('important', 'Warm lodos storm (22°, gusts 95): something windproof is worn, no cap', {fix:H.fx({cur:{app:22, code:1, wind:55, gust:95, dir:220}, uv:6, hour: () => ({wind:55, gust:95, code:1, p:5, dir:220})}), hour:13},
  r => lab(r.wear).some(l => ['Rüzgârlık','İnce ceket','Mont'].includes(l)) && !lab(r.wear.concat(r.take)).includes('Şapka') && /Rüzgâr çok sert/.test(r.head));
check('important', 'A storm due in two hours counts too (gusts 100 later, calm now)', {fix:H.fx({cur:{app:13, code:2, wind:10, gust:18}, uv:2, hour: (h) => (h >= 11 && h <= 13 ? {wind:30, gust:100, code:3, p:10} : {code:2, p:5})})},
  r => lab(r.wear).some(l => ['Rüzgârlık','İnce ceket','Mont','Kaban'].includes(l)));
check('important', '4 mm/h for six hours at 24° (heavy-rain warning): raincoat and waterproof shoes', {fix:H.fx({cur:{app:24, code:63, precip:4, wind:10, gust:18}, uv:2, hour: (h) => (h >= 9 && h <= 15 ? {code:63, p:90, mm:4} : {code:3, p:20, mm:0})}), hour:9},
  r => lab(r.wear).includes('İnce yağmurluk') && lab(r.wear).includes('Su geçirmez ayakkabı') && /Kuvvetli yağmur/.test(r.head));
check('minor', 'Drizzle code with no amount is drizzle, not full rain gear', {fix:rainFx(12, 51, 0)},
  r => r.pills.some(p => /Çisel/.test(p)) && !lab(r.wear).includes('Su geçirmez ayakkabı'));
check('minor', 'Rain at 0.3° (ice warning): non-slip boots and the ice pill', {fix:H.fx({cur:{app:-3, t:0.3, code:61, precip:0.8, wind:10, gust:18}, uv:1, hour: () => ({app:-3, t:0.3, code:61, p:90, mm:0.8})})},
  r => lab(r.wear).includes('Kaymaz bot') && r.pills.includes('Buzlanma'));
check('minor', 'Thunder pill says thunder, not storm', {fix:rainFx(20, 95, 3)},
  r => r.pills.includes('Gök gürültüsü') && !r.pills.includes('Fırtına'));
check('minor', '22° now, 4° tonight: a coat and a warm layer to take along', {fix:H.fx({cur:{app:22, code:1}, uv:3, hour: (h) => ({app: h <= 12 ? 22 : Math.max(4, 22 - (h - 12) * 3), code:1, p:5})}), prefs:{hours:12}, hour:12},
  r => r.take.some(t => ['Kaban','Mont','Şişme mont','Parka'].includes(t.label)) && r.take.some(t => ['Kazak','Sweatshirt','Hırka'].includes(t.label)));
check('questionable', 'No windbreaker / "close your collar" at 28° in a T-shirt', {fix:H.fx({cur:{app:28, code:2, wind:35, gust:55, dir:30}, uv:6, hour: () => ({wind:35, code:2, p:5})}), hour:13},
  r => !lab(r.take).includes('Rüzgârlık') && !r.tips.some(t => /yakanı kapat/.test(t)));

(async () => {
  const app = await H.open({hour:9});
  await app.load(H.fx({cur:{app:15}}));
  let fails = 0;
  for (const c of C) {
    await app.setHour(c.setup.hour == null ? 9 : c.setup.hour);
    await app.prefs(Object.assign({hours:6, feel:'normal', act:'city'}, c.setup.prefs || {}));
    await app.weather(c.setup.fix);
    const r = await app.read(), ok = c.pred(r);
    if (!ok) fails++;
    console.log(`${ok ? 'PASS' : 'FAIL'} [${c.sev}] ${c.name}${ok ? '' : '\n     got: ' + H.brief(r) + ' | ' + r.feels}`);
  }
  if (app.errors.length) { console.log('PAGE ERRORS', app.errors); fails++; }
  await app.close();
  console.log(`${C.length - fails}/${C.length} pass`);
  process.exit(fails);
})().catch(e => { console.error('FAIL', e); process.exit(99); });
