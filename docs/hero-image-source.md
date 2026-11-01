# Luxury Realty hero image source

## Provenance

- Figma file: `m3N3lJCoutaziEm4nt4CwO`, page `2:2` (Luxury Realty).
- Hero image layer: [`2:134`, Rectangle 6](https://www.figma.com/design/m3N3lJCoutaziEm4nt4CwO/?node-id=2-134), inside hero frame `2:133` (1440x905).
- Equivalent source layer: `2:2341`; both use image hash `f8e0e62f4a1e1bad58cccdd5ca7651a8db5b7c6a`.
- Original uploaded photograph: **4096x2734**, 14,600,081 bytes. Dimensions were confirmed by the Figma image API and the decoded JPEG.
- Original SHA-256: `08fa4f93ccc15ce1b389f38d1257a59d6637ab34386749004054c5a1907cdd2d`.
- Original transfer used the official Figma asset exporter. Temporary download URLs are intentionally absent from the repository.

## Production derivatives

The original was resized without upscaling, encoded sequentially as WebP quality 87 / method 6, and decoded again to verify the output. Tagged image colors are converted to sRGB; exposure, contrast and saturation are unchanged. EXIF metadata is not copied. Only the `imgRectangle6` entry in `src/data/assets.json` is changed. The old 1024px hero and its derivatives remain available.

| Dimensions | File in `public/assets` | Bytes |
| --- | --- | ---: |
| 480x320 | `hero-palm-08fa4f93ccc15ce1-q87-480.webp` | 34,818 |
| 800x534 | `hero-palm-08fa4f93ccc15ce1-q87-800.webp` | 87,712 |
| 1200x801 | `hero-palm-08fa4f93ccc15ce1-q87-1200.webp` | 176,828 |
| 1800x1201 | `hero-palm-08fa4f93ccc15ce1-q87-1800.webp` | 356,508 |
| 2560x1709 | `hero-palm-08fa4f93ccc15ce1-q87-2560.webp` | 628,420 |

## Appearance verification

Figma's layer exposes an exposure value of `-0.17796610295772552`. This is recorded as source metadata, not converted into an invented CSS brightness or image adjustment. The existing hero gradients are unchanged.

Before application, `scripts/restore-hero.py` prepares `comparison.png` under `artifacts/hero-source-review/`: old and new full-frame thumbnails and the same detail at a 1440x905 display slot. This sheet is analysis only and is never referenced by the website. `--apply` verifies the preparation hashes and dimensions before updating the mapping. Applying assets does not itself establish a visual QA pass; the release owner records that evidence separately.

## Reproduction

```sh
python3 scripts/restore-hero.py /path/to/verified-original.jpeg
# Inspect the comparison.png path printed above, then use the same input:
python3 scripts/restore-hero.py /path/to/verified-original.jpeg --apply
```

Run image encoding through the authorized server job queue. Default quality is 87; allowed quality values are 85 through 88. All five variants are 480, 800, 1200, 1800 and 2560 pixels wide.
