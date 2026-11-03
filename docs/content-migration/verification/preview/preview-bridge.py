#!/usr/bin/env python3
"""Continue the authorized preview release in its existing serialized job."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, re, shutil, subprocess, time
from urllib.parse import urlsplit

root = Path('/home/sergey/Projects/LuxuryRealty-content-20261103')
out = root / 'artifacts/content-migration-brand-20261103'
out.mkdir(parents=True, exist_ok=True)
def git(*args):
    return subprocess.check_output(['git', *args], cwd=root, text=True).strip()
assert git('branch', '--show-current') == 'content/source-migration-20261103'
commit = git('rev-parse', 'HEAD')
assert commit != 'bf0c7557313ea0bbbeda0a30382cfb3a6092c226'
manifest = json.loads((out / 'source-before.json').read_text())['hashes']
def unchanged_release():
    assert git('rev-parse', 'HEAD') == commit, 'Source HEAD changed'
    assert not git('diff', '--cached', '--name-only'), 'Unexpected staged changes'
    assert not git('diff', '--name-only'), 'Unexpected tracked changes'
    for name, digest in manifest.items():
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, 'Runtime changed: ' + name
unchanged_release()
stage = {'phase':'awaiting-ready-preview','sourceCommit':commit,
         'projectId':'prj_9iSUC97pBvn9DoD6blM9mAZm6dMu',
         'teamId':'team_eJReJ6RtdOT99uZ8iGJFHX3r',
         'at':datetime.now(timezone.utc).isoformat()}
(out / 'awaiting-preview.json').write_text(json.dumps(stage, indent=2) + '\n')
print('AWAITING_READY_PREVIEW ' + commit, flush=True)
signal = out / 'preview-ready.json'
deadline = time.monotonic() + 420
while not signal.is_file() and time.monotonic() < deadline:
    time.sleep(2)
if not signal.is_file():
    raise TimeoutError('Preview publication handshake timed out after 420 seconds; source commit is already preserved.')
deployment = json.loads(signal.read_text())
assert deployment['sourceCommit'] == commit
assert deployment['projectId'] == stage['projectId']
assert deployment['teamId'] == stage['teamId']
assert deployment['readyState'] == 'READY' and deployment['target'] == 'preview'
url = deployment['url']
parsed = urlsplit(url)
assert parsed.scheme == 'https' and re.fullmatch(r'luxury-realty-imon-[a-z0-9-]+\.vercel\.app', parsed.netloc)
assert not parsed.username and not parsed.password and parsed.port is None
assert parsed.path in ('', '/') and not parsed.query and not parsed.fragment
unchanged_release()
print('VERIFY_READY_PREVIEW ' + url, flush=True)
subprocess.run(['/usr/local/bin/imon-python', 'scripts/content-preview-smoke.py', '--url', url],
               cwd=root, check=True, timeout=300)
report_path = root / 'artifacts/content-migration/preview-smoke.json'
report = json.loads(report_path.read_text())
assert report['passed'] and report['complete'] and not report['errors']
assert report['summary']['pages'] == 130
unchanged_release()
destination = root / 'docs/content-migration/verification/preview'
destination.mkdir(parents=True, exist_ok=True)
shutil.copy2(report_path, destination / 'preview-smoke.json')
shutil.copy2(__file__, destination / 'preview-bridge.py')
visual_receipts = []
for width, height in [(1440, 900), (390, 844)]:
    for name, route in [('home', '/'), ('catalogue', '/properties/')]:
        screenshot = destination / ('preview-' + name + '-' + str(width) + '.png')
        subprocess.run(['/usr/local/bin/imon-playwright', 'screenshot', '--browser', 'chromium',
                        '--block-service-workers', '--viewport-size', str(width) + ',' + str(height),
                        '--timeout', '20000', '--wait-for-selector', 'main h1', '--wait-for-timeout', '2500',
                        url.rstrip('/') + route, str(screenshot)], cwd=root, check=True, timeout=40)
        content = screenshot.read_bytes()
        visual_receipts.append({'file':screenshot.name, 'route':route, 'width':width, 'height':height,
                                'sha256':hashlib.sha256(content).hexdigest(), 'bytes':len(content)})

receipt = {**deployment, 'checkedAt':datetime.now(timezone.utc).isoformat(),
           'scope':'GET/HEAD external preview smoke; no enquiry or third-party delivery',
           'summary':report['summary'], 'passed':True, 'screenshots':visual_receipts,
           'reportSha256':hashlib.sha256(report_path.read_bytes()).hexdigest()}
(destination / 'deployment-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
with (root / 'CHECKPOINT.md').open('a') as checkpoint:
    checkpoint.write('\n## 2026-11-03: content preview externally verified\n\n')
    checkpoint.write('Verified preview: ' + url + '\n\n')
    checkpoint.write('Deployed source commit: ' + commit + '. Vercel READY/exact commit confirmed through the authenticated connector. The serialized external GET/HEAD probe passed all 130 canonical pages, 20 scoped aliases, sampled local media and hero byte ranges, plus unknown-path 404. Reports and deployment receipt are in docs/content-migration/verification/preview/. External Chromium screenshots of home/catalogue at1440/390 are also preserved for visual review. No real enquiry was sent. Production alias remains unchanged.\n')
subprocess.run(['git', 'add', 'CHECKPOINT.md', 'docs/content-migration/verification/preview'], cwd=root, check=True)
subprocess.run(['git', 'diff', '--cached', '--check'], cwd=root, check=True)
staged = git('diff', '--cached', '--name-only').splitlines()
assert staged and all(name == 'CHECKPOINT.md' or name.startswith('docs/content-migration/verification/preview/') for name in staged), staged
assert git('rev-parse', 'HEAD') == commit
for name, digest in manifest.items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
subprocess.run(['git', 'commit', '--only', '-m', 'Record externally verified content migration preview', '--', 'CHECKPOINT.md', 'docs/content-migration/verification/preview'], cwd=root, check=True)
subprocess.run(['git', 'push', 'origin', 'content/source-migration-20261103'], cwd=root, check=True, timeout=180)
(out / 'preview-complete.json').write_text(json.dumps({**receipt, 'evidenceCommit':git('rev-parse','HEAD')}, indent=2) + '\n')
print('PREVIEW_VERIFIED ' + url, flush=True)
