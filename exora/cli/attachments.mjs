import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {basename,extname} from 'node:path';
import {callWorkspace,configuration} from './workspaces.mjs';
const help='Use attachments upload FILE [--type MIME] [--name NAME] [--duration SECONDS] [--workspace ID] [--profile PATH], or attachments get ATTACHMENT_ID --out PATH [--workspace ID] [--profile PATH]. An image is at most 5 MB; a voice note is at most 2 minutes and 5 MB, and its length goes in --duration.';
const TYPES={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.mp3':'audio/mpeg','.m4a':'audio/mp4','.ogg':'audio/ogg','.wav':'audio/wav'};
export async function attachmentsCli(args){
 const position=[],flags={};for(let i=1;i<args.length;i++){
  if(!args[i].startsWith('--')){position.push(args[i]);continue}
  const key=args[i].slice(2);if(key==='json')continue;if(!['profile','workspace','type','name','duration','out'].includes(key)||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(flags,key))throw new Error(`Unknown or incomplete attachments option. ${help}`);
  flags[key]=args[++i];
 }
 const config=configuration(flags.profile);
 if(position[0]==='upload'&&position.length===2){
  const file=position[1],type=flags.type??TYPES[extname(file).toLowerCase()];
  if(!type)throw new Error(`Give --type for this file. ${help}`);
  const stat=statSync(file);if(!stat.isFile()||stat.size>5*1024*1024)throw new Error('The file must be a regular file of at most 5 MB.');
  const duration=flags.duration===undefined?undefined:Number(flags.duration);
  if(duration!==undefined&&!Number.isInteger(duration))throw new Error('--duration is a whole number of seconds.');
  const result=await callWorkspace('attachment_upload',{workspaceId:flags.workspace,name:flags.name??basename(file),contentType:type,contentBase64:readFileSync(file).toString('base64'),...(duration===undefined?{}:{durationSeconds:duration})},config);
  console.log(JSON.stringify(result.data));return;
 }
 if(position[0]==='get'&&position.length===2&&flags.out){
  const result=await callWorkspace('attachment_get',{workspaceId:flags.workspace,attachmentId:position[1]},config);
  const {contentBase64,...rest}=result.data;writeFileSync(flags.out,Buffer.from(contentBase64,'base64'));
  console.log(JSON.stringify({...rest,savedTo:flags.out}));return;
 }
 throw new Error(help);
}
