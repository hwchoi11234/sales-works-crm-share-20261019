import { execFileSync } from 'node:child_process';
const target = process.argv[2];
if (!['development', 'test'].includes(target))
  throw Error('Only development/test may be seeded.');
const args = [
  '--config',
  `wrangler.${target}.json`,
  '--local',
  '--persist-to',
  `.local/${target}`,
];
execFileSync(
  'node',
  [
    'node_modules/wrangler/bin/wrangler.js',
    'd1',
    'migrations',
    'apply',
    'DB',
    ...args,
  ],
  { stdio: 'inherit', env: { ...process.env, CI: 'true' } },
);
execFileSync(
  'node',
  [
    'node_modules/wrangler/bin/wrangler.js',
    'd1',
    'execute',
    'DB',
    ...args,
    '--file',
    'db/seed.development.sql',
  ],
  { stdio: 'inherit' },
);
