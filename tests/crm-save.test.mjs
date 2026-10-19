import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { submitCrmAction } from '../lib/crm-submit.ts';
const response = (body, status = 200) =>
  new Response(JSON.stringify(body), { status });
assert.deepEqual(
  await submitCrmAction({}, async () => response({ ok: true })),
  { ok: true, replayed: false },
);
assert.deepEqual(
  await submitCrmAction({}, async () => response({ ok: true, replayed: true })),
  { ok: true, replayed: true },
);
for (const send of [
  async () => {
    throw Error('offline');
  },
  async () => response({ error: 'failure' }, 500),
  async () => new Response('broken'),
  async () => response(null),
])
  assert.equal((await submitCrmAction({}, send)).uncertain, true);
const conflict = await submitCrmAction({}, async () =>
  response({ error: 'already saved', alreadySaved: true }, 409),
);
assert.equal(conflict.uncertain, false);
assert.equal(conflict.alreadySaved, true);
// Execute the actual page action function with controlled transport and refresh failures.
const file = ts.createSourceFile(
  'page.tsx',
  fs.readFileSync('app/page.tsx', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let actionSource;
function visit(n) {
  if (ts.isVariableDeclaration(n) && n.name.getText(file) === 'action')
    actionSource = n.initializer.getText(file);
  ts.forEachChild(n, visit);
}
visit(file);
const code = ts.transpileModule(
  'const testedAction = ' + actionSource + '; testedAction;',
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
let posts = 0,
  notice = '',
  error = '',
  failRefresh = true;
const context = {
  useCallback: (fn) => fn,
  actionInFlight: { current: false },
  needsRefresh: { current: false },
  setBusy() {},
  setError: (v) => (error = v),
  setNotice: (v) => (notice = v),
  setDuplicate() {},
  refresh: async () => {
    if (failRefresh) throw Error('GET failed');
    context.needsRefresh.current = false;
    return {};
  },
  submitCrmAction: async () => {
    posts++;
    return { ok: true, replayed: false };
  },
};
const action = vm.runInNewContext(code, context);
assert.equal(await action({ action: 'note' }, 'saved'), true);
assert.match(notice, /저장은 완료/);
assert.equal(error, '');
assert.equal(posts, 1);
assert.equal(await action({ action: 'note' }), false);
assert.equal(posts, 1, 'no POST while the list is stale');
failRefresh = false;
assert.equal(await action({ action: 'note' }), true);
assert.equal(posts, 2);
let release;
context.submitCrmAction = () =>
  new Promise((resolve) => {
    release = resolve;
  });
const first = action({ action: 'note' });
assert.equal(await action({ action: 'note' }), false);
release({ ok: true, replayed: false });
assert.equal(await first, true);
console.log(
  'PASS: response loss, malformed responses, 409, confirmed save + failed refresh, stale-list guard, rapid duplicate click',
);
