import { getState, mutate, HttpError } from '@/db/service';
export const dynamic = 'force-dynamic';
const failure = (e: unknown) =>
  Response.json(
    {
      ...(e instanceof HttpError ? e.details : {}),
      error:
        e instanceof HttpError
          ? e.message
          : '저장소에 연결하지 못했습니다. 개발 DB 초기화 상태를 확인해 주세요.',
    },
    { status: e instanceof HttpError ? e.status : 500 },
  );
export async function GET(req: Request) {
  try {
    return Response.json(await getState(req), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    if (!req.headers.get('content-type')?.includes('application/json'))
      throw new HttpError(415, 'JSON 요청이 필요합니다.');
    const raw = await req.text();
    if (raw.length > 20000)
      throw new HttpError(413, '입력 내용이 너무 깁니다.');
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, '잘못된 요청입니다.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new HttpError(400, '잘못된 요청입니다.');
    return Response.json(await mutate(req, body));
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    return failure(e);
  }
}
