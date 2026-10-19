import sys,sqlite3,pathlib,datetime,hashlib,json,shutil
root=pathlib.Path(__file__).resolve().parents[1]
target=sys.argv[1] if len(sys.argv)>1 else ''
if target not in ('development','test'):raise SystemExit('Only development/test backups are allowed.')
source=root/'.local'/target
if not source.exists():raise SystemExit('Local database has not been initialized.')
destination=root/'.local'/'backups'/f'{target}-{datetime.datetime.now():%Y%m%d-%H%M%S-%f}'
destination.mkdir(parents=True)
manifest=[]
for path in (source/'v3'/'d1'/'miniflare-D1DatabaseObject').glob('*.sqlite'):
 if path.name=='metadata.sqlite':continue
 output=destination/path.name
 with sqlite3.connect(path) as src,sqlite3.connect(output) as dst:
  src.backup(dst)
  assert dst.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
 manifest.append({'file':output.name,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()})
# Local R2 metadata and bytes accompany the DB backup. For an exact file snapshot, stop the dev server before running this script.
r2=source/'v3'/'r2'
if r2.exists():shutil.copytree(r2,destination/'r2')
(destination/'manifest.json').write_text(json.dumps({'environment':target,'files':manifest},indent=2))
print('Local backup verified:',destination)
