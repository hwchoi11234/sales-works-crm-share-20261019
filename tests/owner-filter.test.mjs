import assert from 'node:assert/strict';
import { matchesOwner, ownerFilterOptions } from '../lib/owner-filter.ts';
const members = [
  { id: 'a', name: '듀담 담당', brands: ['dudam'], active: true },
  { id: 'b', name: '다른 브랜드 담당', brands: ['other'], active: true },
  { id: 'c', name: '인수인계 전 담당', brands: [], active: false },
];
const leads = [
  { id: 1, brandId: 'dudam', ownerId: 'a' },
  { id: 2, brandId: 'dudam', ownerId: null },
  { id: 3, brandId: 'dudam', ownerId: 'c' },
];
assert.deepEqual(
  ownerFilterOptions(members, leads, ['dudam']).map((m) => m.id),
  ['a', 'c'],
);
assert.deepEqual(
  ownerFilterOptions(members, [], ['dudam']).map((m) => m.id),
  ['a'],
);
assert.deepEqual(
  leads.filter((l) => matchesOwner(l.ownerId, 'all')).map((l) => l.id),
  [1, 2, 3],
);
assert.deepEqual(
  leads.filter((l) => matchesOwner(l.ownerId, 'unassigned')).map((l) => l.id),
  [2],
);
assert.deepEqual(
  leads.filter((l) => matchesOwner(l.ownerId, 'a')).map((l) => l.id),
  [1],
);
assert.deepEqual(
  leads.filter((l) => matchesOwner(l.ownerId, 'b')),
  [],
);
const reassigned = leads.map((l) => (l.id === 1 ? { ...l, ownerId: 'c' } : l));
assert.equal(reassigned.filter((l) => matchesOwner(l.ownerId, 'a')).length, 0);
assert.equal(reassigned.filter((l) => matchesOwner(l.ownerId, 'c')).length, 2);
console.log(
  'PASS owner filters: brand-scoped options, unassigned, inactive current owner, no leads, current reassignment',
);
