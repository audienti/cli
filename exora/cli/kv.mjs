import {randomUUID} from 'node:crypto';
import {callWorkspace,configuration} from './workspaces.mjs';
// Agent state store client (ADR 017): small values one user's agents share between runs. Never secrets.
const valued=['profile','workspace','if-version','ttl','expires-at','request-id','prefix','key','value','limit','after'];
const switches=['json','nx'];
export const kvUsage='KV: audienti kv get KEY | set KEY VALUE [--json] [--nx] [--if-version N] [--ttl 7d|--expires-at TIME] [--request-id ID] | list [--prefix P] [--after KEY] [--limit N] | search [--key TEXT] [--value TEXT] [--after KEY] [--limit N] | delete KEY  (state between runs: cursors, hashes, ids, timestamps; never credentials)';
function parse(args){
 const position=[],flags={};
 for(let i=1;i<args.length;i++){
  const arg=args[i];
  if(!arg.startsWith('--')){position.push(arg);continue}
  const key=arg.slice(2);
  if(Object.hasOwn(flags,key))throw new Error(`Repeated kv option --${key}.`);
  if(switches.includes(key)){flags[key]=true;continue}
  if(!valued.includes(key)||args[i+1]===undefined)throw new Error(`Unknown or incomplete kv option --${key}.`);
  flags[key]=args[++i];
 }
 return {command:position[0],rest:position.slice(1),flags};
}
const integer=(value,name)=>{if(value===undefined)return undefined;if(!/^\d+$/.test(value))throw new Error(`${name} must be a whole number.`);return Number(value)};
/** 90s, 15m, 6h, 7d or plain seconds. */
export function ttlSeconds(text){
 const match=/^(\d+)(s|m|h|d)?$/.exec(text??'');
 if(!match)throw new Error('Use --ttl like 90s, 15m, 6h or 7d.');
 return Number(match[1])*{s:1,m:60,h:3600,d:86400}[match[2]??'s'];
}
const print=value=>console.log(JSON.stringify(value));
const call=(name,input,flags)=>callWorkspace(name,{...(flags.workspace?{workspaceId:flags.workspace}:{}),...input},configuration(flags.profile));
export async function kvCli(args){
 const {command,rest,flags}=parse(args);
 const need=(count,usage)=>{if(rest.length!==count)throw new Error(`Use audienti kv ${usage}.`)};
 const page=()=>({...(flags.after!==undefined?{after:flags.after}:{}),...(flags.limit!==undefined?{limit:integer(flags.limit,'--limit')}:{})});
 switch(command){
  case 'get':need(1,'get KEY');return print(await call('agent_kv_get',{key:rest[0]},flags));
  case 'set':{
   need(2,'set KEY VALUE [--json] [--nx] [--if-version N] [--ttl 7d|--expires-at TIME]');
   let value=rest[1];
   if(flags.json){try{value=JSON.parse(rest[1])}catch{throw new Error('--json needs a valid JSON value, for example \'{"cursor":"abc"}\'.')}}
   if(flags.ttl!==undefined&&flags['expires-at']!==undefined)throw new Error('Use --ttl or --expires-at, not both.');
   if(flags['if-version']!==undefined&&flags.nx)throw new Error('Use --if-version or --nx, not both.');
   const input={key:rest[0],value,requestId:flags['request-id']??randomUUID()};
   if(flags['if-version']!==undefined)input.ifVersion=integer(flags['if-version'],'--if-version');
   if(flags.nx)input.nx=true;
   if(flags.ttl!==undefined)input.ttlSeconds=ttlSeconds(flags.ttl);
   if(flags['expires-at']!==undefined)input.expiresAt=flags['expires-at'];
   return print(await call('agent_kv_set',input,flags));
  }
  case 'list':need(0,'list [--prefix P] [--after KEY] [--limit N]');return print(await call('agent_kv_list',{...(flags.prefix!==undefined?{prefix:flags.prefix}:{}),...page()},flags));
  case 'search':{
   need(0,'search [--key TEXT] [--value TEXT]');
   if(flags.key===undefined&&flags.value===undefined)throw new Error('Use audienti kv search --key TEXT and/or --value TEXT.');
   return print(await call('agent_kv_search',{...(flags.key!==undefined?{key:flags.key}:{}),...(flags.value!==undefined?{value:flags.value}:{}),...page()},flags));
  }
  case 'delete':case 'del':need(1,'delete KEY');return print(await call('agent_kv_delete',{key:rest[0]},flags));
  case undefined:case 'help':console.log(kvUsage);return;
  default:throw new Error(`Unknown kv command "${command}". ${kvUsage}`);
 }
}
