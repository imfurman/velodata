import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createIcons, Bike, Map as MapIcon, ChartNoAxesCombined, Route, Trophy, ArrowUpRight, Mountain, Clock3, Gauge, CalendarDays, Layers, Expand, X, Search, ChevronRight, Activity } from 'lucide';
import { summarize, filterRides, records, monthlyDistances, escapeHtml as esc, formatNumber as n, formatDate, duration } from './stats.js';
import './style.css';

const icons = { Bike, Map: MapIcon, ChartNoAxesCombined, Route, Trophy, ArrowUpRight, Mountain, Clock3, Gauge, CalendarDays, Layers, Expand, X, Search, ChevronRight, Activity };
const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const paintIcons = () => createIcons({ icons, attrs: { 'stroke-width': 1.6 } });
const app = document.querySelector('#app');
const state = { year: '', search: '', selected: null, colorByYear: false, page: 1 };
let rides = [], map, routesLayer, activeLayer, firstView = true;
const colors = ['#08765c', '#0868cf', '#824ac0', '#b66b0c'];
const routeColor = '#0868cf';
const selectedRouteColor = '#d44717';

async function init() {
  const response = await fetch(`${import.meta.env.BASE_URL}data/rides.json`);
  if (!response.ok) throw new Error('Не удалось загрузить поездки. Попробуй обновить страницу.');
  const data = await response.json();
  if (data.schemaVersion !== 1 || !Array.isArray(data.rides)) throw new Error('Неподдерживаемый формат данных.');
  rides = data.rides;
  const years = [...new Set(rides.map(r => r.date.slice(0, 4)))].sort().reverse();
  app.innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="#overview"><span class="brand-icon">${icon('bike')}</span>velo<span>data</span><span class="brand-dot">.</span></a>
      <div class="sidebar-label">ЛИЧНЫЙ ВЕЛОАТЛАС</div>
      <nav aria-label="Основная навигация">
        <a href="#overview" class="nav-link active">${icon('chart-no-axes-combined')}Обзор<span class="nav-dot"></span></a>
        <a href="#atlas" class="nav-link">${icon('map')}Карта поездок</a>
        <a href="#journal" class="nav-link">${icon('route')}Все поездки<span class="nav-count">${rides.length}</span></a>
        <a href="#achievements" class="nav-link">${icon('trophy')}Мои рекорды</a>
      </nav>
      <div class="sidebar-bottom"><div class="mini-route">${icon('route')}</div><p>Хорошие истории<br>начинаются с педалей.</p><span>${years.at(-1)} — ${years[0]}</span><div class="profile"><span class="avatar">Я</span><div><strong>Моя велоистория</strong><small>${rides.length} поездок в коллекции</small></div></div></div>
    </aside>
    <main id="overview">
      <header class="page-header"><div><div class="eyebrow">БОЛЬШЕ, ЧЕМ КИЛОМЕТРЫ</div><h1>Мой велоатлас<span>✳</span></h1><p>Дороги, которые стали частью моей истории.</p></div><label class="year-picker">${icon('calendar-days')}<select id="year" aria-label="Год поездок"><option value="">За всё время</option>${years.map(y => `<option value="${y}">${y} год</option>`).join('')}</select></label></header>
      <section class="metrics" id="metrics" aria-label="Общая статистика"></section>
      <section id="atlas" class="atlas-grid">
        <div class="map-card"><div class="section-heading"><div><span class="eyebrow">МОЯ ГЕОГРАФИЯ</span><h2>Там, где я проехал</h2></div><button id="fit-map" class="icon-button" title="Показать все маршруты" aria-label="Показать все маршруты">${icon('expand')}</button></div>
          <div class="map-wrap"><div id="map" aria-label="Интерактивная карта велопоездок"></div><div class="map-top"><span id="map-count" class="map-pill"></span><button id="map-style" class="map-pill">${icon('layers')}По годам</button></div><div class="map-bottom"><span><b class="legend-line"></b><span id="map-legend">Мои маршруты</span></span><span>Линии — мои истории</span></div><div id="map-error" class="map-error" hidden>Подложка недоступна. Маршруты по-прежнему отображаются.</div></div>
        </div>
        <div class="recent-card"><div class="section-heading"><div><span class="eyebrow">СНОВА В СЕДЛЕ</span><h2>Последние поездки</h2></div>${icon('route')}</div><div id="recent"></div><a class="text-link" href="#journal">Все поездки ${icon('arrow-up-right')}</a></div>
      </section>
      <section id="ride-detail" class="ride-detail" hidden aria-label="Подробности поездки"></section>
      <div id="insights"></div>
      <section id="journal" class="journal"><div class="section-heading"><div><span class="eyebrow">КОЛЛЕКЦИЯ ВПЕЧАТЛЕНИЙ</span><h2>Все поездки <span id="rides-count" class="count-badge"></span></h2></div><label class="search">${icon('search')}<input id="search" type="search" placeholder="Найти поездку…" aria-label="Найти поездку" /></label></div><div id="ride-list"></div><button id="load-more" class="outline-button">Показать ещё</button></section>
      <footer><a class="footer-brand" href="#overview">velo<span>data.</span></a><span>Каждый километр имеет значение.</span><span>FIT · GPX · TCX</span></footer>
    </main>`;
  map = L.map('map', { zoomControl: false, preferCanvas: true, scrollWheelZoom: false }).setView([42.1, 27.5], 8);
  // Separate panes keep every white outline below the colored routes at crossings.
  ['ride-outlines', 'ride-routes', 'selected-outline', 'selected-route'].forEach((name, index) => {
    map.createPane(name).style.zIndex = 410 + index * 10;
  });
  map.getPane('ride-outlines').style.pointerEvents = 'none';
  map.getPane('selected-outline').style.pointerEvents = 'none';
  map.getPane('selected-route').style.pointerEvents = 'none';
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19, opacity: .42, className: 'map-tiles' }).addTo(map);
  let failures = 0;
  tiles.on('tileerror', () => { if (++failures > 3) document.querySelector('#map-error').hidden = false; });
  tiles.on('tileload', () => { document.querySelector('#map-error').hidden = true; failures = 0; });
  routesLayer = L.featureGroup().addTo(map);
  activeLayer = L.featureGroup().addTo(map);
  document.querySelector('#year').addEventListener('change', event => { state.year = event.target.value; state.selected = null; state.page = 1; render(); });
  document.querySelector('#search').addEventListener('input', event => { state.search = event.target.value; state.page = 1; renderJournal(); });
  document.querySelector('#load-more').addEventListener('click', () => { state.page++; renderJournal(); });
  document.querySelector('#fit-map').addEventListener('click', () => { state.selected = null; renderDetail(); fitMap(); });
  document.querySelector('#map-style').addEventListener('click', event => { state.colorByYear = !state.colorByYear; event.currentTarget.classList.toggle('selected', state.colorByYear); event.currentTarget.setAttribute('aria-pressed', state.colorByYear); renderMap(false); });
  app.addEventListener('click', event => {
    const button = event.target.closest('[data-ride]');
    if (button) selectRide(button.dataset.ride);
    const nav = event.target.closest('.nav-link');
    if (nav) { document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active')); nav.classList.add('active'); }
  });
  render();
}

function currentRides() { return filterRides(rides, state.year); }
function render() {
  const filtered = currentRides(), s = summarize(filtered);
  document.querySelector('#metrics').innerHTML = [
    ['route', 'Проехал', n(s.km), 'км', `${s.count} поездок · ${state.year || 'за всё время'}`],
    ['mountain', 'Набрал высоту', n(s.elevation), 'м', `${n(s.elevation / 8849, 1)} × высота Эвереста`],
    ['clock-3', 'Время в седле', n(s.seconds / 3600), 'ч', `${n(s.seconds / 86400, 1)} дней в движении`],
    ['gauge', 'Средняя скорость', n(s.speed, 1), 'км/ч', 'По общему времени в движении'],
  ].map(([i, label, value, unit, note]) => `<article class="metric"><div class="metric-label">${icon(i)}${label}</div><div class="metric-number">${value}<span>${unit}</span></div><small>${note}</small></article>`).join('');
  document.querySelector('#recent').innerHTML = filtered.slice(0, 4).map((r, i) => `<button class="recent-ride" data-ride="${esc(r.id)}"><span class="ride-index">${String(i + 1).padStart(2, '0')}</span><span class="recent-body"><small>${formatDate(r.date, {year:'numeric'})}</small><strong>${esc(r.title)}</strong><span>${n(r.distanceKm, 1)} км <b>·</b> ${n(r.elevationM)} м ${icon('mountain')}</span></span>${icon('chevron-right')}</button>`).join('') || '<p class="empty">В этом году пока нет поездок.</p>';
  renderMap(true); renderDetail(); renderInsights(); renderJournal(); paintIcons();
}

function fitMap() { if (routesLayer.getLayers().length) map.fitBounds(routesLayer.getBounds(), { padding: [35, 40], maxZoom: 13 }); }
function renderMap(fit) {
  routesLayer.clearLayers();
  const filtered = currentRides();
  filtered.forEach(r => {
    if (!r.route.length) return;
    routesLayer.addLayer(L.polyline(r.route, { pane: 'ride-outlines', color: '#ffffff', weight: 6.5, opacity: .9, interactive: false, smoothFactor: 1.2 }));
    const line = L.polyline(r.route, { pane: 'ride-routes', color: state.colorByYear ? colors[Number(r.date.slice(0, 4)) % colors.length] : routeColor, weight: 3.2, opacity: .85, smoothFactor: 1.2 });
    const tooltip = document.createElement('span'); tooltip.textContent = `${r.title} · ${n(r.distanceKm, 1)} км`;
    line.bindTooltip(tooltip, { sticky: true }); line.on('click', () => selectRide(r.id)); routesLayer.addLayer(line);
  });
  document.querySelector('#map-count').innerHTML = `${icon('route')}${filtered.filter(r => r.route.length).length} маршрутов на карте`;
  updateRouteEmphasis();
  if (fit) {
    if (firstView && filtered.find(r => r.route.length)) {
      map.fitBounds(L.polyline(filtered.find(r => r.route.length).route).getBounds().pad(.4), { maxZoom: 12 });
      firstView = false;
    } else fitMap();
  }
  paintIcons();
}

function selectRide(id) { state.selected = id; renderDetail(); document.querySelector('#atlas').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function updateRouteEmphasis() {
  const selected = Boolean(state.selected);
  routesLayer.eachLayer(layer => {
    const outline = layer.options.pane === 'ride-outlines';
    layer.setStyle({ opacity: selected ? (outline ? .45 : .2) : (outline ? .9 : .85) });
  });
  document.querySelector('.legend-line').style.background = selected ? selectedRouteColor : routeColor;
  document.querySelector('#map-legend').innerHTML = selected ? 'Выбранная поездка' : state.colorByYear
    ? [...new Set(currentRides().map(r => r.date.slice(0,4)))].sort().map(y=>`<span style="color:${colors[Number(y)%4]}">${y}</span>`).join(' · ')
    : 'Мои маршруты';
}
function renderDetail() {
  activeLayer.clearLayers();
  const element = document.querySelector('#ride-detail'), r = rides.find(r => r.id === state.selected);
  element.hidden = !r;
  updateRouteEmphasis();
  if (!r) return;
  if (r.route.length) {
    activeLayer.addLayer(L.polyline(r.route, { pane: 'selected-outline', color: '#ffffff', weight: 9, opacity: 1, interactive: false }));
    activeLayer.addLayer(L.polyline(r.route, { pane: 'selected-route', color: selectedRouteColor, weight: 5, opacity: 1, interactive: false }));
    map.fitBounds(activeLayer.getBounds(), { padding: [50, 60], maxZoom: 15 });
  }
  element.innerHTML = `<div class="section-heading"><div><span class="eyebrow">${formatDate(r.date, {year:'numeric'})} · ${r.source.toUpperCase()}</span><h2>${esc(r.title)}</h2></div><button id="close-detail" class="icon-button" aria-label="Закрыть подробности">${icon('x')}</button></div><div class="detail-grid"><div class="detail-facts"><div><span>Дистанция</span><strong>${n(r.distanceKm, 1)} км</strong></div><div><span>В движении</span><strong>${duration(r.movingSeconds)}</strong></div><div><span>Набор высоты</span><strong>${n(r.elevationM)} м</strong></div><div><span>Средняя скорость</span><strong>${r.avgSpeed === null ? '—' : n(r.avgSpeed, 1)+' км/ч'}</strong></div><div><span>Время с остановками</span><strong>${duration(r.elapsedSeconds)}</strong></div><div><span>Велосипед</span><strong>${esc(r.bike || 'Не указан')}</strong></div></div><div class="elevation"><span class="eyebrow">ПРОФИЛЬ ВЫСОТЫ</span>${elevationChart(r.profile)}${!r.route.length ? '<p>В этой поездке нет GPS-трека.</p>':''}</div></div>`;
  document.querySelector('#close-detail').addEventListener('click', () => { state.selected = null; renderDetail(); fitMap(); }); paintIcons();
}

function elevationChart(points) {
  if (points.length < 2) return '<p class="empty">Нет данных о высоте.</p>';
  const maxX = Math.max(...points.map(p=>p[0]), 1), min = Math.min(...points.map(p=>p[1])), max = Math.max(...points.map(p=>p[1]), min+1);
  const line = points.map(([x,y])=>`${20+x/maxX*560},${145-(y-min)/(max-min)*115}`).join(' ');
  return `<svg viewBox="0 0 600 180" role="img" aria-label="Профиль высоты: от ${n(min)} до ${n(max)} метров"><defs><linearGradient id="elevation-fill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#176aca" stop-opacity=".35"/><stop offset="1" stop-color="#176aca" stop-opacity="0"/></linearGradient></defs><path d="M20 150 L${line.replaceAll(' ', ' L')} L580 150Z" fill="url(#elevation-fill)"/><polyline points="${line}" fill="none" stroke="#176aca" stroke-width="2"/><text x="20" y="16">${n(max)} м</text><text x="20" y="173">0 км</text><text x="580" y="173" text-anchor="end">${n(maxX,1)} км</text></svg>`;
}

function renderInsights() {
  const filtered = currentRides(), best = records(filtered);
  const monthly = monthlyDistances(filtered), peak = Math.max(...monthly, 1);
  const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
  const year = state.year || rides[0]?.date.slice(0,4) || String(new Date().getFullYear());
  const days = new Map();
  filtered.filter(r=>r.date.startsWith(year)).forEach(r=> { const day=days.get(r.date)||{km:0,rides:[]}; day.km+=r.distanceKm; day.rides.push(r); days.set(r.date,day); });
  let calendar = '';
  const start = new Date(`${year}-01-01T12:00:00Z`), finish = new Date(`${Number(year)+1}-01-01T12:00:00Z`);
  const padding = (start.getUTCDay()+6)%7;
  for(let i=0;i<padding;i++) calendar+='<span class="day padding"></span>';
  for(let date=new Date(start);date<finish;date.setUTCDate(date.getUTCDate()+1)) {
    const key=date.toISOString().slice(0,10), day=days.get(key), km=day?.km||0;
    const label=`${formatDate(key,{year:'numeric'})}: ${day?`${day.rides.length} поездок, ${n(km,1)} км`:'без поездок'}`;
    const level = km>=100 ? 4 : km>=50 ? 3 : km>=20 ? 2 : km>0 ? 1 : 0;
    calendar+=day?`<button class="day level-${level}" data-ride="${esc(day.rides[0].id)}" title="${esc(label)}" aria-label="${esc(label)}"></button>`:`<span class="day level-0" title="${esc(label)}"></span>`;
  }
  document.querySelector('#insights').innerHTML = `
    <div class="insights-grid">
      <section class="chart-card"><div class="section-heading"><div><span class="eyebrow">МОЙ РИТМ</span><h2>Километры по месяцам</h2></div><span class="chart-period">${state.year || 'Все годы'}</span></div>
      <div class="bar-chart" role="img" aria-label="Дистанция по месяцам. ${months.map((m,i)=>`${m}: ${n(monthly[i])} км`).join('; ')}"><div class="chart-grid"><span>${n(peak)} км</span><span>${n(peak/2)}</span><span>0</span></div><div class="bars">${monthly.map((km,i)=>`<div class="bar-column"><span class="bar-value">${km?n(km):''}</span><div class="bar-track"><div class="bar ${km===peak?'peak':''}" style="height:${km/peak*100}%" title="${months[i]}: ${n(km,1)} км"></div></div><span class="bar-month">${months[i]}</span></div>`).join('')}</div></div><p class="chart-note">${state.year ? `Дистанция за каждый месяц ${state.year} года.`:'Для каждого месяца сложены километры всех лет.'}</p></section>
      <section id="achievements" class="records-card"><div class="section-heading"><div><span class="eyebrow">ЕСТЬ ЧЕМ ГОРДИТЬСЯ</span><h2>Личные рекорды</h2></div>${icon('trophy')}</div><div class="record-list">${[
        [best.longest,'route','Самая длинная поездка','distanceKm','км'],
        [best.highest,'mountain','Самый большой набор','elevationM','м'],
        [best.fastest,'gauge','Самая быстрая · от 10 км','avgSpeed','км/ч'],
      ].map(([r,i,label,key,unit])=> r?`<button class="record" data-ride="${esc(r.id)}"><span class="record-icon">${icon(i)}</span><span><small>${label}</small><strong>${n(r[key],key==='elevationM'?0:1)} <em>${unit}</em></strong></span><span class="record-date">${formatDate(r.date,{year:'numeric'})}${icon('arrow-up-right')}</span></button>`:'<p class="empty">Пока недостаточно поездок.</p>').join('')}</div></section>
    </div>
    <section class="calendar-card"><div class="section-heading"><div><span class="eyebrow">ПЕДАЛЬ ЗА ПЕДАЛЬЮ</span><h2>Год в движении <span class="calendar-year">${year}</span></h2></div><span class="chart-period">${days.size} активных дней</span></div><div class="calendar-scroll"><div class="calendar-weekdays"><span>Пн</span><span>Ср</span><span>Пт</span><span>Вс</span></div><div class="calendar-grid">${calendar}</div></div><div class="calendar-footer"><span>Нажми на день, чтобы открыть поездку</span><span class="calendar-key">Меньше ${[0,1,2,3,4].map(i=>`<span class="day level-${i}"></span>`).join('')} Больше</span></div></section>`;
}
function renderJournal() {
  const filtered = filterRides(rides, state.year, state.search);
  document.querySelector('#rides-count').textContent = filtered.length;
  document.querySelector('#ride-list').innerHTML = `<div class="table-scroll"><table><thead><tr><th>Поездка</th><th>Дата</th><th>Расстояние</th><th>Набор высоты</th><th>В движении</th><th>Ср. скорость</th><th><span class="sr-only">Открыть</span></th></tr></thead><tbody>${filtered.slice(0,state.page*15).map(r=>`<tr class="${state.selected === r.id ? 'selected-row':''}"><td><button data-ride="${esc(r.id)}">${icon('bike')}<span>${esc(r.title)}</span></button></td><td>${formatDate(r.date,{year:'numeric'})}</td><td class="table-distance">${n(r.distanceKm,1)} <small>км</small></td><td>${n(r.elevationM)} м</td><td>${duration(r.movingSeconds)}</td><td>${r.avgSpeed === null ? '—':n(r.avgSpeed,1)+' км/ч'}</td><td><button class="icon-button" data-ride="${esc(r.id)}" aria-label="Открыть поездку ${esc(r.title)} от ${r.date}">${icon('arrow-up-right')}</button></td></tr>`).join('')}</tbody></table></div>${!filtered.length ? '<p class="empty">Поездки не найдены. Попробуй другое название или год.</p>':''}`;
  document.querySelector('#load-more').hidden = filtered.length <= state.page * 15; paintIcons();
}
init().catch(error => { map?.remove(); app.innerHTML = `<div class="load-error"><h1>Не получилось открыть велоатлас</h1><p>${esc(error.message)}</p><button onclick="location.reload()">Попробовать снова</button></div>`; });
