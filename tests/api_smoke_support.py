import json,urllib.request,urllib.error,http.cookiejar
BASE='http://127.0.0.1:4318'
accounts={a['username']:a for a in json.load(open('.local/test-accounts.json'))}
class Client:
 def __init__(self,username=None):
  self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
  if username:
   a=accounts[username];assert self.call('/api/session',{'username':username,'password':a['password']})[0]==200
 def call(self,path='/api/crm',payload=None):
  req=urllib.request.Request(BASE+path,data=json.dumps(payload).encode() if payload is not None else None,headers={'Content-Type':'application/json','Origin':BASE} if payload is not None else {})
  try:
   with self.op.open(req) as r:return r.status,json.load(r)
  except urllib.error.HTTPError as e:return e.code,json.load(e) if e.headers.get('Content-Type','').startswith('application/json') else {}
 def action(self,**payload):return self.call(payload=payload)
 def state(self):return self.call()[1]
