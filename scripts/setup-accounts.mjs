import {randomBytes,pbkdf2Sync} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const target=process.argv[2];if(!['development','test'].includes(target))throw Error('Local environments only');
mkdirSync('.local',{recursive:true});
const destination=`.local/${target}-accounts.json`;
let accounts;
if(existsSync(destination))accounts=JSON.parse(readFileSync(destination,'utf8'));else{
 const demo=JSON.parse(readFileSync('lib/demo.json','utf8'));
 accounts=[{username:'admin',name:'운영 관리자',role:'admin',memberId:null,brandIds:[]},...demo.members.map((m,i)=>({username:['yoon','leehan','leebeom','parkbo','parkji','choi'][i],name:m.name,role:'staff',memberId:m.id,brandIds:m.brands})),...demo.brands.map((b,i)=>({username:['hq.haru','hq.enfant','hq.9900'][i],name:b.name+' 본사',role:'client',memberId:null,brandIds:[b.id]}))].map(a=>({...a,id:a.username,password:randomBytes(12).toString('base64url')+'!7',salt:randomBytes(16).toString('hex')}));
 writeFileSync(destination,JSON.stringify(accounts,null,2),{mode:0o600});
}
const q=v=>v===null?'NULL':"'"+String(v).replaceAll("'","''")+"'";
const sql=accounts.map(a=>`INSERT OR IGNORE INTO accounts (id,username,password_hash,salt,role,name,member_id,brand_ids,active) VALUES (${[a.id,a.username,pbkdf2Sync(a.password,a.salt,100000,32,'sha256').toString('hex'),a.salt,a.role,a.name,a.memberId,JSON.stringify(a.brandIds)].map(q).join(',')},1);`).join('\n');
const seed=`.local/${target}-account-seed.sql`;writeFileSync(seed,sql,{mode:0o600});
execFileSync('node',['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--config',`wrangler.${target}.json`,'--local','--persist-to',`.local/${target}`,'--file',seed],{stdio:'inherit'});
const md='# Sales Works 로컬 개발 계정\n\n로컬 전용 최초 발급 계정입니다. 앱에서 비밀번호를 바꾸면 이 문서의 초기 비밀번호는 사용할 수 없습니다. 운영 환경에서 재사용하지 않습니다.\n\n| 구분 | 이름 | 아이디 | 초기 비밀번호 |\n|---|---|---|---|\n'+accounts.map(a=>`| ${a.role} | ${a.name} | ${a.username} | ${a.password} |`).join('\n')+'\n';
writeFileSync(`.local/${target}-accounts.md`,md,{mode:0o600});
console.log('Local account setup complete. Credentials kept in ignored .local directory.');
