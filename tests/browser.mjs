import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:8081');
await page.getByLabel('Email', { exact: true }).fill('qa-owner@example.test');
await page.getByLabel('Password', { exact: true }).fill('Farm-test-password-2026');
await page.getByRole('button', { name: 'Sign in', exact: true }).click();
await page.getByRole('heading', { name: 'Administration' }).waitFor();
await page.screenshot({ path: 'test-results/dashboard.png', fullPage: true });
for (const route of [
  'inventory',
  'sales',
  'reports',
  'advisor',
  'archive',
  'settings',
  'team',
  'audit',
  'weather',
]) {
  await page.goto('http://127.0.0.1:8081/#' + route);
  await page.locator('#content h1').waitFor();
  await page.waitForTimeout(100);
  assert.equal(
    await page.locator('body').evaluate((el) => el.scrollWidth > innerWidth),
    false,
    route + ' desktop overflow',
  );
}
await page.goto('http://127.0.0.1:8081/#inventory');
await page.getByRole('button', { name: 'View / edit' }).first().click();
await page.locator('#record-form').waitFor();
await page.getByLabel('Notes', { exact: true }).fill('Browser-verified edit');
await page.getByRole('button', { name: 'Save record', exact: true }).click();
await page.getByRole('status').filter({ hasText: 'Record saved.' }).waitFor();
await page.reload();
await page.getByRole('button', { name: 'View / edit' }).first().click();
assert.equal(await page.getByLabel('Notes', { exact: true }).inputValue(), 'Browser-verified edit');
await page.getByRole('button', { name: 'Close', exact: true }).last().click();
const dl = page.waitForEvent('download');
await page.getByRole('button', { name: 'Export CSV' }).click();
const download = await dl;
assert(download.suggestedFilename().endsWith('.csv'));
await page.setViewportSize({ width: 390, height: 844 });
await page.goto('http://127.0.0.1:8081/#dashboard');
await page.getByRole('heading', { name: 'Your farm at a glance' }).waitFor();
assert.equal(
  await page.locator('body').evaluate((el) => el.scrollWidth > innerWidth),
  false,
  'mobile overflow',
);
await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
await page.goto('http://127.0.0.1:8081/#farms');
await page.getByRole('button', { name: 'Add record', exact: false }).first().waitFor();
await page.getByRole('button', { name: 'Add record', exact: false }).first().click();
assert.equal(
  await page.locator('dialog').evaluate((el) => el.scrollWidth > el.clientWidth),
  false,
  'mobile form overflow',
);
await page.screenshot({ path: 'test-results/mobile-form.png', fullPage: true });
await page.close();
const auth = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await auth.goto('http://127.0.0.1:8080');
await auth.getByRole('heading', { name: 'Create your farm workspace' }).waitFor();
await auth.screenshot({ path: 'test-results/setup.png', fullPage: true });
await browser.close();
assert.deepEqual(errors, []);
console.log(
  'Browser checks passed: navigation, persistent edit, CSV download, desktop/mobile layout, mobile form, no JavaScript errors.',
);
