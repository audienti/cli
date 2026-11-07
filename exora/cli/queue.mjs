import {callWorkspace,configuration} from './workspaces.mjs';
const help='Use queue [list] | next | claim ID [--lease MINUTES] [--note TEXT] | done ID [--note TEXT] | skip ID --note TEXT [--reason-code CODE] | release ID [--note TEXT]. An agent reads every workspace its user approved it in; --workspace ID narrows to one.';
export async function queueCli(args){
 const position=[],flags={};for(let i=1;i<args.length;i++){
  if(!args[i].startsWith('--')){position.push(args[i]);continue}
  const key=args[i].slice(2);if(key==='json')continue;if(!['profile','workspace','note','lease','reason-code'].includes(key)||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(flags,key))throw new Error(`Unknown or incomplete queue option. ${help}`);
  flags[key]=args[++i];
 }
 const command=position[0]??'list',id=position[1],config=configuration(flags.profile),workspaceId=flags.workspace;
 const call=async(name,input)=>(await callWorkspace(name,{workspaceId,...input},config)).data;
 if(['list','next'].includes(command)){
  if(position.length>1)throw new Error(help);
  const queue=await call('agent_queue_list',{});
  // Without --workspace an agent reads every workspace its user approved it in (#333); each task names its workspace.
  console.log(JSON.stringify(command==='next'?{orientation:queue.orientation,you:queue.you,...(queue.workspaces?{workspaces:queue.workspaces}:{}),...(queue.notChecked?{notChecked:queue.notChecked}:{}),holding:queue.holding,waiting:queue.waiting??[],next:queue.next,...(queue.workspaceStep!==undefined?{workspaceStep:queue.workspaceStep}:{}),announce:queue.announce??null,fleet:queue.fleet,needsOtherTools:queue.needsOtherTools,pollAfterSeconds:queue.pollAfterSeconds,nextStep:queue.nextStep}:queue));return;
 }
 if(!id||position.length!==2)throw new Error(help);
 if(command==='claim'){console.log(JSON.stringify(await call('agent_queue_claim',{taskId:id,...(flags.lease?{leaseMinutes:Number(flags.lease)}:{}),...(flags.note?{note:flags.note}:{})})));return;}
 if(command==='done'||command==='skip'){
  if(command==='skip'&&!flags.note)throw new Error('Say why you skipped the task: --note TEXT.');
  console.log(JSON.stringify(await call('agent_queue_complete',{taskId:id,outcome:command==='done'?'done':'skipped',...(flags['reason-code']?{reasonCode:flags['reason-code']}:{}),...(flags.note?{note:flags.note}:{})})));return;
 }
 if(command==='release'){console.log(JSON.stringify(await call('agent_queue_release',{taskId:id,...(flags.note?{note:flags.note}:{})})));return;}
 throw new Error(help);
}
