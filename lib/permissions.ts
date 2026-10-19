import type { Brand } from './types';
import { brandServices } from './agency';
export const isEmployee = (role: string) =>
  role === 'staff' || role === 'client_staff';
export const isCompanyRole = (role: string) =>
  role === 'client_admin' || role === 'client_staff';
export const isExternal = (role: string) =>
  role === 'client' || isCompanyRole(role);
export const canAssign = (role: string) =>
  role === 'admin' || role === 'client_admin';
// A sales-agency contract remains managed by our team, even if ads are also included.
export const selfManagedBrand = (brand: Brand) =>
  brand.active &&
  brandServices(brand).includes('일반 광고대행') &&
  !brandServices(brand).includes('영업대행');
export const roleLabel = (role: string) =>
  ({
    admin: '최고관리자',
    staff: '우리 영업팀원',
    client: '영업대행 고객사 · 조회',
    client_admin: '광고대행 고객사 관리자',
    client_staff: '고객사 직원',
  })[role] || '계정';
