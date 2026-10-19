'use client';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
export function CallContext({
  summary,
  history,
  count,
}: {
  summary: ReactNode;
  history: ReactNode;
  count: number;
}) {
  const [tab, setTab] = useState('summary');
  return (
    <aside className="call-context">
      <nav className="call-context-tabs" aria-label="고객 참고 정보">
        <Button
          size="sm"
          variant={tab === 'summary' ? 'default' : 'ghost'}
          aria-pressed={tab === 'summary'}
          onClick={() => setTab('summary')}
        >
          고객 요약
        </Button>
        <Button
          size="sm"
          variant={tab === 'history' ? 'default' : 'ghost'}
          aria-pressed={tab === 'history'}
          onClick={() => setTab('history')}
        >
          상담 이력 {count}
        </Button>
      </nav>
      <div className="call-context-scroll">
        {tab === 'summary' ? summary : history}
      </div>
    </aside>
  );
}
