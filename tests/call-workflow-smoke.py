"""Atomic live-call workflows on the isolated 4318 test database."""
import uuid,datetime
from api_smoke_support import Client
admin,staff=Client('admin'),Client('yoon')
assert admin.state()['environment']=='test', 'Call workflow writes require the isolated test environment'
mark='통화흐름-'+uuid.uuid4().hex[:6]
used={m['date'] for m in admin.state()['meetings']}
day=datetime.date(2032,5,1)
while day.isoformat() in used:day+=datetime.timedelta(days=1)
meeting_day=day.isoformat()
assert admin.action(action='createLead',brandId='a',name=mark,phone='010'+str(uuid.uuid4().int)[:8],source='전화',text='시나리오 테스트')[0]==200
lead=next(l for l in admin.state()['leads'] if l['name']==mark);lid=lead['id']
assert admin.action(action='assign',ids=[lid],ownerId='s1')[0]==200
assert admin.action(action='next',leadId=lid,date='2032-04-10T10:00')[0]==200
def note(**kw):
 payload=dict(action='note',leadId=lid,text='통화 내용',scope='shared',outcome='통화 완료',status='상담 중',next='',followupMode='keep',requestId=str(uuid.uuid4()))
 payload.update(kw);return staff.action(**payload)
def callbacks():return [t for t in admin.state()['callbacks'] if t['leadId']==lid and t['status']=='예정']
assert note()[0]==200
assert callbacks()[0]['dueAt']=='2032-04-10T10:00'
# Processing a due callback is distinct from preserving a future appointment.
assert admin.action(action='next',leadId=lid,date='2020-01-01T10:00')[0]==200
due_id=callbacks()[0]['id']
assert note(outcome='메모만',followupMode='complete')[0]==200
assert callbacks()[0]['id']==due_id
assert note(followupMode='keep')[0]==200
assert callbacks()[0]['id']==due_id
assert note(followupMode='complete')[0]==200
assert callbacks()==[]
assert next(t for t in admin.state()['callbacks'] if t['id']==due_id)['status']=='완료'
assert admin.action(action='next',leadId=lid,date='2032-04-10T10:00')[0]==200
assert note(outcome='메모만',status='종료',followupMode='complete')[0]==200
assert callbacks()[0]['dueAt']=='2032-04-10T10:00'
assert next(l for l in admin.state()['leads'] if l['id']==lid)['status']=='상담 중'
assert note(outcome='부재',text='',followupMode='replace',next='2032-04-11T10:00')[0]==200
assert len(callbacks())==1 and callbacks()[0]['dueAt']=='2032-04-11T10:00'
assert note(followupMode='replace',next='2020-01-01T10:00')[0]==400
assert note(status='종료')[0]==400
assert note(followupMode='replace',next='')[0]==400
assert admin.action(action='meeting',leadId=lid,date=meeting_day,start='14:00',end='15:00',title='기존 미팅',place='본사')[0]==200
meeting=dict(date=meeting_day,start='14:30',end='15:30',place='본사',title='상담 미팅')
before=admin.state();beforeNotes=len(before['notes']);beforeMeetings=len(before['meetings'])
assert note(followupMode='meeting',meeting=meeting)[0]==409
s=admin.state();assert len(s['notes'])==beforeNotes and len(s['meetings'])==beforeMeetings
assert callbacks()[0]['dueAt']=='2032-04-11T10:00'
assert note(followupMode='meeting',meeting={**meeting,'start':'16:00','end':'15:30'})[0]==400
assert len(admin.state()['notes'])==beforeNotes
req=str(uuid.uuid4());valid={**meeting,'start':'16:00','end':'17:00'}
assert note(followupMode='meeting',meeting=valid,requestId=req)[0]==200
retry=note(followupMode='meeting',meeting=valid,requestId=req)
assert retry[0]==200 and retry[1]['replayed'] is True
s=admin.state();assert len(s['notes'])==beforeNotes+1 and len(s['meetings'])==beforeMeetings+1
assert callbacks()==[]
assert next(l for l in s['leads'] if l['id']==lid)['status']=='미팅 예정'
assert next(n for n in s['notes'] if n['id']==req)['text']=='통화 내용'
assert next(e for e in s['meetings'] if e['leadId']==lid and e['start']=='16:00')['ownerId']=='s1'
print('PASS: keep callback, memo-only preserves state, missed call/reschedule, past date rejection, terminal-status guard, atomic meeting conflict rollback, one-save meeting creation and idempotent retry')
print('UI scenario customer:',mark)

# Reusing an acknowledged request with edited content must never silently succeed.
before=admin.state()
changed=note(followupMode='meeting',meeting=valid,requestId=req,text='응답 유실 뒤 바꾼 내용')
assert changed[0]==409 and changed[1]['alreadySaved'] is True
after=admin.state()
for collection in ['notes','meetings','callbacks','activities']:
 assert before[collection]==after[collection], collection

# Both copies of the same concurrent request must resolve to one immutable record.
from concurrent.futures import ThreadPoolExecutor
same_id=str(uuid.uuid4())
def concurrent_note(_):
 return Client('yoon').action(action='note',leadId=lid,scope='shared',outcome='메모만',text='동시 저장 중복 방지',requestId=same_id)
with ThreadPoolExecutor(max_workers=2) as pool:
 results=list(pool.map(concurrent_note,range(2)))
assert all(r[0]==200 for r in results), results
assert any(r[1].get('replayed') for r in results)
assert len([n for n in admin.state()['notes'] if n['id']==same_id])==1
print('PASS: changed-payload replay is 409 with no writes; concurrent identical requests save once')
