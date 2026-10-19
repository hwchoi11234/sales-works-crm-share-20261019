'use client';
import { useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  Megaphone,
  Search,
  UsersRound,
} from 'lucide-react';
import type { State } from '@/lib/types';
import {
  agencyServices,
  brandServices,
  type AgencyService,
} from '@/lib/agency';
import { agencyRows } from '@/lib/agency-overview';
import { firstReceivedAt, receiptParts } from '@/lib/lead-fields';
import { today } from '@/lib/workflow';
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

export function AgencyOverview({
  data,
  category,
  month,
  setMonth,
  onCategoryChange,
  openBrand,
  issueAccount,
  editBrand,
}: {
  data: State;
  category: AgencyService;
  month: string;
  setMonth: (month: string) => void;
  onCategoryChange: (category: AgencyService) => void;
  openBrand: (id: string, destination: 'db' | 'performance') => void;
  issueAccount?: (id: string) => void;
  editBrand?: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const sales = category === '영업대행';
  const months = [
    ...new Set([
      today().slice(0, 7),
      ...data.leads
        .map((l) =>
          receiptParts(firstReceivedAt(l, data.inquiries))
            .date.replaceAll('.', '-')
            .slice(0, 7),
        )
        .filter((d) => /^\d{4}-\d{2}$/.test(d)),
    ]),
  ]
    .sort()
    .reverse();
  const from = month === 'all' ? '2000-01-01' : month + '-01';
  const to = month === 'all' ? '9999-12-31' : month + '-31';
  const rows = agencyRows(data, 'all', category, from, to)
    .filter(
      (r) =>
        r.brand.name.toLowerCase().includes(query.trim().toLowerCase()) ||
        r.brand.company.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => a.brand.name.localeCompare(b.brand.name, 'ko'));
  const total = rows.reduce((n, r) => n + r.leads.length, 0);
  const contracted = rows.reduce((n, r) => n + r.contracts, 0);
  return (
    <section className="agency-directory">
      <div className="agency-switch" aria-label="업체 유형 선택">
        {agencyServices.map((service) => {
          const Icon = service === '영업대행' ? UsersRound : Megaphone;
          const count = data.brands.filter((b) =>
            brandServices(b).includes(service),
          ).length;
          return (
            <button
              key={service}
              className={
                'agency-switch-item ' + (category === service ? 'selected' : '')
              }
              aria-pressed={category === service}
              onClick={() => {
                onCategoryChange(service);
                setQuery('');
              }}
            >
              <span className="agency-switch-icon">
                <Icon size={21} />
              </span>
              <span>
                <strong>{service}</strong>
                <small>
                  {service === '영업대행'
                    ? '상담 진행과 계약 현황'
                    : '문의 유입과 광고 현황'}
                </small>
              </span>
              <span className="agency-switch-count">
                {count}
                <small>업체</small>
              </span>
            </button>
          );
        })}
      </div>
      <section className="agency-directory-panel">
        <div className="agency-directory-toolbar">
          <div className="agency-search">
            <Search size={17} />
            <Input
              aria-label="업체 검색"
              placeholder="업체명 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <label className="agency-month">
            접수월
            <NativeSelect
              aria-label="업체 성과 접수월"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              <option value="all">전체 기간</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m.replace('-', '년 ')}월
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
        <div className="agency-list-summary">
          <span>
            <strong>{rows.length}</strong>개 업체
          </span>
          <span>
            접수 고객 <strong>{total.toLocaleString()}</strong>명
          </span>
          {sales && (
            <span>
              계약 완료 <strong>{contracted}</strong>명
            </span>
          )}
          <small>
            {data.role === 'staff' ? '내 배정 고객 기준' : '최초 접수일 기준'}
          </small>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>업체</TableHead>
              <TableHead className="agency-number">접수 고객</TableHead>
              {sales ? (
                <>
                  <TableHead className="agency-number agency-optional">
                    진행 중
                  </TableHead>
                  <TableHead className="agency-number">계약 완료</TableHead>
                  <TableHead className="agency-number agency-optional">
                    계약률
                  </TableHead>
                </>
              ) : (
                <TableHead className="agency-optional">
                  문의 유입 경로
                </TableHead>
              )}
              <TableHead>바로가기</TableHead>
              {issueAccount && (
                <TableHead>
                  <span className="sr-only">업체 설정</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.brand.id}>
                <TableCell>
                  <div className="agency-company">
                    <span
                      className={
                        'agency-company-icon ' + (sales ? 'sales' : '')
                      }
                    >
                      <Building2 size={17} />
                    </span>
                    <div>
                      <button
                        className="agency-name"
                        onClick={() => openBrand(r.brand.id, 'db')}
                      >
                        {r.brand.name}
                      </button>
                      {!r.brand.active && <small>비활성 업체</small>}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="agency-number">
                  <strong>{r.leads.length}</strong>
                  <span className="agency-unit">명</span>
                </TableCell>
                {sales ? (
                  <>
                    <TableCell className="agency-number agency-optional">
                      {r.active}
                    </TableCell>
                    <TableCell className="agency-number agency-contract">
                      {r.contracts}
                    </TableCell>
                    <TableCell className="agency-number agency-optional">
                      {r.leads.length
                        ? `${((100 * r.contracts) / r.leads.length).toFixed(1)}%`
                        : '—'}
                    </TableCell>
                  </>
                ) : (
                  <TableCell className="agency-optional">
                    <div className="agency-source-tags">
                      {[
                        ...new Set(r.sources.map((s) => s.split(' · ')[0])),
                      ].map((source) => (
                        <span key={source}>{source}</span>
                      ))}
                      {!r.sources.length && (
                        <span className="muted">접수 내역 없음</span>
                      )}
                    </div>
                  </TableCell>
                )}
                <TableCell>
                  <div className="agency-row-actions">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openBrand(r.brand.id, 'db')}
                    >
                      고객 DB <ArrowUpRight size={13} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openBrand(r.brand.id, 'performance')}
                    >
                      성과
                    </Button>
                  </div>
                </TableCell>
                {issueAccount && (
                  <TableCell>
                    <details className="agency-row-menu">
                      <summary aria-label={`${r.brand.name} 업체 설정`}>
                        ···
                      </summary>
                      <div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => issueAccount(r.brand.id)}
                        >
                          계정 발급
                        </Button>
                        {editBrand && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => editBrand(r.brand.id)}
                          >
                            대행 유형 수정
                          </Button>
                        )}
                      </div>
                    </details>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={sales ? 7 : 5}>
                  <div className="agency-empty">
                    {query
                      ? '검색한 업체가 없습니다.'
                      : '등록된 업체가 없습니다.'}
                    <small>
                      {query
                        ? '다른 업체명으로 검색해 주세요.'
                        : '관리자 설정에서 업체를 등록해 주세요.'}
                    </small>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
      <details className="agency-definition">
        <summary>집계 기준{!sales ? ' · 광고 지표 연동 안내' : ''}</summary>
        <p>
          선택한 접수월에 처음 문의한 고객의 현재 결과입니다. 계약률은 계약 완료
          고객 ÷ 접수 고객이며, 해당 월에 체결된 계약 건수를 뜻하지 않습니다.
          복수 대행 업체는 각 유형에서 조회됩니다.
        </p>
        {!sales && (
          <p>
            광고비·노출·클릭·문의당 비용은 아직 미연동입니다. 지금은 전산에
            저장된 문의를 표시합니다.
          </p>
        )}
      </details>
    </section>
  );
}
