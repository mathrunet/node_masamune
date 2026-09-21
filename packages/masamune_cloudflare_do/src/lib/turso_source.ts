import type { MigrationSource, SchemaManifest } from './types';
import { quote } from './client';
import { hash, canonical } from './schema';
import { HttpError } from './http_error';
type Row=Record<string,unknown>;
/** 移行専用credentialで利用する。DDL権限を持つ旧credentialは事前に失効させる。 */
export class TursoMigrationSource implements MigrationSource {
  constructor(private readonly options:{url:string;token:string;manifest:SchemaManifest;database:string;writersRevoked:boolean}) {
    if(!options.writersRevoked) throw new HttpError(409,'旧直接書込みcredentialの失効確認が必要です。');
  }
  private get tables(){return this.options.manifest.tables.filter(t=>t.database===this.options.database);}
  private triggers(){return this.tables.flatMap(t=>['INSERT','UPDATE','DELETE'].map(op=>`CREATE TRIGGER ${quote('_masamune_freeze_'+t.table+'_'+op.toLowerCase())} BEFORE ${op} ON ${quote(t.table)} BEGIN SELECT RAISE(ABORT, 'masamune_migration_frozen'); END`));}
  private async sql(statements:{sql:string;args?:unknown[]}[]):Promise<Row[][]>{
    const url=this.options.url.replace(/^libsql:/,'https:').replace(/\/$/,'')+'/v2/pipeline';
    if(!url.startsWith('https://'))throw new HttpError(500,'TursoにはHTTPSを指定します。');
    const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+this.options.token,'Content-Type':'application/json'},body:JSON.stringify({requests:[{type:'batch',batch:{steps:statements.map((s,i)=>({...(i?{condition:{type:'ok',step:i-1}}:{}),stmt:{sql:s.sql,args:(s.args??[]).map(v=>v===null?{type:'null'}:typeof v==='number'?{type:Number.isInteger(v)?'integer':'float',value:Number.isInteger(v)?String(v):v}:{type:'text',value:String(v)}),want_rows:true}}))}},{type:'close'}]})});
    if(!response.ok)throw new HttpError(503,'Turso移行元に接続できません。');
    const body=await response.json() as any;const result=body.results?.[0];
    if(result?.type!=='ok'||result.response?.type!=='batch'||Object.values(result.response.result.step_errors??{}).some(Boolean))throw new HttpError(503,'Turso移行SQLに失敗しました。');
    return (result.response.result.step_results as any[]).map(r=>r?(r.rows??[]).map((row:any[])=>Object.fromEntries(row.map((v,j)=>{
      let value:unknown=v.value;
      if(v.type==='null')value=null;
      else if(v.type==='integer'){value=Number(v.value);if(!Number.isSafeInteger(value))throw new HttpError(409,'Turso整数の精度を保持できません。');}
      else if(v.type==='float')value=Number(v.value);
      else if(v.type!=='text')throw new HttpError(409,'未対応Turso格納型です。');
      return [r.cols[j].name,value];
    }))):[]);
  }
  async seal():Promise<string>{
    const expected=await hash({database:this.options.database,tables:this.tables});
    const meta='CREATE TABLE IF NOT EXISTS _masamune_do_fence (id INTEGER PRIMARY KEY CHECK(id=1), epoch TEXT NOT NULL)';
    const statements=[{sql:'BEGIN IMMEDIATE'},{sql:meta},{sql:'INSERT OR IGNORE INTO _masamune_do_fence VALUES (1,?)',args:[expected]},...this.triggers().map(sql=>({sql:sql.replace('CREATE TRIGGER ','CREATE TRIGGER IF NOT EXISTS ')})),{sql:'COMMIT'}];
    await this.sql(statements);await this.check(expected);return expected;
  }
  private async check(epoch:string){
    const [meta,triggers]=await this.sql([{sql:'SELECT epoch FROM _masamune_do_fence WHERE id=1'},{sql:"SELECT sql FROM sqlite_master WHERE type='trigger' AND name GLOB '_masamune_freeze_*' ORDER BY name"}]);
    const actual=triggers.map(r=>r.sql).sort();
    if(meta[0]?.epoch!==epoch||canonical(actual)!==canonical(this.triggers().sort()))throw new HttpError(409,'移行元の書込み遮断が変更されています。');
  }
  async page(table:string,after:string,limit:number,epoch:string){
    if(!this.tables.some(t=>t.table===table)||!Number.isInteger(limit)||limit<1||limit>100)throw new HttpError(400,'移行対象が不正です。');
    await this.check(epoch);
    return (await this.sql([{sql:`SELECT * FROM ${quote(table)} WHERE id COLLATE BINARY>? ORDER BY id COLLATE BINARY LIMIT ?`,args:[after,limit]}]))[0];
  }
  async document(table:string,id:string,epoch:string){
    if(!this.tables.some(t=>t.table===table))throw new HttpError(400,'移行対象が不正です。');
    await this.check(epoch);return (await this.sql([{sql:`SELECT * FROM ${quote(table)} WHERE id=?`,args:[id]}]))[0][0];
  }
}
