const stringValue=(v:unknown)=>typeof v==='string'?v:'';
import { env } from 'cloudflare:workers';
import { getState, db, guard, HttpError } from '@/db/service';
import type { Doc } from '@/lib/types';
export const dynamic = 'force-dynamic';
const failure = (e: unknown) =>
  Response.json(
    {
      error: e instanceof HttpError ? e.message : '파일을 처리하지 못했습니다.',
    },
    { status: e instanceof HttpError ? e.status : 500 },
  );
export async function GET(req: Request) {
  try {
    const state = await getState(req),
      u = new URL(req.url),
      doc = state.docs.find((d) => d.id === u.searchParams.get('id'));
    if (!doc) throw new HttpError(404, '자료를 찾을 수 없습니다.');
    const version = u.searchParams.get('version'),
      file = version ? doc.versions?.find((v) => v.version === version) : doc;
    if (!file?.fileKey)
      throw new HttpError(404, '아직 파일이 등록되지 않은 예시 자료입니다.');
    const object = await env.FILES.get(file.fileKey);
    if (!object) throw new HttpError(404, '파일을 찾을 수 없습니다.');
    return new Response(object.body, {
      headers: {
        'Content-Type': file.mime || 'application/octet-stream',
        'Content-Disposition': `${u.searchParams.get('download') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.filename || 'document')}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    guard(req, true);
    const state = await getState(req);
    if (state.role !== 'admin')
      throw new HttpError(403, '관리자만 자료를 배포할 수 있습니다.');
    if (Number(req.headers.get('content-length') || 0) > 11 * 1024 * 1024)
      throw new HttpError(413, '10MB 이하 파일을 선택해 주세요.');
    const f = await req.formData(),
      file = f.get('file');
    if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024)
      throw new HttpError(
        400,
        '10MB 이하 PDF·PNG·JPG·WEBP 파일을 선택해 주세요.',
      );
    const bytes = new Uint8Array(await file.arrayBuffer()),
      ascii = (a: number, b: number) =>
        new TextDecoder().decode(bytes.slice(a, b));
    const mime =
      ascii(0, 5) === '%PDF-'
        ? 'application/pdf'
        : bytes[0] === 137 && ascii(1, 4) === 'PNG'
          ? 'image/png'
          : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            ? 'image/jpeg'
            : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
              ? 'image/webp'
              : '';
    if (!mime) throw new HttpError(400, '지원하는 PDF·이미지 파일이 아닙니다.');
    const old = state.docs.find((d) => d.id === f.get('id')),
      brandId = old?.brandId || stringValue(f.get('brandId'));
    if (!state.brands.some((b) => b.id === brandId && b.active))
      throw new HttpError(400, '브랜드를 확인해 주세요.');
    const title = stringValue(f.get('title') || '').trim(),
      version = stringValue(f.get('version') || '').trim(),
      change = stringValue(f.get('change') || '').trim();
    if (
      !title ||
      title.length > 100 ||
      !version ||
      version.length > 30 ||
      !change ||
      change.length > 1000
    )
      throw new HttpError(400, '제목·버전·변경 내용을 확인해 주세요.');
    if (
      old &&
      (old.version === version ||
        old.versions?.some((v) => v.version === version))
    )
      throw new HttpError(409, '새로운 버전명을 입력해 주세요.');
    const id = old?.id || crypto.randomUUID(),
      key = `${brandId}/${id}/${crypto.randomUUID()}`,
      date = new Date().toISOString().slice(0, 10);
    await env.FILES.put(key, bytes, { httpMetadata: { contentType: mime } });
    const previous = old?.fileKey
      ? [
          {
            fileKey: old.fileKey,
            filename: old.filename!,
            mime: old.mime!,
            version: old.version,
            date: old.date,
            change: old.change,
          },
          ...(old.versions || []),
        ]
      : old?.versions || [];
    const doc: Doc = {
      id,
      brandId,
      title,
      format: mime === 'application/pdf' ? 'PDF' : '이미지',
      version,
      date,
      change,
      pinned: old?.pinned || false,
      published: true,
      readBy: [],
      fileKey: key,
      filename: file.name,
      mime,
      versions: previous,
    };
    try {
      await db()
        .prepare(
          'INSERT INTO documents (id,brand_id,data) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        )
        .bind(id, brandId, JSON.stringify(doc))
        .run();
    } catch (e) {
      await env.FILES.delete(key);
      throw e;
    }
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
