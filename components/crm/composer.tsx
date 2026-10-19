'use client';
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { type State, type Lead } from '@/lib/types';
import {
  today,
  plusDay,
  localNow,
  dateLabel,
  pending,
  callbackIsDue,
  type Action,
} from '@/lib/workflow';
export type CallbackEditor = { editCallback: () => void };
export function Composer({
  data,
  lead,
  action,
  busy,
  callbackEditorRef,
}: {
  data: State;
  lead: Lead;
  action: Action;
  busy: boolean;
  callbackEditorRef?: Ref<CallbackEditor>;
}) {
  const key = `sales-draft:${data.environment}:${data.user.id}:${lead.id}`;
  const pendingKey = `${key}:pending`;
  const current = pending(data, lead.id);
  const currentIsDue = current ? callbackIsDue(current.dueAt) : false;
  const blank = () => ({
    text: '',
    scope: 'shared',
    outcome: '통화 완료',
    next: '',
    status: lead.status === '신규' ? '상담 중' : lead.status,
    followupMode: current && !currentIsDue ? 'keep' : 'complete',
    meetingAt: '',
    meetingEnd: '',
    meetingPlace: '',
    meetingTitle: '창업 상담',
    requestId: crypto.randomUUID() as string,
  });
  const [draft, setDraft] = useState(() => {
    const initial = blank();
    try {
      const submitted = JSON.parse(
        sessionStorage.getItem(pendingKey) || 'null',
      );
      const saved =
        submitted?.payload?.leadId === lead.id
          ? JSON.stringify(submitted.payload)
          : sessionStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          typeof parsed.text === 'string' &&
          typeof parsed.requestId === 'string'
        )
          return {
            ...initial,
            ...parsed,
            followupMode:
              parsed.followupMode ||
              (parsed.next ? 'replace' : initial.followupMode),
          } as typeof initial;
      }
    } catch {}
    return initial;
  });
  type Submission = { payload: Record<string, unknown>; message: string };
  const [unconfirmed, setUnconfirmed] = useState<Submission | null>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
      return saved?.payload?.leadId === lead.id &&
        typeof saved.payload.requestId === 'string' &&
        typeof saved.message === 'string'
        ? saved
        : null;
    } catch {
      return null;
    }
  });
  const [savedConflict, setSavedConflict] = useState(false);
  const submitting = useRef(false);
  function rememberSubmission(value: Submission | null) {
    setUnconfirmed(value);
    try {
      if (value) sessionStorage.setItem(pendingKey, JSON.stringify(value));
      else sessionStorage.removeItem(pendingKey);
    } catch {
      setHint('임시 보관이 불가능합니다. 저장 확인 전에는 창을 닫지 마세요.');
    }
  }
  const [hint, setHint] = useState(
      draft.text ? '작성 중인 초안을 불러왔습니다.' : '',
    ),
    memo = useRef<HTMLTextAreaElement>(null);
  const client = data.role === 'client';
  const company = ['client_admin', 'client_staff'].includes(data.role);
  function change(patch: Partial<typeof draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    try {
      sessionStorage.setItem(key, JSON.stringify(next));
      setHint('초안 보관 중 · 닫아도 이 창에서 이어 쓸 수 있어요');
    } catch {
      setHint('초안 보관 실패 · 창을 닫기 전에 저장해 주세요.');
    }
  }
  useEffect(() => {
    memo.current?.focus();
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (unconfirmed || draft.text || draft.next || draft.meetingAt)
        e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft.text, draft.next, draft.meetingAt, unconfirmed]);
  const mode = draft.followupMode;
  const isMemo = draft.outcome === '메모만';
  const callbackInput = useRef<HTMLInputElement>(null);
  useImperativeHandle(callbackEditorRef, () => ({
    editCallback() {
      if (busy || unconfirmed || savedConflict) {
        setHint('먼저 보낸 기록의 저장 여부를 확인해 주세요.');
        return;
      }
      if (isMemo) {
        setHint(
          '재연락을 예약하려면 통화 결과를 선택해 주세요. 메모만 저장하면 약속은 바뀌지 않습니다.',
        );
        memo.current?.focus();
        return;
      }
      change({
        followupMode: 'replace',
        next: draft.next || (current && !currentIsDue ? current.dueAt : ''),
      });
      requestAnimationFrame(() => callbackInput.current?.focus());
    },
  }));
  const submitLabel = client
    ? '요청 저장'
    : isMemo
      ? '메모 저장'
      : mode === 'meeting'
        ? '상담·미팅 함께 저장'
        : mode === 'replace'
          ? '상담·재연락 저장'
          : mode === 'complete' && current
            ? '상담·재연락 완료'
            : '상담 저장';
  return (
    <form
      className="composer call-composer"
      onSubmit={async (e) => {
        e.preventDefault();
        if (submitting.current || busy || savedConflict) return;
        submitting.current = true;
        try {
          const payload = unconfirmed?.payload || {
            action: client ? 'request' : 'note',
            leadId: lead.id,
            ...draft,
            next: mode === 'replace' ? draft.next : '',
            status: mode === 'meeting' && !isMemo ? '미팅 예정' : draft.status,
            meeting:
              mode === 'meeting' && !isMemo
                ? {
                    date: draft.meetingAt.slice(0, 10),
                    start: draft.meetingAt.slice(11, 16),
                    end: draft.meetingEnd,
                    place: draft.meetingPlace,
                    title: draft.meetingTitle,
                  }
                : undefined,
          };
          const message =
            unconfirmed?.message ||
            (client
              ? '본사 요청을 저장했습니다.'
              : isMemo
                ? '메모를 저장했습니다. 약속과 상태는 유지됩니다.'
                : mode === 'meeting'
                  ? '상담과 미팅을 함께 저장했습니다. 캘린더에 반영했습니다.'
                  : mode === 'replace'
                    ? '상담과 재연락을 저장했습니다. 오늘 할 일·캘린더에 반영했습니다.'
                    : mode === 'complete' && current
                      ? '상담을 저장하고 기존 재연락을 완료했습니다.'
                      : mode === 'keep' && current
                        ? currentIsDue
                          ? '상담을 저장했습니다. 지연 재연락은 미처리로 남아 있습니다.'
                          : '상담을 저장했습니다. 기존 재연락 약속은 유지됩니다.'
                        : '상담을 저장했습니다.');
          rememberSubmission({ payload, message });
          if (
            await action(payload, message, (failure) => {
              if (!failure.uncertain) rememberSubmission(null);
              setSavedConflict(failure.alreadySaved === true);
            })
          ) {
            rememberSubmission(null);
            const savedStatus = isMemo ? lead.status : String(payload.status);
            const nextDraft = {
              ...blank(),
              status: savedStatus,
              followupMode: isMemo
                ? blank().followupMode
                : mode === 'replace' || (mode === 'keep' && current)
                  ? 'keep'
                  : 'complete',
            };
            setDraft(nextDraft);
            try {
              sessionStorage.removeItem(key);
            } catch {}
            setHint('저장 완료 · 새 기록을 이어서 작성할 수 있습니다.');
            memo.current?.focus();
          }
        } finally {
          submitting.current = false;
        }
      }}
    >
      {unconfirmed && (
        <output className="call-action-summary" aria-live="polite">
          보낸 기록의 저장 여부를 확인 중입니다. 내용을 그대로 보관했으며 ‘저장
          확인·재시도’를 누르면 같은 요청으로 확인합니다.
        </output>
      )}
      {savedConflict && (
        <div className="call-action-summary" role="alert">
          이미 저장된 기록과 내용이 다릅니다. 작성한 내용은 남아 있습니다. 상담
          이력을 확인한 뒤 추가 기록이 필요하면 새 기록으로 남겨주세요.
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              change({ requestId: crypto.randomUUID() });
              setSavedConflict(false);
            }}
          >
            새 기록으로 남기기
          </Button>
        </div>
      )}
      <fieldset disabled={busy || !!unconfirmed} className="call-fields">
        <div className="call-step-heading">
          <h2>{client ? '본사 요청 남기기' : '통화하며 메모'}</h2>
          <span>저장한 기록은 시간순으로 누적됩니다.</span>
        </div>
        <Textarea
          ref={memo}
          aria-label={client ? '본사 요청 내용' : '상담 메모'}
          placeholder={
            client
              ? '확인이 필요한 내용을 남겨 주세요.'
              : '고객이 말하는 내용을 바로 적으세요.\n예: 희망 상권, 예산, 점포 조건, 궁금한 점, 다음 약속'
          }
          maxLength={4000}
          value={draft.text}
          required={client || !['부재', '연락처 오류'].includes(draft.outcome)}
          onChange={(e) => change({ text: e.target.value })}
        />
        {!client && (
          <>
            <div className="call-step-heading">
              <h3>통화 결과</h3>
              <span>
                {['부재', '연락처 오류'].includes(draft.outcome)
                  ? '메모 없이 결과만 저장할 수 있어요.'
                  : ''}
              </span>
            </div>
            <div className="call-choice-row" aria-label="연락 결과">
              {['통화 완료', '부재', '연락처 오류', '메모만'].map((v) => (
                <Button
                  type="button"
                  size="sm"
                  key={v}
                  aria-pressed={draft.outcome === v}
                  variant={draft.outcome === v ? 'default' : 'outline'}
                  onClick={() => change({ outcome: v })}
                >
                  {v}
                </Button>
              ))}
            </div>
            {!isMemo ? (
              <>
                <div className="call-step-heading">
                  <h3>다음 행동</h3>
                </div>
                <div className="call-choice-row">
                  {(current
                    ? [
                        [
                          'keep',
                          currentIsDue ? '미처리로 남기기' : '기존 약속 유지',
                        ],
                        ['replace', '재연락 예약'],
                        ['meeting', '미팅 예약'],
                        [
                          'complete',
                          currentIsDue
                            ? '이번 재연락 완료'
                            : '기존 재연락 완료',
                        ],
                      ]
                    : [
                        ['replace', '재연락 예약'],
                        ['meeting', '미팅 예약'],
                        ['complete', '다음 약속 없음'],
                      ]
                  ).map(([value, label]) => (
                    <Button
                      type="button"
                      size="sm"
                      key={value}
                      aria-pressed={mode === value}
                      variant={mode === value ? 'default' : 'outline'}
                      onClick={() => change({ followupMode: value })}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                {mode === 'keep' && (
                  <p className="call-action-summary">
                    {currentIsDue
                      ? `${current ? dateLabel(current.dueAt) : ''} 지연 재연락은 완료하지 않고 오늘 할 일에 남깁니다.`
                      : `기존 재연락 ${current ? dateLabel(current.dueAt) : '없음'} 약속을 유지합니다.`}
                  </p>
                )}
                {mode === 'complete' && (
                  <p className="call-action-summary">
                    {current
                      ? `${dateLabel(current.dueAt)} 재연락을 저장 시 완료 처리합니다. 새 약속은 만들지 않습니다.`
                      : '새 재연락·미팅을 예약하지 않습니다.'}
                  </p>
                )}
                {mode === 'replace' && (
                  <div className="call-next-fields">
                    <label htmlFor="call-next">
                      다음 연락 날짜·시간
                      <Input
                        ref={callbackInput}
                        type="datetime-local"
                        id="call-next"
                        aria-label="다음 연락 날짜와 시간"
                        required
                        min={localNow()}
                        value={draft.next}
                        onChange={(e) => change({ next: e.target.value })}
                      />
                    </label>
                    <div className="call-choice-row">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const d = new Date(Date.now() + 3600000);
                          const v = new Intl.DateTimeFormat('sv-SE', {
                            timeZone: 'Asia/Seoul',
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            hourCycle: 'h23',
                          })
                            .format(d)
                            .replace(' ', 'T');
                          change({ next: v });
                        }}
                      >
                        1시간 뒤
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          change({ next: plusDay(today(), 1) + 'T10:00' })
                        }
                      >
                        내일 오전 10시
                      </Button>
                    </div>
                  </div>
                )}
                {mode === 'meeting' && (
                  <div className="call-meeting-fields">
                    {!lead.ownerId && (
                      <p role="alert">
                        미팅 예약 전에 관리자에게 담당자 배정을 요청해 주세요.
                      </p>
                    )}
                    <div className="two-columns">
                      <label htmlFor="call-meeting-start">
                        미팅 시작
                        <Input
                          type="datetime-local"
                          id="call-meeting-start"
                          aria-label="상담 미팅 시작"
                          required
                          min={localNow()}
                          value={draft.meetingAt}
                          onChange={(e) => {
                            const v = e.target.value;
                            const hour = Number(v.slice(11, 13));
                            change({
                              meetingAt: v,
                              meetingEnd:
                                hour < 23
                                  ? `${String(hour + 1).padStart(2, '0')}:${v.slice(14, 16)}`
                                  : '',
                            });
                          }}
                        />
                      </label>
                      <label htmlFor="call-meeting-end">
                        종료 시간
                        <Input
                          type="time"
                          id="call-meeting-end"
                          aria-label="상담 미팅 종료"
                          required
                          min={draft.meetingAt.slice(11, 16)}
                          value={draft.meetingEnd}
                          onChange={(e) =>
                            change({ meetingEnd: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <div className="two-columns">
                      <label htmlFor="call-meeting-place">
                        장소
                        <Input
                          id="call-meeting-place"
                          aria-label="상담 미팅 장소"
                          required
                          maxLength={200}
                          placeholder="본사 상담실 / 현장 주소"
                          value={draft.meetingPlace}
                          onChange={(e) =>
                            change({ meetingPlace: e.target.value })
                          }
                        />
                      </label>
                      <label htmlFor="call-meeting-title">
                        미팅 제목
                        <Input
                          id="call-meeting-title"
                          aria-label="상담 미팅 제목"
                          required
                          maxLength={100}
                          value={draft.meetingTitle}
                          onChange={(e) =>
                            change({ meetingTitle: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <p className="call-action-summary">
                      {data.members.find((m) => m.id === lead.ownerId)?.name ||
                        '미배정'}{' '}
                      담당 · 저장하면 캘린더에 함께 등록됩니다.
                      {current ? ' 기존 재연락은 완료 처리합니다.' : ''}
                    </p>
                  </div>
                )}
                <label className="call-status-label">
                  저장 후 진행상태
                  {mode === 'meeting' ? (
                    <strong>미팅 예정</strong>
                  ) : (
                    <NativeSelect
                      aria-label="저장 후 진행상태"
                      value={draft.status}
                      onChange={(e) => change({ status: e.target.value })}
                    >
                      {[
                        ...new Set([
                          ...data.statusOptions
                            .filter((s) => s.active)
                            .map((s) => s.name),
                          lead.status,
                          draft.status,
                        ]),
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </NativeSelect>
                  )}
                </label>
              </>
            ) : (
              <p className="call-action-summary">
                기존 재연락·미팅·진행상태를 유지하고 메모만 추가합니다.
              </p>
            )}
          </>
        )}
      </fieldset>
      <div className="call-save-bar">
        <output className="call-draft-hint" aria-live="polite">
          {hint || '통화가 끝나면 결과와 다음 행동을 선택해 저장하세요.'}
        </output>
        <div className="inline between">
          {!client && (
            <NativeSelect
              aria-label="메모 공개 범위"
              value={draft.scope}
              disabled={busy || !!unconfirmed}
              onChange={(e) => change({ scope: e.target.value })}
            >
              <option value="shared">
                {company ? '공유 상담' : '공유 상담 · 본사 공개'}
              </option>
              <option value="internal">
                {company
                  ? '내부 메모 · 자사 관리자 확인 가능'
                  : '내부 메모 · 본사 비공개'}
              </option>
            </NativeSelect>
          )}
          <Button
            disabled={
              busy ||
              savedConflict ||
              (!client && !isMemo && mode === 'meeting' && !lead.ownerId)
            }
            type="submit"
          >
            {busy ? '저장 중…' : unconfirmed ? '저장 확인·재시도' : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
