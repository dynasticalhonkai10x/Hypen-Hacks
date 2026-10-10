/* Worldwide place lookups, both free and key-less:
 *  - search(): city search via Open-Meteo's geocoding API (every country, with population for ranking)
 *  - nameHoods(): real district names via OpenStreetMap Nominatim reverse geocoding (max 1 request/second
 *    per their usage policy; results are cached in localStorage so each city is looked up only once). */
window.ES = window.ES || {};

ES.geo = (() => {
  const SEARCH_URL = 'https://geocoding-api.open-meteo.com/v1/search';
  const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
  const NAME_CACHE_KEY = 'earthstars:hoodnames';
  const NOMINATIM_GAP_MS = 1100;
  const MAX_NAME_LENGTH = 40;
  const ADMIN_SUFFIX = /\s+(ward|division|sub-?county|municipality|district|constituency)$/i;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const cleanText = (v, max = 80) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  /** Search cities anywhere on Earth. Throws on network/HTTP failure so the UI can say so. */
  async function search(query, signal) {
    const q = cleanText(query, 60);
    if (q.length < 2) return [];
    const url = `${SEARCH_URL}?name=${encodeURIComponent(q)}&count=8&language=en&format=json`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`City search failed (${res.status})`);
    const data = await res.json();
    return (Array.isArray(data.results) ? data.results : [])
      .filter((r) => r && isNum(r.latitude) && isNum(r.longitude) && cleanText(r.name))
      .map((r) => ({
        name: cleanText(r.name, 60), country: cleanText(r.country, 60), cc: cleanText(r.country_code, 2).toUpperCase(),
        region: cleanText(r.admin1, 60), population: isNum(r.population) ? r.population : 0,
        lat: r.latitude, lng: r.longitude,
      }));
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(NAME_CACHE_KEY) || '{}') || {}; } catch (err) { return {}; }
  }
  function writeCache(cache) {
    try { localStorage.setItem(NAME_CACHE_KEY, JSON.stringify(cache)); } catch (err) { /* storage blocked: names re-fetched next time */ }
  }

  async function reverseName(lat, lng) {
    const url = `${REVERSE_URL}?format=jsonv2&lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&zoom=14&accept-language=en`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Reverse geocode failed (${res.status})`);
    const data = await res.json();
    const a = data.address || {};
    const raw = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.borough || a.district || a.town || a.village || '';
    return cleanText(String(raw).replace(ADMIN_SUFFIX, ''), MAX_NAME_LENGTH);
  }

  /** Cached real names for a city, or null. Only plain strings survive (the cache is untrusted input). */
  function cachedNames(cityId) {
    const hit = readCache()[cityId];
    if (!hit || typeof hit !== 'object') return null;
    return Object.fromEntries(Object.entries(hit).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, cleanText(v, MAX_NAME_LENGTH)]));
  }

  /** Resolve real neighbourhood names for a generated city. Calls onDone(names) once; names may be partial. */
  async function nameHoods(city, onDone) {
    const cached = cachedNames(city.id);
    if (cached) { onDone(cached); return; }
    const names = {};
    const used = new Set([city.name.toLowerCase()]);
    for (const [hoodId, hood] of Object.entries(city.hoods)) {
      try {
        const n = await reverseName(hood.lat, hood.lng);
        if (n && !used.has(n.toLowerCase())) { names[hoodId] = n; used.add(n.toLowerCase()); }
      } catch (err) {
        break; // offline or rate-limited: keep the directional names
      }
      await wait(NOMINATIM_GAP_MS);
    }
    if (Object.keys(names).length) writeCache({ ...readCache(), [city.id]: names });
    onDone(names);
  }

  return { search, nameHoods, cachedNames };
})();
