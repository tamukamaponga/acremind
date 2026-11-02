/** Starts the existing PHP server and, when configured, a private Gmail SMTP bridge. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import nodemailer from 'nodemailer';
import { startMailBridge } from './mail-bridge.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let saved = {};
const config = path.join(
  process.env.FFMS_STORAGE || path.join(root, 'storage'),
  'mail-config.json',
);
if (fs.existsSync(config)) {
  try {
    saved = JSON.parse(fs.readFileSync(config, 'utf8'));
  } catch {
    throw Error('Email configuration is invalid. Run npm run configure-email again.');
  }
}
const sender = process.env.GMAIL_ADDRESS || saved.email;
const password = process.env.GMAIL_APP_PASSWORD || saved.password;
const appUrl = process.env.APP_URL || saved.appUrl || 'http://127.0.0.1:8080';
const env = { ...process.env, APP_URL: appUrl };
let bridge;
if (sender && password) {
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: sender, pass: password },
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  bridge = await startMailBridge(transport, sender, appUrl);
  env.FFMS_MAIL_BRIDGE_URL = bridge.url;
  env.FFMS_MAIL_BRIDGE_TOKEN = bridge.secret;
  console.log('Gmail recovery configured. Delivery will be attempted when a reset is requested.');
} else console.log('Gmail recovery is not configured. Run npm run configure-email to connect it.');
const php = spawn(
  process.execPath,
  [
    path.join(root, 'node_modules/@php-wasm/cli/php-wasm.js'),
    '-S',
    '127.0.0.1:8080',
    '-t',
    'public',
  ],
  { cwd: root, env, stdio: 'inherit' },
);
const close = () => bridge?.server.close();
php.on('error', () => {
  close();
  process.exitCode = 1;
});
php.on('exit', (code) => {
  close();
  process.exitCode = code || 0;
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    php.kill(signal);
    close();
  });
