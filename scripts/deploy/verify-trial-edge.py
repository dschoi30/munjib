import json,sys,subprocess,tempfile,threading,time,socket,urllib.request,urllib.error,hmac,hashlib,base64,ipaddress
from pathlib import Path
from http.server import HTTPServer,BaseHTTPRequestHandler
from urllib.parse import urlsplit
snippet=sys.stdin.read()
key=Path('/etc/munjib/secrets/trial-edge-proof-secret').read_bytes()
seen=[]
class Upstream(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):self.respond()
 def do_POST(self):self.respond()
 def respond(self):
  path=urlsplit(self.path).path
  body=self.rfile.read(int(self.headers.get('Content-Length','0')))
  proof=self.headers.get('X-Munjib-Trusted-Network-Proof')
  if path=='/login':ok=all(not self.headers.get(x) for x in ['X-Munjib-Trusted-Client-IP','X-Munjib-Trusted-Network-Proof','X-Munjib-Trusted-Network-Timestamp'])
  else:
   ip=self.headers.get('X-Munjib-Trusted-Client-IP','')
   ts=self.headers.get('X-Munjib-Trusted-Network-Timestamp','')
   normalized='v4:'+str(ipaddress.ip_address(ip))
   msg='munjib/trial-network-evidence/v1\0'+ts+'\0'+self.command+'\0'+path+'\0'+normalized
   expected=base64.urlsafe_b64encode(hmac.new(key,msg.encode(),hashlib.sha256).digest()).decode().rstrip('=')
   ok=ip=='127.0.0.1' and all(len(self.headers.get_all(x,[]))==1 for x in ['X-Munjib-Trusted-Client-IP','X-Munjib-Trusted-Network-Proof','X-Munjib-Trusted-Network-Timestamp']) and hmac.compare_digest(proof or '',expected) and abs(time.time()-int(ts))<30 and (self.command!='POST' or body==b'{"demo":true}')
  seen.append(ok);self.send_response(200 if ok else 500);self.end_headers();self.wfile.write(b'valid' if ok else b'invalid')
server=HTTPServer(('127.0.0.1',0),Upstream);threading.Thread(target=server.serve_forever,daemon=True).start()
sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
with tempfile.TemporaryDirectory(prefix='munjib-edge-smoke-') as tmp:
 cfg=Path(tmp)/'Caddyfile';cfg.write_text('{\n admin off\n auto_https off\n}\nhttp://127.0.0.1:'+str(port)+' {\n'+snippet.replace('127.0.0.1:3000','127.0.0.1:'+str(server.server_port))+'\n}\n')
 subprocess.run(['caddy','validate','--config',str(cfg),'--adapter','caddyfile'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
 proc=subprocess.Popen(['caddy','run','--config',str(cfg),'--adapter','caddyfile'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  for _ in range(30):
   try:
    with socket.create_connection(('127.0.0.1',port),timeout=.2):break
   except OSError:time.sleep(.1)
  for method,path in [('POST','/api/trial/entitlement'),('GET','/trial/workspaces/demo?document=fake'),('POST','/api/workspaces/demo/documents/fake/ask'),('POST','/api/workspaces/demo/assistant/messages'),('GET','/api/trial/attachments/demo-file'),('GET','/login')]:
   req=urllib.request.Request('http://127.0.0.1:'+str(port)+path,data=b'{"demo":true}' if method=='POST' else None,headers={'X-Munjib-Trusted-Client-IP':'198.51.100.123','X-Munjib-Trusted-Network-Timestamp':'1','X-Munjib-Trusted-Network-Proof':'forged','X-Munjib-Edge-Client-IP':'192.0.2.99','X-Forwarded-Method':'DELETE','X-Forwarded-Uri':'/forged'})
   try:
    with urllib.request.urlopen(req,timeout=5) as r:assert r.status==200 and r.read()==b'valid'
   except urllib.error.HTTPError as e:
    print('Failed synthetic case:',method,path,'status',e.code);raise
  for path in ['/api/auth/signin/trial','/api/auth/callback/trial']:
   try:urllib.request.urlopen('http://127.0.0.1:'+str(port)+path,timeout=5);raise AssertionError('legacy route reached upstream')
   except urllib.error.HTTPError as e:assert e.code==503
  assert len(seen)==6 and all(seen)
  print('PASS: actual Caddy header stripping, original POST/body/path, query exclusion, forged authority replacement, ordinary route passthrough and both legacy denials.')
 finally:proc.terminate();proc.wait(timeout=5);server.shutdown()
