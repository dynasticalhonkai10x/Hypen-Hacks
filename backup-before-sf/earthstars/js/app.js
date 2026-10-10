/* Minimal Earthstars Controller: City Search + Live API Map + Environmental Conditions */
(() => {
  const { engine, panels } = ES;
  const $ = (sel) => document.querySelector(sel);

  let state = {
    cityId: ES.DEFAULT_CITY,
    selectedId: null,
    live: {}, // cityId -> { status: 'loading' | 'ok' | 'offline', data }
    tipsOpen: false,
  };

  let map;
  const city = () => ES.CITIES[state.cityId];

  function derive(s) {
    const liveData = s.live[s.cityId];
    // Only use live API stars; all non-API sources and user reports are excluded[cite: 5, 12]
    const stars = ES.live.toStars(liveData && liveData.status === 'ok' ? liveData.data : null, ES.CITIES[s.cityId]);
    const byId = Object.fromEntries(stars.map((x) => [x.id, x]));
    const constellations = engine.discover(stars);
    const live = s.live[s.cityId];
    return {
      stars, byId, constellations,
      focus: null,
      liveStatus: live ? live.status : 'loading',
      hasTips: Boolean(live && live.data && live.data.env && ES.live.isFresh(live.data.env.updated) && live.data.env.tips.length),
    };
  }

  function render() {
    const d = derive(state);
    map.render({
      stars: d.stars, constellations: d.constellations, hidden: new Set(), query: '',
      focus: null, craft: null, craftIds: [], launchedLinks: [], solvedIds: new Set(), selectedId: state.selectedId, suggestIds: new Set(),
    });
    
    const ctx = { ...state, ...d, city: city(), selected: state.selectedId ? d.byId[state.selectedId] : null };
    const side = $('#side');
    if (side) {
      side.innerHTML = panels.discover(ctx);
    }
    
    const counts = { green: d.stars.filter((s) => s.kind === 'garden').length };
    ES.live.render(state.live[state.cityId], city(), state.tipsOpen, counts, new Set());
  }

  function onStarClick(id) {
    setState({ selectedId: state.selectedId === id ? null : id });
  }

  function onStarHover(id) {
    const tip = $('#map-tip');
    if (!tip) return;
    const d = derive(state);
    const star = id && d.byId[id];
    if (!star) { tip.hidden = true; return; }
    const p = map.clientPoint(star);
    const box = $('#map-wrap').getBoundingClientRect();
    tip.innerHTML = panels.tooltip(star, d);
    tip.style.left = `${p.x - box.left}px`;
    tip.style.top = `${p.y - box.top}px`;
    tip.hidden = false;
  }

  function setState(patch) {
    state = { ...state, ...patch };
    render();
  }

  function loadLive(c) {
    state = { ...state, live: { ...state.live, [c.id]: { status: 'loading', data: null } } };
    render();
    ES.backend.loadCity(c).then((data) => {
      const status = data.connected ? 'ok' : 'offline';
      setState({ live: { ...state.live, [c.id]: { status, data } } });
      if (status !== 'ok') return;
      if (map.setCity) map.setCity(c, derive(state).stars, { refit: true });
      render();
    });
  }

  function createMap(handlers) {
    const host = $('#map');
    if (window.L && ES.realMap) return ES.realMap.create(host, handlers);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'sky-svg');
    host.appendChild(svg);
    return ES.map.create(svg, handlers);
  }

  function boot() {
    map = createMap({
      onStarClick, onStarHover,
      onBackgroundClick: () => { if (state.selectedId) setState({ selectedId: null }); },
    });
    
    const c = city();
    document.querySelectorAll('[data-city-name]').forEach((n) => { n.textContent = c.name; });
    if (map.setCity) map.setCity(c, [], { refit: false });
    render();
    loadLive(c);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();