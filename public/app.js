/**
 * BROWSER APPLICATION
 * This file draws the screens and handles clicks and forms.
 * PHP remains responsible for permissions, validation and saving records.
 * Read docs/CODE_GUIDE.md for the request flow and a suggested reading order.
 */
'use strict';
// 1. Shared helpers and screen state
// $ finds one HTML element; $$ finds all matching elements.
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
// Escape values before inserting them into HTML so record text is not treated as code.
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
// state holds the latest server data. session holds the signed-in user and CSRF token.
// page, farmFilter and search describe the current screen; they are not database records.
let state = { records: [], catalog: {}, settings: {} },
  session = {},
  page = 'dashboard',
  farmFilter = '',
  search = '',
  archive = false;
const admin = () => ['Owner', 'Administrator'].includes(session.user?.role);
const num = (v) => Number(v) || 0;
const fmt = (v) => num(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
const money = (v) => `${esc(state.settings.currency || 'ZMW')} ${fmt(v)}`;
const today = () => new Date().toLocaleDateString('en-CA');
const dateText = (v) =>
  v
    ? new Date(v + 'T12:00:00').toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';
const all = (module, inc = false) =>
  state.records.filter((r) => r.module === module && (inc || !r.archived_at));
const rows = (module) =>
  all(module).filter((r) => !farmFilter || !r.data.farm || String(r.data.farm) === farmFilter);
const find = (id) => state.records.find((r) => r.id === Number(id));
const label = (id) => find(id)?.data.name || '—';
const total = (items, key) => items.reduce((s, r) => s + num(r.data[key]), 0);
// 2. Server communication and feedback
// A toast is the short confirmation or error message shown after an action.
function toast(text, error = false) {
  const t = $('#toast');
  t.textContent = text;
  t.className = error ? 'show error' : 'show';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.className = ''), 6000);
}
// All regular API requests pass through here. A CSRF token ties changes to this session.
async function api(action, data) {
  const res = await fetch('/api.php?action=' + action, {
    method: data ? 'POST' : 'GET',
    headers: data ? { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  let out;
  try {
    out = await res.json();
  } catch {
    throw Error('The server did not return a valid response.');
  }
  if (!res.ok) {
    if (res.status === 401) {
      session.user = null;
      renderAuth();
    }
    throw Error(out.error || 'Request failed.');
  }
  return out;
}
async function refresh() {
  state = await api('state');
  session.user = state.user;
  session.csrf = state.csrf;
}
// 3. Display calculations
// Display the stock ledger: opening + movements + receipts + net harvest - confirmed sales.
// src/app.php calculates and validates this again before saving; the browser is not trusted.
function stock() {
  const b = {};
  for (const r of all('inventory')) b[r.id] = num(r.data.opening);
  for (const r of state.records.filter((r) => !r.archived_at)) {
    const d = r.data;
    if (!(d.item in b)) continue;
    if (r.module === 'stock_moves') b[d.item] += num(d.quantity) * (d.direction === 'In' ? 1 : -1);
    if (r.module === 'purchases' && d.status === 'Received') b[d.item] += num(d.quantity);
    if (r.module === 'sales' && d.status === 'Confirmed') b[d.item] -= num(d.quantity);
    if (r.module === 'harvests') b[d.item] += num(d.quantity) - num(d.loss);
  }
  return b;
}
// Build reminders from saved dates, low stock and recorded problems. No messages are sent here.
function alerts() {
  const out = [],
    date = today(),
    soon = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA'),
    b = stock();
  for (const r of state.records.filter(
    (r) => !r.archived_at && (!farmFilter || !r.data.farm || String(r.data.farm) === farmFilter),
  )) {
    const d = r.data;
    const push = (message, level = 'notice') =>
      out.push({ message, level, module: r.module, id: r.id });
    if (r.module === 'inventory') {
      if (num(b[r.id]) <= d.minimum)
        push(`${d.name}: ${fmt(b[r.id])} ${d.unit} left; threshold ${fmt(d.minimum)}.`, 'warning');
      if (d.expiry && d.expiry <= soon)
        push(
          `${d.name}: ${d.expiry < date ? 'expired' : 'expires'} ${dateText(d.expiry)}.`,
          'warning',
        );
    }
    if (
      r.module === 'scouting' &&
      d.status !== 'Resolved' &&
      ['High', 'Critical'].includes(d.severity)
    )
      push(`${d.name}: ${d.severity.toLowerCase()} pest or disease observation.`, 'warning');
    if (
      ['irrigation_systems', 'water_sources'].includes(r.module) &&
      ['Fault', 'Unavailable', 'Low'].includes(d.status)
    )
      push(`${d.name}: ${d.status.toLowerCase()}.`, 'warning');
    let due = d.next_due;
    if (
      ['tasks', 'irrigation'].includes(r.module) &&
      !['Done', 'Completed', 'Cancelled'].includes(d.status)
    )
      due = d.date;
    if (r.module === 'plantings' && !['Harvested', 'Failed'].includes(d.stage)) due = d.harvest_on;
    if (due && due <= soon && !['Cancelled', 'Settled'].includes(d.status))
      push(`${d.name}: due ${dateText(due)}.`, due < date ? 'warning' : 'notice');
  }
  return out;
}
// 4. Shared screen layout
// Rebuild the sidebar, account controls and farm filter around the selected page.
function shell() {
  const groups = {};
  Object.values(state.catalog).forEach((m) => (groups[m.group] ??= []).push(m));
  $('#app').innerHTML =
    `<aside class="sidebar"><a class="brand" href="#dashboard"><img class="brand-mark" src="/acremind-logo.svg" alt="" width="48" height="48"><span>AcreMind<small>FARM MANAGEMENT</small></span></a><nav><a href="#dashboard" class="nav-link ${page === 'dashboard' ? 'active' : ''}"><span>◫</span> Overview</a>${Object.entries(
      groups,
    )
      .map(
        ([group, modules]) =>
          `<details ${modules.some((m) => m.id === page) ? 'open' : ''}><summary>${esc(group)}</summary>${modules.map((m) => `<a class="nav-link ${page === m.id ? 'active' : ''}" href="#${m.id}">${esc(m.label)}</a>`).join('')}</details>`,
      )
      .join('')}<div class="nav-divider"></div>${[
      ['reports', 'Reports'],
      ['alerts', 'Alerts'],
      ['weather', 'Weather & maps'],
      ['advisor', 'Farm advisor'],
      ['archive', 'Archive'],
      ['settings', 'Settings'],
    ]
      .map(
        ([id, name]) =>
          `<a href="#${id}" class="nav-link ${page === id ? 'active' : ''}">${name}${id === 'alerts' && alerts().length ? `<b class="nav-count">${alerts().length}</b>` : ''}</a>`,
      )
      .join(
        '',
      )}${admin() ? '<a href="#admin" class="nav-link">Admin overview</a><a href="#team" class="nav-link">Team & access</a><a href="#audit" class="nav-link">Activity log</a>' : ''}</nav><div class="profile"><span class="avatar">${esc(session.user.name[0])}</span><div><b>${esc(session.user.name)}</b><small>${esc(session.user.role)}</small></div><button id="logout" class="icon-button" aria-label="Sign out">↪</button></div></aside><main><div class="topbar"><button class="icon-button menu-button" id="menu" aria-label="Toggle navigation">☰</button><span>${esc(state.settings.name)}</span><div class="topbar-right"><label class="sr-only" for="farm-filter">Filter by farm</label><select id="farm-filter"><option value="">All farms</option>${all(
      'farms',
    )
      .map(
        (r) =>
          `<option value="${r.id}" ${String(r.id) === farmFilter ? 'selected' : ''}>${esc(r.data.name)}</option>`,
      )
      .join(
        '',
      )}</select><span class="date-label">${dateText(today())}</span></div></div><div id="content"></div><footer>AcreMind · Your records are saved on this server.</footer></main>`;
  $('#logout').onclick = async () => {
    await api('logout', {});
    session = await api('session');
    renderAuth();
  };
  $('#farm-filter').disabled = page === 'admin';
  $('#farm-filter').onchange = (e) => {
    farmFilter = e.target.value;
    render();
  };
  $('#menu').onclick = () => $('.sidebar').classList.toggle('mobile-open');
}
// Small HTML helpers keep page headings, tables and badges consistent.
function heading(title, description, action = '') {
  return `<header class="page-header"><div><p class="eyebrow">FARM OPERATIONS</p><h1>${esc(title)}</h1><p class="muted">${esc(description)}</p></div>${action}</header>`;
}
function metrics(items) {
  return `<div class="metrics">${items.map(([label, value, sub]) => `<section class="metric"><span>${esc(label)}</span><strong>${value}</strong><small>${esc(sub || '')}</small></section>`).join('')}</div>`;
}
function empty(title, text, action = '') {
  return `<div class="empty"><div class="empty-symbol">＋</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}
function table(headers, data) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${data.map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function badge(v) {
  return `<span class="badge ${['Done', 'Completed', 'Received', 'Confirmed', 'Active', 'Operational', 'Resolved'].includes(v) ? 'good' : ['Fault', 'Critical', 'Dead', 'Problem', 'High'].includes(v) ? 'bad' : ''}">${esc(v)}</span>`;
}
function alertList(items) {
  return items.length
    ? `<div class="alert-list">${items
        .slice(0, 25)
        .map(
          (a) =>
            `<button class="alert-row" data-open="${a.id}"><span class="alert-icon ${a.level}">!</span><span>${esc(a.message)}<small>${esc(state.catalog[a.module]?.label)}</small></span><span>›</span></button>`,
        )
        .join('')}</div>`
    : '<p class="muted padded">No alerts from your current records.</p>';
}
// Draw a six-month comparison using actual payments, not unpaid invoices.
function cashChart() {
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5 + i);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString(undefined, { month: 'short' }),
      income: 0,
      expense: 0,
    };
  });
  for (const r of rows('payments')) {
    const m = months.find((m) => r.data.date.startsWith(m.key));
    if (m) m[r.data.direction === 'Income' ? 'income' : 'expense'] += num(r.data.amount);
  }
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));
  return `<div class="chart-legend"><span>● Income</span><span>● Expenses</span></div><svg class="cash-chart" viewBox="0 0 600 190" role="img" aria-label="Income and expenses for the last six months">${months.map((m, i) => `<rect x="${35 + i * 95}" y="${150 - (m.income / max) * 120}" width="22" height="${(m.income / max) * 120}" rx="4" fill="#1a7054"><title>${esc(m.label)} income ${fmt(m.income)}</title></rect><rect x="${61 + i * 95}" y="${150 - (m.expense / max) * 120}" width="22" height="${(m.expense / max) * 120}" rx="4" fill="#d4a148"><title>${esc(m.label)} expenses ${fmt(m.expense)}</title></rect><text x="${58 + i * 95}" y="178" text-anchor="middle" fill="#526760" font-size="14">${esc(m.label)}</text>`).join('')}<line x1="20" x2="590" y1="151" y2="151" stroke="#dce5e1"/></svg>`;
}
// 5. Main pages
// Each page function returns HTML. render() chooses which page to show.
function dashboard() {
  const farms = all('farms').filter((r) => !farmFilter || String(r.id) === farmFilter),
    payments = rows('payments'),
    income = total(
      payments.filter((r) => r.data.direction === 'Income'),
      'amount',
    ),
    expense = total(
      payments.filter((r) => r.data.direction === 'Expense'),
      'amount',
    ),
    plants = rows('plantings').filter((r) => !['Harvested', 'Failed'].includes(r.data.stage));
  return (
    heading(
      'Your farm at a glance',
      'A clear view of your land, production and daily priorities.',
      state.catalog.farms?.writable
        ? '<button class="primary" data-add="farms">＋ Register farm</button>'
        : '',
    ) +
    metrics([
      [
        'Farm area',
        `${fmt(total(farms, 'hectares'))}<small> ha</small>`,
        `${farms.length} registered farms`,
      ],
      ['Active plantings', plants.length, 'Current growing cycles'],
      [
        'Livestock',
        rows('animals').filter((r) => r.data.status === 'Active').length,
        'Active animals',
      ],
      [
        'Net cash flow',
        state.catalog.payments ? money(income - expense) : 'Restricted',
        state.catalog.payments ? 'Recorded income less expenses' : 'Available to finance roles',
      ],
    ]) +
    (!farms.length && state.catalog.farms?.writable
      ? `<section class="welcome-panel"><div><p class="eyebrow">START WITH YOUR LAND</p><h2>Your first season starts here.</h2><p>Register a farm, add its fields, then plan your crops. Your dashboard will fill with your own records as you work.</p></div><button class="primary" data-add="farms">Register your first farm</button></section>`
      : '') +
    `<div class="two-column"><section class="panel"><div class="panel-heading"><h2>Cash flow</h2><a href="#reports">View reports ↗</a></div>${cashChart()}</section><section class="panel"><div class="panel-heading"><h2>Needs attention</h2><a href="#alerts">${alerts().length} alerts ↗</a></div>${alertList(alerts().slice(0, 5))}</section></div><section class="panel"><div class="panel-heading"><h2>Upcoming harvests</h2><a href="#plantings">All plantings ↗</a></div>${
      plants.length
        ? table(
            ['Planting', 'Field', 'Stage', 'Expected harvest', 'Expected yield'],
            plants
              .sort((a, b) => a.data.harvest_on.localeCompare(b.data.harvest_on))
              .slice(0, 6)
              .map((r) => [
                `<button class="text-button" data-open="${r.id}">${esc(r.data.name)}</button>`,
                esc(label(r.data.field)),
                badge(r.data.stage),
                dateText(r.data.harvest_on),
                `${fmt(r.data.expected_yield)} kg`,
              ]),
          )
        : empty(
            'No upcoming harvests',
            'Add crop varieties and planting records to start your crop calendar.',
          )
    }</section>`
  );
}
function displayField(f, v) {
  if (v === null || v === '') return '—';
  if (f.type === 'reference') return esc(label(v));
  if (f.type === 'date') return dateText(v);
  if (f.type === 'number') return fmt(v);
  if (f.type === 'select') return badge(v);
  return esc(String(v).length > 70 ? String(v).slice(0, 67) + '…' : v);
}
function modulePage() {
  const m = state.catalog[page];
  if (!m) return heading('Module unavailable', 'Your role does not have access to this module.');
  const fields = m.fields.filter((f) => !['notes', 'farm'].includes(f.key)).slice(0, 5);
  const b = stock();
  let list = rows(page).filter((r) =>
    JSON.stringify(r.data).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    heading(
      m.label,
      m.description,
      m.writable ? `<button class="primary" data-add="${page}">＋ Add record</button>` : '',
    ) +
    `<section class="panel"><div class="toolbar"><label><span class="sr-only">Search records</span><input id="search" placeholder="Search ${esc(m.label.toLowerCase())}…" value="${esc(search)}"></label><span class="muted">${list.length} records</span><button class="secondary" id="export">Export CSV</button></div>${
      list.length
        ? table(
            [
              ...fields.map((f) => f.label),
              ...(page === 'inventory' ? ['Available'] : []),
              'Actions',
            ],
            list.map((r) => [
              ...fields.map((f) => displayField(f, r.data[f.key])),
              ...(page === 'inventory' ? [`<b>${fmt(b[r.id])} ${esc(r.data.unit)}</b>`] : []),
              `<button class="text-button" data-open="${r.id}">${m.writable ? 'View / edit' : 'View'}</button>`,
            ]),
          )
        : empty(
            `No ${m.label.toLowerCase()} yet`,
            'Add a record to begin. You can search and export records here.',
            m.writable
              ? `<button class="primary" data-add="${page}">Add first record</button>`
              : '',
          )
    }</section>`
  );
}
// Financial totals use payments; invoice totals and operational costs are shown separately.
function reportPage() {
  if (!state.catalog.payments) return operationalReport();
  const p = rows('payments'),
    income = total(
      p.filter((r) => r.data.direction === 'Income'),
      'amount',
    ),
    cost = total(
      p.filter((r) => r.data.direction === 'Expense'),
      'amount',
    ),
    b = stock(),
    harvest = rows('harvests'),
    net = total(harvest, 'quantity') - total(harvest, 'loss'),
    sold = rows('sales').filter((r) => r.data.status === 'Confirmed');
  const production = rows('plantings').map((r) => {
    const hs = harvest.filter((h) => h.data.planting === r.id),
      kg = total(hs, 'quantity') - total(hs, 'loss'),
      cp = p.filter((x) => x.data.planting === r.id),
      rev = total(
        cp.filter((x) => x.data.direction === 'Income'),
        'amount',
      ),
      exp = total(
        cp.filter((x) => x.data.direction === 'Expense'),
        'amount',
      );
    return [
      esc(r.data.name),
      fmt(r.data.expected_yield),
      fmt(kg),
      fmt(kg / r.data.hectares),
      money(exp),
      money(rev - exp),
    ];
  });
  const animals = rows('animals'),
    deaths = animals.filter((r) => r.data.status === 'Dead').length;
  return (
    heading(
      'Reports & analytics',
      'Figures are calculated from active records. Cash payments and invoice sales are shown separately.',
      '<button class="secondary" id="print">Print report</button>',
    ) +
    metrics([
      ['Cash income', money(income)],
      ['Cash expenses', money(cost)],
      ['Cash surplus', money(income - cost)],
      ['Net harvest', `${fmt(net)} kg`],
    ]) +
    `<div class="two-column"><section class="panel"><h2>Income and expenditure</h2>${cashChart()}${table(
      ['Measure', 'Amount'],
      [
        [
          'Confirmed invoice sales',
          money(sold.reduce((s, r) => s + r.data.quantity * r.data.unit_price, 0)),
        ],
        [
          'Inventory valuation',
          money(rows('inventory').reduce((s, r) => s + b[r.id] * r.data.unit_cost, 0)),
        ],
        [
          'Cash return on expenses',
          cost ? fmt(((income - cost) / cost) * 100) + '%' : 'No recorded expenses',
        ],
        [
          'Cost per farm hectare',
          money(
            cost /
              Math.max(
                0.01,
                total(
                  all('farms').filter((r) => !farmFilter || String(r.id) === farmFilter),
                  'hectares',
                ),
              ),
          ),
        ],
        ['Cash cost per harvested kg', net ? money(cost / net) : 'No harvested quantity'],
      ],
    )}</section><section class="panel"><h2>Operational summary</h2>${table(
      ['Measure', 'Total'],
      [
        ['Animals registered', animals.length],
        ['Recorded deaths', deaths],
        [
          'Mortality / registered animals',
          animals.length ? fmt((deaths / animals.length) * 100) + '%' : '—',
        ],
        ['Water used', fmt(total(rows('irrigation'), 'water')) + ' m³'],
        ['Irrigation costs', money(total(rows('irrigation'), 'cost'))],
        ['Equipment service costs', money(total(rows('maintenance'), 'cost'))],
        ['Fuel used', fmt(total(rows('maintenance'), 'fuel')) + ' L'],
        ['Attendance pay earned', money(total(rows('attendance'), 'pay'))],
        ['Completed tasks', rows('tasks').filter((r) => r.data.status === 'Done').length],
        [
          'Open pest observations',
          rows('scouting').filter((r) => r.data.status !== 'Resolved').length,
        ],
      ],
    )}<p class="muted small">Operational costs and earned pay are not added to cash expenses automatically. Record payments once they are paid.</p></section></div><section class="panel"><h2>Production and crop profitability</h2><p class="muted">Profit uses payments explicitly allocated to each planting.</p>${production.length ? table(['Planting', 'Expected kg', 'Actual net kg', 'kg / ha', 'Allocated costs', 'Allocated cash profit'], production) : empty('No production records', 'Plantings and harvests will appear here.')}</section><section class="panel"><h2>Budgets against actual spending</h2>${table(
      ['Budget', 'Period', 'Budget', 'Cash spent', 'Remaining'],
      rows('budgets').map((r) => {
        const d = r.data,
          spent = total(
            p.filter(
              (x) =>
                x.data.direction === 'Expense' &&
                x.data.farm === d.farm &&
                x.data.category === d.category &&
                x.data.date >= d.date &&
                x.data.date <= d.end_date,
            ),
            'amount',
          );
        return [
          esc(d.name),
          dateText(d.date) + ' – ' + dateText(d.end_date),
          money(d.amount),
          money(spent),
          money(d.amount - spent),
        ];
      }),
    )}</section><section class="panel"><h2>Equipment book values</h2><p class="muted">Straight-line estimates from purchase and residual values, not tax depreciation.</p>${table(
      ['Equipment', 'Purchase value', 'Estimated book value'],
      rows('equipment').map((r) => {
        const d = r.data,
          years = Math.max(0, (Date.now() - new Date(d.purchased_on)) / 31557600000),
          value = Math.max(d.salvage, d.cost - ((d.cost - d.salvage) / d.useful_years) * years);
        return [esc(d.name), money(d.cost), money(value)];
      }),
    )}</section><section class="panel"><h2>Export a detailed register</h2><p class="muted">Every module includes CSV export for production, livestock, finance, sales, inventory, labour, irrigation, pests and equipment.</p><div class="report-links">${Object.values(
      state.catalog,
    )
      .map((m) => `<a href="#${m.id}">${esc(m.label)} ↗</a>`)
      .join('')}</div></section>`
  );
}
// Planning estimates use recorded crop history or entered expectations.
// These calculations do not call an AI model. The optional AI form is a separate action.
function advisorPage() {
  const items = [];
  for (const r of rows('plantings')) {
    const d = r.data,
      past = all('plantings').filter(
        (x) => x.id !== r.id && x.data.crop === d.crop && x.data.stage === 'Harvested',
      ),
      yields = past
        .map((x) => {
          const hs = all('harvests').filter((h) => h.data.planting === x.id);
          return hs.length ? (total(hs, 'quantity') - total(hs, 'loss')) / x.data.hectares : null;
        })
        .filter((x) => x !== null);
    const predicted = yields.length
      ? (yields.reduce((a, b) => a + b, 0) / yields.length) * d.hectares
      : d.expected_yield;
    const prices = all('market_prices')
      .filter((x) => x.data.crop === d.crop)
      .sort((a, b) => b.data.date.localeCompare(a.data.date));
    const price = prices[0]?.data.price;
    items.push([
      esc(d.name),
      predicted ? fmt(predicted) + ' kg' : 'No yield baseline',
      yields.length ? `${yields.length} completed crop cycles` : 'Your expected yield',
      price ? money(price) : 'No market price',
      predicted && price ? money(predicted * price) : '—',
    ]);
  }
  return (
    heading('Farm advisor', 'Practical planning estimates with visible assumptions.') +
    `<section class="panel"><h2>Yield and revenue outlook</h2><p class="muted">Estimated yield uses average net kg/ha from completed plantings of the same variety. With no history, it uses your entered expectation. Revenue uses the latest recorded market price. These are planning estimates, not guaranteed outcomes.</p>${items.length ? table(['Planting', 'Estimated yield', 'Basis', 'Latest price / kg', 'Potential revenue'], items) : empty('Build your first forecast', 'Record planting expectations, harvest history and sourced market prices.')}</section><div class="two-column"><section class="panel"><h2>Record-based priorities</h2>${alertList(alerts().slice(0, 10))}</section><section class="panel"><h2>AI assistant</h2><p class="muted">Ask for a summary of your farm records. AI responses can be wrong; verify recommendations before acting. Only summary figures and your question are sent when you choose Generate.</p><form id="ai-form"><label>Your question<textarea name="question" maxlength="1500" required placeholder="What should I focus on this week?"></textarea></label><button class="primary">Generate advice</button></form><div id="ai-result" class="advice-output" aria-live="polite">Checking AI connection…</div></section></div>`
  );
}
function weatherPage() {
  const farms = all('farms').filter((r) => !farmFilter || String(r.id) === farmFilter);
  return (
    heading(
      'Weather & maps',
      'Forecasts use each farm’s coordinates. You can also keep your own daily weather observations.',
    ) +
    `<section class="panel"><h2>Farm locations</h2>${
      farms.length
        ? farms
            .map((r) => {
              const d = r.data,
                has = d.latitude !== null && d.longitude !== null;
              return `<div class="location-row"><div><h3>${esc(d.name)}</h3><p class="muted">${esc(d.location)}</p>${has ? `<small>${fmt(d.latitude)}, ${fmt(d.longitude)}</small>` : '<small>Add latitude and longitude in the farm record.</small>'}</div><div class="actions">${has ? `<a class="secondary" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${d.latitude}&mlon=${d.longitude}#map=15/${d.latitude}/${d.longitude}">Open map ↗</a><button class="primary" data-weather="${r.id}">Load forecast</button>` : ''}<button class="secondary" data-open="${r.id}">Farm details</button></div></div>`;
            })
            .join('')
        : empty('No farm locations', 'Register your farm and enter coordinates.')
    }<div id="weather-result" aria-live="polite"></div><p class="small muted">Weather data: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>. Check local conditions before changing irrigation or field work.</p></section>`
  );
}
function settingsPage() {
  return (
    heading('Settings', 'Business details, account security and backups.') +
    `<div class="two-column"><section class="panel"><h2>Business profile</h2><form id="settings-form">${['name', 'currency', 'address', 'phone'].map((k) => `<label>${{ name: 'Business name', currency: 'Currency code', address: 'Invoice address', phone: 'Contact phone' }[k]}<input name="${k}" value="${esc(state.settings[k])}" ${admin() ? '' : 'disabled'} ${['name', 'currency'].includes(k) ? 'required' : ''}></label>`).join('')}${admin() ? '<button class="primary">Save settings</button>' : ''}</form></section><section class="panel"><h2>Change password</h2>${passwordForm()}${admin() ? '<h2 class="spaced">Backups</h2><p class="muted">Download all farm records, including the archive. Account passwords are excluded. A complete server backup is available through the included backup command.</p><a class="secondary" href="/api.php?action=backup" download>Download records backup</a>' : ''}</section></div>`
  );
}
function passwordForm() {
  return '<form id="password-form"><label>Current password<input name="current" type="password" autocomplete="current-password" required></label><label>New password (12–72 bytes)<input name="password" type="password" minlength="12" maxlength="72" autocomplete="new-password" required></label><button class="primary">Change password</button></form>';
}
function archivePage() {
  const list = state.records.filter(
    (r) => r.archived_at && (!farmFilter || !r.data.farm || String(r.data.farm) === farmFilter),
  );
  return (
    heading(
      'Archive',
      'Records are preserved here. Restore parent records before their linked records.',
    ) +
    `<section class="panel">${
      list.length
        ? table(
            ['Record', 'Module', 'Archived', 'Action'],
            list.map((r) => [
              esc(r.data.name),
              esc(state.catalog[r.module]?.label),
              esc(r.archived_at.slice(0, 10)),
              state.catalog[r.module]?.writable
                ? `<button class="secondary" data-restore="${r.id}">Restore</button>`
                : 'Read only',
            ]),
          )
        : empty('Nothing archived', 'Archived records will appear here.')
    }</section>`
  );
}
// 6. Navigation and event handling
// Users with a temporary password must change it before opening operational screens.
async function render() {
  if (!session.user || location.hash.startsWith('#reset-password=')) return renderAuth();
  if (session.user.must_change) {
    $('#app').innerHTML =
      `<div class="auth-wrap"><section class="auth-card"><h1>Set your own password</h1><p>Your administrator gave you a temporary password. Replace it to open your workspace.</p>${passwordForm()}</section></div>`;
    bindPassword();
    return;
  }
  shell();
  document.body.dataset.scene = sectionScene();
  const special = {
    dashboard,
    reports: reportPage,
    alerts: () =>
      heading('Alerts', 'Upcoming work, stock levels and problems from your saved records.') +
      `<section class="panel">${alertList(alerts())}</section>${admin() ? '<section class="panel"><h2>Email / SMS delivery</h2><p class="muted">Send the current alert summary to the delivery service configured by your administrator. Destinations are managed by that service.</p><button class="secondary" id="send-alerts">Send alert summary</button><p id="notification-status" class="muted spaced"></p></section>' : ''}`,
    advisor: advisorPage,
    weather: weatherPage,
    settings: settingsPage,
    archive: archivePage,
  };
  $('#content').innerHTML = special[page]
    ? special[page]()
    : ['team', 'audit', 'admin'].includes(page)
      ? heading(
          page === 'admin' ? 'Administration' : page === 'team' ? 'Team & access' : 'Activity log',
          page === 'admin'
            ? 'Every register, account and recent change in your farm business.'
            : '',
        ) + '<section class="panel" id="remote-panel">Loading…</section>'
      : modulePage();
  bind();
  if (page === 'admin') loadAdmin();
  if (page === 'team') loadTeam();
  if (page === 'audit') loadAudit();
  if (page === 'advisor') checkAI();
}
// Attach click/submit handlers after page HTML has been inserted.
function bind() {
  $$('[data-add]').forEach((b) => (b.onclick = () => openEditor(b.dataset.add)));
  $$('[data-open]').forEach(
    (b) =>
      (b.onclick = () => {
        const r = find(b.dataset.open);
        if (r) openEditor(r.module, r);
      }),
  );
  $$('[data-restore]').forEach(
    (b) =>
      (b.onclick = async () => {
        const r = find(b.dataset.restore);
        try {
          await api('restore', { module: r.module, id: r.id, version: r.version });
          await refresh();
          render();
          toast('Record restored.');
        } catch (e) {
          toast(e.message, true);
        }
      }),
  );
  $$('[data-weather]').forEach((b) => (b.onclick = () => loadWeather(find(b.dataset.weather))));
  if ($('#search'))
    $('#search').oninput = (e) => {
      search = e.target.value;
      const pos = e.target.selectionStart;
      $('#content').innerHTML = modulePage();
      bind();
      $('#search').focus();
      $('#search').setSelectionRange(pos, pos);
    };
  if ($('#export')) $('#export').onclick = () => exportCSV(page);
  if ($('#print')) $('#print').onclick = () => window.print();
  if ($('#settings-form'))
    $('#settings-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api('settings', Object.fromEntries(new FormData(e.target)));
        await refresh();
        render();
        toast('Settings saved.');
      } catch (err) {
        toast(err.message, true);
      }
    };
  bindPassword();
  if ($('#ai-form')) $('#ai-form').onsubmit = generateAI;
  if ($('#send-alerts')) {
    $('#send-alerts').onclick = async () => {
      try {
        const res = await fetch('/notifications.php', {
          method: 'POST',
          headers: { 'X-CSRF-Token': session.csrf },
        });
        const d = await res.json();
        if (!res.ok) throw Error(d.error);
        $('#notification-status').textContent = d.message;
      } catch (e) {
        $('#notification-status').textContent = e.message;
      }
    };
    fetch('/notifications.php')
      .then((r) => r.json())
      .then((d) => {
        if ($('#notification-status'))
          $('#notification-status').textContent = d.configured
            ? 'Delivery service connected.'
            : 'Email/SMS delivery is not connected. In-app alerts work without it.';
      })
      .catch(() => {});
  }
}
function bindPassword() {
  if ($('#password-form'))
    $('#password-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api('password', Object.fromEntries(new FormData(e.target)));
        session = await api('session');
        await refresh();
        render();
        toast('Password changed.');
      } catch (err) {
        toast(err.message, true);
      }
    };
}
// 7. Record forms
// Field definitions come from src/catalog.json so every register follows the same form rules.
function fieldHTML(f, value, module) {
  const common = `name="${esc(f.key)}" ${f.required ? 'required' : ''}`;
  let input = '';
  if (f.type === 'textarea')
    input = `<textarea ${common} maxlength="6000" rows="3">${esc(value)}</textarea>`;
  else if (f.type === 'reference') {
    const candidates = all(f.ref);
    input = `<select ${common} data-reference="${f.ref}"><option value="">Select ${esc(f.label.toLowerCase())}</option>${candidates.map((r) => `<option value="${r.id}" data-farm="${r.data.farm || ''}" ${Number(value) === r.id ? 'selected' : ''}>${esc(r.data.name)}</option>`).join('')}</select>${!candidates.length ? `<small class="field-hint">Add ${esc(state.catalog[f.ref]?.label || f.ref)} first.</small>` : ''}`;
  } else if (f.type === 'select')
    input = `<select ${common}>${f.options.map((o) => `<option ${value === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else
    input = `<input ${common} type="${f.type}" value="${esc(value ?? '')}" ${f.type === 'number' ? `min="${f.min ?? 0}" max="${f.key === 'latitude' ? 90 : f.key === 'longitude' ? 180 : f.key === 'humidity' ? 100 : f.key === 'ph' ? 14 : 1000000000}" step="${f.step || 'any'}"` : f.type === 'date' ? '' : 'maxlength="255"'}>`;
  return `<label class="${f.type === 'textarea' ? 'full' : ''}">${esc(f.label)}${f.required ? ' <span class="required">*</span>' : ''}${input}</label>`;
}
// Open a record in the shared dialog. Send its version with edits to detect stale changes.
// Notes are ordinary saved record data; temporary error messages are not saved.
function openEditor(module, record = null) {
  const m = state.catalog[module];
  if (!m) return;
  const dialog = $('#editor'),
    writable = m.writable;
  const values = record?.data || {};
  dialog.innerHTML = `<form id="record-form"><div class="dialog-header"><div><p class="eyebrow">${esc(m.group)}</p><h2 id="dialog-title">${record ? esc(record.data.name) : 'Add ' + esc(m.label.toLowerCase())}</h2></div><button type="button" class="icon-button" id="close-editor" aria-label="Close">×</button></div><p class="muted">${esc(m.description)}</p><fieldset ${writable ? '' : 'disabled'} class="form-grid">${m.fields.map((f) => fieldHTML(f, values[f.key] ?? (f.key === 'farm' ? farmFilter : f.type === 'date' && f.key === 'date' ? today() : f.type === 'number' && f.required && f.min === 0 ? 0 : ''), module)).join('')}</fieldset><p class="form-error" role="alert"></p><div class="dialog-footer">${record && writable ? '<button type="button" class="danger secondary" id="archive-record">Archive</button>' : ''}${record && module === 'sales' ? '<button type="button" class="secondary" id="invoice">Print invoice</button>' : ''}<button type="button" class="secondary" id="cancel-editor">Close</button>${writable ? '<button class="primary" type="submit">Save record</button>' : ''}</div></form>`;
  dialog.showModal();
  $('#close-editor').onclick = $('#cancel-editor').onclick = () => dialog.close();
  const farmSelect = dialog.querySelector('[name="farm"]');
  if (farmSelect) {
    const filter = () => {
      for (const s of dialog.querySelectorAll('[data-reference]'))
        if (s !== farmSelect)
          for (const opt of s.options) {
            const hidden =
              opt.dataset.farm && farmSelect.value && opt.dataset.farm !== farmSelect.value;
            opt.hidden = !!hidden;
            opt.disabled = !!hidden;
            if (hidden && opt.selected) s.value = '';
          }
    };
    farmSelect.onchange = filter;
    filter();
  }
  $('#record-form').onsubmit = async (e) => {
    e.preventDefault();
    const button = e.submitter;
    button.disabled = true;
    const data = Object.fromEntries(new FormData(e.target));
    try {
      await api('save', { module, id: record?.id, version: record?.version, data });
      dialog.close();
      await refresh();
      render();
      toast('Record saved.');
    } catch (err) {
      dialog.querySelector('.form-error').textContent = err.message;
      button.disabled = false;
    }
  };
  if ($('#archive-record'))
    $('#archive-record').onclick = () => {
      const form = $('#record-form');
      form.querySelector('.form-error').innerHTML =
        'Archive this record? Linked active records must be archived first. <button type="button" class="secondary" id="confirm-archive">Confirm archive</button>';
      $('#confirm-archive').onclick = async () => {
        try {
          await api('archive', { module, id: record.id, version: record.version });
          dialog.close();
          await refresh();
          render();
          toast('Record archived.');
        } catch (err) {
          form.querySelector('.form-error').textContent = err.message;
        }
      };
    };
  if ($('#invoice')) $('#invoice').onclick = () => printInvoice(record);
}
// 8. Exports and printing
// Prefix spreadsheet formula-like values to keep user-entered text from executing as formulas.
function exportCSV(module) {
  const m = state.catalog[module];
  const b = stock();
  const cell = (v) =>
    '"' +
    String(v ?? '')
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const fs = m.fields;
  const list = rows(module).filter((r) =>
    JSON.stringify(r.data).toLowerCase().includes(search.toLowerCase()),
  );
  const data = [
    [...fs.map((f) => f.label), ...(module === 'inventory' ? ['Available quantity'] : [])],
    ...list.map((r) => [
      ...fs.map((f) => (f.type === 'reference' ? label(r.data[f.key]) : r.data[f.key])),
      ...(module === 'inventory' ? [b[r.id]] : []),
    ]),
  ];
  download(
    module + '-' + today() + '.csv',
    '\ufeff' + data.map((row) => row.map(cell).join(',')).join('\r\n'),
    'text/csv;charset=utf-8',
  );
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function printInvoice(r) {
  const d = r.data,
    paid = total(
      all('payments').filter((p) => p.data.sale === r.id),
      'amount',
    ),
    gross = d.quantity * d.unit_price;
  $('#editor').close();
  const target = document.createElement('section');
  target.id = 'invoice-print';
  target.innerHTML = `<h1>${esc(state.settings.name)}</h1><p>${esc(state.settings.address)}<br>${esc(state.settings.phone)}</p><h2>Invoice ${esc(d.name)}</h2><p>Status: ${esc(d.status)}<br>Date: ${dateText(d.date)}<br>Due: ${dateText(d.next_due)}<br>Bill to: ${esc(label(d.customer))}</p>${table(['Item', 'Quantity', 'Unit price', 'Total'], [[esc(label(d.item)), fmt(d.quantity), money(d.unit_price), money(gross)]])}<p>Total: <b>${money(gross)}</b><br>Payments: ${money(paid)}<br>Balance due: <b>${money(gross - paid)}</b></p><p>${esc(d.notes || '')}</p>`;
  document.body.append(target);
  document.body.classList.add('printing-invoice');
  window.print();
  document.body.classList.remove('printing-invoice');
  target.remove();
}
// 9. Optional weather and external services
// Fetch a forecast only after the user selects a farm and clicks Load forecast.
async function loadWeather(r) {
  const target = $('#weather-result');
  target.innerHTML = '<p class="padded">Loading forecast…</p>';
  try {
    const q = new URLSearchParams({
      latitude: r.data.latitude,
      longitude: r.data.longitude,
      current: 'temperature_2m,relative_humidity_2m,wind_speed_10m',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
      timezone: 'auto',
      forecast_days: 7,
    });
    const res = await fetch('https://api.open-meteo.com/v1/forecast?' + q, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw Error('Forecast provider is unavailable.');
    const data = await res.json();
    target.innerHTML = `<h2 class="spaced">${esc(r.data.name)} forecast</h2>${metrics([
      ['Temperature', fmt(data.current.temperature_2m) + ' °C'],
      ['Humidity', fmt(data.current.relative_humidity_2m) + '%'],
      ['Wind', fmt(data.current.wind_speed_10m) + ' km/h'],
    ])}${table(
      ['Date', 'Low °C', 'High °C', 'Rain mm'],
      data.daily.time.map((date, i) => [
        dateText(date),
        fmt(data.daily.temperature_2m_min[i]),
        fmt(data.daily.temperature_2m_max[i]),
        fmt(data.daily.precipitation_sum[i]),
      ]),
    )}<p class="muted">${data.daily.precipitation_sum[0] >= 5 ? 'Rain is forecast today. Check soil moisture before running scheduled irrigation.' : 'Review soil moisture and crop requirements before setting irrigation.'}</p>`;
  } catch (err) {
    target.innerHTML = `<p class="form-error">${esc(err.message)} You can still record observations in Weather records.</p>`;
  }
}
// 10. Staff and account screens
// PHP also checks these permissions; hiding a control alone would not protect an endpoint.
async function loadTeam() {
  try {
    const users = await api('team');
    if (page !== 'team') return;
    $('#remote-panel').innerHTML =
      `<div class="panel-heading"><p class="muted">All staff belong to this farm business. Share temporary passwords privately; staff must replace them on first sign-in.</p><button class="primary" id="add-user">＋ Create account</button></div>${table(
        ['Name', 'Email', 'Role', 'Status', 'Actions'],
        users.map((u) => [
          esc(u.name),
          esc(u.email),
          badge(u.role),
          u.active ? 'Active' : 'Disabled',
          u.role === 'Owner' || u.id === session.user.id
            ? '—'
            : `<button class="text-button" data-user="${u.id}">Edit access</button>`,
        ]),
      )}`;
    $('#add-user').onclick = () => teamEditor();
    $$('[data-user]').forEach(
      (b) => (b.onclick = () => teamEditor(users.find((u) => u.id === Number(b.dataset.user)))),
    );
  } catch (e) {
    if ($('#remote-panel')) $('#remote-panel').textContent = e.message;
  }
}
function teamEditor(u) {
  $('#editor').innerHTML =
    `<form id="team-form"><div class="dialog-header"><h2 id="dialog-title">${u ? 'Edit staff access' : 'Add staff account'}</h2><button type="button" id="close-team" class="icon-button" aria-label="Close">×</button></div><label>Name<input name="name" value="${esc(u?.name)}" required></label><label>Email<input name="email" type="email" value="${esc(u?.email)}" required></label><label>Role<select name="role">${['Administrator', 'Manager', 'Agronomist', 'Worker', 'Accountant'].map((r) => `<option ${u?.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>${u ? `<label>Status<select name="active"><option value="1">Active</option><option value="0" ${!u.active ? 'selected' : ''}>Disabled</option></select></label><label>New temporary password (optional)<input name="reset_password" type="password" minlength="12" maxlength="72" autocomplete="new-password"></label>` : '<label>Temporary password<input name="password" type="password" minlength="12" maxlength="72" required autocomplete="new-password"></label>'}<p class="form-error" role="alert"></p><button class="primary">Save staff account</button></form>`;
  $('#editor').showModal();
  $('#close-team').onclick = () => $('#editor').close();
  $('#team-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('team', { ...Object.fromEntries(new FormData(e.target)), id: u?.id });
      $('#editor').close();
      if (page === 'admin') loadAdmin();
      else loadTeam();
      toast('Staff account saved.');
    } catch (err) {
      $('#editor .form-error').textContent = err.message;
    }
  };
}
async function loadAudit() {
  try {
    const data = await api('audit');
    if (page !== 'audit') return;
    $('#remote-panel').innerHTML =
      '<p class="muted">Latest 500 events. Record changes are logged with their actor and time.</p>' +
      table(
        ['When', 'Who', 'Action', 'Module', 'Record'],
        data.map((r) => [
          esc(r.created_at),
          esc(r.actor),
          esc(r.action),
          esc(r.module),
          esc(r.record_id || '—'),
        ]),
      );
  } catch (e) {
    $('#remote-panel').textContent = e.message;
  }
}
// Ask whether a server-side AI key exists. The key itself is never returned to the browser.
// Handle empty responses from a stopped server or timed-out PHP request.
async function advisorResponse(response) {
  const body = await response.text();
  if (!body.trim())
    throw Error(
      'The AI server returned an empty response. It may have timed out. Try again; if this continues, restart the farm server and check its Terminal error.',
    );
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw Error(
      'The AI server returned an invalid response. Check the farm server Terminal for an error.',
    );
  }
  if (!response.ok)
    throw Error(data?.error || 'The AI request failed (HTTP ' + response.status + ').');
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw Error('The AI server returned an invalid response.');
  return data;
}
async function checkAI() {
  try {
    const r = await fetch('/services.php?action=status');
    const d = await advisorResponse(r);
    if (!$('#ai-result')) return;
    if (!r.ok) throw Error(d.error || 'AI service unavailable.');
    $('#ai-result').textContent = d.configured
      ? 'Google Gemini configured. Enter a question above.'
      : 'Google Gemini is not connected. Run npm run configure-ai in the project Terminal, then reload this page. The planning estimates above work without it.';
  } catch (error) {
    if ($('#ai-result')) $('#ai-result').textContent = error.message;
  }
}
// Plain text formatting keeps AI output readable without interpreting it as HTML.
function cleanAdvisorText(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/gm, '$1')
    .replace(/^[ \t]*(?:\*{3,}|-{3,}|_{3,})[ \t]*$/gm, '')
    .replace(/\*{2,3}([^\n]+?)\*{2,3}/g, '$1')
    .replace(/__([^\n]+?)__/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/^[ \t]*[-*] +/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
async function generateAI(e) {
  e.preventDefault();
  const result = $('#ai-result');
  result.textContent = 'Generating advice…';
  e.submitter.disabled = true;
  try {
    const res = await fetch('/services.php?action=advice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf },
      body: JSON.stringify({ question: new FormData(e.target).get('question') }),
    });
    const d = await advisorResponse(res);
    if (typeof d.text !== 'string' || !d.text.trim())
      throw Error('The AI returned no advice. Try a shorter question.');
    result.textContent = cleanAdvisorText(d.text);
  } catch (err) {
    result.textContent = err.message;
  } finally {
    e.submitter.disabled = false;
  }
}
// 11. Sign-in and first-time setup
// Account creation makes a separate business. Administrators add colleagues through Team & access.
function renderAuth() {
  document.body.dataset.scene = 'crops';
  const hash = location.hash.slice(1);
  const reset = hash.startsWith('reset-password=');
  const forgot = hash === 'forgot-password';
  const signup = hash === 'create-account' || session.setup;
  const mode = reset
    ? 'reset-password'
    : forgot
      ? 'forgot-password'
      : signup
        ? session.setup
          ? 'setup'
          : 'register'
        : 'login';
  const title = reset
    ? 'Choose a new password'
    : forgot
      ? 'Forgot your password?'
      : signup
        ? 'Create your account'
        : 'Welcome back';
  const description = reset
    ? 'Choose a password of at least 12 characters.'
    : forgot
      ? 'Enter your account email to request a link that expires in 30 minutes.'
      : signup
        ? 'Create a separate farm workspace. To join an existing business, ask its administrator to create your staff account.'
        : 'Sign in to your farm workspace. Owners and administrators can open the Admin overview after signing in.';
  $('#app').innerHTML =
    '<div class="auth-wrap"><div class="auth-story"><a class="brand" href="#login"><img class="brand-mark" src="/acremind-logo.svg" alt="" width="48" height="48"><span>AcreMind<small>FARM MANAGEMENT</small></span></a><p class="eyebrow">FROM PLANTING TO PROFIT</p><h1>Know your farm.<br>Plan your next move.</h1><p>Your land, livestock, resources and business records in one place.</p></div><section class="auth-card"><h2>' +
    title +
    '</h2><p class="muted">' +
    description +
    '</p><form id="auth-form">' +
    (signup && !forgot && !reset
      ? '<label>Your name<input name="name" autocomplete="name" maxlength="120" required></label>'
      : '') +
    (!reset
      ? '<label>Email<input name="email" type="email" autocomplete="username" maxlength="190" required></label>'
      : '') +
    (!forgot
      ? '<label>Password<input name="password" type="password" autocomplete="' +
        (signup || reset ? 'new-password' : 'current-password') +
        '" ' +
        (signup || reset ? 'minlength="12"' : '') +
        ' maxlength="72" required></label>'
      : '') +
    (reset || (signup && !forgot)
      ? '<label>Confirm password<input name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="72" required></label>'
      : '') +
    '<p class="form-error" role="alert"></p><p id="auth-message" role="status"></p><button class="primary wide">' +
    (reset
      ? 'Save new password'
      : forgot
        ? 'Email reset link'
        : signup
          ? 'Create account'
          : 'Sign in') +
    '</button></form><div class="auth-links"><a href="#login">Sign in</a><a href="#create-account">Create account</a><a href="#forgot-password">Forgot password?</a></div>' +
    (forgot && !session.recovery_available
      ? '<p class="muted">Email recovery is not connected yet. Your administrator can reset staff passwords through Team & access.</p>'
      : '') +
    '</section></div>';
  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const button = e.submitter;
    button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(e.target));
      if ('confirmation' in data && data.password !== data.confirmation)
        throw Error('The passwords do not match.');
      delete data.confirmation;
      if (reset) data.token = hash.slice('reset-password='.length);
      const response = await api(mode, data);
      if (forgot) {
        $('#auth-message').textContent = response.message;
        $('#auth-form .form-error').textContent = '';
        button.disabled = false;
        return;
      }
      if (reset) {
        session = await api('session');
        history.replaceState(null, '', '#login');
        renderAuth();
        $('#auth-message').textContent = response.message;
        return;
      }
      session = { ...session, ...response, setup: false };
      page = admin() ? 'admin' : 'dashboard';
      history.replaceState(null, '', '#' + page);
      if (!session.user.must_change) await refresh();
      render();
    } catch (err) {
      $('#auth-form .form-error').textContent = err.message;
      button.disabled = false;
    }
  };
}
// 12. Start the application
// The URL fragment (for example #inventory) selects a screen without reloading the whole page.
window.addEventListener('hashchange', () => {
  page = location.hash.slice(1) || 'dashboard';
  search = '';
  render();
});
(async () => {
  try {
    session = await api('session');
    page = location.hash.slice(1) || 'dashboard';
    if (session.user && !session.user.must_change) await refresh();
    render();
  } catch (e) {
    $('#app').innerHTML =
      `<div class="loading"><h1>Unable to open the workspace</h1><p>${esc(e.message)}</p><button id="retry-load">Refresh</button></div>`;
    $('#retry-load').onclick = () => location.reload();
  }
})();

// Reports for roles that cannot read financial registers.
function operationalReport() {
  return (
    heading(
      'Operational reports',
      'Reports available to your role. Export a module for its full record details.',
    ) +
    metrics([
      ['Planting records', rows('plantings').length],
      [
        'Net harvest',
        fmt(total(rows('harvests'), 'quantity') - total(rows('harvests'), 'loss')) + ' kg',
      ],
      ['Livestock', rows('animals').length],
      ['Tasks complete', rows('tasks').filter((r) => r.data.status === 'Done').length],
    ]) +
    '<section class="panel"><h2>Available registers</h2><div class="report-links">' +
    Object.values(state.catalog)
      .map((m) => '<a href="#' + m.id + '">' + esc(m.label) + ' ↗</a>')
      .join('') +
    '</div></section>'
  );
}

// 13. Administration: server-authorized summary, searchable records and full detail view.
function sectionScene() {
  const group = state.catalog[page]?.group;
  if (group === 'Livestock') return 'livestock';
  if (['Resources', 'People & work'].includes(group)) return 'operations';
  if (
    group === 'Trade & finance' ||
    ['admin', 'team', 'audit', 'settings', 'reports', 'archive'].includes(page)
  )
    return 'business';
  return 'crops';
}
async function loadAdmin() {
  try {
    const data = await api('admin-overview');
    if (page !== 'admin') return;
    const active = data.records.filter((r) => !r.archived_at);
    $('#remote-panel').innerHTML =
      metrics([
        ['Registered records', data.records.length, 'Includes archived records'],
        ['Active records', active.length, 'Across every register'],
        ['Staff accounts', data.users.length, 'In this farm business'],
        ['Archived records', data.records.length - active.length, 'Available for review'],
      ]) +
      '<div class="panel-heading"><h2>All registered information</h2><button id="admin-create" class="primary">Create staff account</button></div><p class="muted">View full details below. Other businesses remain private.</p><div class="admin-filters"><label>Search all details<input id="admin-search" type="search" placeholder="Name, notes, reference…"></label><label>Register<select id="admin-module"><option value="">All registers</option>' +
      Object.values(state.catalog)
        .map((m) => '<option value="' + esc(m.id) + '">' + esc(m.label) + '</option>')
        .join('') +
      '</select></label><label>Status<select id="admin-status"><option value="">Active and archived</option><option value="active">Active</option><option value="archived">Archived</option></select></label></div><p id="admin-count" role="status"></p><div id="admin-records"></div><h2>Register totals</h2><div class="report-links">' +
      Object.values(state.catalog)
        .map(
          (m) =>
            '<a href="#' +
            esc(m.id) +
            '">' +
            esc(m.label) +
            ' · ' +
            data.records.filter((r) => r.module === m.id).length +
            '</a>',
        )
        .join('') +
      '</div><h2>Accounts</h2>' +
      table(
        ['Name', 'Email', 'Role', 'Status', 'Registered'],
        data.users.map((u) => [
          esc(u.name),
          esc(u.email),
          badge(u.role),
          u.active ? 'Active' : 'Disabled',
          esc(u.created_at),
        ]),
      ) +
      '<p><a href="#team">Manage roles and access →</a></p><h2>Password recovery email</h2><p>' +
      (data.recovery_available
        ? 'Delivery service configured.'
        : 'Email delivery has not been connected. Staff passwords can be reset through Team & access.') +
      '</p><h2>Recent activity</h2>' +
      table(
        ['When', 'Who', 'Action', 'Register'],
        data.activity.map((a) => [esc(a.created_at), esc(a.actor), esc(a.action), esc(a.module)]),
      );
    $('#admin-create').onclick = () => teamEditor();
    const draw = () => {
      const q = $('#admin-search').value.toLowerCase(),
        module = $('#admin-module').value,
        status = $('#admin-status').value;
      const rows = data.records.filter(
        (r) =>
          (!module || r.module === module) &&
          (!status || (status === 'archived' ? !!r.archived_at : !r.archived_at)) &&
          JSON.stringify(r.data).toLowerCase().includes(q),
      );
      $('#admin-count').textContent = rows.length + ' matching records';
      $('#admin-records').innerHTML = rows.length
        ? table(
            ['Record', 'Register', 'Status', 'Updated', 'Details'],
            rows.map((r) => [
              esc(r.data.name || 'Record #' + r.id),
              esc(state.catalog[r.module]?.label || r.module),
              r.archived_at ? 'Archived' : 'Active',
              esc(r.updated_at),
              '<button class="text-button" data-detail="' + r.id + '">View all details</button>',
            ]),
          )
        : empty('No matching records', 'Try another search or register.');
      $$('[data-detail]').forEach(
        (b) =>
          (b.onclick = () =>
            showRecordDetails(data.records.find((r) => r.id === Number(b.dataset.detail)))),
      );
    };
    $('#admin-search').oninput = draw;
    $('#admin-module').onchange = draw;
    $('#admin-status').onchange = draw;
    draw();
  } catch (e) {
    if (page === 'admin' && $('#remote-panel')) $('#remote-panel').textContent = e.message;
  }
}
function showRecordDetails(record) {
  const module = state.catalog[record.module];
  const fields = Object.entries(record.data)
    .map(([key, value]) => {
      const field = module?.fields.find((f) => f.key === key);
      const shown =
        field?.type === 'reference' ? find(value)?.data.name || value || '—' : (value ?? '—');
      return (
        '<dt>' +
        esc(field?.label || key) +
        '</dt><dd>' +
        esc(typeof shown === 'object' ? JSON.stringify(shown) : shown) +
        '</dd>'
      );
    })
    .join('');
  $('#editor').innerHTML =
    '<div class="dialog-header"><h2 id="dialog-title">' +
    esc(record.data.name || 'Record #' + record.id) +
    '</h2><button class="icon-button" id="close-details" aria-label="Close">×</button></div><p>' +
    esc(module?.label || record.module) +
    ' · ' +
    (record.archived_at ? 'Archived' : 'Active') +
    '</p><dl class="record-details">' +
    fields +
    '<dt>Record ID</dt><dd>' +
    record.id +
    '</dd><dt>Created</dt><dd>' +
    esc(record.created_at) +
    '</dd><dt>Updated</dt><dd>' +
    esc(record.updated_at) +
    '</dd></dl>';
  $('#close-details').onclick = () => $('#editor').close();
  $('#editor').showModal();
}
