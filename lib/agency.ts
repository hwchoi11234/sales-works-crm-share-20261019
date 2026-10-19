import type { Brand } from './types';
export const agencyServices = ['일반 광고대행', '영업대행'] as const;
export type AgencyService = (typeof agencyServices)[number];
// Existing CRM brands retain their sales workflow until an administrator classifies them.
export function brandServices(brand: Pick<Brand, 'services'>): AgencyService[] {
  return brand.services ?? ['영업대행'];
}
export function validServices(value: unknown): value is AgencyService[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 2 &&
    new Set(value).size === value.length &&
    value.every((s) => agencyServices.includes(s))
  );
}
