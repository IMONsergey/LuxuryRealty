# Source collection tools

These tools collect the public `luxuryresidences.com` source content for the
2026-11-03 migration. They perform HTTP GET/HEAD requests and local file writes.
They do not submit enquiry forms, send messages, change the source CMS, or
publish the new site.

## Inputs and dependencies

Use Python 3 and install `requirements.txt` in an isolated environment.
Set `LUXURY_SOURCE_DIR` to the directory holding the extracted source archive.
The directory must contain `urls.json` and `raw/`; it can also contain the
additional URL list and completed receipts. Do not point it at the live site
output directory.

```sh
export LUXURY_SOURCE_DIR=/absolute/path/to/luxuryresidences-source-20261103
python scripts/source/fetch_source.py
python scripts/source/fetch_source.py additional-urls.json additional-fetch-receipts.json
python scripts/source/extract_listings.py
python scripts/source/extract_editorial.py
```

`fetch_source.py` uses four bounded HTTP workers and caches successful HTML
files. Its first optional argument selects a URL-list JSON file relative to
`LUXURY_SOURCE_DIR`; the second selects the receipt filename. Re-running with an
existing raw cache is not a freshness check. Use a separate capture directory
when collecting a new dated snapshot.

`extract_listings.py` extracts detail-page fields and exact source media URLs.
It keeps source prices and sizes without currency conversion or speculative
correction. Availability comes from visible source badges. It also exports
the discovered internal URL inventory and data issues.

`extract_editorial.py` extracts project pages, static pages, team bios and
articles. It records placeholder and title/body mismatches separately from
content intended for display.

`audit_video_sources.py` reads the structured source JSON and writes a bounded
HTTP/provider-metadata audit to `docs/content-migration/video-source-audit.json`.
It does not execute or publish provider embed HTML. Omit `LUXURY_SOURCE_DIR`
for this audit to use `src/data/source`.

The crawler's live output is a new source snapshot. Review changes before
running `scripts/normalise-source-content.py`; the normaliser is a separate
step and never publishes the site.

## Captured archive

The 131 source HTML files, sitemap, original and additional URL lists, coverage
and receipts are in `docs/content-migration/source-snapshot.tgz`. Its SHA-256 and byte
length are recorded in `docs/content-migration/raw-archive-receipt.json`.
The compressed raw archive belongs in the project evidence archive, not the
public assets directory. Python package dependencies are not included.
