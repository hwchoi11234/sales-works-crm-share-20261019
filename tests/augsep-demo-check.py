"""Read back the requested demo cohort and verify every brand account's isolation."""
import sys,json,urllib.request,http.cookiejar,collections
which=sys.argv[1]
assert which in ['test','development']
base='http://127.0.0.1:'+('4318' if which=='test' else '4317')
def connect(username):
 o=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 def post(body):
  return o.open(urllib.request.Request(base+'/api/session',data=json.dumps(body).encode(),headers={'Content-Type':'application/json','Origin':base}))
 with post({'username':username,'password':'1234'}) as r:assert r.status==200
 with o.open(base+'/api/crm') as r:s=json.load(r)
 with post({'action':'logout'}) as r:assert r.status==200
 assert s['environment']==which
 return s
s=connect('최고관리자')
cohort=[l for l in s['leads'] if l.get('demoBatch')=='demo-2026-augsep-']
assert len(cohort)==340
counts=collections.Counter((l['brandId'],l['createdAt'][:7]) for l in cohort)
assert len(counts)==34 and set(counts.values())=={10}
assert collections.Counter(l['createdAt'][:7] for l in cohort)=={'2026-08':170,'2026-09':170}
ids={l['id'] for l in cohort}
assert len({l['phone'] for l in cohort})==340
assert all(l['updatedAt'][:7]==l['createdAt'][:7] and l['name'].startswith('[예시]') for l in cohort)
assert all(next(q for q in s['inquiries'] if q['leadId']==l['id'])['receivedAt']==l['createdAt'] for l in cohort)
for l in cohort:
 if l['ownerId']:assert any(m['id']==l['ownerId'] and l['brandId'] in m['brands'] for m in s['members'])
for b in s['brands']:
 if not any(l['brandId']==b['id'] for l in cohort):continue
 own=connect(b['name'])
 assert {x['id'] for x in own['brands']}=={b['id']}
 assert all(l['brandId']==b['id'] for l in own['leads'])
 assert len([l for l in own['leads'] if l.get('demoBatch')=='demo-2026-augsep-'])==20
 assert not own['docs'] and not own['recontactLeads']
 if own['role']=='client':assert not own['accounts'] and not own['callbacks']
 else:
  assert own['role']=='client_admin'
  assert all(m.get('tenantId')==own['user']['id'] for m in own['members'])
 ownids={l['id'] for l in own['leads']}
 assert all(r['leadId'] in ownids for k in ['notes','inquiries','meetings','activities'] for r in own[k])
print(json.dumps({'environment':which,'customers':len(cohort),'August':170,'September':170,'brandLoginsVerified':17,'notes':sum(n['leadId'] in ids for n in s['notes']),'meetings':sum(m['leadId'] in ids for m in s['meetings']),'callbacks':sum(c['leadId'] in ids for c in s['callbacks'])},ensure_ascii=False))
