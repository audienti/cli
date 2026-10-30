import {callWorkspace,configuration} from './workspaces.mjs';
import {readJsonFile} from './json-file.mjs';
export async function progressCli(args){
 const positions=[],flags={};for(let i=0;i<args.length;i++){const arg=args[i];if(!arg.startsWith('--')){positions.push(arg);continue;}const key=arg.slice(2);if(!['profile','workspace','file','cursor','limit','revision','from','to','experiment','approach-version','kind','user'].includes(key)||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(flags,key))throw new Error('Unknown or incomplete option.');flags[key]=args[++i];}
 const names={approach:{list:'approach_list',show:'approach_get',save:'approach_save',progress:'approach_progress_get',record:'approach_progress_record'},analytics:{show:'workspace_analytics_get'},connections:{list:'workspace_connections_list',register:'workspace_connection_register',report:'workspace_connection_report'}};
 const name=names[positions[0]]?.[positions[1]];if(!name)throw new Error('Use approach list|show ID|save --file PATH|progress ID|record --file PATH; analytics show --from ISO --to ISO; connections list|register --file PATH|report --file PATH.');
 const fileNames=['approach_save','approach_progress_record','workspace_connection_register','workspace_connection_report'];const withId=['approach_get','approach_progress_get'].includes(name);if(positions.length!==(withId?3:2))throw new Error('Unexpected arguments.');
 if(fileNames.includes(name)&&!flags.file)throw new Error('Supply a JSON request with --file PATH.');if(!fileNames.includes(name)&&flags.file)throw new Error('--file is only accepted for mutations.');
 const input=fileNames.includes(name)?readJsonFile(flags.file,65536,'Request file'):{};if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Request must be an object.');if(flags.workspace)input.workspaceId=flags.workspace;if(withId)input[name==='approach_get'?'id':'participationId']=positions[2];
 for(const[key,value]of Object.entries(flags)){if(['workspace','profile','file'].includes(key))continue;const field={experiment:'experimentId','approach-version':'pinId',user:'userId'}[key]??key;input[field]=['limit','revision'].includes(key)?Number(value):value;}
 console.log(JSON.stringify(await callWorkspace(name,input,configuration(flags.profile))));
}
