"""Restore ONLY into an empty local folder; never seed or overwrite an existing DB."""
import pathlib,sys,json,hashlib,sqlite3,shutil
root=pathlib.Path(__file__).resolve().parents[1]
source=root/'handoff-data';manifest=json.loads((source/'manifest.json').read_text(encoding='utf-8'))
for name,digest in manifest['dataFiles'].items():
 path=source/name
 assert path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest()==digest, 'Snapshot checksum failed: '+name
db=next(p for p in (source/'development/v3/d1/miniflare-D1DatabaseObject').glob('*.sqlite') if p.name!='metadata.sqlite')
with sqlite3.connect('file:'+db.as_posix()+'?immutable=1',uri=True) as c:
 assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
 for table,count in manifest['counts'].items():assert c.execute('SELECT count(*) FROM '+table).fetchone()[0]==count,table
 assert c.execute('SELECT count(*) FROM sessions').fetchone()[0]==0
 assert c.execute("SELECT count(*) FROM inquiries WHERE json_extract(data,'$.sheetSource') IS NOT NULL").fetchone()[0]==0
if '--verify-only' in sys.argv:
 print('Snapshot checksums, database counts, empty sessions and demo-only intake verified.');sys.exit(0)
destination=root/'.local/development'
if destination.exists() and any(destination.rglob('*')):raise SystemExit('Existing development data found. Back it up and select a fresh project folder; nothing was overwritten.')
shutil.copytree(source/'development',destination,dirs_exist_ok=True)
print('Development DB restored. Do NOT run db:setup, seeding, or real sheet collection. Test and production DBs remain separate.')
