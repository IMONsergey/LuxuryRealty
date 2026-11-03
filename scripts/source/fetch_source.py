import os
import concurrent.futures
import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(os.environ.get('LUXURY_SOURCE_DIR', Path(__file__).resolve().parent)).resolve()
RAW = ROOT / 'raw'
RAW.mkdir(exist_ok=True)
URLS = json.loads((ROOT / (sys.argv[1] if len(sys.argv) > 1 else 'urls.json')).read_text())
RECEIPTS_PATH = ROOT / (sys.argv[2] if len(sys.argv) > 2 else 'fetch-receipts.json')

def fetch(url):
    slug = url.replace('https://www.luxuryresidences.com', '').strip('/') or 'home'
    path = RAW / (slug.replace('/', '__') + '.html')
    started = time.time()
    for attempt in range(2):
        try:
            if path.exists():
                payload = path.read_bytes()
                final = url
                status = 200
            else:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; ContentMigration/1.0)'})
                with urllib.request.urlopen(req, timeout=35) as response:
                    payload = response.read()
                    final = response.url
                    status = response.status
                path.write_bytes(payload)
            return {'url': url, 'resolvedUrl': final, 'status': status, 'file': str(path),
                    'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest(),
                    'seconds': round(time.time() - started, 3)}
        except Exception as exc:
            if isinstance(exc, urllib.error.HTTPError) and exc.code in {404, 410}:
                return {'url': url, 'status': exc.code, 'error': str(exc), 'seconds': round(time.time() - started, 3)}
            if attempt:
                return {'url': url, 'status': 'error', 'error': str(exc), 'seconds': round(time.time() - started, 3)}

receipts = []
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
    for future in concurrent.futures.as_completed({executor.submit(fetch, u): u for u in URLS}):
        record = future.result()
        receipts.append(record)
        RECEIPTS_PATH.write_text(json.dumps(sorted(receipts, key=lambda x: x['url']), indent=2))
        if len(receipts) % 10 == 0 or record['status'] != 200:
            print(json.dumps({'completed': len(receipts), 'total': len(URLS), 'last': record['url'], 'status': record['status']}), flush=True)
print(json.dumps({'complete': len(receipts), 'errors': [r for r in receipts if r['status'] != 200]}), flush=True)
