# Luxury Realty continuation checkpoint

## Scope and source

Continue the authorized build and publication of all five real-estate projects. This staging checkout owns Luxury Realty only; root owns server execution, GitHub and Vercel publication.

Recovered the complete original implementation from `/workspace/scratch/6ba048c62957/sites/LuxuryRealty`. Excluded `.git`, `node_modules`, `.astro`, `.vercel`, `dist`, `artifacts` and `design`. Preserved all page templates, eight property detail routes, four development detail routes, insights/articles and the original styling, artwork and fonts.

## Continuation changes

- Enquiry fingerprint excludes transient reference/time fields. Edited attempted data obtains a new UUID; unchanged retries and modal reopening retain UUID and startedAt.
- Pending forms freeze inputs and cannot change the context while an earlier request is in flight. Duplicate submit events are ignored.
- UI success requires HTTP success, `ok: true` and the exact submitted receipt ID. Expired/conflicting references can be renewed without dropping entered details.
- Dialog transitions from the menu restore focus to the visible parent opener.
- Catalogue URL, scroll position and selected property are saved in guarded session storage. Detail return links restore the original collection and focus. URL filters continue to work if storage is denied.
- The four project links use the assigned `*-imon.vercel.app` deployments. Six Senses location corrected to Dubai Marina in both the project data and detail hero. The related waterfront article title no longer implies that all four projects are on Palm Jumeirah; route unchanged.
- Canonical configuration supports `SITE_URL` and `PUBLIC_SITE_URL`, defaulting to the verified assigned Luxury project origin.
- Added `scripts/browser-qa.mjs`, which starts Astro on port 4312, uses shared server Playwright, records screenshots/report and mocks only UI enquiry responses.

## Current checks

- All 48 source asset-map entries and their srcset derivatives exist.
- Ten WOFF2 files are present.
- `node --check` passed for the QA script and Astro configuration.
- Fresh install/build/check/backend/browser runs remain for root on the server queue. No new passing runtime result is claimed here.

## Root handoff

Run `npm ci`, `npm run build`, `npm run check`, `npm test`, then `npm run test:browser` on the server. QA starts/stops its own development process and writes `artifacts/browser-qa.json`.

Root will apply any current shared backend changes, configure private Blob and project env, perform real deployed receipt verification, and commit/push/publish the accepted result. Keep source assets and fonts intact. Do not publish old generated `dist` or `.vercel` directories from the recovered source.

## Limits

Supplied property inventory, prices and contact details are source content rather than a live data integration. Existing enquiry qualification and preview noindex policy are preserved. No outbound email or third-party lead delivery has been added or tested by this continuation.

## Publication verification, 2026-11-01

Recovered original design source and optimized assets preserved. Fresh npm install, production build, type checks, five enquiry API tests, and browser interaction checks passed on the authorized server. Private enquiry storage is configured on the Vercel project. Production HTTP and storage verification is recorded separately after deployment.

Two empty 1800w WebP derivatives recovered from their full original images; all 123 raster assets decoded successfully. Final browser QA passed after the asset fix.
