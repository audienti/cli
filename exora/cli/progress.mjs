import {callWorkspace,configuration} from './workspaces.mjs';
import {readJsonFile} from './json-file.mjs';
export async function progressCli(args){
 const positions=[],flags={};for(let i=0;i<args.length;i++){const arg=args[i];if(!arg.startsWith('--')){positions.push(arg);continue;}const key=arg.slice(2);if(!['profile','workspace','file','cursor','limit','revision','from','to','campaign','playbook-version','kind','user','format','owner','offer','audience','tag'].includes(key)||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(flags,key))throw new Error('Unknown or incomplete option.');flags[key]=args[++i];}
 const names={playbook:{list:'playbook_list',show:'playbook_get',save:'playbook_save',progress:'playbook_progress_get',record:'playbook_progress_record',suggest:'playbook_progress_suggest',suggestions:'playbook_suggestions_list',decide:'playbook_suggestion_decide'},analytics:{show:'workspace_analytics_get'},pipeline:{show:'workspace_pipeline_get'},connections:{list:'workspace_connections_list',register:'workspace_connection_register',report:'workspace_connection_report',disconnect:'workspace_connection_disconnect'}};
 const name=names[positions[0]]?.[positions[1]];if(!name)throw new Error('Use playbook list|show ID|save --file PATH|progress ID|record|suggest --file PATH|suggestions|decide --file PATH; analytics show --from ISO --to ISO; pipeline show; connections list|register --file PATH|report --file PATH|disconnect --file PATH.');
 if(flags.format&&(name!=='workspace_analytics_get'||!['json','csv'].includes(flags.format)))throw new Error('--format json|csv is only accepted for analytics show.');
 const fileNames=['playbook_save','playbook_progress_record','playbook_progress_suggest','workspace_connection_register','workspace_connection_report','playbook_suggestion_decide','workspace_connection_disconnect'];const withId=['playbook_get','playbook_progress_get'].includes(name);if(positions.length!==(withId?3:2))throw new Error('Unexpected arguments.');
 if(fileNames.includes(name)&&!flags.file)throw new Error('Supply a JSON request with --file PATH.');if(!fileNames.includes(name)&&flags.file)throw new Error('--file is only accepted for mutations.');
 const input=fileNames.includes(name)?readJsonFile(flags.file,65536,'Request file'):{};if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Request must be an object.');if(flags.workspace)input.workspaceId=flags.workspace;if(withId)input[name==='playbook_get'?'id':'participationId']=positions[2];
 for(const[key,value]of Object.entries(flags)){if(['workspace','profile','file','format'].includes(key))continue;const field={campaign:'campaignId','playbook-version':'pinId',user:'userId',owner:'ownerUserId',offer:'offerId',audience:'audienceId'}[key]??key;input[field]=['limit','revision'].includes(key)?Number(value):value;}
 const result=await callWorkspace(name,input,configuration(flags.profile));
 if(flags.format==='csv'){process.stdout.write(analyticsCsv(result?.data??result));return;}
 console.log(JSON.stringify(result));
}

/** Same columns as Export CSV on the Analytics page. Untracked outcome values are left blank. */
export function analyticsCsv(data){
 if(!data||!Array.isArray(data.daily)||!data.total)throw new Error('Analytics response has no daily rows.');
 const cell=value=>{const text=String(value);return /[",\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;};
 const outcome=row=>row.coverage!=='tracked'?['','','']:[row.reached,row.offRamped,row.success===null?'':`${Math.round(row.success*100)}%`];
 const lines=[['Date (UTC)','People admitted','Reached goal','Off-ramped','Success'],...data.daily.map(row=>[row.day,row.people,...outcome(row)]),['Total',data.total.people,...outcome(data.total)]];
 return lines.map(line=>line.map(cell).join(',')).join('\n')+'\n';
}
