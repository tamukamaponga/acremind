import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = ['src', 'public', 'scripts'].flatMap((dir) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.php'))
    .map((f) => dir + '/' + f),
);
for (const file of files) {
  const result = spawnSync(
    process.execPath,
    ['node_modules/@php-wasm/cli/php-wasm.js', '-l', file],
    { encoding: 'utf8' },
  );
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0 || !result.stdout.includes('No syntax errors detected'))
    process.exit(result.status || 1);
}
const js = spawnSync(process.execPath, ['--check', 'public/app.js'], { encoding: 'utf8' });
if (js.status) throw Error(js.stderr);
console.log('PHP and JavaScript syntax checks passed.');
