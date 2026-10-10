/* Hero canvas: the night side of Earth seen from orbit, with city lights and a network of stars that
 * slowly connect into constellations. Pauses offscreen; draws one still frame for reduced motion. */
window.ES = window.ES || {};

ES.sky = (() => {
  const STAR_COUNT = 320;
  const CITY_CLUSTERS = 16;
  const LIGHTS_PER_CLUSTER = 46;
  const NODE_COUNT = 30;
  const LINK_REVEAL_MS = 260;

  function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  const gauss = (rnd) => (rnd() + rnd() + rnd() - 1.5) / 1.5;

  function buildScene(w, h) {
    const rnd = seeded(7);
    const R = Math.max(w, h) * 1.35;
    const earth = { cx: w * 0.62, cy: h + R * 0.62, r: R };
    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x: rnd() * w, y: rnd() * h * 0.85, r: rnd() * 1.2 + 0.2, p: rnd() * Math.PI * 2, s: 0.5 + rnd() * 1.5,
    }));
    const onEarth = (x, y) => Math.hypot(x - earth.cx, y - earth.cy) < earth.r - 6 && y < h && x > 0 && x < w;
    const clusters = [];
    for (let tries = 0; clusters.length < CITY_CLUSTERS && tries < 2000; tries += 1) {
      const x = rnd() * w;
      const y = earth.cy - earth.r + 30 + rnd() * h * 0.5;
      if (onEarth(x, y)) clusters.push({ x, y, spread: 18 + rnd() * 50 });
    }
    const lights = clusters.flatMap((c) => Array.from({ length: LIGHTS_PER_CLUSTER }, () => ({
      x: c.x + gauss(rnd) * c.spread * 1.6, y: c.y + gauss(rnd) * c.spread * 0.6, a: 0.25 + rnd() * 0.75, r: rnd() * 1.3 + 0.3,
    }))).filter((l) => onEarth(l.x, l.y));
    const nodes = [];
    const left = w > 900 ? w * 0.5 : 0; // keep the network clear of the headline on wide screens
    for (let tries = 0; nodes.length < NODE_COUNT && tries < 4000; tries += 1) {
      const x = left + rnd() * (w - left);
      const y = earth.cy - earth.r + 40 + rnd() * h * 0.45;
      if (onEarth(x, y)) nodes.push({ x, y, p: rnd() * Math.PI * 2 });
    }
    const links = [];
    nodes.forEach((n, i) => {
      nodes.map((m, j) => ({ j, d: Math.hypot(m.x - n.x, m.y - n.y) }))
        .filter((o) => o.j > i).sort((a, b) => a.d - b.d).slice(0, 2)
        .forEach((o) => links.push({ a: i, b: o.j }));
    });
    const ordered = [...links].sort((l1, l2) => nodes[l1.a].x - nodes[l2.a].x);
    return { w, h, earth, stars, lights, nodes, links: ordered };
  }

  function drawEarth(ctx, { earth, w, h }) {
    const { cx, cy, r } = earth;
    const body = ctx.createRadialGradient(cx, cy - r * 0.7, r * 0.2, cx, cy, r);
    body.addColorStop(0, '#0d1d3d');
    body.addColorStop(0.85, '#081430');
    body.addColorStop(1, '#0c2350');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    // atmosphere limb
    [[28, 'rgba(90,150,255,0.10)'], [12, 'rgba(120,180,255,0.22)'], [3, 'rgba(190,225,255,0.55)']].forEach(([lw, c]) => {
      ctx.strokeStyle = c; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(cx, cy, r + lw / 2 - 2, Math.PI, Math.PI * 2); ctx.stroke();
    });
    const haze = ctx.createLinearGradient(0, cy - r - 80, 0, cy - r + 120);
    haze.addColorStop(0, 'rgba(70,120,230,0)');
    haze.addColorStop(0.45, 'rgba(70,120,230,0.12)');
    haze.addColorStop(1, 'rgba(70,120,230,0)');
    ctx.fillStyle = haze; ctx.fillRect(0, 0, w, h);
  }

  function drawNetwork(ctx, { nodes, links }, t) {
    const shown = Math.min(links.length, Math.floor(t / LINK_REVEAL_MS));
    links.forEach((lk, i) => {
      if (i > shown) return;
      const a = nodes[lk.a]; const b = nodes[lk.b];
      const k = i === shown ? (t % LINK_REVEAL_MS) / LINK_REVEAL_MS : 1;
      ctx.strokeStyle = 'rgba(130,190,255,0.38)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k); ctx.stroke();
      if (k === 1) {
        const q = ((t * 0.00035 + i * 0.37) % 1);
        ctx.fillStyle = 'rgba(210,235,255,0.9)';
        ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * q, a.y + (b.y - a.y) * q, 1.4, 0, Math.PI * 2); ctx.fill();
      }
    });
    nodes.forEach((n) => {
      const pulse = 0.6 + 0.4 * Math.sin(n.p + t * 0.002);
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 16);
      g.addColorStop(0, `rgba(150,205,255,${0.75 * pulse})`); g.addColorStop(1, 'rgba(150,205,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#eaf5ff'; ctx.beginPath(); ctx.arc(n.x, n.y, 2.2, 0, Math.PI * 2); ctx.fill();
    });
  }

  function drawFrame(ctx, scene, t, parallax) {
    const { w, h, stars, lights } = scene;
    ctx.globalCompositeOperation = 'source-over';
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#02040b'); bg.addColorStop(1, '#060d20');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

    ctx.save(); ctx.translate(parallax.x * 6, parallax.y * 4);
    stars.forEach((s) => {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s.p + t * 0.001 * s.s));
      ctx.fillStyle = `rgba(220,232,255,${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();

    ctx.save(); ctx.translate(parallax.x * 14, parallax.y * 8);
    drawEarth(ctx, scene);
    ctx.globalCompositeOperation = 'lighter';
    lights.forEach((l) => {
      ctx.fillStyle = `rgba(255,196,110,${l.a * 0.8})`;
      ctx.fillRect(l.x, l.y, l.r, l.r);
    });
    drawNetwork(ctx, scene, t);
    ctx.restore();
  }

  function init(canvas) {
    const ctx = canvas && canvas.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let scene = null;
    let visible = true;
    let running = false;
    let start = performance.now();
    const parallax = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene = buildScene(width, height);
      if (reduced) drawFrame(ctx, scene, 1e9, parallax);
    };
    resize();
    window.addEventListener('resize', resize);
    if (reduced) return;

    window.addEventListener('pointermove', (e) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.y = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    function loop(now) {
      if (!visible) { running = false; return; }
      parallax.x += (target.x - parallax.x) * 0.04;
      parallax.y += (target.y - parallax.y) * 0.04;
      drawFrame(ctx, scene, now - start, parallax);
      requestAnimationFrame(loop);
    }
    const kick = () => { if (!running) { running = true; requestAnimationFrame(loop); } };
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) kick(); }).observe(canvas);
    start = performance.now();
    kick();
  }

  return { init };
})();
