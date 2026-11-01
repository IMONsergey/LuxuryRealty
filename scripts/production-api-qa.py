import json,re,sys,time,uuid,urllib.request,urllib.error
base,project=sys.argv[1:3]
base=base.rstrip('/')
def request(path,method='GET',payload=None,origin=None):
 data=None if payload is None else json.dumps(payload).encode()
 headers={'User-Agent':'RealEstateDeploymentQA/1.0'}
 if payload is not None: headers['Content-Type']='application/json'
 if origin is not None: headers['Origin']=origin
 req=urllib.request.Request(base+path,data=data,headers=headers,method=method)
 try:
  with urllib.request.urlopen(req,timeout=25) as r: return r.status,r.read().decode(),dict(r.headers)
 except urllib.error.HTTPError as e:
  if e.code in (307,308):
   location=urllib.parse.urljoin(base+path,e.headers['Location'])
   assert location.startswith(base+'/'),location
   req=urllib.request.Request(location,data=data,headers=headers,method=method)
   try:
    with urllib.request.urlopen(req,timeout=25) as r: return r.status,r.read().decode(),dict(r.headers)
   except urllib.error.HTTPError as redirected: return redirected.code,redirected.read().decode(),dict(redirected.headers)
  return e.code,e.read().decode(),dict(e.headers)
status,html,headers=request('/')
assert status==200,(status,html[:100])
report={'project':project,'url':base,'home':status,'title':re.findall(r'<title[^>]*>(.*?)</title>',html,re.S)}
status,body,_=request('/api/enquiry')
report['method']=status
assert status==405,(status,body[:200])
payload={'project':project,'context':'Production deployment verification','name':'Deployment Verification','email':'qa@example.invalid','phone':'','message':'Deployment verification, no action needed. Automated smoke test.','consent':True,'website':'','startedAt':int(time.time()*1000)-5000,'submissionId':str(uuid.uuid4())}
bad=dict(payload,consent=False)
status,body,_=request('/api/enquiry','POST',bad,base)
report['invalidConsent']=status
assert status==422,(status,body[:200])
status,body,_=request('/api/enquiry','POST',payload,'https://untrusted.example.invalid')
report['crossOrigin']=status
assert status==403,(status,body[:200])
status,body,_=request('/api/enquiry','POST',payload,base)
receipt=json.loads(body)
report['firstSubmission']=status
assert status==201 and receipt.get('ok') is True and receipt.get('id')==payload['submissionId'],(status,body[:400])
status,body,_=request('/api/enquiry','POST',payload,base)
receipt=json.loads(body)
report['idempotentRetry']=status
assert status==200 and receipt.get('ok') is True and receipt.get('id')==payload['submissionId'],(status,body[:400])
changed=dict(payload,message=payload['message']+' Changed payload.')
status,body,_=request('/api/enquiry','POST',changed,base)
report['conflictingReuse']=status
assert status==409,(status,body[:400])
report['receiptId']=payload['submissionId']
print(json.dumps(report,indent=2))
