// Hand-built MET Norway Locationforecast 2.0 "complete" responses that follow the documented schema
// (https://docs.api.met.no/doc/ForecastJSON and https://docs.api.met.no/doc/locationforecast/datamodel):
// a GeoJSON Feature; properties.meta.updated_at + units; properties.timeseries sorted by time (UTC) with
//   - hourly steps for the short range: instant + next_1_hours + next_6_hours + next_12_hours,
//   - then 6-hourly steps at 00/06/12/18 UTC: instant + next_6_hours + next_12_hours (no next_1_hours),
//   - the transition step whose next step is more than an hour away has no next_1_hours,
//   - a next_X_hours block only when X hours of data remain, the last step has only `instant`,
//   - ultraviolet_index_clear_sky, wind_speed_of_gust and fog_area_fraction only in the first ~60 hours.

export const H = 3600000;
export const iso = (ms) => new Date(ms).toISOString().replace(/\.000Z$/, "Z");
export const floorHour = (ms) => Math.floor(ms / H) * H;

export const UNITS = {
  air_pressure_at_sea_level: "hPa", air_temperature: "celsius", air_temperature_max: "celsius", air_temperature_min: "celsius",
  air_temperature_percentile_10: "celsius", air_temperature_percentile_90: "celsius", cloud_area_fraction: "%",
  cloud_area_fraction_high: "%", cloud_area_fraction_low: "%", cloud_area_fraction_medium: "%", dew_point_temperature: "celsius",
  fog_area_fraction: "%", precipitation_amount: "mm", precipitation_amount_max: "mm", precipitation_amount_min: "mm",
  probability_of_precipitation: "%", probability_of_thunder: "%", relative_humidity: "%", ultraviolet_index_clear_sky: "1",
  wind_from_direction: "degrees", wind_speed: "m/s", wind_speed_of_gust: "m/s", wind_speed_percentile_10: "m/s",
  wind_speed_percentile_90: "m/s",
};

const r1 = (v) => Math.round(v * 10) / 10;

/** Times of a MET series: hourly from `first` to `hourlyUntil`, then 6-hourly (00/06/12/18 UTC) up to `last`. */
export function stepTimes(first, hourlyUntil, last) {
  const out = [];
  for (let t = first; t <= hourlyUntil; t += H) out.push(t);
  let t = Math.ceil((hourlyUntil + H) / (6 * H)) * 6 * H;
  for (; t <= last; t += 6 * H) out.push(t);
  return out;
}

/**
 * opts:
 *   lat, lon, alt, first, hourlyUntil, last (UTC ms)
 *   temp(t), rh(t), wind(t) [m/s], dir(t), cloud(t), uv(t)            instant values
 *   gust: true -> wind_speed_of_gust in the short range (1.6 × wind unless gustOf(t) is given)
 *   sym(t, hours) -> symbol_code, precip(t, hours) -> mm              period values
 *   pop: {h1, h6, h12}: false (left out), true (derived from precip) or a function (t, hours) -> %
 */
export function metComplete(opts) {
  const times = stepTimes(opts.first, opts.hourlyUntil, opts.last);
  const shortRangeEnd = opts.first + 60 * H;
  const last = times[times.length - 1];
  const popOf = (key, t, hours, mm) => {
    const p = opts.pop && opts.pop[key];
    if (!p) return undefined;
    if (typeof p === "function") return p(t, hours);
    return mm >= 1 ? 90 : mm > 0 ? 55 : 3.1;
  };
  const block = (t, hours, key) => {
    const mm = r1(opts.precip(t, hours));
    const details = {};
    if (hours === 6) {
      const temps = [0, 1, 2, 3, 4, 5, 6].map((k) => opts.temp(t + k * H));
      details.air_temperature_max = r1(Math.max(...temps));
      details.air_temperature_min = r1(Math.min(...temps));
    }
    if (hours !== 12) {
      details.precipitation_amount = mm;
      details.precipitation_amount_max = r1(mm * 1.8);
      details.precipitation_amount_min = r1(mm * 0.4);
    }
    const pop = popOf(key, t, hours, mm);
    if (pop !== undefined) details.probability_of_precipitation = pop;
    if (hours === 1 && pop !== undefined) details.probability_of_thunder = /thunder/.test(opts.sym(t, 1)) ? 40.2 : 0;
    const summary = { symbol_code: opts.sym(t, hours) };
    if (hours === 12) summary.symbol_confidence = "somewhat certain";
    return { summary, details };
  };

  const timeseries = times.map((t, i) => {
    const T = r1(opts.temp(t)), ws = r1(opts.wind(t)), short = t < shortRangeEnd;
    const instant = {
      air_pressure_at_sea_level: 1016.4,
      air_temperature: T,
      air_temperature_percentile_10: r1(T - 0.8),
      air_temperature_percentile_90: r1(T + 0.9),
      cloud_area_fraction: r1(opts.cloud(t)),
      cloud_area_fraction_high: 12.5,
      cloud_area_fraction_low: r1(opts.cloud(t) * 0.6),
      cloud_area_fraction_medium: 3.9,
      dew_point_temperature: r1(T - 4.2),
      relative_humidity: r1(opts.rh(t)),
      wind_from_direction: r1(opts.dir(t)),
      wind_speed: ws,
      wind_speed_percentile_10: r1(ws * 0.7),
      wind_speed_percentile_90: r1(ws * 1.3),
    };
    if (short) {
      instant.fog_area_fraction = 0;
      instant.ultraviolet_index_clear_sky = r1(opts.uv(t));
      if (opts.gust) instant.wind_speed_of_gust = r1(opts.gustOf ? opts.gustOf(t) : ws * 1.6);
    }
    const data = { instant: { details: instant } };
    const next = times[i + 1];
    if (t + 12 * H <= last) data.next_12_hours = block(t, 12, "h12");
    if (next === t + H) data.next_1_hours = block(t, 1, "h1");
    if (t + 6 * H <= last) data.next_6_hours = block(t, 6, "h6");
    return { time: iso(t), data };
  });

  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [opts.lon, opts.lat, opts.alt] },
    properties: { meta: { updated_at: iso(opts.first - 40 * 60000 + 13000), units: UNITS }, timeseries },
  };
}

/** Day/night suffix the way MET does it (here from a rough local solar hour). */
export function dn(base, t, lon) {
  const solarHour = (((t / H + lon / 15) % 24) + 24) % 24;
  return `${base}_${solarHour >= 7 && solarHour < 17.5 ? "day" : "night"}`;
}

const diurnal = (t, lon, peakHour = 14.5) => Math.cos((2 * Math.PI * (((t / H + lon / 15) % 24) - peakHour)) / 24);
const uvCurve = (t, lon, peak) => {
  const s = (((t / H + lon / 15) % 24) + 24) % 24;
  return s > 6.5 && s < 17.5 ? peak * Math.sin((Math.PI * (s - 6.5)) / 11) : 0;
};

/**
 * İstanbul (41.01, 28.98), Europe/Istanbul. Without probability_of_precipitation anywhere (derived rule), with gusts.
 * `special` holds the hand-picked periods the tests check: {iso time: {sym, mm}} for 1-hour blocks and 6-hour blocks.
 */
export const ISTANBUL_SPECIAL_1H = {
  "2026-10-24T13:00:00Z": { sym: "lightrain", mm: 0.3 },
  "2026-10-24T14:00:00Z": { sym: "rain", mm: 1.2 },
  "2026-10-24T15:00:00Z": { sym: "lightrain", mm: 0 },
  "2026-10-25T12:00:00Z": { sym: "rainshowersandthunder_day", mm: 2 },
  "2026-10-26T06:00:00Z": { sym: "fog", mm: 0 },
};
export const ISTANBUL_SPECIAL_6H = {
  "2026-10-26T20:00:00Z": { sym: "lightrain", mm: 0.6 },
  "2026-10-27T12:00:00Z": { sym: "heavyrainshowers_day", mm: 6 },
  "2026-10-28T00:00:00Z": { sym: "clearsky_night", mm: 0 },
};

export function istanbul({ first, hourlyUntil, last } = {}) {
  const lon = 28.98;
  first = first ?? Date.parse("2026-10-24T09:00:00Z");
  hourlyUntil = hourlyUntil ?? first + 59 * H; // 2026-10-26T20:00Z: the transition step (next step 4 h later)
  last = last ?? first + 9 * 24 * H + 21 * H;
  return metComplete({
    lat: 41.01, lon, alt: 39, first, hourlyUntil, last,
    temp: (t) => 16 + 4 * diurnal(t, lon) - ((t - first) / H) * 0.02,
    rh: (t) => 72 - 14 * diurnal(t, lon),
    wind: (t) => 4.2 + 1.8 * diurnal(t, lon, 13),
    // Poyraz from the north-east, swinging across north (350° <-> 10°) in the 6-hourly part.
    dir: (t) => (t > hourlyUntil ? ((t / H) % 12 === 0 ? 350 : 10) : 40),
    cloud: (t) => 45 + 30 * Math.sin(t / (7 * H)),
    uv: (t) => uvCurve(t, lon, 3.6),
    gust: true,
    sym: (t, hours) => {
      const sp = (hours === 1 ? ISTANBUL_SPECIAL_1H : hours === 6 ? ISTANBUL_SPECIAL_6H : {})[iso(t)];
      return sp ? sp.sym : hours === 12 ? "partlycloudy_day" : dn("partlycloudy", t, lon);
    },
    precip: (t, hours) => {
      const sp = (hours === 1 ? ISTANBUL_SPECIAL_1H : hours === 6 ? ISTANBUL_SPECIAL_6H : {})[iso(t)];
      return sp ? sp.mm : 0;
    },
    pop: { h1: false, h6: false, h12: false },
  });
}

/**
 * Berlin (52.52, 13.41), Europe/Berlin: DST ends 2026-10-25 01:00 UTC (CEST +2 -> CET +1).
 * Cold, with probability_of_precipitation in every block, no gusts (-> 1.5 × wind), sleet/snow/thunder symbols.
 */
export const BERLIN_SPECIAL_1H = {
  "2026-10-24T12:00:00Z": { sym: "sleet", mm: 0.4, T: 0.3, pop: 61.7 }, // <= 0.5 °C -> freezing rain 66
  "2026-10-24T13:00:00Z": { sym: "heavysleet", mm: 2.1, T: 2.0, pop: 88.3 }, // warmer -> heavy rain 65
  "2026-10-24T14:00:00Z": { sym: "heavysleet", mm: 2.4, T: 0.0, pop: 90 }, // -> heavy freezing rain 67
  "2026-10-24T15:00:00Z": { sym: "lightsnowshowers_day", mm: 0.2, T: -0.5, pop: 35.2 }, // -> 85
  "2026-10-25T10:00:00Z": { sym: "snowandthunder", mm: 1.5, T: -1, pop: 70 }, // -> 96
  "2026-10-25T11:00:00Z": { sym: "lightssleetshowersandthunder_day", mm: 0.5, T: 1, pop: 50 }, // MET's spelling -> 96
};
export const BERLIN_SPECIAL_6H = {
  "2026-10-27T06:00:00Z": { sym: "heavysnow", mm: 9, pop: 96.4 }, // -> 75
};

export function berlin({ first, hourlyUntil, last } = {}) {
  const lon = 13.41;
  first = first ?? Date.parse("2026-10-24T09:00:00Z");
  hourlyUntil = hourlyUntil ?? first + 59 * H;
  last = last ?? first + 9 * 24 * H + 21 * H;
  const sp1 = (t) => BERLIN_SPECIAL_1H[iso(t)];
  return metComplete({
    lat: 52.52, lon, alt: 41, first, hourlyUntil, last,
    temp: (t) => (sp1(t) && sp1(t).T != null ? sp1(t).T : 3 + 3 * diurnal(t, lon)),
    rh: (t) => 84 - 8 * diurnal(t, lon),
    wind: (t) => 5.5 + 2 * diurnal(t, lon, 13),
    dir: () => 250,
    cloud: (t) => 70 + 25 * Math.sin(t / (9 * H)),
    uv: (t) => uvCurve(t, lon, 1.4),
    gust: false,
    sym: (t, hours) => {
      const sp = hours === 1 ? sp1(t) : hours === 6 ? BERLIN_SPECIAL_6H[iso(t)] : null;
      return sp ? sp.sym : hours === 12 ? "cloudy" : "cloudy";
    },
    precip: (t, hours) => {
      const sp = hours === 1 ? sp1(t) : hours === 6 ? BERLIN_SPECIAL_6H[iso(t)] : null;
      return sp ? sp.mm : 0;
    },
    pop: {
      h1: (t) => (sp1(t) ? sp1(t).pop : 4.6),
      h6: (t) => (BERLIN_SPECIAL_6H[iso(t)] ? BERLIN_SPECIAL_6H[iso(t)].pop : 12.3),
      h12: () => 20.1,
    },
  });
}
