import {callWorkspace,configuration} from './workspaces.mjs';
import {readJsonFile} from './json-file.mjs';
export async function experimentCli(args){
 const position=[],flags={};for(let i=0;i<args.length;i++){
  if(!args[i].startsWith('--')){position.push(args[i]);continue}
  const key=args[i].slice(2);if(!['profile','workspace','file','request-id','expected-revision','revision','archived','limit','after','q','state','operation','expected-state','reason'].includes(key)||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(flags,key))throw new Error('Unknown or incomplete experiment option.');
  flags[key]=args[++i];
 }
 const command=position[1],name={list:'experiment_list',show:'experiment_get',create:'experiment_create',update:'experiment_update',transition:'experiment_transition',successor:'experiment_successor',events:'experiment_events'}[command];
 if(!name||position.length!==(['list','create'].includes(command)?2:3))throw new Error('Use experiment list|show ID|create|update ID|transition ID|successor ID|events ID.');
 const input={workspaceId:flags.workspace};
 if(position[2])input.experimentId=position[2];
 if(['list','events'].includes(command)){
  if(flags.archived!==undefined&&!['true','false'].includes(flags.archived))throw new Error('Archived must be true or false.');
  if(flags.archived!==undefined)input.archived=flags.archived==='true';
  if(flags.limit!==undefined)input.limit=Number(flags.limit);
  if(flags.after)input.after=flags.after;
  if(flags.q!==undefined)input.q=flags.q;if(flags.state!==undefined)input.state=flags.state;
 }
 if(command==='show'&&flags.revision!==undefined)input.revision=Number(flags.revision);
 if(['create','update','successor'].includes(command)){if(!flags.file)throw new Error('Supply --file PATH containing Experiment fields.');input.fields=readJsonFile(flags.file,65536,'Experiment file');}
 if(['create','successor'].includes(command))input.requestId=flags['request-id'];
 if(['update','successor'].includes(command))input.expectedRevision=Number(flags['expected-revision']);
 if(command==='transition'){input.operation=flags.operation;input.expectedState=flags['expected-state'];if(flags.reason!==undefined)input.reason=flags.reason;}
 console.log(JSON.stringify(await callWorkspace(name,input,configuration(flags.profile))));
}
