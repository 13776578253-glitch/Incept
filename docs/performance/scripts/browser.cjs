const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { chromium } = require(process.env.NAV_PLAYWRIGHT || 'playwright');

const base = process.argv[2];
const output = process.argv[3];
const rounds = Number(process.argv[4] || 30);
const names = (process.argv[5] || 'index,long,about,dashboard').split(',');
const modes = (process.argv[6] || 'cold,http-warm,repeat').split(',');
const routes = {
  index: ['/en/about', '/en/docs'],
  long: ['/en/docs', '/en/docs/git-base-knowledge'],
  short: ['/en/docs', '/en/docs/only-test'],
  about: ['/en/docs', '/en/about'],
  dashboard: ['/en/docs', '/en/dashboard'],
  roadmap: ['/en/docs', '/en/roadmap'],
  settings: ['/en/docs', '/en/settings'],
  'zh-index': ['/zh/about', '/zh/docs'],
  embedded: ['/en/docs', '/en/docs/embedded-system-2'],
  series: ['/en/docs', '/en/docs/series/collection-review/overview'],
};

function installProbe() {
  const snapshot = () => document.querySelector('main.app-main > :first-child');
  let active;
  const out = window.__navProbe = { commits: [], events: [], soft: [], urls: [], records: [] };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer) {
      const id = this.renderers.size + 1;
      this.renderers.set(id, renderer);
      return id;
    },
    onCommitFiberRoot(id, root) {
      out.ready = true;
      if (!active) return;
      if (location.pathname === active.target) active.commitURL ??= performance.now();
      const fiber = root.current;
      out.commits.push({
        at: performance.now(),
        route: location.pathname,
        actualDuration: fiber.actualDuration ?? null,
        actualStartTime: fiber.actualStartTime ?? null,
        version: this.renderers.get(id)?.version,
      });
    },
    onPostCommitFiberRoot() {},
    onCommitFiberUnmount() {},
  };
  for (const type of ['event', 'soft-navigation', 'interaction-contentful-paint']) {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (type === 'event' && entry.name !== 'click') continue;
        out[type === 'event' ? 'events' : 'soft'].push(entry.toJSON());
      }
    });
    observer.observe({ type, buffered: true, ...(type === 'event' ? { durationThreshold: 16 } : {}) });
  }
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name];
    history[name] = function (...args) {
      const previous = location.href;
      const result = original.apply(this, args);
      if (location.href !== previous) {
        const at = performance.now();
        out.urls.push({ at, name, href: location.href });
        if (active) active.url = at;
      }
      return result;
    };
  }
  window.__navArm = target => {
    active = null;
    window.__navTarget = target;
  };
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || link.pathname !== window.__navTarget || event.button !== 0) return;
    window.__navTarget = null;
    const before = snapshot();
    const beforeText = before?.textContent;
    const initial = { className: link.className, html: link.innerHTML, busy: link.getAttribute('aria-busy') };
    const current = active = {
      click: event.timeStamp, dispatch: performance.now(), timeOrigin: performance.timeOrigin, target: link.pathname,
    };
    out.records.push(current);
    performance.mark('nav-probe-click');
    function observeFrame() {
      if (active !== current || performance.now() - current.click > 15000) return;
      if (location.pathname === current.target) current.urlObserved ??= performance.now();
      const pending = link.querySelector('[data-navigation-pending="true"]');
      if (!current.feedback && pending) {
        const style = getComputedStyle(pending);
        if (style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0) {
          current.feedback = performance.now();
          current.feedbackKind = 'pending';
        }
      }
      const loading = document.querySelector('[data-navigation-loading]');
      if (loading && !current.skeleton) {
        const style = getComputedStyle(loading);
        if (style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0) {
          current.skeleton = performance.now();
          if (!current.feedback) {
            current.feedback = current.skeleton;
            current.feedbackKind = 'skeleton';
          }
        }
      }
      if (!current.urlObserved && !current.feedback &&
          (link.className !== initial.className || link.innerHTML !== initial.html || link.getAttribute('aria-busy') !== initial.busy)) {
        current.feedback = performance.now();
        current.feedbackKind = 'link-change';
      }
      if (current.urlObserved) {
        const after = snapshot();
        const contentChanged = after && (after !== before || after.textContent !== beforeText);
        const isLoading = after?.matches('[data-navigation-loading]') ||
          Boolean(after?.querySelector('[data-navigation-loading]'));
        if (contentChanged && !isLoading && after.textContent?.trim()) {
            current.targetBeforePaint = performance.now();
            requestAnimationFrame(() => {
              current.targetAfterFrame = performance.now();
              current.elements = document.getElementsByTagName('*').length;
              performance.mark('nav-probe-target');
            });
            return;
        }
      }
      requestAnimationFrame(observeFrame);
    }
    requestAnimationFrame(observeFrame);
  }, { capture: true, passive: true });
}

async function stopTrace(session) {
  const complete = new Promise(resolve => session.once('Tracing.tracingComplete', resolve));
  await session.send('Tracing.end');
  const { stream } = await complete;
  const chunks = [];
  for (;;) {
    const part = await session.send('IO.read', { handle: stream });
    chunks.push(part.data);
    if (part.eof) break;
  }
  await session.send('IO.close', { handle: stream });
  return chunks.join('');
}

async function getLink(page, target) {
  const locator = page.locator(`a[href="${target}"]:visible, a[href^="${target}?"]:visible`).first();
  await locator.waitFor({ timeout: 12000 });
  return locator;
}

async function trial(browser, name, mode, index) {
  const [source, target] = routes[name];
  const context = await browser.newContext({ viewport: { width: 1240, height: 900 } });
  try {
    await context.addInitScript(installProbe);
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    const requests = new Map();
    session.on('Network.requestWillBeSent', event => {
      const url = new URL(event.request.url);
      if (url.origin !== base || (!url.searchParams.has('_rsc') && !url.pathname.startsWith('/api/dashboard/usage') && event.type !== 'Document')) return;
      const headers = Object.fromEntries(Object.entries(event.request.headers).map(([k, v]) => [k.toLowerCase(), v]));
      requests.set(event.requestId, {
        id: event.requestId, route: url.pathname, search: url.search, kind: event.type,
        start: event.timestamp, epoch: event.wallTime * 1000,
        prefetch: headers['next-router-prefetch'] ?? null,
        segment: headers['next-router-segment-prefetch'] ?? null,
      });
    });
    session.on('Network.responseReceived', event => {
      const request = requests.get(event.requestId);
      if (!request) return;
      const response = event.response;
      request.response = event.timestamp;
      request.status = response.status;
      request.timing = response.timing;
      request.disk = response.fromDiskCache;
      request.protocol = response.protocol;
      request.cacheControl = Object.entries(response.headers).find(([key]) => key.toLowerCase() === 'cache-control')?.[1];
      request.requestId = Object.entries(response.headers).find(([key]) => key.toLowerCase() === 'x-request-id')?.[1];
    });
    session.on('Network.requestServedFromCache', event => {
      if (requests.has(event.requestId)) requests.get(event.requestId).cached = true;
    });
    for (const eventName of ['loadingFinished', 'loadingFailed']) {
      session.on(`Network.${eventName}`, event => {
        const request = requests.get(event.requestId);
        if (!request) return;
        request.end = event.timestamp;
        request.encoded = event.encodedDataLength;
        request.error = event.errorText;
      });
    }
    await session.send('Network.enable');
    await session.send('Network.setCacheDisabled', { cacheDisabled: mode === 'cold' || mode === 'slow' });
    const delayMs = Number(process.env.NAV_DELAY_MS || 0);
    if (delayMs) {
      if (!base.startsWith('http://127.0.0.1:')) throw new Error('The delay control is loopback only');
      await session.send('Fetch.enable', {
        patterns: [{ urlPattern: base + target + '*', requestStage: 'Response' }],
      });
      session.on('Fetch.requestPaused', async event => {
        const headers = Object.fromEntries(Object.entries(event.request.headers).map(([k, v]) => [k.toLowerCase(), v]));
        if (new URL(event.request.url).searchParams.has('_rsc') && !headers['next-router-prefetch']) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        try {
          await session.send('Fetch.continueResponse', { requestId: event.requestId });
        } catch (error) {
          if (!page.isClosed()) console.error(error.message);
        }
      });
    }
    const load = async () => {
      const response = await page.goto(base + source, { waitUntil: 'domcontentloaded', timeout: 20000 });
      if (!response?.ok()) throw new Error(`Source HTTP ${response?.status()}`);
      if (new URL(page.url()).pathname !== source) throw new Error(`Source redirected to ${page.url()}`);
      await page.waitForFunction(() => window.__navProbe.ready, null, { timeout: 10000 });
      await getLink(page, target);
    };
    await load();
    if (mode !== 'cold' && mode !== 'slow') {
      await (await getLink(page, target)).click();
      await page.waitForURL(url => url.pathname === target, { waitUntil: 'commit', timeout: 18000 });
      if (mode === 'repeat') {
        await (await getLink(page, source)).click();
        await page.waitForURL(url => url.pathname === source, { waitUntil: 'commit', timeout: 18000 });
      } else {
        await load();
      }
    }
    // The same pause gives viewport prefetch a chance in every arm.
    await page.waitForTimeout(350);
    if (mode === 'slow') {
      await session.send('Network.emulateNetworkConditions', {
        offline: false, latency: 150, downloadThroughput: 750 * 1024 / 8,
        uploadThroughput: 250 * 1024 / 8,
      });
    }
    await session.send('Tracing.start', {
      categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,blink.user_timing,loading,scheduler,v8',
      transferMode: 'ReturnAsStream',
    });
    const firstElements = await page.locator('*').count();
    const firstDom = await session.send('Memory.getDOMCounters');
    await page.evaluate(target => window.__navArm(target), target);
    const link = await getLink(page, target);
    await link.click();
    await page.waitForURL(url => url.pathname === target, { waitUntil: 'commit', timeout: 18000 });
    try {
      await page.waitForFunction(() => window.__navProbe.records.at(-1)?.targetAfterFrame, null, { timeout: 18000 });
    } catch {
      const diagnostic = await page.evaluate(() => ({
        href: location.href, h1: document.querySelector('main h1')?.textContent,
        main: document.querySelector('main')?.className,
        records: window.__navProbe.records, urls: window.__navProbe.urls, commits: window.__navProbe.commits,
      }));
      throw new Error(JSON.stringify(diagnostic));
    }
    await page.waitForTimeout(150);
    const result = await page.evaluate(() => ({
      ...window.__navProbe, h1: document.querySelector('main h1')?.textContent,
      assets: performance.getEntriesByType('resource')
        .filter(entry => /\/_next\/static\//.test(entry.name))
        .map(entry => [new URL(entry.name).pathname, entry.transferSize, entry.decodedBodySize, entry.startTime]),
      navigation: performance.getEntriesByType('navigation')[0]?.toJSON(),
    }));
    const finalDom = await session.send('Memory.getDOMCounters');
    const trace = await stopTrace(session);
    const label = `${name}-${mode}-${index}`;
    fs.writeFileSync(path.join(output, label + '.json.gz'), zlib.gzipSync(trace));
    return {
      name, mode, index, firstElements, firstDom, finalDom,
      browser: browser.version(), source, target, ...result, requests: Array.from(requests.values()),
    };
  } finally {
    await context.close();
  }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.NAV_EDGE ? { executablePath: process.env.NAV_EDGE } : {}),
    args: ['--disable-extensions', '--no-proxy-server'],
  });
  try {
    for (const name of names) {
      for (const mode of modes) {
        for (let index = 1; index <= rounds; index++) {
          try {
            const data = await trial(browser, name, mode, index);
            fs.appendFileSync(path.join(output, 'samples.jsonl'), JSON.stringify(data) + '\n');
            const record = data.records.at(-1);
            console.log(name, mode, index, data.h1, 'commit', (record.commitURL - record.click).toFixed(1), 'content', (record.targetAfterFrame - record.click).toFixed(1));
          } catch (error) {
            fs.appendFileSync(path.join(output, 'errors.jsonl'), JSON.stringify({ name, mode, index, error: error.message }) + '\n');
            console.error(name, mode, index, error.message);
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
