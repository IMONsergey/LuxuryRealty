from pathlib import Path
import hashlib,json,os,subprocess,sys,time,shutil
root=Path('/home/sergey/Projects/LuxuryRealty-visual-20261103')
base='https://luxury-realty-imon-jvah4quvl-cdo-2844s-projects.vercel.app'
sha='532cd2fc19dcf9ddaa1809616a47ebaee86eec88'
out=root/'artifacts/interaction-system-20261103/release-review-r2'
out.mkdir(parents=True,exist_ok=False)
env={**os.environ,'PATH':'/opt/imon-runtime/node/bin:'+os.environ.get('PATH',''),'ASTRO_TELEMETRY_DISABLED':'1','CI':'1','PLAYWRIGHT_BROWSERS_PATH':'/home/sergey/.cache/ms-playwright','PLAYWRIGHT_PACKAGE':'/home/sergey/.local/share/imon-toolkit/node/node_modules/playwright/package.json'}
def snapshot():
 files=sorted([p for folder in ('src','scripts','tests') for p in (root/folder).rglob('*') if p.is_file()]+[root/n for n in ('package.json','package-lock.json','astro.config.mjs')])
 return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
before=snapshot()
validation=json.loads((root/'artifacts/interaction-system-20261103/validation-r9/report.json').read_text())
assert validation['passed'] and validation['sourceUnchanged'],'Final validation must pass first'
assert validation['sourceAfter']==before,'Source differs from the accepted validation'
visual=json.loads((root/'artifacts/interaction-system-20261103/review-receipts/focused-stage-acceptance.json').read_text())
assert visual['sourceHead']==sha and visual['allPagesAuthorized'],'Focused sample review is required before all-pages'
coverage=json.loads((root/'artifacts/interaction-system-20261103/review-receipts/all-pages-coverage.json').read_text())
assert coverage.get('sourceHead')==sha and coverage.get('accepted') is True,'All-page human coverage must be accepted before public acceptance'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==sha,'Unexpected HEAD'
report={'startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sourceHead':sha,'sourceBefore':before,'stages':[],'complete':False,'passed':False,'preview':{'url':base,'deploymentId':'dpl_H2MyWCrNLtdrwVrVc4DCAttoJvwP','projectId':'prj_9iSUC97pBvn9DoD6blM9mAZm6dMu','teamId':'team_eJReJ6RtdOT99uZ8iGJFHX3r','branch':'feat/interaction-system-20261103','sha':sha,'stateVerified':'READY','target':'preview','bindingMethod':'Vercel get_deployment withGitRepoInfo'}}
steps=[
 ('preview-smoke',['/usr/local/bin/imon-python','scripts/content-preview-smoke.py','--url',base],{},600),
 ('public-focused',['/opt/imon-runtime/node/bin/node','scripts/interaction-system-qa.mjs'],{'ENGINE':'chromium','QA_STAGE':'public','BASE_URL':base,'QA_EXPECTED_HEAD':sha,'QA_OUTPUT_DIR':'artifacts/interaction-system-20261103/public-chromium-r1'},600)
]
try:
 for name,argv,extra,timeout in steps:
  if snapshot()!=before:raise RuntimeError('Source changed before '+name)
  print('START '+name,flush=True);start=time.monotonic();log=out/(name+'.log')
  with log.open('w') as stream:r=subprocess.run(argv,cwd=root,env={**env,**extra},stdout=stream,stderr=subprocess.STDOUT,timeout=timeout)
  report['stages'].append({'name':name,'exitCode':r.returncode,'seconds':round(time.monotonic()-start,2),'log':str(log.relative_to(root))})
  if name=='preview-smoke':
   source=root/'artifacts/content-migration/preview-smoke.json'
   if source.exists():shutil.copy2(source,out/'preview-smoke.json')
  (out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
  print('END '+name+' exit='+str(r.returncode),flush=True);print(log.read_text(errors='replace')[-1800:],flush=True)
  if r.returncode:break
 report['complete']=len(report['stages'])==len(steps)
except Exception as error:report['error']=str(error)
finally:
 report['sourceAfter']=snapshot();report['sourceUnchanged']=report['sourceAfter']==before
 report['finishedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
 report['passed']=report['complete'] and report['sourceUnchanged'] and all(s['exitCode']==0 for s in report['stages']) and not report.get('error')
 (out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print('RELEASE_REVIEW '+('PASS' if report['passed'] else 'FAIL'),flush=True)
sys.exit(0 if report['passed'] else 1)
