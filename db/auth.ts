import { isEmployee } from '@/lib/permissions';
import { normalizeUsername, validUsername } from '@/lib/account-policy';
const stringValue = (v: unknown) => (typeof v === 'string' ? v : '');
import { env } from 'cloudflare:workers';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
export const db = () => env.DB;
export function guard(req: Request, mutate = false) {
  if (!['development', 'test'].includes(String(env.CRM_ENV)))
    throw new HttpError(503, '운영 환경은 아직 활성화하지 않았습니다.');
  const u = new URL(req.url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname))
    throw new HttpError(403, '로컬 전용 환경입니다.');
  if (mutate && req.headers.get('origin') !== u.origin)
    throw new HttpError(403, '요청 출처가 일치하지 않습니다.');
}
export const sessionCookieName = () => `crm_session_${env.CRM_ENV}`;
const hex = (v: ArrayBuffer) =>
  Array.from(new Uint8Array(v), (n) => n.toString(16).padStart(2, '0')).join(
    '',
  );
export const digest = async (v: string) =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)));
export async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode(salt),
        iterations: 100000,
        hash: 'SHA-256',
      },
      key,
      256,
    ),
  );
}
export type Account = {
  id: string;
  username: string;
  password_hash: string;
  salt: string;
  role: string;
  name: string;
  member_id: string | null;
  brand_ids: string;
  active: number;
};
export const publicAccount = (a: Account) => ({
  id: a.id,
  username: a.username,
  role: a.role,
  name: a.name,
  memberId: a.member_id,
  brandIds: JSON.parse(a.brand_ids) as string[],
  active: !!a.active,
});
// Customer employee ownership is anchored to an administrator account, never company-name text.
export async function companyParent(a: Account): Promise<Account | null> {
  if (a.role === 'client_admin') return a.active ? a : null;
  if (a.role !== 'client_staff' || !a.member_id) return null;
  const row = await db()
    .prepare('SELECT data FROM members WHERE id=?')
    .bind(a.member_id)
    .first<{ data: string }>();
  const member = row ? JSON.parse(row.data) : null;
  if (!member?.active || !member.tenantId) return null;
  return db()
    .prepare(
      "SELECT * FROM accounts WHERE id=? AND role='client_admin' AND active=1",
    )
    .bind(member.tenantId)
    .first<Account>();
}
async function accountEnabled(a: Account) {
  if (
    !['admin', 'staff', 'client', 'client_admin', 'client_staff'].includes(
      a.role,
    )
  )
    return false;
  if (!isEmployee(a.role)) return true;
  const row = await db()
    .prepare('SELECT data FROM members WHERE id=?')
    .bind(a.member_id)
    .first<{ data: string }>();
  const member = row ? JSON.parse(row.data) : null;
  if (!member?.active) return false;
  return a.role === 'staff' ? !member.tenantId : !!(await companyParent(a));
}
const tokenOf = (req: Request) =>
  req.headers
    .get('cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(sessionCookieName() + '='))
    ?.slice(sessionCookieName().length + 1) || '';
export async function authenticate(req: Request) {
  guard(req);
  const token = tokenOf(req);
  if (!token) throw new HttpError(401, '로그인이 필요합니다.');
  const a = await db()
    .prepare(
      'SELECT a.* FROM accounts a JOIN sessions s ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1',
    )
    .bind(await digest(token), Date.now())
    .first<Account>();
  if (!a) throw new HttpError(401, '다시 로그인해 주세요.');
  if (!(await accountEnabled(a)))
    throw new HttpError(401, '비활성화되었거나 권한이 변경된 계정입니다.');
  return a;
}
export async function login(req: Request, b: Record<string, unknown>) {
  guard(req, true);
  const username = normalizeUsername(stringValue(b.username || '')),
    password = stringValue(b.password || '');
  if (!validUsername(username) || password.length > 200)
    throw new HttpError(400, '아이디와 비밀번호를 확인해 주세요.');
  const now = Date.now(),
    attempt = await db()
      .prepare('SELECT * FROM login_attempts WHERE username=?')
      .bind(username)
      .first<{ failures: number; reset_at: number }>();
  if (attempt && attempt.reset_at > now && attempt.failures >= 8)
    throw new HttpError(
      429,
      '로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.',
    );
  const a = await db()
    .prepare('SELECT * FROM accounts WHERE username=?')
    .bind(username)
    .first<Account>();
  const candidate = await hashPassword(
    password,
    a?.salt || 'missing-account-timing-salt',
  );
  let different = 0;
  const expected = a?.password_hash || '0'.repeat(64);
  for (let i = 0; i < 64; i++)
    different |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  let valid = !!a && a.active === 1 && !different;
  if (valid) valid = await accountEnabled(a!);
  if (!valid) {
    await db()
      .prepare(
        'INSERT INTO login_attempts VALUES (?,?,?) ON CONFLICT(username) DO UPDATE SET failures=CASE WHEN reset_at>? THEN failures+1 ELSE 1 END,reset_at=CASE WHEN reset_at>? THEN reset_at ELSE ? END',
      )
      .bind(username, 1, now + 900000, now, now, now + 900000)
      .run();
    throw new HttpError(401, '아이디 또는 비밀번호가 올바르지 않습니다.');
  }
  const token = crypto.randomUUID() + crypto.randomUUID();
  await db().batch([
    db().prepare('DELETE FROM login_attempts WHERE username=?').bind(username),
    db().prepare('DELETE FROM sessions WHERE expires_at<?').bind(now),
    db()
      .prepare('INSERT INTO sessions VALUES (?,?,?)')
      .bind(await digest(token), a!.id, now + 8 * 3600000),
  ]);
  return token;
}
export async function logout(req: Request) {
  guard(req, true);
  await db()
    .prepare('DELETE FROM sessions WHERE token_hash=?')
    .bind(await digest(tokenOf(req)))
    .run();
}
export function cookie(token: string) {
  return `${sessionCookieName()}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? 28800 : 0}`;
}
