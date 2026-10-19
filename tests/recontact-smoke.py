"""Lobby eligibility and atomic reassignment. Only isolated .local/test DB and port 4318."""
import uuid,sqlite3,glob,json,datetime,concurrent.futures
from api_smoke_support import Client,accounts
admin=Client('admin')
state=admin.state()
assert state['environment']=='test'
member_accounts={a.get('memberId'):a['username'] for a in accounts.values() if a['role']=='staff'}
# Account setup output has memberId; select two people authorized for one common brand.
if not all(m in member_accounts for m in ['s1','s4','s5']):
 member_accounts={a['memberId']:a['username'] for a in state['accounts'] if a['role']=='staff'}
old=Client(member_accounts['s1']); one=Client(member_accounts['s4']); two=Client(member_accounts['s5'])
client=Client(next(a['username'] for a in state['accounts'] if a['role']=='client'))
path=next(p for p in glob.glob('.local/test/v3/d1/**/*.sqlite',recursive=True) if sqlite3.connect(p).execute("SELECT count(*) FROM sqlite_master WHERE name='leads'").fetchone()[0])
assert path.startswith('.local/test/')
mark='사랑방검증-'+uuid.uuid4().hex[:6]
def free_date(start):
 used={m['date'] for m in admin.state()['meetings']}
 date=datetime.date.fromisoformat(start)
 while date.isoformat() in used:date+=datetime.timedelta(days=1)
 return date.isoformat()
future_day=free_date('2034-03-01')
past_day=free_date('2020-03-01')
now=lambda:datetime.datetime.now(datetime.timezone.utc)
iso=lambda d:d.isoformat(timespec='milliseconds').replace('+00:00','Z')
def create(suffix,brand='a',owner='s1'):
 name=mark+suffix
 assert admin.action(action='createLead',brandId=brand,name=name,phone='010'+str(uuid.uuid4().int)[:8],source='전화',text='재컨택 테스트')[0]==200
 lid=next(l['id'] for l in admin.state()['leads'] if l['name']==name)
 if owner:assert admin.action(action='assign',ids=[lid],ownerId=owner)[0]==200
 return lid
def age(lid,days=21):
 with sqlite3.connect(path,timeout=10) as c:c.execute('UPDATE leads SET updated_at=? WHERE id=?',(iso(now()-datetime.timedelta(days=days)),lid))
def pool(c):return {l['id']:l for l in c.state()['recontactLeads']}
def lead(lid):return next(l for l in admin.state()['leads'] if l['id']==lid)
lid=create('-인수');age(lid)
assert lid in pool(one) and lid not in pool(old)
assert 'phone' not in pool(one)[lid] and 'notes' not in pool(one)[lid]
assert lid not in [l['id'] for l in one.state()['leads']]
assert client.state()['recontactLeads']==[]
assert client.action(action='claimRecontact',leadId=lid)[0]==403
assert admin.action(action='claimRecontact',leadId=lid)[0]==403
assert old.action(action='claimRecontact',leadId=lid)[0]==409
# Memo is append-only; its timestamp makes an old customer ineligible immediately.
assert old.action(action='note',leadId=lid,text='인수 후에도 보존할 과거 상담',scope='internal',outcome='메모만',requestId=str(uuid.uuid4()))[0]==200
assert lid not in pool(one)
age(lid,19.999);assert lid not in pool(one)
age(lid,20);assert lid in pool(one)
oldstamp=lead(lid)['updatedAt']
q=next(q for q in old.state()['inquiries'] if q['leadId']==lid)
assert old.action(action='review',leadId=lid,id=q['id'])[0]==200
assert old.action(action='ack',id=q['id'])[0]==200
assert lead(lid)['updatedAt']==oldstamp # reads/review/ack never reset inactivity
# Future appointments and terminal status excluded even if timestamp is artificially old.
cb=create('-미래연락');assert admin.action(action='next',leadId=cb,date='2033-03-01T10:00')[0]==200;age(cb);assert cb not in pool(one)
mt=create('-미래미팅');assert admin.action(action='meeting',leadId=mt,date=future_day,start='10:00',end='11:00',place='테스트',title='예정')[0]==200;age(mt);assert mt not in pool(one)
closed=create('-종료');assert admin.action(action='status',leadId=closed,status='종료')[0]==200;age(closed);assert closed not in pool(one)
unassigned=create('-미배정',owner=None);age(unassigned);assert unassigned not in pool(one)
assert admin.action(action='next',leadId=lid,date='2020-03-01T10:00')[0]==200
assert admin.action(action='meeting',leadId=lid,date=past_day,start='10:00',end='11:00',place='과거 약속',title='미처리 과거 미팅')[0]==200
age(lid,21)
# Both staff members are allowed for brand a. Exactly one can claim.
with concurrent.futures.ThreadPoolExecutor() as executor:
 results=list(executor.map(lambda c:c.action(action='claimRecontact',leadId=lid)[0],[one,two]))
assert sorted(results)==[200,409],results
winner=one if results[0]==200 else two
assert lid not in pool(one) and lid not in pool(two)
assert lid not in [l['id'] for l in old.state()['leads']]
assert lid in [l['id'] for l in winner.state()['leads']]
assert any(n['leadId']==lid and n['text']=='인수 후에도 보존할 과거 상담' for n in winner.state()['notes'])
assert old.action(action='note',leadId=lid,text='이전 담당자 접근',scope='shared',outcome='메모만')[0]==404
assert winner.action(action='claimRecontact',leadId=lid)[0]==409
owner=lead(lid)['ownerId']
assert all(t['ownerId']==owner for t in winner.state()['callbacks'] if t['leadId']==lid and t['status']=='예정')
assert all(t['ownerId']==owner for t in winner.state()['meetings'] if t['leadId']==lid and t['status']=='예정')
assert len([a for a in admin.state()['activities'] if a['leadId']==lid and 'DB 사랑방' in a['text']])==1
assert datetime.datetime.fromisoformat(lead(lid)['updatedAt'].replace('Z','+00:00'))>now()-datetime.timedelta(minutes=1)
# Database transaction barrier rejects a staff write prepared before reassignment.
with sqlite3.connect(path) as c:
 try:c.execute('INSERT INTO lead_write_checks VALUES (?,?,?)',(str(uuid.uuid4()),lid,'s1'))
 except sqlite3.IntegrityError as e:assert 'lead_owner_changed' in str(e)
 else:raise AssertionError('stale owner write allowed')
assert winner.action(action='profile',leadId=lid,region='서울 강남',startupType='신규창업',budget='미기재')[0]==200
assert not sqlite3.connect(path).execute('SELECT * FROM lead_write_checks').fetchall()
# Out-of-brand lobby rows and claim stay inaccessible.
foreign=create('-타브랜드',brand='c',owner='s3');age(foreign)
assert foreign not in pool(old)
assert old.action(action='claimRecontact',leadId=foreign)[0]==409
# Keep a fresh eligible case for read-only Chrome lobby review.
ui=create('-화면');age(ui,25)
print('PASS: 20-day boundary; modification clock; review/ack ignored; private minimal lobby; future appointments/terminal/unassigned exclusion; brand isolation; concurrent single claim; old-owner revocation; history preserved; stale-write barrier')
print('UI candidate:',mark+'-화면')
