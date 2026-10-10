/* The constellation engine.
 * evaluate(): scores any set of stars — which offers feed which needs, what problems get solved, impact.
 * discover(): grows a constellation outward from every challenge, closing gaps with the nearest star. */
window.ES = window.ES || {};

ES.engine = (() => {
  const DISCOVERY_RADIUS = 420;   // map units (~4.2 km)
  const MAX_STARS = 7;
  const KG_PER_MEAL = 0.42;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const toKm = (units) => units / 100;

  /** Pick the nearest member offering `flow` to `taker`. */
  function nearestProvider(members, taker, flow) {
    return members
      .filter((s) => s.id !== taker.id && s.offers.includes(flow))
      .sort((a, b) => dist(a, taker) - dist(b, taker))[0];
  }

  function buildLinks(members) {
    const links = [];
    const unmet = [];
    members.forEach((taker) => {
      taker.needs.forEach((flow) => {
        const giver = nearestProvider(members, taker, flow);
        if (giver) links.push({ from: giver.id, to: taker.id, flow, km: toKm(dist(giver, taker)) });
        else unmet.push({ star: taker.id, flow, kind: 'need' });
      });
    });
    return { links, unmet };
  }

  /** A challenge is solved when every need is met and every waste stream it emits has a taker. */
  function solvedProblems(members, links, unmet) {
    return members.filter((s) => {
      if (s.kind !== 'problem') return false;
      const needsMet = !unmet.some((u) => u.star === s.id);
      const offersAbsorbed = s.offers.every((f) => links.some((l) => l.from === s.id && l.flow === f));
      return needsMet && offersAbsorbed;
    }).map((s) => s.id);
  }

  function unabsorbedOffers(members, links) {
    return members
      .filter((s) => s.kind === 'problem')
      .flatMap((s) => s.offers
        .filter((f) => !links.some((l) => l.from === s.id && l.flow === f))
        .map((flow) => ({ star: s.id, flow, kind: 'offer' })));
  }

  function isConnected(members, links) {
    if (members.length < 2) return members.length === 1;
    const parent = Object.fromEntries(members.map((s) => [s.id, s.id]));
    const find = (id) => (parent[id] === id ? id : find(parent[id]));
    links.forEach((l) => { parent[find(l.from)] = find(l.to); });
    return new Set(members.map((s) => find(s.id))).size === 1;
  }

  function impactOf(links) {
    return links.reduce((acc, l) => {
      const f = ES.FLOWS[l.flow];
      const kg = f.kg || 0;
      return {
        kg: acc.kg + kg,
        co2: acc.co2 + kg * (f.co2PerKg || 0) + (f.trees || 0) * (f.co2PerTree || 0),
        meals: acc.meals + (f.edible ? Math.round(kg / KG_PER_MEAL) : 0),
        hours: acc.hours + (f.hours || 0),
        trees: acc.trees + (f.trees || 0),
        m2: acc.m2 + (f.m2 || 0),
      };
    }, { kg: 0, co2: 0, meals: 0, hours: 0, trees: 0, m2: 0 });
  }

  /** Score any set of stars. Pure: never mutates its input. */
  function evaluate(memberIds, stars) {
    const members = memberIds.map((id) => stars.find((s) => s.id === id)).filter(Boolean);
    const { links, unmet } = buildLinks(members);
    const solved = solvedProblems(members, links, unmet);
    const loose = unabsorbedOffers(members, links);
    const impact = impactOf(links);
    const km = links.reduce((sum, l) => sum + l.km, 0);
    const connected = isConnected(members, links);
    const score = solved.length * 100 + impact.kg * 0.3 + links.length * 8 - km * 4 - (connected ? 0 : 60);
    return { ids: members.map((s) => s.id), links, unmet, loose, solved, impact, km, connected, score };
  }

  const fitsGap = (gap) => (gap.kind === 'need'
    ? (s) => s.offers.includes(gap.flow)
    : (s) => s.needs.includes(gap.flow));

  /** Nearest star outside `memberIds` that can close a gap (need → provider, loose offer → taker). */
  function findCloser(gap, memberIds, stars, origin) {
    const anchor = stars.find((s) => s.id === gap.star);
    return stars
      .filter((s) => !memberIds.includes(s.id) && fitsGap(gap)(s))
      .map((s) => ({ s, d: dist(s, anchor) }))
      .filter(({ s, d }) => d <= DISCOVERY_RADIUS && dist(s, origin) <= DISCOVERY_RADIUS * 1.4)
      .sort((a, b) => a.d - b.d)[0];
  }

  /** Other challenges nearby that the constellation's existing offers could also solve. */
  function piggybackProblems(memberIds, stars, origin) {
    const members = stars.filter((s) => memberIds.includes(s.id));
    const offered = new Set(members.flatMap((s) => s.offers));
    const needed = new Set(members.flatMap((s) => s.needs));
    return stars.filter((s) => s.kind === 'problem' && !memberIds.includes(s.id)
      && dist(s, origin) <= DISCOVERY_RADIUS
      && (s.needs.some((f) => offered.has(f)) || s.offers.some((f) => needed.has(f))));
  }

  function closeGaps(startIds, stars, origin) {
    let ids = [...startIds];
    const skipped = new Set();
    for (let step = 0; step < MAX_STARS * 2 && ids.length < MAX_STARS; step += 1) {
      const result = evaluate(ids, stars);
      const gaps = [...result.unmet, ...result.loose].filter((g) => !skipped.has(`${g.star}:${g.flow}`));
      if (!gaps.length) break;
      const gap = gaps[0];
      const hit = findCloser(gap, ids, stars, origin);
      if (hit) ids = [...ids, hit.s.id];
      else skipped.add(`${gap.star}:${gap.flow}`);
    }
    return ids;
  }

  /** Drop members that contribute no link (keeps constellations tight). */
  function prune(ids, stars) {
    const { links } = evaluate(ids, stars);
    const used = new Set(links.flatMap((l) => [l.from, l.to]));
    return ids.filter((id) => used.has(id));
  }

  function nameFor(result, stars, taken) {
    // Plain names like "Green the Block", from what the gardens give; anchored on the first garden.
    const byId = Object.fromEntries(stars.map((s) => [s.id, s]));
    const given = new Set(result.links.filter((l) => byId[l.from] && byId[l.from].kind === 'garden').map((l) => l.flow));
    const allFlows = new Set(result.links.map((l) => l.flow));
    const key = allFlows.has('space') ? 'space' : (ES.NAME_PRIORITY.find((f) => given.has(f)) || ES.NAME_PRIORITY[0]);
    const base = ES.PROJECT_NAMES[key];
    const members = result.ids.map((id) => byId[id]).filter(Boolean);
    const anchor = members.find((s) => s.kind === 'garden') || members[0];
    const hood = anchor ? anchor.hood : '';
    const nameKey = `${base.name}|${hood}`;
    return { name: taken.has(nameKey) ? `${base.name} II` : base.name, hood, gloss: base.gloss, flow: key, nameKey };
  }

  const keyOf = (ids) => [...ids].sort().join('|');

  /** Accept a grown set only if it stays one connected constellation and scores higher. */
  function better(currentIds, grownIds, stars) {
    const pruned = prune(grownIds, stars);
    const next = evaluate(pruned, stars);
    const now = evaluate(currentIds, stars);
    return next.connected && pruned.length <= MAX_STARS && next.score > now.score ? pruned : currentIds;
  }

  /** Resource stars pass along what they make: compost → a garden, produce → a food bank. */
  function chainTakers(ids, stars, origin) {
    const { links } = evaluate(ids, stars);
    return stars
      .filter((s) => ids.includes(s.id) && s.kind !== 'problem')
      .flatMap((s) => s.offers
        .filter((f) => !links.some((l) => l.from === s.id && l.flow === f))
        .map((flow) => findCloser({ star: s.id, flow, kind: 'offer' }, ids, stars, origin)))
      .filter(Boolean)
      .map((hit) => hit.s);
  }

  function growFrom(problem, stars) {
    let ids = prune(closeGaps([problem.id], stars, problem), stars);
    piggybackProblems(ids, stars, problem).slice(0, 2).forEach((p) => {
      ids = better(ids, closeGaps([...ids, p.id], stars, problem), stars);
    });
    chainTakers(ids, stars, problem).slice(0, 2).forEach((t) => {
      ids = better(ids, closeGaps([...ids, t.id], stars, problem), stars);
    });
    return evaluate(ids, stars);
  }

  /** Find the best constellations in the sky. */
  function discover(stars) {
    const seen = new Set();
    const candidates = stars
      .filter((s) => s.kind === 'problem')
      .map((problem) => growFrom(problem, stars))
      .filter((r) => r.solved.length > 0 && r.connected && r.links.length > 0)
      .sort((a, b) => b.score - a.score)
      .filter((r) => {
        const key = keyOf(r.ids);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    // Drop any constellation fully contained in a stronger one.
    const kept = candidates.filter((r, i) => !candidates.some((o, j) => j !== i
      && o.ids.length > r.ids.length && r.ids.every((id) => o.ids.includes(id))));

    const taken = new Set();
    return kept.map((r) => {
      const n = nameFor(r, stars, taken);
      taken.add(n.nameKey);
      return { ...r, ...n, id: keyOf(r.ids) };
    });
  }

  /** Members with no link at all: suggest a partner for what they offer (or need). */
  function isolatedGaps(result, stars) {
    if (result.ids.length < 2) return [];
    const linked = new Set(result.links.flatMap((l) => [l.from, l.to]));
    const open = new Set([...result.unmet, ...result.loose].map((g) => g.star));
    return stars
      .filter((s) => result.ids.includes(s.id) && !linked.has(s.id) && !open.has(s.id))
      .map((s) => (s.offers.length
        ? { star: s.id, flow: s.offers[0], kind: 'offer' }
        : { star: s.id, flow: s.needs[0], kind: 'need' }))
      .filter((g) => g.flow);
  }

  /** For crafting: the best star to add next for each open gap. */
  function suggestions(memberIds, stars) {
    const result = evaluate(memberIds, stars);
    return [...result.unmet, ...result.loose, ...isolatedGaps(result, stars)].map((gap) => {
      const anchor = stars.find((s) => s.id === gap.star);
      const best = stars
        .filter((s) => !memberIds.includes(s.id) && fitsGap(gap)(s))
        .sort((a, b) => dist(a, anchor) - dist(b, anchor))[0];
      return { gap, star: best, km: best ? toKm(dist(best, anchor)) : null };
    });
  }

  return { evaluate, discover, suggestions, impactOf, nameFor, keyOf, toKm, dist };
})();
