import type { Lead, Member } from './types';
export const matchesOwner = (ownerId: string | null, selection: string) =>
  selection === 'all' ||
  (selection === 'unassigned' ? !ownerId : ownerId === selection);

/** Caller must pass server-authorized members, leads and selected brand IDs. */
export function ownerFilterOptions(
  members: Member[],
  leads: Lead[],
  brandIds: string[],
) {
  const assigned = new Set(leads.map((l) => l.ownerId));
  return members.filter(
    (m) => m.brands.some((id) => brandIds.includes(id)) || assigned.has(m.id),
  );
}
