/* The two forms: "Join Earthstars" (onboarding profile) and "Put something on the map" (report).
 * Each validates its own input and hands a clean object to the callback; app.js owns what happens next. */
window.ES = window.ES || {};

ES.dialogs = (() => {
  const $ = (sel) => document.querySelector(sel);
  const MAX_NAME = 30;

  const openDialog = (dlg) => { if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', ''); };
  const hoodOptions = () => ES.HOODS.map((h) => `<option value="${h.id}">${ES.panels.esc(h.name)}</option>`).join('');

  // ---------- join / onboarding ----------
  function readJoin(fd) {
    const name = String(fd.get('name') || '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
    const hood = String(fd.get('hood') || '');
    const interests = fd.getAll('interests').map(String).filter((id) => ES.INTERESTS.some((i) => i.id === id));
    if (!name) return { error: 'What should neighbours call you?' };
    if (!ES.HOODS_BASE.some((h) => h.id === hood)) return { error: 'Pick your neighbourhood.' };
    return { profile: { name, hood, interests } };
  }

  /** opts: { getProfile(), onSave(profile), onCancel() }. Returns open(). */
  function setupJoin({ getProfile, onSave, onCancel }) {
    const dlg = $('#join');
    const form = $('#join-form');
    let saved = false;
    dlg.addEventListener('close', () => { if (!saved && onCancel) onCancel(); }); // Later, ×, or Esc
    $('#j-interests').innerHTML = ES.INTERESTS.map((i) => `<label><input type="checkbox" name="interests" value="${i.id}"><span class="chip">${ES.panels.esc(i.label)}</span></label>`).join('');
    const open = () => {
      const p = getProfile();
      saved = false;
      form.reset();
      $('#j-hood').innerHTML = hoodOptions();
      $('#join-error').textContent = '';
      if (p) {
        form.elements.name.value = p.name;
        $('#j-hood').value = p.hood;
        form.querySelectorAll('input[name="interests"]').forEach((c) => { c.checked = p.interests.includes(c.value); });
      }
      openDialog(dlg);
    };
    document.addEventListener('click', (e) => { if (e.target.closest('[data-open-join]')) open(); });
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const result = readJoin(new FormData(form));
      if (result.error) { $('#join-error').textContent = result.error; return; }
      saved = true;
      dlg.close();
      onSave(result.profile);
    });
    return open;
  }

  // ---------- report ----------
  function readReport(fd) {
    const name = String(fd.get('name') || '').trim();
    const kind = String(fd.get('kind'));
    const hood = ES.HOODS.find((h) => h.id === fd.get('hood'));
    const offers = fd.getAll('offers').map(String).filter((f) => Object.hasOwn(ES.FLOWS, f));
    const needs = fd.getAll('needs').map(String).filter((f) => Object.hasOwn(ES.FLOWS, f) && !offers.includes(f));
    if (name.length < 3) return { error: 'Give it a name (at least 3 characters).' };
    if (!Object.hasOwn(ES.KINDS, kind) || !hood) return { error: 'Pick a type and a neighbourhood.' };
    if (!offers.length && !needs.length) return { error: 'Choose at least one thing it offers or needs. That is how stars connect.' };
    const a = Math.random() * Math.PI * 2; const r = 30 + Math.random() * 70;
    const x = Math.max(40, Math.min(1160, hood.x + Math.cos(a) * r));
    const y = Math.max(40, Math.min(680, hood.y + Math.sin(a) * r * 0.7));
    const note = String(fd.get('note') || '').trim().slice(0, 140);
    return {
      star: ES.makeStar({
        id: `u${Date.now().toString(36)}`, kind, category: 'reported', name: name.slice(0, 60), hood: hood.id,
        x: Math.round(x), y: Math.round(y), offers, needs, note, reported: true,
      }),
    };
  }

  function setupReport({ onSave }) {
    const dlg = $('#report');
    const form = $('#report-form');
    $('#f-kind').innerHTML = Object.entries(ES.KINDS).map(([k, v]) => `<option value="${k}">${ES.panels.esc(v.label)}</option>`).join('');
    const chips = (name) => Object.entries(ES.FLOWS).map(([k, f]) => `<label><input type="checkbox" name="${name}" value="${k}"><span class="chip">${f.icon} ${ES.panels.esc(f.label)}</span></label>`).join('');
    $('#f-offers').innerHTML = chips('offers');
    $('#f-needs').innerHTML = chips('needs');
    document.querySelectorAll('[data-open-report]').forEach((b) => b.addEventListener('click', () => {
      form.reset();
      $('#f-hood').innerHTML = hoodOptions();
      $('#form-error').textContent = '';
      openDialog(dlg);
    }));
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const result = readReport(new FormData(form));
      if (result.error) { $('#form-error').textContent = result.error; return; }
      dlg.close();
      onSave(result.star);
    });
  }

  const isOpen = () => $('#join').open || $('#report').open;

  return { setupJoin, setupReport, isOpen };
})();
