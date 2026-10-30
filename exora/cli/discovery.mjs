import { callWorkspace, configuration } from './workspaces.mjs';
import { readJsonFile } from './json-file.mjs';
export async function discoveryCli(args){
 const flags={},position=[];
 const children=['profiles','observations','citations','qualifications'];
 const allowed=['profile','workspace','file','request-id','kind','search','cursor','limit',...children.flatMap(k=>[k+'-cursor',k+'-limit'])];
 for(let i=0;i<args.length;i++){if(!args[i].startsWith('--')){position.push(args[i]);continue;}const key=args[i].slice(2);if(!allowed.includes(key)||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(flags,key))throw new Error('Unknown or incomplete discovery option.');flags[key]=args[++i];}
 const command=position.slice(0,3).join(' ');
 let name,input={workspaceId:flags.workspace};
 if(position[0]==='prospects'&&position[1]==='list'&&position.length===2){name='prospect_list';for(const k of ['kind','search','cursor'])if(flags[k]!==undefined)input[k]=flags[k];if(flags.limit!==undefined)input.limit=Number(flags.limit);}
 else if(position[0]==='prospects'&&position[1]==='get'&&position.length===3){name='prospect_get';input.prospectId=position[2];for(const k of children){const cursor=flags[k+'-cursor'],limit=flags[k+'-limit'];if(cursor!==undefined||limit!==undefined)input[k]={...(cursor===undefined?{}:{cursor}),...(limit===undefined?{}:{limit:Number(limit)})};}}
 else{ name={'prospects observation create':'prospect_record_observation','prospects citation create':'prospect_record_citation','prospects evidence create':'prospect_record_evidence','experiments qualification submit':'experiment_submit_qualification'}[command];if(!name||position.length!==3||!flags.file)throw new Error('Use prospects list|get ID|observation create|citation create|evidence create, or experiments qualification submit --file INPUT.json.');input={...readJsonFile(flags.file,65536,'Discovery file'),...(flags.workspace?{workspaceId:flags.workspace}:{}),...(flags['request-id']?{requestId:flags['request-id']}:{})}; }
 console.log(JSON.stringify(await callWorkspace(name,input,configuration(flags.profile))));
}
