import { randomUUID } from 'node:crypto';
import { hostedToolOperations, paidToolByName, isPaidToolOperation, paidToolResult } from './tools-operations.mjs';
import { parseArgs } from 'node:util';
import { readJsonFile } from './json-file.mjs';
import { callWorkspace, configuration } from './workspaces.mjs';
const help = `Usage:
  audienti call TOOL ['JSON_INPUT'] [--input FILE|-] [--request-id UUID] [--workspace UUID] [--json]
  audienti tools search "WORDS" [--limit N] [--workspace UUID]   one server search over tools, audienti commands and skills; rows: id, kind, description, price
  audienti tools get TOOL [--workspace UUID]         one tool: inputs, price, availability, your 30-day success rate and speed
  audienti tools list [--workspace UUID] [--json]    the whole catalog
  audienti tools runs get UUID [--attempt-after ORDINAL] [--entry-after UUID] | list [--cursor UUID]
  audienti tools balance
  audienti tools NAME --input FILE|- --request-id UUID [--workspace UUID] [--json]   same as call NAME; kept for existing scripts
  audienti tools proxy.sessions.close UUID [--workspace UUID]

The server catalog is the only source of tool names, inputs and prices: run tools search or tools get, then call.
call sends {tool,requestId,input} to one route for every tool. Published ids look like audienti.email.verify;
an old name (for example profiles.enrich) resolves on the server. A tool with no configured provider is not listed or callable.
Record tools (profile read and enrich, email and mobile find, email.verify, web.search) reuse a saved record when one is
current; put "cached":false in the input to skip it, make a fresh paid call and save the result.
Without --request-id, call generates one and prints it to stderr. Save it: replaying the same ID is free and
returns the saved result; a new ID is a new purchase.

email.find and mobile.find may return running: poll tools runs get OPERATION_ID.
Keep the same request ID after interruptions; never submit a new one to retry a purchase.

web.search returns one selected result page; workspace cache lasts 24 hours (refresh=true bypasses it).
web.fetch returns inert text/links through a bounded HTML waterfall. Each completed logical
web result costs 0.1 credit ($1 per 1000); failed requests, cache hits and request replays are free.
Uses the selected private profile/workspace. Supply --profile PATH when needed.
email.verify accepts {email,refresh?}; it records provider deliverability evidence without establishing ownership or authorizing sending. It reuses workspace validation for seven days; refresh makes a configured paid validation. Cache and same-request replay are free.
profiles.fetch accepts a person /in/ or company /company/ URL as {url,fields?,refresh?}; a complete saved profile is free for 30 days.
Explicit refresh requires paid admission; the result includes saved profile/prospect IDs.
Fields: name, headline, about, location, experience, currentPositions, education, skills,
websites, photo, connections, followers, certifications, languages. Company-specific fields:
industries, employeeCount, employeeCountRange, founded, specialities, locations, companyType.
profiles.enrich accepts the same fields as profiles.fetch, using url or saved profileId.
Its operation has the same admission identity as profiles.fetch; the Prospect projection is a current free read.
profiles.discover is the clear external-search alias of profiles.search; profiles list searches saved workspace records.
profiles.search accepts person filters or {kind:"company",query,companySizes?}; results are partial profiles.
Use tools get TOOL for exact fields. No implicit email lookup.
decide accepts {state,questions}; question types: boolean, choice, score.
Questions have instructions; choice requires named criteria; score criteria are ordered
from level zero. State is text, an object or an array. At most 32 KiB, 16 questions,
32 choices per question and 10 score levels. No provider credentials belong in input.
The request ID must be saved and reused after a timeout or interruption; never create a
new ID just to retry an uncertain operation. A rejected operation made no provider call;
after fixing its cause (for example adding credits), use a new ID for new work. Results and diagnostics contain trace IDs.
Example input: {"state":"Can we talk?","questions":{"interest":{"type":"boolean","instructions":"Does this express interest?"}}}
JSON results go to stdout; failures go to stderr and exit nonzero.`;
async function readStdin() {
 const chunks=[];let size=0;
 for await(const chunk of process.stdin){size+=chunk.length;if(size>32768)throw new Error('Tool input exceeds 32 KiB.');chunks.push(chunk);}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new Error('Tool input must be valid UTF-8 JSON.');}
}
const asJson=value=>{try{return JSON.parse(value);}catch{throw new Error('Tool input must be valid JSON.');}};
export async function printPaid(name,args,values){
 try{
  const result=await callWorkspace(name,args,configuration(values.profile));
  const paidResult=paidToolResult(name,result?.data,args);
  if(['failed','uncertain','rejected'].includes(paidResult?.status)){
   process.stderr.write(JSON.stringify({error:{code:paidResult.error?.code??'tool_incomplete'},operationId:paidResult.operationId,requestId:args.requestId,billing:paidResult.billing,...(paidResult.result?.persistence?{result:paidResult.result}:{}),requestTraceId:result.requestTraceId,recovery:paidResult.status==='rejected'?'resolve_rejection_then_new_request_id':paidResult.result?.persistence?.recovery??'retry_same_request_id'})+'\n');if(values.explain)process.stderr.write(values.explain(paidResult)+'\n');process.exitCode=1;return;
  }
  console.log(JSON.stringify(result));
 }catch(error){
  if(isPaidToolOperation(name,args))process.stderr.write(`Retain request ID ${args.requestId}; retry with the same ID to inspect/recover this operation.\n`);
  throw error;
 }
}
const parseOptions={help:{type:'boolean',short:'h'},json:{type:'boolean'},input:{type:'string'},'request-id':{type:'string'},workspace:{type:'string'},profile:{type:'string'},cursor:{type:'string'},limit:{type:'string'},'attempt-after':{type:'string'},'entry-after':{type:'string'}};
/** audienti call TOOL ['JSON'] : one generic route for every catalog tool. */
export async function callCli(argv) {
 const {positionals,values}=parseArgs({args:argv.slice(1),allowPositionals:true,strict:true,options:parseOptions});
 if(values.help||positionals.length===0){console.log(help);return;}
 const [tool,inline]=positionals;
 if(positionals.length>2||(inline!==undefined&&values.input))throw new Error('Give the input once: a JSON argument or --input FILE|-.');
 const input=inline!==undefined?asJson(inline):values.input?(values.input==='-'?await readStdin():readJsonFile(values.input,32768,'Tool input')):{};
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Tool input must be a JSON object.');
 const requestId=values['request-id']??randomUUID();
 if(!values['request-id'])process.stderr.write(`request-id: ${requestId}\n`);
 await printPaid('tools_call',{workspaceId:values.workspace,tool,requestId,input},values);
}
export async function toolsCli(argv) {
 const {positionals,values}=parseArgs({args:argv.slice(1),allowPositionals:true,strict:true,options:parseOptions});
 if(values.help||positionals.length===0){console.log(help);return;}
 const [verb,sub,id]=positionals;
 let name,args={workspaceId:values.workspace};
 if(verb==='list'&&positionals.length===1)name='tools_list';
 else if(verb==='search'&&positionals.length>=2){name='tools_search';args.query=positionals.slice(1).join(' ');if(values.limit!==undefined)args.limit=Number(values.limit);}
 else if((verb==='get'||verb==='describe')&&positionals.length===2){name='tools_get';args.tool=sub;}
 else if(verb==='balance'&&positionals.length===1)name='tools_balance';
 else if(verb==='runs'&&sub==='get'&&positionals.length===3){name='tools_runs_get';args.operationId=id;args.entryAfter=values['entry-after'];if(values['attempt-after']!==undefined)args.attemptAfter=Number(values['attempt-after']);}
 else if(verb==='runs'&&sub==='list'&&positionals.length===2){name='tools_runs_list';args.cursor=values.cursor;}
 else if(verb==='proxy.sessions.close'&&positionals.length===2){name='tools_proxy_sessions_close';args.operationId=sub;}
 else if(Object.hasOwn(paidToolByName,verb)&&positionals.length===1){
  if(!values.input||!values['request-id'])throw new Error(`${verb} requires --input FILE|- and --request-id UUID. Keep the request ID for retries.`);
  name=paidToolByName[verb].name;args.requestId=values['request-id'];args.input=values.input==='-'?await readStdin():readJsonFile(values.input,32768,'Tool input');
 }else throw new Error('Unknown tools command. Use audienti tools --help.');
 await printPaid(name,args,values);
}
