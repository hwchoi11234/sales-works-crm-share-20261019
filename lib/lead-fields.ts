/** Shared classification for forms and future Google Sheets ingestion. Keep source text in Inquiry.raw. */
export const startupTypes = ['신규창업', '업종변경', '샵인샵'] as const;
export function normalizeStartupType(value: unknown): string {
  if (typeof value !== 'string') return '미분류';
  const key = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_-]/g, '');
  const aliases: Record<string, string> = {
    신규: '신규창업',
    신규창업: '신규창업',
    업종변경: '업종변경',
    샵인샵: '샵인샵',
    숍인숍: '샵인샵',
    shopinshop: '샵인샵',
  };
  return Object.prototype.hasOwnProperty.call(aliases, key)
    ? aliases[key]
    : '미분류';
}
function timestamp(value: string): number {
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value);
  return Date.parse(local ? value + '+09:00' : value);
}
/** First source submission; independent of lead.createdAt (CRM registration). */
export function firstReceivedAt(
  lead: { id: number; createdAt: string },
  inquiries: { leadId: number; receivedAt: string }[],
): string {
  return (
    inquiries
      .filter((q) => q.leadId === lead.id && Number.isFinite(timestamp(q.receivedAt)))
      .sort((a, b) => timestamp(a.receivedAt) - timestamp(b.receivedAt))[0]
      ?.receivedAt || lead.createdAt
  );
}
export function receiptParts(value: string): { date: string; time: string } {
  if (!Number.isFinite(timestamp(value))) return { date: '미기재', time: '—' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return { date: value.replaceAll('-', '.'), time: '—' };
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp(value)));
  const p = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    date: `${p.year}.${p.month}.${p.day}`,
    time: `${p.hour}:${p.minute}`,
  };
}

/** Main contact is the duplicate key; Meta's prefilling value is provenance only. */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('0082')) return '0' + digits.slice(4);
  if (digits.startsWith('82')) return '0' + digits.slice(2);
  return digits;
}
export function metaAutoPhone(inquiry: {
  source: string;
  metaAutoPhone?: string;
  raw: Record<string, string>;
}): string {
  if (!/메타|meta|페이스북|facebook|인스타그램|instagram/i.test(inquiry.source))
    return '';
  return (
    inquiry.metaAutoPhone ||
    inquiry.raw['메타 자동입력 연락처'] ||
    inquiry.raw['메타 자동입력 전화번호'] ||
    inquiry.raw['phone_number'] ||
    ''
  );
}
