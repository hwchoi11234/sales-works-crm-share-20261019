"""Append 2026 Aug/Sep demo customers to the stopped LOCAL development/test DB.
Stable inquiry IDs make retries idempotent. Existing records must remain identical.
"""
import sys,sqlite3,pathlib,json,socket,datetime,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
target=sys.argv[1] if len(sys.argv)>1 else ''
if target not in ('development','test'):raise SystemExit('Only local development/test are supported')
with socket.socket() as sock:
 if sock.connect_ex(('127.0.0.1',4317 if target=='development' else 4318))==0:raise SystemExit('Stop the target local server before seeding')
paths=[p for p in (ROOT/'.local'/target/'v3/d1/miniflare-D1DatabaseObject').glob('*.sqlite') if p.name!='metadata.sqlite']
assert len(paths)==1,'Expected exactly one local database'
c=sqlite3.connect(paths[0]);c.execute('PRAGMA foreign_keys=ON')
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
backup=ROOT/'.local/backups'/f'{target}-before-augsep-{stamp}.sqlite'
backup.parent.mkdir(parents=True,exist_ok=True)
with sqlite3.connect(backup) as dst:c.backup(dst);assert dst.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
encode=lambda v:json.dumps(v,ensure_ascii=False,sort_keys=True)
sales=['마라인더컵','딩딩파파','번쩍피자','기와옥순두부','타이요','듀담','구천구백닭강정','앙팡프리슈','일익스프레스']
ads=['바른보쌈','대한국밥만세','청춘꼬마김밥','샤브온당','뽁당','혼감탕','카페시그니처','인생아구찜']
brands={json.loads(row[0])['name']:json.loads(row[0]) for row in c.execute('SELECT data FROM brands')}
assert all(n in brands for n in sales+ads),'Provision the 17 brands first'
prefix='demo-2026-augsep-'
tables=['brands','members','accounts','leads','notes','inquiries','activities','meetings','callbacks','documents']
def snapshot():return {t:{row[0]:row for row in c.execute('SELECT * FROM '+t)} for t in tables}
def insert(table,columns,values):c.execute(f"INSERT INTO {table} ({','.join(columns)}) VALUES ({','.join('?' for _ in values)})",values)
def add_json(table,obj):insert(table,['id','lead_id','data'],[obj['id'],obj['leadId'],encode(obj)])
def activity(key,lid,owner,at,kind,text,status=None):
 a=dict(id=key,leadId=lid,author='[예시] 운영 관리자',actorId='demo-2026-augsep',ownerId=owner,createdAt=at,kind=kind,text=text)
 if status:a['status']=status
 insert('activities',['id','lead_id','created_at','data'],[key,lid,at,encode(a)])
names=['김민준','이서연','박지호','최수빈','정하준','강예린','윤도현','임서진','한유진','조시우']
regions=['서울 마포','경기 수원','인천 연수','대전 유성','부산 해운대','대구 수성','광주 서구','경기 성남','충남 천안','서울 송파']
sources=['메타 · 구글시트','당근 · 구글시트','네이버 · Gmail','유튜브 · Gmail','전화 · 직접 등록']
statuses=['신규','상담 중','부동산 임장중','미팅 예정','계약 검토','계약 완료','보류','종료','상담 중','계약 완료']
created=0;skipped=0
try:
 c.execute('BEGIN IMMEDIATE')
 before=snapshot()
 members=[json.loads(r[0]) for r in c.execute('SELECT data FROM members')]
 demo_owner=prefix+'owner'
 unassigned=[brands[n]['id'] for n in sales if not any(m['active'] and brands[n]['id'] in m['brands'] for m in members)]
 if unassigned and not any(m['id']==demo_owner for m in members):
  m=dict(id=demo_owner,name='[예시] 영업담당자',brands=unassigned,active=True)
  insert('members',['id','data'],[m['id'],encode(m)]);members.append(m)
 slots=[json.loads(r[0]) for r in c.execute('SELECT data FROM meetings')]
 for bi,name in enumerate(sales+ads):
  brand=brands[name];is_sales=name in sales
  eligible=[m for m in members if m['active'] and brand['id'] in m['brands']] if is_sales else []
  for month in (8,9):
   for i in range(10):
    key=f'{prefix}{bi:02d}-{month:02d}-{i:02d}'
    if c.execute('SELECT 1 FROM inquiries WHERE id=?',(key+'-inquiry',)).fetchone():skipped+=1;continue
    day=1+i*2
    ts=lambda offset=0,hour=10:f'2026-{month:02d}-{day+offset:02d}T{hour:02d}:00:00+09:00'
    received=ts();last=received
    status=statuses[(i+bi+(month-8)*2)%10] if is_sales else '신규'
    if is_sales and month==9 and i==0:status='계약 완료'
    owner=eligible[(i+bi)%len(eligible)] if eligible and status!='신규' else None
    oid=owner['id'] if owner else None
    lead=dict(brandId=brand['id'],ownerId=oid,status=status,name=f'[예시] {names[(i+bi)%10]}',phone=f'010-0000-{5000+bi*20+(month-8)*10+i:04d}',email=f'demo-{bi}-{month}-{i}@example.com',region=regions[(bi+i)%10],startupType=['신규창업','업종변경','샵인샵'][i%3],budget=['7천만 원','1억 원','1억 5천만 원'][i%3],createdAt=received,nextAt='',demoBatch=prefix)
    lid=c.execute('INSERT INTO leads (brand_id,owner_id,status,data) VALUES (?,?,?,?)',(brand['id'],oid,status,encode(lead))).lastrowid
    lead['id']=lid;c.execute('UPDATE leads SET data=? WHERE id=?',(encode(lead),lid))
    detail=f"[임시 데이터] {lead['region']}에서 {lead['startupType']}을 검토 중입니다. 예산 {lead['budget']}, 창업 비용과 운영 방식에 대해 문의했습니다."
    q=dict(id=key+'-inquiry',leadId=lid,source=sources[(bi+i)%5],campaign=f'[예시] {name} 2026년 {month}월 캠페인',receivedAt=received,raw={'성함':lead['name'],'연락처':lead['phone'],'이메일':lead['email'],'창업 형태':lead['startupType'],'창업 희망지역':lead['region'],'문의 내용':detail},summary=detail,reviewed=bool(owner),reviewer=owner['name'] if owner else None,reviewedAt=ts(1) if owner else None,aiSample=True)
    if q['source'].startswith('메타'):q['metaAutoPhone']=lead['phone']
    add_json('inquiries',q)
    if owner:
     activity(key+'-assigned',lid,oid,ts(1,9),'assign','[예시] 담당자 배정')
     for ni,text in enumerate([f"[임시 상담] 희망지역 {lead['region']}과 예산 {lead['budget']}을 확인하고 브랜드 소개 자료를 안내했습니다.",{'계약 완료':'개설 조건 협의를 마치고 가맹 계약을 완료했습니다.','계약 검토':'가맹 조건과 계약서를 전달하고 검토를 요청했습니다.','미팅 예정':'본사 방문 상담을 예약했습니다.','부동산 임장중':'희망 상권의 후보 점포를 검토하고 있습니다.','보류':'개인 일정으로 창업 검토를 잠시 보류했습니다.','종료':'고객 요청으로 이번 상담을 종료했습니다.'}.get(status,'자료 확인 후 재연락하기로 했습니다.')]):
      at=ts(1+ni,11)
      n=dict(id=key+f'-note-{ni}',leadId=lid,text=text,scope='shared',author=owner['name'],createdAt=at,kind='consultation',outcome='통화 완료',actorId='demo-2026-augsep',ownerId=oid)
      insert('notes',['id','lead_id','scope','created_at','data'],[n['id'],lid,n['scope'],at,encode(n)]);last=at
     if status in ['미팅 예정','계약 검토','계약 완료','보류','종료']:
      mdate=f'2026-{month:02d}-{day+3:02d}'
      mhour=next((h for h in range(9,19) if not any(m['ownerId']==oid and m['date']==mdate and m['status'] in ['예정','완료'] and m['start']<f'{h+1:02d}:00' and m['end']>f'{h:02d}:00' for m in slots)),None)
      assert mhour is not None,'No available demo meeting slot'
      mstatus={'미팅 예정':'예정','계약 검토':'완료','계약 완료':'완료','보류':'불참','종료':'취소'}[status]
      meet=dict(id=key+'-meeting',leadId=lid,ownerId=oid,date=mdate,start=f'{mhour:02d}:00',end=f'{mhour+1:02d}:00',place='[예시] 본사 상담실',title=f'[예시] {name} 창업 상담',status=mstatus,history=[dict(at=ts(2,12),author=owner['name'],text='[임시 일정] 상담 미팅 등록')])
      if mstatus!='예정':meet['history'].append(dict(at=ts(3,mhour+1),author=owner['name'],text=f'[임시 일정] 미팅 {mstatus}'))
      if mstatus=='완료':meet['completedAt']=ts(3,mhour+1)
      add_json('meetings',meet);slots.append(meet)
      activity(key+'-meeting-activity',lid,oid,ts(3,19),'meeting',f'[예시] 미팅 {mstatus}')
     if status in ['상담 중','부동산 임장중']:
      cb=dict(id=key+'-callback',leadId=lid,ownerId=oid,dueAt=ts(5,14)[:16],status='예정',createdAt=ts(2,12))
      insert('callbacks',['id','lead_id','owner_id','due_at','status','data'],[cb['id'],lid,oid,cb['dueAt'],cb['status'],encode(cb)])
     last=ts(4,10)
     activity(key+'-status',lid,oid,last,'status',f'[예시] 진행상태: {status}',status)
    c.execute('UPDATE leads SET updated_at=? WHERE id=?',(last,lid))
    created+=1
 after=snapshot()
 for table,rows in before.items():
  assert all(after[table].get(k)==v for k,v in rows.items()),'Existing records changed: '+table
 assert not c.execute('PRAGMA foreign_key_check').fetchall()
 assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
 counts=c.execute("SELECT brand_id,substr(json_extract(data,'$.createdAt'),1,7),count(*) FROM leads WHERE json_extract(data,'$.demoBatch')=? GROUP BY brand_id,substr(json_extract(data,'$.createdAt'),1,7)",(prefix,)).fetchall()
 assert len(counts)==34 and all(r[2]==10 for r in counts)
 c.commit()
except:
 c.rollback();raise
report=dict(environment=target,added=created,skipped=skipped,demoTotal=sum(r[2] for r in counts),brands=17,perBrandPerMonth=10,months=['2026-08','2026-09'],existingRecordsUnchanged=True,backup=str(backup))
(ROOT/'.local'/f'{target}-augsep-demo-result.json').write_text(encode(report))
print(encode(report))
c.close()
