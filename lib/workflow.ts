import type { State, Lead } from './types';
export const today = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(
    new Date(),
  );
export const localNow = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date())
    .replace(' ', 'T');
export const plusDay = (date: string, n: number) => {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const weekStart = () => {
  const t = today();
  return plusDay(t, -((new Date(t + 'T12:00:00Z').getUTCDay() + 6) % 7));
};
export const dateLabel = (s: string) =>
  s
    ? new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(s.length === 16 ? s + ':00+09:00' : s))
    : '—';
export const matching = (l: Lead, q: string) => {
  q = q.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  return (
    !q ||
    [l.name, l.phone, l.region].some((v) => v.toLowerCase().includes(q)) ||
    (!!digits &&
      /^[\d\s()+-]+$/.test(q) &&
      l.phone.replace(/\D/g, '').includes(digits))
  );
};
export const latestNote = (s: State, id: number) =>
  s.notes
    .filter((n) => n.leadId === id && n.kind === 'consultation')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
export const pending = (s: State, id: number) =>
  s.callbacks.find((t) => t.leadId === id && t.status === '예정');
export const callbackIsDue = (dueAt: string, now = Date.now()) =>
  Date.parse(dueAt.length === 16 ? dueAt + ':00+09:00' : dueAt) <= now;
export const alerts = (s: State, id: number) => [
  ...s.inquiries
    .filter(
      (q) => q.leadId === id && !s.acknowledged.includes(q.id) && !q.reviewed,
    )
    .map((q) => ({
      id: q.id,
      label: '새 문의',
      text: q.raw['문의 내용'] || q.summary,
    })),
  ...s.notes
    .filter(
      (n) =>
        n.leadId === id &&
        n.kind === 'request' &&
        !s.acknowledged.includes(n.id),
    )
    .map((n) => ({ id: n.id, label: '본사 요청', text: n.text })),
  ...s.activities
    .filter(
      (a) =>
        a.leadId === id &&
        a.kind === 'assign' &&
        !s.acknowledged.includes(a.id),
    )
    .map((a) => ({ id: a.id, label: '새 배정', text: a.text })),
];
export type Action = (
  payload: Record<string, unknown>,
  message?: string,
  onFailure?: (failure: import('./crm-submit').SaveFailure) => void,
) => Promise<boolean>;
