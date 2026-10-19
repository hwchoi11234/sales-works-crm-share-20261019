'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import type { State } from '@/lib/types';
import { receiptParts } from '@/lib/lead-fields';
import type { Action } from '@/lib/workflow';
export function RecontactLobby({
  data,
  brand,
  action,
  busy,
  openLead,
}: {
  data: State;
  brand: string;
  action: Action;
  busy: boolean;
  openLead: (id: number) => void;
}) {
  const [query, setQuery] = useState('');
  const items = (data.recontactLeads || []).filter(
    (l) =>
      (brand === 'all' || l.brandId === brand) &&
      [
        l.name,
        l.region,
        data.members.find((m) => m.id === l.ownerId)?.name || '',
      ].some((v) => v.includes(query.trim())),
  );
  return (
    <section className="surface recontact-lobby">
      <div className="recontact-rule">
        <strong>마지막 수정 후 20일 경과</strong>
        <span>계약 완료·종료, 앞으로의 재연락·미팅 약속이 있는 고객 제외</span>
      </div>
      <p className="muted">
        {data.role === 'admin'
          ? '브랜드별 재컨택 가능 고객을 확인합니다. 인수는 영업사원 계정에서 진행합니다.'
          : '내가 재컨택하기를 누르면 담당자가 나로 변경되고 기존 상담 이력이 연결됩니다. 기존 담당자는 이후 이 고객에 접근할 수 없습니다.'}
      </p>
      <div className="inline table-tools">
        <Input
          aria-label="사랑방 고객 검색"
          placeholder="고객명 · 지역 · 기존 담당자 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <strong>{items.length}명</strong>
        <span className="muted">오래된 수정일 순</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {[
              '브랜드',
              '고객명',
              '희망 지역 · 창업 형태',
              '진행상태',
              '기존 담당자',
              '마지막 수정일',
              '경과',
              '',
            ].map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((l) => (
            <TableRow key={l.id}>
              <TableCell>
                {data.brands.find((b) => b.id === l.brandId)?.name}
              </TableCell>
              <TableCell>{l.name}</TableCell>
              <TableCell>
                {l.region}
                <small className="muted lobby-subline">{l.startupType}</small>
              </TableCell>
              <TableCell>{l.status}</TableCell>
              <TableCell>
                {data.members.find((m) => m.id === l.ownerId)?.name ||
                  '이전 담당자'}
              </TableCell>
              <TableCell>
                <time dateTime={l.updatedAt}>
                  {receiptParts(l.updatedAt).date}
                  <small className="muted lobby-subline">
                    {receiptParts(l.updatedAt).time}
                  </small>
                </time>
              </TableCell>
              <TableCell>
                <strong>{l.idleDays}일</strong>
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    if (data.role === 'admin') return openLead(l.id);
                    if (
                      await action(
                        { action: 'claimRecontact', leadId: l.id },
                        '재컨택 담당자로 배정됐습니다. 기존 상담을 확인하고 연락해 주세요.',
                      )
                    )
                      openLead(l.id);
                  }}
                >
                  {data.role === 'admin' ? '고객 보기' : '내가 재컨택하기'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!items.length && (
        <p className="decision-empty">
          현재 조건에 맞는 재컨택 가능 고객이 없습니다.
        </p>
      )}
      <details className="chart-data">
        <summary>수정일·인수 기준</summary>
        <p>
          상담·메모, 진행상태, 담당자, 창업조건, 재문의, 일정 변경 시 수정일이
          갱신됩니다. 조회·알림 확인은 포함하지 않습니다. 20일은 마지막 수정
          시각부터 480시간입니다. 허용된 브랜드만 표시하고 본사 계정에는
          사랑방을 제공하지 않습니다. 기존 담당 고객과 미배정 고객은 대상에서
          제외합니다. 인수 후 20일을 다시 계산하며, 동시에 인수하면 먼저 완료한
          한 명에게만 배정됩니다.
        </p>
      </details>
    </section>
  );
}
