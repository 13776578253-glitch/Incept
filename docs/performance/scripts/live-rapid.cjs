const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.NAV_PLAYWRIGHT || 'playwright');

async function main() {
  const [origin, output] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--disable-extensions', '--no-proxy-server'] });
  const results = [];
  const errors = [];
  try {
    for (let index = 1; index <= 5; index++) {
      const context = await browser.newContext({ viewport: { width: 1240, height: 900 } });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push({ index, error: error.message }));
      page.on('console', message => {
        if (message.type() === 'error') errors.push({ index, console: message.text() });
      });
      page.on('response', response => {
        if (response.status() >= 500) errors.push({ index, status: response.status(), path: new URL(response.url()).pathname });
      });
      try {
        const response = await page.goto(origin + '/en/roadmap', { waitUntil: 'domcontentloaded', timeout: 20000 });
        assert.equal(response.status(), 200);
        await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
        const docs = page.locator('a[href="/en/docs"]:visible').first();
        const about = page.locator('a[href="/en/about"]:visible').first();
        await docs.waitFor({ timeout: 10000 });
        await about.waitFor({ timeout: 10000 });
        await page.evaluate(() => {
          window.__rapidClicks = [];
          addEventListener('click', event => {
            const link = event.target.closest('a');
            if (link) window.__rapidClicks.push([link.pathname, performance.now()]);
          }, { capture: true });
        });
        const first = await docs.boundingBox();
        const second = await about.boundingBox();
        await page.mouse.click(first.x + first.width / 2, first.y + first.height / 2);
        await page.waitForTimeout(60);
        await page.mouse.click(second.x + second.width / 2, second.y + second.height / 2);
        await page.waitForURL(url => url.pathname === '/en/about', { waitUntil: 'commit', timeout: 15000 });
        await page.locator('main img[src*="avatar-test"]').waitFor({ timeout: 15000 });
        await page.waitForTimeout(400);
        assert.equal(new URL(page.url()).pathname, '/en/about');
        const observed = await page.evaluate(() => ({
          clicks: window.__rapidClicks,
          heading: document.querySelector('main h1')?.textContent,
        }));
        assert.deepEqual(observed.clicks?.map(([route]) => route), ['/en/docs', '/en/about']);
        assert.ok(observed.heading?.trim());
        results.push({ index, status: 'pass', ...observed });
      } catch (error) {
        results.push({ index, status: 'fail', error: error.message });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(output, JSON.stringify({ results, errors }, null, 2));
  }
  console.log('Passed', results.filter(row => row.status === 'pass').length, 'of', results.length, 'browser errors', errors.length);
  if (results.some(row => row.status !== 'pass') || errors.length) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
