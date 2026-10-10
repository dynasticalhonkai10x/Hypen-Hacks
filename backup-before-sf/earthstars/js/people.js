/* The user's side: matching real stars to what they care about, levels, badges, their constellation,
 * the actions they committed to, and a log of what they actually did. Nothing here is simulated. */
window.ES = window.ES || {};

ES.people = (() => {
  const { esc } = ES.panels;
  const AVATAR_COLORS = ['#ff8a65', '#5be37d', '#79b8ff', '#c48bff', '#ffd36b', '#4dd0e1', '#f48fb1'];
  const LEVELS = ['Spark', 'Seedling', 'Sprout', 'Grower', 'Gardener', 'Guardian', 'Constellation'];
  const POINTS_PER_LEVEL = 30;
  const NEAR_KM = 1.5;
  const NEARBY_KM = 4;

  const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const initials = (name) => String(name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const colorFor = (name) => AVATAR_COLORS[hash(name) % AVATAR_COLORS.length];

  function avatar(name, size = 28) {
    return `<span class="av" style="--av:${colorFor(name)};--s:${size}px" title="${esc(name)}">${esc(initials(name))}</span>`;
  }

  // ---------- matching (distance, interest, measured severity) ----------
  function home(ctx) {
    const h = ctx.profile && ctx.city && ctx.city.hoods[ctx.profile.hood];
    return h ? { lat: h.lat, lng: h.lng, name: (ES.HOODS.find((x) => x.id === ctx.profile.hood) || {}).name } : null;
  }

  function match(star, ctx) {
    if (!ctx.profile) return null;
    const reasons = [];
    let score = 25;
    if (ctx.profile.interests.includes(star.category)) {
      score += 25;
      reasons.push(`you care about ${(ES.INTERESTS.find((i) => i.id === star.category) || {}).label.toLowerCase()}`);
    }
    const h = home(ctx);
    if (h && star.lat !== undefined) {
      const d = ES.distKm(h, star);
      score += d < NEAR_KM ? 25 : d < NEARBY_KM ? 15 : 4;
      reasons.push(`${ES.panels.km(d)} from ${h.name}`);
    }
    const m = star.metrics || {};
    if (m.aqi !== undefined) { score += m.aqi > 150 ? 20 : m.aqi > 100 ? 14 : 8; reasons.push(`AQI ${m.aqi} measured`); }
    if (m.temp !== undefined) { score += m.temp >= 35 ? 18 : 10; reasons.push(`${Math.round(m.temp)}°C now`); }
    if (star.kind === 'garden' && ctx.constellations.some((k) => k.ids.includes(star.id))) { score += 8; reasons.push('near a measured challenge'); }
    return { pct: Math.min(97, score), reasons };
  }

  function recommend(ctx, n = 3) {
    if (!ctx.profile) return [];
    return ctx.stars.filter((s) => !ctx.joined.has(s.id) && !s.reported)
      .map((s) => ({ star: s, m: match(s, ctx) }))
      .sort((a, b) => b.m.pct - a.m.pct)
      .slice(0, n);
  }

  // ---------- progress ----------
  const points = (ctx) => ctx.joined.size * 10 + ctx.commitments.length * 5 + ctx.reports * 15;
  function level(ctx) {
    const p = points(ctx);
    const idx = Math.min(LEVELS.length - 1, Math.floor(p / POINTS_PER_LEVEL));
    return { n: idx + 1, title: LEVELS[idx], progress: (p % POINTS_PER_LEVEL) / POINTS_PER_LEVEL, points: p };
  }

  function badges(ctx) {
    const mine = ctx.stars.filter((s) => ctx.joined.has(s.id));
    const connector = ctx.constellations.some((k) => k.links.some((l) => ctx.joined.has(l.from) && ctx.joined.has(l.to)));
    return [
      { icon: '✦', name: 'First spark', desc: 'Add your first star', earned: mine.length >= 1 },
      { icon: '🌬️', name: 'Clean-air ally', desc: 'Take on a measured air-quality challenge', earned: mine.some((s) => s.category === 'air') },
      { icon: '🌱', name: 'Green thumb', desc: 'Add a real green space', earned: mine.some((s) => s.kind === 'garden') },
      { icon: '🔗', name: 'Connector', desc: 'Add a challenge and the green space paired with it', earned: connector },
      { icon: '✅', name: 'Committed', desc: 'Commit to one of today\'s actions', earned: ctx.commitments.length >= 1 },
      { icon: '📍', name: 'Eyes on the street', desc: 'Put something on the map', earned: ctx.reports >= 1 },
      { icon: '✨', name: 'Constellation', desc: 'Add 3 or more stars', earned: mine.length >= 3 },
      { icon: '🌍', name: 'Globetrotter', desc: 'Explore 3 cities', earned: ctx.citiesSeen >= 3 },
    ];
  }

  // ---------- personal constellation ----------
  function mySky(stars) {
    const W = 360; const H = 220; const pad = 30;
    let seed = 11;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const dust = Array.from({ length: 50 }, () => `<circle cx="${(rnd() * W).toFixed(1)}" cy="${(rnd() * H).toFixed(1)}" r="${(rnd() * 0.9 + 0.3).toFixed(2)}" fill="#dfe9ff" opacity="${(0.12 + rnd() * 0.4).toFixed(2)}"/>`).join('');
    if (!stars.length) {
      return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Your sky is empty">${dust}
        <text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="sky-empty">Add a challenge or green space to light your first star</text></svg>`;
    }
    const xs = stars.map((s) => s.x); const ys = stars.map((s) => s.y);
    const minX = Math.min(...xs); const minY = Math.min(...ys);
    const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1);
    const scale = Math.min((W - pad * 2) / span, (H - pad * 2) / span, 1.2);
    const offX = (W - (Math.max(...xs) - minX) * scale) / 2; const offY = (H - (Math.max(...ys) - minY) * scale) / 2;
    const pts = stars.map((s) => ({ x: offX + (s.x - minX) * scale, y: offY + (s.y - minY) * scale }));
    const lines = pts.slice(1).map((p, i) => `<line x1="${pts[i].x.toFixed(1)}" y1="${pts[i].y.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}"/>`).join('');
    const dots = stars.map((s, i) => `<g class="ms" style="--d:${(i * 0.12).toFixed(2)}s"><circle cx="${pts[i].x.toFixed(1)}" cy="${pts[i].y.toFixed(1)}" r="12" fill="${ES.KINDS[s.kind].color}" opacity=".2"/>
      <circle cx="${pts[i].x.toFixed(1)}" cy="${pts[i].y.toFixed(1)}" r="4.5" fill="${ES.KINDS[s.kind].color}"/><title>${esc(s.name)}</title></g>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Your constellation: ${stars.length} stars">${dust}<g class="my-lines">${lines}</g>${dots}</svg>`;
  }

  // ---------- section render ----------
  function profileCard(ctx) {
    if (!ctx.profile) {
      return `<div class="profile-empty"><div class="av-big">✦</div><h3>Light your star</h3>
        <p class="muted">Tell us your neighbourhood and what you care about. We'll rank the real challenges and green spaces nearest to you.</p>
        <button type="button" class="btn btn-primary" data-open-join>✦ Join Earthstars</button></div>`;
    }
    const lv = level(ctx);
    const hood = ES.HOODS.find((h) => h.id === ctx.profile.hood);
    const interests = ctx.profile.interests.map((id) => (ES.INTERESTS.find((i) => i.id === id) || {}).label).filter(Boolean);
    return `<div class="profile-top">${avatar(ctx.profile.name, 64)}
        <div><h3>${esc(ctx.profile.name)}</h3><p class="muted small">📍 ${esc(hood ? hood.name : '')} · ${esc(ctx.city.name)}</p></div>
        <button type="button" class="icon-btn" data-open-join aria-label="Edit profile">✎</button></div>
      <div class="level"><div class="level-top"><b>Level ${lv.n} · ${lv.title}</b><span class="muted small">${lv.points} pts</span></div>
        <div class="level-track"><div class="level-fill" style="transform:scaleX(${lv.progress.toFixed(3)})"></div></div></div>
      <div class="chips">${interests.map((s) => `<span class="chip skill">${esc(s)}</span>`).join('') || '<span class="muted small">No interests picked yet</span>'}</div>
      <div class="profile-stats">
        <div><b>${ctx.joined.size}</b><span>stars here</span></div>
        <div><b>${ctx.commitments.length}</b><span>actions committed</span></div>
        <div><b>${ctx.citiesSeen}</b><span>cities explored</span></div>
      </div>`;
  }

  function commitments(ctx) {
    if (!ctx.commitments.length) return '<li class="none">Nothing yet. Open <b>What you can do today</b> above the map and pick an action.</li>';
    return ctx.commitments.map((c) => `<li><span class="when">${esc(c.group)}</span><span class="what"><b>${esc(c.title)}</b><small>${esc(c.cityName)} · ${esc(ES.live.ago(c.at))}</small></span>
      <button type="button" class="linklike small" data-action="uncommit" data-id="${esc(`${c.cityId}|${c.id}`)}">Remove</button></li>`).join('');
  }

  const VERBS = { joined: 'Added', left: 'Removed', committed: 'Committed to', reported: 'Reported', project: 'Started project', explored: 'Explored' };
  function activity(list) {
    if (!list.length) return '<li class="none">Your actions will show up here.</li>';
    return list.map((a) => `<li><span class="dot-act" aria-hidden="true">✦</span><span>${esc(VERBS[a.verb] || 'Did')} <b>${esc(a.label)}</b><small>${esc(ES.live.ago(a.at))}</small></span></li>`).join('');
  }

  function render(ctx) {
    document.getElementById('profile').innerHTML = profileCard(ctx);
    const mine = ctx.joinOrder.map((id) => ctx.byId[id]).filter(Boolean);
    document.getElementById('my-sky').innerHTML = mySky(mine);
    document.getElementById('my-sky-count').textContent = mine.length ? `${mine.length} star${mine.length > 1 ? 's' : ''} in ${ctx.city.name}` : '';
    const b = badges(ctx);
    document.getElementById('badge-count').textContent = `${b.filter((x) => x.earned).length} / ${b.length}`;
    document.getElementById('badges').innerHTML = b.map((x) => `<li class="badge-item${x.earned ? ' earned' : ''}" title="${esc(x.desc)}">
      <span class="bi" aria-hidden="true">${x.icon}</span><b>${esc(x.name)}</b><small>${esc(x.desc)}</small></li>`).join('');
    document.getElementById('my-commitments').innerHTML = commitments(ctx);
    document.getElementById('activity').innerHTML = activity(ctx.activity);
  }

  return { match, recommend, avatar, badges, level, render };
})();
