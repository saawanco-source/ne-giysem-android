// Sun position after the NOAA Solar Calculator equations (https://gml.noaa.gov/grad/solcalc/calcdetails.html):
// elevation for is_day, sunset per local day, and a clear-sky UV estimate where MET has no UV forecast.
// Accurate to about a minute for sunset between the polar circles, which is plenty here; no API call needed.

const RAD = Math.PI / 180;
const MIN = 60000;
const mod = (a, n) => ((a % n) + n) % n;

/** Declination (radians) and equation of time (minutes) at an instant. Both change slowly (well under a degree and
 *  half a minute per day), so callers may compute them once per day and pass them to the functions below. */
export function sun(ms) {
  const T = (ms / 86400000 + 2440587.5 - 2451545) / 36525; // Julian centuries since J2000.0
  const L0 = mod(280.46646 + T * (36000.76983 + 0.0003032 * T), 360); // geometric mean longitude
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T); // geometric mean anomaly
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T); // orbit eccentricity
  const C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * RAD) * 0.000289; // equation of centre
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD); // apparent longitude
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD); // corrected obliquity
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eqTime = (4 / RAD) * (y * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD) +
    4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) - 0.5 * y * y * Math.sin(4 * L0 * RAD) -
    1.25 * e * e * Math.sin(2 * M * RAD));
  return { decl, eqTime };
}

/** Hour angle in degrees, -180..180 (0 = solar noon). */
function hourAngle(ms, lon, eqTime) {
  const trueSolarMin = mod(mod(ms, 86400000) / MIN + eqTime + 4 * lon, 1440);
  return trueSolarMin / 4 - 180;
}

/** Geometric solar elevation in degrees (no refraction; compare with -0.833 for "sun above the horizon"). */
export function solarElevation(ms, lat, lon, params) {
  const { decl, eqTime } = params || sun(ms);
  const phi = lat * RAD, ha = hourAngle(ms, lon, eqTime) * RAD;
  const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  return 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) / RAD;
}

export const SUNRISE_SET_ELEVATION = -0.833; // refraction plus the sun's radius
export const isDayAt = (ms, lat, lon, params) => (solarElevation(ms, lat, lon, params) > SUNRISE_SET_ELEVATION ? 1 : 0);

/** UTC ms of the solar noon nearest to ms. */
export function solarNoon(ms, lon) {
  let t = ms;
  for (let k = 0; k < 2; k++) t -= hourAngle(t, lon, sun(t).eqTime) * 4 * MIN;
  return t;
}

/** UTC ms of the sunset following the solar noon nearest to `aroundMs` (pass local noon), or null in polar day/night. */
export function sunsetAfterNoon(aroundMs, lat, lon) {
  const noon = solarNoon(aroundMs, lon), phi = lat * RAD;
  let t = noon + 6 * 3600000;
  for (let k = 0; k < 3; k++) {
    const { decl } = sun(t);
    const cosH = (Math.cos(90.833 * RAD) - Math.sin(phi) * Math.sin(decl)) / (Math.cos(phi) * Math.cos(decl));
    if (!(cosH >= -1 && cosH <= 1)) return null;
    t = noon + (Math.acos(cosH) / RAD) * 4 * MIN;
  }
  return t;
}

/**
 * Clear-sky UV index from the sun's elevation, UVI ≈ 12.5·μ0^2.42 with μ0 the cosine of the zenith angle
 * (Allaart et al. 2004, Meteorol. Appl. 11; about 300 DU of ozone). Used only for hours MET gives no UV for.
 */
export function clearSkyUvEstimate(elevationDeg) {
  if (!(elevationDeg > 0)) return 0;
  return 12.5 * Math.sin(elevationDeg * RAD) ** 2.42;
}
