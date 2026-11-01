import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

// Deployment checks only. No form is filled or submitted, and enquiry requests
// are blocked as an additional guard. No application dependencies are needed.
const require = createRequire(import.meta.url);
const output = process.env.SMOKE_OUTPUT || './artifacts/production-browser';
const budgetMs = Math.min(165000, Math.max(30000, Number(process.env.SMOKE_TIMEOUT_MS) || 165000));
const started = Date.now();
const sites = [
  { id: 'luxury', origin: 'https://luxury-realty-imon.vercel.app' },
  { id: 'atlantis', origin: 'https://atlantis-imon.vercel.app' },
  { id: 'orla', origin: 'https://orla-imon.vercel.app' },
  { id: 'six-senses', origin: 'https://six-senses-imon.vercel.app' },
  { id: 'ava', origin: 'https://ava-at-palm-imon.vercel.app' },
];
const jobs = sites.flatMap(site => [1440, 390].map(width => ({ ...site, path: '/', width, label: `${site.id}-main-${width}`, fullPage: false })));
jobs.push(
  { ...sites[0], path: '/properties/', width: 390, label: 'luxury-catalogue-390', fullPage: true },
  { ...sites[0], path: '/properties/dubai-hills-residence/', width: 390, label: 'luxury-property-390', fullPage: true },
  { ...sites[4], path: '/residences/1601/', width: 390, label: 'ava-1601-390', fullPage: true },
  { ...sites[1], path: '/residences/3402/', width: 390, label: 'atlantis-3402-390', fullPage: true },
);
const projectLinks = [
  { slug: 'ava-at-palm', origin: sites[4].origin },
  { slug: 'orla', origin: sites[2].origin },
  { slug: 'six-senses', origin: sites[3].origin },
  { slug: 'atlantis', origin: sites[1].origin },
];

await mkdir(output, { recursive: true });
const report = {
  startedAt: new Date(started).toISOString(),
  scope: 'Production rendering, resource delivery, canonical URLs and project links; no form submissions',
  budgetMs,
  pages: [],
  projectLinks: [],
  blockedEnquiries: [],
  fatalErrors: [],
};
let browserServer;
let browser;
let context;
let cleanupPromise;
let timedOut = false;
let interrupted = false;
let nextJob = 0;

async function bounded(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(promise).then(value => ({ done: true, value })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ done: false }), milliseconds); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function cleanup() {
  cleanupPromise ??= (async () => {
    const graceful = await bounded(Promise.allSettled([browser?.close(), browserServer?.close()]), 4000);
    const child = browserServer?.process();
    const forceKillRequested = !graceful.done || Boolean(child && child.exitCode === null && child.signalCode === null);
    if (forceKillRequested) {
      await bounded(Promise.resolve(browserServer?.kill()).catch(() => {}), 2000);
    }
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGKILL');
      await bounded(exited, 1000);
    }
    const browserProcessExited = !child || child.exitCode !== null || child.signalCode !== null;
    report.browserCleanup = { graceful: graceful.done, forceKillRequested, browserProcessExited };
    if (!browserProcessExited) report.fatalErrors.push('Browser process did not confirm exit after cleanup');
  })();
  return cleanupPromise;
}

function success() {
  return !timedOut && !interrupted && report.fatalErrors.length === 0 && report.blockedEnquiries.length === 0 && report.pages.length === jobs.length && report.pages.every(page => page.ok) && report.projectLinks.length === projectLinks.length && report.projectLinks.every(link => link.ok);
}

async function saveReport() {
  report.pages.sort((a, b) => jobs.findIndex(job => job.label === a.label) - jobs.findIndex(job => job.label === b.label));
  const completedLabels = new Set(report.pages.map(page => page.label));
  await writeFile(`${output}/report.json`, JSON.stringify({ ...report, ok: success(), timedOut, interrupted, finishedAt: new Date().toISOString(), durationMs: Date.now() - started, skippedPages: jobs.filter(job => !completedLabels.has(job.label)).map(job => job.label) }, null, 2));
}

async function interrupt(signal) {
  interrupted = true;
  report.fatalErrors.push(`Interrupted by ${signal}`);
  await cleanup().catch(error => report.fatalErrors.push(`Cleanup: ${error.message}`));
  await saveReport().catch(error => console.error(error));
  process.exit(signal === 'SIGINT' ? 130 : 143);
}
process.once('SIGINT', () => { void interrupt('SIGINT'); });
process.once('SIGTERM', () => { void interrupt('SIGTERM'); });
process.once('exit', () => {
  const child = browserServer?.process();
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
});

const watchdog = setTimeout(() => {
  timedOut = true;
  report.fatalErrors.push(`Production smoke exceeded ${budgetMs} ms`);
  void cleanup();
}, budgetMs);

function normalPath(pathname) { return pathname.replace(/\/+$/, '') || '/'; }
function isAsset(request) {
  return ['image', 'stylesheet', 'script', 'font'].includes(request.resourceType()) || /\.(?:woff2?|ttf|otf|svg|png|jpe?g|webp|avif|ico|m?js|css)(?:[?#]|$)/i.test(request.url());
}

async function auditPage(job) {
  const result = { label: job.label, url: `${job.origin}${job.path}`, width: job.width, errors: [], scriptErrors: [], consoleErrors: [], failedAssets: [], abortedAssets: [], assetResponses: 0 };
  let page;
  let observe = true;
  try {
    page = await context.newPage();
    await page.setViewportSize({ width: job.width, height: job.width === 1440 ? 1000 : 844 });
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => { if (observe) result.scriptErrors.push(error.message); });
    page.on('console', message => { if (observe && message.type() === 'error') result.consoleErrors.push(message.text()); });
    page.on('response', response => {
      if (!observe || !isAsset(response.request())) return;
      result.assetResponses++;
      if (response.status() >= 400) result.failedAssets.push({ url: response.url(), status: response.status(), type: response.request().resourceType() });
    });
    page.on('requestfailed', request => {
      if (!observe || !isAsset(request)) return;
      const failure = { url: request.url(), error: request.failure()?.errorText, type: request.resourceType() };
      if (failure.error === 'net::ERR_ABORTED') result.abortedAssets.push(failure);
      else result.failedAssets.push(failure);
    });

    const response = await page.goto(result.url, { waitUntil: 'load', timeout: 22000 });
    result.httpStatus = response?.status() ?? null;
    result.finalUrl = page.url();
    if (result.httpStatus !== 200) result.errors.push(`Expected HTTP 200, received ${result.httpStatus}`);
    if (new URL(result.finalUrl).origin !== job.origin || normalPath(new URL(result.finalUrl).pathname) !== normalPath(job.path)) result.errors.push(`Unexpected redirect: ${result.finalUrl}`);

    // Load the original page's lazy images and declared fonts. This catches
    // missing release assets even when a screenshot only shows the first fold.
    result.render = await page.evaluate(async () => {
      const images = [...document.images].filter(image => image.getAttribute('src') || image.getAttribute('srcset'));
      images.forEach(image => { image.loading = 'eager'; });
      const fontFaces = [...document.fonts];
      const decodeErrors = [];
      const imageSourceChanges = [];
      let decodedImageCount = 0;
      const resourceDeadline = performance.now() + 14000;
      const twoFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      async function decodeLoadedImage(image) {
        let sourceBefore = '';
        let attempt = 0;
        try {
          for (attempt = 1; attempt <= 2; attempt++) {
            while (!image.complete || !image.naturalWidth) {
              if (performance.now() >= resourceDeadline) throw new Error('Image did not finish loading within the 14-second resource budget');
              await new Promise(resolve => setTimeout(resolve, 20));
            }
            sourceBefore = image.currentSrc || image.src;
            let decodeError;
            try { await image.decode(); } catch (error) { decodeError = error; }
            // A rejected decode can precede publication of a newly selected
            // responsive source. Retry only if its actual URL has changed.
            if (decodeError) await twoFrames();
            const sourceAfter = image.currentSrc || image.src;
            if (sourceAfter !== sourceBefore) {
              imageSourceChanges.push({ from: sourceBefore, to: sourceAfter, attempt, decodeError: decodeError?.message ?? null });
              if (attempt === 1 && performance.now() < resourceDeadline) continue;
              throw new Error('Image source changed again after the single permitted retry');
            }
            if (decodeError) throw decodeError;
            if (!image.complete || !image.naturalWidth) throw new Error('Image became incomplete after decoding');
            decodedImageCount++;
            return;
          }
        } catch (error) {
          decodeErrors.push({ url: image.currentSrc || image.src, currentSrc: image.currentSrc, sourceBefore, src: image.getAttribute('src'), attempt, error: error.message });
        }
      }
      const work = (async () => {
        // Let eager loading and srcset selection settle before checking load
        // completion; decode is still required for every selected image.
        await twoFrames();
        await Promise.all([
          (async () => { for (const image of images) await decodeLoadedImage(image); })(),
          ...fontFaces.map(face => face.load().catch(() => null)),
          document.fonts.ready,
        ]);
      })();
      let timer;
      const resourcesReady = await Promise.race([work.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 14000); })]);
      clearTimeout(timer);
      const width = window.innerWidth;
      const scrollWidth = document.documentElement.scrollWidth;
      return {
        title: document.title,
        canonical: [...document.querySelectorAll('link[rel="canonical"]')].map(link => link.href),
        ogUrl: document.querySelector('meta[property="og:url"]')?.content ?? null,
        width, scrollWidth, resourcesReady,
        imageCount: images.length,
        decodedImageCount,
        brokenImages: images.filter(image => !image.complete || !image.naturalWidth).map(image => image.currentSrc || image.src),
        decodeErrors, imageSourceChanges,
        fonts: fontFaces.map(face => ({ family: face.family, weight: face.weight, style: face.style, status: face.status })),
        overflowElements: scrollWidth > width + 1 ? [...document.querySelectorAll('body *')].filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && (rect.right > width + 1 || rect.left < -1);
        }).slice(0, 15).map(element => ({ tag: element.tagName, id: element.id, class: String(element.className).slice(0, 140), left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })) : [],
      };
    });
    const render = result.render;
    if (!render.title.trim()) result.errors.push('Document title is empty');
    if (!render.resourcesReady) result.errors.push('Image/font load exceeded 14 seconds');
    if (render.scrollWidth > render.width + 1) result.errors.push(`Horizontal overflow: ${render.scrollWidth}px at ${render.width}px`);
    if (render.brokenImages.length || render.decodeErrors.length || render.decodedImageCount !== render.imageCount) result.errors.push('Some images failed loading or decoding');
    if (!render.fonts.length || render.fonts.some(face => face.status !== 'loaded')) result.errors.push('Some declared fonts failed loading, or font declarations are missing');
    if (render.canonical.length === 0 && job.canonicalOptional) result.metadataNotes = [`Canonical${render.ogUrl ? '' : ' and og:url'} absent; allowed for the original ORLA release.`];
    else if (render.canonical.length !== 1) result.errors.push(`Expected one canonical URL, found ${render.canonical.length}`);
    else {
      const canonical = new URL(render.canonical[0]);
      if (canonical.origin !== job.origin || normalPath(canonical.pathname) !== normalPath(job.path) || canonical.search || canonical.hash) result.errors.push(`Incorrect canonical: ${canonical.href}`);
      if (render.ogUrl && render.ogUrl !== canonical.href) result.errors.push(`og:url differs from canonical: ${render.ogUrl}`);
    }
    result.screenshot = `${output}/${job.label}.png`;
    result.screenshotMode = job.fullPage ? 'full page' : 'viewport';
    await page.screenshot({ path: result.screenshot, fullPage: job.fullPage, animations: 'disabled', timeout: 10000 });
  } catch (error) {
    result.errors.push(error.message);
  } finally {
    observe = false;
    if (result.failedAssets.length) result.errors.push('Failed production asset requests');
    if (result.scriptErrors.length) result.errors.push('Uncaught browser JavaScript errors');
    if (result.consoleErrors.length) result.errors.push('Browser console errors');
    result.ok = result.errors.length === 0;
    report.pages.push(result);
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${job.label}${result.ok ? '' : ': ' + result.errors.join('; ')}`);
    await page?.close().catch(() => {});
  }
}

async function auditProjectLinks() {
  let parser;
  try {
    parser = await context.newPage();
    // Use the same browser network path as the rendered-page checks. A direct
    // Node API request may have different DNS/proxy access in isolated runners.
    for (const project of projectLinks) {
      const source = `${sites[0].origin}/developments/${project.slug}/`;
      const result = { source, expectedOrigin: project.origin, errors: [] };
      try {
        const response = await parser.goto(source, { waitUntil: 'domcontentloaded', timeout: 18000 });
        result.httpStatus = response?.status() ?? null;
        result.finalUrl = parser.url();
        if (result.httpStatus !== 200) result.errors.push(`Expected HTTP 200, received ${result.httpStatus}`);
        if (new URL(result.finalUrl).origin !== sites[0].origin || normalPath(new URL(result.finalUrl).pathname) !== normalPath(new URL(source).pathname)) result.errors.push(`Unexpected project-page redirect: ${result.finalUrl}`);
        const links = await parser.locator('a[href]').evaluateAll(nodes => nodes.map(link => link.href));
        result.projectLinks = links.filter(href => new URL(href).hostname.endsWith('.vercel.app') && new URL(href).origin !== sites[0].origin);
        if (!result.projectLinks.some(href => new URL(href).origin === project.origin && new URL(href).pathname === '/')) result.errors.push(`No external project CTA to ${project.origin}/`);
        const allowed = new Set(sites.map(site => site.origin));
        if (result.projectLinks.some(href => !allowed.has(new URL(href).origin))) result.errors.push('A project link points to an unexpected Vercel domain');
      } catch (error) {
        result.errors.push(error.message);
      }
      result.ok = result.errors.length === 0;
      report.projectLinks.push(result);
      console.log(`${result.ok ? 'PASS' : 'FAIL'} Luxury link: ${project.slug}`);
    }
  } finally {
    await parser?.close().catch(() => {});
  }
}

async function worker() {
  while (!timedOut && !interrupted && nextJob < jobs.length) {
    const job = jobs[nextJob++];
    await auditPage(job);
  }
}

try {
  const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/home/sergey/.local/share/imon-toolkit/node/node_modules/playwright');
  // launchServer exposes the actual browser child for forced cleanup if a
  // graceful Playwright shutdown fails. It listens only on the local machine.
  browserServer = await chromium.launchServer({ headless: true, host: '127.0.0.1', timeout: 20000 });
  browser = await chromium.connect(browserServer.wsEndpoint(), { timeout: 10000 });
  context = await browser.newContext({ reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: false });
  await context.route('**/api/enquiry**', async route => {
    report.blockedEnquiries.push({ url: route.request().url(), method: route.request().method() });
    await route.abort('blockedbyclient').catch(() => {});
  });
  // Keep decoded-image memory bounded while still validating every image.
  await Promise.all([worker(), auditProjectLinks()]);
} catch (error) {
  report.fatalErrors.push(error.message);
} finally {
  clearTimeout(watchdog);
  await cleanup().catch(error => report.fatalErrors.push(`Cleanup: ${error.message}`));
  await saveReport();
}
console.log(JSON.stringify({ ok: success(), durationMs: Date.now() - started, pages: report.pages.length, failedPages: report.pages.filter(page => !page.ok).map(page => page.label), projectLinks: report.projectLinks.length, report: `${output}/report.json` }, null, 2));
process.exitCode = timedOut ? 124 : success() ? 0 : 1;
