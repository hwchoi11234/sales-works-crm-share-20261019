import sys,base64,json,urllib.request,urllib.error,uuid
sys.path.insert(0,'tests')
from api_smoke_support import Client
admin=Client('admin');staff=Client('yoon');hq=Client('hq.haru');BASE='http://127.0.0.1:4318'
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1cAAAAASUVORK5CYII=')
def upload(client,fields,content=png,filename='sample.png'):
 boundary='----sales'+uuid.uuid4().hex
 body=b''
 for k,v in fields.items():body+=(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n').encode()
 body+=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: image/png\r\n\r\n').encode()+content+(f'\r\n--{boundary}--\r\n').encode()
 req=urllib.request.Request(BASE+'/api/files',data=body,headers={'Content-Type':'multipart/form-data; boundary='+boundary,'Origin':BASE})
 try:
  with client.op.open(req) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
title='파일검증-'+uuid.uuid4().hex[:6];fields={'brandId':'a','title':title,'version':'1.0','change':'첫 배포'}
assert upload(staff,fields)[0]==403
assert upload(admin,fields,b'<html>invalid</html>')[0]==400
assert upload(admin,fields)[0]==200
d=next(d for d in admin.state()['docs'] if d['title']==title)
with staff.op.open(BASE+'/api/files?id='+d['id']) as r:assert r.read()==png
assert staff.action(action='readDoc',id=d['id'])[0]==200
assert staff.state()['user']['id'] in next(x for x in admin.state()['docs'] if x['id']==d['id'])['readBy']
assert upload(admin,{**fields,'id':d['id'],'version':'2.0','change':'둘째 배포'})[0]==200
d=next(x for x in admin.state()['docs'] if x['id']==d['id']);assert not d['readBy'] and len(d['versions'])==1
with staff.op.open(BASE+'/api/files?id='+d['id']+'&version=1.0') as r:assert r.read()==png
assert hq.call('/api/files?id='+d['id'])[0]==404
print('PASS: authenticated upload/download; mime validation; brand/file isolation; retained versions; read acknowledgment reset')
