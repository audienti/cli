import {randomUUID} from 'node:crypto';
import {callWorkspace,configuration} from './workspaces.mjs';
import {readJsonFile} from './json-file.mjs';
import {playbookUsageError,playbookCommands} from './playbook-help.mjs';
export async function progressCli(args){
 const positions=[],flags={};for(let i=0;i<args.length;i++){const arg=args[i];if(!arg.startsWith('--')){positions.push(arg);continue;}const key=arg.slice(2);if(!['profile','workspace','file','cursor','limit','revision','from','to','campaign','playbook-version','kind','user','format','owner','offer','audience','tag','archived','request-id','expected-updated-at','reason','evidence','at'].includes(key)||(key!=='archived'&&(!args[i+1]||args[i+1].startsWith('--')))||(key!=='evidence'&&Object.hasOwn(flags,key)))throw new Error(`Unknown or incomplete option --${key}.${args[0]==='playbook'?' Run audienti playbook SUBCOMMAND --help.':''}`);if(key==='evidence'){(flags.evidence??=[]).push(args[++i]);continue;}flags[key]=key==='archived'&&(!args[i+1]||args[i+1].startsWith('--'))?'true':args[++i];}
 const names={playbook:{list:'playbook_list',actions:'playbook_actions_list',show:'playbook_get',save:'playbook_save',archive:'playbook_archive',restore:'playbook_restore',draft_show:'playbook_draft_get',draft_save:'playbook_draft_save',draft_discard:'playbook_draft_discard',draft_publish:'playbook_draft_publish',delete:'playbook_delete',progress:'playbook_progress_get',record:'playbook_progress_record',event:'playbook_event_record'},analytics:{show:'workspace_analytics_get'},pipeline:{show:'workspace_pipeline_get'},connections:{list:'workspace_connections_list',register:'workspace_connection_register',report:'workspace_connection_report',disconnect:'workspace_connection_disconnect'}};
 // playbook draft show|save|discard|publish ID is one command name in two words.
 if(positions[0]==='playbook'&&positions[1]==='draft'&&['show','save','discard','publish'].includes(positions[2]))positions.splice(1,2,`draft_${positions[2]}`);
 const name=names[positions[0]]?.[positions[1]];if(!name)throw new Error(positions[0]==='playbook'?playbookUsageError:'Use analytics show --from ISO --to ISO; pipeline show; connections list|register --file PATH|report --file PATH|disconnect --file PATH.');
 if(flags.format&&(name!=='workspace_analytics_get'||!['json','csv'].includes(flags.format)))throw new Error('--format json|csv is only accepted for analytics show.');
 const fileNames=['playbook_save','playbook_draft_save','playbook_progress_record','workspace_connection_register','workspace_connection_report','workspace_connection_disconnect'];const withId=['playbook_get','playbook_progress_get','playbook_archive','playbook_restore','playbook_delete','playbook_draft_get','playbook_draft_save','playbook_draft_discard','playbook_draft_publish','playbook_event_record'].includes(name);if(positions.length!==(withId?3:2))throw new Error(positions[0]==='playbook'?`Unexpected arguments. Usage: audienti ${playbookCommands[positions[1]].usage}`:'Unexpected arguments.');
 const takesFile=fileNames.includes(name)||name==='playbook_event_record';if(fileNames.includes(name)&&!flags.file)throw new Error('Supply a JSON request with --file PATH.');if(!takesFile&&flags.file)throw new Error('--file is only accepted for mutations.');
 const input=takesFile&&flags.file?readJsonFile(flags.file,65536,'Request file'):{};if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Request must be an object.');if(flags.workspace)input.workspaceId=flags.workspace;if(withId)input[['playbook_progress_get','playbook_event_record'].includes(name)?'participationId':'id']=positions[2];
 if(flags['request-id']!==undefined&&!['playbook_draft_publish','playbook_event_record'].includes(name))throw new Error('--request-id is only accepted for playbook draft publish and playbook event.');
 if(name==='playbook_event_record')input.requestId=flags['request-id']??input.requestId??randomUUID();else if(flags.reason!==undefined||flags.evidence!==undefined||flags.at!==undefined)throw new Error('--reason, --evidence and --at are only accepted for playbook event.');
 if(flags['expected-updated-at']!==undefined&&name!=='playbook_draft_discard')throw new Error('--expected-updated-at is only accepted for playbook draft discard.');
 if(flags['expected-updated-at']!==undefined)input.expectedUpdatedAt=flags['expected-updated-at'];
 // A generated request ID is printed, so a retry of a call that may have worked can use the same one.
 if(name==='playbook_draft_publish'){input.requestId=flags['request-id']??randomUUID();if(flags['request-id']===undefined)console.error(`requestId ${input.requestId} (retry with --request-id ${input.requestId} if this call may have worked)`);}
 if(flags.archived!==undefined&&(name!=='playbook_list'||!['true','false'].includes(flags.archived)))throw new Error(name==='playbook_list'?'--archived takes true or false, or no value.':'--archived is only accepted for playbook list.');
 for(const[key,value]of Object.entries(flags)){if(['workspace','profile','file','format','request-id','expected-updated-at'].includes(key))continue;if(key==='evidence'){input.evidence=value.map(item=>{const [kind,id,...extra]=item.split(':');if(extra.length||!['observation','conversation'].includes(kind)||!id)throw new Error('--evidence takes conversation:ID or observation:ID.');return{kind,id};});continue;}if(key==='archived'){input.archived=value==='true';continue;}const field={campaign:'campaignId','playbook-version':'pinId',user:'userId',owner:'ownerUserId',offer:'offerId',audience:'audienceId'}[key]??key;input[field]=['limit','revision'].includes(key)?Number(value):value;}
 const result=await callWorkspace(name,input,configuration(flags.profile));
 if(flags.format==='csv'){process.stdout.write(analyticsCsv(result?.data??result));return;}
 console.log(JSON.stringify(result));
}

/** Daily analytics rows plus a total row. Untracked outcome values are left blank. */
export function analyticsCsv(data){
 if(!data||!Array.isArray(data.daily)||!data.total)throw new Error('Analytics response has no daily rows.');
 const cell=value=>{const text=String(value);return /[",\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;};
 const outcome=row=>row.coverage!=='tracked'?['','','']:[row.reached,row.offRamped,row.success===null?'':`${Math.round(row.success*100)}%`];
 const lines=[['Date (UTC)','People admitted','Reached goal','Off-ramped','Success'],...data.daily.map(row=>[row.day,row.people,...outcome(row)]),['Total',data.total.people,...outcome(data.total)]];
 return lines.map(line=>line.map(cell).join(',')).join('\n')+'\n';
}
