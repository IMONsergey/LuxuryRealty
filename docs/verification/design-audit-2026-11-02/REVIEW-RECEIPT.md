# Luxury Realty — visual audit receipt

Baseline: `d48f91e4d007bc1fdf89114b70b34a2960b84a8a`.

## Changes in this worktree

- All eight existing catalogue records retained but explicitly marked as illustrative, not verified live listings.
- Unverified prices/specifications/location/availability removed from public cards and detail pages; unverified property features, maps, advisor portrait and brochure imagery withheld from the detail template.
- Gallery alt/caption text no longer invents interior facts.
- Search uses one live-update model; redundant Apply action removed.
- The catalogue now exposes only filters that exist in the illustrative UI: visible title/subtitle keyword search, Buy examples/Rent selection and Featured/Name sort.
- Removed hidden type/bedroom/price/features controls and the obsolete price-range empty state. Old shared URLs containing those legacy parameters are canonicalized with `replaceState`; they no longer affect results. The original eight data records remain unchanged.
- Removed unused unverified type/location/bedroom/price/features metadata attributes from the rendered property-card DOM.
- Keyword search is restricted to the visible card title and subtitle. It no longer matches hidden placeholder location, property type or feature metadata.
- Rent preview contains zero rental examples; the empty state explicitly says rental inventory and availability must be confirmed separately.
- Fixed mobile catalogue disclaimer spacing after actual bounding-box test found a 14px overlap; final gap is 16px mobile / 24px desktop.

## Verification

- Final build after all code/markup changes: job `68eaa6b6-c782-48bc-b409-53f5d7262437` — succeeded.
- Legacy URL, visible keyword search, reset and settled Rent header: job `b7cb6753-246a-4c31-ab02-1f23660f8a2f` — passed.
  - Legacy `type/beds/min/max/features/sort=price-low` query canonicalized to visible `q=Dubai+Hills`; unsupported parameters discarded; no hidden legacy controls remain.
  - A second old URL with legacy type/bed/price/features filters canonicalized to `/properties/` and shows all 8 examples.
  - Searching visible title `illustrative residence 01` returns one result.
  - Searching placeholder location `Dubai Hills Estate` or hidden placeholder feature `pool` returns no result.
  - Reset restores all 8 examples, clears the query and returns URL to `/properties/`.
  - No page errors.
- Browser history/popstate legacy URL regression: job `e5d3ba52-58ce-49ea-bf5a-de06ce7cb0cf` — passed; unsupported filters stripped, 8 examples restored, sort reset to Featured, no legacy controls.
- Rent header state was measured after a real scroll and 450ms transition settlement: scrollY 578; opaque header `rgb(13, 13, 17)`, bottom 66px; Featured select top 120.375px / bottom 162.375px; no overlap. The prior image that appeared to show an overlap was stale, not a current defect.
- Refreshed actual Chromium 390px screenshots: `luxury-search-390.png`, `luxury-rent-empty-390.png`, `luxury-rent-settled-scroll-390.png`. All three were opened and visually inspected. The refreshed search screenshot shows the disclaimer and Buy/Rent controls separated correctly.
- Earlier responsive evidence remains: widths 320, 360, 390, 430, 768, 1180, 1440; 8 catalogue records retained; visible broken images 0; page errors 0; API requests 0. This was not rerun because the current changes are confined to catalogue query semantics and markup.

## Review boundary / remaining

- `npm ci` reported 11 dependency advisories (3 moderate, 8 high); this pass did not perform dependency remediation or claim security clearance.
- Inventory, photography-to-listing mapping, actual prices and legal/operator details remain unverified; records are examples, not offers. No records deleted.
- No real enquiry, backend/credential change, or publication.
