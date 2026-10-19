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
admin=Client('admin');staff=Client('yoon');hq=Client('hq.haru');anon=Client()
assert anon.call()[0]==401
assert anon.call('/api/session',{'role':'admin'})[0]==400
assert anon.call('/api/session',{'username':'admin','password':'bad'})[0]==401
for username in ['yoon','leehan','leebeom','parkbo','parkji','choi']:
 s=Client(username).state();assert s['user']['username']==username
 assert all(l['ownerId']==s['user']['memberId'] for l in s['leads']);assert not s['accounts']
for username,brand in [('hq.haru','a'),('hq.enfant','b'),('hq.9900','c')]:
 s=Client(username).state();assert all(l['brandId']==brand for l in s['leads']);assert not s['callbacks'] and not s['docs'] and not s['accounts'];assert all(n['scope']=='shared' for n in s['notes']);assert all(not l['nextAt'] for l in s['leads'])
 assert Client(username).call('/api/files?id=d1')[0]==404
assert hq.action(action='note',leadId=1,text='blocked',scope='shared')[0]==403
assert hq.action(action='request',leadId=21,text='blocked')[0]==404
assert staff.action(action='status',leadId=21,status='상담 중')[0]==404
assert admin.call(payload={'action':'next','leadId':1,'date':'2030-02-30T10:00'})[0]==400
assert admin.call(payload={'action':'status','leadId':1,'status':'상담 중'},origin='https://example.com')[0]==403
assert admin.call(method='DELETE')[0]==405
mark='검증-'+uuid.uuid4().hex[:8]
# Use an isolated customer to avoid changing scenario examples.
code,r=admin.action(action='createLead',brandId='a',name=mark,phone='010'+str(uuid.uuid4().int)[:8],source='전화',text='임시 문의',region='서울',startupType='신규 창업',email='sample@example.com');assert code==200,(code,r)
s=admin.state();l=next(l for l in s['leads'] if l['name']==mark);lid=l['id'];q=next(q for q in s['inquiries'] if q['leadId']==lid);assert q['raw']['창업 형태']=='신규 창업';assert l['startupType']=='신규창업'
code,r=admin.action(action='createLead',brandId='a',name=mark,phone=l['phone'],source='전화',text='중복');assert code==409 and r['existingLeadId']==lid
assert admin.action(action='profile',leadId=lid,region='경기 수원',startupType='업종 변경',budget='1억원',phone='01099999999')[0]==200
s=admin.state();assert next(x for x in s['leads'] if x['id']==lid)['startupType']=='업종변경';assert next(x for x in s['leads'] if x['id']==lid)['phone']==l['phone'];assert next(q for q in s['inquiries'] if q['leadId']==lid)['raw']['창업 형태']=='신규 창업'
assert admin.action(action='assign',ids=[lid],ownerId='s1')[0]==200
assert admin.action(action='next',leadId=lid,date='2030-10-15T09:30')[0]==200
before=admin.state();beforeNotes=len(before['notes'])
bad={'action':'note','leadId':lid,'text':'must rollback','scope':'shared','outcome':'통화 완료','next':'bad-date','status':'상담 중'}
assert admin.call(payload=bad)[0]==400;assert len(admin.state()['notes'])==beforeNotes
request=str(uuid.uuid4());payload={'action':'note','leadId':lid,'text':'상담 후 재연락','scope':'shared','outcome':'통화 완료','next':'2030-10-16T14:30','status':'상담 중','requestId':request}
assert staff.call(payload=payload)[0]==200
assert staff.call(payload=payload)[0]==200
s=admin.state();assert len(s['notes'])==beforeNotes+1
assert len([t for t in s['callbacks'] if t['leadId']==lid and t['status']=='예정'])==1
assert any(t['leadId']==lid and t['status']=='완료' for t in s['callbacks'])
assert staff.action(action='note',leadId=lid,text='단순 메모',scope='internal',outcome='메모만',next='')[0]==200
assert next(t for t in admin.state()['callbacks'] if t['leadId']==lid and t['status']=='예정')['dueAt']=='2030-10-16T14:30'
assert admin.action(action='meeting',leadId=lid,date='2030-10-18',start='14:00',end='15:00',place='상담실',title=mark)[0]==200
s=admin.state();meeting=next(m for m in s['meetings'] if m['leadId']==lid)
assert next(l for l in s['leads'] if l['id']==lid)['nextAt']=='2030-10-16T14:30'
assert admin.action(action='meeting',leadId=lid,date='2030-10-18',start='14:30',end='15:30',place='상담실',title=mark)[0]==409
assert admin.action(action='meetingUpdate',id=meeting['id'],meetingStatus='예정',date='2030-10-19',start='15:00',end='16:00',reason='고객 요청 연기')[0]==200
assert admin.action(action='meetingUpdate',id=meeting['id'],meetingStatus='완료',reason='미팅 후 조건 검토')[0]==200
s=admin.state();assert next(l for l in s['leads'] if l['id']==lid)['status']=='상담 중';assert len(next(m for m in s['meetings'] if m['id']==meeting['id'])['history'])==3
assert admin.action(action='inquiry',leadId=lid,source='전화',text='재문의 사례')[0]==200
assert len([q for q in admin.state()['inquiries'] if q['leadId']==lid])==2
assert admin.action(action='assign',ids=[lid],ownerId='s3')[0]==200
s=admin.state();assert next(t for t in s['callbacks'] if t['leadId']==lid and t['status']=='예정')['ownerId']=='s3'
assert not any(l['id']==lid for l in staff.state()['leads'])
# Multiple-brand HQ; no access to the third brand.
username='test.hq.'+uuid.uuid4().hex[:6]
assert admin.action(action='account',username=username,name='복수 브랜드 본사',role='client',brandIds=['a','b'],password='Test-only-password-219!',active=True)[0]==200
c=Client();assert c.call('/api/session',{'username':username,'password':'Test-only-password-219!'})[0]==200
assert {b['id'] for b in c.state()['brands']}=={'a','b'}
assert not any(l['brandId']=='c' for l in c.state()['leads'])
# Deactivation invalidates an existing authenticated session immediately.
a=next(a for a in admin.state()['accounts'] if a['username']==username)
assert admin.action(action='account',id=a['id'],username=username,name=a['name'],role='client',brandIds=['a','b'],active=False)[0]==200
assert c.call()[0]==401
con=sqlite3.connect(next(p for p in glob.glob('.local/test/v3/d1/miniflare-D1DatabaseObject/*.sqlite') if not p.endswith('metadata.sqlite')))
for sql in ["UPDATE notes SET data='{}' WHERE id='n1-0'","DELETE FROM notes WHERE id='n1-0'","DELETE FROM inquiries WHERE id='q1'","UPDATE inquiries SET data=json_set(data,'$.raw.성함','변경') WHERE id='q1'","DELETE FROM activities WHERE id='scenario-assignment-s1'"]:
 try:con.execute(sql);raise AssertionError('immutable history allowed mutation')
 except sqlite3.IntegrityError:con.rollback()
assert all(len(row[0])==64 for row in con.execute('SELECT password_hash FROM accounts'));con.close()
# Development stays untouched by the test's added customer.
devpath=next(p for p in glob.glob('.local/development/v3/d1/miniflare-D1DatabaseObject/*.sqlite') if not p.endswith('metadata.sqlite'))
assert dev_snapshot()==dev_before
print('PASS: login for all roles; session security; brand isolation; atomic note/followup; idempotency; dates; calendar conflicts/reschedule/completion; reassignment; repeat inquiries; account deactivation; immutable history; development/test isolation')
