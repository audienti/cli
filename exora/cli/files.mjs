import {readFileSync,statSync} from 'node:fs';
import {basename} from 'node:path';
import {callWorkspace,configuration} from './workspaces.mjs';
export async function fileCli(args){
 const position=[],flags={};for(let i=0;i<args.length;i++){if(!args[i].startsWith('--')){position.push(args[i]);continue;}const key=args[i].slice(2);if(key==='json')continue;if(!['profile','name','type','key'].includes(key)||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(flags,key))throw Error('Unknown or incomplete file option.');flags[key]=args[++i];}
 const command=position[1],name={list:'file_list',upload:'file_upload',prepare:'file_upload_prepare',register:'file_register',download:'file_download',delete:'file_delete'}[command];
 if(!name||position.length!==(['delete','upload'].includes(command)?3:2))throw Error('Use file upload PATH --type MIME|list|prepare --name NAME --type MIME|register --key KEY --name NAME --type MIME|download --key KEY|delete ID.');
 if(command==='upload'){
  const path=position[2],stat=statSync(path);if(!stat.isFile()||stat.size===0||stat.size>5*1024*1024)throw Error('Select a non-empty file up to5MiB.');
  const contentBase64=readFileSync(path).toString('base64');console.log(JSON.stringify(await callWorkspace(name,{fileName:flags.name??basename(path),fileType:flags.type,contentBase64},configuration(flags.profile))));return;
 }
 const input=command==='list'?{}:command==='delete'?{id:position[2]}:command==='download'?{s3Key:flags.key}:{fileName:flags.name,fileType:flags.type,...(command==='register'?{s3Key:flags.key}:{})};
 console.log(JSON.stringify(await callWorkspace(name,input,configuration(flags.profile))));
}
