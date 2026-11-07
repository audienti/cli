import {callWorkspace,configuration} from './workspaces.mjs';
import {readJsonFile} from './json-file.mjs';
export async function audienceCli(args){
 const position=[],flags={};for(let i=0;i<args.length;i++){
  if(!args[i].startsWith('--')){position.push(args[i]);continue}
  const key=args[i].slice(2);
  if(key==='json'&&!Object.hasOwn(flags,key)){flags.json=true;continue}
  if(!['profile','workspace','file','request-id','expected-revision','revision','archived','limit','after','q','kind','url','audience','text'].includes(key)||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(flags,key))throw new Error('Unknown or incomplete audience option.');
  flags[key]=args[++i];
 }
 const command=position[1],name={options:'audience_options',list:'audience_list',show:'audience_get',create:'audience_create',update:'audience_update',archive:'audience_archive',restore:'audience_restore',summary:'audience_summary',people:'audience_people',companies:'audience_companies',test:'audience_prospect_test',improve:'audience_fit_check_improve'}[command];
 if(!name||position.length!==(['list','create','options','summary','improve'].includes(command)?2:3))throw new Error('Use audience options --kind KIND [--q TEXT]|list|show ID|create|update ID|archive ID|restore ID|summary|people ID|companies ID|test ID --url URL --request-id UUID [--revision N]|improve --text RULE.');
 const input={workspaceId:flags.workspace};
 if(position[2])input.audienceId=position[2];
 if(command==='options'){input.kind=flags.kind;if(flags.q!==undefined)input.q=flags.q;}
 if(command==='list'){
  if(flags.archived!==undefined&&!['true','false'].includes(flags.archived))throw new Error('Archived must be true or false.');
  if(flags.archived!==undefined)input.archived=flags.archived==='true';
  if(flags.limit!==undefined)input.limit=Number(flags.limit);
  if(flags.after)input.after=flags.after;
  if(flags.q!==undefined)input.q=flags.q;
 }
 if(command==='summary'&&flags.audience!==undefined)input.audienceId=flags.audience;
 if(command==='test'){if(!flags.url)throw new Error('Supply --url with a LinkedIn profile URL.');input.url=flags.url;input.requestId=flags['request-id'];}
 if(command==='improve'){if(!flags.text)throw new Error('Supply the smart rule with --text.');input.text=flags.text;}
 if(['show','test'].includes(command)&&flags.revision!==undefined)input.revision=Number(flags.revision);
 if(['create','update'].includes(command)){if(!flags.file)throw new Error('Supply --file PATH containing Audience fields.');input.fields=readJsonFile(flags.file,65536,'Audience file');}
 if(command==='create')input.requestId=flags['request-id'];
 if(command==='update')input.expectedRevision=Number(flags['expected-revision']);
 console.log(JSON.stringify(await callWorkspace(name,input,configuration(flags.profile))));
}
