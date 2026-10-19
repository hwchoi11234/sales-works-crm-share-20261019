import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
export const brands = sqliteTable('brands', {
  id: text('id').primaryKey(),
  data: text('data').notNull(),
});
export const members = sqliteTable('members', {
  id: text('id').primaryKey(),
  data: text('data').notNull(),
});
export const leads = sqliteTable(
  'leads',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id),
    ownerId: text('owner_id').references(() => members.id),
    status: text('status').notNull(),
    updatedAt: text('updated_at'),
    data: text('data').notNull(),
  },
  (t) => [
    index('leads_brand_owner').on(t.brandId, t.ownerId),
    uniqueIndex('leads_brand_phone').on(
      t.brandId,
      sql`replace(replace(replace(replace(replace(json_extract(${t.data}, '$.phone'), '-', ''), ' ', ''), '(', ''), ')', ''), '.', '')`,
    ),
  ],
);
export const inquiries = sqliteTable(
  'inquiries',
  {
    id: text('id').primaryKey(),
    leadId: integer('lead_id')
      .notNull()
      .references(() => leads.id),
    data: text('data').notNull(),
  },
  (t) => [index('inquiries_lead').on(t.leadId)],
);
export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    leadId: integer('lead_id')
      .notNull()
      .references(() => leads.id),
    scope: text('scope').notNull(),
    createdAt: text('created_at').notNull(),
    data: text('data').notNull(),
  },
  (t) => [index('notes_lead_time').on(t.leadId, t.createdAt)],
);
export const meetings = sqliteTable(
  'meetings',
  {
    id: text('id').primaryKey(),
    leadId: integer('lead_id')
      .notNull()
      .references(() => leads.id),
    data: text('data').notNull(),
  },
  (t) => [index('meetings_lead').on(t.leadId)],
);
export const documents = sqliteTable(
  'documents',
  {
    id: text('id').primaryKey(),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id),
    data: text('data').notNull(),
  },
  (t) => [index('documents_brand').on(t.brandId)],
);
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  salt: text('salt').notNull(),
  role: text('role').notNull(),
  name: text('name').notNull(),
  memberId: text('member_id'),
  brandIds: text('brand_ids').notNull(),
  active: integer('active').notNull().default(1),
});
export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  expiresAt: integer('expires_at').notNull(),
});
export const loginAttempts = sqliteTable('login_attempts', {
  username: text('username').primaryKey(),
  failures: integer('failures').notNull(),
  resetAt: integer('reset_at').notNull(),
});
export const callbacks = sqliteTable(
  'callbacks',
  {
    id: text('id').primaryKey(),
    leadId: integer('lead_id')
      .notNull()
      .references(() => leads.id),
    ownerId: text('owner_id').references(() => members.id),
    dueAt: text('due_at').notNull(),
    status: text('status').notNull(),
    data: text('data').notNull(),
  },
  (t) => [
    index('callbacks_owner_due').on(t.ownerId, t.status, t.dueAt),
    index('callbacks_lead').on(t.leadId),
  ],
);
export const activities = sqliteTable(
  'activities',
  {
    id: text('id').primaryKey(),
    leadId: integer('lead_id')
      .notNull()
      .references(() => leads.id),
    createdAt: text('created_at').notNull(),
    data: text('data').notNull(),
  },
  (t) => [index('activities_lead_time').on(t.leadId, t.createdAt)],
);
export const acknowledgments = sqliteTable('acknowledgments', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  targetId: text('target_id').notNull(),
});

export const leadStatuses = sqliteTable('lead_statuses', {
  name: text('name').primaryKey(),
  active: integer('active').notNull().default(1),
});

// Short-lived rows validate staff ownership inside the same write transaction.
export const leadWriteChecks = sqliteTable('lead_write_checks', {
  id: text('id').primaryKey(),
  leadId: integer('lead_id')
    .notNull()
    .references(() => leads.id),
  ownerId: text('owner_id').notNull(),
});
