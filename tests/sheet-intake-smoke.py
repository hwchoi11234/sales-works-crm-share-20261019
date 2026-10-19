"""Sheet import writes only isolated CRM_ENV=test on 4318."""
import uuid,concurrent.futures,json
from api_smoke_support import Client
admin=Client('admin');staff=Client('yoon');client=Client('hq.haru')
state=admin.state();brand=next(b['id'] for b in state['brands'] if b['name']=='딩딩파파')
other_before=[l for l in state['leads'] if l['brandId']!=brand]
phone='010'+str(uuid.uuid4().int)[:8];mark='시트격리-'+uuid.uuid4().hex[:6]
header='접수일자,이름,연락처,자동입력 연락처,플랫폼,창업희망지역,캠페인 ID'
row=f'2026-10-12 12:55:06,{mark},{phone},+821099998888,메타,서울,1'
csv=header+'\n'+row
def sync(csv):return admin.call('/api/sheets',{'fixture':csv})
assert staff.call('/api/sheets',{'fixture':csv})[0]==403
assert client.call('/api/sheets',{'fixture':csv})[0]==403
assert admin.call('/api/sheets',{'brandId':'a','fixture':csv})[0]==400
with concurrent.futures.ThreadPoolExecutor(2) as pool:
 results=list(pool.map(lambda _:sync(csv),range(2)))
assert all(r[0]==200 for r in results),results
assert sum(r[1]['addedLeads'] for r in results)==1,results
assert sum(r[1]['addedInquiries'] for r in results)==1,results
s=admin.state();lead=next(l for l in s['leads'] if l['name']==mark)
q=next(q for q in s['inquiries'] if q['leadId']==lead['id'])
assert lead['brandId']==brand and lead['ownerId'] is None
assert q['sourceReceivedAt']==q['receivedAt']=='2026-10-12T03:55:06.000Z'
assert q['importedAt']==lead['createdAt'] and q['importedAt']!=q['receivedAt']
assert q['raw']['접수일자']=='2026-10-12 12:55:06' and q['metaAutoPhone']=='+821099998888'
assert sync(csv)[1]['addedInquiries']==0
assert admin.action(action='status',leadId=lead['id'],status='상담 중')[0]==200
assert admin.action(action='note',leadId=lead['id'],text='기존 상담 보존 테스트',scope='shared',outcome='메모만')[0]==200
before=admin.state();old=next(l for l in before['leads'] if l['id']==lead['id'])
second=row.replace('12:55:06','13:55:06')
r=sync(header+'\n'+second+'\n'+row)
assert r[0]==200 and r[1]['addedLeads']==0 and r[1]['addedInquiries']==1,r
s=admin.state();new=next(l for l in s['leads'] if l['id']==lead['id'])
assert new['createdAt']==old['createdAt'] and new['status']=='상담 중' and new['ownerId']==old['ownerId']
assert len([q for q in s['inquiries'] if q['leadId']==lead['id']])==2
assert any(n['leadId']==lead['id'] and n['text']=='기존 상담 보존 테스트' for n in s['notes'])
modified=new['updatedAt'];assert sync(header+'\n'+row+'\n'+second)[1]['addedInquiries']==0
assert next(l for l in admin.state()['leads'] if l['id']==lead['id'])['updatedAt']==modified
changed=sync(csv.replace(mark,mark+'수정'));assert changed[0]==200 and changed[1]['changedRows']==[2],changed
assert next(l for l in admin.state()['leads'] if l['id']==lead['id'])['name']==mark
bad=sync(csv.replace('2026-10-12','2026-02-30'))
assert bad[0]==200 and len(bad[1]['invalidRows'])==1 and bad[1]['addedInquiries']==0
assert [l for l in admin.state()['leads'] if l['brandId']!=brand]==other_before
print('PASS: local admin only, brand scope, concurrent/repeated import, separate dates/phones, new inquiry, history/status preservation, reorder, changed/invalid rows.')
