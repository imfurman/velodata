export const sum = (rides, key) => rides.reduce((total, ride) => total + (Number(ride[key]) || 0), 0);
export function summarize(rides) {
  const km = sum(rides, 'distanceKm');
  const seconds = sum(rides, 'movingSeconds');
  return { count: rides.length, km, seconds, elevation: sum(rides, 'elevationM'), speed: seconds ? km / (seconds / 3600) : 0 };
}
export function monthlyDistances(rides, year) {
  const months = Array(12).fill(0);
  rides.filter(r => !year || r.date.startsWith(String(year))).forEach(r => { months[Number(r.date.slice(5, 7)) - 1] += r.distanceKm; });
  return months;
}
export function filterRides(rides, year, search = '') {
  return rides.filter(r => (!year || r.date.startsWith(String(year))) && `${r.title} ${r.date} ${r.bike}`.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')));
}
export function records(rides) {
  const best = (key, items = rides) => items.reduce((a, b) => !a || (b[key] || 0) > (a[key] || 0) ? b : a, null);
  return { longest: best('distanceKm'), highest: best('elevationM'), fastest: best('avgSpeed', rides.filter(r => r.distanceKm >= 10)) };
}
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const formatNumber = (value, digits = 0) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value);
export const formatDate = (date, options = {}) => new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', ...options });
export function duration(seconds) { const minutes = Math.round(seconds / 60); return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`; }
