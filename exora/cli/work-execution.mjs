import { workExecutionOperations } from './work-execution-operations.mjs';
import { callWorkspace, configuration } from './workspaces.mjs';
import { callOwnerAccountOperation } from './owner-account-client.mjs';
import { readJsonFile } from './json-file.mjs';
export function callWorkExecution(name,args,profile=process.env.AUDIENTI_PROFILE) {
 const operation=workExecutionOperations[name];if(!operation)throw Error('Unknown work execution operation.');
 return operation.scoped?callWorkspace(name,args,configuration(profile)):callOwnerAccountOperation(operation,args,profile,'work execution');
}
export async function workExecutionCli(args) {
 const flags={},positions=[];
 for(let i=0;i<args.length;i++){
  const arg=args[i];if(arg==='--json')continue;if(!arg.startsWith('--')){positions.push(arg);continue;}
  const key=arg.slice(2);if(!['profile','workspace','action','claim','attempt','file','cursor','limit'].includes(key)||Object.hasOwn(flags,key)||!args[i+1]||args[i+1].startsWith('--'))throw Error('Unknown, repeated or incomplete execution option.');flags[key]=args[++i];
 }
 const command=positions[2],workspace=['claim','start','get'].includes(command),read=['get','lookup'].includes(command);
 const names={claim:'workspace_work_claim',start:'workspace_work_start',get:'workspace_work_attempt_get',release:'work_claim_release',lookup:'work_attempt_lookup',report:'work_result_report'};
 if(!names[command]||positions.length!==(workspace?4:3))throw Error('Use work execution claim|start|get PLAN, release|lookup --claim ID, or report --attempt ID.');
 const allowed=['profile',...(workspace?['workspace','action']:command==='report'?['attempt']:['claim']),...(read?command==='get'?['cursor','limit']:[]:['file'])];
 if(Object.keys(flags).some(key=>!allowed.includes(key)))throw Error('Option does not apply to this execution command.');
 if(workspace&&!flags.action)throw Error('This command requires --action.');
 if(!workspace&&!(command==='report'?flags.attempt:flags.claim))throw Error('Supply the claim or attempt ID.');
 const input=read?{}:readJsonFile(flags.file,65536,'Work execution input');
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid_fields: input must be a JSON object.');
 const paths=workspace?['workspaceId','planId','clientActionId']:command==='report'?['attemptId']:['claimId'];
 if(paths.some(key=>Object.hasOwn(input,key)))throw Error('invalid_fields: path IDs come from positions and flags only.');
 Object.assign(input,workspace?{planId:positions[3],clientActionId:flags.action,...(flags.workspace?{workspaceId:flags.workspace}:{})}:command==='report'?{attemptId:flags.attempt}:{claimId:flags.claim});
 if(command==='get'){if(flags.cursor)input.historyCursor=flags.cursor;if(flags.limit)input.historyLimit=Number(flags.limit);}
 console.log(JSON.stringify(await callWorkExecution(names[command],input,flags.profile)));
}
