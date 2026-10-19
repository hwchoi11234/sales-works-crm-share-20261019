import { authenticate, guard, HttpError } from '@/db/auth';
import { sheetPreview, syncDingdingSheet } from '@/db/sheet-intake';

async function authorize(req: Request, write = false) {
  guard(req, write);
  if ((await authenticate(req)).role !== 'admin') throw new HttpError(403, '최고관리자만 수집 정보를 관리할 수 있습니다.');
}
const failure = (e: unknown) => Response.json({ error: e instanceof HttpError ? e.message : '시트 수집을 완료하지 못했습니다. 잠시 후 다시 확인해 주세요.' }, { status: e instanceof HttpError ? e.status : 500, headers: { 'Cache-Control': 'no-store' } });
export async function GET(req: Request) {
  try { await authorize(req); return Response.json(await sheetPreview(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  try {
    await authorize(req, true);
    const raw = await req.text();
    if (raw.length > 200000) throw new HttpError(413, '요청 크기가 너무 큽니다.');
    const body = raw ? JSON.parse(raw) : {};
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => k !== 'fixture')) throw new HttpError(400, '잘못된 수집 요청입니다.');
    if (body.fixture !== undefined && typeof body.fixture !== 'string') throw new HttpError(400, '잘못된 시트 데이터입니다.');
    return Response.json(await syncDingdingSheet(body.fixture), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return failure(e); }
}
