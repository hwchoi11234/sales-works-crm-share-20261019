import fs from 'node:fs';
const state = JSON.parse(fs.readFileSync('lib/demo.json', 'utf8'));
const quote = (v) =>
  v === null ? 'NULL' : "'" + String(v).replaceAll("'", "''") + "'";
const insert = (table, columns, values) =>
  `INSERT OR IGNORE INTO ${table} (${columns.join(',')}) VALUES (${values.map(quote).join(',')});`;
const sql = [];
for (const key of ['brands', 'members'])
  for (const x of state[key])
    sql.push(insert(key, ['id', 'data'], [x.id, JSON.stringify(x)]));
for (const x of state.leads)
  sql.push(
    insert(
      'leads',
      ['id', 'brand_id', 'owner_id', 'status', 'data'],
      [x.id, x.brandId, x.ownerId, x.status, JSON.stringify(x)],
    ),
  );
for (const key of ['inquiries', 'meetings'])
  for (const x of state[key])
    sql.push(
      insert(
        key,
        ['id', 'lead_id', 'data'],
        [x.id, x.leadId, JSON.stringify(x)],
      ),
    );
for (const x of state.notes)
  sql.push(
    insert(
      'notes',
      ['id', 'lead_id', 'scope', 'created_at', 'data'],
      [x.id, x.leadId, x.scope, x.createdAt, JSON.stringify(x)],
    ),
  );
for (const x of state.docs)
  sql.push(
    insert(
      'documents',
      ['id', 'brand_id', 'data'],
      [x.id, x.brandId, JSON.stringify(x)],
    ),
  );
fs.writeFileSync('db/seed.development.sql', sql.join('\n'));
