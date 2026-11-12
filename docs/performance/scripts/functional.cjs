const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.NAV_PLAYWRIGHT || 'playwright');

const base = process.argv[2];
const output = process.argv[3];
if (!base || !output) throw new Error('Usage: node functional.cjs <origin> <output-directory>');
const localOnly = new URL(base).hostname === '127.0.0.1';
const results = [];
const problems = [];
const fixtureNotices = [];
const round = value => Math.round(value * 100) / 100;

async function scenario(name, action) {
  const start = performance.now();
  try {
    const details = await action();
    results.push({ name, outcome: 'pass', ms: round(performance.now() - start), details });
    console.log('PASS', name, JSON.stringify(details));
  } catch (error) {
    results.push({ name, outcome: 'fail', ms: round(performance.now() - start), error: error.message });
    console.error('FAIL', name, error.message);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function routeLink(page, route) {
  return page.locator(`a[href="${route}"]:visible, a[href^="${route}?"]:visible`).first();
}

async function ready(page, pathname) {
  await page.goto(base + pathname, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.locator('main.app-main').waitFor({ timeout: 10000 });
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.NAV_EDGE ? { executablePath: process.env.NAV_EDGE } : {}),
    args: ['--disable-extensions', '--no-proxy-server'],
  });
  const context = await browser.newContext({ viewport: { width: 1240, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', error => problems.push({ kind: 'pageerror', text: error.message }));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const location = message.location().url;
    if (localOnly && location && new URL(location).pathname.startsWith('/_docs-media/')
      && message.text().includes('status of 404')) {
      fixtureNotices.push({ kind: 'isolated-fixture-media', path: new URL(location).pathname });
      return;
    }
    problems.push({ kind: 'console', text: message.text(), location });
  });
  page.on('response', response => {
    if (response.status() >= 500) problems.push({ kind: 'response', status: response.status(), path: new URL(response.url()).pathname });
  });
  try {
    const routes = ['/en/docs', '/en/docs/only-test', '/en/docs/git-base-knowledge',
      '/en/docs/series/collection-review/overview', '/en/about', '/en/roadmap',
      '/en/dashboard', '/en/settings', '/zh/docs', '/zh/about'];
    for (const route of routes) {
      await scenario(`guest route ${route}`, async () => {
        const response = await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 25000 });
        assert(response?.status() === 200, `${route} returned ${response?.status()}`);
        const main = page.locator('main.app-main');
        await main.waitFor({ state: 'visible', timeout: 15000 });
        await page.waitForFunction(() => {
          const main = document.querySelector('main.app-main');
          return main && !main.querySelector('[data-navigation-loading]') && main.textContent.trim().length > 0;
        }, null, { timeout: 20000 });
        return { route, status: response.status(), elements: await page.locator('*').count() };
      });
    }

    await scenario('anonymous account sign-in form and origin boundary', async () => {
      await ready(page, '/en/settings?section=account');
      await page.getByRole('heading', { name: 'Owner sign in' }).waitFor({ timeout: 10000 });
      await page.locator('main.app-main input[name="username"]:visible').first().waitFor({ timeout: 10000 });
      await page.locator('main.app-main input[name="password"]:visible').first().waitFor({ timeout: 10000 });
      const state = await context.request.get(base + '/api/auth/owner/state');
      assert(state.ok(), 'Owner state endpoint did not respond');
      const account = await state.json();
      assert(account.role === 'guest' && !account.management, 'Anonymous management scope was present');
      const crossOrigin = await context.request.post(base + '/api/auth/owner/login', {
        headers: { Origin: 'https://navigation-probe.invalid' },
        data: {},
      });
      assert(crossOrigin.status() === 403, 'Cross-origin sign-in request was not rejected');
      return { signInForm: true, role: account.role, crossOrigin: crossOrigin.status() };
    });

    await scenario('missing documents and supplied protected documents return 404 to guests', async () => {
      const observed = [];
      const beforeProblems = problems.length;
      const routes = ['/en/docs/does-not-exist-navigation-probe'];
      const protectedRoute = process.env.NAV_PROTECTED_DOC;
      if (protectedRoute) {
        assert(/^\/(en|zh)\/docs\/[\w%-]+$/.test(protectedRoute), 'Expected a localized protected document path');
        routes.push(protectedRoute);
      }
      for (const route of routes) {
        const response = await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 20000 });
        observed.push({ route, status: response?.status() });
        assert(response?.status() === 404, `${route} returned ${response?.status()}`);
      }
      const during = problems.splice(beforeProblems);
      problems.push(...during.filter(problem =>
        problem.kind !== 'console' || !problem.text.includes('status of 404')));
      return observed;
    });

    await scenario('desktop link, back, and forward preserve destination', async () => {
      await ready(page, '/en/docs');
      const link = routeLink(page, '/en/about');
      await link.waitFor({ state: 'visible', timeout: 10000 });
      await link.click();
      await page.waitForURL(url => url.pathname === '/en/about', { waitUntil: 'commit', timeout: 18000 });
      await page.goBack({ waitUntil: 'commit', timeout: 18000 });
      await page.waitForURL(url => url.pathname === '/en/docs', { waitUntil: 'commit', timeout: 18000 });
      await page.goForward({ waitUntil: 'commit', timeout: 18000 });
      await page.waitForURL(url => url.pathname === '/en/about', { waitUntil: 'commit', timeout: 18000 });
      return { finalPath: new URL(page.url()).pathname };
    });

    await scenario('keyboard activation', async () => {
      await ready(page, '/en/docs');
      const link = routeLink(page, '/en/about');
      await link.focus();
      assert(await link.evaluate(element => document.activeElement === element), 'Link did not receive focus');
      await page.keyboard.press('Enter');
      await page.waitForURL(url => url.pathname === '/en/about', { waitUntil: 'commit', timeout: 18000 });
      return { finalPath: new URL(page.url()).pathname };
    });

    await scenario('modifier click opens a separate page', async () => {
      await ready(page, '/en/docs');
      const link = routeLink(page, '/en/about');
      const popupPromise = context.waitForEvent('page', { timeout: 12000 });
      await link.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
      const popup = await popupPromise;
      await popup.waitForURL(url => url.pathname === '/en/about', { waitUntil: 'commit', timeout: 20000 });
      assert(new URL(page.url()).pathname === '/en/docs', 'Source page changed');
      assert(new URL(popup.url()).pathname === '/en/about', 'Popup did not open target');
      await popup.close();
      return { source: '/en/docs', popup: '/en/about' };
    });

    await scenario('article anchor and browser back restore scroll', async () => {
      await page.setViewportSize({ width: 1920, height: 900 });
      await ready(page, '/en/docs/git-base-knowledge');
      const anchor = page.locator('[data-outline-id][href^="#"]:visible').first();
      assert(await anchor.count(), 'No visible table of contents item was available');
      const hash = await anchor.getAttribute('href');
      await anchor.click();
      await page.waitForURL(url => url.hash === hash, { waitUntil: 'commit', timeout: 10000 });
      const targetId = decodeURIComponent(hash.slice(1));
      assert(await page.evaluate(id => Boolean(document.getElementById(id)), targetId), 'Anchor target is missing');
      await page.waitForFunction(id => {
        const element = document.getElementById(id);
        return element && Math.abs(element.getBoundingClientRect().top) < 300;
      }, targetId);
      await ready(page, '/en/docs/git-base-knowledge');
      const maxScroll = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
      const expected = Math.min(maxScroll, 600);
      await page.evaluate(value => window.scrollTo({ top: value, behavior: 'instant' }), expected);
      await page.waitForTimeout(100);
      const actualBefore = await page.evaluate(() => scrollY);
      await routeLink(page, '/en/about').click();
      await page.waitForURL(url => url.pathname === '/en/about', { waitUntil: 'commit', timeout: 18000 });
      await page.goBack({ waitUntil: 'commit', timeout: 18000 });
      await page.waitForURL(url => url.pathname === '/en/docs/git-base-knowledge', { waitUntil: 'commit', timeout: 18000 });
      await page.waitForTimeout(500);
      const actualAfter = await page.evaluate(() => scrollY);
      assert(Math.abs(actualAfter - actualBefore) < 140, `Scroll changed ${actualBefore} → ${actualAfter}`);
      await page.setViewportSize({ width: 1240, height: 900 });
      return { scrollBefore: actualBefore, scrollAfter: actualAfter, anchorTested: true };
    });

    await scenario('mobile menu navigation', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await ready(page, '/en/docs');
      const menu = page.getByRole('button', { name: /menu/i }).first();
      await menu.click();
      const link = routeLink(page, '/en/about');
      await link.waitFor({ state: 'visible', timeout: 5000 });
      await link.click();
      await page.waitForURL(url => url.pathname === '/en/about', { waitUntil: 'commit', timeout: 18000 });
      const width = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
      assert(width.content <= width.viewport + 1, `Horizontal overflow ${JSON.stringify(width)}`);
      await page.screenshot({ path: path.join(output, 'mobile-about.png') });
      await page.setViewportSize({ width: 1240, height: 900 });
      return width;
    });

    await scenario('Dashboard range switch and request cancellation', async () => {
      await ready(page, '/en/dashboard');
      const group = page.getByRole('group', { name: 'Window' });
      await group.getByRole('button', { name: 'All', exact: true }).click();
      await group.getByRole('button', { name: 'Last 7D', exact: true }).click();
      await group.getByRole('button', { name: 'Last 30D', exact: true }).click();
      await page.waitForFunction(() => {
        const group = document.querySelector('[aria-label="Window"]');
        return group && [...group.querySelectorAll('button')].some(button =>
          button.textContent.includes('Last 30D') && button.getAttribute('aria-pressed') === 'true');
      }, null, { timeout: 10000 });
      const refresh = page.locator('[role="progressbar"][aria-busy]');
      await refresh.waitFor({ timeout: 10000 });
      await page.waitForFunction(() =>
        document.querySelector('[role="progressbar"][aria-busy]')?.getAttribute('aria-busy') === 'false',
        null, { timeout: 30000 });
      return { selected: 'Last 30D', busy: await refresh.getAttribute('aria-busy') };
    });

    if (localOnly) {
      await scenario('rapid navigation interrupts the previous target', async () => {
        let armed = false;
        let delayed = 0;
        await context.route('**/*', async route => {
          const request = route.request();
          const url = new URL(request.url());
          const headers = request.headers();
          if (armed && url.pathname === '/en/docs' && url.searchParams.has('_rsc') && !headers['next-router-prefetch']) {
            delayed++;
            await new Promise(resolve => setTimeout(resolve, 650));
          }
          await route.continue().catch(() => {});
        });
        try {
          await ready(page, '/en/roadmap');
          armed = true;
          await routeLink(page, '/en/docs').click({ noWaitAfter: true });
          await page.waitForTimeout(70);
          const feedback = await page.locator('[data-navigation-pending="true"], [data-navigation-loading]')
            .first().isVisible().catch(() => false);
          if (feedback) await page.screenshot({ path: path.join(output, 'navigation-pending.png') });
          await routeLink(page, '/en/about').click({ noWaitAfter: true });
          await page.waitForURL(url => url.pathname === '/en/about', { waitUntil: 'commit', timeout: 18000 });
          await page.waitForTimeout(1100);
          assert(delayed > 0, 'The response delay was not exercised');
          assert(new URL(page.url()).pathname === '/en/about', 'Earlier navigation replaced the latest destination');
          return { delayed, feedback, finalPath: new URL(page.url()).pathname };
        } finally {
          await context.unrouteAll({ behavior: 'wait' });
        }
      });

      await scenario('failed Flight request leaves the site navigable', async () => {
        let armed = false;
        let aborted = 0;
        const beforeProblems = problems.length;
        await context.route('**/*', async route => {
          const request = route.request();
          const url = new URL(request.url());
          if (armed && url.pathname === '/en/about' && url.searchParams.has('_rsc') &&
              !request.headers()['next-router-prefetch'] && aborted === 0) {
            aborted++;
            await route.abort('failed');
          } else {
            await route.continue().catch(() => {});
          }
        });
        try {
          await ready(page, '/en/docs');
          armed = true;
          await routeLink(page, '/en/about').click({ noWaitAfter: true });
          await page.waitForTimeout(1500);
          await ready(page, '/en/docs');
          assert(aborted === 1, 'Failed request was not exercised');
          assert(new URL(page.url()).pathname === '/en/docs', 'Source page unavailable after failed request');
          const expectedFailures = problems.splice(beforeProblems);
          problems.push(...expectedFailures.filter(problem => problem.kind === 'response'));
          return { aborted, finalPath: new URL(page.url()).pathname, expectedFailures };
        } finally {
          await context.unrouteAll({ behavior: 'wait' });
        }
      });
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'functional-results.json'), JSON.stringify({
      browser: browser.version(), base, viewport: { desktop: [1240, 900], mobile: [390, 844] },
      results, problems, fixtureNotices,
    }, null, 2));
  }
  const failures = results.filter(result => result.outcome !== 'pass');
  console.log('Summary', results.length, 'scenarios', failures.length, 'failures', problems.length, 'browser errors');
  if (failures.length || problems.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
