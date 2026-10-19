import { env } from 'cloudflare:workers';
import { db, digest, HttpError } from './auth';
import { DINGDING_SHEET, prepareSheetRows } from '@/lib/sheet-intake';
import { normalizePhone } from '@/lib/lead-fields';
import type { Brand, Lead, Inquiry } from '@/lib/types';

export async function sheetPreview(fixture?: string) {
  const brands = await db().prepare('SELECT id,data FROM brands').all<{ id: string; data: string }>();
  const brand = brands.results.find(r => { const b: Brand = JSON.parse(r.data); return b.name === '딩딩파파' && b.active; });
  if (!brand) throw new HttpError(409, '운영 중인 딩딩파파 브랜드를 먼저 등록해 주세요.');
  if ((JSON.parse(brand.data) as Brand).sheetIntakeEnabled === false) {
    return { enabled: false, brandId: brand.id, brandName: '딩딩파파', spreadsheetId: DINGDING_SHEET, gid: '0',
      checkedAt: new Date().toISOString(), headers: [], rows: [], invalid: [], rowCount: 0,
      missingAutoPhone: false, platformConfigured: false };
  }
  let csv = fixture;
  if (csv !== undefined && env.CRM_ENV !== 'test') throw new HttpError(403, '실제 시트만 수집할 수 있습니다.');
  if (csv === undefined) {
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${DINGDING_SHEET}/export?format=csv&gid=0`, { signal: AbortSignal.timeout(20000), cache: 'no-store' });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/csv')) throw new HttpError(502, '시트를 읽을 수 없습니다. 접근 권한과 공유 설정을 확인해 주세요.');
    if (Number(response.headers.get('content-length')) > 5 * 1024 * 1024) throw new HttpError(413, '시트 크기가 너무 큽니다.');
    csv = await response.text();
    if (csv.length > 5 * 1024 * 1024) throw new HttpError(413, '시트 크기가 너무 큽니다.');
  }
  let prepared;
  try { prepared = prepareSheetRows(csv); }
  catch (e) { throw new HttpError(400, e instanceof Error ? e.message : '시트 형식을 확인해 주세요.'); }
  const imported = await db().prepare("SELECT id,data FROM inquiries WHERE json_extract(data,'$.sheetSource.spreadsheetId')=?").bind(DINGDING_SHEET).all<{ id: string; data: string }>();
  const existing = new Map(imported.results.map(r => [r.id, JSON.parse(r.data) as Inquiry]));
  const rows = await Promise.all(prepared.valid.map(async row => {
    const rowKey = await digest(JSON.stringify([DINGDING_SHEET, '0', brand.id, row.eventKey]));
    const id = 'sheet-' + rowKey;
    const old = existing.get(id);
    const status = !old ? '미수집' : JSON.stringify(old.raw) === JSON.stringify(row.raw) ? '수집 완료' : '원본 변경 · 확인 필요';
    return { ...row, id, rowKey, status, importedAt: old?.importedAt || '', leadId: old?.leadId };
  }));
  return { enabled: true, brandId: brand.id, brandName: '딩딩파파', spreadsheetId: DINGDING_SHEET, gid: '0',
    checkedAt: new Date().toISOString(), headers: prepared.headers, rows, invalid: prepared.invalid,
    rowCount: prepared.rowCount, missingAutoPhone: prepared.missingAutoPhone, platformConfigured: prepared.platformConfigured };
}

export async function syncDingdingSheet(fixture?: string) {
  const preview = await sheetPreview(fixture);
  if (!preview.enabled) throw new HttpError(409, '딩딩파파는 임시 데이터 모드입니다. 실제 시트 수집이 중지되어 있습니다.');
  const now = new Date().toISOString();
  let addedLeads = 0, addedInquiries = 0, skipped = 0;
  const changedRows: number[] = [];
  const leads = await db().prepare('SELECT id,data FROM leads WHERE brand_id=?').bind(preview.brandId).all<{ id: number; data: string }>();
  const existing = new Map(leads.results.map(r => [normalizePhone((JSON.parse(r.data) as Lead).phone), r.id]));
  for (const row of preview.rows) {
    if (row.status === '수집 완료') { skipped++; continue; }
    if (row.status === '원본 변경 · 확인 필요') { changedRows.push(row.rowNumber); continue; }
    const lead: Lead = { id: 0, brandId: preview.brandId, ownerId: null, status: '신규',
      name: row.name, phone: row.phone, email: '', region: row.region, startupType: row.startupType,
      budget: '미기재', createdAt: now, nextAt: '' };
    const inquiry: Inquiry = { id: row.id, leadId: 0, source: row.platform + ' · 구글시트',
      campaign: row.campaign ? `캠페인 ID ${row.campaign}` : '구글시트 접수',
      receivedAt: row.sourceReceivedAt, sourceReceivedAt: row.sourceReceivedAt, importedAt: now,
      metaAutoPhone: row.metaAutoPhone || undefined,
      sheetSource: { spreadsheetId: DINGDING_SHEET, gid: '0', rowKey: row.rowKey },
      raw: row.raw, summary: `${row.region} 창업 문의. 원본 문의와 연락처를 확인해 주세요.`,
      reviewed: false, reviewer: null, reviewedAt: null, aiSample: false };
    const prior = existing.get(row.phone);
    const inserts = [];
    if (!prior) inserts.push(db().prepare(`INSERT INTO leads(brand_id,owner_id,status,data)
      SELECT ?,NULL,'신규',? WHERE NOT EXISTS(SELECT 1 FROM inquiries WHERE id=?) ON CONFLICT DO NOTHING RETURNING id`)
      .bind(preview.brandId, JSON.stringify(lead), row.id));
    // One atomic batch; source ID is a unique replay key. Existing ownership/profile/history stay intact.
    const lookup = prior ? 'SELECT id FROM leads WHERE id=? AND brand_id=?' : "SELECT id FROM leads WHERE brand_id=? AND replace(replace(replace(replace(replace(json_extract(data,'$.phone'),'-',''),' ',''),'(',''),')',''),'.','')=?";
    const args = prior ? [prior, preview.brandId] : [preview.brandId, row.phone];
    inserts.push(db().prepare(`INSERT INTO inquiries(id,lead_id,data)
      SELECT ?,id,json_set(?,'$.leadId',id) FROM (${lookup}) WHERE 1=1 ON CONFLICT(id) DO NOTHING RETURNING id`).bind(row.id, JSON.stringify(inquiry), ...args));
    const results = await db().batch(inserts);
    // D1 meta.changes includes clock-trigger updates; RETURNING counts only actual inserts.
    if (!prior) addedLeads += results[0].results.length;
    const count = results[results.length - 1].results.length;
    addedInquiries += count;
    if (!count) skipped++;
    if (!prior) {
      const created = await db().prepare('SELECT lead_id FROM inquiries WHERE id=?').bind(row.id).first<{ lead_id: number }>();
      if (!created) throw new HttpError(409, '고객 수집을 확인하지 못했습니다. 다음 수집에서 다시 확인합니다.');
      existing.set(row.phone, created.lead_id);
    }
  }
  return { ok: true, brandName: preview.brandName, checkedAt: now, sourceRows: preview.rowCount,
    addedLeads, addedInquiries, skipped, changedRows, invalidRows: preview.invalid,
    missingAutoPhone: preview.missingAutoPhone, platformConfigured: preview.platformConfigured };
}
