/* Real-world sky map: Leaflet + CARTO dark tiles, with stars pinned to real neighbourhoods.
 * Same interface as ES.map (the offline SVG fallback): render, focusOn, nova, clientPoint, zoom*, reset, setCity. */
window.ES = window.ES || {};

ES.realMap = (() => {
  // Esri's dark canvas works from file:// (CARTO/OSM tiles reject requests without a Referer).
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
  const TILES = `${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`;
  const LABELS = `${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`;
  const ATTRIBUTION = 'Tiles &copy; <a href="https://www.esri.com">Esri</a>, HERE, Garmin, &copy; OpenStreetMap contributors';
  const FIT = { padding: [70, 70], maxZoom: 15, duration: 0.9 };
  const CURVE_STEPS = 24;
  const BEND = 0.14;
  const WORLD_ZOOM = 9; // below this zoom the map shows cities instead of individual stars
  /* A four-point star: long tapered rays, short diagonal glints, a soft halo and a bright core. */
  const STAR_SVG = `<svg class="pin-star" viewBox="-22 -22 44 44" aria-hidden="true">
    <circle class="halo" r="12"/>
    <path class="rays" d="M0,-20 L1.1,-1.1 L20,0 L1.1,1.1 L0,20 L-1.1,1.1 L-20,0 L-1.1,-1.1 Z"/>
    <path class="glint" d="M0,-7 L0.6,-0.6 L7,0 L0.6,0.6 L0,7 L-0.6,0.6 L-7,0 L-0.6,-0.6 Z" transform="rotate(45)"/>
    <circle class="core" r="2.1"/></svg>`;
  const linkKey = (l) => `${l.from}>${l.to}:${l.flow}`;
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Quadratic curve between two lat/lngs, bent in a locally-flat projection. */
  function curve(a, b) {
    const k = Math.cos((a[0] * Math.PI) / 180);
    const ax = a[1] * k; const bx = b[1] * k;
    const mx = (ax + bx) / 2; const my = (a[0] + b[0]) / 2;
    const dx = bx - ax; const dy = b[0] - a[0];
    const cx = mx + dy * BEND; const cy = my - dx * BEND;
    const pts = [];
    for (let i = 0; i <= CURVE_STEPS; i += 1) {
      const t = i / CURVE_STEPS; const u = 1 - t;
      const x = u * u * ax + 2 * u * t * cx + t * t * bx;
      const y = u * u * a[0] + 2 * u * t * cy + t * t * b[0];
      pts.push([y, x / k]);
    }
    return pts;
  }

  function starIcon(star) {
    const ring = star.kind === 'problem' ? '<span class="ring"></span>' : '';
    return L.divIcon({
      className: `lstar kind-${star.kind}`,
      iconSize: [36, 36], iconAnchor: [18, 18],
      html: `<span class="halo"></span>${ring}<span class="spark"></span><span class="core"></span><span class="label">${esc(star.name)}</span>`,
    });
  }

  function create(container, handlers) {
    const map = L.map(container, { zoomControl: false, attributionControl: true, zoomSnap: 0.25, minZoom: 2, worldCopyJump: true });
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 16 }).addTo(map);
    L.tileLayer(LABELS, { maxZoom: 16, className: 'map-labels' }).addTo(map);
    const renderer = L.svg({ padding: 0.6 });
    const edgeLayer = L.layerGroup().addTo(map);
    const markers = new Map();
    let city = null;
    let edgeSig = '';
    let prevHot = new Set();
    let lastStars = [];
    let pendingForce = false;

    map.on('click', () => handlers.onBackgroundClick());
    map.on('movestart zoomstart', () => handlers.onStarHover(null));

    const ll = (star) => ES.project(star, city);

    function makeMarker(star) {
      const m = L.marker(ll(star), { icon: starIcon(star), keyboard: true, riseOnHover: true });
      m.on('click', (e) => { L.DomEvent.stopPropagation(e); handlers.onStarClick(star.id); });
      m.on('mouseover', () => handlers.onStarHover(star.id));
      m.on('mouseout', () => handlers.onStarHover(null));
      m.addTo(map);
      const el = m.getElement();
      el.setAttribute('aria-label', `${star.name}, ${ES.KINDS[star.kind].label}`);
      el.setAttribute('role', 'button');
      el.dataset.id = star.id;
      el.style.setProperty('--tw', `${(star.x % 7) * 0.4}s`);
      el.addEventListener('focus', () => handlers.onStarHover(star.id));
      el.addEventListener('blur', () => handlers.onStarHover(null));
      el.addEventListener('keydown', (e) => { if (e.key === ' ') { e.preventDefault(); handlers.onStarClick(star.id); } });
      return m;
    }

    function syncStars(stars) {
      const ids = new Set(stars.map((s) => s.id));
      markers.forEach((m, id) => { if (!ids.has(id)) { m.remove(); markers.delete(id); } });
      stars.forEach((s) => { if (!markers.has(s.id)) markers.set(s.id, makeMarker(s)); });
    }

    function drawLink(l, i, cls, animate, byId) {
      const a = byId[l.from]; const b = byId[l.to];
      if (!a || !b) return;
      const pts = curve(ll(a), ll(b));
      const line = L.polyline(pts, { renderer, className: `edge ${cls}`, interactive: false }).addTo(edgeLayer);
      if (!animate) return;
      const path = line.getElement();
      if (path && !prevHot.has(linkKey(l))) {
        path.style.setProperty('--len', Math.ceil(path.getTotalLength()));
        path.style.setProperty('--d', `${i * 0.12}s`);
        path.classList.add('drawing');
      }
      L.polyline(pts, { renderer, className: 'edge-flow', interactive: false }).addTo(edgeLayer);
      L.marker(pts[Math.floor(CURVE_STEPS / 2)], {
        interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'flow-icon', iconSize: [24, 24], iconAnchor: [12, 12], html: ES.FLOWS[l.flow].icon }),
      }).addTo(edgeLayer);
    }

    function drawEdges(view, groups) {
      const sig = JSON.stringify(groups.map((g) => [g.cls, g.links.map(linkKey)]));
      if (sig === edgeSig && !pendingForce) return;
      edgeSig = sig;
      pendingForce = false;
      edgeLayer.clearLayers();
      const byId = Object.fromEntries(view.stars.map((s) => [s.id, s]));
      groups.forEach(({ cls, links, animate }) => links.forEach((l, i) => drawLink(l, i, cls, animate, byId)));
      prevHot = new Set(groups.filter((g) => g.animate).flatMap((g) => g.links.map(linkKey)));
    }

    function edgeGroups(view) {
      const hot = view.craft ? view.craft.links : (view.focus ? view.focus.links : []);
      const hotKeys = new Set(hot.map(linkKey));
      const launchedKeys = new Set(view.launchedLinks.map(linkKey));
      const seen = new Set();
      const base = view.constellations.flatMap((k) => k.links).filter((l) => {
        const k = linkKey(l);
        if (seen.has(k) || hotKeys.has(k) || launchedKeys.has(k)) return false;
        seen.add(k);
        return true;
      });
      const active = Boolean(view.focus || view.craft);
      return [
        { cls: active ? 'dim' : '', links: view.craft ? [] : base, animate: false },
        { cls: `launched${active ? ' dim' : ''}`, links: view.launchedLinks.filter((l) => !hotKeys.has(linkKey(l))), animate: false },
        { cls: view.craft ? 'hot craft' : 'hot', links: hot, animate: true },
      ];
    }

    function render(view) {
      lastStars = view.stars;
      syncStars(view.stars);
      drawEdges(view, edgeGroups(view));
      const spotlight = view.craft ? new Set(view.craftIds) : (view.focus ? new Set(view.focus.ids) : null);
      const q = view.query.trim().toLowerCase();
      view.stars.forEach((s) => {
        const el = markers.get(s.id).getElement();
        if (!el) return;
        const matchesQuery = !q || s.name.toLowerCase().includes(q);
        el.classList.toggle('hidden', view.hidden.has(s.kind));
        el.classList.toggle('dim', Boolean((spotlight && !spotlight.has(s.id) && !view.suggestIds.has(s.id)) || (q && !matchesQuery)));
        el.classList.toggle('show-label', Boolean((spotlight && spotlight.has(s.id)) || (q && matchesQuery) || view.selectedId === s.id));
        el.classList.toggle('solved', view.solvedIds.has(s.id));
        el.classList.toggle('picked', view.craftIds.includes(s.id) || view.selectedId === s.id);
        el.classList.toggle('suggest', view.suggestIds.has(s.id));
      });
    }

    function boundsOf(ids, stars) {
      const pts = stars.filter((s) => ids.includes(s.id)).map(ll);
      return pts.length ? L.latLngBounds(pts) : null;
    }

    function focusOn(ids, stars) {
      const b = boundsOf(ids, stars);
      if (!b) return;
      if (ids.length === 1) map.flyTo(b.getCenter(), 15, { duration: 0.9 });
      else map.flyToBounds(b, FIT);
    }

    function reset() {
      const b = boundsOf(lastStars.map((s) => s.id), lastStars);
      if (b) map.flyToBounds(b, { ...FIT, maxZoom: 14 });
      else if (city) map.flyTo([city.lat, city.lng], 12, { duration: 0.9 });
    }

    /** Switch city: every marker is rebuilt (positions and localised names change). */
    function setCity(next, stars, opts = {}) {
      const moved = !city || city.id !== next.id;
      city = next;
      markers.forEach((m) => m.remove());
      markers.clear();
      pendingForce = true;
      lastStars = stars;
      if (opts.refit === false) return;
      const b = boundsOf(stars.map((s) => s.id), stars);
      if (!b) { // live data still loading: go to the city itself
        if (map._loaded) map.flyTo([next.lat, next.lng], 12, { duration: 1.6 }); else map.setView([next.lat, next.lng], 12);
        return;
      }
      if (map._loaded) map.flyToBounds(b, { padding: [50, 50], maxZoom: 14, duration: moved ? 1.6 : 0.9 });
      else map.fitBounds(b, { padding: [50, 50], maxZoom: 14 });
    }

    // ---- world view: zoomed out, every city becomes one star in a global constellation ----
    const worldLayer = L.layerGroup().addTo(map);
    const syncWorldClass = () => container.classList.toggle('world-zoom', map.getZoom() < WORLD_ZOOM);
    map.on('zoomend', syncWorldClass);

    function setWorld(cities, currentId, onPick) {
      worldLayer.clearLayers();
      cities.forEach((c, i) => {
        const nearest = cities.map((o, j) => ({ j, d: Math.hypot(o.lat - c.lat, o.lng - c.lng) }))
          .filter((o) => o.j > i).sort((a, b) => a.d - b.d).slice(0, 2);
        nearest.forEach(({ j }) => L.polyline([[c.lat, c.lng], [cities[j].lat, cities[j].lng]],
          { renderer, className: 'world-link', interactive: false }).addTo(worldLayer));
      });
      cities.forEach((c, i) => {
        const pin = L.marker([c.lat, c.lng], {
          keyboard: true, title: `${c.name}, ${c.country}`,
          icon: L.divIcon({
            className: `city-pin${c.id === currentId ? ' current' : ''}`, iconSize: [44, 44], iconAnchor: [22, 22],
            html: `${STAR_SVG}<span class="pin-name">${esc(c.name)}</span>`,
          }),
        });
        pin.on('click', (e) => { L.DomEvent.stopPropagation(e); onPick(c.id); });
        pin.addTo(worldLayer);
        pin.getElement().style.setProperty('--tw', `${((i * 0.73) % 5.5).toFixed(2)}s`); // desync the shimmer
      });
    }

    function world() { map.flyTo([22, 15], 2.25, { duration: 1.4 }); }

    function nova(id) {
      const el = markers.get(id) && markers.get(id).getElement();
      if (!el) return;
      el.classList.remove('nova');
      void el.offsetWidth; // restart the animation
      el.classList.add('nova');
    }

    function clientPoint(star) {
      const p = map.latLngToContainerPoint(ll(star));
      const r = container.getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    }

    return {
      render, focusOn, nova, clientPoint, reset, setCity, setWorld, world,
      zoomIn: () => map.zoomIn(), zoomOut: () => map.zoomOut(),
    };
  }

  return { create, linkKey };
})();
