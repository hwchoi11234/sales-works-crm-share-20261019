import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createFeedbackGateway } from './feedback-gateway.mjs';

const root = resolve(import.meta.dirname, '..');
const dir = resolve(root, '.local/feedback');
await mkdir(dir, { recursive: true, mode: 0o700 });
await chmod(dir, 0o700);
const password = randomBytes(15).toString('base64url');
const ttlSeconds = 8 * 3600;
const startedAt = new Date().toISOString();
const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
const gateway = createFeedbackGateway({ password, ttlSeconds });
await new Promise((resolve, reject) => { gateway.server.once('error', reject); gateway.server.listen(4319, '127.0.0.1', resolve); });
const tunnel = spawn(resolve(root, '.local/tools/cloudflared'), ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:4319', '--protocol', 'http2'], { stdio: ['ignore', 'pipe', 'pipe'] });
let stopped = false;
let ready = false;
async function stop(reason) {
  if (stopped) return;
  stopped = true;
  tunnel.kill('SIGTERM');
  gateway.server.closeAllConnections();
  gateway.server.close();
  await writeFile(resolve(dir, 'status.json'), JSON.stringify({ status: 'stopped', reason, stoppedAt: new Date().toISOString() }), { mode: 0o600 });
  console.log(`Feedback sharing stopped: ${reason}`);
  process.exit(0);
}
let buffer = '';
async function output(chunk) {
  buffer = (buffer + chunk.toString()).slice(-10000);
  const url = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (url && !ready) {
    ready = true;
    gateway.setPublicOrigin(url);
    const details = { status: 'running', url, password, startedAt, expiresAt, pid: process.pid, tunnelPid: tunnel.pid };
    await writeFile(resolve(dir, 'access.json'), JSON.stringify(details, null, 2), { mode: 0o600 });
    await writeFile(resolve(dir, 'status.json'), JSON.stringify({ ...details, password: undefined }, null, 2), { mode: 0o600 });
    console.log(`Feedback URL: ${url}\nAccess details: .local/feedback/access.json\nExpires: ${expiresAt}`);
  }
  // Keep diagnostic output local; no application payload or credential logging.
  if (/ERR|error/i.test(chunk.toString())) process.stderr.write(chunk);
}
tunnel.stdout.on('data', output);
tunnel.stderr.on('data', output);
tunnel.on('error', e => stop(e.message));
tunnel.on('exit', () => stop('tunnel exited'));
process.on('SIGINT', () => stop('manually stopped'));
process.on('SIGTERM', () => stop('manually stopped'));
setTimeout(() => stop('8-hour feedback window ended'), ttlSeconds * 1000);
setTimeout(() => { if (!ready) stop('tunnel startup timed out'); }, 60000).unref();
