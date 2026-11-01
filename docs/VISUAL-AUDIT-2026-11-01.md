# Luxury Realty: fresh visual and interaction audit

Audit work started on 2026-11-01 from base commit `97e8b25fd99362d648728f7952592339c132123c`. Report timestamps use UTC and retain the actual time of each run. This document covers the uncommitted visual-audit changes in the Luxury working copy; the release owner separately controls commit, publication and public-site verification.

## Scope and evidence

The audit uses fresh captures of the generated production output, actual route discovery, normal scrolling through every page, and interaction checks. It does not treat an earlier release's screenshots as evidence for the current changes. Raw evidence is under `artifacts/pixel-audit-20261101-v2/` (an ignored, local artifact directory). Six selected viewport captures, their provenance, a compact results record and the exact source manifest are retained under `docs/verification/design-2026-11-01/`.

The initial `before/chromium/` run captured all 23 route targets at 1440 and part of the 320 matrix. It was interrupted when shared cloud CPU/IO pressure was identified. One mobile screenshot timed out after fonts were ready. This partial run is retained as before evidence and is **not a passed suite**. Before editing the application, the hero, services, story, long property page, Insights and Contacts were visually inspected. A separate old-build reading-position reproduction was then completed in both engines.

The broad route matrix uses 1440×900 and 390×844 for every route; later scoped fixes have separate focused rechecks as recorded below. Additional representative templates and all home sections cover 320×740, 768×1024, 1024×768 and 1920×1080. Mobile contexts have touch enabled; these are browser emulations rather than physical devices. The initial partial 320 baseline used a taller viewport, so it is useful for observed wrapping and glyph defects, not an exact whole-image pixel diff.

`scripts/visual-audit.mjs` serves the generated `.vercel/output/static` files on local port 14312. It discovers `index.html` routes recursively and checks the authored 404 with a missing URL. Every production-output report includes the base Git HEAD, entry HTML SHA-256, hashes of the source files and the three restored SVG exports, a combined source fingerprint, browser version, viewport coverage, timestamps, screenshots, errors and mocked enquiry receipts. The HEAD is explicitly a **base** commit; it does not falsely identify the uncommitted edits as already committed.

## Confirmed problems and changes

| Finding | Fresh evidence | Change and verification |
| --- | --- | --- |
| Text arrows, chevrons, close and plus signs served as UI icons across shared controls and page templates. | Before screenshots, source inventory, DOM text/pseudo-element inspection. | Added decorative `Icon.astro` with a fixed 24-unit viewBox, `currentColor`, 1.5-unit round strokes, `aria-hidden="true"` and `focusable="false"`. Replaced glyphs without changing control names, links or handlers. Original Figma search SVGs remain original exports. |
| Desktop hero search was a fused strip with a gold button, unlike the authored four separated controls and white Search button. Title placement and tracking also differed. | Fresh Figma hero screenshot (`2:133`), title context `2:149`, search context `35:67`, and fresh local hero capture. No intentional override was found in the repository's design notes. | Restored 191 / 622 / 70 / 191 px controls, 12 px gaps, 70 px height, 12 px corners and the authored translucent surfaces at 1440. Restored title 100 px / .998 / −1 px tracking and authored top offsets, retaining the original fonts, lettering, photography and useful current search copy. |
| Contacts at 320 split the final `om` of the email onto a separate line. | `before/chromium/contacts-320.png`. | Added a soft break after `@` and kept the domain together. The email value, `mailto:` target and 25 px typography are unchanged. At 320, the domain is one line, 171 px wide and inside the viewport. |
| WebKit lost the reading position when reduced motion was enabled below the hero. | Old build: scroll 4721 → 0; Services top 160 → 4881, still displaced after 1.4 seconds. `before-position/webkit/report.json`. | Preserve a reading section around every GSAP media cleanup/refresh transaction. Trace showed that one preference change can trigger multiple transactions. Also skip the application's deferred `ScrollTrigger.refresh()` when there are no active triggers; that extra empty refresh otherwise reset WebKit after the first restores succeeded. |
| A desktop-to-mobile resize retained raw scroll but lost the visible section. | `after-position-v3/webkit/report.json`: Services top 160 → −876.203125 on 1440 → 390, while scroll remained 4721. | Cache the reading anchor before responsive reflow, coalesce updates on scroll, and ignore a clamped scroll update after viewport dimensions change. Restore the anchor after GSAP refresh, with a bound for a section that becomes shorter. No new motion effect or scroll animation is added. |
| Previous section text showed through the fixed header after scrolling. | Stable Chromium Services320 and WebKit Services1440 captures after settling, independently reviewed by the release owner. | The scrolled header now uses the existing solid `--bg` colour. The opening hero header retains its original transparent treatment. |
| The property advisor's unbroken price overflowed its content column at narrow widths. | At 320, the price text was 271 px wide in a 214 px column, extending to x=324. The first narrow fix exposed a boundary at 371/375: 271 px in 265/269 px columns. | The price uses 28 px only at widths up to 380; the 390, tablet and desktop sizes remain unchanged. Six widths (320/371/375/380/390/1440) are measured against the actual text range and available column, rather than relying on document overflow alone. |
| Close scrolled out of the enquiry dialog and navigation menu. | Native wheel and Chromium touch: enquiry Close reached y=−60 at 320×740 and −393 at 844×390; menu Close reached −299 / −391. Both failed the pointer hit test. | Sticky enquiry Close uses negative margins to retain the original opening flow and coordinates. The navigation top row remains visible on the existing dark surface. Native scrolling, hit tests, real pointer dismissal and lower menu control access are checked in both engines. |
| Narrow cover-cropped project and property images selected too few original pixels. | At 390, all five detail heroes selected 480w: required cover widths were approximately 1889 (AVA), 1350 (Six Senses), 1045 (Atlantis), 535 (ORLA), and 960 (property). AVA/Six project cards also selected 480w for cover widths around 1064/761. Fresh screenshots visibly showed softness. | Added `sizes` expressions based on each original image's aspect ratio and the existing CSS frame heights. Existing WebP derivatives, composition, `object-position`, colours and gradients are retained. Cards are checked in a fresh context so a previously loaded larger hero cannot mask an incorrect selection. |
| The footer clipped its last navigation column at 1024 and exceeded its intended gutter at 320. | Fresh `after-responsive/chromium/home-1024-site-footer.png`: the final link reached x=1037 while the content ended at x=969. `before-footer/chromium/report.json` also measured a 286 px mobile grid inside a 272 px container, expanded by the email's minimum width. Document-overflow checks alone missed the tablet defect because the footer clips overflow. | Start the existing two-column tablet footer layout at 1100. Permit the unchanged email to break after `@`, keep the domain together, and give the two narrow navigation columns enough width for whole words up to 360. Fonts, colours, labels, links and the 1440/1920 composition are unchanged. The added check measures the actual text ranges against the footer container at eleven widths. |

### Original search SVG provenance

The release owner downloaded the current source exports from the inspected Figma context into `audit-v2-reference/luxury-search/`. They were copied byte-for-byte under collision-free names; the existing `imgGroup1.svg` logo was not overwritten.

| Repository file | Source export | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `public/assets/hero-search.svg` | `imgGroup1.svg` | 824 | `4e57179f9827caf041664d0f9ea33f54aadb89ca200d4ab64dc22ecc3144a270` |
| `public/assets/hero-chevron.svg` | `imgFrame1.svg` | 272 | `9e69606e81834fbd21af59526f23f2db5664caada29c342be07b6f549201a299` |
| `public/assets/hero-filter.svg` | `imgVector.svg` | 2500 | `a0954203a38e9ac2c8c4cd9eeb5d6b8d895f3bbf3fabc168377fe3a1110d97be` |

At 1440, Chromium reserves a 15 px scrollbar gutter. The exact search geometry assertion adjusts the source's absolute x positions by half that gutter, while checking the authored widths, gaps, y=691, height, corners and white button directly. The initial targeted assertion did not account for the gutter and failed by 7.5 px; that was a diagnostic assertion error, not an application layout defect. Its raw `after-targeted/chromium/report.json` is retained, and is not represented as a passed run.

The final geometry check uses the body's actual layout width; in this Chromium configuration `documentElement.clientWidth` includes the reserved gutter. The 46-case `after-routes-final/chromium/report.json` explicitly references the original completed run and its SHA-256, reuses its 45 already-passed cases from the identical source/build, and recaptures the failed hero case. Interaction states were rerun. It does not disguise reused captures as another full fresh run.

The first menu Tab assertion also treated native browser-chrome focus as a page escape. A focus trace showed `document.hasFocus() === false` with the native modal still open; no background site control received focus. The corrected test requires focus to remain inside the modal whenever the document itself is focused, and records the browser-chrome boundary. No application focus behaviour was changed to satisfy the test.

## Actual routes

There are 22 normal HTML routes and one authored 404 target. The broad route captures use the stem below followed by `-1440.png` and `-390.png` in `after/chromium/`. The corrected hero capture is in `after-routes-final/chromium/`; that report records each image’s exact path and provenance.

| URL | Capture stem |
| --- | --- |
| `/` | `home` |
| `/contacts/` | `contacts` |
| `/developments/` | `developments` |
| `/developments/atlantis/` | `developments-atlantis` |
| `/developments/ava-at-palm/` | `developments-ava-at-palm` |
| `/developments/orla/` | `developments-orla` |
| `/developments/six-senses/` | `developments-six-senses` |
| `/insights/` | `insights` |
| `/insights/a-home-by-the-water/` | `insights-a-home-by-the-water` |
| `/insights/architecture-on-palm-jumeirah/` | `insights-architecture-on-palm-jumeirah` |
| `/insights/spaces-worth-living-in/` | `insights-spaces-worth-living-in` |
| `/insights/the-art-of-a-private-viewing/` | `insights-the-art-of-a-private-viewing` |
| `/privacy/` | `privacy` |
| `/properties/` | `properties` |
| `/properties/dubai-hills-courtyard/` | `properties-dubai-hills-courtyard` |
| `/properties/dubai-hills-garden/` | `properties-dubai-hills-garden` |
| `/properties/dubai-hills-panorama/` | `properties-dubai-hills-panorama` |
| `/properties/dubai-hills-residence/` | `properties-dubai-hills-residence` |
| `/properties/dubai-hills-retreat/` | `properties-dubai-hills-retreat` |
| `/properties/dubai-hills-skyline/` | `properties-dubai-hills-skyline` |
| `/properties/dubai-hills-terrace/` | `properties-dubai-hills-terrace` |
| `/properties/dubai-hills-waterfront/` | `properties-dubai-hills-waterfront` |
| `/missing-page-for-visual-audit/` (404) | `missing-page-for-visual-audit` |

Home section captures use `home-WIDTH-SECTION.png`: `home-hero`, `selections`, `home-developments`, `home-services`, `home-story`, `consultation`, `home-insights` and `site-footer`. Pages are scrolled through before capture so real lazy loading and entrance effects run. Animations are not disabled for the normal-motion route screenshots.

## Interaction and motion coverage

The visual suite records keyboard-opened menu, focus containment and Escape return; menu-to-enquiry handoff; empty/validation/success form states; filters open, empty and reset; query-preserving property return with card focus; property gallery and keyboard navigation; Insights category filtering; contact validation; interrupted service changes; desktop/mobile parallax cleanup; live reduced motion; and motion restoration. All enquiry requests are intercepted with synthetic responses. No real enquiry is written or sent.

The existing `scripts/browser-qa.mjs` remains a separate required gate. It additionally exercises failed network requests, 503 storage responses, mismatched receipts, field errors, retry/idempotency, changed payload identity, pending submissions, rapid gallery requests, real rail boundaries and image decoding. Its runtime changes support an explicit local `BASE_URL` or `QA_PORT=14313`, and clean up the foreground Astro process on completion or interruption; no existing assertions were weakened.

The additional boundary check uses native wheel input at 320×740 and 844×390, plus native Chromium touch gestures sent through the browser's input protocol. It measures Close with `elementFromPoint` and then clicks the measured centre; it does not let a locator silently scroll an offscreen Close back into view. The enquiry test separately verifies its original 18 px top/right insets. An intermediate sticky implementation kept Close visible but moved it down by the dialog's 56 px padding; the final inset corrects that, and the opening-coordinate assertion now guards it.

Playwright does not support `mouse.wheel` in mobile WebKit. The WebKit native-wheel boundary checks therefore use `isMobile=false` at the same compact CSS viewports. The separate WebKit state suite still uses mobile emulation at 390. Neither is described as physical iPhone touch testing; native touch gesture coverage in this audit is Chromium-only.

Luxury provides property/story photo galleries. It does not contain a standalone floor-plan viewer: the brochure/available-plan flow is an enquiry. The audit checks that existing flow and does not claim a nonexistent plan interaction was tested.

### Reading continuity: measured outcome

`after-continuity/{chromium,webkit}/report.json` contains the exact before/early/settled values. The tolerance is 3 CSS px; these are layout-position checks, not FPS measurements.

| Engine | Reduced motion on / off | 1440 → 390 → 1440 Services top | Menu open/close |
| --- | --- | --- | --- |
| Chromium 145.0.7632.6 | scroll 4722 and top 160.484375 unchanged in both directions | 160.484375 → 160.375 → 160.484375 | unchanged |
| WebKit 26 | scroll 4721 and top 160 unchanged in both directions | 160 → 160.796875 → 161 | unchanged |

The CSS pixel scroll values intentionally change across responsive reflow: preserving the section's visible position requires scrolling to its new document location. The earlier tests that only inspected trigger cleanup or transform removal would not have detected the loss of reading context.

## Verification results

The local application is frozen at source fingerprint `890d5fd0fd095a8506ee150e87ebf146ead5fab5766e2fd42a76ab22b062453c`. This is a content fingerprint of the source snapshot, **not a Git commit**. The [source manifest](verification/design-2026-11-01/luxury-source-manifest.json) records the 21 changed application files, all source hashes, unchanged dependency manifests, diagnostic scripts and generated entry HTML. The [compact results](verification/design-2026-11-01/luxury-visual-summary.json) retain actual route results, report hashes, source versions, image selections, boundary measurements and final suite outcomes.

| Gate / evidence | Actual result | Source stage |
| --- | --- | --- |
| Final `npm run check` | PASS: 36 files, 0 errors, 0 warnings; one pre-existing unused-import hint in the test file | frozen `890d5fd0` |
| Final `npm run build` | PASS: generated production output | frozen `890d5fd0` |
| Final `npm test` | PASS: one test file, zero failures | frozen `890d5fd0` |
| Both diagnostic scripts’ syntax; `git diff --check`; source glyph/entity scan | PASS; zero source arrow/chevron/close glyph or named-entity hits | frozen source / final diagnostics |
| `after-routes-final/chromium/report.json` | PASS: 46 route/viewport cases, two state flows, five reading transitions; zero DOM text/pseudo arrow findings and broken images; zero page/asset errors. Forty-five passed captures are explicitly reused from the identical build, as explained above. | `f9044155`, before the late scoped fixes |
| `after-responsive/chromium/report.json` | 24 captures at 320/768/1024/1920. Twenty-three automated cases passed; the property320 overflow failed and was fixed. Manual review also exposed the clipped tablet footer. **This report remains failed**, not retroactively green. | `f9044155` |
| `after-property-final/chromium/report.json` | PASS: affected property template at 320/390/1440 after the first price fix | `29032f33`; later 371/375 boundary covered below |
| `after-boundaries-final/{chromium,webkit}/report.json` | PASS: 20 Chromium and 16 WebKit entries, including six price widths per engine, wheel/Close hit tests, real pointer dismissal and lower-menu access. Chromium also includes four native touch-scroll cases. | `3c14d3f9`, after the final 380 px price and persistent-Close fixes |
| `after-media-final/chromium/report.json` | PASS: five detail heroes and four independently loaded development cards use sufficient available source pixels at 390/DPR1 | `6c45cab1`, after cover-source hints |
| `after-footer-final/{chromium,webkit}/report.json` | PASS: all eleven widths per engine — 320/390/768/1000/1001/1024/1100/1101/1200/1440/1920 — keep all 13 tested footer labels within the content width | frozen `890d5fd0` |
| `after-states-final/webkit/report.json` | PASS: desktop/mobile flows, 26 fresh state images, two mocked enquiries and five reading transitions. No background page focus escape, page error, asset error or failed assertion. Finished 15:35:58 UTC. | frozen `890d5fd0` |
| `existing-frozen/browser-qa.json` | PASS: all 12 existing functional checks, five mocked requests, zero page/asset errors. Finished 15:36:56 UTC; source hashes verified before and after. | frozen `890d5fd0` |

The broad 46-case route run was **not repeated after the late price, Close, image-selection and footer corrections**. Those changes were tested against the affected templates and geometry, followed by the final required Chromium suite and final WebKit states/reading checks. The release owner performs the separate all-route public verification against the eventual published commit. No local result implies publication.

At 390/DPR1, the final selected hero widths are AVA **2400**, ORLA **800**, Six Senses **1800**, Atlantis **1024**, and property **1200** pixels. The previously selected 480 px files remain available for appropriately smaller slots. The four development cards select 1200 / 480 / 800 / 800 px respectively. These are decoded selected-source dimensions, not nominal `<img>.naturalWidth` values adjusted by `srcset` density. Atlantis reaches its available original limit; it is not reported as an unlimited-resolution result.

### Visual review and durable captures

Fresh before/after hero, services, Contacts320, native-scrolled dialogs, AVA cover/detail, footer320/1024, final WebKit menu/filter/gallery/validation states, representative full page templates and the top overview of every route were visually viewed. All eight home section captures at 1440/390 and representative 768/1024/1920 section sheets were reviewed; narrow home/Contacts/service states were also reviewed at 320. This describes the actual manual review, rather than claiming a pixel-by-pixel comparison of every full page.

| Selected capture | What it shows |
| --- | --- |
| [Hero1440](verification/design-2026-11-01/luxury-hero-1440.jpg) | Authored title/search treatment and original image |
| [Services and header390](verification/design-2026-11-01/luxury-services-header-390.png) | SVG optical alignment, expanded service and clean fixed header |
| [Contacts320](verification/design-2026-11-01/luxury-contacts-320.png) | Readable email with the domain kept together |
| [Enquiry after touch scroll320](verification/design-2026-11-01/luxury-enquiry-scroll-320.png) | Close remains reachable at its original visible position |
| [AVA detail hero390](verification/design-2026-11-01/luxury-ava-hero-390.jpg) | Higher-detail selection of the same supplied photo |
| [Footer1024](verification/design-2026-11-01/luxury-footer-1024.png) | Fully visible navigation in the existing tablet arrangement |

The [capture manifest](verification/design-2026-11-01/luxury-selected-captures.json) records dimensions, file hashes, source PNG hashes, raw report hashes and the source fingerprint of each image. JPEG captures retain original pixel dimensions at quality90; PNGs are unchanged. These selected captures come from named stages of this fresh audit. Earlier selected regions were unaffected by later scoped corrections; they are not described as six fresh captures of the final build.


## Reproduction

Use Node 24 and the locked application dependencies. Set `PLAYWRIGHT_PACKAGE` to a Playwright 1.58.2 `package.json`, and `PLAYWRIGHT_BROWSERS_PATH` to its installed browser cache. Browser processes require a runtime that permits launching the browser and binding the local port.

```sh
npm run check
npm run build
npm test
QA_PORT=14313 QA_OUTPUT_DIR=artifacts/pixel-audit-20261101-v2/existing npm run test:browser
AUDIT_STAGE=after AUDIT_WIDTHS=1440,390 AUDIT_RESIZE_READING=1 node scripts/visual-audit.mjs
AUDIT_STAGE=after AUDIT_ENGINE=webkit AUDIT_RESIZE_READING=1 node scripts/visual-audit.mjs
```

Run one engine at a time. `AUDIT_WIDTHS` and `AUDIT_ROUTES` select the additional responsive template matrix, and `AUDIT_STATES=0` skips redundant interaction runs. `AUDIT_ONLY=reading-position` runs the focused continuity check. `AUDIT_ONLY=boundaries` checks native modal scrolling and price bounds; `AUDIT_ONLY=hero-media` verifies selected cover-image detail; `AUDIT_ONLY=footer` checks actual footer text ranges. `AUDIT_ONLY=states` runs the state flows without the broad route matrix. Optional `AUDIT_TRACE_MEDIA=1` records query reads and actual scroll calls for diagnosis; it was used to distinguish the media lifecycle from the application's extra deferred refresh.

## Limits

This is a fresh local production-output and browser-emulation audit, not a claim of pixel-perfect equality or physical-device certification. It preserves authored visual choices and compares the confirmed hero/search geometry with the supplied original reference; raster antialiasing and browser font metrics can differ. The fixed 905 px authored hero can extend below a 900 px test viewport.

The WebKit build is a Linux Playwright engine, not a physical iPhone or shipping Safari installation. The audit does not measure sustained real-device FPS, GPU/memory pressure, mobile thermal behaviour or Core Web Vitals. Static screenshots prove settled appearance; interaction assertions verify the recorded state and continuity transitions. They cannot prove that every animation frame will meet a device-specific timing budget.

Correct cover-image selection can load more image bytes on narrow screens than the incorrect 480w selection. This is deliberate preservation of the supplied image detail, not a new loading-performance claim. Source resolution remains a real limit: the supplied Atlantis exterior is capped at 1024 px, below some rendered/DPR requirements. The historical loading comparison in the earlier release does not measure this new visual-audit patch.

Mocked form outcomes prove the front-end states and request identity handling, not live storage delivery. Public aliases, deployment provenance and external project destinations are verified separately by the release owner. Original photographs, asset mappings, enquiry backend, dependencies, author colours and fonts remain outside the application changes described here.
