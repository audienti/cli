import {callWorkspace,configuration} from './workspaces.mjs';
import {readJsonFile} from './json-file.mjs';
export async function campaignCli(args){
 const position=[],flags={};for(let i=0;i<args.length;i++){
  if(!args[i].startsWith('--')){position.push(args[i]);continue}
  const key=args[i].slice(2);if(!['profile','workspace','file','request-id','expected-revision','revision','archived','limit','after','q','state','operation','expected-state','reason','per-day','count','max-credits','url','add','remove','set','source-url','source-kind','source-industry','source-location','source-note'].includes(key)||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(flags,key))throw new Error('Unknown or incomplete campaign option.');
  flags[key]=args[++i];
 }
 const command=position[1];
 if(command==='find'){
  if(position.length!==3)throw new Error('Use campaign find ID --count N --max-credits C.');
  if(!/^\d{1,3}$/.test(flags.count??'')||Number(flags.count)<1||Number(flags.count)>500)throw new Error('Set --count to how many fits to find, from 1 to 500.');
  if(flags['max-credits']===undefined)throw new Error('Set --max-credits to the most credits this run may spend.');
  const {findCampaignProspects,parseCredits}=await import('./campaign-find.mjs');
  const config=configuration(flags.profile);
  const report=await findCampaignProspects((operation,input)=>callWorkspace(operation,input,config),{workspaceId:flags.workspace,campaignId:position[2],count:Number(flags.count),maxCredits:parseCredits(flags['max-credits'])},{progress:step=>console.error(JSON.stringify(step))});
  console.log(JSON.stringify({data:report}));return;
 }
 if(command==='check'){
  if(position.length!==3||!flags.url)throw new Error('Use campaign check ID --url LINKEDIN_URL [--request-id UUID] [--source-url URL [--source-kind website|register|other] --source-industry TEXT [--source-location TEXT] [--source-note TEXT]].');
  const sourceFlags=['source-url','source-kind','source-industry','source-location','source-note'].filter(key=>flags[key]!==undefined);
  const missing=[['source-url','--source-url URL'],['source-industry','--source-industry TEXT']].filter(([key])=>flags[key]===undefined).map(([,text])=>text);
  if(sourceFlags.length&&missing.length)throw new Error(`A company source needs its web address and the industry it states. Add ${missing.join(' and ')}.`);
  const companySource=sourceFlags.length?{kind:String(flags['source-kind']??'website').toLowerCase(),url:flags['source-url'],industry:flags['source-industry'],...(flags['source-location']!==undefined?{location:flags['source-location']}:{}),...(flags['source-note']!==undefined?{note:flags['source-note']}:{})}:undefined;
  const {randomUUID}=await import('node:crypto');
  console.log(JSON.stringify(await callWorkspace('campaign_prospect_check',{workspaceId:flags.workspace,campaignId:position[2],url:flags.url,requestId:flags['request-id']??randomUUID(),...(companySource?{companySource}:{})},configuration(flags.profile))));return;
 }
 if(command==='targets'){
  if(position.length!==3)throw new Error('Use campaign targets ID [--add a.com,b.com] [--remove a.com] [--set FILE|-] [--expected-revision N].');
  const config=configuration(flags.profile),input={workspaceId:flags.workspace,campaignId:position[2]};
  const change=['add','remove','set'].some(k=>flags[k]!==undefined);
  if(!change){if(flags.limit!==undefined)input.limit=Number(flags.limit);if(flags.after)input.after=flags.after;console.log(JSON.stringify(await callWorkspace('campaign_targets_get',input,config)));return;}
  if(flags.set!==undefined&&(flags.add!==undefined||flags.remove!==undefined))throw new Error('Use --set on its own, or --add and --remove.');
  const split=v=>v.split(',').map(x=>x.trim()).filter(Boolean);
  if(flags.add!==undefined)input.add=split(flags.add);
  if(flags.remove!==undefined)input.remove=split(flags.remove);
  if(flags.set!==undefined){const {readFileSync}=await import('node:fs');input.set=readFileSync(flags.set==='-'?0:flags.set,'utf8').split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));}
  input.expectedRevision=flags['expected-revision']!==undefined?Number(flags['expected-revision']):(await callWorkspace('campaign_targets_get',{workspaceId:flags.workspace,campaignId:position[2],limit:1},config)).data.revision;
  console.log(JSON.stringify(await callWorkspace('campaign_targets_change',input,config)));return;
 }
 if(command==='use-audience'){
  if(position.length!==3)throw new Error('Use campaign use-audience ID [--expected-revision N].');
  const config=configuration(flags.profile);
  const expectedRevision=flags['expected-revision']!==undefined?Number(flags['expected-revision']):(await callWorkspace('campaign_get',{workspaceId:flags.workspace,campaignId:position[2]},config)).data.campaign.currentRevision;
  console.log(JSON.stringify(await callWorkspace('campaign_audience_use',{workspaceId:flags.workspace,campaignId:position[2],expectedRevision},config)));return;
 }
 if(command==='summary'){
  if(position.length!==2)throw new Error('Use campaign summary [--workspace ID].');
  console.log(JSON.stringify(await callWorkspace('campaign_summary',{workspaceId:flags.workspace},configuration(flags.profile))));return;
 }
 const name={list:'campaign_list',show:'campaign_get',create:'campaign_create',update:'campaign_update',transition:'campaign_transition',successor:'campaign_successor',events:'campaign_events',pace:flags['per-day']===undefined&&flags['max-credits']===undefined?'campaign_pace_get':'campaign_pace_set'}[command];
 if(!name||position.length!==(['list','create'].includes(command)?2:3))throw new Error('Use campaign list|summary|show ID|create|update ID|transition ID|successor ID|events ID|pace ID [--per-day N|derived] [--max-credits C|none]|find ID --count N --max-credits C|check ID --url URL|targets ID [--add|--remove|--set]|use-audience ID.');
 if(flags['per-day']!==undefined&&command!=='pace')throw new Error('Set the pace with campaign pace ID --per-day N|derived, after the campaign is saved.');
 const input={workspaceId:flags.workspace};
 if(position[2])input.campaignId=position[2];
 if(['list','events'].includes(command)){
  if(flags.archived!==undefined&&!['true','false'].includes(flags.archived))throw new Error('Archived must be true or false.');
  if(flags.archived!==undefined)input.archived=flags.archived==='true';
  if(flags.limit!==undefined)input.limit=Number(flags.limit);
  if(flags.after)input.after=flags.after;
  if(flags.q!==undefined)input.q=flags.q;if(flags.state!==undefined)input.state=flags.state;
 }
 if(command==='show'&&flags.revision!==undefined)input.revision=Number(flags.revision);
 if(['create','update','successor'].includes(command)){if(!flags.file)throw new Error('Supply --file PATH containing Campaign fields.');input.fields=readJsonFile(flags.file,65536,'Campaign file');}
 if(['create','successor'].includes(command))input.requestId=flags['request-id'];
 if(['update','successor'].includes(command))input.expectedRevision=Number(flags['expected-revision']);
 if(command==='transition'){input.operation=flags.operation;input.expectedState=flags['expected-state'];if(flags.reason!==undefined)input.reason=flags.reason;}
 if(command==='pace'&&flags['per-day']!==undefined){const v=flags['per-day'];if(v!=='derived'&&!/^\d+$/.test(v))throw new Error('Pace must be a whole number of people a day, or derived.');input.perDay=v==='derived'?v:Number(v);}
 if(command==='pace'&&flags['max-credits']!==undefined){const v=flags['max-credits'];if(v!=='none'&&!/^\d+$/.test(v))throw new Error('The credit cap must be a whole number of credits a day, or none.');input.maxCredits=v==='none'?null:Number(v);}
 console.log(JSON.stringify(await callWorkspace(name,input,configuration(flags.profile))));
}
