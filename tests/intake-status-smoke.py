"""Only isolated local test DB at 4318; never uses development credentials."""
import uuid, concurrent.futures
from api_smoke_support import Client
admin, staff, hq = Client('admin'), Client('yoon'), Client('hq.haru')
mark = '분류검증-' + uuid.uuid4().hex[:8]
phone = '010' + str(uuid.uuid4().int)[:8]
meta = '010-0000-9900'
def create(brand, number=phone, name=mark, **extra):
 return admin.action(action='createLead',brandId=brand,name=name,phone=number,region='서울 강남구',startupType='샵인샵',source='메타 · 구글시트',text='격리 테스트 데이터',metaAutoPhone=meta,**extra)
assert create('a')[0] == 200
assert create('b', '+82 ' + phone[1:])[0] == 200
s = admin.state()
a = next(l for l in s['leads'] if l['name']==mark and l['brandId']=='a')
b = next(l for l in s['leads'] if l['name']==mark and l['brandId']=='b')
assert a['id'] != b['id'] and a['phone']==b['phone']==phone
q = next(q for q in s['inquiries'] if q['leadId']==a['id'])
assert q['metaAutoPhone']==meta and q['raw']['연락처']==phone
assert create('a', phone[:3]+'-'+phone[3:7]+'-'+phone[7:])[0] == 409
assert create('a', '0082'+phone[1:])[0] == 409
assert create('a', '010'+str(uuid.uuid4().int)[:8], mark+'-다른고객')[0]==200 # same Meta prefill never merges two main contacts
owner = next(m['id'] for m in s['members'] if m['active'] and 'b' in m['brands'] and m['id']!='s1')
assert admin.action(action='assign',ids=[a['id']],ownerId='s1')[0] == 200
assert admin.action(action='assign',ids=[b['id']],ownerId=owner)[0] == 200
assert next(l for l in admin.state()['leads'] if l['id']==a['id'])['ownerId']=='s1'
assert next(l for l in admin.state()['leads'] if l['id']==b['id'])['ownerId']==owner
assert any(l['id']==a['id'] for l in staff.state()['leads'])
assert not any(l['id']==b['id'] for l in staff.state()['leads'])
assert staff.action(action='status',leadId=b['id'],status='상담 중')[0]==404
assert not any(l['id']==b['id'] for l in hq.state()['leads'])
assert not any(q['leadId']==b['id'] for q in hq.state()['inquiries'])
assert admin.action(action='status',leadId=a['id'],status='부동산 임장중')[0]==200
custom = '점포 확인 ' + uuid.uuid4().hex[:6]
assert staff.action(action='statusOption',name=custom)[0]==403
assert hq.action(action='statusOption',name=custom)[0]==403
assert admin.action(action='statusOption',name=custom)[0]==200
assert any(o['name']==custom and o['active'] for o in Client('admin').state()['statusOptions'])
assert admin.action(action='statusOption',name=custom.replace(' ',''))[0]==409
assert admin.action(action='statusOptionToggle',name='신규',active=False)[0]==400
assert staff.action(action='statusOptionToggle',name=custom,active=False)[0]==403
assert staff.action(action='note',leadId=a['id'],text='임장 상담',scope='shared',outcome='통화 완료',status=custom,next='')[0]==200
assert admin.action(action='statusOptionToggle',name=custom,active=False)[0]==200
assert next(l for l in admin.state()['leads'] if l['id']==a['id'])['status']==custom
assert admin.action(action='status',leadId=b['id'],status=custom)[0]==400
assert staff.action(action='note',leadId=a['id'],text='기존 상태 유지',scope='shared',outcome='통화 완료',status=custom,next='')[0]==200
assert admin.action(action='statusOptionToggle',name=custom,active=True)[0]==200
assert admin.action(action='status',leadId=b['id'],status=custom)[0]==200
assert admin.action(action='status',leadId=b['id'],status='알 수 없는 상태')[0]==400
assert next(q for q in admin.state()['inquiries'] if q['leadId']==a['id'])==q
racephone = '010'+str(uuid.uuid4().int)[:8]
clients = [Client('admin'), Client('admin')]
def concurrent_create(i):
 return clients[i].action(action='createLead',brandId='c',phone=racephone,name=mark+'-동시',source='전화',text='중복 동시 접수')[0]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 results=list(pool.map(concurrent_create, [0,1]))
assert sorted(results)==[200,409],results
assert len([l for l in admin.state()['leads'] if l['brandId']=='c' and l['phone']==racephone])==1
print('PASS: same-brand dedup and concurrent intake; cross-brand independent assignment and permissions; Meta prefill preserved separately; admin status creation, persistence, retirement, reactivation, and immutable history')
