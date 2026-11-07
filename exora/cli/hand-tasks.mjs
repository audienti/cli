import {callWorkspace,configuration} from './workspaces.mjs';
const help='Use hand-tasks [list [--state open|ready|done|failed|skipped]] | show ID | done ID --disposition done|failed --outcome TEXT [--notes TEXT] [--result replied|meeting_booked] | skip ID --reason TEXT | event ID [--name TEXT] [--notes TEXT]. Add --workspace ID to pick a workspace.';
export async function handTasksCli(args){
 const position=[],flags={};for(let i=1;i<args.length;i++){
  if(!args[i].startsWith('--')){position.push(args[i]);continue}
  const key=args[i].slice(2);if(key==='json')continue;if(!['profile','workspace','state','disposition','outcome','notes','result','reason','name'].includes(key)||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(flags,key))throw new Error(`Unknown or incomplete hand-tasks option. ${help}`);
  flags[key]=args[++i];
 }
 const command=position[0]??'list',id=position[1],config=configuration(flags.profile),workspaceId=flags.workspace;
 const call=async(name,input)=>console.log(JSON.stringify((await callWorkspace(name,{workspaceId,...input},config)).data));
 if(command==='list'){if(position.length>1)throw new Error(help);return call('hand_task_list',flags.state?{state:flags.state}:{});}
 if(!id||position.length!==2)throw new Error(help);
 if(command==='show')return call('hand_task_get',{id});
 if(command==='done'){if(!flags.outcome||!['done','failed'].includes(flags.disposition))throw new Error('Give --disposition done|failed and say what happened: --outcome TEXT.');return call('hand_task_complete',{id,disposition:flags.disposition,outcome:flags.outcome,...(flags.notes?{notes:flags.notes}:{}),...(flags.result?{result:flags.result}:{})});}
 if(command==='skip'){if(!flags.reason)throw new Error('Say why you skip it: --reason TEXT.');return call('hand_task_skip',{id,reason:flags.reason});}
 if(command==='event')return call('hand_task_event',{id,...(flags.name?{name:flags.name}:{}),...(flags.notes?{notes:flags.notes}:{})});
 throw new Error(help);
}
