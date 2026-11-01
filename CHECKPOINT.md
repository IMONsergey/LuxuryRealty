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

## Recovery preparation checks (historical)

- All 48 source asset-map entries and their srcset derivatives exist.
- Ten WOFF2 files are present.
- `node --check` passed for the QA script and Astro configuration.
- These were the source-recovery checks before server execution. Subsequent publication verification and the current final motion verification are recorded below.

## Recovery handoff (completed)

The recovery handoff called for `npm ci`, `npm run build`, `npm run check`, `npm test`, and `npm run test:browser` on the server; its completed results are recorded under Publication verification. QA starts/stops its own development process and writes `artifacts/browser-qa.json`.

The recovery's shared backend, private Blob configuration and real deployed receipt checks were handled by root as recorded in the historical release entries below. Keep source assets and fonts intact. Do not publish old generated `dist` or `.vercel` directories from the recovered source. The current motion update has its own unpublished status at the end of this file.

## Limits

Supplied property inventory, prices and contact details are source content rather than a live data integration. Existing enquiry qualification and preview noindex policy are preserved. No outbound email or third-party lead delivery has been added or tested by this continuation.

## Publication verification, 2026-11-01

Recovered original design source and optimized assets preserved. Fresh npm install, production build, type checks, five enquiry API tests, and browser interaction checks passed on the authorized server. Private enquiry storage is configured on the Vercel project. Production HTTP and storage verification is recorded separately after deployment.

Two empty 1800w WebP derivatives recovered from their full original images; all 123 raster assets decoded successfully. Final browser QA passed after the asset fix.

## Completed live verification, 2026-11-01 14:28 +03:00

This entry records the earlier recovery release, not the later motion update.

All five production sites are READY and were checked on their assigned public origins. The final 14-page/viewport Chromium run passed, including every selected image decode, declared font, canonical rule, cross-project link, console/page error check and overflow check. All five real enquiry endpoints passed 201 creation, 200 unchanged retry, 409 conflicting reuse, 422 missing consent and 403 cross-origin rejection.

The previous ORLA/Six Senses image failures were caused by concurrent decode calls in the release checker: all unchanged images passed sequential decoding. The corrected checker is preserved in scripts/production-qa.mjs; all validation requirements remain. No site artwork was replaced.

See docs/RELEASE-2026-11-01.md and docs/verification/production-2026-11-01.json for exact source commits, evidence and content limits. Next work requires the actual missing films/PDF documents, verified commercial/contact details, and a chosen recipient/integration if enquiry forwarding is wanted. Existing submissions are stored privately; no email or CRM delivery is claimed.

## Motion and interaction polish, verified on server

Current authorized task: improve design, motion, interaction logic and performance across the five existing sites, using the supplied Dprofile cases where available. This checkout owns Luxury Realty only. The source snapshot baseline is server commit `1b9ff3136de5b010410fc8f6f81102540cdcd990`.

Implemented stable header positioning, independent responsive hero parallax lifecycle, coherent title/lettering/intro entrance, decoded latest-request gallery navigation with bounded image retention, actual-geometry rail navigation and edge states, mobile-to-desktop filter restoration, interruptible service expansions and root modal scroll containment. Original content, route inventory and enquiry storage/UUID logic are preserved. Image sizes now match the collage/advisor slots. Large hover zooms are restricted to fine pointers and reduced-motion preferences are respected.

Extended the existing browser suite for the corrected user-visible regressions; image integrity decoding is now sequential to avoid artificial concurrent decode pressure. `node --check scripts/browser-qa.mjs` passed locally. Final server typecheck/build and the existing Chromium suite subsequently passed as recorded below. These checks do not establish runtime performance metrics. See `docs/MOTION-QA.md` for actual automated coverage and the remaining verification boundary.

The server application and type/build/browser checks are complete. Root has visually accepted the fresh hero screenshots. WebKit and performance profiling are not claimed by the completed Chromium run. Commit/push and production verification remain root-owned. The former 1024px hero limitation is superseded by the original-image restoration below.

## Hero original restoration completed, 2026-11-01

Read-only Figma inspection confirmed hero layer `2:134` on page `2:2`, equivalent layer `2:2341`, file `m3N3lJCoutaziEm4nt4CwO`, image hash `f8e0e62f4a1e1bad58cccdd5ca7651a8db5b7c6a`. Its original image is 4096x2734. Root downloaded the official raw JPEG to `/tmp/realestate-motion/luxury-hero-raw.jpeg` and reported the same dimensions with a byte size of 14,600,081. Temporary Figma URLs are not stored in the repository.

Added `scripts/restore-hero.py` and `docs/hero-image-source.md`. Default mode prepares five WebP variants (480/800/1200/1800/2560, quality87, method6, no upscaling) and an analysis contact sheet under `artifacts/hero-source-review/`. It does not alter the live asset map. After root reviews the old/new thumbnails and matched detail crops, `--apply` verifies the source/variant hashes, installs uniquely named assets without overwriting or deleting the old files, changes only `imgRectangle6`, and records actual source/output metadata in the provenance document.

The script performs color-profile conversion to sRGB where needed, but does not invent an exposure, brightness, contrast or saturation correction. The observed Figma exposure value is documented for comparison only. The existing CSS gradients remain unchanged.

Local preparation validation consisted of `python3 scripts/restore-hero.py --help` and `git diff --check`. Root subsequently restored the 4096x2734 original, applied the 480/800/1200/1800/2560 WebP variants at quality 87, and updated `src/data/assets.json` and `docs/hero-image-source.md` on the server. Fresh hero screenshots were visually reviewed and accepted. The staging versions of those two records are stale and were deliberately not overwritten during the final documentation handoff.

## Final motion verification and publication status, 2026-11-01

The release owner reported final authorized server job `20261101T124548-54c1d23d28` with exit 0: all ten typecheck/build tasks across the five repositories passed, including Luxury Realty. Browser job `20261101T124919-e3044c77a5` also exited 0 with all five existing suites passing, including Luxury's `scripts/browser-qa.mjs`.

Luxury's suite is Chromium-only. It covers four home widths, catalogue/filter/return state, the decoded rapid-navigation gallery, representative routes, mocked enquiry state/identity handling, rail endpoints, service changes, desktop/mobile parallax cleanup and live reduced motion. Exact scope and generated evidence paths are in `docs/MOTION-QA.md`. All fresh Luxury hero screenshots supplied for the final review were visually accepted by root.

**Current status: verified on the server, not yet published.** Root owns the final commit/push, deployment and post-deployment verification. The earlier successful live/API verification above belongs to the prior release; the final motion browser run used mocked enquiries and did not repeat live storage checks. No fresh WebKit/Safari, physical-touch, FPS/memory or Core Web Vitals result is claimed.

For this final documentation handoff, transfer only `CHECKPOINT.md` and `docs/MOTION-QA.md`. Preserve the server's applied hero assets, `src/data/assets.json` and `docs/hero-image-source.md`.
