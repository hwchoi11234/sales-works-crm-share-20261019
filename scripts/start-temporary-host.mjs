import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const directory = resolve(root, '.local/temporary-host');
await mkdir(directory, { recursive: true });
const file = resolve(directory, 'window.json');
let window;
try { window = JSON.parse(await readFile(file, 'utf8')); }
catch (e) {
  if (e.code !== 'ENOENT') throw e;
  window = { firstStartedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 14 * 86400000).toISOString() };
  await writeFile(file, JSON.stringify(window, null, 2), { mode: 0o600 });
}
const remaining = Date.parse(window.expiresAt) - Date.now();
if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 14 * 86400000) throw new Error('The 14-day review window has ended or is invalid. Data is retained.');
const children = [];
let closing = false;
function stop(reason) {
  if (closing) return;
  closing = true;
  console.log(`Temporary host stopped: ${reason}. Database and files are retained.`);
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 3000);
}
function run(script) {
  const child = spawn(process.execPath, [resolve(root, 'scripts', script)], { cwd: root, env: process.env, stdio: 'inherit' });
  children.push(child);
  child.on('error', e => stop(e.message));
  child.on('exit', () => stop(script + ' exited'));
  return child;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop('manually stopped'));
setTimeout(() => stop('14-day review window ended'), remaining);
run('run-portable.mjs');
let ready = false;
for (let attempt = 0; attempt < 90 && !closing; attempt++) {
  try { const r = await fetch('http://127.0.0.1:4317/', { signal: AbortSignal.timeout(2000) }); if (r.ok) { ready = true; break; } } catch {}
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!ready) stop('local CRM did not start');
else { console.log(`Review ends: ${window.expiresAt}`); run('share-feedback-14days.mjs'); }
