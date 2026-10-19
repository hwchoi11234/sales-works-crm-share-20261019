"""Customer scoring mutation/privacy tests only on local test port 4318."""
import uuid,json
from api_smoke_support import Client
admin,staff,hq=Client('admin'),Client('yoon'),Client('hq.haru')
name='점수테스트-'+uuid.uuid4().hex[:6];phone='010'+str(uuid.uuid4().int)[:8]
assert admin.action(action='createLead',brandId='a',name=name,phone=phone,region='서울',startupType='신규창업',source='전화',text='격리 테스트')[0]==200
l=next(l for l in admin.state()['leads'] if l['name']==name);lid=l['id']
assert admin.action(action='assign',ids=[lid],ownerId='s1')[0]==200
answers=dict(budget=25,timing=20,property=10,intent=25)
assert hq.action(action='score',leadId=lid,answers=answers,reason='외부 변경')[0]==403
assert staff.action(action='score',leadId=lid,answers={**answers,'budget':99})[0]==400
assert staff.action(action='score',leadId=lid,answers=answers,reason='상담 후 확인')[0]==200
s=admin.state();l=next(l for l in s['leads'] if l['id']==lid);assert l['qualification']['answers']==answers and l['qualification']['reason']=='상담 후 확인'
assert any(a['kind']=='score' and a['leadId']==lid and '80점 · A' in a['text'] for a in s['activities'])
external=hq.state();assert 'qualification' not in next(l for l in external['leads'] if l['id']==lid)
assert not any(a['kind']=='score' for a in external['activities'])
stamp=l['updatedAt'];n=len([a for a in s['activities'] if a['kind']=='score' and a['leadId']==lid])
assert staff.action(action='score',leadId=lid,answers=answers,reason='상담 후 확인')[0]==200
s=admin.state();assert next(l for l in s['leads'] if l['id']==lid)['updatedAt']==stamp
assert len([a for a in s['activities'] if a['kind']=='score' and a['leadId']==lid])==n
assert staff.action(action='score',leadId=lid,answers={**answers,'intent':None},reason='추가 확인 필요')[0]==200
assert len([a for a in admin.state()['activities'] if a['kind']=='score' and a['leadId']==lid])==n+1
assert admin.action(action='assign',ids=[lid],ownerId='s3')[0]==200
assert staff.action(action='score',leadId=lid,answers=answers)[0]==404
print('PASS: ownership, role/privacy enforcement, validation, score history, no-op save and handoff access revocation.')
