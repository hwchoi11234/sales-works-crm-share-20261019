'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  percent,
  type ResultBar,
  type AttentionBar,
} from '@/lib/performance-chart-data';

function Bars({
  bars,
  drill,
  ratio = false,
}: {
  bars: ResultBar[];
  drill: (ids: number[], label: string) => void;
  ratio?: boolean;
}) {
  return (
    <div className="comparison-bars decision-bars">
      {bars.map((b) => (
        <button
          key={b.name}
          className="comparison-row"
          disabled={!b.ids.length}
          aria-label={`${b.name} ${b.ids.length}명${ratio ? ` / ${b.total}명, ${percent(b.ids.length, b.total)}` : ''} 고객 보기`}
          onClick={() => drill(b.ids, b.name)}
        >
          <span>{b.name}</span>
          <span className="bar-track" aria-hidden="true">
            <span
              style={{
                width: `${b.total ? (b.ids.length / b.total) * 100 : 0}%`,
                background: b.color,
              }}
            />
          </span>
          <strong>
            {b.ids.length}
            <small>명</small>
            {ratio && (
              <small className="ratio-label">
                {percent(b.ids.length, b.total)}
              </small>
            )}
          </strong>
        </button>
      ))}
    </div>
  );
}
export default function PerformanceCharts({
  basisLabel,
  statuses,
  attention,
  comparisons,
  total,
  scopeCount,
  admin,
  client,
  drill,
}: {
  basisLabel: string;
  statuses: ResultBar[];
  attention: AttentionBar[];
  comparisons: ResultBar[];
  total: number;
  scopeCount: number;
  admin: boolean;
  client: boolean;
  drill: (ids: number[], label: string) => void;
}) {
  const [view, setView] = useState<'attention' | 'contracts'>('attention');
  const showContracts = client || (admin && view === 'contracts');
  return (
    <div className="performance-charts decision-charts">
      <section className="surface chart-card">
        <div className="chart-heading">
          <div>
            <h2>{basisLabel} 고객의 현재 진행상태</h2>
            <p>
              선택 기간에 {basisLabel}된 {total}명 기준 · 막대를 누르면 고객
              보기
            </p>
          </div>
          <span className="chart-scope">{basisLabel} 기간 기준</span>
        </div>
        {total ? (
          <Bars bars={statuses} ratio drill={drill} />
        ) : (
          <p className="decision-empty">
            선택한 기간에 {basisLabel}된 고객이 없습니다.
          </p>
        )}
        <p className="chart-footnote">
          각 고객의 현재 상태를 한 번씩 집계합니다. 단계별 누적 전환율은
          아닙니다.
        </p>
      </section>
      <section className="surface chart-card">
        <div className="chart-heading">
          <div>
            <h2>
              {showContracts
                ? client
                  ? '브랜드별 계약 완료 비율'
                  : '담당자별 계약 완료 비율'
                : '지금 확인할 고객'}
            </h2>
            <p>
              {showContracts
                ? `계약 완료 / 선택 기간 ${basisLabel} 고객${client ? ' · 자사 브랜드 기준' : ' · 현재 담당자 기준'}`
                : `전체 보유 ${scopeCount}명에서 확인 · 조회 기간과 무관`}
            </p>
          </div>
          <span className="chart-scope">
            {showContracts ? `${basisLabel} 기간 기준` : '현재 전체 기준'}
          </span>
        </div>
        {admin && (
          <div className="chart-tabs">
            <Button
              size="sm"
              variant={view === 'attention' ? 'default' : 'outline'}
              aria-pressed={view === 'attention'}
              onClick={() => setView('attention')}
            >
              관리 필요
            </Button>
            <Button
              size="sm"
              variant={view === 'contracts' ? 'default' : 'outline'}
              aria-pressed={view === 'contracts'}
              onClick={() => setView('contracts')}
            >
              담당자별 계약
            </Button>
          </div>
        )}
        {showContracts ? (
          <>
            <div className="contract-comparisons">
              {comparisons.map((b) => (
                <button
                  className="contract-comparison"
                  key={b.name}
                  disabled={!b.total}
                  onClick={() => drill(b.ids, b.name + ' · 현재 계약 완료')}
                  aria-label={`${b.name} 계약 완료 ${b.ids.length}명 / ${basisLabel} ${b.total}명, ${percent(b.ids.length, b.total)}`}
                >
                  <span>{b.name}</span>
                  <span className="bar-track" aria-hidden="true">
                    <span
                      style={{
                        width: `${b.total ? (b.ids.length / b.total) * 100 : 0}%`,
                        background: b.color,
                      }}
                    />
                  </span>
                  <strong>
                    {percent(b.ids.length, b.total)}
                    <small>
                      {b.ids.length} / {b.total}명
                    </small>
                  </strong>
                </button>
              ))}
            </div>
            <p className="chart-footnote">
              {client
                ? '자사 브랜드 고객만 집계합니다. 대상 고객 수와 유입 시점을 함께 확인하세요.'
                : '배정 변경 시 현재 담당자에 집계됩니다. 대상 고객 수와 고객 유입 시점을 함께 확인하세요.'}
            </p>
          </>
        ) : (
          <>
            <div className="attention-bars">
              {attention.map((b) => (
                <button
                  className="attention-row"
                  key={b.name}
                  disabled={!b.ids.length}
                  onClick={() => drill(b.ids, b.name)}
                  aria-label={`${b.name} ${b.ids.length}명 고객 보기`}
                >
                  <span className="attention-title">
                    <span>{b.name}</span>
                    <strong style={{ color: b.color }}>
                      {b.ids.length}
                      <small>명</small>
                    </strong>
                  </span>
                  <span className="bar-track" aria-hidden="true">
                    <span
                      style={{
                        width: `${scopeCount ? (b.ids.length / scopeCount) * 100 : 0}%`,
                        background: b.color,
                      }}
                    />
                  </span>
                  <span className="attention-description">{b.description}</span>
                </button>
              ))}
            </div>
            <p className="chart-footnote">
              계약 완료·종료 제외, 보류 포함. 항목 간 같은 고객이 겹칠 수
              있습니다.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
