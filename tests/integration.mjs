import assert from 'node:assert/strict';
const base = process.env.TEST_URL || 'http://127.0.0.1:8081';
class Client {
  cookie = '';
  csrf = '';
  async req(action, data, expected = 200) {
    const r = await fetch(base + '/api.php?action=' + action, {
      method: data ? 'POST' : 'GET',
      headers: {
        cookie: this.cookie,
        ...(data ? { 'content-type': 'application/json', 'x-csrf-token': this.csrf } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    for (const c of r.headers.getSetCookie()) this.cookie = c.split(';')[0];
    const result = await r.json();
    assert.equal(r.status, expected, `${action}: ${JSON.stringify(result)}`);
    if (result.csrf) this.csrf = result.csrf;
    return result;
  }
}
const c = new Client();
await c.req('session');
const email = 'qa-owner@example.test',
  password = 'Farm-test-password-2026';
let setup = await c.req('session');
if (setup.setup) await c.req('setup', { name: 'QA owner', email, password });
else await c.req('login', { email, password });
const catalog = (await c.req('state')).catalog;
const ids = {};
let passed = 0;
async function save(module, data, expected = 200) {
  const result = await c.req('save', { module, data }, expected);
  if (expected === 200) ids[module] = result.id;
  passed++;
  return result;
}
function defaults(module) {
  return Object.fromEntries(
    catalog[module].fields.map((f) => [
      f.key,
      f.type === 'reference'
        ? ids[f.ref] || null
        : f.type === 'number'
          ? f.min > 0
            ? f.min
            : 0
          : f.type === 'date'
            ? !f.required
              ? null
              : '2026-09-12'
            : f.type === 'select'
              ? f.options[0]
              : f.type === 'email'
                ? 'qa@example.test'
                : f.type === 'textarea'
                  ? null
                  : f.key === 'name'
                    ? `QA ${module} ${Date.now()}`
                    : f.required
                      ? 'Test'
                      : null,
    ]),
  );
}
const add = (m, over = {}) => save(m, { ...defaults(m), ...over });
await add('farms', { hectares: 20 });
await add('fields', { hectares: 10, ph: 6.5 });
// Explicit rejection checks do not replace the known field id.
await save('fields', { ...defaults('fields'), name: 'Oversize', hectares: 30 }, 422);
await add('crops', { maturity_days: 90, target_yield: 4000 });
await add('plantings', {
  hectares: 5,
  planted_on: '2026-06-01',
  harvest_on: '2026-09-12',
  expected_yield: 1000,
  stage: 'Ready',
});
await save(
  'plantings',
  { ...defaults('plantings'), hectares: 1, planted_on: '2026-09-13', harvest_on: '2026-09-12' },
  422,
);
await add('inventory', { opening: 100, unit: 'kg', minimum: 10, unit_cost: 5 });
await add('warehouses', { capacity: 10000 });
await add('harvests', { quantity: 1000, loss: 100 });
await add('suppliers');
await add('purchases', { quantity: 50, unit_price: 5, status: 'Received' });
await add('customers');
await add('sales', { quantity: 25, unit_price: 10, status: 'Confirmed' });
await save(
  'sales',
  { ...defaults('sales'), quantity: 50000, unit_price: 10, status: 'Confirmed' },
  422,
);
await add('payments', {
  direction: 'Income',
  sale: ids.sales,
  purchase: null,
  planting: ids.plantings,
  amount: 100,
});
await save(
  'payments',
  { ...defaults('payments'), direction: 'Income', sale: ids.sales, purchase: null, amount: 999 },
  422,
);
for (const m of ['animals', 'water_sources', 'irrigation_systems', 'employees', 'equipment'])
  await add(m, {
    ...(m === 'equipment' ? { cost: 1000, salvage: 100, useful_years: 5 } : {}),
    ...(m === 'animals' ? { status: 'Active', birth_date: '2026-01-01', death_date: null } : {}),
  });
for (const m of Object.keys(catalog))
  if (!ids[m])
    await add(m, {
      ...(m === 'loans' ? { principal: 1000, repaid: 0 } : {}),
      ...(m === 'budgets' ? { end_date: '2026-12-31', amount: 500 } : {}),
      ...(m === 'storage_lots' ? { quantity: 5, spoilage: 0, dispatch_on: null } : {}),
      ...(m === 'stock_moves' ? { direction: 'Out', quantity: 5 } : {}),
      ...(m === 'weather_logs' ? { temperature: 25, humidity: 60 } : {}),
      ...(m === 'market_prices' ? { price: 15 } : {}),
      ...(m === 'attendance' ? { status: 'Present', pay: 100 } : {}),
      ...(m === 'breeding' ? { sire: null } : {}),
      ...(m === 'scouting' ? { symptoms: 'Yellow leaves' } : {}),
    });
let s = await c.req('state');
assert.equal(Object.keys(ids).length, 33);
passed++;
const sale = s.records.find((r) => r.id === ids.sales);
await c.req(
  'save',
  { module: 'sales', id: sale.id, version: sale.version - 1, data: sale.data },
  409,
);
passed++;
await c.req('archive', { module: 'farms', id: ids.farms, version: 1 }, 422);
passed++;
const market = s.records.find((r) => r.id === ids.market_prices);
await c.req('archive', { module: 'market_prices', id: market.id, version: market.version });
await c.req('restore', { module: 'market_prices', id: market.id, version: market.version + 1 });
passed++;
const staffEmail = 'qa-worker-' + Date.now() + '@example.test';
await c.req('team', {
  name: 'QA worker',
  email: staffEmail,
  role: 'Worker',
  password: 'Worker-temporary-2026',
});
const staff = (await c.req('team')).find((u) => u.email === staffEmail);
const worker = new Client();
await worker.req('session');
await worker.req('login', { email: staff.email, password: 'Worker-temporary-2026' });
await worker.req('state', undefined, 403);
await worker.req('password', {
  current: 'Worker-temporary-2026',
  password: 'Worker-new-password-2026',
});
const ws = await worker.req('state');
assert(!ws.catalog.payments);
await worker.req('save', { module: 'farms', data: defaults('farms') }, 403);
await worker.req('backup', undefined, 403);
passed += 4;
const noSession = new Client();
await noSession.req('state', undefined, 401);
passed++;
const original = c.csrf;
c.csrf = 'bad';
await c.req('save', { module: 'farms', data: defaults('farms') }, 403);
c.csrf = original;
passed++;
const audit = await c.req('audit');
assert(audit.some((x) => x.action === 'create'));
passed++;
const backup = await c.req('backup');
assert.equal(backup.format, 'ffms-records-v1');
assert(!JSON.stringify(backup).includes('password_hash'));
passed++;
await c.req('logout', {});
await c.req('session');
await c.req('login', { email, password });
s = await c.req('state');
assert(s.records.some((r) => r.id === ids.harvests));
passed++;
console.log(
  `${passed} integration checks passed; all 33 modules created; authentication, permissions, stock and invoice safeguards verified.`,
);
console.log('Browser QA account: ' + email);
