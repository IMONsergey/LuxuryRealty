# Luxury Realty: interaction audit V3, 2026-11-01

## Status and provenance

The local candidate fixes the defects below and passes **22 focused scenarios in Chromium and 22 in WebKit**, plus **12 groups in the existing Chromium browser suite**. This is a local acceptance of the listed journeys, not a claim that the published site has changed or that every possible device and interaction has been certified. No commit, push, deployment or real enquiry was made by this audit agent.

Baseline: `9bd07c705159946caea7a3a25549401cd76809b5`, published at <https://luxury-realty-imon.vercel.app>. Fresh before evidence was collected on 2026-11-01 at 19:08-19:16 UTC. The corrected production build was served locally from `dist/client`; final focused runs finished at 19:17:30 UTC and 19:18:40 UTC. The broad suite finished at 19:19:38 UTC. The single preview process and all owned browser contexts were stopped afterwards.

The previous V2 PASS report remains unchanged. It is historical context, not the evidence for this acceptance.

## Confirmed defects and changes

| Journey | Fresh baseline result | Corrected behavior |
|---|---|---|
| Home: Rent + Dubai Hills, then advanced filters | Purpose and query disappeared; destination was Buy with an empty search. Root independently reproduced this live. | Advanced filters carries both criteria and the filters anchor. |
| Bedrooms 1 versus 6+ | Bedroom 1 returned all eight six-bedroom villas. Root independently reproduced this live. | Values 1-5 are exact matches; 6+ remains a lower bound. |
| Price bounds | Maximum 0 meant unlimited. Whole-AED budgets such as 123456 were rejected by `step=100000`. | Zero stays zero; arbitrary whole-AED budgets are accepted. |
| Invalid price draft / first Apply | An invalid draft replaced the URL and results. On the first pointer click, blur inserted an error and moved Apply 46 px between pointerdown and pointerup; no submit occurred. | Invalid drafts retain the last valid URL/results. The error appears while typing, is associated with Maximum price, and the first Apply focuses that field. An invalid shared URL has an explicit invalid-range state. |
| Catalogue card and return | An unrelated detail inherited a stale filtered URL. Also, the purpose handler matched property cards, so a card click saved its ID and then erased it through a second filter update. | Only the Buy/Rent buttons change purpose. Return context is scoped to the property ID; the second clicked card restores its original filters and focus. |
| Eight property detail routes | Every route reused the same four-photo room gallery and six hardcoded amenities. Waterfront should have Pool, Terrace and Water view, but showed Garden, Pool, Terrace, Open kitchen, Natural light and Private outdoor space. | Media, feature labels and location text derive from the selected record. Every media trigger opens the same record collection at its own index. |
| Enquiry reopen | Opening a different CTA after scrolling the dialog reopened it at scrollTop 257, hiding the new context. | New opens start at scrollTop 0, retain entered fields and show the new enquiry context. Pending context protection remains intact. |
| Second inline enquiry | After mocked success, editable fields returned but Send enquiry stayed disabled. | The first new edit starts a fresh enquiry with a new UUID. Two successive mocked enquiries complete successfully. |
| Rent navigation | The menu marked Buy current on the Rent catalogue. | The current menu item follows the active purpose, including the prerendered page's client query state. |
| Mobile wordmark | At 320/390 px, the visible 103.89 px wordmark sat 17.05 px left of its 138 px centered link. | The existing SVG fills its link with its aspect ratio retained; measured center offset is 0 in both engines. |

Menu scroll reset already passed the baseline. It remains a regression check and is **not** counted as a newly fixed defect.

## Media and content decisions

No new photographs, prices, plans or property claims were invented. The original first-residence four-photo set remains assigned to that residence. Existing catalogue and Home selection images are now explicit record assignments; the Home image order and artwork stay unchanged. Gallery sizes are 6 for Residence, 2 each for Waterfront/Skyline/Garden/Courtyard, and 1 each for Panorama/Terrace/Retreat. One-photo collections hide previous/next controls. The wide terrace trigger renders only where that existing terrace image belongs to the record.

All eight supplied records still have the same price, six bedrooms, 21,000 sq.ft. and Dubai Hills Estate location. No rental records exist. Skyline and Courtyard already share a catalogue photograph. These are limits of the supplied collection, not an independently verified live inventory.

The four Luxury brand assets inspected are vector SVGs with no embedded raster image or background rectangle. Their files are unchanged. The source scan found no text arrow characters in the application UI; arrow controls use SVG icons. Luxury currently contains no video player or promised film-play control, so no Luxury video playback result is claimed.

## Exact verification coverage

- Focused scenarios: hero criteria; exact bedrooms; zero price; whole-AED budgets; first Apply on invalid range; last valid draft state; invalid shared URL and recovery; own-card return and focus; stale return isolation; Rent navigation; two successive inline enquiries; enquiry reopen context/draft/scroll; menu reopen; wordmark geometry at 320/390/1440; and eight record-specific property scenarios. The detail scenarios exercise **15 actual media triggers per engine**, their matching collection/index/counter, decoded displayed image, record amenities and one-photo control visibility.
- Broad suite: Home at 1440/768/390/320; font/image decoding and overflow; mobile menu/Escape/focus; mobile-to-desktop filters; search/empty/reset/filter/sort/reload/return; gallery keyboard and rapid navigation; enquiry validation, aborted network, held 503, duplicate submit, protected pending fields/context, mismatched receipt, changed payload UUID, 422 field error, retry and matching success; development index plus all four development details; insights category and one article template; Contacts/Privacy/404; five narrow templates; rail endpoints; rapid service accordion changes; fixed header; resize and live reduced-motion change.
- Source contract review also covered Home CTAs, logo links, footer, development links, article contents/share, phone/map links and gallery swipe handlers. These source reads are not represented as additional runtime clicks.

All enquiry attempts were intercepted. Focused runs made two synthetic POST attempts each; the broad run made five synthetic error/retry/success attempts. Unexpected writes, page errors and failed assets were zero in the accepted runs. The browser contexts ran sequentially, with at most one context and one local preview at a time.

`npm run check` completed with 0 errors, 0 warnings and one pre-existing unused-import hint. `npm run build` and `git diff --check` passed. The production enquiry backend and actual delivery were not exercised by this frontend audit.

The consolidated baseline contains 22 unique scenarios: 21 failed and one passed. This is **not 21 independent defects**: eight failures share the detail-template cause. It combines three fresh runs. An initial gallery assertion read image completion too early; those eight cases were rerun with a decoded-frame wait. The return-ID and first-Apply checks were strengthened and rerun. The compact baseline states that provenance explicitly.

## Reviewable evidence

- [Fresh consolidated baseline](verification/interaction-v3/baseline-chromium.json), [final Chromium](verification/interaction-v3/after-chromium.json), [final WebKit](verification/interaction-v3/after-webkit.json), [broad Chromium](verification/interaction-v3/broad-chromium.json).
- [Root's independently confirmed live context](verification/interaction-v3/root-confirmed.json), [flow/finding inventory](verification/interaction-v3/inventory.json), [source/build hashes and command outcomes](verification/interaction-v3/manifest.json), [selected image provenance and hashes](verification/interaction-v3/selected-evidence.json).
- Search: [root input](verification/interaction-v3/root-before-hero-search.jpg), [root lost criteria](verification/interaction-v3/root-before-search-lost.jpg), [corrected criteria](verification/interaction-v3/after-hero-criteria.jpg).
- Bedrooms: [before](verification/interaction-v3/before-bedrooms-one.jpg), [after](verification/interaction-v3/after-bedrooms-one.jpg). Wordmark: [before](verification/interaction-v3/before-wordmark.jpg), [after](verification/interaction-v3/after-wordmark.jpg).
- Dialog reopen: [before](verification/interaction-v3/before-dialog-reopen.jpg), [after](verification/interaction-v3/after-dialog-reopen.jpg). First Apply: [corrected](verification/interaction-v3/after-invalid-first-apply.jpg).
- Waterfront gallery: [before](verification/interaction-v3/before-waterfront-gallery.jpg), [after](verification/interaction-v3/after-waterfront-gallery.jpg). Features: [before](verification/interaction-v3/before-waterfront-features.jpg), [after](verification/interaction-v3/after-waterfront-features.jpg). [Single-photo gallery](verification/interaction-v3/after-single-photo-gallery.jpg).

Screenshots use normal motion. Narrow CSS viewport tests are not physical iOS testing. Native share sheets, actual phone/map launches, physical touch behavior, network delivery and continuous frame-rate measurements remain outside this acceptance. No claim of pixel perfection on every device is made.

## Changed files

Application: `src/scripts/site.ts`, `src/components/Header.astro`, `src/components/Icon.astro`, `src/data/site.ts`, `src/pages/index.astro`, `src/pages/properties/index.astro`, `src/pages/properties/[slug].astro`, `src/styles/global.css`, `src/styles/pages.css`.

Verification: new `scripts/logic-regression-qa.mjs`; updated `scripts/browser-qa.mjs` and `scripts/visual-audit.mjs` to derive gallery totals from real records. The broad suite also blocks unexpected writes and closes its first context before the motion context. This report and `docs/verification/interaction-v3/` contain the durable evidence. Historical acceptance reports and source media files were not altered.
