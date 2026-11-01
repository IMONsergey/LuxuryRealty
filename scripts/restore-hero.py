#!/usr/bin/env python3
"""Prepare the original Figma hero for review, then apply the reviewed derivatives.

Run through the authorized server job queue. The default invocation only writes
reproducible review files under artifacts/. --apply requires that preparation.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import tempfile

from PIL import Image, ImageCms, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSET_KEY = "imgRectangle6"
OLD_ASSET = "photo-71dc6441fb4a9673.webp"
WIDTHS = (480, 800, 1200, 1800, 2560)
FIGMA_SOURCE = {
    "fileKey": "m3N3lJCoutaziEm4nt4CwO",
    "pageId": "2:2",
    "nodeId": "2:134",
    "equivalentNodeId": "2:2341",
    "imageHash": "f8e0e62f4a1e1bad58cccdd5ca7651a8db5b7c6a",
    "originalWidth": 4096,
    "originalHeight": 2734,
    "observedExposure": -0.17796610295772552,
}
SRGB = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))


def digest(path: Path) -> str:
    checksum = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = path.stat().st_mode & 0o777 if path.exists() else 0o644
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as output:
            temporary = Path(output.name)
            output.write(content)
        temporary.chmod(mode)
        os.replace(temporary, path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def read_srgb(path: Path) -> tuple[Image.Image, dict]:
    with Image.open(path) as opened:
        opened.load()
        metadata = {"format": opened.format, "storedSize": list(opened.size), "iccProfile": bool(opened.info.get("icc_profile"))}
        oriented = ImageOps.exif_transpose(opened)
        try:
            profile = opened.info.get("icc_profile")
            if profile:
                image = ImageCms.profileToProfile(oriented, ImageCms.ImageCmsProfile(io.BytesIO(profile)), SRGB, outputMode="RGB")
                metadata["colorHandling"] = "Embedded ICC profile converted to sRGB; no exposure or tonal changes"
            else:
                image = oriented.convert("RGB")
                metadata["colorHandling"] = "Untagged RGB treated as sRGB; no exposure or tonal changes"
        finally:
            oriented.close()
    return image, metadata


def inspect_webp(path: Path, expected_size: tuple[int, int]) -> dict:
    with Image.open(path) as image:
        image.load()
        if image.format != "WEBP" or image.size != expected_size:
            raise ValueError(f"Unexpected derivative format/dimensions: {path.name}")
    return {"filename": path.name, "width": expected_size[0], "height": expected_size[1], "bytes": path.stat().st_size, "sha256": digest(path)}


def copy_new_asset(source: Path, target: Path, checksum: str) -> None:
    if target.exists():
        if digest(target) != checksum:
            raise ValueError(f"An existing derivative differs and will not be overwritten: {target.name}")
        return
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as output:
            temporary = Path(output.name)
        shutil.copyfile(source, temporary)
        if digest(temporary) != checksum:
            raise ValueError(f"Copied derivative verification failed: {target.name}")
        temporary.chmod(0o644)
        try:
            os.link(temporary, target)
        except FileExistsError:
            if digest(target) != checksum:
                raise ValueError(f"A conflicting derivative appeared while applying: {target.name}")
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def comparison(old: Image.Image, new: Image.Image, output: Path) -> None:
    # This contact sheet is analysis only. Both detail crops simulate the same
    # 1440x905 object-cover slot; upscaling the old preview here is intentional.
    width, gap, padding, label = 480, 16, 16, 32
    thumbnail_height, detail_height = 320, 280
    canvas = Image.new("RGB", (2 * width + gap + 2 * padding, thumbnail_height + detail_height + 3 * padding + 2 * label), "#101116")
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.load_default(size=17)
    except TypeError:
        font = ImageFont.load_default()
    for index, (image, title) in enumerate(((old, "OLD 1024x684"), (new, "NEW 2560x1709 / raw source"))):
        x = padding + index * (width + gap)
        draw.text((x, padding), title, fill="white", font=font)
        thumb = ImageOps.fit(image, (width, thumbnail_height), method=Image.Resampling.LANCZOS)
        canvas.paste(thumb, (x, padding + label))
        thumb.close()
        y = padding + label + thumbnail_height + padding
        draw.text((x, y), "Same detail at a 1440x905 display slot", fill="#c6c8d2", font=font)
        display = ImageOps.fit(image, (1440, 905), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
        left, top = round(1440 * 0.52 - width / 2), round(905 * 0.62 - detail_height / 2)
        detail = display.crop((left, top, left + width, top + detail_height))
        canvas.paste(detail, (x, y + label))
        display.close()
        detail.close()
    canvas.save(output, format="PNG", icc_profile=SRGB.tobytes())
    canvas.close()


def prepare(source: Path, source_hash: str, stage: Path, quality: int) -> dict:
    old_path = ROOT / "public/assets" / OLD_ASSET
    if not old_path.is_file():
        raise FileNotFoundError(f"The original comparison asset is missing: {old_path}")
    original, color_metadata = read_srgb(source)
    try:
        expected = (FIGMA_SOURCE["originalWidth"], FIGMA_SOURCE["originalHeight"])
        if color_metadata["format"] != "JPEG":
            raise ValueError("Use the verified original JPEG, not a rendered PNG or screenshot")
        if original.size != expected:
            raise ValueError(f"Expected the verified Figma original {expected}, received {original.size}; no assets changed")
        stage.mkdir(parents=True, exist_ok=True)
        stem = f"hero-palm-{source_hash[:16]}-q{quality}"
        variants = []
        for width in WIDTHS:
            if width > original.width:
                raise ValueError("Production variants must never upscale the original")
            size = (width, round(original.height * width / original.width))
            path = stage / f"{stem}-{width}.webp"
            resized = original.resize(size, Image.Resampling.LANCZOS)
            try:
                resized.save(path, format="WEBP", quality=quality, method=6, icc_profile=SRGB.tobytes())
            finally:
                resized.close()
            variants.append(inspect_webp(path, size))
        old, _ = read_srgb(old_path)
        new, _ = read_srgb(stage / variants[-1]["filename"])
        try:
            if old.size != (1024, 684):
                raise ValueError(f"The baseline hero dimensions changed: {old.size}")
            comparison(old, new, stage / "comparison.png")
        finally:
            old.close()
            new.close()
        report = {
            "schemaVersion": 1,
            "status": "prepared_for_visual_review",
            "source": {**FIGMA_SOURCE, "sha256": source_hash, "bytes": source.stat().st_size, **color_metadata},
            "encoding": {"format": "webp", "quality": quality, "method": 6, "upscale": False, "colorSpace": "sRGB", "exposureApplied": False},
            "comparison": {"path": "comparison.png", "oldAsset": f"/assets/{OLD_ASSET}", "oldSha256": digest(old_path), "analysisOnly": True},
            "variants": variants,
        }
        atomic_write(stage / "manifest.json", json.dumps(report, indent=2) + "\n")
        return report
    finally:
        original.close()


def source_document(report: dict) -> str:
    source = report["source"]
    rows = "\n".join(f"| {v['width']}x{v['height']} | `{v['filename']}` | {v['bytes']:,} |" for v in report["variants"])
    return f"""# Luxury Realty hero image source

## Provenance

- Figma file: `m3N3lJCoutaziEm4nt4CwO`, page `2:2` (Luxury Realty).
- Hero image layer: [`2:134`, Rectangle 6](https://www.figma.com/design/m3N3lJCoutaziEm4nt4CwO/?node-id=2-134), inside hero frame `2:133` (1440x905).
- Equivalent source layer: `2:2341`; both use image hash `f8e0e62f4a1e1bad58cccdd5ca7651a8db5b7c6a`.
- Original uploaded photograph: **4096x2734**, {source['bytes']:,} bytes. Dimensions were confirmed by the Figma image API and the decoded JPEG.
- Original SHA-256: `{source['sha256']}`.
- Original transfer used the official Figma asset exporter. Temporary download URLs are intentionally absent from the repository.

## Production derivatives

The original was resized without upscaling, encoded sequentially as WebP quality {report['encoding']['quality']} / method 6, and decoded again to verify the output. Tagged image colors are converted to sRGB; exposure, contrast and saturation are unchanged. EXIF metadata is not copied. Only the `imgRectangle6` entry in `src/data/assets.json` is changed. The old 1024px hero and its derivatives remain available.

| Dimensions | File in `public/assets` | Bytes |
| --- | --- | ---: |
{rows}

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
"""


def apply_prepared(source: Path, source_hash: str, stage: Path, quality: int) -> dict:
    receipt = stage / "manifest.json"
    if not receipt.is_file():
        raise ValueError("Prepare the comparison first by running without --apply")
    report = json.loads(receipt.read_text())
    if report.get("schemaVersion") != 1 or report["source"]["sha256"] != source_hash or report["source"]["bytes"] != source.stat().st_size:
        raise ValueError("Prepared receipt does not match this original")
    if report["encoding"] != {"format": "webp", "quality": quality, "method": 6, "upscale": False, "colorSpace": "sRGB", "exposureApplied": False}:
        raise ValueError("Prepared encoding settings do not match this invocation")
    if tuple(v["width"] for v in report["variants"]) != WIDTHS:
        raise ValueError("Prepared derivative set is incomplete")
    for variant in report["variants"]:
        filename = variant["filename"]
        if Path(filename).name != filename:
            raise ValueError("Invalid derivative filename")
        verified = inspect_webp(stage / filename, (variant["width"], variant["height"]))
        if verified != variant:
            raise ValueError(f"Prepared derivative changed: {filename}")
    assets_path = ROOT / "src/data/assets.json"
    old_text = assets_path.read_text()
    before = json.loads(old_text)
    previous = before[ASSET_KEY]
    largest = report["variants"][-1]
    entry = {
        "src": "/assets/" + largest["filename"],
        "width": report["source"]["originalWidth"], "height": report["source"]["originalHeight"],
        "renderWidth": largest["width"], "renderHeight": largest["height"],
        "srcset": ", ".join(f"/assets/{v['filename']} {v['width']}w" for v in report["variants"]),
    }
    if previous["src"] not in {"/assets/" + OLD_ASSET, entry["src"]}:
        raise ValueError("The hero mapping was changed independently; review it before applying")
    marker = re.search(r'^  "imgRectangle6":\s*', old_text, re.MULTILINE)
    if not marker:
        raise ValueError("Cannot locate the single hero entry without rewriting other mappings")
    _, length = json.JSONDecoder().raw_decode(old_text[marker.end():])
    replacement = json.dumps(entry, indent=2).replace("\n", "\n  ")
    updated = old_text[:marker.end()] + replacement + old_text[marker.end() + length:]
    expected = {**before, ASSET_KEY: entry}
    if json.loads(updated) != expected:
        raise ValueError("Unexpected mapping change; aborting")
    destination = ROOT / "public/assets"
    destination.mkdir(parents=True, exist_ok=True)
    for variant in report["variants"]:
        target = destination / variant["filename"]
        copy_new_asset(stage / variant["filename"], target, variant["sha256"])
    atomic_write(assets_path, updated)
    atomic_write(ROOT / "docs/hero-image-source.md", source_document(report))
    return {"status": "applied", "updatedKey": ASSET_KEY, "previous": previous, "current": entry, "variants": report["variants"]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Verified 4096x2734 JPEG from the official Figma asset exporter")
    parser.add_argument("--quality", type=int, choices=range(85, 89), default=87)
    parser.add_argument("--apply", action="store_true", help="Apply the previously prepared and visually reviewed derivatives")
    args = parser.parse_args()
    source = args.input.resolve(strict=True)
    source_hash = digest(source)
    stage = ROOT / "artifacts/hero-source-review" / f"{source_hash[:16]}-q{args.quality}"
    result = apply_prepared(source, source_hash, stage, args.quality) if args.apply else prepare(source, source_hash, stage, args.quality)
    print(json.dumps({"status": result["status"], "reviewDirectory": str(stage), "comparison": str(stage / "comparison.png"), "variants": result["variants"], "mappingChanged": args.apply}, indent=2))


if __name__ == "__main__":
    main()
