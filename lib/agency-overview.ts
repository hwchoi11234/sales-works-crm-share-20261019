import type { State } from './types';
import { brandServices } from './agency';
import { firstReceivedAt, receiptParts } from './lead-fields';
export function agencyRows(
  data: State,
  brandId: string,
  category: string,
  from: string,
  to: string,
) {
  const validRange = !!from && !!to && from <= to;
  const brands = data.brands.filter(
    (b) =>
      (brandId === 'all' || b.id === brandId) &&
      (category === '전체' || brandServices(b).some((s) => s === category)),
  );
  return brands.map((b) => {
    const leads = validRange
      ? data.leads.filter((l) => {
          if (l.brandId !== b.id) return false;
          const date = receiptParts(
            firstReceivedAt(l, data.inquiries),
          ).date.replaceAll('.', '-');
          return date >= from && date <= to;
        })
      : [];
    const ids = new Set(leads.map((l) => l.id));
    const contracts = leads.filter((l) => l.status === '계약 완료').length;
    return {
      brand: b,
      leads,
      sales: brandServices(b).includes('영업대행'),
      contracts,
      meetings: new Set(
        data.meetings
          .filter((m) => ids.has(m.leadId) && m.status === '완료')
          .map((m) => m.leadId),
      ).size,
      active: leads.filter(
        (l) => !['계약 완료', '보류', '종료'].includes(l.status),
      ).length,
      sources: [
        ...new Set(
          data.inquiries.filter((q) => ids.has(q.leadId)).map((q) => q.source),
        ),
      ],
    };
  });
}
