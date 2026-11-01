# V3 independent production verification

These frames were captured by root on the public production aliases after the exact application deployments listed in [published.json](published.json) reached READY. They supplement the controlled project regression suites. They are not substitutes for those tests or a complete inventory of every site state.

The [aggregate release report](../../INTERACTION-RELEASE-2026-11-01-V3.md) records changes, test scope, live journeys and limitations. No production enquiry was submitted. [screenshot-manifest.json](screenshot-manifest.json) records the bytes and SHA256 of every retained JPEG.

## Accepted visible states

| Frame | Visible state |
|---|---|
| [19 Luxury search](19-luxury-production-search-preserved.jpg) | Rent and Dubai Hills retained in Advanced filters |
| [20 Luxury bedrooms](20-luxury-production-exact-bedrooms.jpg) | Exact one-bedroom filter and truthful empty result |
| [22 Luxury gallery](22-luxury-production-gallery-ready.jpg) | Decoded photo from the selected property's own gallery |
| [23 Atlantis plan](23-atlantis-production-floor-plan.jpg) | View floor plan reaches the Unit 3402 plan section |
| [24 AVA plan viewer](24-ava-production-plan-viewer.jpg) | Image click opens the matching in-site plan viewer |
| [26 AVA brands](26-ava-production-brands-ready.jpg) | Decoded supplied partner/footer graphics |
| [27 ORLA film](27-orla-production-film.jpg) | Supplied preview plays; presentation action is readable |
| [28 ORLA Mansion](28-orla-production-mansion.jpg) | Selected Mansion collection does not assert an unsupported 401 plan |
| [29 ORLA brands](29-orla-production-brands-ready.jpg) | Decoded transparent footer wordmarks |
| [30 Six residence](30-six-production-residence-after-reload.jpg) | Triplex details opened from the visible card after Layouts reload |
| [34 Six direct Interiors](34-six-production-interiors-cold.jpg) | Functional Inside scene on a direct cold-tab visit |
| [35 Six history and zoom](35-six-production-history-plan-cold.jpg) | Plan restored through Back/Forward, visibly enlarged to 150% |
| [36 Six gallery after history](36-six-production-interiors-after-history.jpg) | Interiors reload after the plan cycle, next photograph and 2/4 counter |

## Diagnostic evidence, not a passing frame

[33 Six long-session capture](33-six-diagnostic-long-session-blank.jpg) is uniformly navy. It followed two timed-out screenshot calls in a long-lived Cloud Browser tab. At capture diagnosis, the DOM remained functional, the intro had display:none, there was no open dialog and the fixed header had a cream computed background with opacity 1 and visibility visible. A clean tab on the same deployment rendered normally. One repeated Layouts/reload/plan/Back/Forward/zoom/Interiors/reload/gallery journey in the clean tab produced frames 35 and 36.

The exact cause between the old tab's rendering and capture state is not established. The blank frame is retained to avoid silently turning an uncertain observation into a visual pass. It did not justify a speculative source change.

## Excluded frames

The unsaved/loading Luxury frame 21 and the incorrectly named AVA frame 25 are not accepted ready-state proof. Frame 25 showed the Sky Palace section rather than the footer. The complete decoded footer capture is 26. Intentional loading/error states in project-specific regression evidence remain labeled as such.
