import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const base = process.env.TEST_URL || 'http://127.0.0.1:8082';
if (!process.env.FFMS_STORAGE?.includes('test-'))
  throw Error('Set FFMS_STORAGE to the isolated test server storage.');
let checks = 0;
class Client {
  cookie = '';
  csrf = '';
  async req(action, data, status = 200) {
    const r = await fetch(base + '/api.php?action=' + action, {
      method: data ? 'POST' : 'GET',
      headers: {
        cookie: this.cookie,
        ...(data ? { 'content-type': 'application/json', 'x-csrf-token': this.csrf } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    for (const c of r.headers.getSetCookie()) this.cookie = c.split(';')[0];
    const d = await r.json();
    assert.equal(r.status, status, action + ': ' + JSON.stringify(d));
    if (d.csrf) this.csrf = d.csrf;
    checks++;
    return d;
  }
}
const a = new Client(),
  b = new Client(),
  worker = new Client(),
  guest = new Client();
await a.req('session');
await a.req('register', {
  name: 'Reset owner',
  email: 'reset-owner@example.test',
  password: 'Reset-owner-original-2026',
});
await b.req('session');
await b.req('register', {
  name: 'Separate owner',
  email: 'separate-owner@example.test',
  password: 'Separate-owner-2026',
});
assert.equal((await b.req('admin-overview')).users.length, 1);
checks++;
const farm = await a.req('save', {
  module: 'farms',
  data: { name: 'Private farm', location: 'Lusaka', hectares: 5, notes: 'Admin detail test' },
});
assert.equal((await b.req('admin-overview')).records.length, 0);
checks++;
const saved = (await a.req('state')).records.find((r) => r.id === farm.id);
await a.req('archive', { module: 'farms', id: farm.id, version: saved.version });
const view = await a.req('admin-overview');
assert.equal(view.records.length, 1);
assert(view.records[0].archived_at);
assert.equal(view.records[0].data.notes, 'Admin detail test');
checks++;
assert.equal(view.users.length, 1);
assert(!JSON.stringify(view).includes('password_hash'));
checks++;
await a.req('team', {
  name: 'Worker',
  email: 'account-worker@example.test',
  role: 'Worker',
  password: 'Temporary-worker-2026',
});
await worker.req('session');
await worker.req('login', {
  email: 'account-worker@example.test',
  password: 'Temporary-worker-2026',
});
await worker.req('password', {
  current: 'Temporary-worker-2026',
  password: 'Permanent-worker-2026',
});
await worker.req('admin-overview', null, 403);
await guest.req('session');
await guest.req('admin-overview', null, 401);
await guest.req('forgot-password', { email: 'reset-owner@example.test' }, 503);
const fixture = spawnSync(
  process.execPath,
  ['node_modules/@php-wasm/cli/php-wasm.js', 'scripts/reset-test-fixtures.php'],
  { encoding: 'utf8', env: process.env },
);
assert(fixture.stdout.includes('Test-only reset fixtures ready.'), fixture.stderr + fixture.stdout);
checks++;
await guest.req(
  'reset-password',
  { token: 'b'.repeat(64), password: 'Replacement-owner-2026' },
  422,
);
await guest.req(
  'reset-password',
  { token: 'd'.repeat(64), password: 'Replacement-owner-2026' },
  422,
);
await guest.req('reset-password', { token: 'a'.repeat(64), password: 'short' }, 422);
await guest.req('reset-password', { token: 'a'.repeat(64), password: 'Replacement-owner-2026' });
await a.req('admin-overview', null, 401);
await guest.req(
  'reset-password',
  { token: 'a'.repeat(64), password: 'Replacement-owner-2026' },
  422,
);
await guest.req(
  'reset-password',
  { token: 'c'.repeat(64), password: 'Replacement-owner-2026' },
  422,
);
await guest.req(
  'login',
  { email: 'reset-owner@example.test', password: 'Reset-owner-original-2026' },
  401,
);
await guest.req('login', { email: 'reset-owner@example.test', password: 'Replacement-owner-2026' });
assert.equal((await guest.req('admin-overview')).users.length, 2);
checks++;
console.log(checks + ' account and recovery checks passed.');
