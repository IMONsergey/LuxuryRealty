import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// A deployed-route regression check for the November visual audit. The project
// suites cover interaction and motion; this checks every authored HTML route,
// including hidden/generated control markup and CSS pseudo-element arrows.
// No enquiries are sent. Asset decoding is deliberately eager and is not a
// loading-performance measurement. Screenshots preserve normal animations.
const require = createRequire(import.meta.url);
const playwrightPath = process.env.PLAYWRIGHT_PATH || 'playwright';
const engine = process.env.DESIGN_QA_ENGINE || 'chromium';
const output = path.resolve(process.env.DESIGN_QA_OUTPUT || './artifacts/design-release-20261101');
const origins = JSON.parse(process.env.DESIGN_QA_ORIGINS || '{}');
const widths = (process.env.DESIGN_QA_WIDTHS || '1440,390').split(',').map(Number);
if (!widths.length || widths.some(width => !Number.isSafeInteger(width) || width <= 0)) throw new Error('DESIGN_QA_WIDTHS must contain positive finite integer viewport widths');
const projectFilter = (process.env.DESIGN_QA_PROJECTS || '').split(',').map(id => id.trim()).filter(Boolean);
const budgetMs = Number(process.env.DESIGN_QA_TIMEOUT_MS || 420000);
if (!Number.isInteger(budgetMs) || budgetMs <= 0 || budgetMs > 2147483647) throw new Error('DESIGN_QA_TIMEOUT_MS must be an integer from 1 to 2147483647');
const requestedWorkers = Number(process.env.DESIGN_QA_WORKERS || 2);
if (!Number.isSafeInteger(requestedWorkers) || requestedWorkers <= 0) throw new Error('DESIGN_QA_WORKERS must be a positive finite integer');
const workers = Math.min(3, requestedWorkers);
const checkApi = process.env.DESIGN_QA_API_HEALTH !== '0';
const propertySlugs = ['residence', 'waterfront', 'skyline', 'garden', 'courtyard', 'panorama', 'terrace', 'retreat'].map(name => `dubai-hills-${name}`);
const projectSlugs = ['ava-at-palm', 'orla', 'six-senses', 'atlantis'];
const publishedProjectOrigins = {
  'ava-at-palm': 'https://ava-at-palm-imon.vercel.app',
  orla: 'https://orla-imon.vercel.app',
  'six-senses': 'https://six-senses-imon.vercel.app',
  atlantis: 'https://atlantis-imon.vercel.app',
};
const articleSlugs = ['spaces-worth-living-in', 'a-home-by-the-water', 'the-art-of-a-private-viewing', 'architecture-on-palm-jumeirah'];
const sites = [
  { id: 'luxury', origin: 'https://luxury-realty-imon.vercel.app', routes: ['/', '/properties/', ...propertySlugs.map(s => `/properties/${s}/`), '/developments/', ...projectSlugs.map(s => `/developments/${s}/`), '/insights/', ...articleSlugs.map(s => `/insights/${s}/`), '/contacts/', '/privacy/', '/404/'] },
  { id: 'atlantis', origin: 'https://atlantis-imon.vercel.app', routes: ['/', '/residences/3402/', '/privacy/', '/404/'] },
  { id: 'orla', origin: 'https://orla-imon.vercel.app', routes: ['/'] },
  { id: 'six-senses', origin: 'https://six-senses-imon.vercel.app', routes: ['/'] },
  { id: 'ava', origin: 'https://ava-at-palm-imon.vercel.app', routes: ['/', '/residences/801/', '/residences/1601/', '/location/', '/privacy/', '/404/'] },
].map(site => ({ ...site, origin: origins[site.id] || site.origin }));
const projectIds = new Set(sites.map(site => site.id));
const unknownProjectIds = [...new Set(projectFilter.filter(id => !projectIds.has(id)))];
if (unknownProjectIds.length) throw new Error(`Unknown DESIGN_QA_PROJECTS ID(s): ${unknownProjectIds.join(', ')}. Expected: ${[...projectIds].join(', ')}`);
const selectedSites = sites.filter(site => !projectFilter.length || projectFilter.includes(site.id));
if (!selectedSites.length) throw new Error('No projects selected for design QA');
const jobs = selectedSites.flatMap(site => site.routes.flatMap(route => widths.map(width => ({ ...site, route, width }))));
if (!jobs.length) throw new Error('No route/viewport jobs selected for design QA');
// Reject invalid configuration before loading Playwright or writing artifacts.
const playwright = require(playwrightPath);
const report = { startedAt: new Date().toISOString(), engine, workers, scope: 'Every authored route, text arrows including pseudo-elements, standalone text control symbols, image/font decoding, document horizontal overflow, same-page anchors, public project destinations, browser and resource errors; read-only API method check; no enquiry submission', routeInventory: selectedSites.map(({ id, origin, routes }) => ({ id, origin, routes })), expectedPages: jobs.length, expectedApiChecks: checkApi ? selectedSites.length : 0, pages: [], apiHealth: [], blockedEnquiries: [], fatalErrors: [] };
await mkdir(output, { recursive: true });
let browser;
let next = 0;
let timedOut = false;
let interrupted = false;
let closing;
const save = async () => {
  report.ok = !timedOut && !interrupted && !report.fatalErrors.length && !report.blockedEnquiries.length && report.pages.length === jobs.length && report.pages.every(page => page.ok) && report.apiHealth.length === report.expectedApiChecks && report.apiHealth.every(check => check.ok);
  report.finishedAt = new Date().toISOString();
  report.timedOut = timedOut;
  report.interrupted = interrupted;
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
};
const close = () => closing ??= browser?.close().catch(error => report.fatalErrors.push(`Cleanup: ${error.message}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { interrupted = true; report.fatalErrors.push(signal); void close(); });
const watchdog = setTimeout(() => { timedOut = true; report.fatalErrors.push(`Exceeded ${budgetMs} ms`); void close(); }, budgetMs);
const normalPath = value => value.replace(/\/+$/, '') || '/';
const isAsset = request => ['image', 'stylesheet', 'script', 'font'].includes(request.resourceType());

async function check(job) {
  const label = `${job.id}-${job.route === '/' ? 'home' : job.route.replace(/^\/+|\/+$/g, '').replaceAll('/', '-')}-${job.width}`;
  const result = { label, project: job.id, url: `${job.origin}${job.route}`, width: job.width, errors: [], pageErrors: [], consoleErrors: [], failedAssets: [], abortedAssets: [] };
  let context;
  let observe = true;
  try {
    context = await browser.newContext({ viewport: { width: job.width, height: job.width < 700 ? 844 : 1000 }, isMobile: job.width < 700, hasTouch: job.width < 700, reducedMotion: 'no-preference' });
    await context.route('**/api/enquiry**', async route => {
      report.blockedEnquiries.push({ label, url: route.request().url(), method: route.request().method() });
      await route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => { if (observe) result.pageErrors.push(error.message); });
    page.on('console', message => { if (observe && message.type() === 'error') result.consoleErrors.push({ message: message.text(), url: message.location().url }); });
    page.on('response', response => { if (observe && isAsset(response.request()) && response.status() >= 400) result.failedAssets.push({ url: response.url(), status: response.status() }); });
    page.on('requestfailed', request => {
      if (!observe || !isAsset(request)) return;
      const item = { url: request.url(), error: request.failure()?.errorText };
      (item.error === 'net::ERR_ABORTED' ? result.abortedAssets : result.failedAssets).push(item);
    });
    const response = await page.goto(result.url, { waitUntil: 'load', timeout: 25000 });
    result.status = response?.status();
    result.finalUrl = page.url();
    // /404/ is an explicitly authored fallback page. Static hosts may expose
    // it as HTTP 200 or 404; an unknown URL is tested separately by the suites.
    if (job.route === '/404/' ? ![200, 404].includes(result.status) : result.status !== 200) result.errors.push(`Unexpected HTTP status ${result.status}`);
    if (new URL(result.finalUrl).origin !== job.origin || normalPath(new URL(result.finalUrl).pathname) !== normalPath(job.route)) result.errors.push(`Unexpected navigation to ${result.finalUrl}`);
    result.resources = await page.evaluate(async () => {
      const images = [...document.images].filter(image => image.getAttribute('src') || image.getAttribute('srcset'));
      images.forEach(image => { image.loading = 'eager'; });
      const fonts = [...document.fonts];
      const deadline = performance.now() + 16000;
      const failures = [];
      const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await frames();
      await Promise.all([
        ...fonts.map(font => font.load().catch(() => null)),
        document.fonts.ready,
        (async () => {
          for (const image of images) {
            try {
              while (!image.complete || !image.naturalWidth) {
                if (performance.now() > deadline) throw new Error('Image load exceeded the asset budget');
                await new Promise(resolve => setTimeout(resolve, 25));
              }
              const first = image.currentSrc;
              try { await image.decode(); } catch (error) {
                await frames();
                if (image.currentSrc === first) throw error;
                await image.decode();
              }
              if (!image.complete || !image.naturalWidth) throw new Error('Image incomplete after decode');
            } catch (error) { failures.push({ src: image.currentSrc || image.src, error: error.message }); }
          }
        })(),
      ]);
      return { images: images.length, failures, fonts: fonts.map(font => ({ family: font.family, weight: font.weight, status: font.status })) };
    });
    if (result.resources.failures.length) result.errors.push('Image decoding failed');
    if (!result.resources.fonts.length || result.resources.fonts.some(font => font.status !== 'loaded')) result.errors.push('A declared font is missing or failed to load');
    await page.waitForTimeout(1100);
    result.dom = await page.evaluate(() => {
      const arrow = /[\u2190-\u21ff\u2794-\u27be\u27f0-\u27ff\u2900-\u297f\u2b00-\u2b11\u2b30-\u2b4c\u2b60-\u2b73\u2b80-\u2b95\u2ba0-\u2bb8\u2bc0-\u2bc8\u2329\u232a\u2303\u2304\u2305\u2039\u203a\u00ab\u00bb\u25b2\u25b4\u25b6\u25b8\u25bc\u25be\u25c0\u25c2]/u;
      const asciiArrows = new Set(['<', '>', '<<', '>>', '<-', '->', '<--', '-->', '^', 'v']);
      const isArrowText = value => arrow.test(value) || asciiArrows.has(value.trim());
      const describe = element => `${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}${element.getAttribute('class') ? '.' + element.getAttribute('class').trim().replace(/\s+/g, '.') : ''}`.slice(0, 200);
      const textArrows = [];
      const controlSymbols = [];
      const standaloneControlSymbol = /^[\u00d7+\u2212\u2013]$/u;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement?.closest('script,style,template,noscript')) continue;
        if (isArrowText(node.textContent || '')) textArrows.push({ element: describe(node.parentElement), text: node.textContent.trim().slice(0, 200) });
        // Match only an entire text leaf in an interactive control, not a
        // symbol within a normal label such as "Price – high to low" or "6+".
        const control = node.parentElement?.closest('button,summary,[role="button"]');
        if (control && standaloneControlSymbol.test(node.textContent.trim())) controlSymbols.push({ element: describe(node.parentElement), control: describe(control), text: node.textContent.trim() });
      }
      const pseudoArrows = [];
      for (const element of document.body.querySelectorAll('*')) {
        for (const pseudo of ['::before', '::after']) {
          const content = getComputedStyle(element, pseudo).content;
          if (content && content !== 'none' && content !== 'normal' && !content.includes('url(') && isArrowText(content.replace(/^["']|["']$/g, ''))) pseudoArrows.push({ element: describe(element), pseudo, content });
        }
      }
      const missingAnchors = [...document.querySelectorAll('a[href]')].flatMap(link => {
        let target;
        try { target = new URL(link.href); } catch { return []; }
        if (target.origin !== location.origin || target.pathname.replace(/\/$/, '') !== location.pathname.replace(/\/$/, '') || !target.hash || target.hash === '#') return [];
        let id; try { id = decodeURIComponent(target.hash.slice(1)); } catch { return [{ href: link.getAttribute('href'), error: 'Invalid fragment encoding' }]; }
        return document.getElementById(id) || document.getElementsByName(id).length ? [] : [{ href: link.getAttribute('href'), text: link.textContent.trim() }];
      });
      const nameFor = element => {
        const labelled = element.getAttribute('aria-labelledby');
        if (labelled) return labelled.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
        return element.getAttribute('aria-label') || element.textContent.trim() || [...element.querySelectorAll('img[alt]')].map(image => image.alt).join(' ').trim() || element.getAttribute('title') || '';
      };
      const visibleUnnamedControls = [...document.querySelectorAll('button,a[href],summary')].filter(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && !element.closest('[hidden],[inert]') && !nameFor(element);
      }).map(describe);
      return { title: document.title, h1Count: document.querySelectorAll('h1').length, width: innerWidth, scrollWidth: document.documentElement.scrollWidth, textArrows, pseudoArrows, controlSymbols, missingAnchors, visibleUnnamedControls };
    });
    if (!result.dom.title || result.dom.h1Count !== 1) result.errors.push('Expected a document title and one main heading');
    if (result.dom.width > job.width + 1) result.errors.push(`The mobile layout viewport expanded: ${result.dom.width} > ${job.width}`);
    if (result.dom.scrollWidth > result.dom.width + 1) result.errors.push(`Horizontal overflow: ${result.dom.scrollWidth} > ${result.dom.width}`);
    if (result.dom.textArrows.length || result.dom.pseudoArrows.length) result.errors.push('A text arrow remains in the rendered document');
    if (result.dom.controlSymbols.length) result.errors.push('A standalone text close/plus/minus symbol remains in a control');
    if (result.dom.missingAnchors.length) result.errors.push('A same-page anchor target is missing');
    if (result.dom.visibleUnnamedControls.length) result.errors.push('A rendered control has no accessible name');
    const projectSlug = job.id === 'luxury' ? job.route.match(/^\/developments\/([^/]+)\/$/)?.[1] : null;
    if (projectSlug && publishedProjectOrigins[projectSlug]) {
      result.projectLinks = await page.locator('a[href]').evaluateAll(links => links.map(link => link.href).filter(href => {
        const url = new URL(href);
        return url.hostname.endsWith('.vercel.app') && url.origin !== location.origin;
      }));
      result.expectedProjectOrigin = publishedProjectOrigins[projectSlug];
      if (!result.projectLinks.some(href => new URL(href).origin === result.expectedProjectOrigin && new URL(href).pathname === '/')) result.errors.push('The project CTA does not point to its published site');
      if (result.projectLinks.some(href => !Object.values(publishedProjectOrigins).includes(new URL(href).origin))) result.errors.push('A project CTA points to an unexpected deployment');
    }
    result.screenshot = `${label}.png`;
    result.screenshotScope = 'Initial viewport with normal motion; section/state captures belong to each project audit';
    await page.screenshot({ path: path.join(output, result.screenshot), fullPage: false, timeout: 15000 });
    result.scrollSamples = [];
    for (const fraction of [0.5, 1]) {
      await page.evaluate(value => window.scrollTo({ top: (document.documentElement.scrollHeight - innerHeight) * value, behavior: 'instant' }), fraction);
      await page.waitForTimeout(950);
      const sample = await page.evaluate(() => ({ y: scrollY, width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      result.scrollSamples.push(sample);
      if (sample.width > job.width + 1) result.errors.push(`The mobile layout viewport expanded after scrolling at ${fraction}`);
      if (sample.scrollWidth > sample.width + 1) result.errors.push(`Horizontal overflow after scrolling at ${fraction}`);
    }
  } catch (error) { result.errors.push(error.message); }
  finally {
    observe = false;
    result.unexpectedConsoleErrors = result.consoleErrors.filter(error => !(job.route === '/404/' && result.status === 404 && /404/.test(error.message) && error.url === result.finalUrl));
    if (result.pageErrors.length) result.errors.push('Uncaught browser errors');
    if (result.unexpectedConsoleErrors.length) result.errors.push('Console errors');
    if (result.failedAssets.length) result.errors.push('Failed asset requests');
    result.ok = result.errors.length === 0;
    report.pages.push(result);
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${label}${result.ok ? '' : ': ' + result.errors.join('; ')}`);
    await context?.close().catch(() => {});
  }
}

async function checkApiMethod(site) {
  const result = { project: site.id, url: `${site.origin}/api/enquiry`, method: 'GET', errors: [] };
  const context = await browser.newContext();
  try {
    await context.route('**/api/enquiry**', async route => {
      if (route.request().method() === 'GET') return route.continue();
      report.blockedEnquiries.push({ label: 'API method check', url: route.request().url(), method: route.request().method() });
      await route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    const response = await page.goto(result.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    result.status = response?.status();
    result.allow = response?.headers().allow;
    result.contentType = response?.headers()['content-type'];
    const body = await response?.json();
    result.message = body?.error;
    if (result.status !== 405 || result.allow !== 'POST' || !result.contentType?.includes('application/json') || result.message !== 'Use POST to submit an enquiry.') result.errors.push('The deployed API did not return its expected read-only method response');
  } catch (error) { result.errors.push(error.message); }
  finally {
    result.ok = result.errors.length === 0;
    report.apiHealth.push(result);
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${site.id} API GET method guard`);
    await context.close().catch(() => {});
  }
}

try {
  if (!playwright[engine]) throw new Error(`Unknown browser engine: ${engine}`);
  browser = await playwright[engine].launch({ headless: true });
  report.browserVersion = browser.version();
  await Promise.all(Array.from({ length: workers }, async () => {
    while (!timedOut && !interrupted) {
      const job = jobs[next++];
      if (!job) return;
      await check(job);
    }
  }));
  if (checkApi) for (const site of selectedSites) {
    if (timedOut || interrupted) break;
    await checkApiMethod(site);
  }
} catch (error) { report.fatalErrors.push(error.message); }
finally { clearTimeout(watchdog); await close(); await save(); }
console.log(JSON.stringify({ ok: report.ok, checked: report.pages.length, expected: jobs.length, failed: report.pages.filter(page => !page.ok).map(page => ({ label: page.label, errors: page.errors })), output }));
process.exitCode = report.ok ? 0 : 1;
