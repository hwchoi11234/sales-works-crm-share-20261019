"""Company CRM permissions and full call/assignment flow; isolated test DB only."""
import json,urllib.request,urllib.error,http.cookiejar,uuid,datetime,pathlib,sqlite3,tempfile,shutil,glob
BASE='http://127.0.0.1:4318'
def snapshot_dev():
 source=next(p for p in glob.glob('.local/development/v3/d1/miniflare-D1DatabaseObject/*.sqlite') if not p.endswith('metadata.sqlite'))
 paths=[pathlib.Path(source),pathlib.Path(source+'-wal')]
 def stamps(): return [(p.stat().st_size,p.stat().st_mtime_ns) if p.exists() else None for p in paths]
 before=stamps()
 with tempfile.TemporaryDirectory() as folder:
  for p in paths:
   if p.exists(): shutil.copy2(p,pathlib.Path(folder)/p.name)
  assert before==stamps()
  with sqlite3.connect(str(pathlib.Path(folder)/paths[0].name)) as db:
   return {t:db.execute('SELECT * FROM '+t+' ORDER BY id').fetchall() for t in ['accounts','members','leads','notes','inquiries','activities','meetings','callbacks']}
before=snapshot_dev()
class Client:
 def __init__(self,user=None,password=None):
  self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
  if user: assert self.call('/api/session',dict(username=user,password=password))[0]==200,user
 def call(self,path='/api/crm',payload=None):
  req=urllib.request.Request(BASE+path,data=json.dumps(payload).encode() if payload is not None else None,headers={'Content-Type':'application/json','Origin':BASE})
  try:
   with self.op.open(req) as r:return r.status,json.load(r)
  except urllib.error.HTTPError as e:return e.code,json.load(e)
 def state(self):
  code,r=self.call();assert code==200,(code,r);return r
 def do(self,**b):
  code,r=self.call(payload=b);assert code==200,(b,code,r);return r
 def deny(self,expected=403,**b):
  code,r=self.call(payload=b);assert code==expected,(b,code,r)
root=next(a for a in json.load(open('.local/test-accounts.json')) if a['username']=='admin')
a=Client(root['username'],root['password']); assert a.state()['environment']=='test'
mark=uuid.uuid4().hex[:8]; password='test1234'
br=[]
for n,svc in [('a',['일반 광고대행']),('a2',['일반 광고대행']),('b',['일반 광고대행']),('sales',['영업대행']),('mixed',['일반 광고대행','영업대행'])]:
 name='회사권한-'+mark+'-'+n;a.do(action='brand',name=name,company=name,services=svc)
 br.append(next(b['id'] for b in a.state()['brands'] if b['name']==name))
for name,brands,role in [('a',br[:2],'client_admin'),('b',[br[2]],'client_admin'),('sales',[br[3]],'client')]:
 a.do(action='account',username=mark+'.'+name,name='회사'+name,role=role,brandIds=brands,password=password)
a.deny(400,action='account',username=mark+'.invalid',name='잘못된권한',role='client_admin',brandIds=[br[3]],password=password)
a.deny(400,action='account',username=mark+'.mixed',name='혼합권한',role='client_admin',brandIds=[br[4]],password=password)
a.deny(409,action='account',username=mark+'.overlap',name='중복소유',role='client_admin',brandIds=[br[0]],password=password)
ca=Client(mark+'.a',password);cb=Client(mark+'.b',password);sales=Client(mark+'.sales',password)
assert {b['id'] for b in ca.state()['brands']}==set(br[:2])
assert not ca.state()['docs'] and not ca.state()['recontactLeads']
for obj in [ca,cb]:
 obj.deny(action='account',username='escalate',role='admin',password=password,name='공격')
 obj.deny(action='brand',name='불가',company='불가',services=['일반 광고대행'])
 obj.deny(action='statusOption',name='불가')
 obj.deny(action='claimRecontact',leadId=1)
for i in [1,2]: ca.do(action='companyEmployee',username=f'{mark}.staff{i}',name=f'회사A 직원{i}',password=password,brandIds=br[:2])
cb.do(action='companyEmployee',username=mark+'.foreign',name='회사B 직원',password=password,brandIds=[br[2]])
accounts=ca.state()['accounts']; assert len(accounts)==2
employee=next(u for u in accounts if u['username'].endswith('staff1')); second=next(u for u in accounts if u['username'].endswith('staff2'))
foreign=cb.state()['accounts'][0]
ca.deny(404,action='companyEmployee',id=foreign['id'],username='hijack',name='불가',brandIds=br[:1])
ca.deny(400,action='companyEmployee',username='outofscope',name='불가',password=password,brandIds=[br[2]])
ca.deny(400,action='companyEmployee',username='escalate',name='불가',password=password,brandIds=br[:1],role='admin')
ca.deny(400,action='companyEmployee',username='hijack',name='불가',password=password,brandIds=br[:1],memberId=foreign['memberId'])
sales.deny(action='companyEmployee',username='salesstaff',name='불가',brandIds=[br[3]],password=password)
e=Client(employee['username'],password);e2=Client(second['username'],password)
assert not e.state()['leads'] and not e.state()['accounts']
for who,brand,suffix in [(ca,br[0],'001'),(ca,br[1],'002'),(cb,br[2],'003'),(a,br[3],'004')]:
 who.do(action='createLead',brandId=brand,name='권한검증'+suffix,phone='01000009'+suffix,source='전화',text='검증 문의',region='서울',startupType='신규창업')
leads=ca.state()['leads'];lid=next(l['id'] for l in leads if l['brandId']==br[0]);lid2=next(l['id'] for l in leads if l['brandId']==br[1]);flid=cb.state()['leads'][0]['id']
ca.deny(400,action='assign',ids=[lid],ownerId=foreign['memberId'])
ca.deny(400,action='assign',ids=[flid],ownerId=employee['memberId'])
ca.do(action='assign',ids=[lid],ownerId=employee['memberId'])
assert [l['id'] for l in e.state()['leads']]==[lid]
e.deny(action='assign',ids=[lid],ownerId=second['memberId'])
e.deny(action='companyEmployee',id=second['id'],username=second['username'],name='불가',brandIds=br[:2])
e.deny(404,action='note',leadId=lid2,text='불가',scope='shared')
cb.deny(404,action='note',leadId=lid,text='불가',scope='shared')
nextday=(datetime.datetime.now()+datetime.timedelta(days=3)).strftime('%Y-%m-%d')
payload=dict(action='note',leadId=lid,text='통화 후 자료 안내',scope='shared',outcome='통화 완료',status='상담 중',next=nextday+'T14:00',followupMode='replace',requestId=str(uuid.uuid4()))
e.do(**payload); assert e.do(**payload).get('replayed')
e.do(action='meeting',leadId=lid,date=nextday,start='15:00',end='16:00',place='본사',title='가맹 상담')
s=e.state();assert len(s['notes'])==1 and len(s['callbacks'])==1 and len(s['meetings'])==1
assert ca.state()['notes'][0]['text']=='통화 후 자료 안내'
a.do(action='note',leadId=lid,text='내부 전용 비공개 기록',scope='internal')
assert all(n['text']!='내부 전용 비공개 기록' for n in ca.state()['notes'])
e.do(action='note',leadId=lid,text='고객사 내부 메모',scope='internal')
assert any(n['text']=='고객사 내부 메모' for n in ca.state()['notes'])
ca.deny(409,action='companyEmployee',id=employee['id'],username=employee['username'],name=employee['name'],brandIds=br[:2],active=False)
ca.do(action='assign',ids=[lid],ownerId=second['memberId'])
assert not e.state()['leads']; e.deny(404,action='status',leadId=lid,status='종료')
s=e2.state(); assert len(s['notes'])==2 and s['callbacks'][0]['ownerId']==second['memberId'] and s['meetings'][0]['ownerId']==second['memberId']
e2.do(action='meetingUpdate',id=s['meetings'][0]['id'],date=nextday,start='16:00',end='17:00',meetingStatus='예정',reason='시간변경')
ca.do(action='companyEmployee',id=employee['id'],username=employee['username'],name='퇴사직원',brandIds=br[:2],active=False)
assert e.call()[0]==401
assert e.call('/api/session',dict(username=employee['username'],password=password))[0]==401
# Current parent scope is authoritative for an already logged-in employee.
parent=next(u for u in a.state()['accounts'] if u['username']==mark+'.a')
a.do(action='account',id=parent['id'],username=parent['username'],name=parent['name'],role='client_admin',brandIds=[br[1]])
assert not e2.state()['leads'] and {b['id'] for b in e2.state()['brands']}=={br[1]}
a.do(action='account',id=parent['id'],username=parent['username'],name=parent['name'],role='client_admin',brandIds=[br[1]],active=False)
assert e2.call()[0]==401
assert e2.call('/api/session',dict(username=second['username'],password=password))[0]==401
saleslead=sales.state()['leads'][0]['id']
for action in ['note','status','meeting','assign','createLead']:
 sales.deny(action=action,leadId=saleslead,text='불가')
sales.do(action='request',leadId=saleslead,text='기존 요청 기능 확인')
assert before==snapshot_dev(), 'Development database changed during test run'
print('PASS company CRM: two-company and multi-brand isolation, employee creation/edit/deactivation, role escalation blocked, scoped leads, immutable call save/retry, callbacks+meetings, reassignment handoff, parent scope/deactivation, sales read-only; development DB unchanged')
