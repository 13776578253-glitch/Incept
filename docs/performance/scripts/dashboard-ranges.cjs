const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.NAV_PLAYWRIGHT || 'playwright');

const [base, output, repeat = '3'] = process.argv.slice(2);
assert(base && output, 'Usage: node dashboard-ranges.cjs BASE OUTPUT [ROUNDS]');
const waitMs = Number(process.env.DASHBOARD_RANGE_WAIT_MS || 15_000);
const liveExpected = process.env.DASHBOARD_RANGE_EXPECT_RESPONSE === '1';
const livePlan = (process.env.DASHBOARD_RANGE_LIVE_PLAN || 'all').split(',');
const chinese = process.env.DASHBOARD_RANGE_LOCALE === 'zh';
const labels = chinese ? { '7d': '近 7 天', '30d': '近 30 天', all: '全部' } :
  { '7d': 'Last 7D', '30d': 'Last 30D', all: 'All' };
const tokenSelector = chinese ? 'section[aria-label="用量概览"] article:first-child > p' :
  'section[aria-label="Usage overview"] article:first-child > p';
const routes = ['/api/dashboard/usage', '/api/dashboard/billing', '/api/dashboard/sync/devices/status'];
const allowed = url => {
  const parsed = new URL(url);
  return routes.includes(parsed.pathname) || parsed.searchParams.has('_rsc');
};

function installProbe({ tokenSelector, trendLabel }) {
  const samples = window.rangeSamples = [];
  const known = {};
  const requests = window.rangeRequests = [];
  const longTasks = window.rangeLongTasks = [];
  const commits = window.rangeCommits = [];
  const displayValue = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' :
    n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : n.toLocaleString('en-US');
  const useRequest = url => /\/api\/dashboard\/(usage|billing|sync\/devices\/status)(\?|$)/.test(url);
  const now = () => performance.now();
  const kpi = () => document.querySelector(tokenSelector);
  const panel = () => document.querySelector('[data-dashboard-palette]');
  const chart = () => document.querySelector('[role="tablist"][aria-label="' + trendLabel + '"]')?.parentElement?.parentElement;
  let current;
  const initialHref = location.href;
  const sourceFetch = window.fetch;
  window.fetch = function(input, options) {
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    if (!useRequest(url.href)) return sourceFetch.call(this, input, options);
    const row = { path: url.pathname, range: url.searchParams.get('range'), start: now(), conditional: !!new Headers(options?.headers).get('If-None-Match') };
    requests.push(row);
    return sourceFetch.call(this, input, options).then(response => {
      row.headers = now(); row.status = response.status;
      row.role = response.headers.get('X-Incept-Dashboard-Role');
      const json = response.json.bind(response);
      response.json = async () => {
        row.jsonStart = now();
        const value = await json();
        row.jsonEnd = now();
        if (row.path.endsWith('/usage')) {
          row.dataRange = value.range;
          row.dailyRows = value.daily?.length;
          row.sessionRows = value.sessions?.length;
          if (value.range && value.totals) known[value.range] = displayValue(value.totals.totalTokens);
          if (current?.live && current.range === value.range && row.start >= current.clicked) {
            current.expected = known[value.range];
          }
        }
        return value;
      };
      return response;
    }, error => {
      row.errorAt = now(); row.aborted = error.name === 'AbortError';
      throw error;
    });
  };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, renderers: new Map(),
    inject(renderer) { const id = this.renderers.size + 1; this.renderers.set(id, renderer); return id; },
    onScheduleFiberRoot() {},
    onCommitFiberRoot() { commits.push(now()); },
    onPostCommitFiberRoot() {}, onCommitFiberUnmount() {},
  };
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) longTasks.push({ start: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask', buffered: true });
  }
  window.armRange = (id, label, expected, range, live) => {
    current = { id, label, expected: expected ?? (live ? known[range] : undefined), range, live };
    samples.push(current);
  };
  window.rememberInitialRange = () => { known['30d'] = kpi()?.textContent.trim(); };
  document.addEventListener('click', event => {
    const button = event.target.closest('.dashboard-segmented button');
    if (!button || !current || current.clicked || button.textContent.trim() !== current.label) return;
    const sample = current;
    const root = panel();
    sample.clicked = event.timeStamp;
    sample.dispatched = now();
    sample.initialIsTarget = kpi()?.textContent.trim() === sample.expected;
    performance.mark('range-click-' + sample.id);
    const mutations = new MutationObserver(() => {
      if (current !== sample) { mutations.disconnect(); return; }
      if (sample.expected && button.getAttribute('aria-pressed') === 'true' && kpi()?.textContent.trim() === sample.expected) {
        sample.targetDom = now();
        mutations.disconnect();
      }
    });
    if (root) mutations.observe(root, { attributes: true, childList: true, characterData: true, subtree: true });
    setTimeout(() => mutations.disconnect(), 95_000);
    function nextFrame() {
      if (current !== sample || now() - sample.clicked > 95_000) return;
      const at = now();
      sample.urlChanged ||= location.href !== initialHref;
      sample.remounted ||= panel() !== root;
      sample.routeLoading ||= !!document.querySelector('[data-navigation-loading]');
      sample.rangeLoading ||= !kpi();
      if (!sample.feedback && button.getAttribute('aria-pressed') === 'true') {
        sample.feedback = at;
        performance.mark('range-feedback-' + sample.id);
      }
      if (sample.feedback && sample.expected && kpi()?.textContent.trim() === sample.expected) {
        if (!sample.visible) {
          sample.visible = at;
          performance.mark('range-visible-' + sample.id);
        }
        const billingInFlight = requests.some(row => row.path.endsWith('/billing') &&
          row.start >= sample.clicked && !row.errorAt && !row.jsonEnd && !(row.status >= 400));
        const refreshing = root?.querySelector('.dashboard-refresh-track')?.getAttribute('aria-busy') === 'true';
        if (!refreshing && !billingInFlight) {
          const signature = (chart()?.textContent ?? root?.querySelector('section')?.textContent ?? '');
          if (sample.signature !== signature) {
            sample.signature = signature;
            sample.firstQuiet = at;
          } else if (at - sample.firstQuiet >= 40) {
            sample.stable = sample.firstQuiet;
            delete sample.signature;
            performance.mark('range-stable-' + sample.id);
            return;
          }
        } else {
          delete sample.signature;
          delete sample.firstQuiet;
        }
      }
      requestAnimationFrame(nextFrame);
    }
    requestAnimationFrame(nextFrame);
  }, true);
}

async function run() {
  const verify = {};
  const browser = await chromium.launch({ headless: true });
  const locale = chinese ? '/zh/dashboard' : '/en/dashboard';
  const rounds = Number(repeat);
  const rows = [], errors = [], requests = [];
  const ranges = Object.keys(labels);
  function compact(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toLocaleString('en-US');
  }
  try {
    if (!liveExpected) {
      const control = await browser.newContext();
      for (const range of ranges) {
        const response = await control.request.get(new URL('/api/dashboard/usage?range=' + range, base).href);
        assert.equal(response.status(), 200);
        const data = await response.json();
        verify[range] = { role: response.headers()['x-incept-dashboard-role'], value: compact(data.totals.totalTokens),
          daily: data.daily.length, models: data.models.length, sessions: data.sessions.length,
          bytes: Buffer.byteLength(JSON.stringify(data)), checkedAt: data.checkedAt };
      }
      await control.close();
      assert.equal(new Set(Object.values(verify).map(v => v.value)).size, 3, 'Need three distinct range totals');
    }

    for (let round = 1; round <= rounds; round++) {
      for (const [kind, plan] of liveExpected ? [[livePlan.length === 1 ? 'owner-cold-all' : 'owner-sequence', livePlan]] : [
        ['sequence', ['7d', '30d', 'all', '30d', '7d']],
        ['cold-all', ['all']],
        ['rapid', ['7d', 'all', '30d', '7d', 'all']],
        ...(round === 1 ? [['rapid-delay', ['7d', 'all', '30d', '7d', 'all']]] : []),
      ]) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 930 }, reducedMotion: 'reduce' });
        await context.addInitScript(installProbe, { tokenSelector, trendLabel: chinese ? '趋势' : 'Trends' });
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message.split('\n')[0].slice(0, 160)));
        if (kind === 'rapid-delay') {
          await page.route('**/api/dashboard/usage?*', async route => {
            await new Promise(resolve => setTimeout(resolve, 300));
            await route.continue().catch(() => {});
          });
        }
        const network = [];
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        const inFlight = new Map();
        cdp.on('Network.requestWillBeSent', e => {
          if (!allowed(e.request.url)) return;
          const url = new URL(e.request.url);
          const row = { path: url.pathname, range: url.searchParams.get('range'), flight: url.searchParams.has('_rsc'),
            timestamp: e.timestamp, wallTime: e.wallTime };
          network.push(row); inFlight.set(e.requestId, row);
        });
        cdp.on('Network.responseReceived', e => {
          const row = inFlight.get(e.requestId);
          if (row) { row.head = e.timestamp; row.status = e.response.status; }
        });
        cdp.on('Network.loadingFinished', e => {
          const row = inFlight.get(e.requestId);
          if (row) { row.end = e.timestamp; row.encoded = e.encodedDataLength; }
        });
        cdp.on('Network.loadingFailed', e => {
          const row = inFlight.get(e.requestId);
          if (row) { row.end = e.timestamp; row.cancelled = e.canceled; row.error = e.errorText; }
        });
        try {
          await page.goto(new URL(locale, base).href, { waitUntil: 'load', timeout: 90_000 });
          const expectedDom = ({ selector, text }) => document.querySelector(selector)?.textContent.trim() === text;
          if (liveExpected) await page.locator(tokenSelector).first().waitFor({ timeout: waitMs });
          else await page.waitForFunction(expectedDom, { selector: tokenSelector, text: verify['30d'].value }, { timeout: waitMs });
          await page.evaluate(() => window.rememberInitialRange());
          await page.waitForTimeout(250);
          for (let index = 0; index < plan.length; index++) {
            const range = plan[index];
            const id = [round, kind, index, range].join(':');
            const button = page.getByRole('button', { name: labels[range], exact: true });
            await page.evaluate(args => window.armRange(...args), [id, labels[range], verify[range]?.value, range, liveExpected]);
            await button.click({ timeout: 20_000 });
            if (kind.startsWith('rapid') && index < plan.length - 1) {
              await page.waitForTimeout(40);
            } else {
              await page.waitForFunction(id => window.rangeSamples.find(row => row.id === id)?.stable, id, { timeout: waitMs });
            }
          }
          await page.waitForTimeout(100);
          const details = await page.evaluate(() => ({
            rows: window.rangeSamples.map(({ expected, signature, ...sample }) => sample),
            fetches: window.rangeRequests, tasks: window.rangeLongTasks, commits: window.rangeCommits,
            resource: performance.getEntriesByType('resource').filter(e => /\/api\/dashboard\//.test(e.name)).map(e => ({
              path: new URL(e.name).pathname, range: new URL(e.name).searchParams.get('range'),
              start: e.startTime, head: e.responseStart, end: e.responseEnd,
              encoded: e.encodedBodySize, decoded: e.decodedBodySize,
            })), timeOrigin: performance.timeOrigin,
          }));
          for (const sample of details.rows) rows.push({ ...sample, kind, round });
          requests.push({ round, kind, ...details, rows: undefined,
            browserNetwork: network.map(n => ({ ...n, start: n.wallTime * 1000 - details.timeOrigin,
              ttfb: n.head === undefined ? undefined : (n.head - n.timestamp) * 1000,
              download: n.head === undefined || n.end === undefined ? undefined : (n.end - n.head) * 1000 })) });
          if (liveExpected) {
            assert(details.fetches.some(row => row.role === 'owner' && row.dataRange === plan.at(-1) && row.status === 200));
          } else {
            assert.equal(await page.locator(tokenSelector).first().textContent(), verify[plan.at(-1)].value);
          }
        } catch (error) {
          const state = await page.evaluate(selector => ({
            rows: (window.rangeSamples ?? []).map(({ expected, signature, ...sample }) => sample),
            fetches: window.rangeRequests,
            active: document.querySelector('.dashboard-segmented [aria-pressed="true"]')?.textContent.trim(),
            hasOverview: !!document.querySelector(selector),
          }), tokenSelector).catch(() => null);
          errors.push({ round, kind, error: error.message, state, pageErrors });
        } finally {
          await context.close();
          fs.writeFileSync(output, JSON.stringify({ verify, rows, requests, errors }, null, 2));
        }
      }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(output, JSON.stringify({ verify, rows, requests, errors }, null, 2));
  }
  console.log(JSON.stringify({ rounds, samples: rows.length, errors: errors.length }));
  if (errors.length) process.exitCode = 1;
}

run().catch(error => { console.error(error); process.exitCode = 1; });
