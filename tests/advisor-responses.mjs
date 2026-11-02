import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync('public/app.js', 'utf8');
const helper = source.slice(
  source.indexOf('async function advisorResponse('),
  source.indexOf('async function checkAI('),
);
const context = vm.createContext({});
vm.runInContext(helper, context);
const parse = (body, status = 200) => context.advisorResponse(new Response(body, { status }));
await assert.rejects(() => parse(''), /empty response/);
await assert.rejects(() => parse('<html>Error</html>', 500), /invalid response/);
await assert.rejects(() => parse('null'), /invalid response/);
await assert.rejects(() => parse('[]'), /invalid response/);
await assert.rejects(() => parse('{"error":"No API credits"}', 502), /No API credits/);
assert.equal((await parse('{"text":"Advice"}')).text, 'Advice');
console.log('6 Farm Advisor response checks passed.');
