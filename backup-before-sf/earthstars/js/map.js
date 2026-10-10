/* The sky map: an SVG night-city with stars you can pan, zoom, hover, and link.
 * Stateless renderer: app.js hands it a `view` object on every change. */
window.ES = window.ES || {};

ES.map = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const BASE = { x: 0, y: 0, w: 1200, h: 720 };
  const MIN_W = 360;
  const MAX_W = 1500;
  const DRAG_THRESHOLD = 5;

  const el = (tag, attrs = {}, parent) => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (parent) parent.appendChild(node);
    return node;
  };
  const linkKey = (l) => `${l.from}>${l.to}:${l.flow}`;

  function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function curve(a, b) {
    const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
    const dx = b.x - a.x; const dy = b.y - a.y;
    const bend = 0.14;
    return {
      d: `M${a.x},${a.y} Q${mx - dy * bend},${my + dx * bend} ${b.x},${b.y}`,
      mid: { x: mx - (dy * bend) / 2, y: my + (dx * bend) / 2 },
      len: Math.hypot(dx, dy) * 1.03,
    };
  }

  function buildDefs(svg) {
    const defs = el('defs', {}, svg);
    const halo = (id, color) => `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity=".85"/><stop offset=".35" stop-color="${color}" stop-opacity=".25"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
    defs.innerHTML = `
      <radialGradient id="sky-bg" cx="50%" cy="45%" r="75%">
        <stop offset="0" stop-color="#0b1838"/><stop offset=".6" stop-color="#060d22"/><stop offset="1" stop-color="#03060f"/>
      </radialGradient>
      <radialGradient id="nebula-a"><stop offset="0" stop-color="#3b6cff" stop-opacity=".16"/><stop offset="1" stop-color="#3b6cff" stop-opacity="0"/></radialGradient>
      <radialGradient id="nebula-b"><stop offset="0" stop-color="#9b5cff" stop-opacity=".12"/><stop offset="1" stop-color="#9b5cff" stop-opacity="0"/></radialGradient>
      <linearGradient id="river-grad" x1="0" x2="1"><stop offset="0" stop-color="#0d2552"/><stop offset="1" stop-color="#0a1c40"/></linearGradient>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
      ${Object.entries(ES.KINDS).map(([k, v]) => halo(`halo-${k}`, v.color)).join('')}
      ${halo('halo-solved', '#ffd36b')}`;
  }

  function buildBackdrop(svg) {
    const g = el('g', { class: 'backdrop', 'aria-hidden': 'true' }, svg);
    const rnd = seeded(42);
    el('rect', { x: -400, y: -400, width: 2000, height: 1520, fill: 'url(#sky-bg)' }, g);
    el('ellipse', { cx: 320, cy: 200, rx: 420, ry: 260, fill: 'url(#nebula-a)' }, g);
    el('ellipse', { cx: 920, cy: 520, rx: 380, ry: 260, fill: 'url(#nebula-b)' }, g);
    ES.HOODS.forEach((h) => { // faint street grid, rotated per district
      const grid = el('g', { transform: `rotate(${(rnd() - 0.5) * 30} ${h.x} ${h.y})` }, g);
      for (let i = -4; i <= 4; i += 1) {
        el('line', { class: 'street', x1: h.x - 170, y1: h.y + i * 26, x2: h.x + 170, y2: h.y + i * 26 }, grid);
        el('line', { class: 'street', x1: h.x + i * 34, y1: h.y - 120, x2: h.x + i * 34, y2: h.y + 120 }, grid);
      }
    });
    const river = 'M-40,330 C120,300 180,360 300,370 S470,330 520,420 S560,560 470,760';
    el('path', { class: 'river', d: river, stroke: 'rgba(60,120,255,.08)', 'stroke-width': 46, filter: 'url(#soft)' }, g);
    el('path', { class: 'river', d: river, stroke: 'url(#river-grad)', 'stroke-width': 18 }, g);
    el('path', { class: 'river', d: river, stroke: 'rgba(140,190,255,.18)', 'stroke-width': 1 }, g);
    ES.HOODS.forEach((h) => { // city lights
      for (let i = 0; i < 120; i += 1) {
        const r = Math.pow(rnd(), 0.7) * 170;
        const a = rnd() * Math.PI * 2;
        el('circle', { class: 'citylight', cx: h.x + Math.cos(a) * r * 1.2, cy: h.y + Math.sin(a) * r * 0.75, r: (rnd() * 1.1 + 0.3).toFixed(2), opacity: (0.08 + rnd() * 0.45).toFixed(2) }, g);
      }
    });
    for (let i = 0; i < 160; i += 1) {
      el('circle', { cx: rnd() * 1200, cy: rnd() * 720, r: (rnd() * 0.9 + 0.2).toFixed(2), fill: '#dfe9ff', opacity: (rnd() * 0.5).toFixed(2) }, g);
    }
    ES.HOODS.forEach((h) => {
      el('text', { class: 'hood-label', x: h.x, y: h.y - 108, 'text-anchor': 'middle' }, g).textContent = h.name;
    });
  }

  function makeStar(layer, star, handlers) {
    const g = el('g', { class: `star kind-${star.kind}`, tabindex: 0, role: 'button', 'data-id': star.id, transform: `translate(${star.x} ${star.y})` }, layer);
    g.style.setProperty('--tw', `${(star.x % 7) * 0.4}s`);
    el('circle', { class: 'hit', r: 18 }, g);
    el('circle', { class: 'halo', r: 26, fill: `url(#halo-${star.kind})` }, g);
    if (star.kind === 'problem') el('circle', { class: 'ring', r: 11 }, g);
    el('path', { class: 'spark', d: 'M0,-11 L1.3,-1.3 L11,0 L1.3,1.3 L0,11 L-1.3,1.3 L-11,0 L-1.3,-1.3 Z' }, g);
    el('circle', { class: 'core', r: star.kind === 'problem' ? 5.5 : 4.5, fill: ES.KINDS[star.kind].color }, g);
    el('text', { class: 'label', y: -16, 'text-anchor': 'middle' }, g).textContent = star.name;
    g.setAttribute('aria-label', `${star.name}, ${ES.KINDS[star.kind].label}`);
    g.addEventListener('click', (e) => { if (!handlers.wasDrag()) handlers.onStarClick(star.id, e); });
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlers.onStarClick(star.id, e); }
    });
    g.addEventListener('pointerenter', () => handlers.onStarHover(star.id));
    g.addEventListener('pointerleave', () => handlers.onStarHover(null));
    g.addEventListener('focus', () => handlers.onStarHover(star.id));
    g.addEventListener('blur', () => handlers.onStarHover(null));
    return g;
  }

  function create(svg, handlers) {
    let vb = { ...BASE };
    let drag = null;
    let dragged = false;
    let tween = null;
    let edgeSig = '';
    let prevHot = new Set();
    const starEls = new Map();

    buildDefs(svg);
    buildBackdrop(svg);
    const edgeLayer = el('g', { class: 'edges' }, svg);
    const flowLayer = el('g', { class: 'flows-layer', 'aria-hidden': 'true' }, svg);
    const starLayer = el('g', { class: 'stars' }, svg);

    const apply = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    // On narrow screens fill the frame (and let people pan) instead of letterboxing a wide map.
    const narrow = window.matchMedia('(max-width: 900px)');
    const fit = () => svg.setAttribute('preserveAspectRatio', narrow.matches ? 'xMidYMid slice' : 'xMidYMid meet');
    fit();
    narrow.addEventListener('change', fit);
    const toSvg = (cx, cy) => {
      const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
      return pt.matrixTransform(svg.getScreenCTM().inverse());
    };
    const clampBox = (b) => {
      const w = Math.min(MAX_W, Math.max(MIN_W, b.w));
      const h = w * (BASE.h / BASE.w);
      return { x: Math.min(BASE.w - w * 0.3, Math.max(-w * 0.7, b.x)), y: Math.min(BASE.h - h * 0.3, Math.max(-h * 0.7, b.y)), w, h };
    };

    function animateTo(target, ms = 750) {
      cancelAnimationFrame(tween);
      const from = { ...vb };
      const to = clampBox(target);
      const t0 = performance.now();
      const ease = (t) => 1 - Math.pow(1 - t, 4);
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        const e = ease(k);
        vb = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e };
        apply();
        if (k < 1) tween = requestAnimationFrame(step);
      };
      tween = requestAnimationFrame(step);
    }

    /** Clamp the zoom factor first so x/y stay anchored at the zoom limits. */
    const clampFactor = (f) => Math.min(MAX_W, Math.max(MIN_W, vb.w * f)) / vb.w;

    function zoomBy(factor) {
      const k = clampFactor(factor);
      const c = { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
      animateTo({ x: c.x - (vb.w * k) / 2, y: c.y - (vb.h * k) / 2, w: vb.w * k, h: vb.h * k }, 300);
    }

    function focusOn(ids, stars) {
      const pts = stars.filter((s) => ids.includes(s.id));
      if (!pts.length) return;
      const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
      const pad = 130;
      const minX = Math.min(...xs) - pad; const maxX = Math.max(...xs) + pad;
      const minY = Math.min(...ys) - pad; const maxY = Math.max(...ys) + pad;
      const w = Math.max(maxX - minX, (maxY - minY) * (BASE.w / BASE.h), MIN_W + 140);
      const h = w * (BASE.h / BASE.w);
      animateTo({ x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h });
    }

    // ---- pan & zoom input ----
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      cancelAnimationFrame(tween);
      const p = toSvg(e.clientX, e.clientY);
      const f = clampFactor(e.deltaY > 0 ? 1.12 : 0.89);
      if (f === 1) return;
      vb = clampBox({ x: p.x - (p.x - vb.x) * f, y: p.y - (p.y - vb.y) * f, w: vb.w * f, h: vb.h * f });
      apply();
    }, { passive: false });
    const endDrag = () => { drag = null; svg.classList.remove('dragging'); setTimeout(() => { dragged = false; }, 0); };
    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, vb: { ...vb }, id: e.pointerId };
      dragged = false;
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (e.buttons === 0) { endDrag(); return; } // button released outside the map
      const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
      if (!dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!dragged) { dragged = true; svg.setPointerCapture(drag.id); svg.classList.add('dragging'); handlers.onStarHover(null); }
      const rect = svg.getBoundingClientRect();
      const pick = narrow.matches ? Math.min : Math.max;
      const scale = pick(drag.vb.w / rect.width, drag.vb.h / rect.height);
      cancelAnimationFrame(tween);
      vb = clampBox({ ...drag.vb, x: drag.vb.x - dx * scale, y: drag.vb.y - dy * scale });
      apply();
    });
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('click', (e) => {
      if (!dragged && !e.target.closest('.star')) handlers.onBackgroundClick();
    });

    const starHandlers = { ...handlers, wasDrag: () => dragged };

    function syncStars(stars) {
      const ids = new Set(stars.map((s) => s.id));
      starEls.forEach((node, id) => { if (!ids.has(id)) { node.remove(); starEls.delete(id); } });
      stars.forEach((s) => { if (!starEls.has(s.id)) starEls.set(s.id, makeStar(starLayer, s, starHandlers)); });
    }

    function drawLink(l, i, cls, animate, byId) {
      const a = byId[l.from]; const b = byId[l.to];
      if (!a || !b) return;
      const c = curve(a, b);
      const path = el('path', { class: `edge ${cls}`, d: c.d }, edgeLayer);
      if (!animate) return;
      if (!prevHot.has(linkKey(l))) {
        path.classList.add('drawing');
        path.style.setProperty('--len', c.len.toFixed(0));
        path.style.setProperty('--d', `${i * 0.12}s`);
      }
      const dot = el('circle', { class: 'flow-dot', r: 2.6 }, flowLayer);
      el('animateMotion', { dur: `${(2 + c.len / 220).toFixed(2)}s`, repeatCount: 'indefinite', path: c.d, begin: `${(i * 0.3).toFixed(2)}s` }, dot);
      el('text', { class: 'edge-label', x: c.mid.x, y: c.mid.y + 4, 'text-anchor': 'middle' }, flowLayer).textContent = ES.FLOWS[l.flow].icon;
    }

    function drawEdges(view, groups) {
      const sig = JSON.stringify(groups.map((g) => [g.cls, g.links.map(linkKey)]));
      if (sig === edgeSig) return;
      edgeSig = sig;
      edgeLayer.replaceChildren();
      flowLayer.replaceChildren();
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
      syncStars(view.stars);
      drawEdges(view, edgeGroups(view));
      const spotlight = view.craft ? new Set(view.craftIds) : (view.focus ? new Set(view.focus.ids) : null);
      const q = view.query.trim().toLowerCase();
      view.stars.forEach((s) => {
        const node = starEls.get(s.id);
        const matchesQuery = !q || s.name.toLowerCase().includes(q);
        const solved = view.solvedIds.has(s.id);
        node.classList.toggle('hidden', view.hidden.has(s.kind));
        node.classList.toggle('dim', Boolean((spotlight && !spotlight.has(s.id) && !view.suggestIds.has(s.id)) || (q && !matchesQuery)));
        node.classList.toggle('show-label', Boolean((spotlight && spotlight.has(s.id)) || (q && matchesQuery) || view.selectedId === s.id));
        node.classList.toggle('solved', solved);
        node.classList.toggle('picked', view.craftIds.includes(s.id) || view.selectedId === s.id);
        node.classList.toggle('suggest', view.suggestIds.has(s.id));
        node.querySelector('.halo').setAttribute('fill', solved ? 'url(#halo-solved)' : `url(#halo-${s.kind})`);
      });
    }

    function nova(id) {
      const node = starEls.get(id);
      if (!node) return;
      node.classList.remove('nova');
      node.getBBox(); // force a style flush so the animation restarts
      node.classList.add('nova');
    }

    /** Client-space position of a star, for tooltips. */
    function clientPoint(star) {
      const pt = svg.createSVGPoint(); pt.x = star.x; pt.y = star.y;
      return pt.matrixTransform(svg.getScreenCTM());
    }

    apply();
    return {
      render, focusOn, nova, clientPoint,
      zoomIn: () => zoomBy(0.75), zoomOut: () => zoomBy(1.33), reset: () => animateTo({ ...BASE }),
    };
  }

  return { create, linkKey };
})();
