/* Client for the Earthstars FastAPI backend (main.py). Everything the map shows comes through here.
 * Base URL: ?api=... in the page URL (remembered), else http://127.0.0.1:8000. */
window.ES = window.ES || {};

ES.backend = (() => {
  const DEFAULT_BASE = 'http://127.0.0.1:8000';
  const TIMEOUT_MS = 45000; // Overpass (green spaces) can take a while on first request
  const AIR_RADIUS_KM = 12;
  const GREEN_RADIUS_KM = 6;

  function resolveBase() {
    try {
      const fromQuery = new URLSearchParams(window.location.search).get('api');
      if (fromQuery && /^https?:\/\//.test(fromQuery)) localStorage.setItem('earthstars:api', fromQuery);
      const saved = localStorage.getItem('earthstars:api');
      return ((saved && /^https?:\/\//.test(saved)) ? saved : DEFAULT_BASE).replace(/\/+$/, '');
    } catch (err) {
      return DEFAULT_BASE;
    }
  }
  const BASE = resolveBase();

  /** GET a backend path. Resolves to the JSON body; rejects on network/HTTP errors or the backend's {"ERROR": ...}. */
  async function get(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}${path}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`${path} failed (${res.status})`);
      const body = await res.json();
      if (!body || typeof body !== 'object') throw new Error(`${path}: unexpected response`);
      if (body.ERROR) throw new Error(String(body.ERROR));
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const text = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const httpsUrl = (v) => (typeof v === 'string' && /^https?:\/\/[^\s"'<>]+$/.test(v) ? v : '');
  const isoOrEmpty = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : '');
  const coord = (lat, lng) => {
    const a = typeof lat === 'string' ? parseFloat(lat) : lat;
    const b = typeof lng === 'string' ? parseFloat(lng) : lng;
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : null;
  };

  function parseWeather(body) {
    const w = body['Weather Information'] || {};
    return { city: text(w['City Name'], 60), condition: text(w.Weather, 30), temp: num(w.Temperature), wind: num(w['Wind Speed']), fetchedAt: new Date().toISOString() };
  }

  /** The advisor returns "Title: description., Title: description." — split it back into separate tips. */
  function splitTips(raw) {
    if (typeof raw !== 'string' || /^No .* data available\.?$/.test(raw)) return [];
    const clean = raw
      .replace(/\$\s*\\?\t?ext\{([^}]*)\}_\{([^}]*)\}\s*\$/g, '$1$2') // "$\text{PM}_{2.5}$" → "PM2.5"
      .replace(/\$([^$]*)\$/g, '$1')
      .replace(/\s+/g, ' ');
    return clean.split(/,\s+(?=[A-Z0-9][^:,]{2,70}:)/)
      .map((t) => {
        const i = t.indexOf(':');
        return i > 0 ? { title: text(t.slice(0, i), 80), body: text(t.slice(i + 1), 300) } : { title: text(t, 80), body: '' };
      })
      .filter((t) => t.title);
  }

  function parseEnvironment(body) {
    const e = body['Environmental Information'] || {};
    const a = body['Action Recommendations'] || {};
    const geo = Array.isArray(e['Station Coordinates']) ? coord(e['Station Coordinates'][0], e['Station Coordinates'][1]) : null;
    return {
      station: text(e['City Name'], 80),
      stationUrl: httpsUrl(e['Station URL']),
      position: geo,
      updated: isoOrEmpty(e.Updated),
      aqi: num(e['Air Quality']),
      dominant: text(e['Dominant Pollutant'], 12),
      pm25: num(e['PM2.5 Level']), o3: num(e.Ozone), co: num(e['Carbon Monoxide']), no2: num(e['Nitrogen Dioxide']),
      tips: [
        ['Air quality', a['Air Quality Actions']], ['PM2.5', a['PM2.5 Actions']], ['Ozone', a['Ozone Actions']],
        ['Carbon monoxide', a['Carbon Monoxide Actions']], ['Nitrogen dioxide', a['Nitrogen Dioxide Actions']],
      ].map(([group, raw]) => ({ group, items: splitTips(raw) })).filter((g) => g.items.length),
    };
  }

  function parseStations(body) {
    const list = Array.isArray(body.Stations) ? body.Stations : [];
    return list.map((s) => ({
      uid: Number.isInteger(s['Station ID']) ? s['Station ID'] : null,
      name: text(s.Name, 120),
      aqi: num(s['Air Quality']),
      updated: isoOrEmpty(s.Updated),
      position: coord(s.Latitude, s.Longitude),
    })).filter((s) => s.position && s.aqi !== null && s.name);
  }

  function parseGreenSpaces(body) {
    const list = Array.isArray(body['Green Spaces']) ? body['Green Spaces'] : [];
    return list.map((g) => ({
      osmId: /^(node|way|relation)\/\d+$/.test(g['OSM ID']) ? g['OSM ID'] : '',
      name: text(g.Name, 80),
      type: g.Type === 'Allotments' ? 'Allotments' : 'Community garden',
      operator: text(g.Operator, 80),
      website: httpsUrl(g.Website),
      position: coord(g.Latitude, g.Longitude),
    })).filter((g) => g.position && g.osmId);
  }

  function parseGardens(body) {
    const list = Array.isArray(body.Gardens) ? body.Gardens : [];
    return list.map((g) => ({ name: text(g.Name, 200), position: coord(g.Latitude, g.Longitude) })).filter((g) => g.name && g.position);
  }

  /** A failed fetch() (server not running) is a TypeError; anything else means the backend answered. */
  const reachedServer = (r) => r.status === 'fulfilled' || !(r.reason instanceof TypeError || (r.reason && r.reason.name === 'AbortError'));
  const value = (r, parse, fallback) => (r.status === 'fulfilled' ? parse(r.value) : fallback);

  /** Fetch everything for a city in parallel. Each part settles independently so one failure doesn't hide the rest. */
  async function loadCity(city) {
    const name = encodeURIComponent(city.name);
    const at = `lat=${city.lat.toFixed(4)}&lng=${city.lng.toFixed(4)}`;
    const results = await Promise.allSettled([
      get(`/api/weather/${name}`),
      get(`/api/environment/${name}`),
      get(`/api/air-stations?${at}&radius_km=${AIR_RADIUS_KM}&city=${name}`),
      get(`/api/green-spaces?${at}&radius_km=${GREEN_RADIUS_KM}`),
      get(`/api/gardens/${name}`),
    ]);
    const [w, e, s, g, n] = results;
    return {
      connected: results.some(reachedServer),
      weather: value(w, parseWeather, null),
      env: value(e, parseEnvironment, null),
      stations: value(s, parseStations, []),
      greenSpaces: value(g, parseGreenSpaces, []),
      greenSpacesFailed: g.status === 'rejected',
      gardens: value(n, parseGardens, []),
      fetchedAt: new Date().toISOString(),
    };
  }

  return { loadCity, BASE };
})();
