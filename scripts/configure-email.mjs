/** Interactive local setup. The app password is hidden and saved outside public source. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { Writable } from 'node:stream';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let muted = false;
const output = new Writable({
  write(chunk, encoding, done) {
    if (!muted) process.stdout.write(chunk);
    done();
  },
});
const rl = readline.createInterface({
  input: process.stdin,
  output,
  terminal: process.stdin.isTTY,
});
try {
  console.log(
    'Connect Gmail for password-reset emails. Use a Google app password, not your normal Gmail password.',
  );
  const email = (await rl.question('Gmail address: ')).trim();
  process.stdout.write('Google app password (hidden): ');
  muted = true;
  const password = (await rl.question('')).replace(/\s/g, '');
  muted = false;
  process.stdout.write('\n');
  const appUrl =
    (await rl.question('System URL [http://127.0.0.1:8080]: ')).trim() || 'http://127.0.0.1:8080';
  const url = new URL(appUrl);
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email) || !/^[a-zA-Z0-9]{16}$/.test(password))
    throw Error('Enter a valid Gmail address and a 16-character Google app password.');
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    )
  )
    throw Error('Use an HTTPS system URL, or HTTP localhost for local use.');
  const storage = process.env.FFMS_STORAGE || path.join(root, 'storage');
  fs.mkdirSync(storage, { recursive: true, mode: 0o700 });
  const file = path.join(storage, 'mail-config.json');
  fs.writeFileSync(
    file,
    JSON.stringify({ email, password, appUrl: appUrl.replace(/\/$/, '') }, null, 2),
    { mode: 0o600 },
  );
  fs.chmodSync(file, 0o600);
  console.log(
    'Email settings saved privately. Restart with npm start. No test message has been sent.',
  );
} catch (e) {
  muted = false;
  console.error(e.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
