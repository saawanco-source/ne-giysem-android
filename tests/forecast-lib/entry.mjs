// The server's forecast builder (MET Norway -> Open-Meteo shape), for the app to use on its own when the app's server
// can't be reached (e.g. pages.dev blocked by the network). Bundled by build.mjs into web/forecast-lib.js.
import { normalizeMet, metUrl } from "../../web/functions/_lib/met.js";
import { buildForecast } from "../../web/functions/_lib/openmeteo.js";
import { round } from "../../web/functions/_lib/http.js";

globalThis.NGForecast = {
  version: 1,
  /** MET's address for a coordinate, rounded like the server (2 decimals, ~1 km). */
  metUrl: (lat, lon) => metUrl(round(lat, 2), round(lon, 2)),
  /** MET Locationforecast "complete" JSON -> the same forecast object /api/forecast answers for (lat, lon). */
  fromMet: (json, lat, lon, now) => buildForecast(normalizeMet(json), round(lat, 2), round(lon, 2), now == null ? Date.now() : now),
};
