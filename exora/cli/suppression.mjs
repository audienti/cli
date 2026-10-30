import { callWorkspace, configuration } from './workspaces.mjs';
export async function suppressionCli(args){
 const flags={},positions=[];
 const allowed=['workspace','profile','history-cursor','history-limit','kind','action','expected-version','request-id','reason'];
 for(let i=0;i<args.length;i++){const arg=args[i];if(arg==='--json')continue;if(!arg.startsWith('--')){positions.push(arg);continue;}const key=arg.slice(2);if(!allowed.includes(key)||Object.hasOwn(flags,key)||args[i+1]===undefined||args[i+1].startsWith('--'))throw Error('Unknown, repeated or incomplete suppression option.');flags[key]=args[++i];}
 if(positions.length!==4||positions[0]!=='prospects'||positions[1]!=='suppression'||!['get','set'].includes(positions[2]))throw Error('Use prospects suppression get|set ID --workspace ID.');
 const read=positions[2]==='get';const valid=['workspace','profile',...(read?['history-cursor','history-limit']:['kind','action','expected-version','request-id','reason'])];if(Object.keys(flags).some(k=>!valid.includes(k)))throw Error('Option does not apply to this command.');
 const input={workspaceId:flags.workspace,prospectId:positions[3]};
 if(read)input.history={...(flags['history-cursor']===undefined?{}:{cursor:flags['history-cursor']}),...(flags['history-limit']===undefined?{}:{limit:Number(flags['history-limit'])})};
 else Object.assign(input,{kind:flags.kind,action:flags.action,expectedVersion:flags['expected-version']===undefined?undefined:Number(flags['expected-version']),requestId:flags['request-id'],...(flags.reason===undefined?{}:{reason:flags.reason})});
 console.log(JSON.stringify(await callWorkspace(read?'workspace_prospect_suppression':'workspace_prospect_suppression_set',input,configuration(flags.profile))));
}
