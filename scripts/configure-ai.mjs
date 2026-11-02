/** Interactive local setup. The app password is hidden and saved outside public source. */
import fs from 'node:fs';
import { normalizeGeminiKey } from './ai-key-input.mjs';
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
  console.log('Connect Farm Advisor with a Google Gemini API key.');

  process.stdout.write('Google Gemini API key (hidden): ');
  muted = true;
  const entered = await rl.question('');
  muted = false;
  process.stdout.write('\n');
  const password = normalizeGeminiKey(entered);
  const model = 'gemini-3.5-flash';
  const storage = process.env.FFMS_STORAGE || path.join(root, 'storage');
  fs.mkdirSync(storage, { recursive: true, mode: 0o700 });
  const file = path.join(storage, 'gemini-config.json');
  fs.writeFileSync(file, JSON.stringify({ apiKey: password, model }, null, 2), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  console.log('AI settings saved privately. Reload Farm Advisor. No AI request has been sent.');
} catch (e) {
  muted = false;
  console.error(e.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
