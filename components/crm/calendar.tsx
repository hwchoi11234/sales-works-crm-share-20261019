'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { today, localNow } from '@/lib/workflow';
import type { State, Lead, Meeting, Callback } from '@/lib/types';
export function Calendar({
  data,
  leads,
  openCallback,
  openMeeting,
}: {
  data: State;
  leads: Lead[];
  openCallback: (task: Callback) => void;
  openMeeting: (m: Meeting) => void;
}) {
  const [month, setMonth] = useState(today().slice(0, 7)),
    [owner, setOwner] = useState('all'),
    [view, setView] = useState('month'),
    [kind, setKind] = useState('all'),
    [result, setResult] = useState('all'),
    [selectedDay, setSelectedDay] = useState<string | null>(null);
  const client = data.role === 'client',
    admin = data.role === 'admin' || data.role === 'client_admin';
  const allowed = leads;
  const meetsFilter = (status: string, changed = false, late = false) =>
    result === 'all' ||
    result === status ||
    (result === '일정 변경' && changed) ||
    (result === '연락 지연' && late);
  const meetings = data.meetings.filter(
    (e) =>
      allowed.some((l) => l.id === e.leadId) &&
      (!['staff', 'client_staff'].includes(data.role) ||
        e.ownerId === data.user.memberId) &&
      (!admin || owner === 'all' || e.ownerId === owner) &&
      e.date.startsWith(month) &&
      kind !== 'callback' &&
      meetsFilter(
        e.status,
        (e.history || []).some(
          (h) => h.text.includes('→') && !h.text.includes('담당자'),
        ),
      ),
  );
  const calls = client
    ? []
    : data.callbacks.filter(
        (t) =>
          kind !== 'meeting' &&
          (!admin || owner === 'all' || t.ownerId === owner) &&
          (!['staff', 'client_staff'].includes(data.role) ||
            t.ownerId === data.user.memberId) &&
          meetsFilter(
            t.status,
            false,
            t.status === '예정' && t.dueAt < localNow(),
          ) &&
          allowed.some((l) => l.id === t.leadId) &&
          t.dueAt.startsWith(month),
      );
  const days = new Date(
      Number(month.slice(0, 4)),
      Number(month.slice(5)),
      0,
    ).getDate(),
    offset = new Date(month + '-01T12:00:00').getDay();
  const shift = (n: number) => {
    const d = new Date(month + '-15T12:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  // Merge both kinds before sorting so a morning callback never follows an afternoon meeting.
  const entries = [
    ...meetings.map((e) => {
      const lead = leads.find((l) => l.id === e.leadId)!;
      return {
        id: e.id,
        date: e.date,
        time: e.start,
        kind: '미팅',
        name: lead.name,
        brandId: lead.brandId,
        owner: data.members.find((m) => m.id === e.ownerId)?.name || '미배정',
        status: e.status,
        title: e.title,
        open: () => openMeeting(e),
      };
    }),
    ...calls.map((t) => {
      const lead = leads.find((l) => l.id === t.leadId)!;
      return {
        id: t.id,
        date: t.dueAt.slice(0, 10),
        time: t.dueAt.slice(11),
        kind: '재연락',
        name: lead.name,
        brandId: lead.brandId,
        owner: data.members.find((m) => m.id === t.ownerId)?.name || '미배정',
        status:
          t.status === '예정' && t.dueAt < localNow() ? '연락 지연' : t.status,
        title: '재연락 약속',
        open: () => openCallback(t),
      };
    }),
  ].sort(
    (a, b) =>
      (a.date + a.time).localeCompare(b.date + b.time) ||
      a.id.localeCompare(b.id),
  );
  const dayEntries = (date: string) => entries.filter((e) => e.date === date);
  const summary = (date: string) => {
    const day = dayEntries(date);
    return (
      <>
        {day.slice(0, 2).map((e) => (
          <button
            className={
              'calendar-chip brand-' +
              e.brandId +
              (e.kind === '재연락' ? ' callback-chip' : '')
            }
            key={e.id}
            onClick={e.open}
            aria-label={`${e.time} ${e.name} · ${e.kind} · ${e.owner} · ${e.status}`}
            title={`${e.time} ${e.name} · ${data.brands.find((b) => b.id === e.brandId)?.name} · ${e.owner} · ${e.kind} ${e.status}`}
          >
            <time>{e.time}</time>
            <strong>
              {e.kind === '재연락' ? '☎ ' : ''}
              {e.name}
            </strong>
            <span>{e.owner}</span>
          </button>
        ))}
        {day.length > 2 && (
          <button
            className="calendar-more"
            aria-label={`${date} 일정 ${day.length}건 모두 보기`}
            onClick={() => setSelectedDay(date)}
          >
            +{day.length - 2}건 더 보기
          </button>
        )}
      </>
    );
  };
  return (
    <>
      <div className="inline between calendar-toolbar">
        <div className="inline">
          <Button
            variant="outline"
            onClick={() => shift(-1)}
            aria-label="이전 달"
          >
            ‹
          </Button>
          <h2>{month.replace('-', '년 ')}월</h2>
          <Button
            variant="outline"
            onClick={() => shift(1)}
            aria-label="다음 달"
          >
            ›
          </Button>
          <Button
            variant="outline"
            onClick={() => setMonth(today().slice(0, 7))}
          >
            오늘
          </Button>
        </div>
        <div className="inline">
          {admin && (
            <NativeSelect
              aria-label="캘린더 담당자"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            >
              <option value="all">전체 담당자</option>
              {data.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </NativeSelect>
          )}
          <Button
            variant="outline"
            onClick={() => setView(view === 'month' ? 'list' : 'month')}
          >
            {view === 'month' ? '일정 목록' : '월간 달력'}
          </Button>
        </div>
      </div>
      <div className="inline calendar-filters">
        {!client && (
          <NativeSelect
            aria-label="일정 종류"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">미팅·재연락 전체</option>
            <option value="meeting">미팅만</option>
            <option value="callback">재연락만</option>
          </NativeSelect>
        )}
        <NativeSelect
          aria-label="일정 상태"
          value={result}
          onChange={(e) => setResult(e.target.value)}
        >
          <option value="all">모든 상태</option>
          {[
            '예정',
            '완료',
            '취소',
            '불참',
            '일정 변경',
            ...(!client ? ['연락 지연', '변경'] : []),
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </NativeSelect>
        <span className="muted">
          날짜나 +건을 누르면 그날 일정을 모두 볼 수 있습니다.
        </span>
      </div>
      <p className="muted library-tip">
        미팅 {meetings.length}건{!client && ` · 재연락 ${calls.length}건`}
        {['staff', 'client_staff'].includes(data.role) && ' · 내 일정'}
      </p>
      {view === 'month' && (
        <div className="calendar-grid compact-calendar">
          <>
            {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
              <div className="weekday" key={d}>
                {d}
              </div>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <div className="calendar-day" key={'empty' + i} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const date = month + '-' + String(i + 1).padStart(2, '0');
              return (
                <div
                  className={
                    'calendar-day ' + (date === today() ? 'today' : '')
                  }
                  key={date}
                >
                  <button
                    className="calendar-date"
                    aria-label={`${date} 일정 ${dayEntries(date).length}건 보기`}
                    onClick={() => setSelectedDay(date)}
                  >
                    <span>{i + 1}</span>
                    {dayEntries(date).length > 0 && (
                      <small>{dayEntries(date).length}건</small>
                    )}
                  </button>
                  {summary(date)}
                </div>
              );
            })}
          </>
        </div>
      )}
      <div className={view === 'month' ? 'agenda' : 'agenda-list'}>
        {Array.from(
          { length: days },
          (_, i) => month + '-' + String(i + 1).padStart(2, '0'),
        )
          .filter(
            (d) =>
              meetings.some((e) => e.date === d) ||
              calls.some((t) => t.dueAt.startsWith(d)),
          )
          .map((d) => (
            <section className="surface agenda-item" key={d}>
              <button className="agenda-date" onClick={() => setSelectedDay(d)}>
                {d} <span>{dayEntries(d).length}건 · 전체 보기</span>
              </button>
              {summary(d)}
            </section>
          ))}
        {!meetings.length && !calls.length && (
          <div className="empty">이번 달 일정이 없습니다.</div>
        )}
      </div>
      <Dialog
        open={!!selectedDay}
        onOpenChange={(open) => {
          if (!open) setSelectedDay(null);
        }}
      >
        <DialogContent className="calendar-day-dialog">
          <DialogHeader>
            <DialogTitle>{selectedDay?.replaceAll('-', '. ')} 일정</DialogTitle>
            <DialogDescription>
              현재 선택한 브랜드·담당자·상태 기준{' '}
              {selectedDay ? dayEntries(selectedDay).length : 0}건 · 시간순
            </DialogDescription>
          </DialogHeader>
          <div className="calendar-day-list">
            {selectedDay &&
              dayEntries(selectedDay).map((e) => (
                <button
                  className="day-event-row"
                  key={e.id}
                  onClick={() => {
                    setSelectedDay(null);
                    e.open();
                  }}
                >
                  <time>{e.time}</time>
                  <div className="day-event-main">
                    <strong>
                      {e.name}
                      <span
                        className={
                          'day-kind ' +
                          (e.kind === '재연락' ? 'callback-kind' : '')
                        }
                      >
                        {e.kind}
                      </span>
                    </strong>
                    <span>
                      {data.brands.find((b) => b.id === e.brandId)?.name} ·{' '}
                      {e.owner}
                    </span>
                    <small>{e.title}</small>
                  </div>
                  <span
                    className={
                      'day-result ' +
                      (e.status === '연락 지연' ? 'overdue' : '')
                    }
                  >
                    {e.status} ›
                  </span>
                </button>
              ))}
            {selectedDay && !dayEntries(selectedDay).length && (
              <p className="empty">등록된 일정이 없습니다.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
