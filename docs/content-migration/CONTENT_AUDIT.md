# Content migration audit

Source capture: 2026-11-03. This report distinguishes collection coverage from
independent confirmation of property availability or provider video playback.

## Public-source coverage

| Evidence | Result |
| --- | ---: |
| Sitemap URLs requested | 200 / 200 |
| Sitemap pages returning HTTP 200 | 101 |
| Sitemap pages returning HTTP 404 | 99 |
| Additional live URLs discovered through source links | 30 |
| Total unique URLs requested | 230 |
| Raw successful HTML pages | 131 |
| Unfetched discovered URLs | 0 |
| Extracted property/inquiry records | 110 |

The 110 records consist of 101 individual advertisements and 9 development
inquiry records. The individual records comprise 49 sale advertisements and
26 rental advertisements without an unavailable badge, plus 17 marked Sold
and 9 marked Rented. A source record marked Listed is a published advertisement;
it is not independent confirmation that a unit is available today.

The source inventory also contains 7 real editorial project pages, one explicit
project template, 4 article pages, 9 main pages and 7 team biographies. The
editorial project pages overlap with development inquiry records. They are not
additional individual units.

## Facts that must survive normalization

- Every displayed listing retains its own source URL and SHA-256.
- Sale and rental offers remain separate even when the source uses the same
  photographs and description for both.
- A rental price retains its yearly period. Source USD equivalents are not used
  as verified currency conversions.
- Source bedroom counts, AED prices and square-foot areas remain exact. Missing
  bathroom counts and missing locations are not filled with invented values.
- The two documented Bahar 4 bedroom conflicts suppress the public numeric count
  with `bedrooms: null` and a specific confirmation note. This is not a claim
  that either 2 or 3 bedrooms is the correct count; the raw sidebar stays at 2.
- The single documented VELA location correction replaces the source template's
  Palm Jumeirah value with Marasi Bay. Developer and operator evidence is in
  `verified-corrections.json`; the raw record retains Palm Jumeirah unchanged.
- The nine development inquiry records remain explicitly distinct from
  individual inventory. Their source fields do not prove unit availability.
- A Six Senses residence on Palm Jumeirah cannot be associated with the separate
  Six Senses Dubai Marina project merely because both names contain Six Senses.
- All source photos and videos remain attached to their original listing;
  photographs from another card or a template are not substituted.

## Confirmed source defects

1. The sitemap contains 99 HTTP 404 pages and omits 30 currently linked live
   property pages. The migration uses the union of sitemap and discovered links.
2. All four source articles have the same body about an Ohana by The Sea mansion
   in Abu Dhabi. None of their four titles describes that body. They remain in
   the source archive with `publicationEligible: false`.
3. `/projects/template` contains explicit template copy and is excluded.
4. Real project pages contain empty CMS sections, placeholder media, and brochure
   or floorplan controls without actual download URLs. These do not establish
   that a downloadable file exists.
5. The villa `one-of-a-kind-villa-unique-reimagined-layout` lists 6,702 sqft but
   63 sqm. The Six Senses Dubai Marina development inquiry lists 2,000 sqft but
   202 sqm. Public normalization uses the original square-foot field and does
   not publish those inconsistent metric equivalents.
6. All 110 source property-contact email links incorrectly use a `tel:` href.
   The visible email address is separate evidence; the malformed href is not
   copied into a new email link.
7. Matthew Cooke's source phone `+9715025402880` has an unexpected digit count.
   The normaliser omits that unconfirmed telephone from public agent actions.
8. Source metadata can say `APARTMENT FOR SALE` on a rental page. Public metadata
   must follow actual purpose and type instead of copying the old metadata.
9. A shared `google-map (1).png` asset appears in project image collections. It
   is a map screenshot, not a project photograph, and must not enter a photo
   gallery as verified project photography.
10. The Bahar 4 sale/rental records
    `unique-duplex-breath-taking-sea-view` and
    `one-of-a-kind-loft-designer-upgrade-sea-view` advertise 3BR in their titles
    while their primary sidebar says 2 bedrooms. The sale description also says
    three-bedroom loft. `source-field-conflicts.json` preserves both claims;
    neither count is independently confirmed by the migration. The normaliser
    suppresses only these two numeric bedroom values, records the exception in
    `verified-corrections.json`, and adds: "Published details list both 2 and 3
    bedrooms. Please confirm the layout with an advisor."

## Source media scope

The property records contain 2,083 gallery references to 1,803 unique source
image URLs. Fifty-four property records have a video: 42 Vimeo references and
12 YouTube references, with 50 distinct video URLs overall. All 50 distinct
provider oEmbed endpoints returned HTTP 200 during the audit; their titles were
reviewed against the source listings. Collection and provider metadata do not
by themselves establish playback in every browser.

The seven real editorial project pages use seven distinct Dropbox video URLs.
The AVA page references a file whose name explicitly says ORLA. The actual MP4
was downloaded and three frames were inspected: the curved tower, neighboring
ONE building and Palm entrance bridge are consistent with the AVA source hero
photograph and official developer context. The misleading filename alone is
not evidence of a wrong clip. This remains an inference from sampled frames.
The file hash, codec, duration and four comparison images are recorded in
`video-visual-review.json` and `media-evidence/`.

## Verification contract

`tests/content-migration.test.mjs` checks coverage receipts, all 110 identities
and hashes, exact numeric fields, archive and rental distinctions, independently
checked example records, every photo and video assignment, split sale/rental
offers, the Palm/Marina association boundary, project provenance and sanitized
description markup. It also rejects template and map images in project photos.

The source collector did not run the application build or this test suite.
Execution receipts from the integration environment are required before
claiming those tests passed. No real enquiry, message or publication was
performed by the source collector.
