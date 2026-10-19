import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({
  resolve(s, c, next) {
    return next(
      c.parentURL?.includes('/lib/') &&
        ['./agency', './lead-fields'].includes(s)
        ? s + '.ts'
        : s,
      c,
    );
  },
});
const { agencyRows } = await import('../lib/agency-overview.ts');
const data = {
  brands: [
    { id: 'a', services: ['일반 광고대행'] },
    { id: 'b' },
    { id: 'c', services: ['일반 광고대행', '영업대행'] },
  ],
  leads: [
    { id: 1, brandId: 'a', createdAt: '2026-10-01T00:00:00Z', status: '신규' },
    {
      id: 2,
      brandId: 'c',
      createdAt: '2026-10-01T00:00:00Z',
      status: '계약 완료',
    },
    { id: 3, brandId: 'c', createdAt: '2026-10-02T00:00:00Z', status: '보류' },
  ],
  inquiries: [
    { leadId: 1, receivedAt: '2026-09-30T15:00:00Z', source: '메타' },
    { leadId: 2, receivedAt: '2026-09-30T14:59:00Z', source: '네이버' },
    { leadId: 3, receivedAt: '2026-10-02T10:00', source: '당근' },
  ],
  meetings: [
    { leadId: 3, status: '완료' },
    { leadId: 3, status: '완료' },
    { leadId: 3, status: '취소' },
  ],
};
const rows = agencyRows(data, 'all', '전체', '2026-10-01', '2026-10-31');
assert.equal(rows.length, 3);
assert.equal(
  rows.reduce((n, r) => n + r.leads.length, 0),
  2,
);
assert.equal(rows[0].leads.length, 1); // KST boundary
assert.equal(rows[0].sales, false);
assert.equal(rows[1].sales, true); // legacy brands
assert.equal(rows[2].contracts, 0); // first inquiry is before October
assert.equal(rows[2].meetings, 1); // unique customers, not event count
assert.equal(
  agencyRows(data, 'all', '일반 광고대행', '2000-01-01', '2030-01-01').length,
  2,
);
assert.equal(
  agencyRows(data, 'all', '영업대행', '2000-01-01', '2030-01-01').length,
  2,
);
assert.equal(
  agencyRows(data, 'a', '영업대행', '2000-01-01', '2030-01-01').length,
  0,
);
assert.equal(
  agencyRows(data, 'all', '전체', '2030-01-01', '2000-01-01').reduce(
    (n, r) => n + r.leads.length,
    0,
  ),
  0,
);
console.log(
  'PASS: category and brand filters, legacy defaults, KST first receipt dates, deduplicated customer outcomes, invalid ranges',
);
