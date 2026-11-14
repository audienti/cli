import { callWorkspace, configuration } from './workspaces.mjs';
import { readJsonFile } from './json-file.mjs';
const WORK_HELP = {
 send: 'work send --file INPUT.json [--workspace ID] [--request-id UUID]  (human: create, approve and queue one message; all sending checks apply)',
 control: 'work control --prospect-id ID [--mode take_over|blocked|hand_back --request-id UUID] [--workspace ID]  (read marks, or a person changes control)',
 'plan save': 'work plan save --file INPUT.json [--workspace ID] [--request-id UUID]  (save the actions a campaign plan asks a person to approve)',
 list: 'work list [--workspace ID] [--order oldest|priority] [--queue review|blocked|activity] [--state STATE] [--review-status STATUS] [--search TEXT] [--limit N] [--cursor CURSOR]  (what Operator shows)',
 show: 'work show --plan-id ID [--workspace ID] [--revision N] [--history-limit N] [--history-cursor CURSOR]  (one plan, with the history of its actions)',
 approve: 'work approve --plan-id ID --client-action-id ID --file INPUT.json [--workspace ID] [--request-id UUID]  (a person approves; the file holds expectedRevision, expectedApprovalVersion and requestId)',
 'withdraw-approval': 'work withdraw-approval --plan-id ID --client-action-id ID --file INPUT.json [--workspace ID] [--request-id UUID]  (take an approval back; the file holds expectedRevision, expectedApprovalVersion, requestId and reason)',
 cancel: 'work cancel --plan-id ID --client-action-id ID --file INPUT.json [--workspace ID] [--request-id UUID]  (reject it; the file holds expectedRevision, requestId and reason)',
 skip: 'work skip --plan-id ID --client-action-id ID --file INPUT.json [--workspace ID] [--request-id UUID]  (skip it; the file holds expectedRevision and requestId)',
 eligibility: 'work eligibility --plan-id ID --client-action-id ID [--workspace ID]  (checks whether a pending action could be sent now; it reserves nothing)',
 activity: 'work activity [--workspace ID] [--search TEXT] [--cursor-at ISO --cursor-id ID]  (what happened, newest first)',
};
const WORK_OTHER = ['work execution claim|start|send|get PLAN --action ID  (send: managed LinkedIn accounts, --file with claimId and requestId); release|lookup --claim ID; report --attempt ID', 'work changes request|list|get|respond|withdraw PLAN --workspace ID'];
/** The help for `audienti work ...`: only the work commands, with the options each one takes. */
export function workHelp(sub) {
 const known = WORK_HELP[sub];
 const lines = known ? [known] : [...Object.values(WORK_HELP), ...WORK_OTHER];
 return `${lines.join('\n')}\nEvery command also takes --profile PATH. Plan and review writes take --file INPUT.json; control writes take --mode and --request-id. A person reviews with a human workspace:access token.`;
}
export async function workCli(args) {
 const flags={}, position=[];
 const allowed=['profile','workspace','file','request-id','plan-id','client-action-id','cursor','limit','history-cursor','history-limit','revision','state','review-status','queue','search','order','cursor-at','cursor-id','prospect-id','mode'];
 for(let i=0;i<args.length;i++) {
  if(args[i]==='--json')continue;
  if(!args[i].startsWith('--')){position.push(args[i]);continue;}
  const key=args[i].slice(2);if(!allowed.includes(key)||Object.hasOwn(flags,key)||args[i+1]===undefined||args[i+1].startsWith('--'))throw new Error('Unknown, repeated, or incomplete work option.');flags[key]=args[++i];
 }
 const names={'work send':'workspace_message_send','work control':flags.mode?'workspace_person_control_set':'workspace_person_control_get','work activity':'workspace_work_activity_list','work plan save':'workspace_work_action_plan_save','work list':'workspace_work_operator_list','work show':'workspace_work_operator_get','work approve':'workspace_work_action_approve','work withdraw-approval':'workspace_work_action_withdraw','work cancel':'workspace_work_action_cancel','work skip':'workspace_work_action_skip','work eligibility':'workspace_work_eligibility_get'};
 const name=names[position.join(' ')];if(!name)throw new Error('Use work plan save, or work list, activity, show, approve, withdraw-approval, cancel, skip, or eligibility. Writes require --file INPUT.json.');
 const read=['workspace_person_control_get','workspace_work_activity_list','workspace_work_operator_list','workspace_work_operator_get','workspace_work_eligibility_get'].includes(name);
 const input=read||name==='workspace_person_control_set'?{}:readJsonFile(flags.file,65536,'Work input');
 for(const [flag,key] of [['workspace','workspaceId'],['request-id','requestId'],['plan-id','planId'],['client-action-id','clientActionId'],['prospect-id','prospectId'],['mode','mode']])if(flags[flag]!==undefined)input[key]=flags[flag];
 if(name==='workspace_work_activity_list'){
  if(flags.search!==undefined)input.search=flags.search;
  if((flags['cursor-at']===undefined)!==(flags['cursor-id']===undefined))throw new Error('Activity requires both --cursor-at and --cursor-id.');
  if(flags['cursor-at']!==undefined)input.cursor={at:flags['cursor-at'],id:flags['cursor-id']};
 } else if(name==='workspace_work_operator_list'){
  if(flags.order!==undefined)input.order=flags.order;
  input.page={...(flags.cursor===undefined?{}:{cursor:flags.cursor}),...(flags.limit===undefined?{}:{limit:Number(flags.limit)})};
  input.filter={};for(const [flag,key] of [['state','state'],['review-status','reviewStatus'],['search','search'],['queue','queue']])if(flags[flag]!==undefined)input.filter[key]=flags[flag];
 } else if(name==='workspace_work_operator_get'){
  if(flags.revision!==undefined)input.revision=Number(flags.revision);
  input.history={...(flags['history-cursor']===undefined?{}:{cursor:flags['history-cursor']}),...(flags['history-limit']===undefined?{}:{limit:Number(flags['history-limit'])})};
 }
 const applicable=new Set([...(name.startsWith('workspace_person_control_')?['prospect-id','mode']:[]),'profile','workspace','file','request-id','plan-id','client-action-id',...(name==='workspace_work_operator_list'?['cursor','limit','state','review-status','search','queue','order']:[]),...(name==='workspace_work_activity_list'?['search','cursor-at','cursor-id']:[]),...(name==='workspace_work_operator_get'?['revision','history-cursor','history-limit']:[])]);
 if(Object.keys(flags).some(k=>!applicable.has(k)))throw new Error('Option does not apply to this work command.');
 if(read&&flags.file!==undefined)throw new Error('Read commands do not accept --file.');
 console.log(JSON.stringify(await callWorkspace(name,input,configuration(flags.profile))));
}
