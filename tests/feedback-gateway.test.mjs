import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createFeedbackGateway } from '../scripts/feedback-gateway.mjs';

const origin = 'https://crm-feedback-test.trycloudflare.com';
const password = 'test-only-password-123456789';
const listen = s => new Promise(resolve => s.listen(0, '127.0.0.1', resolve));
test('feedback gate protects assets/API, validates origin and preserves local-only auth boundary', async t => {
  let forwarded = 0;
  const upstream = http.createServer((req, res) => {
    forwarded++;
    res.setHeader('Set-Cookie', 'crm_session_development=test; Path=/; HttpOnly; SameSite=Strict');
    res.end(JSON.stringify({ path: req.url, host: req.headers.host, origin: req.headers.origin, cookie: req.headers.cookie, forwarded: req.headers['x-forwarded-host'] }));
  });
  await listen(upstream);
  const target = `http://127.0.0.1:${upstream.address().port}`;
  const gate = createFeedbackGateway({ password, upstream: target });
  await listen(gate.server);
  t.after(() => { gate.server.closeAllConnections(); gate.server.close(); upstream.closeAllConnections(); upstream.close(); });
  const request = (path, { method = 'GET', headers = {}, body = '' } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: gate.server.address().port, path, method, headers: { host: new URL(origin).host, ...headers } }, res => {
      let text = ''; res.on('data', x => text += x); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    }); req.on('error', reject); req.end(body);
  });
  assert.equal((await request('/')).status, 503);
  gate.setPublicOrigin(origin);
  assert.equal((await request('/api/sheets')).status, 403);
  assert.equal((await request('/')).status, 200);
  for (const path of ['/api/crm', '/api/files', '/@fs/etc/passwd', '/app/page.tsx']) assert.equal((await request(path)).status, 401);
  assert.equal((await request('/', { headers: { host: 'attacker.test' } })).status, 403);
  assert.equal((await request('/__feedback/unlock', { method: 'POST', body: 'code=' + password })).status, 403);
  assert.equal((await request('/__feedback/unlock', { method: 'POST', headers: { origin: 'https://attacker.test' }, body: 'code=' + password })).status, 403);
  assert.equal((await request('/__feedback/unlock', { method: 'POST', headers: { origin }, body: 'code=bad' })).status, 401);
  assert.equal(forwarded, 0);
  const unlock = await request('/__feedback/unlock', { method: 'POST', headers: { origin }, body: 'code=' + password });
  assert.equal(unlock.status, 303);
  const cookie = unlock.headers['set-cookie'][0].split(';')[0];
  for (const path of ['/.local/development-accounts.json', '/@fs/Users/example/private.txt', '/@fs/a/node_modules/../.local/secrets', '/@id/%252e%256cocal/secrets', '/vwebmaster02-company-profile/package.json']) {
    assert.equal((await request(path, { headers: { cookie } })).status, 403);
  }
  assert.match(unlock.headers['set-cookie'][0], /HttpOnly; Secure; SameSite=Strict/);
  const allowed = await request('/api/session', { method: 'POST', headers: { origin, cookie: cookie + '; crm_session_development=existing', 'x-forwarded-host': 'attacker.test' }, body: '{}' });
  assert.equal(allowed.status, 200);
  assert.deepEqual(JSON.parse(allowed.text), { path: '/api/session', host: new URL(target).host, origin: target, cookie: 'crm_session_development=existing' });
  assert.match(allowed.headers['set-cookie'][0], /; Secure$/);
  assert.equal((await request('/api/crm', { method: 'POST', headers: { origin: 'https://attacker.test', cookie } })).status, 403);
  assert.equal((await request('/api/crm', { headers: { cookie, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors' } })).status, 403);
  assert.equal((await request('/api/crm', { headers: { cookie: '__Host-crm_feedback=forged' } })).status, 401);
  assert.equal(forwarded, 1);
  for (let i = 0; i < 10; i++) await request('/__feedback/unlock', { method: 'POST', headers: { origin }, body: 'code=bad' });
  assert.equal((await request('/__feedback/unlock', { method: 'POST', headers: { origin }, body: 'code=' + password })).status, 429);
});
