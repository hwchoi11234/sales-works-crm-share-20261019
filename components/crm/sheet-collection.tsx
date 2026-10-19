'use client';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { receiptParts } from '@/lib/lead-fields';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Preview = {
  enabled: boolean;
  brandName: string; checkedAt: string; rowCount: number;
  missingAutoPhone: boolean; platformConfigured: boolean;
  invalid: { rowNumber: number; reason: string }[];
  rows: { id: string; rowNumber: number; sourceReceivedAt: string; importedAt: string;
    name: string; phone: string; metaAutoPhone: string; platform: string; region: string; status: string }[];
};
const date = (s: string) => s ? Object.values(receiptParts(s)).join(' ') : '—';
export function SheetCollection({ onSync }: { onSync: () => Promise<unknown> }) {
  const [data, setData] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const refresh = useCallback(async () => {
    const r = await fetch('/api/sheets', { cache: 'no-store', signal: AbortSignal.timeout(30000) });
    const json = await r.json() as Preview & { error?: string };
    if (!r.ok) throw new Error(json.error || '수집 정보를 확인하지 못했습니다.');
    setData(json);
  }, []);
  useEffect(() => { let mounted = true;
    const load = () => refresh().catch(e => { if (mounted) setError(e.message); });
    load(); const timer = setInterval(load, 60000);
    return () => { mounted = false; clearInterval(timer); };
  }, [refresh]);
  async function sync() {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    let saved = false;
    try {
      const r = await fetch('/api/sheets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(60000) });
      const json = await r.json() as { error?: string; addedLeads: number; addedInquiries: number; skipped: number; changedRows: number[] };
      if (!r.ok) throw new Error(json.error || '수집을 완료하지 못했습니다.');
      saved = true;
      setNotice(`새 고객 ${json.addedLeads}명 · 추가 문의 ${json.addedInquiries}건 · 이미 수집 ${json.skipped}건${json.changedRows.length ? ` · 원본 변경 ${json.changedRows.length}건 확인 필요` : ''}`);
      await refresh(); await onSync();
    } catch (e) { setError(saved ? '수집은 완료됐지만 화면을 갱신하지 못했습니다. 다시 확인해 주세요.' : e instanceof Error ? e.message : '수집 결과를 확인해 주세요. 같은 행은 다시 수집해도 중복 등록되지 않습니다.'); }
    finally { setBusy(false); }
  }
  return <section className="surface" style={{ padding: 20 }}>
    <div className="inline between"><div><h2>메타 DB 수집 목록</h2><p className="muted">딩딩파파 · 구글시트 원본 기준 / 전산 등록일시는 별도 보관</p></div>
      <Button disabled={busy || data?.enabled === false} onClick={sync}>{data?.enabled === false ? '수집 중지' : busy ? '수집 중…' : '지금 수집하기'}</Button></div>
    {data?.enabled === false && <p className="feedback">딩딩파파는 임시 데이터 모드입니다. 실제 구글시트를 읽거나 수집하지 않습니다.</p>}
    <p className="muted">로컬 수집기가 실행 중이면 1분마다 확인합니다. 새 고객은 미배정으로 등록됩니다.</p>
    {error && <p role="alert" className="feedback error">{error}</p>}
    {notice && <p role="status" className="feedback">{notice}</p>}
    {data && <>
      <p className="muted">원본 {data.rowCount}건 · 마지막 화면 확인 {date(data.checkedAt)}</p>
      {data.missingAutoPhone && <p className="feedback">시트에 ‘자동입력 연락처’ 열이 없습니다. 고객 연락처를 대신 복사하지 않고 미수집으로 표시합니다.</p>}
      {data.platformConfigured && <p className="muted">플랫폼 열이 없어 이 연결의 플랫폼은 메타로 지정했습니다.</p>}
      <div style={{ overflowX: 'auto' }}><Table className="min-w-[1100px]"><TableHeader><TableRow>
        {['원본 접수일자', '이름', '연락처', '자동입력 연락처', '플랫폼', '창업 희망지역', '전산 등록일시', '수집 상태'].map(h => <TableHead key={h}>{h}</TableHead>)}
      </TableRow></TableHeader><TableBody>{data.rows.map((r, index) => <TableRow key={`${r.id}:${index}`}>
        <TableCell>{date(r.sourceReceivedAt)}</TableCell><TableCell>{r.name}</TableCell><TableCell>{r.phone}</TableCell>
        <TableCell>{r.metaAutoPhone || '미수집'}</TableCell><TableCell>{r.platform}</TableCell><TableCell>{r.region}</TableCell>
        <TableCell>{date(r.importedAt)}</TableCell><TableCell>{r.status}</TableCell>
      </TableRow>)}</TableBody></Table></div>
      {data.invalid.map(r => <p role="alert" key={r.rowNumber}>수집 제외 · {r.rowNumber}행: {r.reason}</p>)}
    </>}
  </section>;
}
