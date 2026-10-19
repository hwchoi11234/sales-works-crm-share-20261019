import { firstReceivedAt, receiptParts } from './lead-fields';
import type { Lead, State } from './types';

export type ResultBar = {
  name: string;
  ids: number[];
  total: number;
  color: string;
};
export type AttentionBar = ResultBar & { description: string };
const colors: Record<string, string> = {
  신규: '#71839e',
  '상담 중': '#386ad7',
  '미팅 예정': '#3e8bba',
  '부동산 임장중': '#9469bc',
  '계약 검토': '#c28a28',
  '계약 완료': '#218267',
  보류: '#ac8444',
  종료: '#8b909b',
};
export const percent = (count: number, total: number) =>
  total ? `${((count / total) * 100).toFixed(1)}%` : '—';

/** Input leads must already be scoped to the viewer's brands and selected current owner. */
export function performanceSnapshot(
  data: Pick<
    State,
    'inquiries' | 'notes' | 'meetings' | 'callbacks' | 'statusOptions' | 'role'
  >,
  leads: Lead[],
  from: string,
  to: string,
  now: string,
  dateBasis: 'received' | 'updated' = 'received',
) {
  const cohort =
    from && to && from <= to
      ? leads.filter((l) => {
          const day = receiptParts(
            dateBasis === 'updated'
              ? l.updatedAt || l.createdAt
              : firstReceivedAt(l, data.inquiries),
          ).date.replaceAll('.', '-');
          return day >= from && day <= to;
        })
      : [];
  const ids = (items: Lead[]) => items.map((l) => l.id);
  const statusNames = [
    ...new Set([
      ...data.statusOptions.map((s) => s.name),
      ...cohort.map((l) => l.status),
    ]),
  ];
  const statuses: ResultBar[] = statusNames
    .map((name) => ({
      name,
      ids: ids(cohort.filter((l) => l.status === name)),
      total: cohort.length,
      color: colors[name] || '#6878af',
    }))
    .filter(
      (s) =>
        s.ids.length > 0 ||
        data.statusOptions.some((o) => o.name === s.name && o.active),
    );
  const contracts = ids(cohort.filter((l) => l.status === '계약 완료'));
  const paused = ids(cohort.filter((l) => ['보류', '종료'].includes(l.status)));
  const active = ids(
    cohort.filter((l) => !['계약 완료', '보류', '종료'].includes(l.status)),
  );
  // Internal management queues use all current customers, including old intake.
  // Client payload omits private notes/callbacks: never infer "untouched" from it.
  const attention: AttentionBar[] = [];
  if (data.role !== 'client') {
    const actionable = leads.filter(
      (l) => !['계약 완료', '종료'].includes(l.status),
    );
    const assigned = actionable.filter((l) => l.ownerId);
    const attempted = new Set(
      data.notes
        .filter(
          (n) =>
            n.kind === 'consultation' &&
            ['통화 완료', '부재', '연락처 오류'].includes(n.outcome || ''),
        )
        .map((n) => n.leadId),
    );
    const scheduled = new Set(
      data.callbacks.filter((c) => c.status === '예정').map((c) => c.leadId),
    );
    for (const m of data.meetings) {
      if (m.status === '예정' && `${m.date}T${m.end}` >= now)
        scheduled.add(m.leadId);
    }
    const overdue = new Set(
      data.callbacks
        .filter((c) => c.status === '예정' && c.dueAt < now)
        .map((c) => c.leadId),
    );
    if (data.role === 'admin')
      attention.push({
        name: '미배정',
        ids: ids(actionable.filter((l) => !l.ownerId)),
        total: actionable.length,
        color: '#9469bc',
        description: '담당자 배정이 필요한 고객',
      });
    attention.push(
      {
        name: '접촉 기록 없음',
        ids: ids(assigned.filter((l) => !attempted.has(l.id))),
        total: assigned.length,
        color: '#c28a28',
        description: '통화·부재·번호 오류 기록 없음 · 기존 메모는 확인 필요',
      },
      {
        name: '연락 지연',
        ids: ids(assigned.filter((l) => overdue.has(l.id))),
        total: assigned.length,
        color: '#c4493e',
        description: '예약한 재연락 시간이 지난 고객',
      },
      {
        name: '다음 약속 없음',
        ids: ids(
          assigned.filter((l) => attempted.has(l.id) && !scheduled.has(l.id)),
        ),
        total: assigned.length,
        color: '#637b9b',
        description: '연락 기록은 있지만 예정 재연락·앞으로의 미팅이 없는 고객',
      },
    );
  }
  return { cohort, statuses, contracts, paused, active, attention };
}
