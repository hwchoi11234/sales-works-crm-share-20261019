import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const mode = process.argv[2] || 'dev';
if (!['dev', 'test', 'build'].includes(mode)) throw new Error('Unknown local mode');
const root = resolve(import.meta.dirname, '..');
const child = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), ...(mode === 'build' ? ['build'] : [])], { cwd: root, env: { ...process.env, CRM_ENV: mode === 'test' ? 'test' : 'development' }, stdio: 'inherit' });
child.on('error', e => { console.error(e.message); process.exit(1); });
child.on('exit', code => process.exit(code || 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill());
