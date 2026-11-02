import assert from 'node:assert/strict';
const base = process.env.TEST_URL || 'http://127.0.0.1:8081';
class Client {
  cookie = '';
  csrf = '';
  async req(action, data, expected = 200) {
    const res = await fetch(base + '/api.php?action=' + action, {
      method: data ? 'POST' : 'GET',
      headers: {
        cookie: this.cookie,
        ...(data ? { 'content-type': 'application/json', 'x-csrf-token': this.csrf } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    for (const c of res.headers.getSetCookie()) this.cookie = c.split(';')[0];
    const out = await res.json();
    assert.equal(res.status, expected, action + ': ' + JSON.stringify(out));
    if (out.csrf) this.csrf = out.csrf;
    return out;
  }
}
const owner = new Client(),
  other = new Client();
await owner.req('session');
await owner.req('login', { email: 'qa-owner@example.test', password: 'Farm-test-password-2026' });
await other.req('session');
await other.req('login', { email: 'other-owner@example.test', password: 'Other-owner-test-2026' });
const s = await owner.req('state'),
  record = s.records.find((r) => r.module === 'inventory' && !r.archived_at),
  plant = s.records.find((r) => r.module === 'plantings' && !r.archived_at),
  farm = s.records.find((r) => r.module === 'farms' && !r.archived_at);
assert(!(await other.req('state')).records.some((r) => r.id === record.id));
await other.req(
  'save',
  { module: 'inventory', id: record.id, version: record.version, data: record.data },
  404,
);
await other.req('archive', { module: 'inventory', id: record.id, version: record.version }, 404);
await owner.req(
  'save',
  {
    module: 'inventory',
    id: record.id,
    version: record.version,
    data: { ...record.data, unit: 'litres' },
  },
  422,
);
const cross = await other.req('save', {
  module: 'farms',
  data: { ...farm.data, name: 'Other workspace farm ' + Date.now() },
});
await owner.req(
  'save',
  {
    module: 'fields',
    data: { name: 'Cross tenant field', farm: cross.id, hectares: 1, soil: 'Loam' },
  },
  422,
);
await owner.req('save', {
  module: 'plantings',
  data: {
    ...plant.data,
    name: 'Future rotation ' + Date.now(),
    planted_on: '2027-01-01',
    harvest_on: '2027-05-01',
    hectares: 10,
  },
});
await owner.req(
  'save',
  {
    module: 'plantings',
    data: { ...plant.data, name: 'Overlapping rotation ' + Date.now(), hectares: 10 },
  },
  422,
);
const unique = Date.now(),
  staffEmail = 'qa-accountant-' + unique + '@example.test';
await owner.req('team', {
  name: 'Accountant ' + unique,
  email: staffEmail,
  role: 'Accountant',
  password: 'Temporary-accountant-2026',
});
const accountant = new Client();
await accountant.req('session');
await accountant.req('login', { email: staffEmail, password: 'Temporary-accountant-2026' });
await accountant.req(
  'password',
  { current: 'Temporary-accountantant-2026', password: 'New-accountant-pass-2026' },
  422,
);
await accountant.req('password', {
  current: 'Temporary-accountant-2026',
  password: 'New-accountant-pass-2026',
});
const purchase = s.records.find((r) => r.module === 'purchases' && !r.archived_at);
await accountant.req(
  'save',
  {
    module: 'purchases',
    data: { ...purchase.data, name: 'Unapproved receipt ' + unique, status: 'Received' },
  },
  403,
);
await accountant.req('team', undefined, 403);
const staff = (await owner.req('team')).find((u) => u.email === staffEmail);
await owner.req('team', {
  id: staff.id,
  name: staff.name,
  email: staff.email,
  role: staff.role,
  active: 0,
});
await accountant.req('state', undefined, 401);
const key = await fetch(base + '/services.php?action=status', {
  headers: { cookie: owner.cookie },
});
assert.equal(key.status, 200);
assert.equal((await key.json()).configured, false);
const advice = await fetch(base + '/services.php?action=advice', {
  method: 'POST',
  headers: { cookie: owner.cookie, 'X-CSRF-Token': owner.csrf, 'Content-Type': 'application/json' },
  body: JSON.stringify({ question: 'Test' }),
});
assert.equal(advice.status, 503);
const notification = await fetch(base + '/notifications.php', {
  method: 'POST',
  headers: { cookie: owner.cookie, 'X-CSRF-Token': owner.csrf },
});
assert.equal(notification.status, 503);
console.log(
  '16 additional security and lifecycle checks passed: tenant isolation, immutable units, future rotations, overlap rejection, procurement approvals, disabled sessions, and disconnected integrations.',
);
