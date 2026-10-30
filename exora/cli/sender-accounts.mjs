import {senderAccountOperations} from './sender-account-operations.mjs';
import {callOwnerAccountOperation} from './owner-account-client.mjs';
import {readJsonFile} from './json-file.mjs';
import {WorkspaceRequestError} from './workspaces.mjs';
export async function callSenderAccounts(name,args,profilePath){
 return callOwnerAccountOperation(senderAccountOperations[name],args,profilePath,'sender account');
}
export async function senderAccountsCli(args){
 const flags={},positions=[];const known=['profile','file','cursor','limit','aliases-cursor','aliases-limit','history-cursor','history-limit','action-type','provider','account-ref'];
 for(let i=0;i<args.length;i++){const arg=args[i];if(arg==='--json')continue;if(!arg.startsWith('--')){positions.push(arg);continue;}const key=arg.slice(2);if(!known.includes(key)||Object.hasOwn(flags,key)||!args[i+1]||args[i+1].startsWith('--'))throw Error('Unknown, repeated or incomplete sender option.');flags[key]=args[++i];}
 if(positions[0]!=='sender'||positions[1]!=='accounts')throw Error('Use sender accounts list|get|alias|register|bind|unbind|state|automation.');
 const automation=positions[2]==='automation',activity=positions[2]==='activity',nested=automation||activity,command=nested?`${positions[2]}-${positions[3]}`:positions[2];
 const names={'activity-report':'sender_activity_report',alias:'sender_alias_get',list:'sender_accounts_list',get:'sender_account_get',register:'sender_account_register',bind:'sender_alias_bind',unbind:'sender_alias_unbind',state:'sender_account_state_set','automation-get':'sender_automation_get','automation-set':'sender_automation_set'};
 const name=names[command];if(!name)throw Error('Unknown sender account command.');
 const operation=senderAccountOperations[name],hasId=!['list','register','alias'].includes(command),expected=nested?5:hasId?4:3;if(positions.length!==expected)throw Error('Unexpected sender arguments.');
 const allowed=['profile',...(operation.method==='POST'?['file']:command==='alias'?['provider','account-ref']:command==='list'?['cursor','limit']:command==='get'?['aliases-cursor','aliases-limit','history-cursor','history-limit']:[]),...(automation?['action-type']:[])];
 if(Object.keys(flags).some(key=>!allowed.includes(key)))throw Error('Option does not apply to this sender command.');
 let input={};if(operation.method==='POST'){if(!flags.file)throw Error('--file INPUT.json is required.');input=readJsonFile(flags.file,65536,'Sender input');if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid_fields: input must be a JSON object.');if(Object.hasOwn(input,'senderAccountId')||Object.hasOwn(input,'actionType')||Object.hasOwn(input,'workspaceId'))throw Error('Path IDs and workspaceId are not allowed in the file.');}
 if(command==='alias'){input.provider=flags.provider;input.accountRef=flags['account-ref'];}
 if(hasId)input.senderAccountId=positions[nested?4:3];if(automation)input.actionType=flags['action-type'];
 for(const key of ['cursor','limit','aliases-cursor','aliases-limit','history-cursor','history-limit'])if(flags[key]!==undefined){const field=key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());if(key.endsWith('limit')){if(!/^\d+$/.test(flags[key]))throw new WorkspaceRequestError(400,'invalid_fields','Page limit must be 1–100.');input[field]=Number(flags[key]);}else input[field]=flags[key];}
 console.log(JSON.stringify(await callSenderAccounts(name,input,flags.profile??process.env.AUDIENTI_PROFILE)));
}
