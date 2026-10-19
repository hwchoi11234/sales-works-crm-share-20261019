'use client';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { submitCrmAction, type SaveFailure } from '@/lib/crm-submit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  Users,
  CalendarDays,
  FolderOpen,
  ChartNoAxesCombined,
  Settings2,
  Search,
  Plus,
  ArrowUpRight,
  Pin,
  Phone,
  Copy,
  LogOut,
  KeyRound,
  Download,
} from 'lucide-react';
import {
  normalizePhone,
  metaAutoPhone,
  startupTypes,
  normalizeStartupType,
  receiptParts,
} from '@/lib/lead-fields';
import { statuses, type State, type Lead, type Inquiry } from '@/lib/types';
import {
  today,
  localNow,
  dateLabel,
  matching,
  latestNote,
  pending,
  alerts,
} from '@/lib/workflow';
import { Login } from '@/components/crm/login';
import { CallContext } from '@/components/crm/call-context';
import { Composer, type CallbackEditor } from '@/components/crm/composer';
import { RecentConsultation } from '@/components/crm/recent-consultation';
import { Calendar } from '@/components/crm/calendar';
import { matchesOwner, ownerFilterOptions } from '@/lib/owner-filter';
import { CompanyTeam } from '@/components/crm/company-team';
import { canAssign, isExternal, roleLabel } from '@/lib/permissions';
import { StatusSettings } from '@/components/crm/status-settings';
import { SheetCollection } from '@/components/crm/sheet-collection';
import { LeadScoreEditor } from '@/components/crm/lead-score-editor';
import { scoreResult } from '@/lib/lead-score';
import { RecontactLobby } from '@/components/crm/recontact-lobby';
import { Performance } from '@/components/crm/performance';
import { minimumPasswordLength } from '@/lib/account-policy';
import { AgencyOverview } from '@/components/crm/agency-overview';
import {
  agencyServices,
  brandServices,
  type AgencyService,
} from '@/lib/agency';
const menus = [
  { id: 'overview', name: '업체 관리', icon: ChartNoAxesCombined },
  { id: 'db', name: '고객 DB', icon: Users },
  { id: 'recontact', name: 'DB 사랑방', icon: Users },
  { id: 'calendar', name: '미팅 캘린더', icon: CalendarDays },
  { id: 'docs', name: '브랜드 자료실', icon: FolderOpen },
  { id: 'performance', name: '성과 현황', icon: ChartNoAxesCombined },
];
type Modal = {
  kind:
    | 'new'
    | 'assign'
    | 'next'
    | 'meeting'
    | 'event'
    | 'doc'
    | 'upload'
    | 'brand'
    | 'member'
    | 'account'
    | 'password'
    | 'inquiry'
    | 'callback'
    | 'profile'
    | 'score';
  id?: string;
  leadId?: number;
  brandId?: string;
};
export default function Home() {
  const [data, setData] = useState<State | null>(null),
    [loading, setLoading] = useState(true),
    [requestedPage, setPage] = useState('overview'),
    [brand, setBrand] = useState('all'),
    [agency, setAgency] = useState<AgencyService | '전체'>('전체'),
    [overviewMonth, setOverviewMonth] = useState('all'),
    [owner, setOwner] = useState('all'),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState('all'),
    [startupFilter, setStartupFilter] = useState('all'),
    [scoreFilter, setScoreFilter] = useState('all'),
    [pageSize, setPageSize] = useState(25),
    [filter, setFilter] = useState('all'),
    [pageNum, setPageNum] = useState(1),
    [selected, setSelected] = useState<number | null>(null),
    [checks, setChecks] = useState<number[]>([]),
    [modal, setModal] = useState<Modal | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [duplicate, setDuplicate] = useState<number | null>(null),
    [docQuery, setDocQuery] = useState(''),
    [drill, setDrill] = useState<{ ids: number[]; label: string } | null>(null),
    [settingTab, setSettingTab] = useState('brands'),
    [clock, setClock] = useState(localNow());
  // Resolve access before rendering, including refreshes and account changes.
  const page =
    data &&
    isExternal(data.role) &&
    ['overview', 'docs', 'recontact', 'settings'].includes(requestedPage)
      ? 'db'
      : requestedPage;
  const actionInFlight = useRef(false);
  const callbackEditorRef = useRef<CallbackEditor>(null);
  const needsRefresh = useRef(false);
  const refresh = useCallback(async () => {
    const r = await fetch('/api/crm', {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const d = (await r.json()) as State & {
      error?: string;
      existingLeadId?: number;
    };
    if (r.status === 401) {
      setData(null);
      setLoading(false);
      return null;
    }
    if (!r.ok) throw Error(d.error);
    setData(d);
    needsRefresh.current = false;
    setLoading(false);
    return d as State;
  }, []);
  useEffect(() => {
    Promise.resolve()
      .then(refresh)
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
    const timer = setInterval(() => {
      setClock(localNow());
      refresh().catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [refresh]);
  const action = useCallback(
    async (
      payload: Record<string, unknown>,
      message = '저장했습니다.',
      onFailure?: (failure: SaveFailure) => void,
    ) => {
      if (actionInFlight.current) return false;
      actionInFlight.current = true;
      setBusy(true);
      setError('');
      setNotice('');
      setDuplicate(null);
      try {
        if (needsRefresh.current) {
          try {
            if (!(await refresh())) throw Error('로그인이 필요합니다.');
          } catch {
            setError(
              '이전 기록은 저장됐지만 화면을 갱신하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.',
            );
            onFailure?.({ uncertain: true });
            return false;
          }
        }
        const result = await submitCrmAction(payload);
        if (!result.ok) {
          if (result.existingLeadId) setDuplicate(result.existingLeadId);
          setError(result.error);
          onFailure?.(result);
          return false;
        }
        // A failed list refresh must never turn a confirmed save into a failed save.
        try {
          await refresh();
          setNotice(
            result.replayed
              ? '이미 저장된 기록을 확인했습니다. 중복 저장하지 않았습니다.'
              : message,
          );
        } catch {
          needsRefresh.current = true;
          setNotice(
            '저장은 완료됐습니다. 화면 갱신만 지연되고 있으며 자동으로 다시 불러옵니다.',
          );
        }
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
        return false;
      } finally {
        actionInFlight.current = false;
        setBusy(false);
      }
    },
    [refresh],
  );
  const openLead = (id: number) => {
    setSelected(id);
    setError('');
    setNotice('');
  };
  const resetView = () => {
    setPage('db');
    setBrand('all');
    setAgency('전체');
    setOverviewMonth('all');
    setOwner('all');
    setFilter('all');
    setStatus('all');
    setStartupFilter('all');
    setScoreFilter('all');
    setQuery('');
    setDrill(null);
    setSelected(null);
    setModal(null);
    setChecks([]);
    setNotice('');
    setError('');
  };
  const logout = async () => {
    await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    resetView();
    setData(null);
  };
  if (loading)
    return <main className="loading">고객 정보를 불러오고 있습니다.</main>;
  if (!data)
    return (
      <>
        {error && (
          <p className="feedback error" role="alert">
            {error}
          </p>
        )}
        <Login
          onLogin={async () => {
            resetView();
            const state = await refresh();
            if (state?.role === 'admin') setPage('overview');
            return state;
          }}
        />
      </>
    );
  const admin = data.role === 'admin',
    client = data.role === 'client',
    external = isExternal(data.role),
    companyAdmin = data.role === 'client_admin',
    manager = canAssign(data.role),
    brandName = (id: string) =>
      data.brands.find((b) => b.id === id)?.name || '브랜드',
    ownerName = (id: string | null) =>
      data.members.find((m) => m.id === id)?.name || '미배정';
  const categoryBrands = data.brands.filter(
    (b) => external || agency === '전체' || brandServices(b).includes(agency),
  );
  const inCategory = (id: string) => categoryBrands.some((b) => b.id === id);
  const changeAgency = (service: AgencyService | '전체') => {
    setAgency(service);
    setBrand('all');
    setOwner('all');
    setChecks([]);
    setDrill(null);
    setPageNum(1);
    setQuery('');
    setStatus('all');
    setFilter('all');
    setStartupFilter('all');
    setScoreFilter('all');
  };
  const activeStatuses = data.statusOptions
    .filter((s) => s.active)
    .map((s) => s.name);
  const statusChoices = (current: string) => [
    ...new Set([...activeStatuses, current]),
  ];
  const otherBrandLeads = (l: Lead) =>
    admin
      ? data.leads.filter(
          (x) =>
            x.brandId !== l.brandId &&
            normalizePhone(x.phone) === normalizePhone(l.phone),
        )
      : [];
  const visible = data.leads.filter(
    (l) =>
      inCategory(l.brandId) &&
      (brand === 'all' || l.brandId === brand) &&
      matchesOwner(l.ownerId, owner),
  );
  const filterMembers = ownerFilterOptions(
    data.members,
    data.leads.filter(
      (l) => inCategory(l.brandId) && (brand === 'all' || l.brandId === brand),
    ),
    categoryBrands
      .filter((b) => brand === 'all' || b.id === brand)
      .map((b) => b.id),
  );
  const due = (l: Lead) => pending(data, l.id),
    overdue = (l: Lead) => !!due(l) && due(l)!.dueAt < clock;
  const isNew = (l: Lead) =>
    (l.status === '신규' &&
      !data.notes.some(
        (n) =>
          n.leadId === l.id &&
          ['통화 완료', '부재', '연락처 오류'].includes(n.outcome || ''),
      )) ||
    data.activities.some(
      (a) =>
        a.leadId === l.id &&
        a.kind === 'assign' &&
        !data.acknowledged.includes(a.id),
    );
  const todayMeeting = (l: Lead) =>
    data.meetings.some(
      (e) => e.leadId === l.id && e.date === today() && e.status === '예정',
    );
  const filters: [string, string, number][] = client
    ? [
        ['new', '신규 문의', visible.filter((l) => l.status === '신규').length],
        ['meetings', '오늘 미팅', visible.filter(todayMeeting).length],
        [
          'signed',
          '계약 완료',
          visible.filter((l) => l.status === '계약 완료').length,
        ],
      ]
    : [
        [
          'new',
          manager ? '신규·새 배정' : '새 배정',
          visible.filter(isNew).length,
        ],
        ['overdue', '연락 지연', visible.filter(overdue).length],
        [
          'today',
          '오늘 연락',
          visible.filter((l) => due(l)?.dueAt.startsWith(today())).length,
        ],
        ['meetings', '오늘 미팅', visible.filter(todayMeeting).length],
      ];
  const filtered = visible
    .filter(
      (l) =>
        (status === 'all' || l.status === status) &&
        (startupFilter === 'all' ||
          normalizeStartupType(l.startupType) === startupFilter) &&
        (client || scoreFilter === 'all' || scoreResult(l.qualification).grade === scoreFilter) &&
        matching(l, query) &&
        (!drill || drill.ids.includes(l.id)) &&
        (filter === 'all' ||
          (filter === 'new' && isNew(l)) ||
          (filter === 'unassigned' && !l.ownerId) ||
          (filter === 'crossBrand' && admin && otherBrandLeads(l).length > 0) ||
          (filter === 'today' && due(l)?.dueAt.startsWith(today())) ||
          (filter === 'overdue' && overdue(l)) ||
          (filter === 'meetings' && todayMeeting(l)) ||
          (filter === 'signed' && l.status === '계약 완료') ||
          (filter === 'alerts' && alerts(data, l.id).length > 0)),
    )
    .sort(
      (a, b) =>
        Number(overdue(b)) - Number(overdue(a)) ||
        Number(isNew(b)) - Number(isNew(a)) ||
        (due(a)?.dueAt || 'z').localeCompare(due(b)?.dueAt || 'z') ||
        b.id - a.id,
    );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)),
    current = Math.min(pageNum, pages),
    rows = filtered.slice((current - 1) * pageSize, current * pageSize),
    lead = data.leads.find((l) => l.id === selected);
  const inquiries = (id: number) =>
      data.inquiries
        .filter((q) => q.leadId === id)
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)),
    notes = (id: number) =>
      data.notes
        .filter((n) => n.leadId === id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const modalLead = data.leads.find((l) => l.id === modal?.leadId),
    event = data.meetings.find((e) => e.id === modal?.id),
    doc = data.docs.find((d) => d.id === modal?.id),
    editBrand = data.brands.find((b) => b.id === modal?.id),
    editMember = data.members.find((m) => m.id === modal?.id),
    account = data.accounts.find((a) => a.id === modal?.id);
  const statusSelect = (l: Lead) => (
    <NativeSelect
      aria-label={`${l.name} 진행상태`}
      value={l.status}
      disabled={busy}
      onChange={(e) =>
        action(
          { action: 'status', leadId: l.id, status: e.target.value },
          '진행상태를 변경했습니다.',
        )
      }
    >
      {statusChoices(l.status).map((s) => (
        <option key={s}>{s}</option>
      ))}
    </NativeSelect>
  );
  const inquiryCard = (q: Inquiry, first = false) => (
    <article className={'inquiry-card ' + (first ? 'pinned' : '')} key={q.id}>
      <div className="inline between">
        <strong>
          <Pin size={14} className="inline-icon" />
          {first ? '최초 문의' : '추가 문의'}
        </strong>
        <span className="source-chip">{q.source}</span>
      </div>
      <p className="inquiry-summary">{q.summary}</p>
      {q.importedAt && (
        <p className="muted">
          원본 접수 {dateLabel(q.sourceReceivedAt || q.receivedAt)}
          {' · '}전산 수집 {dateLabel(q.importedAt)}
        </p>
      )}
      {/메타|meta|페이스북|facebook|인스타그램|instagram/i.test(q.source) && (
        <div className="meta-phone-row">
          <span>메타 자동입력 연락처</span>
          <strong>{metaAutoPhone(q) || '미수집'}</strong>
          <small>메타 양식의 자동입력 원본 · 고객 연락처와 별도 보관</small>
        </div>
      )}
      <details>
        <summary>
          문의 원문·유입 정보 {q.reviewed ? '· 확인 완료' : '· 확인 전'}
        </summary>
        <p className="muted">
          원본 접수: {dateLabel(q.sourceReceivedAt || q.receivedAt)} · {q.campaign}
          {q.aiSample ? ' · AI 요약 예시' : ''}
        </p>
        <dl className="raw-inquiry">
          {Object.entries(q.raw).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v || '미기재'}</dd>
            </div>
          ))}
        </dl>
      </details>
      {!client && !q.reviewed && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            action({ action: 'review', id: q.id }, '문의 확인 완료')
          }
        >
          문의 확인 완료
        </Button>
      )}
    </article>
  );
  const submit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!modal) return;
    const fd = new FormData(e.currentTarget),
      values = Object.fromEntries(fd),
      base = {
        ...values,
        leadId: Number(values.leadId || modal.leadId),
        id: modal.id,
      };
    let p: Record<string, unknown> = { ...base, action: modal.kind };
    if (modal.kind === 'new') p.action = 'createLead';
    if (modal.kind === 'assign')
      p = {
        action: 'assign',
        ids: modal.leadId ? [modal.leadId] : checks,
        ownerId: values.ownerId,
      };
    if (modal.kind === 'event') p = { ...base, action: 'meetingUpdate' };
    if (modal.kind === 'member')
      p = {
        ...base,
        action: 'member',
        brands: fd.getAll('brands'),
        active: values.active === 'true',
      };
    if (modal.kind === 'brand')
      p = {
        ...base,
        action: 'brand',
        services: fd.getAll('services'),
        active: values.active === 'true',
      };
    if (modal.kind === 'account')
      p = {
        ...base,
        action: 'account',
        brandIds: fd.getAll('brandIds'),
        active: values.active === 'true',
      };
    if (modal.kind === 'upload') {
      setBusy(true);
      setError('');
      if (modal.id) fd.set('id', modal.id);
      try {
        const r = await fetch('/api/files', { method: 'POST', body: fd });
        const d = (await r.json()) as State & {
          error?: string;
          existingLeadId?: number;
        };
        if (!r.ok) throw Error(d.error);
        await refresh();
        setModal(null);
        setNotice(
          '공식 자료를 배포했습니다. 새 버전 확인 상태가 초기화되었습니다.',
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : '업로드 실패');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (await action(p)) {
      setModal(null);
      setChecks([]);
      if (modal.kind === 'password') await logout();
    }
  };
  const exportExcel = async () => {
    setBusy(true);
    try {
      const ExcelJS = await import('exceljs'),
        book = new ExcelJS.Workbook(),
        sheet = book.addWorksheet('고객 DB');
      sheet.columns = [
        { header: '접수일시 · 전산 등록 기준 (한국시간)', key: 'received', width: 24 },
        { header: '마지막 수정일 (한국시간)', key: 'modified', width: 24 },
        { header: '브랜드', key: 'brand', width: 23 },
        { header: '창업 형태', key: 'startupType', width: 16 },
        { header: '희망 지역', key: 'region', width: 22 },
        { header: '고객명', key: 'name', width: 16 },
        { header: '연락처', key: 'phone', width: 20 },
        { header: '진행상태', key: 'status', width: 16 },
        { header: 'DB 점수', key: 'score', width: 16 },
        { header: '담당자', key: 'owner', width: 16 },
        { header: '마지막 상담', key: 'note', width: 60 },
        { header: '다음 연락', key: 'next', width: 24 },
      ];
      for (const l of filtered)
        sheet.addRow({
          received: Object.values(
            receiptParts(l.createdAt),
          ).join(' '),
          modified: Object.values(
            receiptParts(l.updatedAt || l.createdAt),
          ).join(' '),
          startupType: normalizeStartupType(l.startupType),
          region: l.region,
          brand: brandName(l.brandId),
          name: l.name,
          phone: l.phone,
          status: l.status,
          score: scoreResult(l.qualification).label,
          owner: ownerName(l.ownerId),
          note: latestNote(data, l.id)?.text || '',
          next: due(l)?.dueAt || '',
        });
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = 'A1:K1';
      const bytes = await book.xlsx.writeBuffer(),
        url = URL.createObjectURL(
          new Blob([bytes as BlobPart], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
        );
      const a = document.createElement('a');
      a.href = url;
      a.download = `고객DB_${today()}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setNotice(`현재 조회한 고객 ${filtered.length}명을 내려받았습니다.`);
    } catch {
      setError('엑셀 파일을 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };
  const modalTitle = modal
    ? {
        new: '고객 직접 등록',
        assign: '담당자 배정·인수인계',
        next: '재연락 예약',
        meeting: '미팅 등록',
        event: '미팅 상세·결과',
        doc: doc?.title || '브랜드 자료',
        upload: '공식 자료 배포',
        brand: '브랜드 관리',
        member: '영업팀원 관리',
        account: '로그인 계정 관리',
        password: '비밀번호 변경',
        inquiry: '추가 문의 등록',
        callback: '재연락 상세',
        profile: '창업 희망조건 수정',
        score: '고객 DB 점수 평가',
      }[modal.kind]
    : '';
  const field = (
    label: string,
    name: string,
    value = '',
    type = 'text',
    required = true,
  ) => (
    <label htmlFor={name}>
      {label}
      <Input
        id={name}
        key={`${modal?.kind}:${modal?.id}:${name}`}
        name={name}
        type={type}
        defaultValue={value}
        required={required}
      />
    </label>
  );
  const feedback = (
    <>
      {(error || notice) && (
        <div
          className={'feedback ' + (error ? 'error' : '')}
          role={error ? 'alert' : 'status'}
        >
          {error || notice}
          {duplicate && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setModal(null);
                openLead(duplicate);
                setDuplicate(null);
              }}
            >
              기존 고객 열기
            </Button>
          )}
        </div>
      )}
    </>
  );
  return (
    <SidebarProvider
      style={{ '--sidebar-width': '218px' } as React.CSSProperties}
    >
      <Sidebar>
        <SidebarHeader>
          <div className="wordmark">
            SALES<span>WORKS</span>
            <small>광고·영업대행 인트라넷</small>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {menus
              .filter(
                (m) =>
                  !external ||
                  !['overview', 'docs', 'recontact'].includes(m.id),
              )
              .map((m) => (
                <SidebarMenuItem key={m.id}>
                  <SidebarMenuButton
                    isActive={page === m.id}
                    onClick={() => {
                      setPage(m.id);
                      setOwner('all');
                      setNotice('');
                      setError('');
                    }}
                  >
                    <m.icon />
                    <span>{m.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          {companyAdmin && (
            <SidebarMenuButton
              isActive={page === 'team'}
              onClick={() => setPage('team')}
            >
              <Settings2 />
              직원·계정 관리
            </SidebarMenuButton>
          )}
          {admin && (
            <SidebarMenuButton
              isActive={page === 'settings'}
              onClick={() => setPage('settings')}
            >
              <Settings2 />
              관리자 설정
            </SidebarMenuButton>
          )}
          <div className="profile">
            <span className="avatar">{data.actor.slice(0, 1)}</span>
            <div>
              {data.actor}
              <small>
                {admin
                  ? '전체 브랜드 관리'
                  : companyAdmin
                    ? '자사 직원·고객 관리'
                    : client
                      ? '자사 브랜드 조회'
                      : '내 배정 고객 관리'}
              </small>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setModal({ kind: 'password' })}
          >
            <KeyRound size={15} />
            비밀번호 변경
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="topbar">
          <div className="inline">
            <SidebarTrigger />
            <span className="env-tag">
              <span />
              {data.environment === 'test' ? '테스트' : '개발'} 환경
            </span>
            <span className="muted">로컬 검토 환경</span>
          </div>
          <div className="inline">
            <span>{data.user.username}</span>
            <Button size="sm" variant="ghost" onClick={logout}>
              <LogOut size={15} />
              로그아웃
            </Button>
          </div>
        </header>
        <main
          className={
            'workspace ' +
            (page === 'db'
              ? 'customer-workspace'
              : page === 'performance'
                ? 'performance-workspace'
                : '')
          }
        >
          <div className="page-title">
            <div>
              <h1>
                {page === 'team'
                  ? '직원·계정 관리'
                  : menus.find((m) => m.id === page)?.name || '관리자 설정'}
              </h1>
              <p>
                {page === 'overview'
                  ? '대행 유형을 선택하고, 관리할 업체로 이동하세요.'
                  : page === 'db'
                    ? client
                      ? '자사 고객의 상담 진행을 확인하세요.'
                      : '오늘 연락할 고객과 다음 약속을 확인하세요.'
                    : page === 'recontact'
                      ? '20일 동안 수정되지 않은 고객을 인수하고 재컨택하세요.'
                      : page === 'calendar'
                        ? client
                          ? '자사 브랜드 미팅 일정'
                          : '미팅과 재연락 약속'
                        : page === 'docs'
                          ? '브랜드별 최신 공식 자료'
                          : page === 'performance'
                            ? '접수 고객의 계약 결과와 관리가 필요한 고객을 확인하세요.'
                            : page === 'team'
                              ? '자사 직원의 담당 브랜드와 로그인 계정을 관리하세요.'
                              : '브랜드·직원·로그인 계정 관리'}
              </p>
            </div>
            {!client &&
              (page === 'db' ? (
                <Button
                  onClick={() => {
                    setError('');
                    setModal({ kind: 'new' });
                  }}
                >
                  <Plus />
                  고객 등록
                </Button>
              ) : page === 'calendar' ? (
                <Button onClick={() => setModal({ kind: 'meeting' })}>
                  <Plus />
                  미팅 등록
                </Button>
              ) : page === 'docs' && admin ? (
                <Button onClick={() => setModal({ kind: 'upload' })}>
                  <Plus />
                  자료 배포
                </Button>
              ) : null)}
          </div>
          {!lead && !modal && feedback}
          {page !== 'settings' && page !== 'overview' && page !== 'team' && (
            <div className="agency-scopebar">
              {!external && (
                <label>
                  업무 유형
                  <NativeSelect
                    aria-label="업무 유형"
                    value={agency}
                    onChange={(e) =>
                      changeAgency(e.target.value as AgencyService | '전체')
                    }
                  >
                    <option value="전체">전체 업무</option>
                    {agencyServices.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </NativeSelect>
                </label>
              )}
              {external && data.brands.length === 1 ? (
                <strong>{data.brands[0].name}</strong>
              ) : (
                <label>
                  업체
                  <NativeSelect
                    aria-label="조회 업체"
                    value={
                      categoryBrands.some((b) => b.id === brand) ? brand : 'all'
                    }
                    onChange={(e) => {
                      setBrand(e.target.value);
                      setOwner('all');
                      setChecks([]);
                      setPageNum(1);
                      setDrill(null);
                    }}
                  >
                    <option value="all">
                      {external ? '내 브랜드 전체' : '해당 유형 전체 업체'}
                    </option>
                    {categoryBrands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
              {!external && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPage('overview')}
                >
                  업체 목록으로
                </Button>
              )}
            </div>
          )}
          {page === 'overview' && !external && (
            <AgencyOverview
              data={data}
              category={agency === '전체' ? '일반 광고대행' : agency}
              month={overviewMonth}
              setMonth={setOverviewMonth}
              onCategoryChange={changeAgency}
              openBrand={(id, destination) => {
                setAgency(agency === '전체' ? '일반 광고대행' : agency);
                setBrand(id);
                setOwner('all');
                setChecks([]);
                setQuery('');
                setStatus('all');
                setFilter('all');
                setStartupFilter('all');
                setScoreFilter('all');
                setDrill(null);
                setPageNum(1);
                setPage(destination);
              }}
              issueAccount={
                admin
                  ? (id) => setModal({ kind: 'account', brandId: id })
                  : undefined
              }
              editBrand={
                admin ? (id) => setModal({ kind: 'brand', id }) : undefined
              }
            />
          )}
          {page === 'db' && (
            <>
              {companyAdmin && !data.members.some((m) => m.active) && (
                <div className="company-start-guide">
                  <div>
                    <strong>첫 고객 배정을 준비하세요</strong>
                    <p>
                      직원 계정을 만든 뒤 고객을 선택해 담당자를 배정하면
                      됩니다.
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setPage('team')}>
                    직원 등록하기
                  </Button>
                </div>
              )}
              <div className="metric-row">
                {filters.map(([f, label, n]) => (
                  <button
                    className={'metric ' + (filter === f ? 'active' : '')}
                    key={f}
                    onClick={() => {
                      setFilter(filter === f ? 'all' : f);
                      setDrill(null);
                      setPageNum(1);
                    }}
                  >
                    <span>{label}</span>
                    <strong>
                      {n}
                      <small>명</small>
                    </strong>
                  </button>
                ))}
              </div>
              <section className="surface">
                <div className="table-tools">
                  <div className="search">
                    <Search size={16} />
                    <Input
                      aria-label="고객 검색"
                      placeholder="고객명·연락처·희망 지역"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPageNum(1);
                      }}
                    />
                  </div>
                  <NativeSelect
                    aria-label="진행상태 필터"
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPageNum(1);
                    }}
                  >
                    <option value="all">진행상태 전체</option>
                    {data.statusOptions.map(({ name: s }) => (
                      <option key={s}>{s}</option>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    aria-label="창업 형태 필터"
                    value={startupFilter}
                    onChange={(e) => {
                      setStartupFilter(e.target.value);
                      setPageNum(1);
                    }}
                  >
                    <option value="all">창업 형태 전체</option>
                    {[...startupTypes, '미분류'].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </NativeSelect>
                  {(manager || client) && (
                    <NativeSelect
                      aria-label="고객 담당자 필터"
                      value={owner}
                      onChange={(e) => {
                        setOwner(e.target.value);
                        setChecks([]);
                        setDrill(null);
                        setPageNum(1);
                      }}
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
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setFilter('all');
                      setStatus('all');
                      setStartupFilter('all');
                      setScoreFilter('all');
                      setOwner('all');
                      setQuery('');
                      setDrill(null);
                    }}
                  >
                    전체 보기
                  </Button>
                  {!client && <NativeSelect aria-label="고객 DB 점수 필터" value={scoreFilter} onChange={e => { setScoreFilter(e.target.value); setPageNum(1); setChecks([]); }}>
                    <option value="all">DB 점수 전체</option><option value="미평가">미평가</option>
                    {['A','B','C','D'].map(g => <option key={g} value={g}>{g}등급</option>)}
                  </NativeSelect>}
                  {!client && (
                    <Button
                      variant="outline"
                      disabled={busy || !filtered.length}
                      onClick={exportExcel}
                    >
                      <Download size={14} />
                      엑셀
                    </Button>
                  )}
                </div>
                <div className="inline queue-tools">
                  {manager && (
                    <>
                      <Button
                        variant={
                          filter === 'unassigned' ? 'default' : 'outline'
                        }
                        size="sm"
                        onClick={() => {
                          setFilter('unassigned');
                          setDrill(null);
                        }}
                      >
                        미배정 {visible.filter((l) => !l.ownerId).length}
                      </Button>
                      {admin && (
                        <Button
                          size="sm"
                          variant={
                            filter === 'crossBrand' ? 'default' : 'outline'
                          }
                          onClick={() => {
                            setFilter(
                              filter === 'crossBrand' ? 'all' : 'crossBrand',
                            );
                            setPageNum(1);
                            setDrill(null);
                          }}
                        >
                          타 브랜드 문의{' '}
                          {
                            visible.filter((l) => otherBrandLeads(l).length > 0)
                              .length
                          }
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!checks.length}
                        onClick={() => setModal({ kind: 'assign' })}
                      >
                        선택 배정 {checks.length || ''}
                      </Button>
                    </>
                  )}
                  {!client && (
                    <Button
                      size="sm"
                      variant={filter === 'alerts' ? 'default' : 'outline'}
                      onClick={() => {
                        setFilter('alerts');
                        setDrill(null);
                      }}
                    >
                      미확인 문의·요청{' '}
                      {visible.filter((l) => alerts(data, l.id).length).length}
                    </Button>
                  )}
                  <span className="muted">
                    {drill?.label || '현재 조회'} · {filtered.length}명
                  </span>
                  <NativeSelect
                    className="page-size"
                    aria-label="페이지당 고객 수"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPageNum(1);
                    }}
                  >
                    {[25, 50, 100].map((n) => (
                      <option key={n} value={n}>
                        {n}개씩 보기
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <Table className="lead-table">
                  <colgroup>
                    {manager && <col style={{ width: 34 }} />}
                    <col style={{ width: 103 }} />
                    <col style={{ width: 103 }} />
                    <col style={{ width: 126 }} />
                    <col style={{ width: 82 }} />
                    <col style={{ width: 147 }} />
                    <col style={{ width: 95 }} />
                    <col style={{ width: 88 }} />
                    <col style={{ width: 135 }} />
                    <col style={{ width: 76 }} />
                    <col />
                    <col style={{ width: 28 }} />
                  </colgroup>
                  <TableHeader>
                    <TableRow>
                      {manager && (
                        <TableHead>
                          <Checkbox
                            aria-label="현재 페이지 전체 선택"
                            checked={
                              !!rows.length &&
                              rows.every((l) => checks.includes(l.id))
                            }
                            onCheckedChange={(v) =>
                              setChecks(
                                v
                                  ? [
                                      ...new Set([
                                        ...checks,
                                        ...rows.map((l) => l.id),
                                      ]),
                                    ]
                                  : checks.filter(
                                      (id) => !rows.some((l) => l.id === id),
                                    ),
                              )
                            }
                          />
                        </TableHead>
                      )}
                      {[
                        '접수일시',
                        '마지막 수정일',
                        '브랜드명',
                        '고객성함',
                        '고객연락처',
                        '희망 지역',
                        '창업 형태',
                        '진행상태',
                        ...(!client ? ['DB 점수'] : []),
                        '담당자',
                        '마지막 상담기록',
                        '',
                      ].map((h) => (
                        <TableHead key={h}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((l) => {
                      const note = latestNote(data, l.id),
                        q = inquiries(l.id)[0],
                        task = due(l),
                        received = receiptParts(l.createdAt);
                      return (
                        <TableRow
                          key={l.id}
                          className="customer-row"
                          onClick={() => openLead(l.id)}
                        >
                          {manager && (
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                aria-label={`${l.name} 선택`}
                                checked={checks.includes(l.id)}
                                onCheckedChange={(v) =>
                                  setChecks(
                                    v
                                      ? [...new Set([...checks, l.id])]
                                      : checks.filter((id) => id !== l.id),
                                  )
                                }
                              />
                            </TableCell>
                          )}
                          <TableCell className="received-cell">
                            <time
                              dateTime={l.createdAt}
                              title="전산에 최초 등록된 일시 · 한국시간"
                            >
                              {received.date}
                              <span>{received.time}</span>
                            </time>
                          </TableCell>
                          <TableCell className="received-cell">
                            <time
                              dateTime={l.updatedAt}
                              title="마지막 내용 변경 시각 · 조회/알림 확인 제외"
                            >
                              {receiptParts(l.updatedAt || l.createdAt).date}
                              <span>
                                {receiptParts(l.updatedAt || l.createdAt).time}
                              </span>
                            </time>
                          </TableCell>
                          <TableCell>
                            <span className={'brand-label brand-' + l.brandId}>
                              {brandName(l.brandId)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <button
                              className="customer-name"
                              onClick={() => openLead(l.id)}
                            >
                              {l.name}
                            </button>
                            {!client && alerts(data, l.id).length > 0 && (
                              <span
                                className="record-meta unread"
                                title="미확인 문의·요청·배정 알림"
                              >
                                새 알림
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="phone">
                            {l.phone}
                            <button
                              aria-label={`${l.name} 연락처 복사`}
                              className="copy-button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await navigator.clipboard.writeText(l.phone);
                                  setNotice('연락처를 복사했습니다.');
                                } catch {
                                  setError('연락처를 선택해 복사해 주세요.');
                                }
                              }}
                            >
                              <Copy size={13} />
                            </button>
                          </TableCell>
                          <TableCell
                            className="region-cell"
                            title={l.region || '미기재'}
                          >
                            {l.region || '미기재'}
                          </TableCell>
                          <TableCell>
                            {normalizeStartupType(l.startupType)}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {client ? (
                              <span
                                className={
                                  'status status-' + statuses.indexOf(l.status)
                                }
                              >
                                {l.status}
                              </span>
                            ) : (
                              statusSelect(l)
                            )}
                          </TableCell>
                          {!client && <TableCell onClick={e => e.stopPropagation()}>
                            <Button size="sm" variant="ghost" onClick={() => setModal({ kind: 'score', leadId: l.id })}>{scoreResult(l.qualification).label}</Button>
                          </TableCell>}
                          <TableCell>{ownerName(l.ownerId)}</TableCell>
                          <TableCell>
                            <div
                              className="record-preview"
                              title={
                                note?.text || q?.summary || '상담기록 없음'
                              }
                            >
                              {!note && (
                                <span className="initial-tag">최초 문의</span>
                              )}
                              {note?.text || q?.summary || '상담기록 없음'}
                            </div>
                            <span
                              className="record-meta"
                              title={
                                note
                                  ? `${dateLabel(note.createdAt)} · ${note.author}`
                                  : q?.source
                              }
                            >
                              {!client && task ? (
                                <span className={overdue(l) ? 'overdue' : ''}>
                                  {overdue(l) ? '연락 지연 · ' : ''}다음 연락{' '}
                                  {dateLabel(task.dueAt)}
                                </span>
                              ) : note ? (
                                `${dateLabel(note.createdAt)} · ${note.author}`
                              ) : (
                                q?.source
                              )}
                            </span>
                          </TableCell>
                          <TableCell>
                            <ArrowUpRight size={15} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {!rows.length && (
                  <div className="empty">해당하는 고객이 없습니다.</div>
                )}
                <div className="table-footer">
                  <span>고객을 선택하면 상담을 기록할 수 있습니다.</span>
                  <div className="inline">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={current === 1}
                      onClick={() => setPageNum(current - 1)}
                    >
                      이전
                    </Button>
                    {current} / {pages}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={current === pages}
                      onClick={() => setPageNum(current + 1)}
                    >
                      다음
                    </Button>
                  </div>
                </div>
              </section>
            </>
          )}
          {page === 'calendar' && (
            <Calendar
              data={data}
              leads={visible}
              openCallback={(t) =>
                setModal({ kind: 'callback', id: t.id, leadId: t.leadId })
              }
              openMeeting={(e) =>
                setModal({ kind: 'event', id: e.id, leadId: e.leadId })
              }
            />
          )}
          {page === 'recontact' && !external && (
            <RecontactLobby
              data={{
                ...data,
                recontactLeads: data.recontactLeads.filter((l) =>
                  inCategory(l.brandId),
                ),
              }}
              brand={brand}
              action={action}
              busy={busy}
              openLead={openLead}
            />
          )}
          {page === 'performance' && (
            <Performance
              key={`${brand}:${agency}:${overviewMonth}`}
              initialMonth={overviewMonth}
              brandIds={categoryBrands
                .filter((b) => brand === 'all' || b.id === brand)
                .map((b) => b.id)}
              data={data}
              leads={data.leads.filter(
                (l) =>
                  inCategory(l.brandId) &&
                  (brand === 'all' || l.brandId === brand),
              )}
              drill={(ids, label) => {
                setDrill({ ids, label });
                setFilter('all');
                setStatus('all');
                setStartupFilter('all');
                setScoreFilter('all');
                setQuery('');
                setOwner('all');
                setPageNum(1);
                setPage('db');
              }}
            />
          )}
          {page === 'docs' && !external && (
            <>
              <div className="inline between library-tip">
                <Input
                  aria-label="자료 검색"
                  placeholder="자료명·변경 내용 검색"
                  value={docQuery}
                  onChange={(e) => setDocQuery(e.target.value)}
                />
                <span className="muted">★ 필독 우선 · 최신 공식 버전</span>
              </div>
              <div className="doc-list">
                {data.docs
                  .filter(
                    (d) =>
                      inCategory(d.brandId) &&
                      (brand === 'all' || d.brandId === brand) &&
                      [d.title, d.change].join(' ').includes(docQuery),
                  )
                  .sort(
                    (a, b) =>
                      Number(b.pinned) - Number(a.pinned) ||
                      b.date.localeCompare(a.date),
                  )
                  .map((d) => (
                    <article
                      className={
                        'surface doc ' + (d.pinned ? 'doc-pinned' : '')
                      }
                      key={d.id}
                    >
                      <div>
                        <div className="inline">
                          <span className={'brand-label brand-' + d.brandId}>
                            {brandName(d.brandId)}
                          </span>
                          <span className="muted">{d.format}</span>
                          {d.pinned && (
                            <span className="pin-label">★ 필독</span>
                          )}
                          {!d.readBy.includes(data.user.id) && (
                            <span className="unread">새 버전 미확인</span>
                          )}
                          {!d.published && <span>배포 전</span>}
                        </div>
                        <h2>{d.title}</h2>
                        <p>{d.change}</p>
                        <span className="muted">
                          v{d.version} · {d.date}
                        </span>
                      </div>
                      <div className="doc-actions">
                        <Button
                          variant="outline"
                          onClick={() => setModal({ kind: 'doc', id: d.id })}
                        >
                          자료 보기
                        </Button>
                        {admin && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                action({
                                  action: d.published ? 'pin' : 'publish',
                                  id: d.id,
                                })
                              }
                            >
                              {d.published
                                ? d.pinned
                                  ? '★ 고정 해제'
                                  : '☆ 필독 고정'
                                : '공식 배포'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setModal({ kind: 'upload', id: d.id })
                              }
                            >
                              새 버전 업로드
                            </Button>
                          </>
                        )}
                      </div>
                    </article>
                  ))}
              </div>
            </>
          )}
          {page === 'team' && companyAdmin && (
            <CompanyTeam data={data} busy={busy} action={action} />
          )}
          {page === 'settings' && admin && (
            <>
              <div className="segmented">
                {[
                  ['brands', '브랜드'],
                  ['members', '영업팀원'],
                  ['accounts', '로그인 계정'],
                  ['statuses', '진행상태'],
                  ['sheets', 'DB 수집'],
                ].map(([id, label]) => (
                  <Button
                    key={id}
                    variant={settingTab === id ? 'default' : 'outline'}
                    onClick={() => setSettingTab(id)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {settingTab === 'sheets' ? (
                <SheetCollection onSync={refresh} />
              ) : settingTab === 'statuses' ? (
                <StatusSettings data={data} action={action} busy={busy} />
              ) : (
                <>
                  <div className="inline between setting-title">
                    <p className="muted">
                      {settingTab === 'accounts'
                        ? '고객사 계정을 발급하고 조회할 브랜드를 지정하세요. 지정한 브랜드만 접근할 수 있습니다.'
                        : '비활성화 전에 진행 중인 고객을 인수인계해 주세요.'}
                    </p>
                    <Button
                      onClick={() =>
                        setModal({
                          kind:
                            settingTab === 'brands'
                              ? 'brand'
                              : settingTab === 'members'
                                ? 'member'
                                : 'account',
                        })
                      }
                    >
                      <Plus />
                      추가
                    </Button>
                  </div>
                  <section className="surface">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>이름</TableHead>
                          <TableHead>
                            {settingTab === 'accounts'
                              ? '아이디·권한'
                              : '소속·담당 브랜드'}
                          </TableHead>
                          <TableHead>상태</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {settingTab === 'brands'
                          ? data.brands.map((b) => (
                              <TableRow key={b.id}>
                                <TableCell>{b.name}</TableCell>
                                <TableCell>
                                  {b.company}
                                  <span className="record-meta">
                                    {brandServices(b).join(' · ')}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  {b.active ? '운영 중' : '비활성'}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      setModal({ kind: 'brand', id: b.id })
                                    }
                                  >
                                    수정
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          : settingTab === 'members'
                            ? data.members.map((m) => (
                                <TableRow key={m.id}>
                                  <TableCell>{m.name}</TableCell>
                                  <TableCell>
                                    {m.brands.map(brandName).join(', ')}
                                  </TableCell>
                                  <TableCell>
                                    {m.active ? '재직' : '비활성'}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        setModal({ kind: 'member', id: m.id })
                                      }
                                    >
                                      수정
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))
                            : data.accounts.map((a) => (
                                <TableRow key={a.id}>
                                  <TableCell>{a.name}</TableCell>
                                  <TableCell>
                                    {a.username} · {roleLabel(a.role)}
                                    <span className="record-meta">
                                      {isExternal(a.role)
                                        ? a.brandIds.map(brandName).join(', ')
                                        : a.role === 'staff'
                                          ? ownerName(a.memberId)
                                          : '전체 브랜드'}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    {a.active ? '활성' : '비활성'}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={a.role === 'client_staff'}
                                      title={
                                        a.role === 'client_staff'
                                          ? '해당 고객사의 직원·계정 관리에서 수정'
                                          : undefined
                                      }
                                      onClick={() =>
                                        setModal({ kind: 'account', id: a.id })
                                      }
                                    >
                                      {a.role === 'client_staff'
                                        ? '고객사에서 관리'
                                        : '수정·비밀번호 재설정'}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                      </TableBody>
                    </Table>
                  </section>
                </>
              )}
            </>
          )}
        </main>
      </SidebarInset>
      <Dialog
        open={!!lead}
        onOpenChange={(open) => {
          if (!open && !modal && !busy) setSelected(null);
        }}
      >
        <DialogContent className="call-workspace" initialFocus={false}>
          <DialogHeader className="call-header">
            <div className="call-identity">
              <DialogTitle>
                {lead?.name}
                <span className="detail-id">#{lead?.id}</span>
              </DialogTitle>
              <DialogDescription>
                {lead && brandName(lead.brandId)} ·{' '}
                {lead && ownerName(lead.ownerId)}
                <span className="lobby-subline">
                  마지막 수정{' '}
                  {dateLabel(lead?.updatedAt || lead?.createdAt || '')}
                </span>
              </DialogDescription>
            </div>
            {lead && (
              <div className="contact-line">
                <strong>
                  <Phone size={15} />
                  {lead.phone}
                </strong>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="상담 고객 연락처 복사"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(lead.phone);
                      setNotice('연락처를 복사했습니다.');
                    } catch {
                      setError('연락처를 선택해 복사해 주세요.');
                    }
                  }}
                >
                  <Copy size={14} />
                  복사
                </Button>
                <span className="muted">{lead.email}</span>
              </div>
            )}
          </DialogHeader>
          {lead && (
            <div className="call-layout">
              <CallContext
                key={lead.id}
                count={notes(lead.id).length}
                summary={
                  <>
                    {!client && latestNote(data, lead.id) && (
                      <RecentConsultation
                        key={latestNote(data, lead.id)!.id}
                        note={latestNote(data, lead.id)!}
                      />
                    )}
                    {!client && (
                      <div className="inline between next-summary">
                        <div>
                          <span className="muted">저장된 재연락 약속</span>
                          <strong className={overdue(lead) ? 'overdue' : ''}>
                            {due(lead)
                              ? dateLabel(due(lead)!.dueAt)
                              : '예정 없음'}
                            {overdue(lead) && ' · 지연'}
                          </strong>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            callbackEditorRef.current?.editCallback()
                          }
                        >
                          {due(lead) ? '상담과 함께 변경' : '상담과 함께 예약'}
                        </Button>
                      </div>
                    )}
                    {!client && (
                      <div className="inline between current-profile">
                        <span>
                          희망지역 {lead.region || '미기재'} ·{' '}
                          {normalizeStartupType(lead.startupType)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setModal({ kind: 'profile', leadId: lead.id })
                          }
                        >
                          창업조건 수정
                        </Button>
                      </div>
                    )}
                    {!client && <div className="inline between current-profile">
                      <span>DB 점수 <strong>{scoreResult(lead.qualification).label}</strong>{lead.qualification && <small className="muted"> · {lead.qualification.author} · {dateLabel(lead.qualification.updatedAt)}</small>}</span>
                      <Button size="sm" variant="outline" onClick={() => setModal({ kind: 'score', leadId: lead.id })}>점수 평가</Button>
                    </div>}
                    {admin && otherBrandLeads(lead).length > 0 && (
                      <div className="cross-brand-panel">
                        <strong>같은 연락처의 타 브랜드 문의</strong>
                        <p className="muted">
                          브랜드별 고객·상담·담당자를 각각 관리합니다.
                        </p>
                        {otherBrandLeads(lead).map((x) => (
                          <Button
                            key={x.id}
                            variant="outline"
                            size="sm"
                            onClick={() => openLead(x.id)}
                          >
                            {brandName(x.brandId)} · {ownerName(x.ownerId)} ·{' '}
                            {x.status}
                          </Button>
                        ))}
                      </div>
                    )}
                    <div className="detail-actions">
                      <div className="detail-field">
                        <span>진행상태</span>
                        <strong className="call-current-status">
                          {lead.status}
                        </strong>
                      </div>
                      <div className="detail-field">
                        <span>담당자</span>
                        <span>{ownerName(lead.ownerId)}</span>
                      </div>
                      {manager && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setModal({ kind: 'assign', leadId: lead.id })
                          }
                        >
                          담당자 배정
                        </Button>
                      )}
                    </div>
                    {!client &&
                      alerts(data, lead.id).some(
                        (a) => a.label !== '새 문의',
                      ) && (
                        <details className="call-alerts">
                          <summary>
                            미확인 배정·요청{' '}
                            {
                              alerts(data, lead.id).filter(
                                (a) => a.label !== '새 문의',
                              ).length
                            }
                            건
                          </summary>
                          {!client &&
                            alerts(data, lead.id)
                              .filter((a) => a.label !== '새 문의')
                              .map((a) => (
                                <div className="alert-card" key={a.id}>
                                  <div>
                                    <strong>{a.label}</strong>
                                    <p>{a.text}</p>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() =>
                                      action(
                                        { action: 'ack', id: a.id },
                                        '확인했습니다.',
                                      )
                                    }
                                  >
                                    확인
                                  </Button>
                                </div>
                              ))}
                        </details>
                      )}
                    {inquiries(lead.id)[0] &&
                      (!client && latestNote(data, lead.id) ? (
                        <details className="call-original-inquiry">
                          <summary>최초 문의·유입 정보 보기</summary>
                          {inquiryCard(inquiries(lead.id)[0], true)}
                        </details>
                      ) : (
                        inquiryCard(inquiries(lead.id)[0], true)
                      ))}
                    {!client && (
                      <>
                        {data.meetings.some(
                          (e) => e.leadId === lead.id && e.status === '예정',
                        ) && (
                          <div className="call-meetings">
                            <span className="muted">예정 미팅</span>
                            {data.meetings
                              .filter(
                                (e) =>
                                  e.leadId === lead.id && e.status === '예정',
                              )
                              .sort((a, b) =>
                                (a.date + a.start).localeCompare(
                                  b.date + b.start,
                                ),
                              )
                              .map((e) => (
                                <Button
                                  key={e.id}
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setModal({ kind: 'event', id: e.id })
                                  }
                                >
                                  {dateLabel(e.date + 'T' + e.start)} ·{' '}
                                  {e.title} · {e.place}
                                </Button>
                              ))}
                          </div>
                        )}
                      </>
                    )}
                  </>
                }
                history={
                  <>
                    <div className="inline between section-title">
                      <h2>
                        상담 타임라인{' '}
                        <span className="muted">
                          {notes(lead.id).length}건 · 누적 보관
                        </span>
                      </h2>
                      {!client && (
                        <div className="inline">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setModal({ kind: 'inquiry', leadId: lead.id })
                            }
                          >
                            추가 문의
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelected(null);
                              setPage('docs');
                              setBrand(lead.brandId);
                            }}
                          >
                            브랜드 자료
                          </Button>
                        </div>
                      )}
                    </div>
                    <ul className="timeline">
                      {[
                        ...notes(lead.id).map((n) => ({
                          id: n.id,
                          time: n.createdAt,
                          node: (
                            <>
                              <div className="inline between">
                                <strong>
                                  {n.author}
                                  <span className={'scope ' + n.scope}>
                                    {n.kind === 'request'
                                      ? '본사 요청'
                                      : n.scope === 'internal'
                                        ? '내부'
                                        : '공유 상담'}
                                    {n.outcome && n.outcome !== '메모만'
                                      ? ' · ' + n.outcome
                                      : ''}
                                  </span>
                                </strong>
                                <time>{dateLabel(n.createdAt)}</time>
                              </div>
                              <p>{n.text}</p>
                            </>
                          ),
                        })),
                        ...inquiries(lead.id)
                          .slice(1)
                          .map((q) => ({
                            id: q.id,
                            time: q.receivedAt,
                            node: inquiryCard(q),
                          })),
                      ]
                        .sort((a, b) => b.time.localeCompare(a.time))
                        .map((n) => (
                          <li key={n.id}>{n.node}</li>
                        ))}
                    </ul>
                    {!client && (
                      <details>
                        <summary>연락·배정·진행 변경 이력</summary>
                        <ul className="history-list">
                          {data.activities
                            .filter((a) => a.leadId === lead.id)
                            .map((a) => (
                              <li key={a.id}>
                                <time>{dateLabel(a.createdAt)}</time> {a.author}{' '}
                                · {a.text}
                              </li>
                            ))}
                        </ul>
                      </details>
                    )}
                  </>
                }
              />
              <section
                className="call-editor"
                aria-label={client ? '본사 요청 작성' : '통화 상담 작성'}
              >
                {!modal && feedback}
                <Composer
                  key={`${data.user.id}:${lead.id}`}
                  data={data}
                  lead={lead}
                  action={action}
                  busy={busy}
                  callbackEditorRef={callbackEditorRef}
                />
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!modal}
        onOpenChange={(open) => {
          if (!open) {
            setModal(null);
            setError('');
          }
        }}
      >
        <DialogContent
          className={'app-modal ' + (modal?.kind === 'doc' ? 'wide-modal' : '')}
        >
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
            <DialogDescription>
              {modal?.kind === 'account'
                ? '아이디와 권한을 설정합니다. 비밀번호는 저장 후 조회할 수 없습니다.'
                : modal?.kind === 'password'
                  ? '변경하면 다시 로그인해야 합니다.'
                  : '저장한 내용은 로컬 개발 데이터에 반영됩니다.'}
            </DialogDescription>
          </DialogHeader>
          {feedback}
          {modal?.kind === 'score' && modalLead ? (
            <LeadScoreEditor key={modalLead.id} lead={modalLead} action={action} busy={busy} onSaved={() => setModal(null)} />
          ) : modal?.kind === 'doc' && doc ? (
            <>
              <p className="muted">
                v{doc.version} · {doc.date} · {doc.change}
              </p>
              {doc.fileKey ? (
                <>
                  <a
                    className="link"
                    href={`/api/files?id=${doc.id}&download=1`}
                  >
                    파일 다운로드
                  </a>
                  {doc.mime === 'application/pdf' ? (
                    <iframe
                      className="pdf-preview"
                      title={doc.title}
                      src={`/api/files?id=${doc.id}`}
                    />
                  ) : (
                    <Image
                      width={1200}
                      height={900}
                      unoptimized
                      className="image-preview"
                      alt={doc.title}
                      src={`/api/files?id=${doc.id}`}
                    />
                  )}
                </>
              ) : (
                <p className="empty">
                  파일이 아직 없는 예시 자료입니다. 관리자가 새 버전을 업로드할
                  수 있습니다.
                </p>
              )}
              <Button
                disabled={busy}
                onClick={() =>
                  action(
                    { action: 'readDoc', id: doc.id },
                    '이 버전을 확인 처리했습니다.',
                  )
                }
              >
                {doc.readBy.includes(data.user.id)
                  ? '✓ 이 버전 확인 완료'
                  : '이 버전 확인 완료'}
              </Button>
              {!!doc.versions?.length && (
                <details>
                  <summary>이전 버전 {doc.versions.length}개</summary>
                  {doc.versions.map((v) => (
                    <p key={v.version}>
                      <a
                        className="link"
                        href={`/api/files?id=${doc.id}&version=${encodeURIComponent(v.version)}&download=1`}
                      >
                        v{v.version} · {v.date} 다운로드
                      </a>
                    </p>
                  ))}
                </details>
              )}
            </>
          ) : modal?.kind === 'callback' ? (
            <div className="event-detail">
              <h2>
                {modalLead?.name} · {modalLead && brandName(modalLead.brandId)}
              </h2>
              {data.callbacks
                .filter((t) => t.id === modal.id)
                .map((t) => (
                  <div key={t.id}>
                    <p>약속: {dateLabel(t.dueAt)}</p>
                    <p>담당: {ownerName(t.ownerId)}</p>
                    <p>
                      상태:{' '}
                      {t.status === '예정' && t.dueAt < clock
                        ? '연락 지연'
                        : t.status}
                    </p>
                    {t.completedAt && <p>처리: {dateLabel(t.completedAt)}</p>}
                  </div>
                ))}
              <Button
                onClick={() => {
                  const id = modal.leadId!;
                  setModal(null);
                  openLead(id);
                }}
              >
                고객 상세·상담 기록
              </Button>
            </div>
          ) : modal?.kind === 'event' && client && event ? (
            <div className="event-detail">
              <h2>
                {data.leads.find((l) => l.id === event.leadId)?.name} ·{' '}
                {brandName(
                  data.leads.find((l) => l.id === event.leadId)!.brandId,
                )}
              </h2>
              <p>
                {event.date} {event.start}–{event.end}
              </p>
              <p>
                {ownerName(event.ownerId)} · {event.place} · {event.status}
              </p>
              <Button
                onClick={() => {
                  setModal(null);
                  openLead(event.leadId);
                }}
              >
                고객 상세
              </Button>
            </div>
          ) : (
            <form
              className="modal-form"
              key={`${modal?.kind}:${modal?.id}:${modal?.leadId}`}
              onSubmit={submit}
            >
              {modal?.kind === 'new' && (
                <>
                  <label htmlFor="page-field-3">
                    브랜드
                    <NativeSelect
                      id="page-field-3"
                      name="brandId"
                      defaultValue={
                        brand === 'all' ? categoryBrands[0]?.id : brand
                      }
                    >
                      {categoryBrands
                        .filter((b) => b.active)
                        .map((b) => (
                          <option value={b.id} key={b.id}>
                            {b.name}
                          </option>
                        ))}
                    </NativeSelect>
                  </label>
                  <div className="two-columns">
                    {field('고객 성함', 'name')}
                    {field('연락처', 'phone', '', 'tel')}
                  </div>
                  {field('이메일', 'email', '', 'email', false)}
                  <div className="two-columns">
                    {field('창업 희망지역', 'region', '', 'text', false)}
                    <label>
                      창업 형태
                      <NativeSelect name="startupType" defaultValue="미분류">
                        {['미분류', ...startupTypes].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </NativeSelect>
                    </label>
                  </div>
                  <p className="muted">
                    같은 연락처도 브랜드가 다르면 별도로 등록·배정합니다. 같은
                    브랜드의 재문의는 기존 고객에 추가해 주세요.
                  </p>
                  <label htmlFor="page-field-4">
                    접수 경로
                    <NativeSelect id="page-field-4" name="source">
                      <option>전화</option>
                      <option>소개</option>
                      <option>방문</option>
                      <option>기타</option>
                    </NativeSelect>
                  </label>
                  <label htmlFor="page-field-5">
                    문의 내용
                    <Textarea
                      id="page-field-5"
                      name="text"
                      required
                      maxLength={4000}
                    />
                  </label>
                </>
              )}
              {modal?.kind === 'assign' && (
                <>
                  <label htmlFor="page-field-6">
                    새 담당자
                    <NativeSelect
                      id="page-field-6"
                      name="ownerId"
                      required
                      defaultValue=""
                    >
                      <option value="" disabled>
                        담당자를 선택해 주세요
                      </option>
                      {data.members
                        .filter(
                          (m) =>
                            m.active &&
                            (modal.leadId ? [modal.leadId] : checks).every(
                              (id) =>
                                m.brands.includes(
                                  data.leads.find((l) => l.id === id)!.brandId,
                                ),
                            ),
                        )
                        .map((m) => (
                          <option value={m.id} key={m.id}>
                            {m.name}
                          </option>
                        ))}
                    </NativeSelect>
                  </label>
                  <p className="muted">
                    미처리 재연락과 예정 미팅도 함께 인수인계됩니다. 시간이
                    겹치면 먼저 일정을 조정해 주세요.
                  </p>
                </>
              )}
              {modal?.kind === 'next' && (
                <>
                  {field(
                    '다음 연락 날짜·시간',
                    'date',
                    modalLead ? pending(data, modalLead.id)?.dueAt || '' : '',
                    'datetime-local',
                    false,
                  )}
                  <p className="muted">
                    날짜를 비우고 저장하면 재연락 예약을 해제합니다. 상담기록과
                    미팅은 유지됩니다.
                  </p>
                </>
              )}
              {(modal?.kind === 'meeting' || modal?.kind === 'event') && (
                <>
                  {event ? (
                    <>
                      <h2>
                        {data.leads.find((l) => l.id === event.leadId)?.name} ·{' '}
                        {ownerName(event.ownerId)}
                      </h2>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setModal(null);
                          openLead(event.leadId);
                        }}
                      >
                        고객 상세 보기
                      </Button>
                      <label htmlFor="page-field-7">
                        미팅 결과
                        <NativeSelect
                          id="page-field-7"
                          name="meetingStatus"
                          defaultValue={event.status}
                        >
                          {['예정', '완료', '취소', '불참'].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </NativeSelect>
                      </label>
                    </>
                  ) : (
                    <label htmlFor="page-field-8">
                      고객
                      <NativeSelect
                        id="page-field-8"
                        name="leadId"
                        defaultValue={modal?.leadId || ''}
                        required
                      >
                        <option value="" disabled>
                          고객 선택
                        </option>
                        {data.leads
                          .filter((l) => l.ownerId)
                          .map((l) => (
                            <option value={l.id} key={l.id}>
                              {l.name} · {brandName(l.brandId)} ·{' '}
                              {ownerName(l.ownerId)}
                            </option>
                          ))}
                      </NativeSelect>
                    </label>
                  )}
                  {field('미팅 날짜', 'date', event?.date || today(), 'date')}
                  <div className="two-columns">
                    {field(
                      '시작 시간',
                      'start',
                      event?.start || '14:00',
                      'time',
                    )}
                    {field('종료 시간', 'end', event?.end || '15:00', 'time')}
                  </div>
                  {field('장소', 'place', event?.place || '본사 상담실')}
                  {field('미팅 내용', 'title', event?.title || '창업 상담')}
                  {event && (
                    <>
                      <label htmlFor="page-field-9">
                        변경 사유·미팅 결과
                        <Textarea
                          id="page-field-9"
                          name="reason"
                          required
                          maxLength={1000}
                          placeholder="변경 사유 또는 미팅 결과를 남겨 주세요."
                        />
                      </label>
                      <label htmlFor="page-field-10">
                        다음 연락
                        <Input
                          id="page-field-10"
                          type="datetime-local"
                          name="next"
                          defaultValue={
                            pending(data, event.leadId)?.dueAt || ''
                          }
                        />
                      </label>
                      <p className="muted">
                        기존 재연락 약속을 유지하거나 변경할 수 있습니다.
                      </p>
                      <details>
                        <summary>일정 변경 이력</summary>
                        {event.history?.map((h, i) => (
                          <p key={i}>
                            {dateLabel(h.at)} · {h.author} · {h.text}
                          </p>
                        ))}
                      </details>
                    </>
                  )}
                </>
              )}
              {modal?.kind === 'inquiry' && (
                <>
                  <label htmlFor="page-field-11">
                    추가 문의 경로
                    <NativeSelect id="page-field-11" name="source">
                      <option>전화</option>
                      <option>홈페이지</option>
                      <option>구글시트</option>
                      <option>기타</option>
                    </NativeSelect>
                  </label>
                  <label htmlFor="page-field-12">
                    문의 내용
                    <Textarea
                      id="page-field-12"
                      required
                      name="text"
                      maxLength={4000}
                    />
                  </label>
                  <p className="muted">
                    최초 문의는 보존하고 새 접수 건으로 추가합니다.
                  </p>
                </>
              )}
              {modal?.kind === 'upload' && (
                <>
                  {!doc && (
                    <label htmlFor="page-field-13">
                      브랜드
                      <NativeSelect
                        id="page-field-13"
                        name="brandId"
                        defaultValue={
                          brand === 'all' ? categoryBrands[0]?.id : brand
                        }
                      >
                        {categoryBrands
                          .filter((b) => b.active)
                          .map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                      </NativeSelect>
                    </label>
                  )}
                  {field('자료 제목', 'title', doc?.title || '')}
                  {field('새 버전', 'version', '')}
                  <label htmlFor="page-field-14">
                    변경 내용
                    <Textarea
                      id="page-field-14"
                      name="change"
                      required
                      maxLength={1000}
                    />
                  </label>
                  <label htmlFor="page-field-15">
                    PDF·이미지 파일 (최대 10MB)
                    <Input
                      id="page-field-15"
                      type="file"
                      name="file"
                      accept="application/pdf,image/png,image/jpeg,image/webp"
                      required
                    />
                  </label>
                  <p className="muted">
                    배포하면 담당자들의 새 버전 확인 상태가 초기화됩니다. 이전
                    파일은 보관됩니다.
                  </p>
                </>
              )}
              {modal?.kind === 'brand' && (
                <>
                  {field('브랜드 이름', 'name', editBrand?.name || '')}
                  {field('소속 회사', 'company', editBrand?.company || '')}
                  <fieldset>
                    <legend>대행 유형 · 복수 선택 가능</legend>
                    {agencyServices.map((service) => (
                      <label className="inline" key={service}>
                        <input
                          type="checkbox"
                          name="services"
                          value={service}
                          defaultChecked={brandServices(
                            editBrand || {},
                          ).includes(service)}
                        />
                        {service}
                      </label>
                    ))}
                  </fieldset>
                  <label htmlFor="page-field-16">
                    운영 상태
                    <NativeSelect
                      id="page-field-16"
                      name="active"
                      defaultValue={String(editBrand?.active ?? true)}
                    >
                      <option value="true">운영 중</option>
                      <option value="false">비활성</option>
                    </NativeSelect>
                  </label>
                </>
              )}
              {modal?.kind === 'member' && (
                <>
                  {field('영업팀원 이름', 'name', editMember?.name || '')}
                  <fieldset>
                    <legend>담당 브랜드 · 여러 개 선택 가능</legend>
                    {data.brands.map((b) => (
                      <label className="inline" key={b.id}>
                        <input
                          type="checkbox"
                          name="brands"
                          value={b.id}
                          defaultChecked={editMember?.brands.includes(b.id)}
                        />
                        {b.name}
                      </label>
                    ))}
                  </fieldset>
                  <label htmlFor="page-field-17">
                    재직 상태
                    <NativeSelect
                      id="page-field-17"
                      name="active"
                      defaultValue={String(editMember?.active ?? true)}
                    >
                      <option value="true">재직</option>
                      <option value="false">비활성</option>
                    </NativeSelect>
                  </label>
                  <p className="muted">
                    팀원 등록 후 ‘로그인 계정’에서 해당 팀원에게 계정을 발급해
                    주세요.
                  </p>
                </>
              )}
              {modal?.kind === 'account' && (
                <>
                  {field('계정 표시 이름', 'name', account?.name || '')}
                  {field(
                    '아이디 (한글·영문·숫자·점·밑줄·하이픈, 2~40자)',
                    'username',
                    account?.username || '',
                  )}
                  <label htmlFor="page-field-18">
                    권한
                    <NativeSelect
                      id="page-field-18"
                      name="role"
                      defaultValue={
                        account?.role ||
                        (modal.brandId
                          ? data.brands
                              .find((b) => b.id === modal.brandId)
                              ?.services?.includes('영업대행') === false
                            ? 'client_admin'
                            : 'client'
                          : 'staff')
                      }
                    >
                      <option value="admin">관리자</option>
                      <option value="staff">영업팀원</option>
                      <option value="client">
                        영업대행 고객사 · 조회 전용
                      </option>
                      <option value="client_admin">
                        광고대행 고객사 · 직접 관리
                      </option>
                    </NativeSelect>
                  </label>
                  <label htmlFor="page-field-19">
                    연결할 영업팀원 (영업 권한일 때)
                    <NativeSelect
                      id="page-field-19"
                      name="memberId"
                      defaultValue={account?.memberId || ''}
                    >
                      <option value="">선택 안 함</option>
                      {data.members
                        .filter((m) => m.active)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                    </NativeSelect>
                  </label>
                  <fieldset>
                    <legend>담당 브랜드 (고객사 권한일 때)</legend>
                    {data.brands.map((b) => (
                      <label className="inline" key={b.id}>
                        <input
                          type="checkbox"
                          name="brandIds"
                          value={b.id}
                          defaultChecked={
                            account
                              ? account.brandIds.includes(b.id)
                              : modal.brandId === b.id
                          }
                        />
                        {b.name}
                      </label>
                    ))}
                  </fieldset>
                  {field(
                    account
                      ? `새 비밀번호 (변경할 때만, ${minimumPasswordLength(data.environment)}자 이상)`
                      : `초기 비밀번호 (${minimumPasswordLength(data.environment)}자 이상)`,
                    'password',
                    '',
                    'password',
                    !account,
                  )}
                  <label htmlFor="page-field-20">
                    계정 상태
                    <NativeSelect
                      id="page-field-20"
                      name="active"
                      defaultValue={String(account?.active ?? true)}
                    >
                      <option value="true">활성</option>
                      <option value="false">비활성</option>
                    </NativeSelect>
                  </label>
                </>
              )}
              {modal?.kind === 'profile' && (
                <>
                  {field(
                    '현재 창업 희망지역',
                    'region',
                    modalLead?.region || '',
                  )}
                  <label>
                    현재 창업 형태
                    <NativeSelect
                      name="startupType"
                      defaultValue={normalizeStartupType(
                        modalLead?.startupType,
                      )}
                    >
                      {['미분류', ...startupTypes].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </NativeSelect>
                  </label>
                  {field(
                    '희망 예산',
                    'budget',
                    modalLead?.budget || '',
                    'text',
                    false,
                  )}
                  <p className="muted">최초 문의 원문과 연락처는 유지됩니다.</p>
                </>
              )}
              {modal?.kind === 'password' && (
                <>
                  {field('현재 비밀번호', 'currentPassword', '', 'password')}
                  {field(
                    `새 비밀번호 (${minimumPasswordLength(data.environment)}자 이상)`,
                    'password',
                    '',
                    'password',
                  )}
                </>
              )}
              <Button type="submit" disabled={busy}>
                {busy
                  ? '저장 중…'
                  : modal?.kind === 'upload'
                    ? '공식 배포'
                    : '저장'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
