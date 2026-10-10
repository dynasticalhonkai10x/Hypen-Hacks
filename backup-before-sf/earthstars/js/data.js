/* Earthstars vocabulary. There is no seed data here on purpose: every challenge and place on the map comes from
 * live APIs (WAQI air monitors, OpenWeather, OpenStreetMap) via the backend, or is reported by the user and
 * labelled unverified. */
window.ES = window.ES || {};

ES.KINDS = {
  problem: { label: 'Challenge',   plural: 'Challenges',   color: '#ff6b5a' },
  garden:  { label: 'Green space', plural: 'Green spaces', color: '#5be37d' },
};

/* What a link between a challenge and a green space means. */
ES.FLOWS = {
  greening: { label: 'Green space nearby', icon: '🌳' },
};

/* What people can say they care about at onboarding; maps to star.category. */
ES.INTERESTS = [
  { id: 'air',   label: 'Clean air' },
  { id: 'heat',  label: 'Cooler streets' },
  { id: 'green', label: 'Green spaces' },
];

ES.HOODS_BASE = [
  { id: 'northgate', name: 'Northgate',  x: 300, y: 150 },
  { id: 'oldmarket', name: 'Old Market', x: 610, y: 290 },
  { id: 'eastfield', name: 'Eastfield',  x: 960, y: 210 },
  { id: 'riverside', name: 'Riverside',  x: 270, y: 470 },
  { id: 'southpark', name: 'Southpark',  x: 900, y: 560 },
  { id: 'harbor',    name: 'Harbor',     x: 560, y: 620 },
];
ES.HOODS = ES.HOODS_BASE;

/**
 * Build an immutable star.
 * fields: { id, kind, category, name, hood, x, y, lat?, lng?, offers[], needs[], note?, source?, metrics?, reported? }
 * source: { name, url, updated } — where the data came from, so anyone can verify it.
 */
ES.makeStar = (f) => Object.freeze({
  id: f.id, kind: f.kind, category: f.category || 'reported', name: f.name, hood: f.hood, x: f.x, y: f.y,
  lat: Number.isFinite(f.lat) ? f.lat : undefined, lng: Number.isFinite(f.lng) ? f.lng : undefined,
  offers: f.offers || [], needs: f.needs || [], note: f.note || '',
  source: f.source || null, metrics: f.metrics || {}, reported: Boolean(f.reported), city: f.city || '',
});

/* A project = a real green space paired with the measured challenges within reach of it. */
ES.PROJECT_NAMES = {
  greening: { name: 'Green space within reach', gloss: 'Suggested pairing, computed from the real distance between them' },
};
ES.NAME_PRIORITY = ['greening'];
