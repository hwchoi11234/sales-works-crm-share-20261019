"""Upgrade the eight requested local advertising-company accounts; preserve all CRM data.
This uses the local authenticated API and never deploys or contacts a remote service.
"""
import sys,json,pathlib,urllib.request,urllib.error,http.cookiejar,hashlib
root=pathlib.Path(__file__).resolve().parents[1]
target=sys.argv[1] if len(sys.argv)>1 else ''
assert target in ('test','development'),'Local environments only'
base='http://127.0.0.1:'+('4318' if target=='test' else '4317')
ads=['바른보쌈','대한국밥만세','청춘꼬마김밥','샤브온당','뽁당','혼감탕','카페시그니처','인생아구찜']
admin=next(a for a in json.loads((root/'.local'/f'{target}-accounts.json').read_text()) if a['role']=='admin')
op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def call(path='/api/crm',body=None):
 req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json','Origin':base})
 try:
  with op.open(req) as r:return json.load(r)
 except urllib.error.HTTPError as e:raise RuntimeError((e.code,e.read().decode()))
call('/api/session',{'username':admin['username'],'password':admin['password']})
s=call();assert s['environment']==target
keys=['leads','inquiries','notes','meetings','callbacks','activities','members','brands','docs']
def snapshot(s):return {k:json.dumps(sorted(s[k],key=lambda x:str(x['id'])),ensure_ascii=False,sort_keys=True) for k in keys}
before=snapshot(s);changed=[]
for name in ads:
 account=next(a for a in s['accounts'] if a['username']==name)
 assert account['role'] in ['client','client_admin']
 brand=next(b for b in s['brands'] if b['name']==name)
 assert account['brandIds']==[brand['id']] and brand['services']==['일반 광고대행']
 if account['role']=='client':
  call(body={'action':'account',**account,'role':'client_admin'})
  changed.append(name)
after=call();assert snapshot(after)==before,'Existing CRM data changed'
for old in s['accounts']:
 current=next(a for a in after['accounts'] if a['id']==old['id'])
 assert current=={**old,**({'role':'client_admin'} if old['username'] in ads else {})}
call('/api/session',{'action':'logout'})
print(json.dumps({'environment':target,'upgraded':changed,'existingDataUnchanged':True},ensure_ascii=False))
