import assert from 'node:assert/strict';
import {
  normalizeStartupType,
  firstReceivedAt,
  receiptParts,
} from '../lib/lead-fields.ts';
for (const [input, expected] of [
  ['신규 창업', '신규창업'],
  ['신규창업', '신규창업'],
  [' 업종 변경 ', '업종변경'],
  ['샵 인 샵', '샵인샵'],
  ['숍인숍', '샵인샵'],
  ['Shop-in-Shop', '샵인샵'],
  ['', '미분류'],
  ['미기재', '미분류'],
  ['신규창업/업종변경', '미분류'],
  ['constructor', '미분류'],
])
  assert.equal(normalizeStartupType(input), expected);
assert.equal(normalizeStartupType(null), '미분류');
const lead = { id: 1, createdAt: '2026-09-09T04:00:00Z' };
const inquiries = [
  { leadId: 1, receivedAt: '2026-09-09T10:00' },
  { leadId: 2, receivedAt: '2026-09-01T00:00:00Z' },
  { leadId: 1, receivedAt: 'invalid' },
  { leadId: 1, receivedAt: '2026-09-09T00:30:00Z' },
];
assert.equal(firstReceivedAt(lead, inquiries), '2026-09-09T00:30:00Z');
assert.equal(firstReceivedAt(lead, []), lead.createdAt);
assert.deepEqual(receiptParts('2026-09-08T23:30:00Z'), {
  date: '2026.09.09',
  time: '08:30',
});
assert.deepEqual(receiptParts('2026-09-09T10:00'), {
  date: '2026.09.09',
  time: '10:00',
});
assert.deepEqual(receiptParts('2026-09-09'), { date: '2026.09.09', time: '—' });
assert.deepEqual(receiptParts(''), { date: '미기재', time: '—' });
console.log('Lead classification and receipt time checks passed');

const { normalizePhone, metaAutoPhone } = await import('../lib/lead-fields.ts');
assert.equal(normalizePhone('+82 10-1234-5678'), '01012345678');
assert.equal(normalizePhone('0082 10 1234 5678'), '01012345678');
assert.equal(metaAutoPhone({source:'메타 · 구글시트',raw:{phone_number:'+821012345678',연락처:'01099998888'}}), '+821012345678');
assert.equal(metaAutoPhone({source:'네이버 · Gmail',raw:{phone_number:'01012345678'}}), '');
assert.equal(metaAutoPhone({source:'메타',raw:{연락처:'01012345678'}}), '');
