"""Provision explicitly requested local demo accounts; never contacts a remote server.
Run with development/test and pass {"password": "..."} on stdin. No history resets.
"""
import sys,json,pathlib,urllib.request,urllib.error,http.cookiejar,hashlib,datetime
ROOT=pathlib.Path(__file__).resolve().parents[1]
target=sys.argv[1] if len(sys.argv)>1 else ''
if target not in ('development','test'):raise SystemExit('Local environments only')
base='http://127.0.0.1:'+('4317' if target=='development' else '4318')
password=json.load(sys.stdin)['password']
assert isinstance(password,str) and 4<=len(password)<=200
sales=['마라인더컵','딩딩파파','번쩍피자','기와옥순두부','타이요','듀담','구천구백닭강정','앙팡프리슈','일익스프레스']
ads=['바른보쌈','대한국밥만세','청춘꼬마김밥','샤브온당','뽁당','혼감탕','카페시그니처','인생아구찜']
class Client:
 def __init__(self):self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 def call(self,path='/api/crm',payload=None):
  req=urllib.request.Request(base+path,data=json.dumps(payload).encode() if payload is not None else None,headers={'Content-Type':'application/json','Origin':base})
  try:
   with self.op.open(req) as r:return r.status,json.load(r)
  except urllib.error.HTTPError as e:return e.code,json.load(e)
 def ok(self,path='/api/crm',payload=None):
  code,result=self.call(path,payload)
  if code!=200:raise RuntimeError(str(code)+' '+str(result))
  return result
 def login(self,username,password):self.ok('/api/session',{'username':username,'password':password})
 def logout(self):self.ok('/api/session',{'action':'logout'})
admin=Client()
bootstrap=next(a for a in json.loads((ROOT/'.local'/f'{target}-accounts.json').read_text()) if a['role']=='admin')
admin.login(bootstrap['username'],bootstrap['password'])
before=admin.ok();assert before['environment']==target
# Preserve all customer history byte-for-byte at the API level (array order may vary).
def history(state):
 return {key:hashlib.sha256(json.dumps(sorted(state[key],key=lambda x:str(x['id'])),sort_keys=True,ensure_ascii=False).encode()).hexdigest() for key in ['leads','notes','inquiries','meetings','callbacks','activities','members','docs']}
original=history(before)
state=before
issued=[]
for name,service in [(n,'영업대행') for n in sales]+[(n,'일반 광고대행') for n in ads]:
 matches=[b for b in state['brands'] if b['name']==name]
 if len(matches)>1:raise RuntimeError('Ambiguous existing brand: '+name)
 old=matches[0] if matches else None
 admin.ok(payload={'action':'brand','id':old['id'] if old else None,'name':name,'company':old['company'] if old else '본사명 미등록','services':[service],'active':True})
 state=admin.ok();brand=next(b for b in state['brands'] if b['name']==name)
 assert brand['services']==[service]
 existing=next((a for a in state['accounts'] if a['username']==name),None)
 account_role='client_admin' if service=='일반 광고대행' else 'client'
 if existing and (existing['role'] not in ('client',account_role) or existing['brandIds']!=[brand['id']]):raise RuntimeError('Existing account scope mismatch: '+name)
 admin.ok(payload={'action':'account','id':existing['id'] if existing else None,'username':name,'name':name+' 본사','role':account_role,'brandIds':[brand['id']],'password':password,'active':True})
 state=admin.ok()
 issued.append({'username':name,'password':password,'service':service,'role':account_role,'brandId':brand['id']})
existing=next((a for a in state['accounts'] if a['username']=='최고관리자'),None)
if existing and existing['role']!='admin':raise RuntimeError('Administrator username conflict')
admin.ok(payload={'action':'account','id':existing['id'] if existing else None,'username':'최고관리자','name':'최고관리자','role':'admin','brandIds':[],'password':password,'active':True})
after=admin.ok();assert history(after)==original,'Customer history changed'
for account in issued:
 client=Client();client.login(account['username'],password);s=client.ok()
 assert s['role']==account['role'] and {b['id'] for b in s['brands']}=={account['brandId']}
 assert all(l['brandId']==account['brandId'] for l in s['leads'])
 visible={l['id'] for l in s['leads']}
 assert all(row['leadId'] in visible for key in ['notes','inquiries','meetings','activities'] for row in s[key])
 assert not s['docs'] and not s['recontactLeads']
 if account['role']=='client':
  assert all(n['scope']=='shared' for n in s['notes'])
  assert not s['accounts'] and not s['callbacks']
 else:assert all(m.get('tenantId')==s['user']['id'] for m in s['members'])
 assert client.call(payload={'action':'brand','name':'blocked','company':'blocked'})[0]==403
 foreign=next((l for l in after['leads'] if l['brandId']!=account['brandId']),None)
 if foreign:assert client.call(payload={'action':'request' if account['role']=='client' else 'note','leadId':foreign['id'],'text':'must not save'})[0]==404
 client.logout()
superadmin=Client();superadmin.login('최고관리자',password);s=superadmin.ok()
assert s['role']=='admin' and {b['id'] for b in s['brands']}=={b['id'] for b in after['brands']}
assert len(s['accounts'])==len(after['accounts'])
superadmin.logout()
assert history(admin.ok())==original
admin.logout()
out=ROOT/'.local'/f'{target}-brand-accounts.md'
lines=['# 인트라넷 로컬 테스트 계정','','로컬 전용 · 광고대행은 자사 직원·고객 관리, 영업대행은 자사 진행 조회만 가능합니다.','','| 구분 | 아이디 | 비밀번호 |','|---|---|---|',f'| 최고관리자 | 최고관리자 | {password} |']
lines += [f"| {a['service']} | {a['username']} | {password} |" for a in issued]
out.write_text('\n'.join(lines)+'\n');out.chmod(0o600)
report={'environment':target,'brandAccounts':len(issued),'sales':len(sales),'advertising':len(ads),'administrator':'최고관리자','verifiedLogins':len(issued)+1,'historyUnchanged':True,'credentials':str(out)}
(ROOT/'.local'/f'{target}-brand-provision-result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False))
