/** End-to-end reset-link flow with a local fake mail transport; never sends real email. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { startMailBridge } from '../scripts/mail-bridge.mjs';
const messages = [];
const base = 'http://127.0.0.1:8084';
const bridge = await startMailBridge(
  {
    async sendMail(message) {
      messages.push(message);
    },
  },
  'sender@example.test',
  base,
);
const storage = fs.mkdtempSync('/private/tmp/ffms-mail-test-');
const child = spawn(
  process.execPath,
  ['node_modules/@php-wasm/cli/php-wasm.js', '-S', '127.0.0.1:8084', '-t', 'public'],
  {
    env: {
      ...process.env,
      FFMS_STORAGE: storage,
      APP_URL: base,
      FFMS_MAIL_BRIDGE_URL: bridge.url,
      FFMS_MAIL_BRIDGE_TOKEN: bridge.secret,
    },
    stdio: 'ignore',
  },
);
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(base + '/api.php?action=session');
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert(ready, 'Test PHP server started');
  let cookie = '',
    csrf = '';
  const request = async (action, data, status = 200) => {
    const res = await fetch(base + '/api.php?action=' + action, {
      method: data ? 'POST' : 'GET',
      headers: {
        cookie,
        ...(data ? { 'content-type': 'application/json', 'x-csrf-token': csrf } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    for (const c of res.headers.getSetCookie()) cookie = c.split(';')[0];
    const out = await res.json();
    assert.equal(res.status, status, JSON.stringify(out));
    if (out.csrf) csrf = out.csrf;
    return out;
  };
  assert.equal((await fetch(bridge.url, { method: 'POST', body: '{}' })).status, 403);
  await request('session');
  await request('setup', {
    name: 'Email test',
    email: 'email-test@example.test',
    password: 'Before-recovery-2026',
  });
  await request('logout', {});
  assert.equal((await request('session')).recovery_available, true);
  const unknown = await request('forgot-password', { email: 'unknown@example.test' });
  assert.equal(messages.length, 0);
  const known = await request('forgot-password', { email: 'email-test@example.test' });
  assert.deepEqual(known, unknown);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, 'email-test@example.test');
  const token = messages[0].text.match(/#reset-password=([a-f0-9]{64})/)[1];
  await request('reset-password', { token, password: 'After-recovery-2026' });
  await request('reset-password', { token, password: 'After-recovery-2026' }, 422);
  await request('login', { email: 'email-test@example.test', password: 'After-recovery-2026' });
  console.log(
    'Mail flow passed: private bridge authorization, generated email link, anonymous response, successful reset, single use and new-password login. No live mail sent.',
  );
} finally {
  child.kill('SIGTERM');
  bridge.server.close();
}
