import {callWorkspace,configuration} from './workspaces.mjs';
import {readJsonFile} from './json-file.mjs';
export async function offerCli(args){
 const position=[],flags={};for(let i=0;i<args.length;i++){
  if(!args[i].startsWith('--')){position.push(args[i]);continue}
  const key=args[i].slice(2);if(!['profile','workspace','file','request-id','expected-revision','revision','archived','limit','after','q'].includes(key)||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(flags,key))throw new Error('Unknown or incomplete offer option.');
  flags[key]=args[++i];
 }
 const command=position[1],name={list:'offer_list',show:'offer_get',create:'offer_create',update:'offer_update',archive:'offer_archive',restore:'offer_restore'}[command];
 if(!name||position.length!==(['list','create'].includes(command)?2:3))throw new Error('Use offer list|show ID|create|update ID|archive ID|restore ID.');
 const input={workspaceId:flags.workspace};
 if(position[2])input.offerId=position[2];
 if(command==='list'){
  if(flags.archived!==undefined&&!['true','false'].includes(flags.archived))throw new Error('Archived must be true or false.');
  if(flags.archived!==undefined)input.archived=flags.archived==='true';
  if(flags.limit!==undefined)input.limit=Number(flags.limit);
  if(flags.after)input.after=flags.after;if(flags.q!==undefined)input.q=flags.q;
 }
 if(command==='show'&&flags.revision!==undefined)input.revision=Number(flags.revision);
 if(['create','update'].includes(command)){if(!flags.file)throw new Error('Supply --file PATH containing Offer fields.');input.fields=readJsonFile(flags.file,65536,'Offer file');}
 if(command==='create')input.requestId=flags['request-id'];
 if(command==='update')input.expectedRevision=Number(flags['expected-revision']);
 console.log(JSON.stringify(await callWorkspace(name,input,configuration(flags.profile))));
}
