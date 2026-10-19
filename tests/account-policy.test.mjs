import assert from 'node:assert/strict';
import {
  normalizeUsername,
  validUsername,
  minimumPasswordLength,
} from '../lib/account-policy.ts';
for (const id of [
  '최고관리자',
  '듀담',
  '앙팡프리슈',
  '구천구백닭강정',
  'admin',
  'hq.haru',
])
  assert.ok(validUsername(normalizeUsername(id)));
assert.equal(normalizeUsername('  듀담  '.normalize('NFD')), '듀담');
assert.equal(normalizeUsername(' ADMIN '), 'admin');
for (const id of [
  'a',
  '공 백',
  "a' OR 1=1",
  '<script>',
  '😀😀',
  'x'.repeat(41),
])
  assert.equal(validUsername(id), false);
assert.equal(minimumPasswordLength('development'), 4);
assert.equal(minimumPasswordLength('test'), 4);
assert.equal(minimumPasswordLength('production'), 12);
assert.equal(minimumPasswordLength(''), 12);
console.log(
  'PASS: Korean account IDs, normalization, rejected identifiers, local-only short passwords',
);
