import { login, logout, cookie, HttpError } from '@/db/auth';
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (raw.length > 2000) throw new HttpError(413, '입력 내용이 너무 깁니다.');
    const b = JSON.parse(raw);
    if (b.action === 'logout') {
      await logout(req);
      return Response.json(
        { ok: true },
        { headers: { 'Set-Cookie': cookie(''), 'Cache-Control': 'no-store' } },
      );
    }
    const token = await login(req, b);
    return Response.json(
      { ok: true },
      { headers: { 'Set-Cookie': cookie(token), 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof HttpError ? e.message : '로그인할 수 없습니다.' },
      { status: e instanceof HttpError ? e.status : 400 },
    );
  }
}
