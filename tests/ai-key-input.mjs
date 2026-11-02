import assert from 'node:assert/strict';
import { normalizeGeminiKey as parse } from '../scripts/ai-key-input.mjs';
const dummy = 'AIzaSyntheticTestKeyOnly1234567890';
for (const input of [
  dummy,
  '“' + dummy + '”',
  '‘' + dummy + '’',
  ' ' + dummy + ' ',
  `"${dummy}"`,
  `'${dummy}'`,
  'GEMINI_API_KEY=' + dummy,
  'export GOOGLE_API_KEY="' + dummy + '"',
  '\u200B' + dummy,
])
  assert.equal(parse(input), dummy);
for (const input of [
  '',
  'sk-old-provider-key',
  'gen-lang-client-12345678901234',
  'https://example.test/api-keys',
  'AIza...shortened',
  'too-short',
  dummy + ' invalid',
])
  assert.throws(() => parse(input));
assert.equal(parse(dummy + '.token=part'), dummy + '.token=part');
console.log('17 key-input checks passed; no real keys used.');
