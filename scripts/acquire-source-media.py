#!/usr/bin/env python3
"""Copy the authorised source media into this project's independent asset store.

Run on imon-workstation through imon-job. Checkpointed, bounded and resumable;
original URL and SHA-256 stay in the manifest. No source HTML/code is executed.
"""
from __future__ import annotations
import argparse, concurrent.futures, hashlib, io, json, os, time, urllib.parse, urllib.request
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/media'
MANIFEST = ROOT / 'src/data/imported-media.json'
SOURCE = ROOT / 'src/data/source/media-urls.json'
HERO = 'https://cdn.prod.website-files.com/66a8e4e8bd6f32dc4680818f%2F66c6fc7bf2332cb0f1fe48cd_LR%20video%20coming-transcode.mp4'
POSTER = 'https://cdn.prod.website-files.com/66a8e4e8bd6f32dc4680818f%2F66c6fc7bf2332cb0f1fe48cd_LR%20video%20coming-poster-00001.jpg'
HOSTS = {'cdn.prod.website-files.com', 'assets.website-files.com', 'uploads-ssl.webflow.com'}
MAX_IMAGE = 32 * 1024 * 1024
MAX_VIDEO = 120 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 60_000_000

def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(path)

def fetch(url, limit):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname not in HOSTS:
        raise ValueError('Unapproved source media host: ' + str(parsed.hostname))
    request = urllib.request.Request(url, headers={'User-Agent': 'LuxuryRealty-content-migration/1.0'})
    with urllib.request.urlopen(request, timeout=25) as response:
        final = urllib.parse.urlparse(response.geturl())
        if final.scheme != 'https' or final.hostname not in HOSTS:
            raise ValueError('Unexpected media redirect')
        size = int(response.headers.get('Content-Length', '0'))
        if size > limit:
            raise ValueError('Source media exceeds bounded size')
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError('Source media exceeds bounded size')
        return data, response.headers.get('Content-Type', '')

def prepare_image(item):
    url = item['url']
    stem = hashlib.sha256(url.encode()).hexdigest()[:20]
    started = time.monotonic()
    error = None
    for attempt in range(2):
        try:
            data, content_type = fetch(url, MAX_IMAGE)
            original_hash = hashlib.sha256(data).hexdigest()
            if 'svg' in content_type or urllib.parse.urlparse(url).path.lower().endswith('.svg'):
                # Source vectors are not executed or injected into markup; rasterise only.
                import cairosvg
                data = cairosvg.svg2png(bytestring=data, output_width=1000, unsafe=False)
            with Image.open(io.BytesIO(data)) as raw:
                raw.load()
                picture = ImageOps.exif_transpose(raw)
                original_width, original_height = picture.size
                if picture.mode not in ('RGB', 'RGBA'):
                    picture = picture.convert('RGBA' if 'transparency' in picture.info else 'RGB')
                width_limit = 1800 if item.get('cover') else 1600
                widths = sorted(set([min(original_width, width_limit)] + ([min(original_width, 480), min(original_width, 960)] if item.get('cover') else [])))
                variants = []
                for width in widths:
                    height = max(1, round(original_height * width / original_width))
                    image = picture.resize((width, height), Image.Resampling.LANCZOS) if width != original_width else picture
                    path = DEST / f'{stem}-{width}.webp'
                    image.save(path, 'WEBP', quality=85, method=4)
                    variants.append({'src': '/media/' + path.name, 'width': width, 'height': height,
                                     'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
            main = variants[-1]
            return url, {**main, 'srcset': ', '.join(f"{v['src']} {v['width']}w" for v in variants),
                         'sourceUrl': url, 'sourceSha256': original_hash, 'originalWidth': original_width,
                         'originalHeight': original_height, 'variants': variants,
                         'seconds': round(time.monotonic() - started, 3)}, None
        except Exception as exc:
            error = f'{type(exc).__name__}: {exc}'
    return url, None, error

def hero(manifest):
    if HERO not in manifest or not (ROOT / 'public' / manifest[HERO]['src'].lstrip('/')).is_file():
        data, content_type = fetch(HERO, MAX_VIDEO)
        if 'video' not in content_type or b'ftyp' not in data[:64]:
            raise ValueError('Source hero is not an MP4')
        path = DEST / 'luxury-hero.mp4'
        path.write_bytes(data)
        manifest[HERO] = {'src': '/media/luxury-hero.mp4', 'sourceUrl': HERO, 'bytes': len(data),
                          'sha256': hashlib.sha256(data).hexdigest(), 'type': 'video/mp4'}
        atomic_json(MANIFEST, manifest)
    if POSTER not in manifest:
        url, entry, error = prepare_image({'url': POSTER, 'cover': True})
        if error:
            raise RuntimeError('Source hero poster: ' + error)
        manifest[url] = entry
        atomic_json(MANIFEST, manifest)
    print(json.dumps({'hero': manifest[HERO], 'poster': manifest[POSTER]['src']}), flush=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--hero-only', action='store_true')
    parser.add_argument('--workers', type=int, default=3)
    parser.add_argument('--limit', type=int, default=0)
    args = parser.parse_args()
    DEST.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    hero(manifest)
    if args.hero_only:
        return
    items = json.loads(SOURCE.read_text())
    pending = []
    for item in items:
        previous = manifest.get(item['url'])
        if previous and (ROOT / 'public' / previous['src'].lstrip('/')).is_file():
            continue
        pending.append(item)
    pending.sort(key=lambda item: not item.get('cover'))
    if args.limit:
        pending = pending[:args.limit]
    failures = []
    print(json.dumps({'requested': len(items), 'alreadyStored': len(manifest), 'pending': len(pending)}), flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 3))) as pool:
        futures = [pool.submit(prepare_image, item) for item in pending]
        for number, future in enumerate(concurrent.futures.as_completed(futures), 1):
            url, entry, error = future.result()
            if error:
                failures.append({'url': url, 'error': error})
            else:
                manifest[url] = entry
            if number % 20 == 0 or number == len(futures):
                atomic_json(MANIFEST, manifest)
                atomic_json(ROOT / 'artifacts/content-migration/media-failures.json', failures)
                print(json.dumps({'processed': number, 'pendingTotal': len(futures), 'stored': len(manifest), 'failures': len(failures)}), flush=True)
    atomic_json(MANIFEST, manifest)
    atomic_json(ROOT / 'artifacts/content-migration/media-failures.json', failures)
    print(json.dumps({'complete': not failures, 'stored': len(manifest), 'failures': failures}), flush=True)
    if failures:
        raise SystemExit(2)

if __name__ == '__main__':
    main()
