import json,urllib.request,urllib.error,sqlite3,glob,uuid,http.cookiejar,datetime
import tempfile,shutil,pathlib
BASE='http://127.0.0.1:4318'
devpath=next(p for p in glob.glob('.local/development/v3/d1/miniflare-D1DatabaseObject/*.sqlite') if not p.endswith('metadata.sqlite'))
def dev_snapshot():
 # Inspect a stable copy: reading live WAL-mode files can require creating a shm file.
 paths=[pathlib.Path(devpath),pathlib.Path(devpath+'-wal')]
 def stamps():return [(p.stat().st_size,p.stat().st_mtime_ns) if p.exists() else None for p in paths]
 before=stamps()
 with tempfile.TemporaryDirectory() as directory:
  for p in paths:
   if p.exists():shutil.copy2(p,pathlib.Path(directory)/p.name)
  assert stamps()==before, 'Development DB changed during snapshot; retry the check'
  with sqlite3.connect(str(pathlib.Path(directory)/paths[0].name)) as c:
   return {t:c.execute('SELECT * FROM '+t+' ORDER BY id').fetchall() for t in ['leads','notes','inquiries','activities','meetings','callbacks']}
dev_before=dev_snapshot()
accounts=json.load(open('.local/test-accounts.json'));accounts={a['username']:a for a in accounts}
class Client:
 def __init__(self,username=None):
  self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
  if username:
   a=accounts[username];assert self.call('/api/session',{'username':username,'password':a['password']})[0]==200
 def call(self,path='/api/crm',payload=None,origin=BASE,method=None):
  h={}
  if payload is not None:h={'Content-Type':'application/json','Origin':origin}
  req=urllib.request.Request(BASE+path,data=json.dumps(payload).encode() if payload is not None else None,headers=h,method=method)
  try:
   with self.op.open(req) as r:return r.status,json.load(r)
  except urllib.error.HTTPError as e:return e.code,json.load(e) if e.headers.get('Content-Type','').startswith('application/json') else {}
 def action(self,**payload):return self.call(payload=payload)
 def state(self):return self.call()[1]

admin=Client('admin'); staff=Client('yoon')
assert admin.state()['environment']=='test'
mark=uuid.uuid4().hex[:8]
brand_ids=[]
for i,services in enumerate([['일반 광고대행'],['영업대행'],['일반 광고대행','영업대행']]):
 name='인트라넷 검증-'+mark+'-'+str(i)
 code,r=admin.action(action='brand',name=name,company='테스트 회사',services=services,active=True)
 assert code==200,(code,r)
 brand=next(b for b in admin.state()['brands'] if b['name']==name)
 assert brand['services']==services
 brand_ids.append(brand['id'])
for invalid in [[],['unknown'],['영업대행','영업대행'],'영업대행']:
 assert admin.action(action='brand',name='invalid',company='test',services=invalid)[0]==400
assert staff.action(action='brand',name='blocked',company='test',services=['영업대행'])[0]==403
username='portal.'+mark
assert admin.action(action='account',username=username,name='테스트 고객사',role='client',brandIds=brand_ids[:2],password='Test-only-password-219!',active=True)[0]==200
client=Client()
assert client.call('/api/session',{'username':username,'password':'Test-only-password-219!'})[0]==200
s=client.state()
assert {b['id'] for b in s['brands']}==set(brand_ids[:2])
assert not s['accounts'] and not s['callbacks'] and not s['docs'] and not s['recontactLeads']
assert client.action(action='brand',name='blocked',company='test',services=['영업대행'])[0]==403
assert client.action(action='account',username='blocked.'+mark,name='blocked',role='admin',password='Test-only-password-219!',active=True)[0]==403
assert client.action(action='request',leadId=21,text='cross brand blocked')[0]==404
account=next(a for a in admin.state()['accounts'] if a['username']==username)
assert admin.action(action='account',id=account['id'],username=username,name=account['name'],role='client',brandIds=[brand_ids[0]],active=True)[0]==200
assert client.call()[0]==401
assert client.call('/api/session',{'username':username,'password':'Test-only-password-219!'})[0]==200
assert {b['id'] for b in client.state()['brands']}=={brand_ids[0]}
assert admin.action(action='account',id=account['id'],username=username,name=account['name'],role='client',brandIds=[brand_ids[0]],active=False)[0]==200
assert client.call()[0]==401
assert dev_snapshot()==dev_before
print('PASS: agency categories persist; invalid categories rejected; issued accounts see selected brands only; staff/client admin actions blocked; scope changes revoke sessions; development data unchanged')
