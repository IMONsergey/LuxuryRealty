# Luxury Realty content migration

Source snapshot: 3 November 2026, https://www.luxuryresidences.com/.

The new Luxury Realty site retains the existing design, name, logo and Astro
platform. The migration replaces its illustrative property collection with the
accessible source inventory and adds the source's substantive company and
development content. The source website itself is unchanged.

## Coverage and information architecture

| Content | Imported result |
| --- | --- |
| Individual properties currently offered for sale | 49 |
| Individual properties currently offered for rent | 26 |
| Sold properties | 17, available in the archive |
| Rented properties | 9, available in the archive |
| Development enquiry records | 9, separated from individual homes |
| Total property detail pages | 110 |
| Full development profiles | 7 |
| Team members | 7 |
| Source services | 5 |
| Seller process | 8 steps |
| Canonical site pages, including retained editorial articles | 130 |

The seven development profiles and nine enquiry records are different views of
the source material, not sixteen distinct projects. The catalogue exposes Buy,
Rent, New developments and All; current listings are the default. Sold and
rented listings retain their own descriptions and galleries and offer a request
for similar homes.

Discovery checked all 200 sitemap URLs and 30 additional property URLs found in
current internal links. The result was 131 live pages and 99 HTTP 404 responses.
The raw snapshot contains every accessible page with its source URL and hash.
The source's `/projects/template` is excluded from publication.

The source has four article URLs whose identical body describes an unrelated
Ohana property despite different titles. Their original text and evidence are
archived; they are not published under those misleading titles. Four short
editorial articles from the existing Luxury Realty site remain, with corrected
reading times and explicit Palm Jumeirah/Dubai Marina naming.

## What the visitor can do

- Search by property, building or community; combine location, property type,
  exact bedroom count, AED price bounds, amenities and availability.
- Sort, move through 24-item pages, reload or share filtered URLs, and return
  from a property or its related homes with the original position and filters.
- Browse full property galleries with keyboard controls and a recoverable image
  loading error state, and open a film only when requested.
- Read complete development stories, amenities and galleries, then explore
  correctly associated offers or ask for current residence information.
- Review the agency, seven-person team, five services, selling process and
  current office contact details.
- Submit a contextual enquiry through the existing backend. Consent validation,
  retry identity, duplicate protection and receipt verification are retained.

## Media

The 110 property records contain 2,083 gallery references to 1,803 unique photo
URLs. The selected media inventory includes 1,904 distinct images across
properties, developments and company pages. Images have been downloaded and
converted to local WebP assets, with smaller variants for cover photographs.
The manifest records the original URL, original SHA-256, dimensions and the
hash, byte length and dimensions of every generated variant. Rendering fails
on a missing asset instead of silently falling back to the old platform CDN.

The exact source homepage MP4 and poster are local assets. Autoplay respects
reduced motion and data-saving preferences; the player has a pause control and
stops when it is not visible. A failed autoplay leaves the poster usable.

The property records contain 54 film placements pointing to 50 unique films:
39 Vimeo and 11 YouTube URLs. All 50 provider metadata checks returned HTTP 200.
Vimeo's unlisted path hash is preserved. YouTube uses its privacy-enhanced
embed host. Seven development film URLs are retained from the source.

AVA's source Dropbox filename mentions ORLA. Three sampled frames were compared
with AVA's source image; the architecture and setting support retaining the
AVA film. This is recorded as a visual inference in `video-visual-review.json`,
with the original frames in `media-evidence/`.

## Deliberate corrections and limits

| Source issue | Treatment |
| --- | --- |
| VELA incorrectly placed in Palm Jumeirah | Marasi Bay, checked against OMNIYAT and Dorchester Collection; raw value retained |
| Six Senses Palm listings could be linked to Marina | Strict project associations keep Palm and Dubai Marina separate |
| Waterfront Collection lacked a project association | Explicit association with the corresponding Serenity Mansions profile |
| Marketing slogans used as project enquiry titles | Canonical project/building names, with the old headline retained as subtitle |
| Two Bahar 4 offers say both 2 and 3 bedrooms | Public bedroom value withheld, clear note to confirm the layout, original data retained |
| Missing bathroom counts | Omitted; no inferred values |
| Inconsistent USD/sqm figures | Published AED and square-foot values used without speculative conversion |
| Malformed advisor phone | Office contact used instead of an invalid dial link |
| Email links incorrectly used `tel:` | Correct `mailto:` links |
| Advisor WhatsApp URL omitted the country code or contained `+` | Build digits-only `wa.me` URLs from validated published UAE phones; retain raw source and suppress unverified numbers |
| Old project contact block referenced another office | Dedicated contact page is authoritative: Office 804, Magnum Opus Tower, Barsha Heights |
| Brochure and floor-plan buttons had no files | Contextual request actions; no invented downloads |
| Generic map screenshot appeared in project images | Excluded; location links use an explicit place search |
| Old brand and new brand | Public agency copy uses Luxury Realty; the published legal operator remains Luxury Residences Real Estate LLC |
| Old privacy policy | Adapted to the new platform’s actual enquiry handling and on-demand video. The original policy is archived; its claims about advertising cookies and marketing-partner sharing are not carried over as current site behavior. The shorter notice is not a verbatim migration of all old legal clauses. |

The published email and phone remain `contactus@luxuryresidences.com` and
`+971 4 283 6681`. New contact details or a new legal entity were not supplied.
Prices and availability represent the source snapshot and are confirmed through
an advisor, not a live inventory feed.

Scoped redirects are defined for `/buy`, `/rent`, `/contact`, the old privacy
path, seven old `/projects/` routes, the four inconsistent source article paths
and the previous illustrative property URLs. These routes operate in the new
application; no change to the old site's hosting or DNS is implied.

## Verification and release

Verification is performed on the isolated server worktree through `imon-job`.
No real enquiry, email or other outward message is sent by the QA scripts.

The resumed full interaction gate `20261103T101612-48b273b939` finished successfully on
3 November 2026. Type checking, all 22 unit tests and the Astro / Vercel build
passed. Chromium, WebKit and Firefox each passed 16 interaction groups at 1440
and 390 pixels, including the actual Atlantis development-to-catalogue link,
all 26 matching sale/rental homes, combined filters, return navigation, gallery
failure/retry, actual hero playback and mocked enquiry failure/retry/identity.
The separate page visual suite passed all 18 groups and saved 20 screenshots.

The built-output audit checked 130 canonical pages, 131 HTML files, 2,037
internal links and 2,305 hashed media files with zero errors. Its one warning
is a source CDN hostname in the approved MP4 domain allowlist, not an image
hotlink. Deliberate mocked API/gallery failures remain explicitly marked in
the browser reports; there were no unexpected console, page or asset errors.
AVA native-film wiring and metadata passed at both widths; full playback was
not asserted by that probe.

All 83 source/configuration/test inputs retained their hashes through the
full interaction gate. Exact reports, the job receipt, source hashes, raw log and eight
selected PNGs are preserved in `verification/`. Historical failed Firefox
runs and recovery actions remain in `qa-recovery-20261103.json`. The final run
used the existing Playwright 1.58.2 package for all three engines; no assertions,
timeouts or resource limits were relaxed.

Independent source coverage, source exceptions and all 131 archive hashes were
rechecked in `independent-source-audit-20261103.json`. The Atlantis collection
now preserves 15 sale and 11 rental homes; ORLA retains its two individual sale
listings without adding a development enquiry record.

### Final brand-card correction

A subsequent visual review found a standalone Luxury Residences logo in the
homepage About collage. It was a UI asset, not a watermark in a property photo.
The card now reuses the existing Luxury Realty mark and wordmark and links to
About. Only the home template and CSS scoped to this block changed.

After this correction, type checking, all 22 unit tests, the production build
and the complete output audit passed again. A focused Chromium check at 1440
and 390 pixels verified both loaded brand SVGs, absence of the old logo from
the rendered home page, the real About navigation and no horizontal overflow.
Screenshots, the exact final source manifest and the receipt are in
`verification/brand/`. The earlier 48 interaction groups and 18 visual groups
are retained as baseline coverage, rather than described as rerun on this
last isolated correction. Source file sets and hashes were unchanged through
the focused gate. The raw baseline log is preserved as `gate.log.gz`; only
trailing whitespace was removed from its readable `gate.log` copy.

Commands for a verified checkout:

```sh
npm ci --no-audit --no-fund
npm run check
npm test
npm run build
python3 scripts/content-output-audit.py --output .vercel/output/static
env ENGINE=chromium QA_PORT=14328 node scripts/content-browser-qa.mjs
env ENGINE=webkit QA_PORT=14328 node scripts/content-browser-qa.mjs
env ENGINE=firefox QA_PORT=14328 node scripts/content-browser-qa.mjs
env QA_PORT=14329 node scripts/content-visual-qa.mjs
env QA_PORT=14330 node scripts/content-brand-qa.mjs
```

Run browser engines sequentially. Browser reports distinguish mocked provider
and enquiry responses from actual hero playback. The visual report separately
records native-film wiring, external metadata and whether playback was tested.
The offline output audit checks built files rather than accepting files that
exist only in `public/`.

## Evidence and maintenance

- `source-snapshot.tgz`: 131 raw HTML pages and crawl inputs/receipts.
- `raw-archive-receipt.json`: archive checksum and size.
- `coverage.json`, `source-receipts.json`, `source-not-found.json`: complete URL coverage.
- `src/data/source/`: original structured fields; keep these separate from corrections.
- `verified-corrections.json`, `source-field-conflicts.json`: explicit deviations and unresolved discrepancies.
- `src/data/imported-media.json`: source-to-local media manifest.
- `video-source-audit.json`, `video-visual-review.json`: provider checks and AVA visual evidence.
- `scripts/source/README.md`: reproducible discovery and extraction workflow.

For a future refresh, collect a separate dated snapshot, review its changes and
document any new corrections before regenerating content. The current scripts
do not automatically publish, change DNS or synchronize a live CMS.
