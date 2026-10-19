'use client';
import { useState } from 'react';
import { matchesOwner, ownerFilterOptions } from '@/lib/owner-filter';
import { firstReceivedAt, receiptParts } from '@/lib/lead-fields';
import { performanceSnapshot, percent } from '@/lib/performance-chart-data';
import PerformanceCharts from './performance-charts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { today, weekStart, plusDay, localNow } from '@/lib/workflow';
import type { State, Lead } from '@/lib/types';
export function Performance({
  data,
  leads,
  drill,
  initialMonth = 'all',
  brandIds = data.brands.map((b) => b.id),
}: {
  data: State;
  leads: Lead[];
  initialMonth?: string;
  brandIds?: string[];
  drill: (ids: number[], label: string) => void;
}) {
  const receivedDays = leads
    .map((l) =>
      receiptParts(firstReceivedAt(l, data.inquiries)).date.replaceAll(
        '.',
        '-',
      ),
    )
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const allFrom = receivedDays[0] || today();
  const monthEnd = (month: string) =>
    new Date(
      Number(month.slice(0, 4)),
      Number(month.slice(5, 7)),
      0,
      12,
    ).toLocaleDateString('sv-SE');
  const months = [
    ...new Set([
      today().slice(0, 7),
      ...receivedDays.map((d) => d.slice(0, 7)),
      ...leads.map((l) =>
        receiptParts(l.updatedAt || l.createdAt)
          .date.replaceAll('.', '-')
          .slice(0, 7),
      ),
    ]),
  ]
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
    .sort()
    .reverse();
  const [from, setFrom] = useState(
      initialMonth === 'all'
        ? allFrom
        : initialMonth
          ? initialMonth + '-01'
          : today().slice(0, 7) + '-01',
    ),
    [to, setTo] = useState(
      initialMonth && initialMonth !== 'all'
        ? new Date(
            Number(initialMonth.slice(0, 4)),
            Number(initialMonth.slice(5, 7)),
            0,
            12,
          ).toLocaleDateString('sv-SE')
        : today(),
    ),
    [owner, setOwner] = useState('all'),
    [dateBasis, setDateBasis] = useState<'received' | 'updated'>('received');
  const basisLabel = dateBasis === 'updated' ? '수정' : '접수';
  const admin = data.role === 'admin' || data.role === 'client_admin',
    client = data.role === 'client',
    range = (d: string) => {
      const date =
        d.length > 10
          ? new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
          : d;
      return date >= from && date <= to;
    };
  const scoped = leads.filter((l) => matchesOwner(l.ownerId, owner)),
    ids = (client || owner === 'unassigned' ? scoped : leads).map((l) => l.id);
  const filterMembers = ownerFilterOptions(data.members, leads, [
    ...new Set(leads.map((l) => l.brandId)),
  ]);
  const notes = data.notes.filter(
    (n) =>
      ids.includes(n.leadId) &&
      n.kind === 'consultation' &&
      (!admin || matchesOwner(n.ownerId ?? null, owner)) &&
      range(
        new Date(n.createdAt).toLocaleDateString('sv-SE', {
          timeZone: 'Asia/Seoul',
        }),
      ),
  );
  const unique = (v: number[]) => [...new Set(v)],
    events = data.meetings.filter(
      (e) =>
        ids.includes(e.leadId) &&
        range(e.date) &&
        (!admin || matchesOwner(e.ownerId, owner)),
    );
  const now = localNow();
  const snapshot = performanceSnapshot(data, scoped, from, to, now, dateBasis);
  const measures: [string, number[], string][] = [
    [
      basisLabel + ' 고객',
      snapshot.cohort.map((l) => l.id),
      dateBasis === 'updated' ? '마지막 수정일 기준' : '최초 접수일 기준',
    ],
    ['진행 중', snapshot.active, '계약 완료·보류·종료 제외'],
    [
      '계약 완료',
      snapshot.contracts,
      `대상 대비 ${percent(snapshot.contracts.length, snapshot.cohort.length)}`,
    ],
    ['보류·종료', snapshot.paused, '현재 진행상태 기준'],
  ];
  const row = (memberId: string | null) => {
    const group = scoped.filter((l) => !memberId || l.ownerId === memberId),
      gids = group.map((l) => l.id),
      gn = notes.filter((n) =>
        memberId ? n.ownerId === memberId : ids.includes(n.leadId),
      ),
      gm = events.filter((e) => !memberId || e.ownerId === memberId);
    const assignment = data.activities.filter(
      (a) =>
        a.kind === 'assign' &&
        range(a.createdAt) &&
        (!memberId || a.ownerId === memberId) &&
        ids.includes(a.leadId),
    );
    const untouched = group
      .filter(
        (l) =>
          !data.notes.some(
            (n) =>
              n.leadId === l.id &&
              ['통화 완료', '부재', '연락처 오류'].includes(n.outcome || ''),
          ),
      )
      .map((l) => l.id);
    const overdue = data.callbacks
      .filter(
        (t) => gids.includes(t.leadId) && t.status === '예정' && t.dueAt < now,
      )
      .map((t) => t.leadId);
    const signed = data.activities
      .filter(
        (a) =>
          a.kind === 'status' &&
          a.status === '계약 완료' &&
          range(a.createdAt) &&
          ids.includes(a.leadId) &&
          (!memberId || a.ownerId === memberId),
      )
      .map((a) => a.leadId);
    const metrics: [string, number[]][] = [
      ['신규 배정', unique(assignment.map((a) => a.leadId))],
      [
        '실제 통화',
        unique(
          gn.filter((n) => n.outcome === '통화 완료').map((n) => n.leadId),
        ),
      ],
      [
        '부재·번호 오류',
        unique(
          gn
            .filter((n) => ['부재', '연락처 오류'].includes(n.outcome || ''))
            .map((n) => n.leadId),
        ),
      ],
      [
        '미팅 예정',
        unique(gm.filter((e) => e.status === '예정').map((e) => e.leadId)),
      ],
      [
        '미팅 완료',
        unique(gm.filter((e) => e.status === '완료').map((e) => e.leadId)),
      ],
      [
        '취소·불참',
        unique(
          gm
            .filter((e) => ['취소', '불참'].includes(e.status))
            .map((e) => e.leadId),
        ),
      ],
      ['계약 전환', unique(signed)],
      ['현재 미접촉', untouched],
      ...(!client
        ? [['현재 연락 지연', unique(overdue)] as [string, number[]]]
        : []),
    ];
    // Client payload intentionally excludes internal notes and assignment history.
    // Display only metrics that can be computed completely from its authorized records.
    return client
      ? metrics.filter(([label]) =>
          ['미팅 예정', '미팅 완료', '취소·불참', '계약 전환'].includes(label),
        )
      : metrics;
  };
  const groups = admin
    ? owner === 'unassigned'
      ? [{ id: '', name: '미배정 고객' }]
      : filterMembers.filter((m) => owner === 'all' || m.id === owner)
    : [
        {
          id: data.user.memberId || '',
          name: client
            ? owner === 'all'
              ? '자사 브랜드 합계'
              : owner === 'unassigned'
                ? '미배정 고객'
                : (filterMembers.find((m) => m.id === owner)?.name ||
                    '선택 담당자') + ' 담당 고객'
            : data.actor,
        },
      ];
  const groupRows = groups.map((m) => ({ ...m, values: row(m.id || null) }));
  const compareGroups = client
    ? data.brands.map((b) => ({
        name: b.name,
        items: snapshot.cohort.filter((l) => l.brandId === b.id),
      }))
    : data.members
        .filter((m) => owner === 'all' || m.id === owner)
        .map((m) => ({
          name: m.name,
          items: snapshot.cohort.filter((l) => l.ownerId === m.id),
        }));
  const comparison = compareGroups.map((g) => ({
    name: g.name,
    total: g.items.length,
    ids: g.items.filter((l) => l.status === '계약 완료').map((l) => l.id),
    color: '#218267',
  }));
  const contactTimes = scoped
    .map((l) => {
      const n = data.notes
        .filter(
          (n) =>
            n.leadId === l.id &&
            ['통화 완료', '부재', '연락처 오류'].includes(n.outcome || ''),
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!n || !range(n.createdAt)) return null;
      const assign = data.activities
        .filter(
          (a) =>
            a.leadId === l.id &&
            a.kind === 'assign' &&
            a.createdAt <= n.createdAt,
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      return Math.max(
        0,
        (Date.parse(n.createdAt) -
          Date.parse(assign?.createdAt || l.createdAt)) /
          3600000,
      );
    })
    .filter((n): n is number => n !== null);
  return (
    <>
      <div className="inline table-tools surface">
        <NativeSelect
          aria-label="성과 조회월"
          value={
            from === allFrom && to === today()
              ? 'all'
              : from.endsWith('-01') && to === monthEnd(from.slice(0, 7))
                ? from.slice(0, 7)
                : 'custom'
          }
          onChange={(e) => {
            if (e.target.value === 'all') {
              setFrom(allFrom);
              setTo(today());
            } else if (e.target.value !== 'custom') {
              setFrom(e.target.value + '-01');
              setTo(monthEnd(e.target.value));
            }
          }}
        >
          <option value="all">전체 기간</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m.replace('-', '년 ')}월
            </option>
          ))}
          <option value="custom" disabled>
            직접 설정 기간
          </option>
        </NativeSelect>
        <NativeSelect
          aria-label="성과 조회 기준"
          value={dateBasis}
          onChange={(e) =>
            setDateBasis(e.target.value as 'received' | 'updated')
          }
        >
          <option value="received">최초 접수일 기준</option>
          <option value="updated">마지막 수정일 기준</option>
        </NativeSelect>
        <Button
          variant="outline"
          onClick={() => {
            setFrom(weekStart());
            setTo(today());
          }}
        >
          이번 주
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setFrom(plusDay(weekStart(), -7));
            setTo(plusDay(weekStart(), -1));
          }}
        >
          지난주
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setFrom(today().slice(0, 7) + '-01');
            setTo(today());
          }}
        >
          이번 달
        </Button>
        <label htmlFor="performance-field-1">
          조회 시작
          <Input
            id="performance-field-1"
            type="date"
            aria-label="성과 시작일"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label htmlFor="performance-field-2">
          조회 종료
          <Input
            id="performance-field-2"
            type="date"
            aria-label="성과 종료일"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {(admin || client) && (
          <NativeSelect
            aria-label="성과 담당자"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option value="all">전체 담당자</option>
            <option value="unassigned">미배정</option>
            {filterMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>
      {!from || !to || from > to ? (
        <p role="alert">시작일은 종료일보다 빠르게 선택해 주세요.</p>
      ) : (
        <>
          <p className="cohort-caption">
            {owner !== 'all' && (
              <>
                <strong>
                  {owner === 'unassigned'
                    ? '미배정'
                    : filterMembers.find((m) => m.id === owner)?.name ||
                      '선택 담당자'}
                </strong>{' '}
                · 현재 배정 기준
                <br />
              </>
            )}
            {from} ~ {to} {basisLabel} 고객의 <strong>현재 결과</strong>입니다.{' '}
            {dateBasis === 'updated'
              ? '마지막 내용 변경 시각 기준이며, 조회·알림 확인은 제외합니다.'
              : '최초 문의 접수일 기준이며, 재문의는 중복 집계하지 않습니다.'}
          </p>
          <div className="metric-row result-metrics">
            {measures.map(([label, ids, description]) => (
              <button
                className="metric"
                key={label}
                onClick={() => drill(ids, label)}
              >
                <span>
                  {label}
                  <small>{description}</small>
                </span>
                <strong>
                  {ids.length}
                  <small>명</small>
                </strong>
              </button>
            ))}
          </div>
          <PerformanceCharts
            basisLabel={basisLabel}
            statuses={snapshot.statuses}
            attention={snapshot.attention}
            comparisons={comparison}
            total={snapshot.cohort.length}
            scopeCount={scoped.length}
            admin={admin}
            client={client}
            drill={drill}
          />
          <details className="surface performance activity-details">
            <summary>
              기간 내 활동 기록 상세{' '}
              <span>
                {client ? '미팅·계약 건수 확인' : '통화·미팅·배정 건수 확인'}
              </span>
            </summary>

            <h2>
              {admin
                ? '담당자별 영업활동'
                : client
                  ? '브랜드 영업활동'
                  : '내 영업활동'}
            </h2>
            <p className="muted">
              {from} ~ {to}에 발생한 활동입니다. 위 그래프와 달리 이전에 접수한
              고객의 활동도 포함합니다.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>담당자</TableHead>
                  <TableHead>현재 배정</TableHead>
                  {row(null).map(([label]) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupRows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.name}</TableCell>
                    <TableCell>
                      <button
                        className="link"
                        onClick={() =>
                          drill(
                            scoped
                              .filter((l) => !m.id || l.ownerId === m.id)
                              .map((l) => l.id),
                            '현재 배정',
                          )
                        }
                      >
                        {
                          scoped.filter((l) => !m.id || l.ownerId === m.id)
                            .length
                        }
                      </button>
                    </TableCell>
                    {m.values.map(([label, ids]) => (
                      <TableCell key={label}>
                        <button
                          className="link"
                          onClick={() => drill(ids, m.name + ' · ' + label)}
                        >
                          {ids.length}
                        </button>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!client && (
              <p className="muted">
                첫 연락까지 평균{' '}
                {contactTimes.length
                  ? (
                      contactTimes.reduce((a, b) => a + b, 0) /
                      contactTimes.length
                    ).toFixed(1) + '시간'
                  : '집계 전'}{' '}
                · 배정 기록이 없으면 접수 시각을 기준으로 합니다.
              </p>
            )}
            <p className="muted">
              {client
                ? '미팅은 일정 날짜, 계약 전환은 계약 완료로 변경한 날짜 기준입니다.'
                : '‘현재’ 항목은 조회 시점의 잔여 업무입니다. 연락 결과가 없는 기존 메모는 통화 실적에 포함하지 않습니다.'}
            </p>
          </details>
        </>
      )}
    </>
  );
}
