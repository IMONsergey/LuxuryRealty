# Luxury Realty motion and interaction verification

## Source and intent

This change preserves the existing Figma-derived composition, typography, photographs and page inventory. No Dprofile motion reference for Luxury Realty was found in the supplied profile. The changes address concrete lifecycle and interaction defects in the existing implementation rather than claim new reference fidelity.

## Final verification, 2026-11-01

The release owner confirmed the final authorized server runs below. This motion update is verified in the server checkout and is **not yet published** at this checkpoint.

| Evidence | Result |
| --- | --- |
| `20261101T124548-54c1d23d28` | Exit 0: all ten typecheck/build tasks across the five projects passed, including Luxury Realty. |
| `20261101T124919-e3044c77a5` | Exit 0: all five existing browser suites passed, including `scripts/browser-qa.mjs` for Luxury Realty. |
| Fresh Luxury hero screenshots | Visually reviewed and accepted by the release owner after the original-image restoration. |

The Luxury suite launches **Chromium only** against the local Astro server. It does not run WebKit, Firefox, a physical device, or the production deployment. Enquiry responses are intercepted; this run creates no real enquiry and does not reverify production storage.

The Figma hero original has now been restored at 4096 x 2734, with 480/800/1200/1800/2560 px WebP variants at quality 87. The server's applied asset map and provenance record describe the actual generated outputs. This supersedes the earlier 1024 px hero limitation. The staging copies of `src/data/assets.json` and `docs/hero-image-source.md` must not overwrite those server records.

## Corrected defects

- Header positioning no longer switches from absolute to fixed and restarts an entrance animation every time the 80px scroll threshold is crossed. Its original top spacing is preserved, with a compact state while scrolling.
- Desktop hero parallax has its own responsive and motion-preference context. Crossing the desktop breakpoint, changing pointer capability or enabling reduced motion removes the previous transform. Touch uses natural page flow.
- Gallery navigation keeps the displayed photograph until its replacement is decoded. A monotonically increasing request ID rejects late results after rapid navigation or dialog closure. A three-entry cache and one adjacent prefetch bound decoded media retention. The caption and counter commit with the actual image. Vertical gestures and pinch gestures do not trigger a swipe.
- Horizontal rail controls use actual card geometry and CSS snap alignment. They no longer assume a 30px gap on a 24px-gap mobile layout. Previous/next controls reflect the boundaries; keyboard Home/End and arrows follow the same positions.
- The catalogue disclosure is reopened when leaving the mobile breakpoint, so its desktop form cannot remain closed behind an invisible summary.
- Services have a short interruptible expansion. Rapid changes finish in one open panel; reduced motion switches immediately. Layout-dependent reveal positions refresh after the final geometry settles.
- Modal scroll locking also covers the root element; a stable scrollbar gutter prevents a horizontal jump on desktop. Large image hover zooms are limited to a fine pointer and respect reduced motion.
- Collage and advisor image sizes describe their actual displayed/cropped dimensions. The authored imagery is preserved; the hero now uses derivatives of the recovered original described above.

## Automated server verification

The completed checks use the existing server checkout and these repository commands:

```sh
npm run check
npm run build
npm run test:browser
```

The passing suite covers the following concrete behavior:

- Home at 1440/768/390/320 px: one h1, no horizontal overflow, font readiness, selected image load and sequential decode, and no uncaught page errors or missing asset/font HTTP responses.
- Catalogue search, empty/reset states, URL filters and sorting, reload, property return query and selected-card focus, plus mobile-to-desktop filter availability.
- Property gallery arrows and keyboard navigation, decoded image/counter agreement after rapid requests, and Escape focus return. The gallery interaction assertions run with reduced motion.
- Mocked enquiry validation, failed request/reopen, unchanged retry identity and start time, pending field/context protection, duplicate prevention, mismatched receipt rejection, edited-payload UUID renewal, server field errors, confirmed receipt and a clean subsequent enquiry.
- Development listing and all four development detail routes; selected property, insights/article, contacts and privacy templates; insights filtering, contact validation, the Six Senses project link/location, and a real 404 response. Representative catalogue/property/development/insights/contact templates are checked again at 390 px.
- A separate normal-motion flow at 1440 x 900 checks selection-rail Home/End boundaries and disabled controls, rapid service changes settling to one open panel, parallax cleanup on resize to 390 x 844, the anchored desktop header, and a live reduced-motion change.

Evidence is written to `artifacts/browser-qa.json`, `artifacts/dev-server.log` and screenshots including `home-1440.png`, `home-390.png`, `home-motion-1440.png`, `services-motion-1440.png` and `enquiry-confirmed.png`. Only the fresh hero screenshots are explicitly recorded as visually reviewed here; generating other screenshots is not a visual acceptance claim.

The test's eager image loading is an asset-integrity check, not a loading-performance measurement. Run performance profiling separately with normal lazy loading and a fresh browser context.

## Additional visual and device scenarios

The checklist below remains a manual acceptance guide. A passing existing suite does not establish every gesture, throttled-network condition or engine listed here.

1. At 1440x900, load the home page normally and observe the title, lettering and introductory copy. They settle into the original composition without delaying the search controls. Scroll repeatedly across the header threshold in both directions: no second header should enter or blink.
2. Scroll the entire page at an ordinary reading pace. Section headings and project cards must finish their entrance, with no cropped copy, blank areas or horizontal page overflow.
3. Advance both horizontal rails with buttons, keyboard and touch. Check the first and last positions and resize while a rail is at the end. Every item remains reachable.
4. Open and reverse a service while it is animating; open another before the first has settled. The geometry must not remain locked and only the requested panel may remain open.
5. On a property page, open the gallery, quickly advance several times, go back, close during loading and reopen. The photograph, caption and counter must always describe the same selection. Repeat with a cold image cache and a throttled connection. A vertical gesture or two-finger pinch must not switch photos.
6. With the gallery and enquiry open, test scroll containment and Escape/focus return. Repeat in WebKit/Safari and at 390x844.
7. Open the catalogue at 390px, then expand to 1440px without reloading. The filter form must be visible. Filter, open a property and return; URL, filters, selected card and scroll position must still restore.
8. Toggle reduced motion while the page is open. Hero transforms and ongoing service/gallery transitions must settle, while all controls remain usable.

## Verification boundary

Source inspection, QA-script syntax and diff checks were performed in the staging snapshot; final typecheck/build/Chromium results and hero visual review were supplied by the release owner as recorded above. WebKit/Safari, real touch/pinch and pointer cancellation, cold/throttled image failures, bfcache behavior, FPS/memory profiling and Core Web Vitals are outside the reported final run. The image audit forces eager loading, so its success is not evidence of loading performance. Commit/push, deployment and production verification of this motion update remain the release owner's next steps.
