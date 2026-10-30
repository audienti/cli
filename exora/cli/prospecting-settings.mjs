import { callOwnerAccountOperation } from './owner-account-client.mjs';
import { readJsonFile } from './json-file.mjs';
import { prospectingSettingsOperations } from './prospecting-settings-operations.mjs';
export const callProspectingSettings=(name,args,profilePath)=>callOwnerAccountOperation(prospectingSettingsOperations[name],args,profilePath);
export async function prospectingSettingsCli(args){
 const flags={},positions=[];
 for(let i=0;i<args.length;i++){const arg=args[i];if(arg==='--json')continue;if(!arg.startsWith('--')){positions.push(arg);continue;}const key=arg.slice(2);if(!['profile','file','provider','account-ref','cursor','limit'].includes(key)||Object.hasOwn(flags,key)||!args[i+1]||args[i+1].startsWith('--'))throw Error('Unknown, repeated or incomplete settings option.');flags[key]=args[++i];}
 const names={show:'prospecting_settings_get',save:'prospecting_settings_set',accounts:'prospecting_accounts_list','account-show':'prospecting_account_settings_get','account-save':'prospecting_account_settings_set',history:'prospecting_settings_history'};
 const command=positions[2],name=names[command];if(positions.length!==3||positions[0]!=='prospecting'||positions[1]!=='settings'||!name)throw Error('Use prospecting settings show|save|accounts|account-show|account-save|history.');
 const allowed=['profile',...(['save','account-save'].includes(command)?['file']:command==='account-show'?['provider','account-ref']:['history','accounts'].includes(command)?['cursor','limit']:[])];if(Object.keys(flags).some(k=>!allowed.includes(k)))throw Error('Option does not apply to this settings command.');
 let input={};if(['save','account-save'].includes(command)){if(!flags.file)throw Error('--file INPUT.json is required.');input=readJsonFile(flags.file,65536,'Settings input');}
 if(command==='account-show')input={provider:flags.provider,accountRef:flags['account-ref']};
 if(flags.cursor!==undefined)input.cursor=flags.cursor;if(flags.limit!==undefined){if(!/^\d+$/.test(flags.limit))throw Error('invalid_fields');input.limit=Number(flags.limit);}
 console.log(JSON.stringify(await callProspectingSettings(name,input,flags.profile??process.env.AUDIENTI_PROFILE)));
}
