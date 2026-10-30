import { z } from 'zod';
import { hostedToolOperations, paidToolByName, isPaidToolOperation, paidToolResult } from './tools-operations.mjs';
import { parseArgs } from 'node:util';
import { readJsonFile } from './json-file.mjs';
import { callWorkspace, configuration } from './workspaces.mjs';
const help = `Usage:
  audienti tools list [--workspace UUID] [--json]
  audienti tools proxy.sessions.close UUID [--workspace UUID]
  audienti tools describe decide|email.verify|email.find|mobile.find|profiles.fetch|posts.fetch|posts.search|posts.comments|posts.reactions|profiles.posts|profiles.search|proxy.sessions.create|web.search|web.fetch
  audienti tools decide|email.verify|email.find|mobile.find|profiles.fetch|posts.fetch|posts.search|posts.comments|posts.reactions|profiles.posts|profiles.search|proxy.sessions.create|web.search|web.fetch --input FILE|- --request-id UUID [--workspace UUID] [--json]
  audienti tools runs get UUID [--attempt-after ORDINAL] [--entry-after UUID] | list [--cursor UUID]
  audienti tools balance

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
industries, employeeCount, employeeCountRange, founded, specialities, locations.
profiles.enrich accepts the same fields as profiles.fetch, using url or saved profileId.
Its operation has the same admission identity as profiles.fetch; the Prospect projection is a current free read.
profiles.discover is the clear external-search alias of profiles.search; profiles list searches saved workspace records.
profiles.search accepts person filters or {kind:"company",query,companySizes?}; results are partial profiles.
Use describe for exact fields. No implicit email lookup.
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
export async function toolsCli(argv) {
 const {positionals,values}=parseArgs({args:argv.slice(1),allowPositionals:true,strict:true,options:{help:{type:'boolean',short:'h'},json:{type:'boolean'},input:{type:'string'},'request-id':{type:'string'},workspace:{type:'string'},profile:{type:'string'},cursor:{type:'string'},'attempt-after':{type:'string'},'entry-after':{type:'string'}}});
 if(values.help||positionals.length===0){console.log(help);return;}
 const [verb,sub,id]=positionals;
 if(verb==='describe'&&Object.hasOwn(paidToolByName,sub)&&positionals.length===2){console.log(JSON.stringify({name:sub,version:'1',canonicalTool:paidToolByName[sub].canonicalTool??sub,responseOperationPath:paidToolByName[sub].resultKey??null,inputSchema:z.toJSONSchema(paidToolByName[sub].schema.shape.input),limits:paidToolByName[sub].limits??(sub==='decide'?{bytes:32768,depth:32,questions:16,choices:32,scoreLevels:10}:sub==='profiles.fetch'?{providerCalls:1,normalizedBytes:65536,cacheDays:30}:{providerCalls:1,resultCache:false}),retry:'Reuse the same requestId and authenticated principal after interruptions.'},null,values.json?undefined:2));return;}
 let name,args={workspaceId:values.workspace};
 if(verb==='list'&&positionals.length===1)name='tools_list';
 else if(verb==='balance'&&positionals.length===1)name='tools_balance';
 else if(verb==='runs'&&sub==='get'&&positionals.length===3){name='tools_runs_get';args.operationId=id;args.entryAfter=values['entry-after'];if(values['attempt-after']!==undefined)args.attemptAfter=Number(values['attempt-after']);}
 else if(verb==='runs'&&sub==='list'&&positionals.length===2){name='tools_runs_list';args.cursor=values.cursor;}
 else if(verb==='proxy.sessions.close'&&positionals.length===2){name='tools_proxy_sessions_close';args.operationId=sub;}
 else if(Object.hasOwn(paidToolByName,verb)&&positionals.length===1){
  if(!values.input||!values['request-id'])throw new Error(`${verb} requires --input FILE|- and --request-id UUID. Keep the request ID for retries.`);
  name=paidToolByName[verb].name;args.requestId=values['request-id'];args.input=values.input==='-'?await readStdin():readJsonFile(values.input,32768,'Tool input');
 }else throw new Error('Unknown tools command. Use audienti tools --help.');
 try{
  const result=await callWorkspace(name,args,configuration(values.profile));
  const paidResult = paidToolResult(name,result?.data);
  if(['failed','uncertain','rejected'].includes(paidResult?.status)){
   process.stderr.write(JSON.stringify({error:{code:paidResult.error?.code??'tool_incomplete'},operationId:paidResult.operationId,requestId:args.requestId,billing:paidResult.billing,...(paidResult.result?.persistence?{result:paidResult.result}:{}),requestTraceId:result.requestTraceId,recovery:paidResult.status==='rejected'?'resolve_rejection_then_new_request_id':paidResult.result?.persistence?.recovery??'retry_same_request_id'})+'\n');process.exitCode=1;return;
  }
  console.log(JSON.stringify(result));
 }catch(error){
  if(isPaidToolOperation(name))process.stderr.write(`Retain request ID ${args.requestId}; retry with the same ID to inspect/recover this operation.\n`);
  throw error;
 }
}
