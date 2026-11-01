# Five-site interaction correction, 2026-11-01, V3

## Release status

All five application corrections are published to their existing GitHub main branches and production aliases. Each deployment was checked for READY state, the exact application commit, the assigned primary alias and absence of an alias error. Root then repeated the critical journeys on the public sites. The earlier V2 visual acceptance is historical and does not certify the interaction defects reported in this pass.

The scope is Luxury Realty, Atlantis, ORLA, Six Senses and AVA. The work combines independent reproduction on the published sites, source review, controlled failure tests, desktop and narrow viewport checks, and a second production check after publication. No real enquiry, email or other message is sent by the verification suites.

## Changes by project

### Luxury Realty

- Advanced filters preserves the Home search purpose and query, including Rent plus Dubai Hills.
- Bedrooms 1 through 5 are exact filters; 6+ remains a minimum. Maximum price 0 stays zero, and whole-AED values no longer fail an unrelated large step restriction.
- Invalid price drafts preserve the last valid results and URL. The error appears during editing so that Apply does not move between pointer down and up. An invalid shared URL also has an explicit recovery state.
- Catalogue return state belongs to the selected property. The purpose click handler only handles the Buy/Rent controls and no longer erases a card's stored identity through event bubbling.
- Each of the eight property routes uses the media and amenities assigned to its own record. One-photo records do not show navigation controls. Gallery totals and the selected image match the available collection.
- Reopened enquiries start at the top, retain the user's draft and show the correct context. A second inline enquiry can start after a successful first enquiry, with a fresh submission ID.
- Rent navigation marks the correct current section. The original mobile SVG wordmark is centered without modifying the brand artwork.

### Atlantis

- Back/Forward and page restoration restore the URL's bedroom, area and preview state. Restoring a view does not rewrite history.
- View floor plan reaches the actual floor-plan section. The catalogue filter query and this destination anchor are both retained.
- Fields are frozen while a submission is pending. Error focus moves to the invalid field after controls are re-enabled, including a server-side field error.
- Failed gallery images have an explicit status and retry. The last valid frame remains visible, counters stay truthful and a late image response cannot override the latest navigation intent.
- The small emblem uses the source design's exact rectangle geometry.
- Hover colors for Close and menu controls retain contrast on light dialog backgrounds; the decorative gold is unchanged.

### ORLA

- The supplied Residence 401 plan is no longer presented as the plan for a Mansion, Sky Palace or another collection without a verified mapping. It remains available from the general residence collection.
- Browser history follows nested dialogs, collection selection and the selected residence. Closing a directly opened detail stays on the site. Closing a child preserves its parent's scroll position and focus.
- Pending enquiries can be reopened with their original context, frozen fields and visible status. Reopened dialogs begin at the top; field errors are focused after the pending state ends.
- An enquiry success requires the server receipt to match the submitted ID. A nonempty unrelated receipt is not accepted as confirmation.
- Watch starts the supplied preview in the initiating click. Runtime checks confirm playback, retry, stopping on close and stopping when another dialog covers it. The hidden-document pause handler is source-reviewed; a separate background-tab runtime check is not claimed.
- The presentation CTA has a readable label. The poster is an uncropped frame from the supplied preview, preserving the original credits and artwork.
- Partner and footer wordmarks are restored from supplied artwork and source geometry, with transparent assets where they overlay photography.
- Feature details cannot retain a previous feature's photograph under a new heading after a failed request. Loading, failure and retry correspond to the latest selected feature.
- Small actions on cream backgrounds retain a readable foreground: the final Express interest and plan pairs measure 5.03:1, and Retry photograph measures 18.01:1. Decorative bronze and the existing gold actions on dark backgrounds are preserved.

### Six Senses

- The interactive state follows the actually rendered animation progress. Visible residence cards cannot be left inert because a scroll trigger and its scrubbed animation disagree.
- Layouts, Location and Interiors navigation and initial fragments select the corresponding functional view. Reload and history restoration are checked separately because browser-native fragment positioning can occur after application setup.
- Nested residence, plan, enquiry and legal dialogs follow browser history and retain their parent context, scroll and focus. Tabs replace the current layer without creating an unrelated stack.
- Fast close/reopen cannot invalidate the new plan request through a queued native close event. Native fragment entries are registered before another dialog is opened.
- Enquiry success requires an exact matching receipt ID.

### AVA

- Clicking the floor-plan image opens the same viewer as View floor plan. The original-file link remains a fallback when JavaScript is unavailable.
- Plan loading is explicit. Zoom, Fit and download remain disabled until the selected plan is decoded. Failed requests offer retry, and a late result cannot replace a newer selection or reopen a closed viewer.
- A configured film starts on the explicit Watch action. Source failures reach the visible error state; retry attempts playback from the user's click. Close stays outside the inner scroller so it remains reachable in landscape orientation.
- The actual no-film production branch retains its contextual film-request flow. A configured-player fixture is tested separately and is not presented as an available production film.
- Server field errors focus the invalid field after pending controls are unlocked. Gallery failures expose a visible retry without falsely advancing the counter.
- Partner cards use the supplied graphic marks. The AVA/Dorchester footer lockup retains the source proportions on desktop, tablet and mobile widths.

## Verification boundaries

The final project reports contain fresh before/after evidence and exact test coverage. Final ready-state branding and gallery frames are checked after decoding and stabilization. Intentional loading, error and transition frames are identified separately. An early frame taken before a lazy logo appeared is not used as final proof. A loading screenshot is not used as evidence of a ready gallery.

| Project | Fresh accepted browser coverage | Additional verification |
|---|---|---|
| Luxury | 22 focused scenarios in Chromium and 22 in WebKit | 12 existing broad-suite groups in Chromium; record-specific media triggers on all eight property routes |
| Atlantis | 6 focused scenarios in each of Chromium and WebKit, with reduced motion | 7 additional visual/contrast/motion probes; separate final hover contrast check |
| AVA | 13 focused scenarios in each of Chromium and WebKit, with reduced motion | 8 additional visual/motion probes; configured-film fixture and separate real no-film production build in both engines |
| ORLA | 29 behavioral groups total: 9 Chromium desktop, 10 Chromium touch, 10 WebKit touch | 6 motion groups total, 3 per engine; 4 final feature/logo groups in Chromium; 6 final computed color pairs |
| Six Senses | 15 focused scenarios in each engine, including initial fragments, reload and nested history | 15 motion groups in each engine, covering scene transitions, direct navigation, focus and pinned/natural/reduced-motion modes |

Atlantis and AVA share one harness: its 19 scenarios per engine are 6 for Atlantis plus 13 for AVA. They are not 19 scenarios for each site. Pass counts describe journeys/check groups, not a count of independent defects.

Atlantis/AVA additional normal-motion gallery transitions and live preference switching were checked in Chromium. They are not a replay of every animation in both engines. ORLA's focused motion pass does not claim a new complete replay of the unchanged gallery animation. The late Atlantis and ORLA color-only adjustments received targeted final checks, rather than another full behavioral run. All five final application candidates passed their project type check and production build.

Tests use controlled endpoint and media responses to exercise loading, failure, retry, pending fields, duplicate submissions and receipt matching. Live production visits do not submit forms. Desktop and narrow CSS viewports, including Chromium and WebKit, are browser coverage; they are not certification of every physical phone, browser version or network condition. No continuous frame-rate benchmark or universal pixel-perfect claim is made.

Six Senses' diagnostic cloud WebKit RAF p95 was 55 ms. A motion contract passing does not establish a stable 60 fps rate on physical devices. The long-session production capture anomaly described below also remains a specific limitation of this acceptance.

Source scans across all five application trees check for text arrow characters. UI arrows use SVG or CSS shapes. Existing Figma artwork, typography and supplied photography are preserved; no replacement logos, invented film or new commercial inventory is generated.

## Source limitations that remain explicit

- Luxury has eight supplied records with the same stated price, bedroom count, area and location; there are no rental records. Two records share an original catalogue photograph. This collection is not independently verified live inventory.
- ORLA has a genuine short preview and a supplied Residence 401 plan. The plan's category mapping is not verified, so collection-specific CTAs do not assert it.
- AVA has no supplied production film URL in the current build. Its configured-player tests use a separate eight-second, silent VP8 WebM fixture. They do not certify a future film's audio, encoding, CORS or hosting. Closing and restarting playback were verified; the headless visibility probe remained visible, so an actual background-tab pause was not verified.
- Atlantis's underwater presentation is explicitly a photograph, not a video player. Luxury and Six Senses have no video player in their current implementations.
- Full presentation films, downloadable brochure/payment-plan documents and independently confirmed availability require source material where they are not supplied. Contextual request flows remain honest about the available action.
- Actual enquiry delivery, native phone/map/share applications and physical-device touch behavior are outside this frontend acceptance.

## Publication and independent production checks

The following application commits were accepted. The later Luxury documentation-only commit carrying this aggregate report does not change application code, assets, configuration or dependencies.

| Project | Application commit | Verified production deployment | Public alias |
|---|---|---|---|
| Luxury Realty | `166ced646c47ded6adaca1c5ee61ec60e023ba60` | `dpl_EQJBZLHFXzFMEqhse9aNUM93cQqh` | [Luxury Realty](https://luxury-realty-imon.vercel.app/) |
| Atlantis | `fc940bd55cf2815bae27f91072a27b82d3ec6192` | `dpl_2tUWLJW6GxhPHDeiDiw5FNUweeZq` | [Atlantis](https://atlantis-imon.vercel.app/) |
| AVA | `a7f99fa189a2c2c45431a0e5105ee4577dc75eed` | `dpl_3BU84nHV3BiFQWuXnzCeCWceW8fk` | [AVA](https://ava-at-palm-imon.vercel.app/) |
| ORLA | `7b6716e036bcac892512e4746725380b5fc58682` | `dpl_HGfKBD2ao62NwM7vxNebB8xEr2Ha` | [ORLA](https://orla-imon.vercel.app/) |
| Six Senses | `b4226433034e7ce77f5f7d9a0586a104718e3531` | `dpl_2hdn9XFKiERzDbqLrAApMhKgUifG` | [Six Senses](https://six-senses-imon.vercel.app/) |

### Root live journeys after publication

- **Luxury:** Rent plus Dubai Hills survives Advanced filters. Exact one bedroom returns zero supplied records; 6+ returns eight. Waterfront uses its assigned two-photo collection and amenities. Keyboard navigation, Escape and return to the filtered collection restore the clicked card's focus.
- **Atlantis:** Two-bedroom filtering gives zero records; Back restores all bedrooms and the supplied residence; Forward restores the two-bedroom state. Reset restores the residence. Interior preview followed by View floor plan reaches `/residences/3402/?view=interior#floor-plan`, with the real plan in view.
- **AVA:** Clicking the Unit 801 plan image opens the site's viewer. Zoom reaches 130%, Fit returns to 100%, and Escape returns focus to the image link. The no-film production action opens the correct Sky Palace / Film request context. Decoded partner and footer graphics were inspected.
- **ORLA:** One Watch action starts the supplied 15.633-second preview. The presentation-request action is readable and opens the correct context. Back closes the nested request, then the film, restoring each initiating control. The selected Mansion collection has no unsupported Residence 401 shortcut; Back/Forward restores the collection state. Decoded footer graphics were inspected. The live observation of a covered video happened after it had ended, so causal pause evidence comes from the controlled local tests.
- **Six Senses:** Header Layouts, reload, Triplex details, enlarged plan, Back, Forward and 150% zoom all work. Escape restores the underlying residence and then the originating card. Direct Location plus reload opens a working map viewer. Direct Interiors plus reload shows the Inside view and advances its gallery from 1/4 to 2/4. The plan/history and Interiors sequence was also repeated in a clean tab with visible screenshots.

No form was submitted during these public journeys. The machine-readable application release ledger is [published.json](verification/interaction-v3-production/published.json).

All five server working copies were checked against the published application commit and full Git tree and were clean after synchronization. The four final fast-forwards completed in process `1384579` with exit code 0; Luxury's application synchronization was verified separately. No workstation build or browser test was run for this V3 pass. The aggregate documentation publication is synchronized separately after its own exact-SHA deployment check.

### Production observation requiring a boundary

In the long-lived Cloud Browser tab, two plan screenshot calls timed out. A later Interiors capture was uniformly navy, although the DOM, hit targets, image changes and navigation remained functional. The intro had `display:none`, no dialog was open, and the fixed header had a visible cream computed background. A new tab on the same deployment displayed the page normally. Repeating Layouts, reload, plan, Back/Forward, zoom, then Interiors reload and next photograph in that new tab produced correct visible frames.

This localizes the observation to the long-session rendering/capture state; its exact cause is not established. The blank frame is retained as diagnostic evidence, not counted as a visual pass, and is not silently discarded. No speculative application workaround was added for an unreproduced cause.

## Project evidence

- [Luxury interaction report](INTERACTION-AUDIT-2026-11-01-V3.md).
- [Atlantis interaction report](https://github.com/IMONsergey/AtlantistheRoyalResidences/blob/fc940bd55cf2815bae27f91072a27b82d3ec6192/docs/INTERACTION-AUDIT-2026-11-01-V3.md).
- [AVA interaction report](https://github.com/IMONsergey/AvaAtPalm/blob/a7f99fa189a2c2c45431a0e5105ee4577dc75eed/docs/INTERACTION-AUDIT-2026-11-01-V3.md).
- [ORLA interaction report](https://github.com/IMONsergey/orla/blob/7b6716e036bcac892512e4746725380b5fc58682/docs/INTERACTION-AUDIT-2026-11-01-V3.md).
- [Six Senses interaction report](https://github.com/IMONsergey/SixSenses/blob/b4226433034e7ce77f5f7d9a0586a104718e3531/docs/INTERACTION-AUDIT-2026-11-01-V3.md).
- [Selected production frames and diagnostic inventory](verification/interaction-v3-production/README.md).
