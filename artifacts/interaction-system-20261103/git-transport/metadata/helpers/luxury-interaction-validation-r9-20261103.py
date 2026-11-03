from pathlib import Path
import hashlib,json,os,subprocess,sys,time
root=Path('/home/sergey/Projects/LuxuryRealty-visual-20261103')
output=root/'artifacts/interaction-system-20261103/validation-r9'
output.mkdir(parents=True,exist_ok=False)
env={**os.environ,'PATH':'/opt/imon-runtime/node/bin:'+os.environ.get('PATH',''),'ASTRO_TELEMETRY_DISABLED':'1','CI':'1','PLAYWRIGHT_BROWSERS_PATH':'/home/sergey/.cache/ms-playwright','PLAYWRIGHT_PACKAGE':'/home/sergey/.local/share/imon-toolkit/node/node_modules/playwright/package.json'}
def snapshot():
 files=sorted([p for folder in ('src','scripts','tests') for p in (root/folder).rglob('*') if p.is_file()]+[root/n for n in ('package.json','package-lock.json','astro.config.mjs')])
 return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
before=snapshot()
report={'startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sourceHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'sourceBefore':before,'stages':[],'complete':False,'passed':False}
prior=json.loads((root/'artifacts/interaction-system-20261103/validation-r8/report.json').read_text())
changed=[name for name in sorted(set(before)|set(prior['sourceAfter'])) if before.get(name)!=prior['sourceAfter'].get(name)]
assert changed==['scripts/interaction-system-qa.mjs'],changed
inherited=[s for s in prior['stages'] if s['name'] in ('check','build','content-output','gallery-chromium')]
assert len(inherited)==4 and all(s['exitCode']==0 for s in inherited)
report['inheritedValidation']={'report':'artifacts/interaction-system-20261103/validation-r8/report.json','sourceHead':prior['sourceHead'],'sourceDelta':changed,'reason':'Only animation observation changed; runtime and built assets remain identical. Gallery Chromium and build gates retain exact prior receipts.','stages':inherited,'chromiumFocused':prior['inheritedChromiumFocused']}
steps=[
 ('targeted-webkit',['/opt/imon-runtime/node/bin/node','scripts/interaction-system-qa.mjs'],{'ENGINE':'webkit','QA_STAGE':'focused','QA_CASES':'home','QA_WIDTHS':'320','QA_MOTIONS':'no-preference','QA_FAIL_FAST':'1','QA_STATIC_ROOT':'.vercel/output/static','QA_OUTPUT_DIR':'artifacts/interaction-system-20261103/targeted-webkit-r2'},300),
 ('all-pages',['/opt/imon-runtime/node/bin/node','scripts/interaction-system-qa.mjs'],{'ENGINE':'chromium','QA_STAGE':'all-pages','QA_STATIC_ROOT':'.vercel/output/static','QA_EXPECTED_HEAD':report['sourceHead'],'QA_OUTPUT_DIR':'artifacts/interaction-system-20261103/all-pages-chromium-r1'},1950),
 ('review-sheets',['/usr/local/bin/imon-python','/tmp/luxury-ux-review-sheets.py','--report','artifacts/interaction-system-20261103/all-pages-chromium-r1/visual-audit-report.json','--out','artifacts/interaction-system-20261103/all-pages-chromium-r1/review-sheets'],{},600),
 ('focused-webkit',['/opt/imon-runtime/node/bin/node','scripts/interaction-system-qa.mjs'],{'ENGINE':'webkit','QA_STAGE':'focused','QA_FAIL_FAST':'1','QA_STATIC_ROOT':'.vercel/output/static','QA_OUTPUT_DIR':'artifacts/interaction-system-20261103/focused-webkit-r5'},1200)
]
try:
 for name,argv,extra,timeout in steps:
  if snapshot()!=before:raise RuntimeError('Source changed before '+name)
  print('START '+name,flush=True)
  start=time.monotonic();log=output/(name+'.log')
  with log.open('w') as stream:
   result=subprocess.run(argv,cwd=root,env={**env,**extra},stdout=stream,stderr=subprocess.STDOUT,timeout=timeout)
  report['stages'].append({'name':name,'exitCode':result.returncode,'seconds':round(time.monotonic()-start,2),'log':str(log.relative_to(root))})
  (output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
  print('END '+name+' exit='+str(result.returncode),flush=True)
  print(log.read_text(errors='replace')[-2200:],flush=True)
  if result.returncode:break
 report['complete']=len(report['stages'])==len(steps)
except Exception as error:
 report['error']=str(error)
finally:
 report['sourceAfter']=snapshot();report['sourceUnchanged']=report['sourceAfter']==before
 report['finishedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
 report['passed']=report['complete'] and report['sourceUnchanged'] and all(s['exitCode']==0 for s in report['stages']) and not report.get('error')
 (output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print('VALIDATION '+('PASS' if report['passed'] else 'FAIL'),flush=True)
sys.exit(0 if report['passed'] else 1)
