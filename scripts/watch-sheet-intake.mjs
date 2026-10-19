import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const dir = resolve(import.meta.dirname, '../.local/sheets');
await mkdir(dir, { recursive: true, mode: 0o700 });
const config = JSON.parse(await readFile(resolve(dir, 'connection.json'), 'utf8'));
const base = config.environment === 'test' ? 'http://127.0.0.1:4318' : config.environment === 'development' ? 'http://127.0.0.1:4317' : '';
if (!base || !config.username || !config.password) throw new Error('Local sheet connection settings required.');
let session = '', stopped = false, authenticating = false;
async function login() {
  if (authenticating) throw new Error('Authentication already in progress.');
  authenticating = true;
  try {
    const response = await fetch(base + '/api/session', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: config.username, password: config.password }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) { stopped = true; throw new Error('Collector sign-in failed. Update local connection credentials and restart.'); }
    session = response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  } finally { authenticating = false; }
}
async function sync() {
  if (!session) await login();
  const request = () => fetch(base + '/api/sheets', { method: 'POST', headers: { Origin: base, Cookie: session, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(60000) });
  let response = await request();
  if (response.status === 401) { await login(); response = await request(); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Collection returned ${response.status}`);
  await writeFile(resolve(dir, 'status.json'), JSON.stringify({ ...result, running: true, pid: process.pid, intervalSeconds: 60 }, null, 2), { mode: 0o600 });
  console.log(`${result.checkedAt} DingdingPapa: ${result.addedLeads} new customers, ${result.addedInquiries} inquiries, ${result.skipped} already collected, ${result.invalidRows.length} invalid rows, ${result.changedRows.length} changed rows.`);
}
async function finish() {
  stopped = true;
  await writeFile(resolve(dir, 'status.json'), JSON.stringify({ running: false, stoppedAt: new Date().toISOString() }), { mode: 0o600 });
  if (session) await fetch(base + '/api/session', { method: 'POST', headers: { Origin: base, Cookie: session, 'Content-Type': 'application/json' }, body: '{"action":"logout"}', signal: AbortSignal.timeout(3000) }).catch(() => {});
  process.exit(0);
}
process.on('SIGINT', finish); process.on('SIGTERM', finish);
while (!stopped) {
  try { await sync(); }
  catch (e) {
    await writeFile(resolve(dir, 'status.json'), JSON.stringify({ running: !stopped, checkedAt: new Date().toISOString(), error: e.message, pid: process.pid }), { mode: 0o600 });
    console.error(`Collector: ${e.message}`);
  }
  if (!stopped) await new Promise(resolve => setTimeout(resolve, 60000));
}
process.exitCode = 1;
