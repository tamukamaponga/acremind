import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const cli = 'node_modules/@php-wasm/cli/php-wasm.js';
const original = path.resolve('storage/test-run');
const restored = path.resolve('storage/test-restore-' + Date.now());
function run(args, storage, extra = {}, expected = 0) {
  const r = spawnSync(process.execPath, [cli, ...args], {
    env: { ...process.env, FFMS_STORAGE: storage, ...extra },
    encoding: 'utf8',
  });
  assert.equal(r.status, expected, r.stdout + r.stderr);
  return r.stdout;
}
const backupOutput = run(['scripts/backup.php'], original);
const backup = backupOutput.trim().split('saved: ')[1];
assert(backup);
run(['scripts/restore.php'], restored, { FFMS_RESTORE_FILE: backup });
const counts =
  "require 'src/app.php'; echo sql('SELECT COUNT(*) FROM ffms_users')->fetchColumn(), ':', sql('SELECT COUNT(*) FROM ffms_records')->fetchColumn();";
assert.equal(run(['-r', counts], restored), run(['-r', counts], original));
// The bundled PHP CLI does not propagate every PHP exit code. Check both
// the explicit refusal and the database bytes instead of relying on that code.
const hash = () =>
  createHash('sha256')
    .update(fs.readFileSync(path.join(restored, 'ffms.sqlite')))
    .digest('hex');
const before = hash();
const refused = spawnSync(process.execPath, [cli, 'scripts/restore.php'], {
  env: { ...process.env, FFMS_STORAGE: restored, FFMS_RESTORE_FILE: backup },
  encoding: 'utf8',
});
assert.match(refused.stderr + refused.stdout, /Refusing to overwrite an existing database/);
assert.equal(hash(), before);
run(['scripts/recover.php'], restored, {
  FFMS_RECOVERY_EMAIL: 'qa-owner@example.test',
  FFMS_RECOVERY_PASSWORD: 'Recovered-test-password-2026',
});
const result = run(
  [
    '-r',
    `require 'src/app.php'; $u=sql('SELECT password_hash,must_change FROM ffms_users WHERE email=?',['qa-owner@example.test'])->fetch(); echo password_verify('Recovered-test-password-2026',$u['password_hash']) && $u['must_change'] ? 'ok' : 'failed';`,
  ],
  restored,
);
assert.equal(result, 'ok');
console.log(
  'Backup, restore, overwrite refusal and account recovery checks passed on an isolated database copy.',
);
