import { callWorkspace, configuration } from './workspaces.mjs';
import { readJsonFile } from './json-file.mjs';
export async function workCli(args) {
 const flags={}, position=[];
 const allowed=['profile','workspace','file','request-id','plan-id','client-action-id','cursor','limit','history-cursor','history-limit','revision','state','review-status','queue','search'];
 for(let i=0;i<args.length;i++) {
  if(args[i]==='--json')continue;
  if(!args[i].startsWith('--')){position.push(args[i]);continue;}
  const key=args[i].slice(2);if(!allowed.includes(key)||Object.hasOwn(flags,key)||args[i+1]===undefined||args[i+1].startsWith('--'))throw new Error('Unknown, repeated, or incomplete work option.');flags[key]=args[++i];
 }
 const names={'work plan save':'workspace_work_action_plan_save','work list':'workspace_work_operator_list','work show':'workspace_work_operator_get','work approve':'workspace_work_action_approve','work withdraw-approval':'workspace_work_action_withdraw','work cancel':'workspace_work_action_cancel','work eligibility':'workspace_work_eligibility_get'};
 const name=names[position.join(' ')];if(!name)throw new Error('Use work plan save, list, show, approve, withdraw-approval, cancel, or eligibility. Writes require --file INPUT.json.');
 const read=['workspace_work_operator_list','workspace_work_operator_get','workspace_work_eligibility_get'].includes(name);
 const input=read?{}:readJsonFile(flags.file,65536,'Work input');
 for(const [flag,key] of [['workspace','workspaceId'],['request-id','requestId'],['plan-id','planId'],['client-action-id','clientActionId']])if(flags[flag]!==undefined)input[key]=flags[flag];
 if(name==='workspace_work_operator_list'){
  input.page={...(flags.cursor===undefined?{}:{cursor:flags.cursor}),...(flags.limit===undefined?{}:{limit:Number(flags.limit)})};
  input.filter={};for(const [flag,key] of [['state','state'],['review-status','reviewStatus'],['search','search'],['queue','queue']])if(flags[flag]!==undefined)input.filter[key]=flags[flag];
 } else if(name==='workspace_work_operator_get'){
  if(flags.revision!==undefined)input.revision=Number(flags.revision);
  input.history={...(flags['history-cursor']===undefined?{}:{cursor:flags['history-cursor']}),...(flags['history-limit']===undefined?{}:{limit:Number(flags['history-limit'])})};
 }
 const applicable=new Set(['profile','workspace','file','request-id','plan-id','client-action-id',...(name==='workspace_work_operator_list'?['cursor','limit','state','review-status','search','queue']:[]),...(name==='workspace_work_operator_get'?['revision','history-cursor','history-limit']:[])]);
 if(Object.keys(flags).some(k=>!applicable.has(k)))throw new Error('Option does not apply to this work command.');
 if(read&&flags.file!==undefined)throw new Error('Read commands do not accept --file.');
 console.log(JSON.stringify(await callWorkspace(name,input,configuration(flags.profile))));
}
