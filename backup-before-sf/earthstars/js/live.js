/* Turns backend data into the map: real challenges (air monitors reporting worse than "Good", heat from
 * OpenWeather) and real green spaces (OpenStreetMap). Also renders the live conditions bar and today's tips.
 * Nothing here is invented: readings older than STALE_HOURS are shown with their date and never become challenges. */
window.ES = window.ES || {};

ES.live = (() => {
  const { esc } = ES.panels;
  const MAX_PLACE_KM = 25;      // drop search hits from another city with the same name
  const GOOD_AQI = 50;          // US EPA: 0–50 is "Good"; above that is worth acting on
  const HEAT_C = 30;
  const STALE_HOURS = 24;
  const DUPLICATE_M = 60;

  const AQI_LEVELS = [
    [50, 'Good', '#5be37d'], [100, 'Moderate', '#ffd36b'], [150, 'Unhealthy for sensitive groups', '#ff9f43'],
    [200, 'Unhealthy', '#ff6b5a'], [300, 'Very unhealthy', '#c48bff'], [Infinity, 'Hazardous', '#e0475b'],
  ];
  const aqiLevel = (aqi) => { const [, label, color] = AQI_LEVELS.find(([max]) => aqi <= max); return { label, color }; };
  const WEATHER_ICONS = { Clear: '☀️', Clouds: '☁️', Rain: '🌧️', Drizzle: '🌦️', Thunderstorm: '⛈️', Snow: '❄️', Mist: '🌫️', Fog: '🌫️', Haze: '🌫️', Smoke: '🌫️' };

  const ageHours = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 3.6e6 : Infinity);
  const isFresh = (iso) => ageHours(iso) <= STALE_HOURS;
  const shortDate = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'unknown date');
  function ago(iso) {
    const h = ageHours(iso);
    if (!Number.isFinite(h)) return 'time unknown';
    if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
    if (h < 48) return `${Math.round(h)} h ago`;
    return shortDate(iso);
  }

  // ---------- geometry: real lat/lng → the engine's 1200×720 design space ----------
  function toDesign(point, city) {
    const nearest = ES.HOODS_BASE
      .map((h) => ({ h, d: ES.distKm(city.hoods[h.id], point) }))
      .sort((a, b) => a.d - b.d)[0];
    const anchor = city.hoods[nearest.h.id];
    const dx = (point.lng - anchor.lng) * 111320 * Math.cos((anchor.lat * Math.PI) / 180);
    const dy = (point.lat - anchor.lat) * 111320;
    return { hood: nearest.h.id, x: Math.round(nearest.h.x + dx / city.metersPerUnit), y: Math.round(nearest.h.y - dy / city.metersPerUnit) };
  }
  const placed = (city, position, fields) => ES.makeStar({ ...fields, ...toDesign(position, city), lat: position.lat, lng: position.lng });

  const stationLabel = (name) => name.split(',')[0].trim().slice(0, 60) || 'Air monitor';

  function airChallenges(data, city) {
    const fromNetwork = data.stations.map((s) => ({ ...s, url: s.uid ? `https://aqicn.org/station/@${s.uid}/` : '' }));
    const env = data.env;
    const fallback = !fromNetwork.length && env && env.position && env.aqi !== null
      ? [{ uid: null, name: env.station, aqi: env.aqi, updated: env.updated, position: env.position, url: env.stationUrl }]
      : [];
    return [...fromNetwork, ...fallback]
      .filter((s) => s.aqi > GOOD_AQI && isFresh(s.updated) && ES.distKm(city, s.position) <= MAX_PLACE_KM)
      .map((s, i) => {
        const lvl = aqiLevel(s.aqi);
        return placed(city, s.position, {
          id: `aqi-${s.uid || i}`, kind: 'problem', category: 'air',
          name: `AQI ${s.aqi} · ${stationLabel(s.name)}`, needs: ['greening'],
          note: `Air-quality monitor reading: ${lvl.label.toLowerCase()} (US AQI ${s.aqi}).`,
          metrics: { aqi: s.aqi, level: lvl.label, color: lvl.color },
          source: { name: 'World Air Quality Index', url: s.url, updated: s.updated },
        });
      });
  }

  function heatChallenge(data, city) {
    const w = data.weather;
    if (!w || w.temp === null || w.temp < HEAT_C) return [];
    return [placed(city, { lat: city.lat, lng: city.lng }, {
      id: 'heat-now', kind: 'problem', category: 'heat',
      name: `Heat: ${Math.round(w.temp)}°C right now`, needs: ['greening'],
      note: `City-wide temperature from OpenWeather. Shade and planting lower street temperatures.`,
      metrics: { temp: w.temp },
      source: { name: 'OpenWeather', url: 'https://openweathermap.org/', updated: w.fetchedAt },
    })];
  }

  function greenSpaces(data, city) {
    const osm = data.greenSpaces
      .filter((g) => ES.distKm(city, g.position) <= MAX_PLACE_KM)
      .map((g) => placed(city, g.position, {
        id: `osm-${g.osmId.replace('/', '-')}`, kind: 'garden', category: 'green',
        name: g.name || `Unnamed ${g.type.toLowerCase()}`, offers: ['greening'],
        note: [g.type, g.operator ? `run by ${g.operator}` : ''].filter(Boolean).join(', '),
        metrics: { type: g.type, website: g.website },
        source: { name: 'OpenStreetMap', url: `https://www.openstreetmap.org/${g.osmId}`, updated: '' },
      }));
    const extra = data.gardens
      .filter((g) => ES.distKm(city, g.position) <= MAX_PLACE_KM)
      .filter((g) => !osm.some((o) => ES.distKm(o, g.position) * 1000 < DUPLICATE_M))
      .map((g, i) => placed(city, g.position, {
        id: `nom-${i}-${g.position.lat.toFixed(4)}`, kind: 'garden', category: 'green',
        name: g.name.split(',')[0].trim().slice(0, 60) || 'Community garden', offers: ['greening'],
        note: g.name.split(',').slice(1, 4).join(',').trim(),
        metrics: { type: 'Community garden' },
        source: { name: 'OpenStreetMap', url: `https://www.openstreetmap.org/?mlat=${g.position.lat}&mlon=${g.position.lng}#map=18/${g.position.lat}/${g.position.lng}`, updated: '' },
      }));
    return [...osm, ...extra];
  }

  /** Turn backend data into map stars for this city. Pure. */
  function toStars(data, city) {
    if (!data || !city) return [];
    return [...airChallenges(data, city), ...heatChallenge(data, city), ...greenSpaces(data, city)];
  }

  // ---------- conditions bar ----------
  const reading = (label, v) => (v === null ? '' : `<span class="reading"><small>${label}</small><b>${Math.round(v * 10) / 10}</b></span>`);

  function airBlock(data, city) {
    const fresh = data.stations.filter((s) => isFresh(s.updated) && ES.distKm(city, s.position) <= MAX_PLACE_KM);
    if (fresh.length) {
      const worst = fresh[0];
      const lvl = aqiLevel(worst.aqi);
      return `<span class="cond aqi" style="--aqi:${lvl.color}"><span class="aqi-num">${worst.aqi}</span><span><b>Worst air: ${esc(lvl.label)}</b><small>${fresh.length} monitor${fresh.length > 1 ? 's' : ''} · ${esc(stationLabel(worst.name))} · ${esc(ago(worst.updated))}</small></span></span>`;
    }
    const env = data.env;
    if (env && env.aqi !== null && isFresh(env.updated)) {
      const lvl = aqiLevel(env.aqi);
      return `<span class="cond aqi" style="--aqi:${lvl.color}"><span class="aqi-num">${env.aqi}</span><span><b>Air: ${esc(lvl.label)}</b><small>${esc(env.station)} · ${esc(ago(env.updated))}</small></span></span>`;
    }
    if (env && env.aqi !== null) {
      return `<span class="cond stale"><span class="aqi-num">${env.aqi}</span><span><b>Air reading is outdated</b><small>Last report from ${esc(env.station)}: ${esc(shortDate(env.updated))}. Not used.</small></span></span>`;
    }
    return '<span class="cond"><small>No air-quality monitor reports for this area</small></span>';
  }

  function strip(live, city, tipsOpen, counts) {
    if (!live || live.status === 'loading') {
      return `<span class="live-status loading"><i></i> Fetching live data for ${esc(city.name)}: air monitors, weather, green spaces…</span>`;
    }
    if (live.status === 'offline') {
      return '<span class="live-status off"><i></i> Live data offline. Start the backend with <code>uvicorn main:app</code>. Earthstars only shows real data, so the map stays empty without it.</span>';
    }
    const { weather, env } = live.data;
    const w = weather
      ? `<span class="cond"><span class="wx" aria-hidden="true">${WEATHER_ICONS[weather.condition] || '🌡️'}</span><span><b>${weather.temp === null ? '–' : Math.round(weather.temp)}°C</b><small>${esc(weather.condition || 'Weather')} · OpenWeather · now</small></span></span>`
      : '';
    const freshEnv = env && isFresh(env.updated);
    const readings = freshEnv ? [reading('PM2.5', env.pm25), reading('O₃', env.o3), reading('CO', env.co), reading('NO₂', env.no2)].join('') : '';
    const green = `<span class="cond"><span class="wx" aria-hidden="true">🌱</span><span><b>${counts.green} green space${counts.green === 1 ? '' : 's'}</b><small>${live.data.greenSpacesFailed ? 'OpenStreetMap partly unavailable' : 'from OpenStreetMap'}</small></span></span>`;
    const tipsBtn = freshEnv && env.tips.length
      ? `<button type="button" class="btn btn-sm ${tipsOpen ? 'btn-ghost' : 'btn-primary'} tips-btn" data-action="toggle-tips" aria-expanded="${tipsOpen}" aria-controls="live-tips">${tipsOpen ? 'Hide actions' : 'What you can do today'}</button>`
      : '';
    return `<span class="live-status on"><i></i> Live</span>${w}${airBlock(live.data, city)}<span class="readings">${readings}</span>${green}${tipsBtn}`;
  }

  /** Stable id for a tip, so commitments survive re-renders. */
  const tipId = (group, title) => `${group}:${title}`.toLowerCase().replace(/[^a-z0-9:]+/g, '-').slice(0, 90);

  function tips(live, committed) {
    const env = live && live.data && live.data.env;
    if (!env || !isFresh(env.updated) || !env.tips.length) return '';
    return `<div class="tips-head"><b>Today's actions</b><small>From the Earthstars advisor, based on ${esc(env.station)} (${esc(ago(env.updated))})</small></div>
      <div class="tips-grid">${env.tips.map((g) => `<section><h4>${esc(g.group)}</h4><ul>${g.items.map((t) => {
        const id = tipId(g.group, t.title);
        const done = committed.has(id);
        return `<li><b>${esc(t.title)}</b>${t.body ? `<span>${esc(t.body)}</span>` : ''}
          <button type="button" class="commit${done ? ' done' : ''}" data-action="commit" data-id="${esc(id)}" aria-pressed="${done}">${done ? '✓ Committed' : '＋ I\'ll do this'}</button></li>`;
      }).join('')}</ul></section>`).join('')}</div>`;
  }

  /** Look a tip up by id in the current live data (for commitments). */
  function findTip(live, id) {
    const env = live && live.data && live.data.env;
    if (!env) return null;
    for (const g of env.tips) {
      const t = g.items.find((x) => tipId(g.group, x.title) === id);
      if (t) return { id, group: g.group, title: t.title, body: t.body };
    }
    return null;
  }

  function render(live, city, tipsOpen, counts, committed) {
    document.getElementById('live-strip').innerHTML = strip(live, city, tipsOpen, counts);
    const drawer = document.getElementById('live-tips');
    const html = tipsOpen ? tips(live, committed) : '';
    drawer.hidden = !html;
    drawer.innerHTML = html;
  }

  return { toStars, render, findTip, aqiLevel, ago, isFresh };
})();
