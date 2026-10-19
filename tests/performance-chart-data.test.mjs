import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(
      specifier === './lead-fields' &&
        context.parentURL?.endsWith('/performance-chart-data.ts')
        ? './lead-fields.ts'
        : specifier,
      context,
    );
  },
});
const { performanceSnapshot, percent } =
  await import('../lib/performance-chart-data.ts');
const lead = (
  id,
  status = '상담 중',
  ownerId = 's1',
  createdAt = '2026-09-09T01:00:00Z',
) => ({ id, status, ownerId, createdAt });
const leads = [
  lead(1, '계약 완료'),
  lead(2),
  lead(3, '보류'),
  lead(4, '종료'),
  lead(5, '상담 중', null),
  lead(6, '부동산 임장중'),
  lead(7, '사용 중지한 상태'),
  lead(8, '상담 중', 's2', '2026-08-01T00:00:00Z'),
  lead(9),
  lead(10),
];
const data = {
  role: 'admin',
  statusOptions: [
    { name: '상담 중', active: true },
    { name: '계약 완료', active: true },
  ],
  inquiries: [
    { leadId: 9, receivedAt: '2026-09-08T14:59:00Z' }, // Sept 8 Seoul: excluded even though registered Sept 9
    { leadId: 9, receivedAt: '2026-09-09T01:00:00Z' }, // re-inquiry doesn't move first intake
    { leadId: 10, receivedAt: '2026-09-08T15:00:00Z' }, // Sept 9 Seoul: included
  ],
  notes: [
    { leadId: 1, kind: 'consultation', outcome: '통화 완료' },
    { leadId: 2, kind: 'consultation', outcome: '부재' },
    { leadId: 3, kind: 'consultation', outcome: '메모만' }, // not attempted
    { leadId: 6, kind: 'consultation', outcome: '통화 완료' },
    { leadId: 7, kind: 'request', outcome: '통화 완료' }, // request never counts
    { leadId: 8, kind: 'consultation', outcome: '연락처 오류' },
  ],
  callbacks: [
    { leadId: 1, status: '예정', dueAt: '2026-09-08T09:00' }, // completed contract excluded from queues
    { leadId: 2, status: '예정', dueAt: '2026-09-08T09:00' },
    { leadId: 2, status: '예정', dueAt: '2026-09-08T10:00' }, // customer counted once
    { leadId: 3, status: '완료', dueAt: '2026-09-08T09:00' },
    { leadId: 8, status: '예정', dueAt: '2026-09-08T09:00' }, // old intake still in queue
  ],
  meetings: [
    {
      leadId: 6,
      status: '예정',
      date: '2026-09-10',
      start: '10:00',
      end: '11:00',
    },
  ],
};
const now = '2026-09-09T12:00';
const s = performanceSnapshot(data, leads, '2026-09-09', '2026-09-09', now);
assert.deepEqual(
  s.cohort.map((l) => l.id),
  [1, 2, 3, 4, 5, 6, 7, 10],
);
assert.deepEqual(s.contracts, [1]);
assert.deepEqual(s.paused, [3, 4]);
assert.equal(
  s.active.length + s.paused.length + s.contracts.length,
  s.cohort.length,
);
assert.equal(
  s.statuses.reduce((n, b) => n + b.ids.length, 0),
  s.cohort.length,
);
assert.ok(s.statuses.some((b) => b.name === '사용 중지한 상태'));
assert.deepEqual(s.attention.find((b) => b.name === '연락 지연').ids, [2, 8]);
assert.deepEqual(s.attention.find((b) => b.name === '미배정').ids, [5]);
assert.deepEqual(
  s.attention.find((b) => b.name === '접촉 기록 없음').ids,
  [3, 7, 9, 10],
);
assert.deepEqual(s.attention.find((b) => b.name === '다음 약속 없음').ids, []);
const expired = performanceSnapshot(
  { ...data, meetings: [] },
  leads,
  '2026-09-09',
  '2026-09-09',
  now,
);
assert.deepEqual(
  expired.attention.find((b) => b.name === '다음 약속 없음').ids,
  [6],
);
const restricted = performanceSnapshot(
  data,
  leads.filter((l) => l.id === 2),
  '2026-09-09',
  '2026-09-09',
  now,
);
assert.deepEqual(
  restricted.attention.find((b) => b.name === '연락 지연').ids,
  [2],
); // unrelated visible records never leak
assert.equal(restricted.cohort.length, 1);
const hq = performanceSnapshot(
  { ...data, role: 'client', notes: [], callbacks: [] },
  leads,
  '2026-09-09',
  '2026-09-09',
  now,
);
assert.deepEqual(hq.attention, []); // missing internal notes must never imply untouched customers
const empty = performanceSnapshot(data, leads, '2030-01-01', '2030-01-01', now);
assert.equal(empty.cohort.length, 0);
assert.deepEqual(
  empty.attention.find((b) => b.name === '연락 지연').ids,
  [2, 8],
);
assert.equal(percent(0, 0), '—');
assert.equal(percent(1, 8), '12.5%');
assert.equal(percent(0, 8), '0.0%');
assert.equal(
  performanceSnapshot(data, leads, '2026-09-10', '2026-09-01', now).cohort
    .length,
  0,
);
console.log(
  'PASS: first intake/Korean date cohort, status partition, fixed denominator, old backlog, deduplication, scoped queues, client privacy, empty data',
);

const modifiedLeads = [
  { ...leads[0], updatedAt: '2026-09-08T15:00:00Z' },
  { ...leads[1], updatedAt: '2026-09-08T14:59:00Z' },
  { ...leads[7], updatedAt: '2026-09-09T10:00:00Z' },
];
const modified = performanceSnapshot(
  data,
  modifiedLeads,
  '2026-09-09',
  '2026-09-09',
  now,
  'updated',
);
assert.deepEqual(
  modified.cohort.map((l) => l.id),
  [1, 8],
);
assert.equal(modified.contracts.length, 1);
console.log(
  'PASS: modification date cohort uses last update and Korean date boundary, independent of first intake',
);
