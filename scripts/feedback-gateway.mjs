import http from 'node:http';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';

const cookieName = '__Host-crm_feedback';
const equal = (a, b) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
const cookieValue = (raw = '') => raw.split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';
const gatePage = (error = '') => `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sales Works · 피드백 접속</title><style>body{font-family:system-ui,sans-serif;background:#f1f5f9;color:#172033;margin:0;display:grid;place-items:center;min-height:100vh}main{width:min(360px,80vw);background:white;padding:36px;border-radius:20px;box-shadow:0 12px 48px #15254312}small{color:#496be9;font-weight:700}h1{font-size:26px;margin:12px 0}p{font-size:14px;line-height:1.7;color:#64748b}label{display:block;font-size:14px;margin:24px 0 8px}input,button{box-sizing:border-box;width:100%;padding:14px;border-radius:9px;font-size:16px}input{border:1px solid #cbd5e1}button{margin-top:12px;background:#315ee9;color:white;border:0;cursor:pointer}.error{color:#c53030}</style><main><small>SALES WORKS · FEEDBACK</small><h1>피드백 공간에 오신 것을<br>환영합니다.</h1><p>전달받은 공유용 비밀번호를 입력해 주세요.<br>접속 후에는 기존 프로그램 계정으로 로그인합니다.</p><form method="post" action="/__feedback/unlock"><label for="code">공유용 비밀번호</label><input id="code" name="code" type="password" autocomplete="current-password" required autofocus maxlength="100"><button>프로그램 열기</button></form>${error ? `<p class="error">${error}</p>` : ''}<p>검토용 개발 환경입니다.<br>저장한 변경은 함께 보는 개발 데이터에 반영됩니다.</p></main></html>`;

// A separate, authenticated loopback proxy. The CRM's local-only guard is unchanged.
export function createFeedbackGateway({ password, upstream = 'http://127.0.0.1:4317', ttlSeconds = 28800 }) {
  if (!password || password.length < 16) throw new Error('A strong feedback password is required.');
  const target = new URL(upstream);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') throw new Error('Loopback upstream required.');
  const token = randomBytes(32).toString('base64url');
  const expires = Date.now() + ttlSeconds * 1000;
  const attempts = new Map();
  let publicOrigin = '';
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    const end = (status, body) => { res.writeHead(status); res.end(body); };
    if (!publicOrigin || Date.now() >= expires) return end(503, 'Feedback access is closed.');
    if (req.headers.host !== new URL(publicOrigin).host) return end(403, 'Invalid host.');
    if (!req.url?.startsWith('/') || req.url.startsWith('//')) return end(400, 'Invalid request path.');
    if (req.headers.origin && req.headers.origin !== publicOrigin) return end(403, 'Invalid origin.');
    if (req.headers['sec-fetch-site'] === 'cross-site' && req.headers['sec-fetch-mode'] !== 'navigate') return end(403, 'Cross-site access blocked.');
    const write = !['GET', 'HEAD'].includes(req.method);
    if (write && req.headers.origin !== publicOrigin) return end(403, 'Origin required.');
    if (new URL(req.url, publicOrigin).pathname.startsWith('/api/sheets')) return end(403, 'Sheet collection is local administrator access only.');
    const page = (status, error) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
      end(status, gatePage(error));
    };
    if (req.url === '/__feedback/unlock' && req.method === 'POST') {
      const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress);
      const now = Date.now();
      for (const [key, a] of attempts) if (a.until < now) attempts.delete(key);
      const attempt = attempts.get(ip) || { count: 0, until: now + 15 * 60000 };
      if (attempt.count >= 10 || attempts.size > 10000) return page(429, '시도가 많습니다. 15분 후 다시 시도해 주세요.');
      let body = '';
      try {
        for await (const part of req) {
          body += part.toString();
          if (body.length > 2048) return end(413, 'Request too large.');
        }
      } catch { return end(400, 'Invalid request.'); }
      if (!equal(new URLSearchParams(body).get('code') || '', password)) {
        attempt.count++;
        attempts.set(ip, attempt);
        return page(401, '공유용 비밀번호를 확인해 주세요.');
      }
      attempts.delete(ip);
      res.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(0, Math.floor((expires - Date.now()) / 1000))}`);
      res.writeHead(303, { Location: '/' });
      return res.end();
    }
    if (!equal(cookieValue(req.headers.cookie), token)) {
      if (req.method === 'GET' && (req.url === '/' || req.headers.accept?.includes('text/html'))) return page(200);
      return end(401, 'Feedback password required.');
    }
    // A review password must never grant access to local account files, backups,
    // unrelated projects or arbitrary files through Vite's source endpoints.
    let decoded;
    try { decoded = decodeURIComponent(decodeURIComponent(req.url.split('?')[0])); }
    catch { return end(400, 'Invalid path encoding.'); }
    if (decoded.includes('\\') || /(?:^|\/)\.{1,2}(?:\/|$)/.test(decoded)
      || /(?:^|\/)(?:\.local|\.env[^/]*|\.git|\.wrangler)(?:\/|$)/i.test(decoded)) return end(403, 'Private file.');
    if (!(decoded === '/' || /^\/(?:api|app|components|hooks|lib|node_modules|@vite|@id)\//.test(decoded)
      || decoded === '/@react-refresh' || decoded === '/favicon.ico'
      || (decoded.startsWith('/@fs/') && decoded.includes('/node_modules/')))) return end(403, 'Review route only.');
    const headers = { ...req.headers, host: target.host };
    for (const key of Object.keys(headers)) {
      if (key.startsWith('x-forwarded-') || key.startsWith('cf-') || ['forwarded', 'authorization', 'connection', 'upgrade'].includes(key)) delete headers[key];
    }
    headers.cookie = (req.headers.cookie || '').split(';').filter(x => !x.trim().startsWith(cookieName + '=')).join(';');
    // Only rewrite an origin after checking the exact tunnel origin above.
    if (headers.origin) headers.origin = target.origin;
    if (headers.referer) headers.referer = target.origin + '/';
    const proxy = http.request({ hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers }, upstreamRes => {
      const responseHeaders = { ...upstreamRes.headers };
      delete responseHeaders['access-control-allow-origin'];
      delete responseHeaders['access-control-allow-credentials'];
      responseHeaders['cache-control'] = 'no-store';
      responseHeaders['x-frame-options'] = 'DENY';
      if (responseHeaders['set-cookie']) responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map(c => /;\s*Secure(?:;|$)/i.test(c) ? c : c + '; Secure');
      if (responseHeaders.location?.startsWith(target.origin + '/')) responseHeaders.location = publicOrigin + responseHeaders.location.slice(target.origin.length);
      res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
      upstreamRes.pipe(res);
    });
    proxy.setTimeout(60000, () => proxy.destroy(new Error('Upstream timed out')));
    proxy.on('error', () => { if (!res.headersSent) end(502, 'Local CRM is unavailable.'); else res.destroy(); });
    res.on('close', () => proxy.destroy());
    let bytes = 0;
    req.on('data', chunk => { bytes += chunk.length; if (bytes > 12 * 1024 * 1024) { proxy.destroy(); req.destroy(); } });
    req.pipe(proxy);
  });
  // Feedback users manually refresh; do not expose the development control socket.
  server.on('upgrade', (_req, socket) => socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'));
  return {
    server,
    setPublicOrigin(origin) {
      if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin)) throw new Error('Expected an exact HTTPS Quick Tunnel origin.');
      publicOrigin = origin;
    },
  };
}
