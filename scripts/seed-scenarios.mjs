import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const target = process.argv[2];
if (!['development', 'test'].includes(target)) throw Error('Local only');
const accounts = JSON.parse(
  readFileSync(`.local/${target}-accounts.json`, 'utf8'),
);
const base = `http://127.0.0.1:${target === 'test' ? 4318 : 4317}`,
  admin = accounts.find((a) => a.role === 'admin');
const login = await fetch(base + '/api/session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: base },
  body: JSON.stringify({ username: admin.username, password: admin.password }),
});
if (!login.ok) throw Error('Local login failed');
const cookie = login.headers.get('set-cookie').split(';')[0];
const state = await (
  await fetch(base + '/api/crm', { headers: { cookie } })
).json();
const today = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
}).format(new Date());
const day = (n) => {
  const d = new Date(today + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const timestamp = (n, time = '10:00') => day(n) + 'T' + time + ':00+09:00';
const q = (v) =>
  v === null ? 'NULL' : "'" + String(v).replaceAll("'", "''") + "'";
const sql = [];
const insert = (table, columns, values) =>
  sql.push(
    `INSERT OR IGNORE INTO ${table} (${columns.join(',')}) VALUES (${values.map(q).join(',')});`,
  );
for (const b of state.brands.filter((b) => ['a', 'b', 'c'].includes(b.id))) {
  const ls = state.leads
    .filter((l) => l.brandId === b.id && l.ownerId)
    .sort((a, b) => a.id - b.id);
  const cases = [
    ['예정', 0, '오늘 창업 상담'],
    ['완료', -1, '미팅 완료 · 자료 전달'],
    ['취소', -2, '고객 사정으로 취소'],
    ['불참', -1, '고객 불참 · 재연락 필요'],
    ['예정', 1, '일정 변경 · 고객 요청'],
    ['예정', 3, '담당자 인수인계 미팅'],
  ];
  cases.forEach(([status, n, title], i) => {
    const l = ls[i % ls.length],
      id = `scenario-meeting-${b.id}-${i}`,
      start = String(10 + i).padStart(2, '0') + ':00',
      end = String(11 + i).padStart(2, '0') + ':00',
      author = state.members.find((m) => m.id === l.ownerId).name;
    const history = [
      { at: timestamp(-4), author, text: '임시 사례 · 미팅 등록' },
    ];
    if (i === 4)
      history.push({
        at: timestamp(-1),
        author,
        text: `${day(0)} 14:00 → ${day(1)} 14:00 · 고객 요청으로 하루 연기`,
      });
    if (i === 5) {
      const previous = state.members.find(
        (m) => m.id !== l.ownerId && m.brands.includes(b.id),
      );
      history.push({
        at: timestamp(-1),
        author: '운영 관리자',
        text: `담당자 변경: ${previous.name} → ${author} · 재연락과 예정 미팅 함께 인수인계`,
      });
    }
    if (status !== '예정')
      history.push({
        at: timestamp(n, start),
        author,
        text: `결과: ${status} · ${title}`,
      });
    const event = {
      id,
      leadId: l.id,
      ownerId: l.ownerId,
      date: day(n),
      start,
      end,
      place: b.name + ' 본사 상담실',
      title: '[예시] ' + title,
      status,
      history,
      ...(status === '완료' ? { completedAt: timestamp(n, end) } : {}),
    };
    insert(
      'meetings',
      ['id', 'lead_id', 'data'],
      [id, l.id, JSON.stringify(event)],
    );
    if (status === '예정')
      sql.push(
        `UPDATE leads SET status='미팅 예정' WHERE id=${l.id} AND status NOT IN ('계약 완료','종료');`,
      );
  });
  // Pending, overdue and completed callbacks are distinct from meeting dates.
  ls.slice(0, 4).forEach((l, i) => {
    const id = `scenario-call-${b.id}-${i}`,
      dueAt =
        day(i === 1 ? -1 : i === 2 ? 2 : 0) +
        'T' +
        ['16:30', '10:00', '11:00', '09:00'][i],
      status = i === 3 ? '완료' : '예정';
    if (status === '예정')
      sql.push(
        `UPDATE callbacks SET status='변경',data=json_set(data,'$.status','변경','$.completedAt',${q(timestamp(0))}) WHERE lead_id=${l.id} AND status='예정' AND NOT EXISTS(SELECT 1 FROM callbacks WHERE id=${q(id)});`,
      );
    const task = {
      id,
      leadId: l.id,
      ownerId: l.ownerId,
      dueAt,
      status,
      createdAt: timestamp(-3),
      ...(status === '완료' ? { completedAt: timestamp(0, '09:20') } : {}),
    };
    insert(
      'callbacks',
      ['id', 'lead_id', 'owner_id', 'due_at', 'status', 'data'],
      [id, l.id, l.ownerId, dueAt, status, JSON.stringify(task)],
    );
  });
}
for (const member of state.members) {
  const l = state.leads.find((l) => l.ownerId === member.id);
  if (!l) continue;
  const account = accounts.find((a) => a.memberId === member.id),
    id = 'scenario-note-' + member.id;
  const note = {
    id,
    leadId: l.id,
    scope: 'shared',
    createdAt: timestamp(0, '09:20'),
    author: member.name,
    actorId: account.id,
    ownerId: member.id,
    kind: 'consultation',
    outcome: '통화 완료',
    text: '[임시 상담 사례] 창업 희망지역과 예산을 확인했습니다. 자료를 검토한 뒤 다음 연락에서 질문을 정리하기로 했습니다.',
  };
  insert(
    'notes',
    ['id', 'lead_id', 'scope', 'created_at', 'data'],
    [id, l.id, 'shared', note.createdAt, JSON.stringify(note)],
  );
  const aid = 'scenario-assignment-' + member.id,
    activity = {
      id: aid,
      leadId: l.id,
      ownerId: member.id,
      actorId: 'admin',
      author: '운영 관리자',
      kind: 'assign',
      text: `[임시 배정 사례] ${member.name}에게 고객 배정`,
      createdAt: timestamp(-1, '15:00'),
    };
  insert(
    'activities',
    ['id', 'lead_id', 'created_at', 'data'],
    [aid, l.id, activity.createdAt, JSON.stringify(activity)],
  );
  const fid = 'scenario-first-attempt-' + member.id,
    failed = {
      ...note,
      id: fid,
      createdAt: timestamp(-1, '15:20'),
      outcome: '부재',
      text: '[임시 상담 사례] 첫 연락 부재. 다음 날 다시 연락하기로 예약.',
    };
  insert(
    'notes',
    ['id', 'lead_id', 'scope', 'created_at', 'data'],
    [fid, l.id, 'shared', failed.createdAt, JSON.stringify(failed)],
  );
}
const request = {
  id: 'scenario-hq-request',
  leadId: 1,
  scope: 'shared',
  createdAt: timestamp(0),
  author: '하루포케 본사',
  actorId: 'hq.haru',
  kind: 'request',
  text: '[임시 본사 요청] 고객이 관심 있는 상권과 미팅 가능 일정을 확인해 주세요.',
};
insert(
  'notes',
  ['id', 'lead_id', 'scope', 'created_at', 'data'],
  [request.id, 1, 'shared', request.createdAt, JSON.stringify(request)],
);
const file = `.local/${target}-scenarios.sql`;
writeFileSync(file, sql.join('\n'));
execFileSync(
  'node',
  [
    'node_modules/wrangler/bin/wrangler.js',
    'd1',
    'execute',
    'DB',
    '--config',
    `wrangler.${target}.json`,
    '--local',
    '--persist-to',
    `.local/${target}`,
    '--file',
    file,
  ],
  { stdio: 'inherit' },
);
console.log('Calendar examples seeded for ' + today);
