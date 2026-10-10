/* Worldwide city search box: debounced autocomplete with full keyboard support (↑ ↓ Enter Esc). */
window.ES = window.ES || {};

ES.cityPicker = (() => {
  const DEBOUNCE_MS = 280;
  const fmtPop = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M people` : n >= 1e3 ? `${Math.round(n / 1e3)}k people` : '');

  function create({ input, list, onPick }) {
    const { esc } = ES.panels;
    let results = [];
    let active = -1;
    let timer = null;
    let controller = null;

    const open = (isOpen) => { list.hidden = !isOpen; input.setAttribute('aria-expanded', String(isOpen)); };

    function paint(message) {
      if (message) {
        list.innerHTML = `<li class="city-msg" role="option" aria-disabled="true">${esc(message)}</li>`;
        open(true);
        return;
      }
      list.innerHTML = results.map((r, i) => `<li role="option" id="city-opt-${i}" data-i="${i}" aria-selected="${i === active}">
        <span class="fl" aria-hidden="true">${ES.flag(r.cc)}</span>
        <span class="nm"><b>${esc(r.name)}</b><small>${esc([r.region, r.country].filter(Boolean).join(', '))}</small></span>
        <span class="pop">${fmtPop(r.population)}</span></li>`).join('');
      input.setAttribute('aria-activedescendant', active >= 0 ? `city-opt-${active}` : '');
      open(results.length > 0);
    }

    function choose(i) {
      const r = results[i];
      if (!r) return;
      open(false);
      input.value = '';
      results = [];
      onPick(r);
      input.blur();
    }

    async function run(q) {
      if (controller) controller.abort();
      controller = new AbortController();
      try {
        paint('Searching the globe…');
        results = await ES.geo.search(q, controller.signal);
        active = results.length ? 0 : -1;
        if (results.length) paint(); else paint(`No city called “${q}” found`);
      } catch (err) {
        if (err.name === 'AbortError') return;
        results = [];
        paint('City search needs an internet connection');
      }
    }

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { results = []; open(false); return; }
      timer = setTimeout(() => run(q), DEBOUNCE_MS);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!results.length) return;
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
        paint();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        choose(active >= 0 ? active : 0);
      } else if (e.key === 'Escape') {
        open(false);
      }
    });
    list.addEventListener('mousedown', (e) => { // mousedown beats the input's blur
      const li = e.target.closest('[data-i]');
      if (!li) return;
      e.preventDefault();
      choose(Number(li.dataset.i));
    });
    input.addEventListener('blur', () => setTimeout(() => open(false), 120));
    input.addEventListener('focus', () => { if (results.length) paint(); });
  }

  return { create };
})();
