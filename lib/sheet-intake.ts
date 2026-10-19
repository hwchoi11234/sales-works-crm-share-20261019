import { normalizePhone, normalizeStartupType } from './lead-fields';

export const DINGDING_SHEET = 'DEMO_SHEET_NOT_CONNECTED';
const aliases = {
  date: ['접수일자', '접수일시', '응답 일시', 'created_time', '접수일'],
  name: ['이름', '성함', '고객명', 'full_name'],
  phone: ['연락처', '전화번호', '고객연락처'],
  autoPhone: ['자동입력 연락처', '자동입력 연락처(메타 인증 시 활용한 자동입력 연락처)', '메타 자동입력 연락처', 'phone_number'],
  platform: ['플랫폼', 'platform'],
  region: ['창업희망지역', '창업 희망지역', '창업 희망 지역을 입력해 주세요.', '창업 희망 지역'],
  startupType: ['창업 형태', '창업형태'],
  campaign: ['캠페인 ID', 'campaign_id'],
  adset: ['광고그룹 ID', 'adset_id'],
  ad: ['소재 ID', 'ad_id'],
  leadId: ['리드 ID', 'lead_id', 'id'],
} as const;
const key = (s: string) => s.normalize('NFKC').replace(/\s/g, '').toLowerCase();

/** RFC4180-style quoted CSV, including CRLF, commas and multiline cells. */
export function parseSheetCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const input = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('시트 CSV의 따옴표가 닫히지 않았습니다.');
  if (row.length || cell) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim()));
}
export function sheetTimestamp(s: string): string {
  const value = s.trim();
  const m = value.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?(Z|[+-]\d{2}:\d{2})?$/);
  if (!m) throw new Error('원본 접수일자 형식을 확인해 주세요.');
  const [, y, mo, d, h = '00', mi = '00', sec = '00', ms = '000', zone = '+09:00'] = m;
  const year = Number(y), month = Number(mo), day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()
    || Number(h) > 23 || Number(mi) > 59 || Number(sec) > 59) throw new Error('원본 접수일자가 유효하지 않습니다.');
  const normalized = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}:${sec}.${ms.padEnd(3, '0')}${zone}`;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) throw new Error('원본 접수일자가 유효하지 않습니다.');
  return date.toISOString();
}
export type SheetRow = {
  rowNumber: number; raw: Record<string, string>; name: string; phone: string;
  metaAutoPhone: string; platform: string; region: string; startupType: string;
  sourceReceivedAt: string; campaign: string; eventKey: string;
};
export function prepareSheetRows(csv: string) {
  const matrix = parseSheetCsv(csv), headers = matrix[0] || [];
  if (headers.length > 100 || matrix.length > 10001) throw new Error('시트 크기가 수집 한도를 초과했습니다.');
  if (new Set(headers.map(key)).size !== headers.length) throw new Error('중복된 시트 열 이름을 정리해 주세요.');
  const indices = Object.fromEntries(Object.entries(aliases).map(([field, list]) => {
    const matches = headers.map((h, i) => list.some(a => key(a) === key(h)) ? i : -1).filter(i => i >= 0);
    if (matches.length > 1) throw new Error(`${field}에 대응하는 열이 여러 개 있습니다.`);
    return [field, matches[0] ?? -1];
  }));
  for (const field of ['date', 'name', 'phone', 'region']) if (indices[field] < 0) throw new Error(`${field} 필수 열을 찾을 수 없습니다.`);
  const valid: SheetRow[] = [], invalid: { rowNumber: number; reason: string }[] = [];
  matrix.slice(1).forEach((r, i) => {
    const rowNumber = i + 2;
    const value = (field: string) => indices[field] >= 0 ? (r[indices[field]] || '').trim() : '';
    try {
      if (r.length > headers.length) throw new Error('행의 열 수가 헤더와 다릅니다.');
      const name = value('name'), phone = normalizePhone(value('phone'));
      if (!name || name.length > 80) throw new Error('이름을 확인해 주세요.');
      if (!/^0\d{8,10}$/.test(phone)) throw new Error('고객 연락처를 확인해 주세요.');
      const sourceReceivedAt = sheetTimestamp(value('date'));
      const campaign = value('campaign');
      const raw = Object.fromEntries(headers.map((h, j) => [h, r[j] || '']));
      if (Object.values(raw).some(v => v.length > 10000)) throw new Error('입력 내용이 너무 깁니다.');
      valid.push({ rowNumber, raw, name, phone, sourceReceivedAt,
        metaAutoPhone: value('autoPhone'), platform: value('platform') || '메타',
        region: value('region') || '미기재', startupType: normalizeStartupType(value('startupType')),
        campaign,
        // Stable across sorting/row insertion; separate submissions by the same phone are kept.
        eventKey: value('leadId') ? `lead:${value('leadId')}` : JSON.stringify([sourceReceivedAt, phone, campaign, value('adset'), value('ad')]),
      });
    } catch (e) { invalid.push({ rowNumber, reason: e instanceof Error ? e.message : '행을 확인해 주세요.' }); }
  });
  return { headers, valid, invalid, rowCount: matrix.length - 1,
    missingAutoPhone: indices.autoPhone < 0, platformConfigured: indices.platform < 0 };
}
