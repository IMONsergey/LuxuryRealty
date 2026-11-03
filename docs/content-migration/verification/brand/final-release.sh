#!/usr/bin/env bash
set -euo pipefail
export PATH=/opt/imon-runtime/node/bin:/home/sergey/.local/bin:/usr/local/bin:/usr/bin:/bin
cd /home/sergey/Projects/LuxuryRealty-content-20261103
test "$(git branch --show-current)" = "content/source-migration-20261103"
test "$(git rev-parse HEAD)" = "bf0c7557313ea0bbbeda0a30382cfb3a6092c226"
export PLAYWRIGHT_PACKAGE=/home/sergey/.local/share/imon-toolkit/node/node_modules/playwright/package.json
export QA_OUTPUT_DIR=artifacts/content-migration-brand-20261103
mkdir -p "$QA_OUTPUT_DIR"
python3 - <<'PY'
from pathlib import Path
import hashlib,json,datetime,subprocess
root=Path.cwd();out=root/'artifacts/content-migration-brand-20261103'
status=json.loads(subprocess.check_output(['/usr/local/bin/imon-job','status','20261103T101612-48b273b939'],text=True))
assert status['state']=='succeeded' and status['exitCode']==0,status
files=[p for folder in ['src','scripts','tests'] for p in (root/folder).rglob('*') if p.is_file() and 'output' not in p.relative_to(root).parts]
files.extend(root/p for p in ['package.json','package-lock.json','astro.config.mjs'] if (root/p).exists())
hashes={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(files))}
baseline=json.loads((root/'artifacts/content-migration-resume-20261103/gate-source-before.json').read_text())['hashes']
changed=sorted(p for p in baseline if baseline[p]!=hashes.get(p))
added=sorted(set(hashes)-set(baseline))
assert changed==['src/pages/index.astro','src/styles/migration.css'],changed
assert added==['scripts/content-brand-qa.mjs'],added
assert hashes['scripts/content-brand-qa.mjs']=='cfe2ff0022b267dd8b0b76fd25881ac44cf1f93ce43cbfd29abbcfaae9e65b81'
assert hashes['src/pages/index.astro']=='7188a9dfa877b166c57ea66a48e7d2368c9207c4337f5b27dfae92121ca67f20'
assert hashes['src/styles/migration.css']=='a2182068016717828df32526022c3d1229c8e1a8fd486167db29fe0387e90d47'
(out/'source-before.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'hashes':hashes,'changedFromFullGate':changed,'addedFromFullGate':added},indent=2)+'\n')
print('Verified baseline and frozen final inputs:',len(hashes))
PY
git diff --check
node --check scripts/content-brand-qa.mjs
npm run check
npm test
npm run build
/usr/local/bin/imon-python scripts/content-output-audit.py --output .vercel/output/static
cp artifacts/content-migration/content-output-audit.json "$QA_OUTPUT_DIR/content-output-audit.json"
env QA_PORT=14330 node scripts/content-brand-qa.mjs
python3 - <<'PY'
from pathlib import Path
import hashlib,json,datetime,shutil
root=Path.cwd();out=root/'artifacts/content-migration-brand-20261103'
before=json.loads((out/'source-before.json').read_text())
files=[p for folder in ['src','scripts','tests'] for p in (root/folder).rglob('*') if p.is_file() and 'output' not in p.relative_to(root).parts]
files.extend(root/p for p in ['package.json','package-lock.json','astro.config.mjs'] if (root/p).exists())
after={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(files))}
assert before['hashes']==after,'Source file set or hashes drifted'
brand=json.loads((out/'brand-chromium-report.json').read_text())
audit=json.loads((out/'content-output-audit.json').read_text())
assert brand.get('ok') and not brand.get('changedSources'),brand
assert audit.get('passed'),audit.get('errors')
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':True,'fullInteractionGate':'20261103T101612-48b273b939','scope':'Final home About brand card, with fresh typecheck, 22 unit tests, production build and full output audit. Prior 48 browser groups and 18 visual groups remain baseline coverage; they were not rerun after this isolated markup/CSS correction.','sourceFiles':len(after),'sourceDrift':[],'changedFromFullGate':before['changedFromFullGate'],'addedFromFullGate':before['addedFromFullGate'],'reports':{}}
for name in ['brand-chromium-report.json','content-output-audit.json','source-before.json']:
 data=(out/name).read_bytes();receipt['reports'][name]={'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
(out/'gate-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
dest=root/'docs/content-migration/verification/brand'
dest.mkdir(parents=True,exist_ok=True)
for p in out.iterdir():
 if p.is_file() and p.suffix in ['.json','.png']:shutil.copy2(p,dest/p.name)
shutil.copy2('/tmp/luxury-content-final-release-20261103.sh',dest/'final-release.sh')
v=root/'docs/content-migration/verification';e=json.loads((v/'release-evidence.json').read_text())
e['scope']='Full interaction baseline before the isolated final home About brand-card correction.'
e['finalBrandGate']=receipt
for p in sorted(dest.rglob('*')):
 if p.is_file():
  b=p.read_bytes();e['files'][str(p.relative_to(v))]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
(v/'release-evidence.json').write_text(json.dumps(e,indent=2)+'\n')
report=root/'docs/content-migration/MIGRATION_REPORT.md';s=report.read_text()
s=s.replace('The resumed final gate `20261103T101612-48b273b939`','The resumed full interaction gate `20261103T101612-48b273b939`')
s=s.replace('All 83 source/configuration/test inputs retained their hashes through the\nfinal gate.','All 83 source/configuration/test inputs retained their hashes through the\nfull interaction gate.')
extra='''### Final brand-card correction

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

'''
assert '### Final brand-card correction' not in s
s=s.replace('Commands for a verified checkout:\n',extra+'Commands for a verified checkout:\n')
s=s.replace('env QA_PORT=14329 node scripts/content-visual-qa.mjs\n','env QA_PORT=14329 node scripts/content-visual-qa.mjs\nenv QA_PORT=14330 node scripts/content-brand-qa.mjs\n')
report.write_text(s)
checkpoint=root/'CHECKPOINT.md'
with checkpoint.open('a') as f:
 f.write('\n## 2026-11-03: final source-content release\n\n')
 f.write('The full interaction gate 20261103T101612-48b273b939 passed: 22 unit tests, 16 groups per Chromium/WebKit/Firefox, 18 visual groups, complete output audit. A final standalone old logo in the homepage About card was replaced with the existing Luxury Realty identity. Fresh typecheck/test/build/output audit and a scoped 1440/390 brand/navigation check passed; final manifest and evidence are in docs/content-migration/verification/brand/. Raw baseline log bytes are preserved in gate.log.gz. Only the authorized content/source-migration-20261103 branch is being committed/pushed for a Vercel preview; production, DNS and enquiry backend configuration are unchanged.\n')
print(json.dumps(receipt,indent=2))
PY
git add CHECKPOINT.md astro.config.mjs package.json src scripts tests docs/content-migration public/media
git diff --cached --check
python3 - <<'PY'
from pathlib import Path
import hashlib,json,subprocess
root=Path.cwd()
expected=json.loads((root/'artifacts/content-migration-brand-20261103/source-before.json').read_text())['hashes']
for p,h in expected.items():
 assert hashlib.sha256((root/p).read_bytes()).hexdigest()==h,p
 assert hashlib.sha256(subprocess.check_output(['git','show',':'+p])).hexdigest()==h,'Staged mismatch: '+p
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()=='bf0c7557313ea0bbbeda0a30382cfb3a6092c226'
print('Final staged source matches accepted manifest:',len(expected))
PY
git diff --cached --shortstat
git commit -F /tmp/luxury-content-resume-commit-20261103.txt > "$QA_OUTPUT_DIR/commit.log" 2>&1
git rev-parse HEAD | tee "$QA_OUTPUT_DIR/source-commit.txt"
git status --short
git push --set-upstream origin content/source-migration-20261103
git ls-remote origin refs/heads/content/source-migration-20261103

# External preview handshake and smoke stay in the same serialized release job.
python3 /tmp/luxury-preview-bridge-20261103.py

# The same queued job performs external acceptance after the verified preview is READY.
python3 - <<'PY'
from pathlib import Path
from urllib.parse import urlsplit
import datetime,hashlib,json,os,re,shutil,subprocess,time
root=Path.cwd();out=root/'artifacts/content-migration-brand-20261103'
expected=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
assert re.fullmatch(r'[0-9a-f]{40}',expected)
targetFile=out/'preview-target.json'
print(json.dumps({'phase':'awaiting_verified_vercel_preview','commit':expected,'targetFile':str(targetFile),'deadlineSeconds':420}),flush=True)
deadline=time.monotonic()+420
binding=None
while time.monotonic()<deadline:
 try:
  data=json.loads(targetFile.read_text())
  host=urlsplit(data.get('url','')).hostname or ''
  if (data.get('commit')==expected and data.get('projectId')=='prj_9iSUC97pBvn9DoD6blM9mAZm6dMu'
      and data.get('environment')=='preview' and data.get('readyState')=='READY'
      and data.get('deploymentId','').startswith('dpl_') and data.get('url','').startswith('https://')
      and re.fullmatch(r'luxury-realty-imon-[a-z0-9-]+\.vercel\.app',host)
      and host!='luxury-realty-imon-f29eg5j87-cdo-2844s-projects.vercel.app'):
   binding=data;break
 except (FileNotFoundError,json.JSONDecodeError,TypeError):
  pass
 time.sleep(2)
if binding is None:
 raise SystemExit('Pushed branch is preserved. No verified READY preview binding arrived within 420 seconds; public acceptance was not run.')
(out/'preview-binding-receipt.json').write_text(json.dumps(binding,indent=2)+'\n')
started=time.time()
result=subprocess.run(['python3','scripts/content-preview-smoke.py','--url',binding['url']],timeout=240)
source=root/'artifacts/content-migration/preview-smoke.json'
if source.exists() and source.stat().st_mtime>=started-1:
 shutil.copy2(source,out/'preview-smoke.json')
 report=json.loads(source.read_text())
else:
 raise SystemExit('Public smoke did not produce a fresh report.')
if result.returncode!=0 or not report.get('passed'):
 raise SystemExit('Public preview acceptance failed; see fresh preview-smoke.json.')
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==expected,'HEAD drift after publication'
before=json.loads((out/'source-before.json').read_text())['hashes']
files=[p for folder in ['src','scripts','tests'] for p in (root/folder).rglob('*') if p.is_file() and 'output' not in p.relative_to(root).parts]
files.extend(root/p for p in ['package.json','package-lock.json','astro.config.mjs'] if (root/p).exists())
after={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(files))}
assert before==after,'Final source file set or hashes changed during publication'
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':True,'commit':expected,
         'deploymentId':binding['deploymentId'],'url':binding['url'],'environment':'preview',
         'publicChecks':report['summary'],'sourceFiles':len(after),'sourceDrift':[],
         'previewSmokeSha256':hashlib.sha256((out/'preview-smoke.json').read_bytes()).hexdigest()}
(out/'release-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2),flush=True)
PY
