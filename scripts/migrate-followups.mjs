import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const target=process.argv[2];if(!['development','test'].includes(target))throw Error('Local environments only');
const sql=`INSERT OR IGNORE INTO callbacks (id,lead_id,owner_id,due_at,status,data)
SELECT 'legacy-'||id,id,owner_id,json_extract(data,'$.nextAt')||'T10:00','예정',json_object('id','legacy-'||id,'leadId',id,'ownerId',owner_id,'dueAt',json_extract(data,'$.nextAt')||'T10:00','status','예정','createdAt',json_extract(data,'$.createdAt')) FROM leads WHERE length(json_extract(data,'$.nextAt'))=10 AND owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM callbacks WHERE callbacks.lead_id=leads.id);`;
const path=`.local/${target}-followup-migration.sql`;writeFileSync(path,sql);
execFileSync('node',['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--config',`wrangler.${target}.json`,'--local','--persist-to',`.local/${target}`,'--file',path],{stdio:'inherit'});
