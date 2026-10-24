// MET Norway symbol_code -> the WMO weather codes the Ne Giysem? client understands, plus the precipitation
// probability rule used when MET gives no probability_of_precipitation.
//
// Symbols (https://api.met.no/weatherapi/weathericon/2.0/documentation): clearsky, fair, partlycloudy, cloudy, fog and
// [light|heavy]{rain|sleet|snow}[showers][andthunder], each optionally suffixed _day/_night/_polartwilight.
// MET itself spells two of them "lightssleetshowersandthunder" and "lightssnowshowersandthunder"; the parser accepts both.

const SKY = { clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45 };
const PRECIP = /^(light|heavy)?s?(rain|sleet|snow)(showers)?$/;

/**
 * WMO code for a MET symbol, or null for an unknown symbol.
 *   rain:        61/63/65 (light/normal/heavy), showers 80/81/82
 *   sleet:       like rain (61/63/65, showers 80/81/82); at an air temperature <= 0.5 °C freezing rain 66 (67 when heavy)
 *   snow:        71/73/75, showers 85 (86 when heavy)
 *   ...andthunder: 95 for rain, 96 for sleet or snow
 */
export function wmoFromSymbol(symbol, airTemp) {
  if (typeof symbol !== "string" || !symbol) return null;
  let s = symbol.toLowerCase().replace(/_(day|night|polartwilight)$/, "");
  if (s in SKY) return SKY[s];
  const thunder = s.endsWith("andthunder");
  if (thunder) s = s.slice(0, -"andthunder".length);
  const m = PRECIP.exec(s);
  if (!m) return null;
  const level = m[1] === "light" ? 0 : m[1] === "heavy" ? 2 : 1;
  const kind = m[2], showers = !!m[3];
  if (thunder) return kind === "rain" ? 95 : 96;
  if (kind === "snow") return showers ? (level === 2 ? 86 : 85) : [71, 73, 75][level];
  if (kind === "sleet" && typeof airTemp === "number" && airTemp <= 0.5) return level === 2 ? 67 : 66;
  return showers ? [80, 81, 82][level] : [61, 63, 65][level];
}

/** Fallback when no symbol covers an hour at all: precipitation first, otherwise cloud cover. */
export function wmoFromCloud(cloud, precipMm, airTemp) {
  if (typeof precipMm === "number" && precipMm >= 0.1) return typeof airTemp === "number" && airTemp <= 0.5 ? 71 : 61;
  if (typeof cloud !== "number") return 3;
  return cloud < 12.5 ? 0 : cloud < 37.5 ? 1 : cloud < 75 ? 2 : 3;
}

export const isPrecipSymbol = (symbol) => typeof symbol === "string" && /rain|sleet|snow/.test(symbol);

/**
 * precipitation_probability (0-100) for one hour.
 * MET's probability_of_precipitation of the block covering the hour (1 h, else 6 h, else 12 h) is used as given.
 * MET leaves it out for some areas and blocks; then it is derived from the block's expected precipitation and symbol:
 *   >= 0.5 mm -> 80, > 0 mm -> 60, a rain/sleet/snow symbol with 0 mm (or no amount) -> 40, otherwise 0.
 * The amount is the whole block's (1 h or 6 h), the same span MET's own probability refers to.
 */
export function precipProbability(pop, blockAmount, symbol) {
  if (typeof pop === "number" && Number.isFinite(pop)) return Math.max(0, Math.min(100, Math.round(pop)));
  if (typeof blockAmount === "number" && blockAmount >= 0.5) return 80;
  if (typeof blockAmount === "number" && blockAmount > 0) return 60;
  return isPrecipSymbol(symbol) ? 40 : 0;
}
