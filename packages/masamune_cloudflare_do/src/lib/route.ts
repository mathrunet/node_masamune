import { databaseName, hubName, hubStub, validateShared } from './shared';
import { Hono, Context } from 'hono';
import { WorkersData, WorkersOptions } from '@mathrunet/masamune_cloudflare';
import { createDoRulesEngine, buildDatabaseRulesPath, normalizeHttpMethodToRulesOperation } from './rules';
import { parseCrudRequest } from './request';
import { HttpError } from './http_error';
import { isDoServerRequest } from './server_request';
import type { DurableObjectWorkersOptions, DoNamespace, CrudRequest, DoCrudMethod, DoIdentity, AuthenticationContext } from './types';
function identity(c:Context,o:DurableObjectWorkersOptions,database:string,admin=false):DoIdentity {
  const user=(c.get('authentication') as AuthenticationContext|undefined)?.uid;
  const expected=c.req.header('X-Masamune-User-Id');
  if(!admin && expected && expected!==user) throw new HttpError(403,'Adapterと認証ユーザーが一致しません。');
  const target=admin?c.req.param('userId'):user;
  if(typeof target!=='string'||!target.length||target.length>256) throw new HttpError(401,'認証ユーザーが必要です。');
  const environment=c.env?.FLAVOR??'prod';
  if(!['dev','prod'].includes(environment)) throw new HttpError(500,'FLAVORが不正です。');
  const expectedEnvironment=c.req.header('X-Masamune-Environment');
  if(expectedEnvironment && expectedEnvironment!==environment)throw new HttpError(403,'Adapterと環境が一致しません。');
  const physical=(environment==='dev'?'dev_':'')+database;
  if(!o.databases.includes(physical)) throw new HttpError(400,'未登録DBです。');
  const topic=c.req.header('X-Masamune-Topic');
  if(topic !== undefined) {
    if(admin) throw new HttpError(400,'共有topicの管理APIは未対応です。');
    if(!o.shared || !/^[A-Za-z0-9_-]{1,128}$/.test(topic)) throw new HttpError(403,'共有topicが未設定または不正です。');
    validateShared(o.shared);
    return {environment,database:physical,userId:'@shared',topic};
  }
  return {environment,database:physical,userId:target};
}
function server(c:Context,o:DurableObjectWorkersOptions) {
  return isDoServerRequest(c,{...o,serverAccessToken:c.env?.DO_SERVER_ACCESS_TOKEN??o.serverAccessToken} as never);
}
async function authorize(c:Context,o:DurableObjectWorkersOptions,method:DoCrudMethod,r:CrudRequest) {
  const topic=c.req.header('X-Masamune-Topic');
  if(topic !== undefined && (!o.shared?.authorize || !await o.shared.authorize(c,{topic,database:r.database,table:r.table,method}))) throw new HttpError(403,'共有topicへのアクセスが拒否されました。');
  if(r.prefix) throw new HttpError(400,'DOではリクエストprefixを指定できません。');
  for(const operation of method==='POST'?['create','update'] as const:[normalizeHttpMethodToRulesOperation(method)]) {
    const result=await createDoRulesEngine(o.rules).evaluate({target:'database',path:buildDatabaseRulesPath({database:r.database,table:r.table,indexKey:r.indexKey??(typeof r.value?.id==='string'?r.value.id:'*')}),operation,authentication:c.get('authentication'),server:server(c,o),fetchDocument:()=>{throw new HttpError(400,'DO v1はfield認可に未対応です。');}});
    if(!result.allowed) throw new HttpError(403,'アクセスが拒否されました。');
  }
}
async function invoke(c:Context,o:DurableObjectWorkersOptions,i:DoIdentity,payload:unknown) {
  const ns=c.env?.[o.binding] as DoNamespace;
  if(!ns?.idFromName) throw new HttpError(500,'DO bindingがありません。');
  return ns.get(ns.idFromName(databaseName(i))).fetch(new Request('https://do.internal',{method:'POST',body:JSON.stringify(payload)}));
}
function error(e:unknown):Response {
  if(e instanceof HttpError) return Response.json({error:e.message},{status:e.status});
  console.error('DO経路処理に失敗',e);return Response.json({error:'DO要求に失敗しました。'},{status:500});
}
export function registerDurableObject(hono:Hono,o:DurableObjectWorkersOptions):Hono {
  for(const method of ['GET','POST','PUT','DELETE'] as const) for(const path of ['/database/:database/:table','/database/:database/:table/:indexKey']) hono.on(method,path,async c=>{
    try {
      const r=await parseCrudRequest(c);const i=identity(c,o,r.database);
      if(i.topic && r.nearest) throw new HttpError(400,'共有topicの近傍検索は未対応です。');
      if(!r.nearest) await authorize(c,o,method,r); else if(method!=='GET') throw new HttpError(400,'nearestは読み取り専用です。');
      const result=await invoke(c,o,i,{identity:i,operations:[{method,request:{...r,database:i.database}}]});
      if(!result.ok)return result;
      const body=await result.json() as {data:unknown[]};
      if(r.nearest) {
        const allowed=[];
        for(const row of body.data[0] as Record<string,unknown>[]) {
          try { await authorize(c,o,'GET',{...r,indexKey:String(row.id)}); allowed.push(row); }
          catch(error) { if(!(error instanceof HttpError)||error.status!==403) throw error; }
          if(allowed.length===(r.limit??10)) break;
        }
        return c.json({data:allowed});
      }
      return c.json({data:body.data[0]});
    }catch(e){return error(e);}
  });
  hono.post('/sync/:database',async (c:Context)=>{
    try {
      const database = c.req.param('database')!;
      const i = identity(c,o,database);
      const body = await c.req.json();
      if (!body || typeof body.table !== 'string' || body.database && body.database !== database) throw new HttpError(400,'同期queryが不正です。');
      const r:CrudRequest = {...body,database};
      await authorize(c,o,'GET',r);
      const exp = (c.get('authentication') as AuthenticationContext)?.token?.exp;
      const expires = Math.min(Date.now()+30000, typeof exp === 'number' ? exp*1000 : Infinity);
      const response = await invoke(c,o,i,{identity:i,sync:{request:{...r,database:i.database},ticket:!i.topic && body.ticket === true,expires}});
      if(!i.topic || !response.ok || body.ticket !== true) return response;
      const snapshot=await response.json() as Record<string,unknown>;
      const shared=o.shared!;
      const userId=(c.get('authentication') as AuthenticationContext).uid;
      const start=crypto.getRandomValues(new Uint32Array(1))[0] % shared.shards;
      for(let attempt=0;attempt<shared.shards;attempt++) {
        const shard=(start+attempt)%shared.shards;
        const result=await hubStub(c.env,shared.binding,hubName(i,shared.generation,shard)).fetch(new Request('https://hub.internal',{method:'POST',body:JSON.stringify({action:'ticket',identity:i,generation:shared.generation,shard,table:r.table,userId,expires})}));
        if(result.status===429 && attempt+1<shared.shards) { await result.arrayBuffer(); continue; }
        if(!result.ok) return result;
        return c.json({...snapshot,...await result.json() as object,hub:{generation:shared.generation,shard}});
      }
      throw new HttpError(429,'共有hubが満杯です。');
    }catch(e){return error(e);}
  });
  hono.post('/batch/:database',async c=>{
    try {
      const database=c.req.param('database');const i=identity(c,o,database);const body=await c.req.json();
      if(body.prefix||!Array.isArray(body.operations)||!body.operations.length||body.operations.length>100)throw new HttpError(400,'batchが不正です。');
      const operations=[];
      for(const op of body.operations){
        if(!op||!['POST','PUT','DELETE'].includes(op.method)||op.database&&op.database!==database)throw new HttpError(400,'batchは同一DOの変更だけに対応します。');
        const r={...op,database};await authorize(c,o,op.method,r);operations.push({method:op.method,request:{...r,database:i.database}});
      }
      return await invoke(c,o,i,{identity:i,operations});
    }catch(e){return error(e);}
  });
  hono.post('/admin/:database/:userId/:operation',async c=>{
    try {
      if(!server(c,o))throw new HttpError(403,'管理認証が必要です。');
      const operation=c.req.param('operation');if(!['status','migrate','vector-status','vector-drain','vector-rebuild'].includes(operation))throw new HttpError(400,'管理操作が不正です。');
      const i=identity(c,o,c.req.param('database'),true);const body=operation.startsWith('vector-')?await c.req.json().catch(()=>({})):{};return await invoke(c,o,i,{identity:i,admin:operation,adminRequest:body});
    }catch(e){return error(e);}
  });
  return hono;
}
/** この入口は一回限りticketで認証する。通常APIのauthは変更しない。 */
export function registerDurableObjectSockets(hono:Hono,o:DurableObjectWorkersOptions):Hono {
  hono.get('/shared/:database/:topic/:userId/:generation/:shard', async (c:Context) => {
    try {
      if(c.req.header('Upgrade')?.toLowerCase()!=='websocket') throw new HttpError(426,'WebSocketが必要です。');
      const shared=o.shared;
      if(!shared) throw new HttpError(403,'共有hubは無効です。');
      validateShared(shared);
      const {database,topic,userId,generation,shard:rawShard}=c.req.param();
      const shard=Number(rawShard), environment=c.env?.FLAVOR??'prod';
      const physical=(environment==='dev'?'dev_':'')+database;
      if(!['dev','prod'].includes(environment)||!o.databases.includes(physical)||!userId||userId.length>256||!/^[A-Za-z0-9_-]{1,128}$/.test(topic)||generation!==shared.generation||!/^\d+$/.test(rawShard)||!Number.isInteger(shard)||shard<0||shard>=shared.shards) throw new HttpError(400,'共有接続先が不正です。');
      const ticket=c.req.query('ticket')??'';
      if(!/^[0-9a-f-]{36}$/.test(ticket)) throw new HttpError(401,'ticketが必要です。');
      const identity={environment,database:physical,userId:'@shared',topic};
      return await hubStub(c.env,shared.binding,hubName(identity,generation,shard)).fetch(new Request('https://hub.internal/?ticket='+ticket,{headers:{Upgrade:'websocket','X-Hub-Identity':JSON.stringify({identity,generation,shard,userId})}}));
    }catch(e){return error(e);}
  });
  hono.get('/:database/:userId', async (c:Context) => {
    try {
      if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') throw new HttpError(426,'WebSocketが必要です。');
      const environment = c.env?.FLAVOR ?? 'prod';
      const database = c.req.param('database')!;
      const userId = c.req.param('userId');
      const physical = (environment === 'dev' ? 'dev_' : '') + database;
      if (!['dev','prod'].includes(environment) || !o.databases.includes(physical) || !userId || userId.length > 256) throw new HttpError(400,'接続先が不正です。');
      const ticket = c.req.query('ticket') ?? '';
      if (!/^[0-9a-f-]{36}$/.test(ticket)) throw new HttpError(401,'ticketが必要です。');
      const i = {environment,database:physical,userId};
      const ns = c.env?.[o.binding] as DoNamespace;
      if (!ns?.idFromName) throw new HttpError(500,'DO bindingがありません。');
      return await ns.get(ns.idFromName(JSON.stringify([environment,physical,userId]))).fetch(new Request('https://do.internal/?ticket='+ticket,{headers:{Upgrade:'websocket','X-Do-Identity':JSON.stringify(i)}}));
    } catch(e) { return error(e); }
  });
  return hono;
}
export const Functions={
  durableObject:(o:DurableObjectWorkersOptions)=>new WorkersData({path:'/do',func:(h,resolved)=>registerDurableObject(h,resolved as DurableObjectWorkersOptions),options:o as WorkersOptions}),
  durableObjectSockets:(o:DurableObjectWorkersOptions)=>new WorkersData({path:'/do-connect',func:h=>registerDurableObjectSockets(h,o),options:{auth:null,rules:null}}),
};
