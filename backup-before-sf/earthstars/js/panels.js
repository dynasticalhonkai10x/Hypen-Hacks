/* Side-panel templates. Pure functions: state in, HTML string out.
 * Every string from an API or the user goes through esc(); every star shows where its data came from. */
window.ES = window.ES || {};

ES.panels = (() => {
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const km = (n) => (n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`);
  const hoodName = (id) => { const h = ES.HOODS.find((x) => x.id === id); return h ? h.name : ''; };
  const projectTitle = (k) => (k.hood ? `${k.title || k.name} · ${hoodName(k.hood)}` : (k.title || k.name));
  const isJoinedProject = (k, ctx) => k.ids.every((id) => ctx.joined.has(id));
  const linkKm = (l, byId) => (byId[l.from] && byId[l.to] && byId[l.from].lat !== undefined && byId[l.to].lat !== undefined
    ? ES.distKm(byId[l.from], byId[l.to]) : null);

  /** "Source: World Air Quality Index ↗ · 2 h ago" — or "Reported by you · not verified". */
  function sourceLine(star) {
    if (star.reported) return '<span class="src unverified">Reported by you · not verified</span>';
    if (!star.source) return '';
    const when = star.source.updated ? ` · ${esc(ES.live.ago(star.source.updated))}` : '';
    const name = esc(star.source.name);
    return star.source.url
      ? `<a class="src" href="${esc(star.source.url)}" target="_blank" rel="noopener noreferrer">Source: ${name} ↗</a><span class="src-when">${when}</span>`
      : `<span class="src">Source: ${name}${when}</span>`;
  }

  function metric(star) {
    const m = star.metrics || {};
    if (m.aqi !== undefined) return `<span class="metric" style="--m:${m.color}"><b>${m.aqi}</b> AQI · ${esc(m.level)}</span>`;
    if (m.temp !== undefined) return `<span class="metric" style="--m:#ff9f43"><b>${Math.round(m.temp)}°C</b> now</span>`;
    if (m.type) return `<span class="metric" style="--m:#5be37d">${esc(m.type)}</span>`;
    return '';
  }

  /** A tiny drawing of the project's shape, normalised into a 64px tile. */
  function glyph(k, byId) {
    const pts = k.ids.map((id) => byId[id]).filter(Boolean);
    const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs); const minY = Math.min(...ys);
    const spanX = Math.max(...xs) - minX; const spanY = Math.max(...ys) - minY;
    const span = Math.max(spanX, spanY, 1);
    const pad = 12; const size = 64 - pad * 2;
    const offX = (size - (spanX / span) * size) / 2;
    const offY = (size - (spanY / span) * size) / 2;
    const P = (s) => ({ x: pad + offX + ((s.x - minX) / span) * size, y: pad + offY + ((s.y - minY) / span) * size });
    const lines = k.links.filter((l) => byId[l.from] && byId[l.to]).map((l) => {
      const a = P(byId[l.from]); const b = P(byId[l.to]);
      return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"/>`;
    }).join('');
    const dots = pts.map((s) => { const p = P(s); return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${s.kind === 'problem' ? 2.8 : 2.4}" fill="${ES.KINDS[s.kind].color}"/>`; }).join('');
    return `<svg class="glyph" viewBox="0 0 64 64" aria-hidden="true">${lines}${dots}</svg>`;
  }

  function card(k, ctx) {
    const joined = isJoinedProject(k, ctx);
    const active = ctx.focusId === k.id;
    const problems = k.solved.map((id) => ctx.byId[id]).filter(Boolean);
    const dists = k.links.map((l) => linkKm(l, ctx.byId)).filter((d) => d !== null);
    const badge = joined ? '<span class="badge badge-live">● You\'re in</span>'
      : (problems.length > 1 ? `<span class="badge badge-multi">${problems.length} challenges</span>` : '');
    return `<li><button type="button" class="k-card${active ? ' active' : ''}${joined ? ' is-launched' : ''}" data-action="focus" data-id="${esc(k.id)}" aria-pressed="${active}">
      ${glyph(k, ctx.byId)}
      <div>
        <div class="k-top"><span class="k-name">${esc(projectTitle(k))}</span>${badge}</div>
        <div class="chips">${problems.map((s) => `<span class="chip problem">${esc(s.name)}</span>`).join('')}</div>
        <div class="k-metrics">${dists.length ? `<span>nearest <b>${km(Math.min(...dists))}</b></span>` : ''}<span class="muted">${esc(k.gloss)}</span></div>
      </div>
    </button></li>`;
  }

  function pairList(links, byId) {
    return `<ul class="flows">${links.map((l) => {
      const d = linkKm(l, byId);
      return `<li><span>${esc(byId[l.from].name)}</span><span class="arrow">${d === null ? '↔' : km(d)}</span><span class="to">${esc(byId[l.to].name)}</span></li>`;
    }).join('')}</ul>`;
  }

  function focusBox(k, ctx) {
    const joined = isJoinedProject(k, ctx);
    const problems = k.solved.map((id) => ctx.byId[id]).filter(Boolean);
    const worstAqi = Math.max(0, ...problems.map((s) => (s.metrics && s.metrics.aqi) || 0));
    const dists = k.links.map((l) => linkKm(l, ctx.byId)).filter((d) => d !== null);
    const cells = [
      [problems.length, problems.length === 1 ? 'challenge nearby' : 'challenges nearby'],
      [worstAqi || '–', 'worst AQI'],
      [dists.length ? km(Math.min(...dists)) : '–', 'nearest distance'],
    ];
    return `<div class="focus-box${joined ? ' is-launched' : ''}">
      <div class="side-head"><span class="k-name">${esc(projectTitle(k))}</span><button type="button" class="icon-btn" data-action="unfocus" aria-label="Close project">×</button></div>
      <div class="k-gloss">${esc(k.gloss)}</div>
      <div class="impact-mini">${cells.map(([v, l]) => `<div><b>${esc(v)}</b><span>${l}</span></div>`).join('')}</div>
      <div class="actions">
        ${joined ? '<button type="button" class="btn btn-ghost btn-sm" disabled>● You\'re in this project</button>'
          : `<button type="button" class="btn btn-gold btn-sm" data-action="join-project" data-id="${esc(k.id)}">✦ Join this project</button>`}
        <button type="button" class="btn btn-ghost btn-sm" data-action="remix" data-id="${esc(k.id)}">✎ Remix</button>
      </div>
      <p class="sub-title">Why these are paired</p>
      ${pairList(k.links, ctx.byId)}
    </div>`;
  }

  function matchPill(star, ctx) {
    const m = ES.people.match(star, ctx);
    if (!m) return '';
    return `<div class="match"><span class="match-pct" style="--p:${m.pct}">${m.pct}%</span><span>match for you: ${esc(m.reasons.slice(0, 2).join(', '))}</span></div>`;
  }

  function starDetail(star, ctx) {
    const kind = ES.KINDS[star.kind];
    const joined = ctx.joined.has(star.id);
    const memberOf = ctx.constellations.filter((k) => k.ids.includes(star.id));
    const inCraft = ctx.craftIds.includes(star.id);
    const site = star.metrics && star.metrics.website
      ? `<a class="src" href="${esc(star.metrics.website)}" target="_blank" rel="noopener noreferrer">Website ↗</a>` : '';
    const craftBtn = ctx.mode === 'craft'
      ? `<button type="button" class="btn btn-ghost btn-sm" data-action="${inCraft ? 'craft-remove' : 'craft-add'}" data-id="${esc(star.id)}">${inCraft ? 'Remove from project' : '+ Add to project'}</button>` : '';
    const tipsBtn = star.category === 'air' && ctx.hasTips
      ? '<button type="button" class="btn btn-ghost btn-sm" data-action="toggle-tips">What you can do</button>' : '';
    return `<div class="detail">
      <div class="top"><span class="kind" style="color:${kind.color}">${esc(kind.label)}${hoodName(star.hood) ? ` · ${esc(hoodName(star.hood))}` : ''}</span>
        <button type="button" class="icon-btn" data-action="deselect" aria-label="Close details">×</button></div>
      <h4>${esc(star.name)}</h4>
      <div class="facts">${metric(star)}${sourceLine(star)}${site}</div>
      ${matchPill(star, ctx)}
      ${star.note ? `<p>${esc(star.note)}</p>` : ''}
      ${memberOf.length ? `<div class="row"><span>Projects</span><div class="chips">${memberOf.map((k) => `<button type="button" class="chip" data-action="focus" data-id="${esc(k.id)}">✦ ${esc(projectTitle(k))}</button>`).join('')}</div></div>` : ''}
      <div class="actions">
        <button type="button" class="btn btn-sm ${joined ? 'btn-ghost' : 'btn-gold'}" data-action="join" data-id="${esc(star.id)}" aria-pressed="${joined}">${joined ? '✓ In your constellation' : '✦ Add to my constellation'}</button>
        ${tipsBtn}${craftBtn}
      </div>
    </div>`;
  }

  function forYou(ctx) {
    if (!ctx.stars.length) return '';
    if (!ctx.profile) {
      return `<div class="for-you cta"><b>✦ Get matched</b><p>Tell us your neighbourhood and what you care about. We'll rank the real challenges and green spaces closest to you.</p>
        <button type="button" class="btn btn-primary btn-sm" data-open-join>Join in 30 seconds</button></div>`;
    }
    const recs = ES.people.recommend(ctx);
    if (!recs.length) return '';
    return `<div class="for-you"><div class="side-head"><h3>Picked for you, ${esc(ctx.profile.name)}</h3></div>
      <ul class="rec-list">${recs.map(({ star, m }) => `<li><button type="button" class="rec" data-action="select-star" data-id="${esc(star.id)}">
        <span class="match-pct sm" style="--p:${m.pct}">${m.pct}%</span>
        <span class="rec-body"><b><i class="dot" style="background:${ES.KINDS[star.kind].color}"></i>${esc(star.name)}</b><small>${esc(m.reasons.slice(0, 2).join(' · '))}</small></span>
      </button></li>`).join('')}</ul></div>`;
  }

  function emptyState(ctx) {
    if (ctx.liveStatus === 'loading') return '<div class="empty-state"><h4>Loading live data…</h4><p>Asking air monitors, OpenWeather and OpenStreetMap about this city.</p></div>';
    if (ctx.liveStatus === 'offline') return '<div class="empty-state"><h4>No live data</h4><p>Start the backend (<code>uvicorn main:app</code>). Earthstars never fills the map with made-up places.</p></div>';
    return '<div class="empty-state"><h4>Nothing found here yet</h4><p>No air monitor reports worse than "Good", it isn\'t hot, and OpenStreetMap lists no community gardens nearby. You can put something on the map with <b>＋ Report</b>.</p></div>';
  }

  function greenList(ctx) {
    const green = ctx.stars.filter((s) => s.kind === 'garden').slice(0, 12);
    if (!green.length) return '';
    return `<div class="side-head"><h3>Green spaces</h3><span class="muted small">${ctx.stars.filter((s) => s.kind === 'garden').length}</span></div>
      <ul class="rec-list">${green.map((s) => `<li><button type="button" class="rec" data-action="select-star" data-id="${esc(s.id)}">
        <span class="rec-body"><b><i class="dot" style="background:${ES.KINDS.garden.color}"></i>${esc(s.name)}</b><small>${esc([s.metrics.type, hoodName(s.hood)].filter(Boolean).join(' · '))}</small></span></button></li>`).join('')}</ul>`;
  }

  function discover(ctx) {
    const focus = ctx.constellations.find((k) => k.id === ctx.focusId);
    const head = `${ctx.selected ? starDetail(ctx.selected, ctx) : ''}${focus ? focusBox(focus, ctx) : ''}${!ctx.selected && !focus ? forYou(ctx) : ''}`;
    if (!ctx.stars.length) return head + emptyState(ctx);
    if (!ctx.constellations.length) {
      const problems = ctx.stars.filter((s) => s.kind === 'problem').length;
      return `${head}<p class="side-sub">${problems ? 'No green space within reach of the current challenges.' : 'No challenges right now: every air monitor reads "Good" and it isn\'t hot.'}</p>${greenList(ctx)}`;
    }
    return `${head}
      <div class="side-head"><h3>Projects near you</h3><span class="muted small">${ctx.constellations.length}</span></div>
      <p class="side-sub">Each pairs a measured challenge with the real green spaces closest to it.</p>
      <ul class="k-list">${ctx.constellations.map((k) => card(k, ctx)).join('')}</ul>`;
  }

  function craftEmpty() {
    return `<div class="empty-state">
      <svg viewBox="0 0 140 90" aria-hidden="true"><path d="M20 60 L60 25 L105 45 L80 75" fill="none" stroke="#ffd36b" stroke-dasharray="4 5" stroke-width="1.4"/>
        <circle cx="20" cy="60" r="4" fill="#ff6b5a"/><circle cx="60" cy="25" r="3.5" fill="#5be37d"/><circle cx="105" cy="45" r="4" fill="#ff6b5a"/><circle cx="80" cy="75" r="3.5" fill="#5be37d"/></svg>
      <h4>Build your own project</h4>
      <p>Click a <b class="t-red">challenge</b> on the map, then add the <b class="t-green">green spaces</b> you want to work from.</p>
    </div>`;
  }

  function gapRow(s, byId) {
    const anchor = byId[s.gap.star];
    const verb = s.gap.kind === 'need' ? 'needs' : 'has spare';
    const label = `${esc(anchor.name)} ${verb} ${esc(ES.FLOWS[s.gap.flow].label.toLowerCase())}`;
    const d = s.star && s.star.lat !== undefined && anchor.lat !== undefined ? km(ES.distKm(anchor, s.star)) : '';
    const hit = s.star ? `<br><span class="muted">→ ${esc(s.star.name)}${d ? ` · ${d}` : ''}</span>` : '<br><span class="muted">No match nearby</span>';
    return `<li><span>${label}${hit}</span>${s.star ? `<button type="button" data-action="craft-add" data-id="${esc(s.star.id)}">+ Add</button>` : ''}</li>`;
  }

  function craft(ctx) {
    const r = ctx.craft;
    const detail = ctx.selected ? starDetail(ctx.selected, ctx) : '';
    if (!ctx.craftIds.length) return detail + craftEmpty();
    const ready = r.solved.length > 0 && r.connected;
    const status = !r.connected && r.ids.length > 1 ? 'Some stars aren\'t linked yet' : `${r.solved.length} challenge${r.solved.length === 1 ? '' : 's'} paired with green space`;
    const picked = ctx.craftIds.map((id) => ctx.byId[id]).filter(Boolean)
      .map((s) => `<li><button type="button" data-action="craft-remove" data-id="${esc(s.id)}" style="--c:${ES.KINDS[s.kind].color}" aria-label="Remove ${esc(s.name)}"><i></i>${esc(s.name)} ×</button></li>`).join('');
    return `${detail}
      <div class="side-head"><h3>Your project</h3><button type="button" class="linklike small" data-action="craft-clear">Clear</button></div>
      <ul class="picked-list">${picked}</ul>
      <p class="side-sub">${status}</p>
      ${r.links.length ? `<p class="sub-title">Pairings</p>${pairList(r.links, ctx.byId)}` : ''}
      ${ctx.suggestions.length ? `<p class="sub-title">Open ends</p><ul class="gaps">${ctx.suggestions.map((s) => gapRow(s, ctx.byId)).join('')}</ul>` : ''}
      ${ready ? `<label class="field inline"><span>Name it</span><input id="craft-name" maxlength="40" value="${esc(ctx.craftName)}"></label>` : ''}
      <div class="actions"><button type="button" class="btn btn-gold btn-sm" data-action="craft-launch" ${ready ? '' : 'disabled'}>✦ Start this project</button></div>`;
  }

  function layers(ctx) {
    return Object.entries(ES.KINDS).map(([k, v]) => {
      const n = ctx.stars.filter((s) => s.kind === k).length;
      return `<li><button type="button" class="layer" data-action="toggle-layer" data-kind="${k}" aria-pressed="${!ctx.hidden.has(k)}" style="--c:${v.color}">
        <span class="sw"></span>${esc(v.plural)}<span class="n">${n}</span></button></li>`;
    }).join('');
  }

  function lone(ctx) {
    const covered = new Set(ctx.constellations.flatMap((k) => k.solved));
    const list = ctx.stars.filter((s) => s.kind === 'problem' && !covered.has(s.id));
    if (!ctx.stars.some((s) => s.kind === 'problem')) return '<li class="empty">No measured challenges right now</li>';
    if (!list.length) return '<li class="empty">✓ Every challenge has green space within reach</li>';
    return '<li class="muted small">No mapped green space within reach of these.</li>'
      + list.map((s) => `<li><button type="button" data-action="select-star" data-id="${esc(s.id)}">● ${esc(s.name)}</button></li>`).join('');
  }

  function tooltip(star, ctx) {
    const kind = ES.KINDS[star.kind];
    const joined = Boolean(ctx && ctx.joined.has(star.id));
    const src = star.reported ? 'Reported by you · not verified' : (star.source ? star.source.name : '');
    return `<span class="k" style="color:${kind.color}">${esc(kind.label)}${joined ? ' · ✓ yours' : ''}</span><b>${esc(star.name)}</b>
      <span class="tip-meta">${esc(src)}</span>`;
  }

  return { discover, craft, layers, lone, tooltip, esc, fmt, km, projectTitle };
})();
