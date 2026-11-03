#!/usr/bin/env bash
set -euo pipefail
export PATH=/opt/imon-runtime/node/bin:/home/sergey/.local/bin:/usr/local/bin:/usr/bin:/bin
cd /home/sergey/Projects/LuxuryRealty-content-20261103
test "$(git branch --show-current)" = "content/source-migration-20261103"
test "$(git rev-parse HEAD)" = "bf0c7557313ea0bbbeda0a30382cfb3a6092c226"
export PLAYWRIGHT_PACKAGE=/home/sergey/.local/share/imon-toolkit/node/node_modules/playwright/package.json
export QA_OUTPUT_DIR=artifacts/content-migration-resume-20261103
mkdir -p "$QA_OUTPUT_DIR"
python3 - <<'PY'
from pathlib import Path
import hashlib,json,datetime
root=Path.cwd()
files=[p for folder in ['src','scripts','tests'] for p in (root/folder).rglob('*') if p.is_file() and 'output' not in p.relative_to(root).parts]
files.extend(root/p for p in ['package.json','package-lock.json','astro.config.mjs'] if (root/p).exists())
hashes={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(files))}
out=root/'artifacts/content-migration-resume-20261103'
(out/'gate-source-before.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'hashes':hashes},indent=2)+'\n')
print('Frozen source files:',len(hashes))
PY
git diff --check
node --check scripts/content-browser-qa.mjs
node --check scripts/content-visual-qa.mjs
npm run check
npm test
npm run build
/usr/local/bin/imon-python scripts/content-output-audit.py --output .vercel/output/static
cp artifacts/content-migration/content-output-audit.json "$QA_OUTPUT_DIR/content-output-audit.json"
env ENGINE=chromium QA_PORT=14328 node scripts/content-browser-qa.mjs
env ENGINE=webkit QA_PORT=14328 node scripts/content-browser-qa.mjs
env ENGINE=firefox QA_PORT=14328 node scripts/content-browser-qa.mjs
env QA_PORT=14329 node scripts/content-visual-qa.mjs
python3 - <<'PY'
from pathlib import Path
import hashlib,json,datetime
root=Path.cwd();out=root/'artifacts/content-migration-resume-20261103'
before=json.loads((out/'gate-source-before.json').read_text())['hashes']
after={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in before}
changed=[p for p in before if before[p]!=after[p]]
assert not changed,changed
results={}
for name in ['chromium-report.json','webkit-report.json','firefox-report.json','visual-report.json','content-output-audit.json']:
 data=json.loads((out/name).read_text())
 assert data.get('passed') if name=='content-output-audit.json' else data.get('ok'),name
 assert not data.get('changedSources'),name
 results[name]={'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest(),'checks':len(data.get('checks',[]))}
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':True,'sourceChanged':changed,'sourceFiles':len(before),'reports':results,'playwrightPackage':'/home/sergey/.local/share/imon-toolkit/node/node_modules/playwright/package.json'}
(out/'gate-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
PY
