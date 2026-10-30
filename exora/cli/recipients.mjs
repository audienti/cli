import { readFileSync } from 'node:fs';
import { callWorkspace, configuration } from './workspaces.mjs';
export async function recipientsCli(args) {
  const flags = {}, positions = [];
  const allowed = ['workspace','profile','status','cursor','limit','history-cursor','history-limit','file'];
  for (let i=0;i<args.length;i++) {
    const arg=args[i]; if(arg==='--json')continue;
    if(!arg.startsWith('--')){positions.push(arg);continue;}
    const key=arg.slice(2);
    if(!allowed.includes(key)||Object.hasOwn(flags,key)||args[i+1]===undefined||args[i+1].startsWith('--'))throw Error('Unknown, repeated or incomplete contact option.');
    flags[key]=args[++i];
  }
  const command=positions[2];
  if(positions[0]!=='prospects'||positions[1]!=='contacts'||!['list','get','record','retire'].includes(command)||positions.length!==(['get','retire'].includes(command)?5:4))throw Error('Use prospects contacts list|record PERSON or get|retire PERSON CONTACT --workspace ID.');
  const valid=['workspace','profile',...(command==='list'?['status','cursor','limit']:command==='get'?['history-cursor','history-limit']:['file'])];
  if(Object.keys(flags).some(k=>!valid.includes(k)))throw Error('Option does not apply to this contact command.');
  let input={};
  if(['record','retire'].includes(command)){
    if(!flags.file)throw Error('--file INPUT.json is required.');
    const raw=readFileSync(flags.file);if(raw.length>65536)throw Error('payload_too_large');
    try{input=JSON.parse(raw.toString('utf8'));}catch{throw Error('validation_error');}
    if(!input||typeof input!=='object'||Array.isArray(input)||['workspaceId','prospectId','contactId'].some(k=>Object.hasOwn(input,k)))throw Error('invalid_fields');
  }
  Object.assign(input,{workspaceId:flags.workspace,prospectId:positions[3]});
  if(['get','retire'].includes(command))input.contactId=positions[4];
  if(command==='list')Object.assign(input,{...(flags.status===undefined?{}:{status:flags.status}),...(flags.cursor===undefined?{}:{cursor:flags.cursor}),...(flags.limit===undefined?{}:{limit:Number(flags.limit)})});
  if(command==='get')input.history={...(flags['history-cursor']===undefined?{}:{cursor:flags['history-cursor']}),...(flags['history-limit']===undefined?{}:{limit:Number(flags['history-limit'])})};
  const operation={list:'workspace_prospect_contacts_list',get:'workspace_prospect_contact_read',record:'workspace_prospect_contact_record',retire:'workspace_prospect_contact_retire'}[command];
  console.log(JSON.stringify(await callWorkspace(operation,input,configuration(flags.profile))));
}
