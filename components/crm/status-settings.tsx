'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import type { State } from '@/lib/types';
import type { Action } from '@/lib/workflow';
export function StatusSettings({
  data,
  action,
  busy,
}: {
  data: State;
  action: Action;
  busy: boolean;
}) {
  const [name, setName] = useState('');
  return (
    <section className="surface status-settings">
      <form
        className="table-tools"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await action(
              { action: 'statusOption', name },
              '진행상태를 추가했습니다.',
            )
          )
            setName('');
        }}
      >
        <label htmlFor="new-status-name">진행상태 추가</label>
        <Input
          id="new-status-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          placeholder="예: 점포 계약 진행중"
          required
        />
        <Button disabled={busy || !name.trim()}>추가</Button>
      </form>
      <p className="muted status-help">
        추가한 상태는 전체 브랜드의 고객 목록과 상담 기록에서 선택할 수
        있습니다. 사용 중지해도 기존 고객과 이력은 유지됩니다.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>진행상태</TableHead>
            <TableHead>사용 고객</TableHead>
            <TableHead>사용 여부</TableHead>
            <TableHead>관리</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.statusOptions.map((s) => (
            <TableRow key={s.name}>
              <TableCell>{s.name}</TableCell>
              <TableCell>
                {data.leads.filter((l) => l.status === s.name).length}명
              </TableCell>
              <TableCell>{s.active ? '사용 중' : '사용 중지'}</TableCell>
              <TableCell>
                {s.builtIn ? (
                  <span className="muted">기본 항목 · 업무 연동</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      action(
                        {
                          action: 'statusOptionToggle',
                          name: s.name,
                          active: !s.active,
                        },
                        s.active
                          ? '새 선택을 중지했습니다. 기존 기록은 유지됩니다.'
                          : '진행상태를 다시 사용할 수 있습니다.',
                      )
                    }
                    aria-label={`${s.name} ${s.active ? '사용 중지' : '다시 사용'}`}
                  >
                    {s.active ? '사용 중지' : '다시 사용'}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
