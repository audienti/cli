import { callWorkspace, configuration } from './workspaces.mjs';
import { readJsonFile } from './json-file.mjs';
export async function workFeedbackCli(args) {
 const flags={}, positions=[];
 for(let i=0;i<args.length;i++) { const arg=args[i];if(arg==='--json')continue;if(!arg.startsWith('--')){positions.push(arg);continue;}const key=arg.slice(2);if(!['profile','workspace','file','action','change','cursor','limit','status'].includes(key)||Object.hasOwn(flags,key)||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Unknown, repeated, or incomplete work changes option.');flags[key]=args[++i]; }
 const [, , command, planId]=positions;
 if(positions.length!==4||!['request','respond','withdraw','get','list'].includes(command))throw new Error('Use work changes request|respond|withdraw|get|list PLAN.');
 const read=['get','list'].includes(command),specific=command==='request'?['action']:command==='list'?['cursor','limit','status']:['change'];
 const allowed=['profile','workspace',...specific,...(read?[]:['file'])];
 if(Object.keys(flags).some(key=>!allowed.includes(key)))throw new Error('Option does not apply to this work changes command.');
 if(command==='request'&&!flags.action)throw new Error('Request requires --action.');
 if(!['request','list'].includes(command)&&!flags.change)throw new Error('This command requires --change.');
 const input=read?{}:readJsonFile(flags.file,65536,'Work change input');
 if(['workspaceId','planId','clientActionId','reviewRequestId'].some(key=>Object.hasOwn(input,key)))throw new Error('invalid_fields: location IDs come from flags and position only.');
 Object.assign(input,{planId,...(flags.workspace?{workspaceId:flags.workspace}:{}),...(flags.action?{clientActionId:flags.action}:{}),...(flags.change?{reviewRequestId:flags.change}:{})});
 if(command==='list'){input.page={...(flags.cursor?{cursor:flags.cursor}:{}),...(flags.limit?{limit:Number(flags.limit)}:{})};if(flags.status!==undefined)input.status=flags.status;}
 console.log(JSON.stringify(await callWorkspace(`workspace_work_change_${command}`,input,configuration(flags.profile))));
}
