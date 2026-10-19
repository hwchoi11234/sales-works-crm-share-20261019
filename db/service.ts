import {
  isEmployee,
  isCompanyRole,
  isExternal,
  selfManagedBrand,
} from '@/lib/permissions';
import {
  normalizeUsername,
  validUsername,
  minimumPasswordLength,
} from '@/lib/account-policy';
import { brandServices, validServices } from '@/lib/agency';
const stringValue = (v: unknown) => (typeof v === 'string' ? v : '');
import { env } from 'cloudflare:workers';
import { recontactEligible, recontactTimes } from './recontact';
import type {
  State,
  Lead,
  Member,
  Brand,
  Inquiry,
  Note,
  Meeting,
  Doc,
} from '@/lib/types';
import { normalizeStartupType, normalizePhone } from '@/lib/lead-fields';
import { parseScoreAnswers, scoreResult } from '@/lib/lead-score';
import { statuses } from '@/lib/types';
import {
  db,
  guard,
  authenticate,
  companyParent,
  publicAccount,
  HttpError,
  hashPassword,
  digest,
  type Account,
} from './auth';
export { db, guard, HttpError } from './auth';
import type { Callback, Activity } from '@/lib/types';
async function rows<T>(sql: string, ...args: unknown[]): Promise<T[]> {
  const r = await db()
    .prepare(sql)
    .bind(...args)
    .all<{ data: string }>();
  return r.results.map((r) => JSON.parse(r.data));
}
export async function getState(req: Request): Promise<State> {
  guard(req);
  const account = await authenticate(req),
    role = account.role;
  const allMembers = await rows<Member>('SELECT data FROM members');
  const allBrands = await rows<Brand>('SELECT data FROM brands');
  const company = isCompanyRole(role) ? await companyParent(account) : null;
  const companyBrands = company
    ? allBrands
        .filter(
          (b) =>
            (JSON.parse(company.brand_ids) as string[]).includes(b.id) &&
            selfManagedBrand(b),
        )
        .map((b) => b.id)
    : [];
  const member = allMembers.find((m) => m.id === account.member_id && m.active);
  const allowed =
    role === 'admin'
      ? null
      : role === 'client'
        ? (JSON.parse(account.brand_ids) as string[])
        : role === 'client_admin'
          ? companyBrands
          : role === 'client_staff'
            ? companyBrands.filter((id) => member?.brands.includes(id))
            : role === 'staff' && !member?.tenantId
              ? member?.brands || []
              : [];
  const brands = allBrands.filter((b) => !allowed || allowed.includes(b.id));
  const q =
    role === 'admin'
      ? '1=1'
      : allowed?.length
        ? `${isEmployee(role) ? 'owner_id=? AND ' : ''}brand_id IN (${allowed.map(() => '?').join(',')})`
        : '0=1';
  const params =
    role === 'admin' || !allowed?.length
      ? []
      : isEmployee(role)
        ? [account.member_id, ...allowed]
        : allowed;
  const leadRows = await db()
    .prepare(
      `SELECT leads.*, mt.updated_at AS modified_at FROM leads JOIN lead_modification_times mt ON mt.id=leads.id WHERE ${q} ORDER BY leads.id DESC`,
    )
    .bind(...params)
    .all<{
      id: number;
      modified_at: string;
      brand_id: string;
      owner_id: string | null;
      status: string;
      data: string;
    }>();
  const leads = leadRows.results.map(
    (r) =>
      ({
        ...JSON.parse(r.data),
        id: r.id,
        updatedAt: r.modified_at,
        brandId: r.brand_id,
        ownerId: r.owner_id,
        status: r.status,
        startupType: normalizeStartupType(JSON.parse(r.data).startupType),
      }) as Lead,
  );
  if (role === 'client') for (const l of leads) delete l.qualification;
  // Reuse the authorized lead scope without one bind variable per customer.
  const inside = `SELECT id FROM leads WHERE ${q}`;
  const [notes, inquiries, meetings, docs] = await Promise.all([
    rows<Note>(
      `SELECT data FROM notes WHERE lead_id IN (${inside}) ${role === 'client' ? "AND scope='shared'" : ''} ORDER BY created_at DESC, rowid DESC`,
      ...params,
    ),
    rows<Inquiry>(
      `SELECT data FROM inquiries WHERE lead_id IN (${inside}) ORDER BY rowid`,
      ...params,
    ),
    rows<Meeting>(
      `SELECT data FROM meetings WHERE lead_id IN (${inside})`,
      ...params,
    ),
    isExternal(role)
      ? Promise.resolve([])
      : rows<Doc>(
          `SELECT data FROM documents WHERE brand_id IN (${brands.map(() => '?').join(',') || 'NULL'})`,
          ...brands.map((b) => b.id),
        ),
  ]);
  const members =
    role === 'admin'
      ? allMembers
      : allMembers
          .filter(
            (m) =>
              (isCompanyRole(role)
                ? m.tenantId === company?.id &&
                  (role !== 'client_staff' || m.id === account.member_id)
                : role !== 'staff' || !m.tenantId) &&
              m.brands.some((b) => brands.some((x) => x.id === b)),
          )
          .map((m) => ({
            ...m,
            brands: m.brands.filter((b) => brands.some((x) => x.id === b)),
          }));
  const callbacks =
    role === 'client'
      ? []
      : await rows<Callback>(
          `SELECT data FROM callbacks WHERE lead_id IN (${inside})`,
          ...params,
        );
  const activities = await rows<Activity>(
    `SELECT data FROM activities WHERE lead_id IN (${inside}) ORDER BY created_at DESC`,
    ...params,
  );
  const ack = await db()
    .prepare('SELECT target_id FROM acknowledgments WHERE account_id=?')
    .bind(account.id)
    .all<{ target_id: string }>();
  const storedStatuses = (
    await db()
      .prepare('SELECT name, active FROM lead_statuses ORDER BY rowid')
      .all<{ name: string; active: number }>()
  ).results;
  const defaultNames = [
    ...statuses.slice(0, 3),
    '부동산 임장중',
    ...statuses.slice(3),
  ];
  const statusOptions = [
    ...defaultNames,
    ...storedStatuses
      .map((s) => s.name)
      .filter((n) => !defaultNames.includes(n)),
  ].map((name) => ({
    name,
    builtIn: statuses.includes(name),
    active:
      statuses.includes(name) ||
      (storedStatuses.find((s) => s.name === name)?.active ?? 1) === 1,
  }));
  const poolAllowed =
    role === 'admin' ? brands.map((b) => b.id) : allowed || [];
  const poolRows =
    isExternal(role) || !poolAllowed.length
      ? []
      : (
          await db()
            .prepare(`
    SELECT l.id,l.brand_id,l.owner_id,l.status,l.data,mt.updated_at
    FROM leads l JOIN lead_modification_times mt ON mt.id=l.id
    WHERE l.brand_id IN (${poolAllowed.map(() => '?').join(',')})
      AND ${recontactEligible}
      ${role === 'staff' ? 'AND l.owner_id IS NOT ?' : ''}
    ORDER BY mt.updated_at,l.id
  `)
            .bind(
              ...poolAllowed,
              ...recontactTimes(),
              ...(role === 'staff' ? [account.member_id] : []),
            )
            .all<{
              id: number;
              brand_id: string;
              owner_id: string;
              status: string;
              data: string;
              updated_at: string;
            }>()
        ).results;
  const recontactLeads = poolRows.map((r) => {
    const info = JSON.parse(r.data);
    return {
      id: r.id,
      brandId: r.brand_id,
      ownerId: r.owner_id,
      status: r.status,
      name: info.name,
      region: info.region,
      startupType: normalizeStartupType(info.startupType),
      updatedAt: r.updated_at,
      availableAt: new Date(
        Date.parse(r.updated_at) + 20 * 86400000,
      ).toISOString(),
      idleDays: Math.floor((Date.now() - Date.parse(r.updated_at)) / 86400000),
    };
  });
  const companyAuthorIds = new Set(
    company
      ? (
          await db()
            .prepare(
              "SELECT a.id FROM accounts a JOIN members m ON a.member_id=m.id WHERE json_extract(m.data,'$.tenantId')=?",
            )
            .bind(company.id)
            .all<{ id: string }>()
        ).results.map((a) => a.id)
      : [],
  );
  return {
    recontactLeads,
    statusOptions,
    role,
    actor: isEmployee(role)
      ? allMembers.find((m) => m.id === account.member_id)?.name || account.name
      : account.name,
    user: {
      ...publicAccount(account),
      ...(isCompanyRole(role) ? { brandIds: allowed || [] } : {}),
    },
    accounts:
      role === 'admin'
        ? (
            await db().prepare('SELECT * FROM accounts').all<Account>()
          ).results.map(publicAccount)
        : role === 'client_admin'
          ? (
              await db()
                .prepare(
                  "SELECT a.* FROM accounts a JOIN members m ON m.id=a.member_id WHERE a.role='client_staff' AND json_extract(m.data,'$.tenantId')=?",
                )
                .bind(account.id)
                .all<Account>()
            ).results.map(publicAccount)
          : [],
    environment: String(env.CRM_ENV),
    brands,
    members,
    leads: leads.map((l) => ({
      ...l,
      nextAt:
        role === 'client'
          ? ''
          : callbacks.find((t) => t.leadId === l.id && t.status === '예정')
              ?.dueAt || '',
    })),
    inquiries,
    notes: isCompanyRole(role)
      ? notes.filter(
          (n) =>
            n.scope === 'shared' ||
            n.actorId === company?.id ||
            companyAuthorIds.has(n.actorId || ''),
        )
      : notes,
    meetings,
    docs: docs.filter((d) => role === 'admin' || d.published),
    callbacks,
    activities:
      role === 'client'
        ? activities
            .filter((a) => ['status', 'meeting'].includes(a.kind))
            .map((a) => ({
              ...a,
              text: a.kind === 'status' ? `진행상태: ${a.status}` : '미팅 변경',
            }))
        : activities,
    acknowledged: ack.results.map((a) => a.target_id),
  };
}
function text(v: unknown, max = 4000) {
  if (typeof v !== 'string' || !v.trim() || v.length > max)
    throw new HttpError(400, '필수 항목과 입력 길이를 확인해 주세요.');
  return v.trim();
}
const insertJson = (table: string, columns: string[], values: unknown[]) =>
  db()
    .prepare(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES (${values.map(() => '?').join(',')})`,
    )
    .bind(...values);
const validDate = (v: unknown) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
function dueDate(v: unknown) {
  if (
    typeof v !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v) ||
    !validDate(v.slice(0, 10))
  )
    throw new HttpError(400, '다음 연락 날짜와 시간을 확인해 주세요.');
  return v;
}
const updateLead = (l: Lead) =>
  db()
    .prepare('UPDATE leads SET status=?,data=? WHERE id=?')
    .bind(l.status, JSON.stringify({ ...l, nextAt: '' }), l.id);
function history(
  state: State,
  l: Lead,
  kind: string,
  message: string,
  status?: string,
) {
  const a: Activity = {
    id: crypto.randomUUID(),
    leadId: l.id,
    ownerId: l.ownerId,
    actorId: state.user.id,
    author: state.actor,
    kind,
    text: message,
    status,
    createdAt: new Date().toISOString(),
  };
  return insertJson(
    'activities',
    ['id', 'lead_id', 'created_at', 'data'],
    [a.id, l.id, a.createdAt, JSON.stringify(a)],
  );
}
function callbackStatements(
  state: State,
  l: Lead,
  next: unknown,
  complete = false,
) {
  const pending = state.callbacks.filter(
      (t) => t.leadId === l.id && t.status === '예정',
    ),
    now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (next === 'keep') return statements;
  if (!complete && pending.length === 1 && pending[0].dueAt === next)
    return statements;
  if (next) dueDate(next);
  for (const t of pending)
    statements.push(
      db()
        .prepare('UPDATE callbacks SET status=?,data=? WHERE id=?')
        .bind(
          complete ? '완료' : '변경',
          JSON.stringify({
            ...t,
            status: complete ? '완료' : '변경',
            completedAt: now,
          }),
          t.id,
        ),
    );
  if (next) {
    if (!l.ownerId)
      throw new HttpError(400, '재연락 예약 전에 담당자를 배정해 주세요.');
    const t: Callback = {
      id: crypto.randomUUID(),
      leadId: l.id,
      ownerId: l.ownerId,
      dueAt: dueDate(next),
      status: '예정',
      createdAt: now,
    };
    statements.push(
      insertJson(
        'callbacks',
        ['id', 'lead_id', 'owner_id', 'due_at', 'status', 'data'],
        [t.id, l.id, l.ownerId, t.dueAt, t.status, JSON.stringify(t)],
      ),
    );
  }
  if (pending.length || next)
    statements.push(
      history(
        state,
        l,
        'callback',
        next
          ? `다음 연락 ${dueDate(next)}`
          : complete
            ? '예정 연락 처리 완료'
            : '재연락 예약 해제',
      ),
    );
  return statements;
}
export async function mutate(req: Request, b: Record<string, unknown>) {
  guard(req, true);
  const state = await getState(req),
    role = state.role,
    action = b.action,
    now = new Date().toISOString(),
    id = crypto.randomUUID();
  const lead = state.leads.find((l) => l.id === Number(b.leadId));
  let writeLeadId: number | undefined;
  const needLead = () => {
    if (!lead) throw new HttpError(404, '접근할 수 없는 고객입니다.');
    writeLeadId = lead.id;
    return lead;
  };
  const commit = async (statements: D1PreparedStatement[]) => {
    const guarded = isEmployee(role) && writeLeadId !== undefined;
    const checkId = crypto.randomUUID();
    try {
      return await db().batch(
        guarded
          ? [
              db()
                .prepare(
                  'INSERT INTO lead_write_checks(id,lead_id,owner_id) VALUES (?,?,?)',
                )
                .bind(checkId, writeLeadId, state.user.memberId),
              ...statements,
              db()
                .prepare('DELETE FROM lead_write_checks WHERE id=?')
                .bind(checkId),
            ]
          : statements,
      );
    } catch (e) {
      if (String(e).includes('lead_owner_changed'))
        throw new HttpError(
          409,
          '담당자가 변경되었습니다. 새로고침 후 확인해 주세요.',
        );
      throw e;
    }
  };
  if (role === 'client' && !['request', 'password'].includes(String(action)))
    throw new HttpError(403, '조회 전용 계정입니다.');
  if (
    [
      'assign',
      'brand',
      'member',
      'pin',
      'publish',
      'account',
      'statusOption',
      'statusOptionToggle',
    ].includes(String(action)) &&
    role !== 'admin' &&
    !(role === 'client_admin' && action === 'assign')
  )
    throw new HttpError(403, '관리자 권한이 필요합니다.');
  if (
    isCompanyRole(role) &&
    ![
      'assign',
      'companyEmployee',
      'note',
      'status',
      'next',
      'meeting',
      'meetingUpdate',
      'completeMeeting',
      'review',
      'createLead',
      'profile',
      'score',
      'inquiry',
      'ack',
      'password',
    ].includes(String(action))
  )
    throw new HttpError(403, '고객사에서 사용할 수 없는 기능입니다.');
  if (action === 'companyEmployee') {
    if (role !== 'client_admin')
      throw new HttpError(403, '고객사 관리자 권한이 필요합니다.');
    // Do not accept caller-supplied roles, tenant IDs or member IDs.
    if (
      b.role !== undefined ||
      b.tenantId !== undefined ||
      b.memberId !== undefined
    )
      throw new HttpError(400, '직원 권한과 소속은 자동으로 지정됩니다.');
    const old = state.accounts.find((a) => a.id === b.id);
    if (b.id && !old)
      throw new HttpError(404, '수정할 수 없는 직원 계정입니다.');
    const oldMember = old
      ? state.members.find(
          (m) => m.id === old.memberId && m.tenantId === state.user.id,
        )
      : undefined;
    if (old && !oldMember)
      throw new HttpError(403, '직원 소속을 확인해 주세요.');
    const brandIds = Array.isArray(b.brandIds)
      ? [...new Set(b.brandIds as string[])]
      : [];
    if (
      !brandIds.length ||
      brandIds.some(
        (id) =>
          !state.brands.some(
            (brand) => brand.id === id && selfManagedBrand(brand),
          ),
      )
    )
      throw new HttpError(400, '담당할 자사 브랜드를 선택해 주세요.');
    if (
      oldMember &&
      state.leads.some(
        (l) =>
          l.ownerId === oldMember.id &&
          (!brandIds.includes(l.brandId) ||
            (b.active === false && !['종료', '계약 완료'].includes(l.status))),
      )
    )
      throw new HttpError(
        409,
        '담당 고객을 다른 직원에게 인수인계한 뒤 소속·재직 상태를 변경해 주세요.',
      );
    const username = normalizeUsername(text(b.username, 120)),
      name = text(b.name, 80);
    if (!validUsername(username))
      throw new HttpError(400, '아이디 형식을 확인해 주세요.');
    const password = stringValue(b.password);
    if (
      (!old || password) &&
      (password.length < minimumPasswordLength(state.environment) ||
        password.length > 200)
    )
      throw new HttpError(
        400,
        `비밀번호는 ${minimumPasswordLength(state.environment)}~200자 입력해 주세요.`,
      );
    if (
      await db()
        .prepare('SELECT id FROM accounts WHERE username=? AND id!=?')
        .bind(username, old?.id || '')
        .first()
    )
      throw new HttpError(409, '이미 사용 중인 아이디입니다.');
    const memberId = oldMember?.id || crypto.randomUUID(),
      aid = old?.id || id,
      salt = crypto.randomUUID();
    const member: Member = {
      id: memberId,
      tenantId: state.user.id,
      name,
      brands: brandIds,
      active: b.active !== false,
    };
    const statements = [
      db()
        .prepare(
          'INSERT INTO members(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        )
        .bind(memberId, JSON.stringify(member)),
      old
        ? db()
            .prepare(
              'UPDATE accounts SET username=?,name=?,brand_ids=?,active=? WHERE id=?',
            )
            .bind(
              username,
              name,
              JSON.stringify(brandIds),
              member.active ? 1 : 0,
              aid,
            )
        : db()
            .prepare(
              'INSERT INTO accounts (id,username,password_hash,salt,role,name,member_id,brand_ids,active) VALUES (?,?,?,?,?,?,?,?,?)',
            )
            .bind(
              aid,
              username,
              await hashPassword(password, salt),
              salt,
              'client_staff',
              name,
              memberId,
              JSON.stringify(brandIds),
              member.active ? 1 : 0,
            ),
      db().prepare('DELETE FROM sessions WHERE account_id=?').bind(aid),
    ];
    if (old && password)
      statements.push(
        db()
          .prepare('UPDATE accounts SET password_hash=?,salt=? WHERE id=?')
          .bind(await hashPassword(password, salt), salt, aid),
      );
    await commit(statements);
    return { ok: true };
  }
  if (action === 'claimRecontact') {
    if (role !== 'staff' || !state.user.memberId)
      throw new HttpError(403, '영업사원 계정에서 재컨택을 시작해 주세요.');
    const m = state.members.find(
      (m) => m.id === state.user.memberId && m.active,
    );
    const candidate = state.recontactLeads.find(
      (l) => l.id === Number(b.leadId),
    );
    if (!m || !candidate || !m.brands.includes(candidate.brandId))
      throw new HttpError(
        409,
        '현재 재컨택할 수 없는 고객입니다. 목록을 새로고침해 주세요.',
      );
    const previous =
      state.members.find((m) => m.id === candidate.ownerId)?.name ||
      '이전 담당자';
    const log: Activity = {
      id,
      leadId: candidate.id,
      ownerId: m.id,
      actorId: state.user.id,
      author: state.actor,
      kind: 'assign',
      text: `DB 사랑방 재컨택 인수 · ${previous} → ${m.name}`,
      createdAt: now,
    };
    const token = crypto.randomUUID();
    const claimed = `EXISTS (SELECT 1 FROM leads WHERE id=? AND owner_id=? AND json_extract(data,'$.recontactClaimId')=?)`;
    const result = await db().batch([
      db()
        .prepare(`UPDATE leads SET owner_id=?,data=json_set(data,'$.ownerId',?,'$.recontactClaimId',?)
        WHERE id=? AND owner_id IS NOT ? AND brand_id IN (${m.brands.map(() => '?').join(',')})
        AND id IN (SELECT l.id FROM leads l JOIN lead_modification_times mt ON mt.id=l.id WHERE ${recontactEligible})
      `)
        .bind(
          m.id,
          m.id,
          token,
          candidate.id,
          m.id,
          ...m.brands,
          ...recontactTimes(),
        ),
      db()
        .prepare(
          `UPDATE callbacks SET owner_id=?,data=json_set(data,'$.ownerId',?) WHERE lead_id=? AND status='예정' AND ${claimed}`,
        )
        .bind(m.id, m.id, candidate.id, candidate.id, m.id, token),
      db()
        .prepare(`UPDATE meetings SET data=json_set(data,'$.ownerId',?,'$.history',json_insert(COALESCE(json_extract(data,'$.history'),'[]'),'$[#]',json(?)))
        WHERE lead_id=? AND json_extract(data,'$.status')='예정' AND ${claimed}`)
        .bind(
          m.id,
          JSON.stringify({
            at: now,
            author: state.actor,
            text: `DB 사랑방 담당자 변경: ${m.name}`,
          }),
          candidate.id,
          candidate.id,
          m.id,
          token,
        ),
      db()
        .prepare(
          `INSERT INTO activities(id,lead_id,created_at,data) SELECT ?,?,?,? WHERE ${claimed}`,
        )
        .bind(
          id,
          candidate.id,
          now,
          JSON.stringify(log),
          candidate.id,
          m.id,
          token,
        ),
    ]);
    if (!result[0].meta.changes)
      throw new HttpError(
        409,
        '다른 직원이 먼저 인수했거나 최근 수정된 고객입니다. 새로고침해 주세요.',
      );
  } else if (action === 'statusOption') {
    const name = text(b.name, 30).normalize('NFKC').replace(/\s+/g, ' ');
    if (
      state.statusOptions.some(
        (s) => s.name.replace(/\s/g, '') === name.replace(/\s/g, ''),
      )
    )
      throw new HttpError(
        409,
        '이미 있는 진행상태입니다. 사용 중지된 항목은 다시 사용해 주세요.',
      );
    const result = await db()
      .prepare(
        'INSERT OR IGNORE INTO lead_statuses (name, active) VALUES (?, 1)',
      )
      .bind(name)
      .run();
    if (!result.meta.changes)
      throw new HttpError(409, '이미 있는 진행상태입니다.');
  } else if (action === 'statusOptionToggle') {
    const option = state.statusOptions.find((s) => s.name === b.name);
    if (!option) throw new HttpError(404, '진행상태를 찾을 수 없습니다.');
    if (option.builtIn)
      throw new HttpError(
        400,
        '기본 진행상태는 업무 연동에 사용되므로 유지됩니다.',
      );
    if (typeof b.active !== 'boolean')
      throw new HttpError(400, '사용 여부를 확인해 주세요.');
    await db()
      .prepare(
        'INSERT INTO lead_statuses (name, active) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET active=excluded.active',
      )
      .bind(option.name, b.active ? 1 : 0)
      .run();
  } else if (action === 'note' || action === 'request') {
    const l = needLead(),
      scope = action === 'request' ? 'shared' : b.scope;
    if (!['shared', 'internal'].includes(String(scope)))
      throw new HttpError(400, '공개 범위를 확인해 주세요.');
    const outcome =
      action === 'request' ? '메모만' : stringValue(b.outcome || '메모만');
    if (!['통화 완료', '부재', '연락처 오류', '메모만'].includes(outcome))
      throw new HttpError(400, '연락 결과를 확인해 주세요.');
    const noteId =
      typeof b.requestId === 'string' &&
      /^[a-zA-Z0-9-]{20,80}$/.test(b.requestId)
        ? b.requestId
        : id;
    const requestHash = await digest(
      JSON.stringify({
        action,
        leadId: l.id,
        actorId: state.user.id,
        scope,
        outcome,
        text: stringValue(b.text).trim(),
        status: outcome === '메모만' ? '' : stringValue(b.status),
        next: outcome === '메모만' ? '' : stringValue(b.next),
        followupMode:
          outcome === '메모만' ? '' : stringValue(b.followupMode || 'legacy'),
        meeting:
          outcome !== '메모만' && b.followupMode === 'meeting'
            ? Object.fromEntries(
                ['date', 'start', 'end', 'place', 'title'].map((key) => [
                  key,
                  stringValue(
                    (b.meeting as Record<string, unknown> | undefined)?.[key],
                  ),
                ]),
              )
            : null,
      }),
    );
    const replay = async () => {
      const existing = await db()
        .prepare('SELECT data FROM notes WHERE id=?')
        .bind(noteId)
        .first<{ data: string }>();
      if (!existing) return null;
      const saved = JSON.parse(existing.data) as Note & {
        requestHash?: string;
      };
      if (saved.leadId !== l.id || saved.actorId !== state.user.id)
        throw new HttpError(
          409,
          '저장 요청 번호가 충돌했습니다. 새 기록으로 다시 시도해 주세요.',
          { alreadySaved: true },
        );
      if (saved.requestHash !== requestHash)
        throw new HttpError(
          409,
          '이미 저장된 요청과 내용이 다릅니다. 상담 이력을 확인한 뒤 새 기록으로 남겨주세요.',
          { alreadySaved: true },
        );
      return { ok: true, replayed: true };
    };
    const previous = await replay();
    if (previous) return previous;
    const note: Note & { requestHash: string } = {
      requestHash,
      id: noteId,
      leadId: l.id,
      text:
        typeof b.text === 'string' && b.text.trim()
          ? text(b.text)
          : ['부재', '연락처 오류'].includes(outcome)
            ? outcome
            : text(b.text),
      scope: scope as Note['scope'],
      author: state.actor,
      actorId: state.user.id,
      ownerId: l.ownerId,
      createdAt: now,
      kind: action === 'request' ? 'request' : 'consultation',
      outcome,
    };
    const statements = [
      insertJson(
        'notes',
        ['id', 'lead_id', 'scope', 'created_at', 'data'],
        [noteId, l.id, scope, now, JSON.stringify(note)],
      ),
    ];
    if (action === 'note' && outcome !== '메모만') {
      if (['계약 완료', '종료'].includes(stringValue(b.status)) && b.next)
        throw new HttpError(
          400,
          '계약 완료·종료 처리 시 다음 연락은 없음으로 선택해 주세요.',
        );
      if (!Object.hasOwn(b, 'next'))
        throw new HttpError(400, '다음 연락 여부를 선택해 주세요.');
      const mode =
        b.followupMode === undefined ? 'legacy' : stringValue(b.followupMode);
      if (!['legacy', 'keep', 'replace', 'complete', 'meeting'].includes(mode))
        throw new HttpError(400, '다음 행동을 선택해 주세요.');
      if (
        mode === 'keep' &&
        ['계약 완료', '종료'].includes(stringValue(b.status)) &&
        state.callbacks.some((t) => t.leadId === l.id && t.status === '예정')
      )
        throw new HttpError(
          400,
          '계약 완료·종료 처리 시 기존 약속 유지 대신 재연락 완료를 선택해 주세요.',
        );
      if (mode === 'replace' && !b.next)
        throw new HttpError(400, '다음 연락 날짜·시간을 선택해 주세요.');
      if (
        mode === 'replace' &&
        dueDate(b.next) <=
          new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          })
            .format(new Date())
            .replace(' ', 'T')
      )
        throw new HttpError(400, '다음 연락은 현재보다 이후로 선택해 주세요.');
      if (mode !== 'keep')
        statements.push(
          ...callbackStatements(
            state,
            l,
            ['legacy', 'replace'].includes(mode) ? b.next : '',
            true,
          ),
        );
      if (mode === 'meeting') {
        if (!l.ownerId)
          throw new HttpError(400, '먼저 담당자를 배정해 주세요.');
        if (
          !b.meeting ||
          typeof b.meeting !== 'object' ||
          Array.isArray(b.meeting)
        )
          throw new HttpError(400, '미팅 일정을 입력해 주세요.');
        const input = b.meeting as Record<string, unknown>;
        const date = stringValue(input.date),
          start = stringValue(input.start),
          end = stringValue(input.end);
        if (
          !validDate(date) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) ||
          start >= end ||
          Date.parse(date + 'T' + start + ':00+09:00') <= Date.now()
        )
          throw new HttpError(
            400,
            '미팅 시작·종료 시간을 확인해 주세요. 미래 시간, 같은 날짜로 예약할 수 있습니다.',
          );
        if (
          (await rows<Meeting>('SELECT data FROM meetings')).some(
            (e) =>
              e.ownerId === l.ownerId &&
              e.status === '예정' &&
              e.date === date &&
              e.start < end &&
              start < e.end,
          )
        )
          throw new HttpError(
            409,
            '해당 담당자의 미팅 시간이 겹칩니다. 입력한 메모는 유지됩니다.',
          );
        const meeting: Meeting = {
          id: crypto.randomUUID(),
          leadId: l.id,
          ownerId: l.ownerId,
          date,
          start,
          end,
          place: text(input.place, 200),
          title: text(input.title, 100),
          status: '예정',
          history: [
            { at: now, author: state.actor, text: '상담과 함께 미팅 등록' },
          ],
        };
        statements.push(
          insertJson(
            'meetings',
            ['id', 'lead_id', 'data'],
            [meeting.id, l.id, JSON.stringify(meeting)],
          ),
          history(state, l, 'meeting', '상담과 함께 미팅 등록'),
        );
        b.status = '미팅 예정';
      }

      for (const a of state.activities.filter(
        (a) => a.leadId === l.id && a.kind === 'assign',
      ))
        statements.push(
          db()
            .prepare('INSERT OR IGNORE INTO acknowledgments VALUES (?,?,?)')
            .bind(state.user.id + ':' + a.id, state.user.id, a.id),
        );
      if (b.status) {
        if (
          b.status !== l.status &&
          !state.statusOptions.some((s) => s.active && s.name === b.status)
        )
          throw new HttpError(400, '진행상태를 확인해 주세요.');
        statements.push(
          updateLead({ ...l, status: stringValue(b.status) }),
          history(
            state,
            l,
            'status',
            stringValue(b.status),
            stringValue(b.status),
          ),
        );
      }
    }
    try {
      await commit(statements);
    } catch (e) {
      // A concurrent retry may have committed the same immutable note first.
      const previous = await replay();
      if (previous) return previous;
      throw e;
    }
  } else if (action === 'status') {
    const l = needLead();
    if (
      b.status !== l.status &&
      !state.statusOptions.some((s) => s.active && s.name === b.status)
    )
      throw new HttpError(400, '진행상태를 확인해 주세요.');
    if (
      ['종료', '계약 완료'].includes(stringValue(b.status)) &&
      state.callbacks.some((t) => t.leadId === l.id && t.status === '예정')
    )
      throw new HttpError(
        409,
        '예정된 재연락을 먼저 처리하거나 해제해 주세요.',
      );
    await commit([
      updateLead({ ...l, status: stringValue(b.status) }),
      history(state, l, 'status', stringValue(b.status), stringValue(b.status)),
    ]);
  } else if (action === 'next') {
    const l = needLead();
    await commit(callbackStatements(state, l, b.date || '', false));
  } else if (
    action === 'meeting' ||
    action === 'meetingUpdate' ||
    action === 'completeMeeting'
  ) {
    const old =
      action === 'meeting'
        ? undefined
        : state.meetings.find((e) => e.id === b.id);
    if (action !== 'meeting' && !old)
      throw new HttpError(404, '미팅을 찾을 수 없습니다.');
    const l = old ? state.leads.find((l) => l.id === old.leadId)! : needLead();
    writeLeadId = l.id;
    const date = stringValue(b.date || old?.date || ''),
      start = stringValue(b.start || old?.start || ''),
      end = stringValue(b.end || old?.end || '');
    const status =
      action === 'completeMeeting'
        ? '완료'
        : stringValue(b.meetingStatus || old?.status || '예정');
    if (!l.ownerId) throw new HttpError(400, '먼저 담당자를 배정해 주세요.');
    if (
      !validDate(date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) ||
      start >= end ||
      !['예정', '완료', '취소', '불참'].includes(status)
    )
      throw new HttpError(400, '미팅 날짜·시간·결과를 확인해 주세요.');
    const reason = old ? text(b.reason, 1000) : '';
    if (
      status === '예정' &&
      (await rows<Meeting>('SELECT data FROM meetings')).some(
        (e) =>
          e.id !== old?.id &&
          e.ownerId === l.ownerId &&
          e.date === date &&
          e.status === '예정' &&
          e.start < end &&
          start < e.end,
      )
    )
      throw new HttpError(409, '해당 담당자의 미팅 시간이 겹칩니다.');
    const changed = {
      at: now,
      author: state.actor,
      text: old
        ? `${old.date} ${old.start} ${old.status} → ${date} ${start} ${status} · ${reason}`
        : '미팅 등록',
    };
    const meeting: Meeting = {
      id: old?.id || id,
      leadId: l.id,
      ownerId: l.ownerId,
      date,
      start,
      end,
      place: text(b.place || old?.place, 200),
      title: text(b.title || old?.title, 100),
      status,
      completedAt: status === '완료' ? old?.completedAt || now : undefined,
      history: [...(old?.history || []), changed],
    };
    const remaining = state.meetings.some(
      (e) => e.id !== old?.id && e.leadId === l.id && e.status === '예정',
    );
    const newStatus = ['계약 검토', '계약 완료', '종료'].includes(l.status)
      ? l.status
      : status === '예정'
        ? '미팅 예정'
        : remaining
          ? '미팅 예정'
          : l.status === '미팅 예정'
            ? '상담 중'
            : l.status;
    const statements = [
      old
        ? db()
            .prepare('UPDATE meetings SET data=? WHERE id=?')
            .bind(JSON.stringify(meeting), old.id)
        : insertJson(
            'meetings',
            ['id', 'lead_id', 'data'],
            [meeting.id, l.id, JSON.stringify(meeting)],
          ),
      updateLead({ ...l, status: newStatus }),
      history(state, l, 'meeting', changed.text),
    ];
    if (b.next !== undefined)
      statements.push(...callbackStatements(state, l, b.next, false));
    await commit(statements);
  } else if (action === 'review') {
    const q = state.inquiries.find((q) => q.id === b.id);
    if (!q) throw new HttpError(404, '문의를 찾을 수 없습니다.');
    if (!q.reviewed)
      await db()
        .prepare('UPDATE inquiries SET data=? WHERE id=?')
        .bind(
          JSON.stringify({
            ...q,
            reviewed: true,
            reviewer: state.actor,
            reviewedAt: now,
          }),
          q.id,
        )
        .run();
  } else if (action === 'assign') {
    if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 500)
      throw new HttpError(400, '배정할 고객을 선택해 주세요.');
    const ids = b.ids.map(Number),
      chosen = ids.map((id) => state.leads.find((l) => l.id === id));
    const m = state.members.find((m) => m.id === b.ownerId && m.active);
    if (!m || chosen.some((l) => !l || !m.brands.includes(l.brandId)))
      throw new HttpError(
        400,
        '선택한 브랜드를 담당할 수 있는 직원을 선택해 주세요.',
      );
    const pending = state.meetings.filter(
      (e) => ids.includes(e.leadId) && e.status === '예정',
    );
    const allMeetings = await rows<Meeting>('SELECT data FROM meetings');
    for (const e of pending)
      if (
        allMeetings.some(
          (x) =>
            x.id !== e.id &&
            x.status === '예정' &&
            (x.ownerId === m.id || ids.includes(x.leadId)) &&
            x.date === e.date &&
            x.start < e.end &&
            e.start < x.end,
        )
      )
        throw new HttpError(
          409,
          '인수인계할 미팅이 새 담당자의 일정과 겹칩니다. 일정을 먼저 조정해 주세요.',
        );
    const statements: D1PreparedStatement[] = [];
    for (const l of chosen as Lead[]) {
      statements.push(
        db().prepare('UPDATE leads SET owner_id=? WHERE id=?').bind(m.id, l.id),
        history(
          state,
          { ...l, ownerId: m.id },
          'assign',
          `${state.members.find((x) => x.id === l.ownerId)?.name || '미배정'} → ${m.name}`,
        ),
      );
      for (const t of state.callbacks.filter(
        (t) => t.leadId === l.id && t.status === '예정',
      ))
        statements.push(
          db()
            .prepare('UPDATE callbacks SET owner_id=?,data=? WHERE id=?')
            .bind(m.id, JSON.stringify({ ...t, ownerId: m.id }), t.id),
        );
      for (const e of pending.filter((e) => e.leadId === l.id))
        statements.push(
          db()
            .prepare('UPDATE meetings SET data=? WHERE id=?')
            .bind(
              JSON.stringify({
                ...e,
                ownerId: m.id,
                history: [
                  ...(e.history || []),
                  {
                    at: now,
                    author: state.actor,
                    text: `담당자 변경: ${m.name}`,
                  },
                ],
              }),
              e.id,
            ),
        );
    }
    await commit(statements);
  } else if (action === 'createLead') {
    const brandId = text(b.brandId, 80);
    if (!state.brands.some((x) => x.id === brandId && x.active))
      throw new HttpError(400, '운영 중인 브랜드를 선택해 주세요.');
    const name = text(b.name, 80),
      phone = normalizePhone(text(b.phone, 30));
    if (!/^0\d{8,10}$/.test(phone))
      throw new HttpError(400, '연락처를 확인해 주세요.');
    const existing = (
      await rows<Lead>('SELECT data FROM leads WHERE brand_id=?', brandId)
    ).find((l) => normalizePhone(l.phone) === phone);
    if (existing)
      throw new HttpError(
        409,
        '이 브랜드에 같은 연락처의 고객이 있습니다. 기존 고객에서 추가 문의를 남겨 주세요.',
        {
          existingLeadId: state.leads.find(
            (l) => l.brandId === brandId && normalizePhone(l.phone) === phone,
          )?.id,
        },
      );
    const l: Lead = {
      id: 0,
      brandId,
      ownerId: isEmployee(role) ? state.user.memberId : null,
      status: '신규',
      name,
      phone,
      email: typeof b.email === 'string' ? b.email.slice(0, 200) : '',
      region: typeof b.region === 'string' ? b.region.slice(0, 100) : '미기재',
      startupType: normalizeStartupType(b.startupType),
      budget: '미기재',
      createdAt: now,
      nextAt: '',
    };
    const q: Inquiry = {
      id,
      leadId: 0,
      source: text(b.source, 100) + ' · 직접 등록',
      campaign: '직접 접수',
      receivedAt: now,
      metaAutoPhone:
        /메타|meta|페이스북|facebook|인스타그램|instagram/i.test(
          stringValue(b.source),
        ) && typeof b.metaAutoPhone === 'string'
          ? b.metaAutoPhone.slice(0, 40)
          : undefined,
      raw: {
        성함: name,
        연락처: phone,
        '창업 희망지역': l.region,
        '창업 형태':
          typeof b.startupType === 'string'
            ? b.startupType.slice(0, 100)
            : '미기재',
        이메일: l.email,
        '문의 내용': text(b.text),
      },
      summary: '직접 접수한 문의입니다. 원문을 확인해 주세요.',
      reviewed: false,
      reviewer: null,
      reviewedAt: null,
      aiSample: false,
    };
    try {
      await commit([
        insertJson(
          'leads',
          ['brand_id', 'owner_id', 'status', 'data'],
          [brandId, l.ownerId, '신규', JSON.stringify(l)],
        ),
        db()
          .prepare(
            "INSERT INTO inquiries (id,lead_id,data) VALUES (?,last_insert_rowid(),json_set(?,'$.leadId',last_insert_rowid()))",
          )
          .bind(id, JSON.stringify(q)),
      ]);
    } catch (error) {
      if (String(error).includes('leads_brand_phone'))
        throw new HttpError(
          409,
          '이 브랜드에 같은 연락처의 고객이 있습니다. 목록을 새로고침하고 추가 문의를 남겨 주세요.',
        );
      throw error;
    }
  } else if (action === 'pin' || action === 'publish' || action === 'readDoc') {
    const d = state.docs.find((d) => d.id === b.id);
    if (!d) throw new HttpError(404, '자료를 찾을 수 없습니다.');
    if (action === 'pin' && !d.published)
      throw new HttpError(400, '공식 배포 후 고정할 수 있습니다.');
    const next = {
      ...d,
      ...(action === 'pin'
        ? { pinned: !d.pinned }
        : action === 'publish'
          ? { published: true }
          : { readBy: [...new Set([...d.readBy, state.user.id])] }),
    };
    await db()
      .prepare('UPDATE documents SET data=? WHERE id=?')
      .bind(JSON.stringify(next), d.id)
      .run();
  } else if (action === 'brand') {
    const old = state.brands.find((x) => x.id === b.id);
    const services = b.services ?? brandServices(old || {});
    if (!validServices(services))
      throw new HttpError(400, '대행 유형을 하나 이상 선택해 주세요.');
    const x: Brand = {
      ...(old?.sheetIntakeEnabled !== undefined ? { sheetIntakeEnabled: old.sheetIntakeEnabled } : {}),
      services,
      id: old?.id || id,
      name: text(b.name, 80),
      company: text(b.company, 100),
      active: b.active !== false,
    };
    if (old)
      await db()
        .prepare('UPDATE brands SET data=? WHERE id=?')
        .bind(JSON.stringify(x), x.id)
        .run();
    else
      await insertJson('brands', ['id', 'data'], [id, JSON.stringify(x)]).run();
  } else if (action === 'member') {
    const old = state.members.find((x) => x.id === b.id);
    if (
      !Array.isArray(b.brands) ||
      !b.brands.length ||
      b.brands.some((id) => !state.brands.some((x) => x.id === id))
    )
      throw new HttpError(400, '담당 브랜드를 선택해 주세요.');
    if (
      old &&
      b.active === false &&
      state.leads.some(
        (l) =>
          l.ownerId === old.id && !['종료', '계약 완료'].includes(l.status),
      )
    )
      throw new HttpError(
        409,
        '진행 중인 고객을 인수인계한 뒤 직원을 비활성화해 주세요.',
      );
    if (
      old &&
      state.leads.some(
        (l) =>
          l.ownerId === old.id && !(b.brands as string[]).includes(l.brandId),
      )
    )
      throw new HttpError(
        409,
        '기존 고객을 다른 직원에게 배정한 뒤 담당 브랜드를 변경해 주세요.',
      );
    const m: Member = {
      ...(old?.tenantId ? { tenantId: old.tenantId } : {}),
      id: old?.id || id,
      name: text(b.name, 80),
      brands: b.brands as string[],
      active: b.active !== false,
    };
    if (old)
      await db()
        .prepare('UPDATE members SET data=? WHERE id=?')
        .bind(JSON.stringify(m), m.id)
        .run();
    else
      await insertJson(
        'members',
        ['id', 'data'],
        [id, JSON.stringify(m)],
      ).run();
  } else if (action === 'score') {
    const l = needLead();
    let answers;
    try { answers = parseScoreAnswers(b.answers); }
    catch (e) { throw new HttpError(400, e instanceof Error ? e.message : '평가 항목을 확인해 주세요.'); }
    const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
    if (reason.length > 500) throw new HttpError(400, '평가 근거는 500자 이내로 입력해 주세요.');
    if (JSON.stringify(l.qualification?.answers) === JSON.stringify(answers) && l.qualification?.reason === reason) return { ok: true };
    const qualification = { answers, reason, author: state.actor, updatedAt: now };
    const result = scoreResult(qualification);
    await commit([updateLead({ ...l, qualification }), history(state, l, 'score',
      `고객 DB 평가 · ${result.label} · 예산 ${answers.budget ?? '미확인'}/시기 ${answers.timing ?? '미확인'}/점포 ${answers.property ?? '미확인'}/의사 ${answers.intent ?? '미확인'}${reason ? ' · ' + reason : ''}`)]);
  } else if (action === 'profile') {
    const l = needLead();
    const next = {
      ...l,
      region: text(b.region, 100),
      startupType: normalizeStartupType(b.startupType),
      budget: typeof b.budget === 'string' ? b.budget.slice(0, 100) : l.budget,
    };
    await commit([
      updateLead(next),
      history(
        state,
        l,
        'profile',
        `창업 조건 변경 · ${next.region} · ${next.startupType}`,
      ),
    ]);
  } else if (action === 'inquiry') {
    const l = needLead(),
      q: Inquiry = {
        id,
        leadId: l.id,
        source: text(b.source, 100) + ' · 직접 등록',
        campaign: '추가 문의',
        receivedAt: now,
        raw: { 성함: l.name, 연락처: l.phone, '문의 내용': text(b.text) },
        summary: '추가 문의 원문을 확인해 주세요.',
        reviewed: false,
        reviewer: null,
        reviewedAt: null,
        aiSample: false,
      };
    await commit([
      insertJson(
        'inquiries',
        ['id', 'lead_id', 'data'],
        [id, l.id, JSON.stringify(q)],
      ),
    ]);
  } else if (action === 'ack') {
    const target = stringValue(b.id);
    if (
      !state.inquiries.some((q) => q.id === target) &&
      !state.notes.some((n) => n.id === target && n.kind === 'request') &&
      !state.activities.some((a) => a.id === target && a.kind === 'assign')
    )
      throw new HttpError(404, '알림을 찾을 수 없습니다.');
    await db()
      .prepare('INSERT OR IGNORE INTO acknowledgments VALUES (?,?,?)')
      .bind(state.user.id + ':' + target, state.user.id, target)
      .run();
  } else if (action === 'password') {
    const a = await authenticate(req),
      password = text(b.password, 200);
    if (
      (await hashPassword(stringValue(b.currentPassword), a.salt)) !==
      a.password_hash
    )
      throw new HttpError(400, '현재 비밀번호가 올바르지 않습니다.');
    if (password.length < minimumPasswordLength(state.environment))
      throw new HttpError(
        400,
        `비밀번호는 ${minimumPasswordLength(state.environment)}자 이상 입력해 주세요.`,
      );
    const salt = crypto.randomUUID();
    await commit([
      db()
        .prepare('UPDATE accounts SET password_hash=?,salt=? WHERE id=?')
        .bind(await hashPassword(password, salt), salt, a.id),
      db().prepare('DELETE FROM sessions WHERE account_id=?').bind(a.id),
    ]);
  } else if (action === 'account') {
    const old = state.accounts.find((a) => a.id === b.id),
      role = stringValue(b.role),
      username = normalizeUsername(text(b.username, 120));
    if (
      !['admin', 'staff', 'client', 'client_admin'].includes(role) ||
      !validUsername(username)
    )
      throw new HttpError(400, '계정 역할과 아이디를 확인해 주세요.');
    const brandIds = Array.isArray(b.brandIds) ? (b.brandIds as string[]) : [];
    if (
      ['client', 'client_admin'].includes(role) &&
      (!brandIds.length ||
        brandIds.some((id) => !state.brands.some((x) => x.id === id)))
    )
      throw new HttpError(400, '본사에서 볼 브랜드를 선택해 주세요.');
    if (b.id && !old) throw new HttpError(404, '계정을 찾을 수 없습니다.');
    if (old?.role === 'client_staff')
      throw new HttpError(
        400,
        '고객사 직원은 해당 고객사의 직원·계정 관리에서 수정해 주세요.',
      );
    if (role === 'client_admin') {
      if (
        brandIds.some(
          (id) =>
            !state.brands.some(
              (brand) => brand.id === id && selfManagedBrand(brand),
            ),
        )
      )
        throw new HttpError(
          400,
          '직접 관리 권한은 일반 광고대행 전용 브랜드에만 부여할 수 있습니다.',
        );
      if (
        state.accounts.some(
          (a) =>
            a.id !== old?.id &&
            a.role === 'client_admin' &&
            a.brandIds.some((id) => brandIds.includes(id)),
        )
      )
        throw new HttpError(
          409,
          '이미 고객사 관리자가 지정된 브랜드입니다. 기존 계정에서 관리해 주세요.',
        );
    }
    const member =
      role === 'staff'
        ? state.members.find(
            (m) => m.id === b.memberId && m.active && !m.tenantId,
          )
        : undefined;
    if (role === 'staff' && !member)
      throw new HttpError(400, '활성 영업팀원을 선택해 주세요.');
    if (old?.id === state.user.id && (role !== 'admin' || b.active === false))
      throw new HttpError(
        400,
        '현재 관리자 계정을 비활성화하거나 권한을 낮출 수 없습니다.',
      );
    const password = typeof b.password === 'string' ? b.password : '';
    if (
      (!old || password) &&
      (password.length < minimumPasswordLength(state.environment) ||
        password.length > 200)
    )
      throw new HttpError(
        400,
        `비밀번호는 ${minimumPasswordLength(state.environment)}~200자 입력해 주세요.`,
      );
    const duplicate = await db()
      .prepare('SELECT id FROM accounts WHERE username=? AND id!=?')
      .bind(username, old?.id || '')
      .first();
    if (duplicate) throw new HttpError(409, '이미 사용 중인 아이디입니다.');
    const aid = old?.id || id,
      name = text(b.name, 80),
      salt = crypto.randomUUID();
    const statements = old
      ? [
          db()
            .prepare(
              'UPDATE accounts SET username=?,role=?,name=?,member_id=?,brand_ids=?,active=? WHERE id=?',
            )
            .bind(
              username,
              role,
              name,
              member?.id || null,
              JSON.stringify(brandIds),
              b.active === false ? 0 : 1,
              aid,
            ),
          db().prepare('DELETE FROM sessions WHERE account_id=?').bind(aid),
        ]
      : [
          db()
            .prepare('INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?,?)')
            .bind(
              aid,
              username,
              await hashPassword(password, salt),
              salt,
              role,
              name,
              member?.id || null,
              JSON.stringify(brandIds),
              b.active === false ? 0 : 1,
            ),
        ];
    if (old && password)
      statements.push(
        db()
          .prepare('UPDATE accounts SET password_hash=?,salt=? WHERE id=?')
          .bind(await hashPassword(password, salt), salt, aid),
      );
    await commit(statements);
  } else throw new HttpError(400, '지원하지 않는 작업입니다.');
  return { ok: true };
}
