'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Note } from '@/lib/types';
import { dateLabel } from '@/lib/workflow';

export function RecentConsultation({ note }: { note: Note }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="call-recent" aria-label="최근 상담">
      <div className="inline between">
        <strong>최근 상담</strong>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-expanded={expanded}
          aria-controls={`recent-note-${note.id}`}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '접기' : '전체 보기'}
        </Button>
      </div>
      <div className="call-recent-meta">
        <time>{dateLabel(note.createdAt)}</time> · {note.author}
        {note.scope === 'internal' ? ' · 내부 메모' : ' · 공유 상담'}
      </div>
      <p
        id={`recent-note-${note.id}`}
        className={expanded ? '' : 'call-recent-preview'}
      >
        {note.text}
      </p>
    </section>
  );
}
