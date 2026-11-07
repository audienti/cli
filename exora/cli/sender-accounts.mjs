import {senderAccountOperations} from './sender-account-operations.mjs';
import {callOwnerAccountOperation} from './owner-account-client.mjs';
import {readJsonFile} from './json-file.mjs';
import {WorkspaceRequestError,callWorkspace,configuration} from './workspaces.mjs';
export async function callSenderAccounts(name,args,profilePath){
 return callOwnerAccountOperation(senderAccountOperations[name],args,profilePath,'sender account',true);
}
export async function senderAccountsCli(args){
 const flags={},positions=[];const known=['profile','file','cursor','limit','aliases-cursor','aliases-limit','history-cursor','history-limit','action-type','capability','provider','account-ref','workspace','plan'];
 for(let i=0;i<args.length;i++){const arg=args[i];if(arg==='--json')continue;if(!arg.startsWith('--')){positions.push(arg);continue;}const key=arg.slice(2);if(!known.includes(key)||Object.hasOwn(flags,key)||!args[i+1]||args[i+1].startsWith('--'))throw Error('Unknown, repeated or incomplete sender option.');flags[key]=args[++i];}
 if(positions[0]==='sender'&&positions[1]==='managed'){
  if(positions[2]==='plan'){
   const plans=['free','premium_career','premium_business','premium_all_in_one','sales_navigator_core','sales_navigator_advanced','recruiter_lite'],usage=`Use sender managed plan MANAGED_ACCOUNT_ID --plan ${plans.join('|')}|none [--workspace ID] [--profile PATH]  (the user only; none clears it).`;
   if(positions.length!==4||Object.keys(flags).some(key=>!['profile','plan','workspace'].includes(key))||!flags.plan||![...plans,'none'].includes(flags.plan))throw Error(flags.plan&&![...plans,'none'].includes(flags.plan)?`${flags.plan} is not a plan. ${usage}`:usage);
   console.log(JSON.stringify(await callWorkspace('workspace_managed_account_plan_set',{workspaceId:flags.workspace,managedAccountId:positions[3],plan:flags.plan==='none'?null:flags.plan},configuration(flags.profile??process.env.AUDIENTI_PROFILE))));return;
  }
  const names={list:'workspace_managed_accounts_list',connect:'workspace_managed_account_connect'};
  if(!names[positions[2]]||positions.length!==3||Object.keys(flags).some(key=>!['profile','workspace'].includes(key)))throw Error('Use sender managed list|connect|plan [--workspace ID] [--profile PATH].');
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
