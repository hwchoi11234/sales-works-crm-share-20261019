'use client';
import { useState } from 'react';
import type { Lead } from '@/lib/types';
import { emptyScoreAnswers, scoreCriteria, scoreResult } from '@/lib/lead-score';
import { NativeSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { Action } from '@/lib/workflow';
export function LeadScoreEditor({ lead, action, busy, onSaved }: { lead: Lead; action: Action; busy: boolean; onSaved: () => void }) {
  const [answers, setAnswers] = useState(lead.qualification?.answers || emptyScoreAnswers());
  const [reason, setReason] = useState(lead.qualification?.reason || '');
  const result = scoreResult({ answers, reason, author: '', updatedAt: '' });
  return <form className="modal-form" onSubmit={async e => { e.preventDefault(); if (await action({ action: 'score', leadId: lead.id, answers, reason }, '고객 DB 평가를 저장했습니다.')) onSaved(); }}>
    <strong>{lead.name} · {result.label}</strong>
    <p className="muted">상담에서 확인한 정보로 평가하세요. 각 항목 최대 25점, 총 100점입니다. 미확인 항목이 있으면 미평가로 유지합니다.</p>
    {scoreCriteria.map(c => <label key={c.key} htmlFor={`score-${c.key}`}>{c.label}
      <NativeSelect id={`score-${c.key}`} value={answers[c.key] === null ? '' : String(answers[c.key])} disabled={busy} onChange={e => setAnswers(a => ({ ...a, [c.key]: e.target.value === '' ? null : Number(e.target.value) }))}>
        {c.options.map((label, i) => <option key={label} value={i === 0 ? '' : [0,10,20,25][i-1]}>{label}{i > 0 ? ` · ${[0,10,20,25][i-1]}점` : ''}</option>)}
      </NativeSelect></label>)}
    <label htmlFor="score-reason">평가 근거 (선택)<Textarea id="score-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={500} disabled={busy} placeholder="예: 2개월 안에 창업 희망, 자기자금 확보 여부 확인" /></label>
    <p className="muted">A 80점 이상 · B 60점 이상 · C 40점 이상 · D 40점 미만. 내부 상담 우선순위 참고용이며 계약 가능성을 보장하지 않습니다. 수정 이력은 보존됩니다.</p>
    <Button type="submit" disabled={busy}>{busy ? '저장 중…' : '평가 저장'}</Button>
  </form>;
}
