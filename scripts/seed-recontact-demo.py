"""Add 3 isolated, clearly labeled aged demonstration customers. Never reset existing records."""
import sys,sqlite3,glob,json,datetime
if len(sys.argv)!=2 or sys.argv[1] not in ('development','test'):raise SystemExit('local development/test only')
root=f'.local/{sys.argv[1]}/v3/d1/'
path=next(p for p in glob.glob(root+'**/*.sqlite',recursive=True) if sqlite3.connect(p).execute("SELECT count(*) FROM sqlite_master WHERE name='leads'").fetchone()[0])
c=sqlite3.connect(path,timeout=10)
c.execute('PRAGMA foreign_keys=ON')
encode=lambda o:json.dumps(o,ensure_ascii=False)
for i,(brand,owner,name,status,days) in enumerate([('a','s1','김서진','보류',21),('b','s4','이도현','상담 중',25),('c','s3','박민서','부동산 임장중',30)],1):
 qid=f'demo-recontact-inquiry-{i}'
 if c.execute('SELECT id FROM inquiries WHERE id=?',(qid,)).fetchone():continue
 old=(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(days=days,hours=1)).isoformat(timespec='milliseconds').replace('+00:00','Z')
 l=dict(brandId=brand,ownerId=owner,name='[사랑방 예시] '+name,status=status,phone=f'010-0000-900{i}',email='',region=['경기 수원','서울 마포','인천 연수'][i-1],startupType='신규창업',budget='1억 원 내외',createdAt=old,nextAt='')
 with c:
  lid=c.execute('INSERT INTO leads(brand_id,owner_id,status,data) VALUES (?,?,?,?)',(brand,owner,status,encode(l))).lastrowid
  q=dict(id=qid,leadId=lid,source='전화 · 직접 등록',campaign='DB 사랑방 임시 사례',receivedAt=old,raw={'성함':l['name'],'연락처':l['phone'],'문의 내용':'[임시 사례] 창업 비용 문의 후 검토 중. 재컨택 흐름 확인용 고객입니다.'},summary='[임시 사례] 창업 비용을 확인한 뒤 검토 중인 고객입니다.',reviewed=True,reviewer='운영 관리자',reviewedAt=old,aiSample=False)
  c.execute('INSERT INTO inquiries(id,lead_id,data) VALUES (?,?,?)',(qid,lid,encode(q)))
  n=dict(id=f'demo-recontact-note-{i}',leadId=lid,text='[임시 사례] 창업 비용을 안내했습니다. 검토 후 다시 상담 가능하며 확정된 연락·미팅 약속은 없습니다.',scope='shared',author='임시 데이터',createdAt=old,kind='consultation',outcome='통화 완료',ownerId=owner)
  c.execute('INSERT INTO notes VALUES (?,?,?,?,?)',(n['id'],lid,'shared',old,encode(n)))
  c.execute('UPDATE leads SET updated_at=? WHERE id=?',(old,lid))
 print('Created local demo:',l['name'],f'{days} days inactive')
