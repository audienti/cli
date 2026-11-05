import {callWorkspace,configuration} from './workspaces.mjs';
import {readJsonFile} from './json-file.mjs';
const help='Use outcomes report TASK_ID --file RESULTS.json [--workspace ID] [--profile PATH]. RESULTS.json is {"results":[{"kind":"linkedin.accept","person":"PERSON_ID","at":"ISO"}]}, or for a mailbox test email {"results":[{"kind":"mailbox.received","code":"CODE","sentTo":"ADDRESS","message":"MESSAGE_ID","receivedAt":"ISO"}]}.';
export async function outcomesCli(args){
 const position=[],flags={};for(let i=1;i<args.length;i++){
  if(!args[i].startsWith('--')){position.push(args[i]);continue}
  const key=args[i].slice(2);if(key==='json')continue;if(!['profile','workspace','file'].includes(key)||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(flags,key))throw new Error(`Unknown or incomplete outcomes option. ${help}`);
  flags[key]=args[++i];
 }
 if(position[0]!=='report'||position.length!==2||!flags.file)throw new Error(help);
 const body=readJsonFile(flags.file,256*1024,'Results file');
 const results=Array.isArray(body)?body:body?.results;
 if(!Array.isArray(results))throw new Error(`The results file must hold a results array. ${help}`);
 const result=await callWorkspace('agent_queue_outcomes',{workspaceId:flags.workspace,taskId:position[1],results},configuration(flags.profile));
 console.log(JSON.stringify(result.data));
}
