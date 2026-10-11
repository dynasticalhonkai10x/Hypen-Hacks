/* Earthstars · San Francisco: live climate conditions, every community garden on one map, and what to do today.
(() => {
  // Served by the backend (cloud or local uvicorn): call that same origin. Opened as a file: use a local backend.
  const SERVED_BY_BACKEND = /^https?:$/.test(window.location.protocol);
  const DEFAULT_API = SERVED_BY_BACKEND ? window.location.origin : 'http://127.0.0.1:8000';
  const SF_BOUNDS = [[37.7080, -122.5149], [37.8324, -122.3570]];
  const TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
  const LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}';
  const TIMEOUT_MS = 45000;
  const GARDEN_WORDS = /\b(garden|plant|compost|tree|soil|seed|native|shrub|hedge|mulch|pollinator)/i;
  const AQI_BANDS = [[50, 'Good', '#5be37d'], [100, 'Moderate', '#ffd36b'], [150, 'Unhealthy for sensitive groups', '#ff9f43'],
    [200, 'Unhealthy', '#ff6b5a'], [300, 'Very unhealthy', '#c48bff'], [Infinity, 'Hazardous', '#e0475b']];
  const STAR_SVG = `<svg viewBox="-17 -17 34 34" aria-hidden="true"><circle class="halo" r="10"/>
    <path class="rays" d="M0,-15 L1,-1 L15,0 L1,1 L0,15 L-1,1 L-15,0 L-1,-1 Z"/><circle class="core" r="1.8"/></svg>`;

  const $ = (sel) => document.querySelector(sel);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (v) => (typeof v === 'string' && /^https?:\/\/[^\s"'<>]+$/.test(v) ? v : '');
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const aqiBand = (aqi) => { const [, label, color] = AQI_BANDS.find(([max]) => aqi <= max); return { label, color }; };

  const API = (() => {
    try {
      const fromQuery = new URLSearchParams(window.location.search).get('api');
      if (safeUrl(fromQuery)) localStorage.setItem('earthstars:api', fromQuery);
      return (safeUrl(localStorage.getItem('earthstars:api')) || DEFAULT_API).replace(/\/+$/, '');
    } catch (err) {
      return DEFAULT_API;
    }
  })();

  function ago(iso) {
    const ms = Date.now() - Date.parse(iso);
    if (!Number.isFinite(ms)) return 'time unknown';
    const min = Math.max(1, Math.round(ms / 60000));
    if (min < 60) return `${min} min ago`;
    if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /** GET a backend route; rejects on network/HTTP errors and on the backend's {"ERROR": ...}. */
  async function get(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API}${path}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`${path} failed (${res.status})`);
      const body = await res.json();
      if (!body || typeof body !== 'object' || body.ERROR) throw new Error(body && body.ERROR ? body.ERROR : 'Bad response');
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- map ----------
  const map = L.map('map', { zoomSnap: 0.25, minZoom: 11, maxBounds: L.latLngBounds(SF_BOUNDS).pad(0.4) }).fitBounds(SF_BOUNDS);
  L.tileLayer(TILES, { maxZoom: 16, attribution: 'Tiles &copy; Esri &mdash; &copy; OpenStreetMap contributors' }).addTo(map);
  L.tileLayer(LABELS, { maxZoom: 16 }).addTo(map);
  const monitorLayer = L.layerGroup().addTo(map);
  const gardenLayer = L.layerGroup().addTo(map);
  const gardenMarkers = new Map();
  let gardens = [];
  let selectedId = null;

  const gardenName = (g) => g.name; // only gardens named in OpenStreetMap are shown; we never make up a label

  function setStatus(text, cls) {
    const el = $('#status');
    el.className = `status ${cls || ''}`;
    el.innerHTML = `<i></i> ${esc(text)}`;
  }

  // ---------- conditions & suggestions ----------
  /** One cell of the conditions strip: small label, big value, optional sub-line. */
  const stat = (label, value, sub, cls = '') => `<div class="stat ${cls}"><span class="stat-label">${label}</span>
    <span class="stat-value">${value}</span>${sub ? `<span class="stat-sub">${sub}</span>` : ''}</div>`;

  function renderConditions(data) {
    const w = data.Weather;
    const a = data['Air Quality'];
    const cells = [];
    if (w) {
      const temp = num(w.Temperature);
      cells.push(stat('Temperature', `${temp === null ? '–' : Math.round(temp)}<small>°C</small>`,
        `${esc(w.Description || w.Condition)} · OpenWeather · ${esc(ago(w.Updated))}`, 'wide'));
      cells.push(stat('Wind', `${num(w['Wind Speed']) ?? '–'}<small>m/s</small>`, `Humidity ${num(w.Humidity) ?? '–'}%`));
    }
    if (a && num(a.AQI) !== null && !a.Stale) {
      const band = aqiBand(a.AQI);
      const station = esc(String(a.Station).split(',')[0]);
      const link = safeUrl(a['Station URL']) ? `<a href="${esc(a['Station URL'])}" target="_blank" rel="noopener noreferrer">${station} ↗</a>` : station;
      // Six-step AQI scale: every band up to today's is lit in its own colour.
      const level = AQI_BANDS.findIndex(([max]) => a.AQI <= max);
      const scale = AQI_BANDS.map(([, label, color], i) => `<i class="${i <= level ? 'on' : ''}" style="--c:${color}" title="${label}"></i>`).join('');
      cells.push(stat('Air quality', `${a.AQI}<small>${esc(band.label)}</small>`,
        `<span class="scale" aria-hidden="true">${scale}</span><span>${link} · ${esc(ago(a.Updated))}</span>`, 'wide aqi-cell'));
      [['PM2.5', a['PM2.5']], ['O₃', a.Ozone], ['CO', a['Carbon Monoxide']], ['NO₂', a['Nitrogen Dioxide']]]
        .filter(([, v]) => num(v) !== null)
        .forEach(([label, v]) => cells.push(stat(label, Math.round(v * 10) / 10, 'AQI sub-index')));
    } else if (a) {
      cells.push(stat('Air quality', '–', `Last report ${esc(ago(a.Updated))} is outdated, so it isn't used.`, 'wide'));
    }
    $('#conditions').innerHTML = cells.join('');
  }

  function renderSuggestions(data) {
    const tips = Array.isArray(data.Suggestions) ? data.Suggestions : [];
    const w = data.Weather;
    const a = data['Air Quality'];
    const basis = [w && `${String(w.Condition).toLowerCase()}, ${Math.round(w.Temperature)}°C, wind ${w['Wind Speed']} m/s`,
      a && !a.Stale && num(a.AQI) !== null && `AQI ${a.AQI}`].filter(Boolean).join(' · ');
    $('#suggest-basis').textContent = basis ? `Based on right now: ${basis}` : 'No current conditions available.';
    const topics = [...new Set(tips.map((t) => t.Topic))];
    $('#suggestions').innerHTML = topics.map((topic) => {
      const [group, level] = String(topic).split(' · ');
      const tone = level === 'Unhealthy' ? '#ff6b5a' : level === 'Moderate' ? '#ffd36b' : '#5be37d';
      const items = tips.filter((t) => t.Topic === topic).map((t) => `<div class="tip"><b>${esc(t.Title)}</b>${t.Detail ? `<p>${esc(t.Detail)}</p>` : ''}
        ${GARDEN_WORDS.test(`${t.Title} ${t.Detail}`) ? '<button type="button" class="btn green" data-action="show-gardens">Find a garden →</button>' : ''}</div>`).join('');
      return `<section style="--tone:${tone}"><h3 class="topic">${esc(group)}${level ? ` · <i>${esc(level)}</i>` : ''}</h3>${items}</section>`;
    }).join('') || '<p class="muted small">No suggestions available right now.</p>';
  }

  // ---------- air monitors ----------
  function renderMonitors(monitors) {
    monitorLayer.clearLayers();
    monitors.forEach((m) => {
      if (num(m.Latitude) === null || num(m.Longitude) === null || num(m.AQI) === null) return;
      const band = aqiBand(m.AQI);
      L.marker([m.Latitude, m.Longitude], {
        keyboard: false,
        icon: L.divIcon({ className: '', iconSize: [36, 24], iconAnchor: [18, 12], html: `<span class="monitor-pin" style="--aqi:${band.color}">${m.AQI}</span>` }),
      }).bindPopup(`<b>${esc(String(m.Name).split(',')[0])}</b>AQI ${m.AQI} · ${esc(band.label)} · ${esc(ago(m.Updated))}
        ${num(m['Station ID']) !== null ? `<br><a href="https://aqicn.org/station/@${m['Station ID']}/" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}`)
        .addTo(monitorLayer);
    });
  }

  // ---------- gardens ----------
  function renderGardens(data) {
    gardens = (Array.isArray(data.Gardens) ? data.Gardens : [])
      .map((g) => ({ id: String(g['OSM ID'] || ''), name: g.Name || '', lat: num(g.Latitude), lng: num(g.Longitude),
        address: g.Address || '', operator: g.Operator || '', hours: g['Opening Hours'] || '', website: safeUrl(g.Website) }))
      .filter((g) => /^(node|way|relation)\/\d+$/.test(g.id) && g.name && g.lat !== null && g.lng !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    gardenLayer.clearLayers();
    gardenMarkers.clear();
    gardens.forEach((g, i) => {
      const marker = L.marker([g.lat, g.lng], {
        title: gardenName(g), alt: gardenName(g), riseOnHover: true,
        icon: L.divIcon({ className: 'garden-pin', iconSize: [34, 34], iconAnchor: [17, 17], html: STAR_SVG }),
      }).on('click', () => selectGarden(g.id)).addTo(gardenLayer);
      marker.getElement().style.setProperty('--d', `${(i * 0.37) % 5}s`);
      gardenMarkers.set(g.id, marker);
    });

    $('#garden-count').textContent = gardens.length;
    $('#garden-source').textContent = `${data.Source || 'OpenStreetMap'} · updated ${ago(data.Fetched)}`;
    renderGardenList();
  }

  function renderGardenList() {
    $('#garden-list').innerHTML = gardens.map((g) => `<li><button type="button" data-garden="${esc(g.id)}" aria-current="${g.id === selectedId}">
      <i aria-hidden="true"></i>${esc(gardenName(g))}${g.address ? `<small>${esc(g.address)}</small>` : ''}</button></li>`).join('');
  }

  function selectGarden(id) {
    const g = gardens.find((x) => x.id === id);
    gardenMarkers.forEach((m, mid) => m.getElement() && m.getElement().classList.toggle('selected', mid === id && Boolean(g)));
    selectedId = g ? id : null;
    renderGardenList();
    const panel = $('#garden');
    if (!g) { panel.hidden = true; return; }
    const rows = [['Address', g.address], ['Run by', g.operator], ['Hours', g.hours]].filter(([, v]) => v)
      .map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
    panel.innerHTML = `<button type="button" class="btn close" data-action="close-garden" aria-label="Close">×</button>
      <span class="kicker">Community garden</span><h3>${esc(gardenName(g))}</h3>
      ${rows ? `<dl>${rows}</dl>` : '<p class="muted small">OpenStreetMap lists no address or hours for this garden.</p>'}
      <div class="links">
        <a class="btn green" href="https://www.openstreetmap.org/directions?to=${g.lat}%2C${g.lng}" target="_blank" rel="noopener noreferrer">Directions ↗</a>
        ${g.website ? `<a class="btn" href="${esc(g.website)}" target="_blank" rel="noopener noreferrer">Website ↗</a>` : ''}
        <a class="btn" href="https://www.openstreetmap.org/${esc(g.id)}" target="_blank" rel="noopener noreferrer">View on OpenStreetMap ↗</a>
      </div>`;
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    map.flyTo([g.lat, g.lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
  }

  function showAllGardens() {
    if (!gardens.length) return;
    map.flyToBounds(L.latLngBounds(gardens.map((g) => [g.lat, g.lng])), { padding: [40, 40], duration: 0.9 });
    gardenMarkers.forEach((m) => {
      const el = m.getElement();
      if (!el) return;
      el.classList.remove('flash');
      void el.offsetWidth; // restart the animation
      el.classList.add('flash');
    });
    $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const gardenBtn = e.target.closest('[data-garden]');
    if (gardenBtn) { selectGarden(gardenBtn.dataset.garden); return; }
    const action = e.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'show-gardens') showAllGardens();
    if (action.dataset.action === 'close-garden') selectGarden(null);
  });

  // ---------- boot: each source renders as soon as it arrives ----------
  $('#conditions').innerHTML = '<div class="stat notice">Loading today\'s weather and air quality…</div>';
  const offline = SERVED_BY_BACKEND
    ? '<div class="stat notice">Live data isn\'t responding right now. Try reloading in a minute.</div>'
    : '<div class="stat notice">Can\'t reach the Earthstars backend. Start it with <code>python -m uvicorn main:app --port 8000</code> and reload.</div>';

  const conditions = get('/api/conditions').then((data) => { renderConditions(data); renderSuggestions(data); });
  const monitors = get('/api/air-monitors').then((data) => renderMonitors(Array.isArray(data.Monitors) ? data.Monitors : []));
  const gardensLoaded = get('/api/gardens').then(renderGardens);

  Promise.allSettled([conditions, monitors, gardensLoaded]).then((results) => {
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length === results.length) {
      setStatus('Backend offline', 'off');
      $('#conditions').innerHTML = offline;
      $('#suggest-basis').textContent = 'No live data, so no suggestions.';
      return;
    }
    if (results[0].status === 'rejected') $('#conditions').innerHTML = '<div class="stat notice">Weather and air quality are unavailable right now.</div>';
    if (results[2].status === 'rejected') $('#garden-source').textContent = 'Community gardens are unavailable right now.';
    setStatus(failed.length ? 'Live · some data unavailable' : 'Live data', failed.length ? 'off' : 'ok');
  });
})();

