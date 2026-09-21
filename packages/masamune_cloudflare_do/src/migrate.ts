import { promises as fs } from 'node:fs';
import path from 'node:path';
import { revision, verifyRevisions, schemaDiff, canonical } from './lib/schema';
import type { DoRevision, SchemaManifest } from './lib/types';
interface Input { command:string;root:string;schemaPath:string;directory:string;approvedPath:string;database:string;environment:string;version?:string;apply?:boolean;endpoint?:string;userId?:string }
function within(root:string,file:string){const absolute=path.resolve(root,file);if(!absolute.startsWith(path.resolve(root)+path.sep))throw new Error('project内の相対パスが必要です。');return absolute;}
/** applyは配備用承認履歴を更新する。各DOの実適用は次のdeploy後に行う。 */
export async function runMigrate(input:Input):Promise<unknown>{
  if(!['dev','prod'].includes(input.environment)||!input.database||!['status','diff','generate','apply'].includes(input.command))throw new Error('対象DB・環境・操作を指定してください。');
  if((input.environment==='dev')!==input.database.startsWith('dev_'))throw new Error('DBと環境が一致しません。');
  const dir=within(input.root,input.directory), approved=within(input.root,input.approvedPath);
  const manifest=JSON.parse(await fs.readFile(within(input.root,input.schemaPath),'utf8')) as SchemaManifest;
  const readJson=async(file:string,fallback:unknown)=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return fallback;throw e;}};
  const names=await fs.readdir(dir).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  const history:DoRevision[]=[];for(const name of names.filter(n=>n.endsWith('.json')).sort())history.push(await readJson(path.join(dir,name),null));
  await verifyRevisions(history);
  if(history.some(r=>r.database!==input.database))throw new Error('別DBの履歴が混在しています。');
  const approvedAll:DoRevision[]=await readJson(approved,[]);await verifyRevisions(approvedAll);
  const published=approvedAll.filter(r=>r.database===input.database);
  if(published.some((r,i)=>canonical(r)!==canonical(history[i])))throw new Error('承認済み履歴とローカル履歴が一致しません。');
  const sql=schemaDiff(history.at(-1)?.after??null,manifest,input.database);
  if(input.command==='status'){
    let actual:unknown=null;
    if(input.endpoint||input.userId){
      if(!input.endpoint||!input.userId||!process.env.DO_SERVER_ACCESS_TOKEN)throw new Error('実状態確認にはendpoint・userId・管理tokenが必要です。');
      const url=new URL(input.endpoint);if(url.protocol!=='https:'&& !['localhost','127.0.0.1'].includes(url.hostname))throw new Error('管理APIはHTTPSが必要です。');
      const db=input.environment==='dev'?input.database.slice(4):input.database;
      const response=await fetch(input.endpoint.replace(/\/$/,'')+'/do/admin/'+encodeURIComponent(db)+'/'+encodeURIComponent(input.userId)+'/status',{method:'POST',headers:{'x-masamune-server-token':process.env.DO_SERVER_ACCESS_TOKEN}});
      if(!response.ok)throw new Error('DO実状態を取得できません。');actual=await response.json();
    }
    return {approved:published.map(r=>r.version),pending:history.slice(published.length).map(r=>r.version),diff:sql,actual,notice:'承認履歴は全DOの実適用を意味しません。実状態はuserIdを指定して確認します。'};
  }
  if(input.command==='diff')return {sql};
  if(input.command==='generate'){
    if(!sql.length)throw new Error('schema差分がありません。');
    if(history.length!==published.length)throw new Error('先に既存migrationを承認してください。');
    if(history.some(r=>r.version>=(input.version??'')))throw new Error('後続versionを指定してください。');
    const r=await revision(input.version??'',input.database,history.at(-1)?.after??null,manifest);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,r.version+'.json'),JSON.stringify(r,null,2)+'\n',{flag:'wx'});return r;
  }
  const selected=history.findIndex(r=>r.version===input.version);if(selected<0)throw new Error('versionを指定してください。');
  if(selected>published.length)throw new Error('生成順に承認してください。');
  if(!input.apply)return {dryRun:true,revision:history[selected],requiresDeploy:true};
  if(selected<published.length)return {alreadyApproved:true};
  const next=[...approvedAll,history[selected]];await fs.mkdir(path.dirname(approved),{recursive:true});await fs.writeFile(approved+'.tmp',JSON.stringify(next,null,2)+'\n');await fs.rename(approved+'.tmp',approved);
  return {approved:true,version:input.version,requiresDeploy:true};
}
