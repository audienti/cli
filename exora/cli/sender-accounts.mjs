import {senderAccountOperations} from './sender-account-operations.mjs';
import {callOwnerAccountOperation} from './owner-account-client.mjs';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readJsonFile} from './json-file.mjs';
import {WorkspaceRequestError,callWorkspace,configuration} from './workspaces.mjs';
export async function callSenderAccounts(name,args,profilePath){
 return callOwnerAccountOperation(senderAccountOperations[name],args,profilePath,'sender account',true);
}
export async function senderAccountsCli(args){
 const flags={},positions=[];const known=['profile','file','cursor','limit','aliases-cursor','aliases-limit','history-cursor','history-limit','action-type','capability','provider','account-ref','workspace','plan','text','text-file','attachment','reason','request-id','state','account','company-page','repost'];
 for(let i=0;i<args.length;i++){const arg=args[i];if(arg==='--json')continue;if(!arg.startsWith('--')){positions.push(arg);continue;}const key=arg.slice(2);if(!known.includes(key)||Object.hasOwn(flags,key)||args[i+1]===undefined||args[i+1].startsWith('--'))throw Error('Unknown, repeated or incomplete sender option.');flags[key]=args[++i];}
 if(positions[0]==='sender'&&positions[1]==='managed'){
  if(positions[2]==='plan'){
   const plans=['free','premium_career','premium_business','premium_all_in_one','sales_navigator_core','sales_navigator_advanced','recruiter_lite'],usage=`Use sender managed plan MANAGED_ACCOUNT_ID --plan ${plans.join('|')}|none [--workspace ID] [--profile PATH]  (the user only; none clears it).`;
   if(positions.length!==4||Object.keys(flags).some(key=>!['profile','plan','workspace'].includes(key))||!flags.plan||![...plans,'none'].includes(flags.plan))throw Error(flags.plan&&![...plans,'none'].includes(flags.plan)?`${flags.plan} is not a plan. ${usage}`:usage);
   console.log(JSON.stringify(await callWorkspace('workspace_managed_account_plan_set',{workspaceId:flags.workspace,managedAccountId:positions[3],plan:flags.plan==='none'?null:flags.plan},configuration(flags.profile??process.env.AUDIENTI_PROFILE))));return;
  }
  if(positions[2]==='post'){
   const usage='Use sender managed post create MANAGED_ACCOUNT_ID (--text TEXT|--text-file PATH) [--attachment ID] [--company-page COMPANY_ID] [--repost POST_ID] [--reason TEXT] [--request-id UUID], sender managed post pages MANAGED_ACCOUNT_ID, sender managed post list [--account ID] [--state STATE], sender managed post get POST_ID, sender managed post approve POST_ID [--text TEXT], or sender managed post reject POST_ID [--reason TEXT] [--workspace ID] [--profile PATH]. Approve and reject are for the account owner, a person.';
   const sub=positions[3],applies={create:['text','text-file','attachment','company-page','repost','reason','request-id'],pages:[],list:['account','state','limit'],get:[],approve:['text'],reject:['reason']}[sub];
   if(!applies||positions.length!==(sub==='list'?4:5)||Object.keys(flags).some(key=>!['profile','workspace',...applies].includes(key)))throw Error(usage);
   if(sub==='list'){console.log(JSON.stringify(await callWorkspace('workspace_managed_posts_list',{workspaceId:flags.workspace,...flags.account?{managedAccountId:flags.account}:{},...flags.state?{state:flags.state}:{},...flags.limit?{limit:Number(flags.limit)}:{}},configuration(flags.profile??process.env.AUDIENTI_PROFILE))));return;}
   if(sub==='pages'){console.log(JSON.stringify(await callWorkspace('workspace_managed_post_pages',{workspaceId:flags.workspace,managedAccountId:positions[4]},configuration(flags.profile??process.env.AUDIENTI_PROFILE))));return;}
   if(sub==='get'){console.log(JSON.stringify(await callWorkspace('workspace_managed_post_get',{workspaceId:flags.workspace,postId:positions[4]},configuration(flags.profile??process.env.AUDIENTI_PROFILE))));return;}
   if(sub==='create'){
    if((flags.text!==undefined&&flags['text-file']!==undefined)||(!flags.repost&&flags.text===undefined&&flags['text-file']===undefined))throw Error('Give the post with --text or --text-file, not both. '+usage);
    const text=flags.text??(flags['text-file']?readFileSync(flags['text-file'],'utf8'):'');
    console.log(JSON.stringify(await callWorkspace('workspace_managed_post_create',{workspaceId:flags.workspace,managedAccountId:positions[4],requestId:flags['request-id']??randomUUID(),text,...flags.attachment?{attachmentId:flags.attachment}:{},...flags['company-page']?{companyPageId:flags['company-page']}:{},...flags.repost?{repostId:flags.repost}:{},...flags.reason?{reason:flags.reason}:{}},configuration(flags.profile??process.env.AUDIENTI_PROFILE))));return;
   }
   console.log(JSON.stringify(await callWorkspace(sub==='approve'?'workspace_managed_post_approve':'workspace_managed_post_reject',{workspaceId:flags.workspace,postId:positions[4],...flags.text!==undefined?{text:flags.text}:{},...flags.reason?{reason:flags.reason}:{}},configuration(flags.profile??process.env.AUDIENTI_PROFILE))));return;
  }
  const names={list:'workspace_managed_accounts_list',connect:'workspace_managed_account_connect'};
  if(!names[positions[2]]||positions.length!==3||Object.keys(flags).some(key=>!['profile','workspace'].includes(key)))throw Error('Use sender managed list|connect|plan|post [--workspace ID] [--profile PATH].');
  console.log(JSON.stringify(await callWorkspace(names[positions[2]],{workspaceId:flags.workspace},configuration(flags.profile??process.env.AUDIENTI_PROFILE))));return;
 }
 if(positions[0]!=='sender'||positions[1]!=='accounts')throw Error('Use sender accounts list|get|alias|register|bind|unbind|state|workspaces|seat|limits|automation|modes.');
 const automation=positions[2]==='automation',modes=positions[2]==='modes',activity=positions[2]==='activity',nested=automation||modes||activity,command=nested?`${positions[2]}-${positions[3]}`:positions[2];
 const names={'activity-report':'sender_activity_report',alias:'sender_alias_get',list:'sender_accounts_list',get:'sender_account_get',register:'sender_account_register',bind:'sender_alias_bind',unbind:'sender_alias_unbind',state:'sender_account_state_set',workspaces:'sender_account_workspaces_set',seat:'sender_account_seat_get',limits:'sender_account_limits_set','automation-get':'sender_automation_get','automation-set':'sender_automation_set','modes-get':'sender_action_modes_get','modes-set':'sender_action_mode_set'};
 const name=names[command];if(!name)throw Error('Unknown sender account command.');
 const operation=senderAccountOperations[name],hasId=!['list','register','alias'].includes(command),expected=nested?5:hasId?4:3;if(positions.length!==expected)throw Error('Unexpected sender arguments.'+(command==='workspaces'?' Use sender accounts workspaces ACCOUNT_ID --file scope.json [--profile PATH].':''));
 const allowed=['profile',...(operation.method==='POST'?['file']:command==='alias'?['provider','account-ref']:command==='list'?['cursor','limit']:command==='get'?['aliases-cursor','aliases-limit','history-cursor','history-limit']:[]),...(automation?['action-type']:[]),...(command==='modes-set'?['capability']:[])];
 if(Object.keys(flags).some(key=>!allowed.includes(key)))throw Error('Option does not apply to this sender command.');
 let input={};if(operation.method==='POST'){if(!flags.file)throw Error('--file INPUT.json is required.');input=readJsonFile(flags.file,65536,'Sender input');if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid_fields: input must be a JSON object.');if(Object.hasOwn(input,'senderAccountId')||Object.hasOwn(input,'actionType')||Object.hasOwn(input,'capability')||Object.hasOwn(input,'workspaceId'))throw Error('Path IDs and workspaceId are not allowed in the file.');}
 if(command==='alias'){input.provider=flags.provider;input.accountRef=flags['account-ref'];}
 if(hasId)input.senderAccountId=positions[nested?4:3];if(automation)input.actionType=flags['action-type'];if(command==='modes-set')input.capability=flags.capability;
 for(const key of ['cursor','limit','aliases-cursor','aliases-limit','history-cursor','history-limit'])if(flags[key]!==undefined){const field=key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());if(key.endsWith('limit')){if(!/^\d+$/.test(flags[key]))throw new WorkspaceRequestError(400,'invalid_fields','Page limit must be 1–100.');input[field]=Number(flags[key]);}else input[field]=flags[key];}
 console.log(JSON.stringify(await callSenderAccounts(name,input,flags.profile??process.env.AUDIENTI_PROFILE)));
}
