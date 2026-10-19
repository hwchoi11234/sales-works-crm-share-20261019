export type Brand = {
  sheetIntakeEnabled?: boolean;
  services?: ('일반 광고대행' | '영업대행')[];
  id: string;
  name: string;
  company: string;
  active: boolean;
};
export type Member = {
  /** Immutable owning customer administrator account, absent for internal staff. */
  tenantId?: string;
  id: string;
  name: string;
  brands: string[];
  active: boolean;
};
export type RecontactLead = Pick<
  Lead,
  'id' | 'brandId' | 'ownerId' | 'name' | 'status' | 'region' | 'startupType'
> & { updatedAt: string; availableAt: string; idleDays: number };
export type Lead = {
  qualification?: import('./lead-score').Qualification;
  updatedAt?: string;
  id: number;
  brandId: string;
  ownerId: string | null;
  status: string;
  name: string;
  phone: string;
  email: string;
  region: string;
  startupType: string;
  budget: string;
  createdAt: string;
  nextAt: string;
};
export type Inquiry = {
  /** Original source submission time; never substitute the CRM import time. */
  sourceReceivedAt?: string;
  /** Time this individual source submission was imported into the CRM. */
  importedAt?: string;
  sheetSource?: { spreadsheetId: string; gid: string; rowKey: string };
  metaAutoPhone?: string;
  id: string;
  leadId: number;
  source: string;
  campaign: string;
  receivedAt: string;
  raw: Record<string, string>;
  summary: string;
  reviewed: boolean;
  reviewer: string | null;
  reviewedAt: string | null;
  aiSample: boolean;
};
export type Note = {
  id: string;
  leadId: number;
  text: string;
  scope: 'shared' | 'internal';
  author: string;
  createdAt: string;
  kind: 'consultation' | 'request';
  outcome?: string;
  actorId?: string;
  ownerId?: string | null;
};
export type Meeting = {
  id: string;
  leadId: number;
  ownerId: string;
  date: string;
  start: string;
  end: string;
  history?: { at: string; author: string; text: string }[];
  completedAt?: string;
  place: string;
  title: string;
  status: string;
};
export type Doc = {
  id: string;
  brandId: string;
  title: string;
  format: string;
  version: string;
  date: string;
  change: string;
  pinned: boolean;
  published: boolean;
  readBy: string[];
  fileKey?: string;
  filename?: string;
  mime?: string;
  versions?: {
    fileKey: string;
    filename: string;
    mime: string;
    version: string;
    date: string;
    change: string;
  }[];
};
export type StatusOption = { name: string; active: boolean; builtIn: boolean };
export type State = {
  recontactLeads: RecontactLead[];
  statusOptions: StatusOption[];
  user: User;
  accounts: User[];
  callbacks: Callback[];
  activities: Activity[];
  acknowledged: string[];
  role: string;
  actor: string;
  environment: string;
  brands: Brand[];
  members: Member[];
  leads: Lead[];
  inquiries: Inquiry[];
  notes: Note[];
  meetings: Meeting[];
  docs: Doc[];
};
export const statuses = [
  '신규',
  '상담 중',
  '미팅 예정',
  '계약 검토',
  '계약 완료',
  '보류',
  '종료',
];
export type Callback = {
  id: string;
  leadId: number;
  ownerId: string | null;
  dueAt: string;
  status: string;
  createdAt: string;
  completedAt?: string;
};
export type Activity = {
  id: string;
  leadId: number;
  author: string;
  actorId: string;
  ownerId: string | null;
  createdAt: string;
  kind: string;
  text: string;
  status?: string;
};
export type User = {
  id: string;
  username: string;
  name: string;
  role: string;
  memberId: string | null;
  brandIds: string[];
  active: boolean;
};
