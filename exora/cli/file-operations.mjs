import {z} from 'zod';
const fileType=z.string().max(127).refine(t=>!/^text\/(?:html|svg[+]xml)$/i.test(t)&&(['image/jpeg','image/png','application/pdf','video/quicktime','video/mp4'].includes(t)||/^text\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(t)));
const fields={fileType,fileName:z.string().min(1).max(255)},key=z.string().min(1).max(1024);
const authority='Personal account files only. Verified human workspace:access credential required; agent credentials are rejected. No workspace selection.';
export const fileOperations={
 file_list:{schema:z.object({}).strict(),method:'GET',path:()=>'/me/files',description:`List owned file records. ${authority}`},
 file_upload_prepare:{schema:z.object(fields).strict(),method:'POST',path:()=>'/me/files/uploads',body:a=>a,description:`Prepare upload; POST returned fields and file bytes to s3UploadUrl, then register. Max5MiB, exact concrete MIME. Sensitive signed fields expire in one hour; do not persist. Signing does not upload. ${authority}`},
 file_register:{schema:z.object({...fields,s3Key:key}).strict(),method:'POST',path:()=>'/me/files',body:a=>a,description:`Register an uploaded owner-prefix object. Reuse key and metadata after an unknown response; same input replays, changed metadata conflicts. ${authority}`},
 file_download:{schema:z.object({s3Key:key}).strict(),method:'POST',path:()=>'/me/files/download',body:a=>a,description:`Get one-hour signed URL for owned file. Sensitive bearer URL: do not persist or share. ${authority}`},
 file_delete:{schema:z.object({id:z.string().uuid()}).strict(),method:'POST',path:()=>'/me/files/delete',body:a=>a,description:`Remove owned record; storage cleanup is best effort. A success does not guarantee physical deletion or revoke outstanding signed URLs. ${authority}`},
};

const maxBytes=5*1024*1024;
fileOperations.file_upload={localUpload:true,schema:z.object({...fields,contentBase64:z.string().min(4).max(4*Math.ceil(maxBytes/3)).refine(value=>/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)&&Buffer.from(value,'base64').length<=maxBytes)}).strict(),description:`Upload small files and register them, composing the same signed POST protocol as the UI. Supply base64 content, at most5MiB; prefer the CLI for large files. Trust only your configured API server: its signed response chooses the storage host. On an uncertain response use the returned recovery key with file_register, never blindly repeat file_upload. ${authority}`};
export async function uploadFileContent(input,call){
 const bytes=Buffer.from(input.contentBase64,'base64');
 const prepared=(await call('file_upload_prepare',{fileName:input.fileName,fileType:input.fileType})).data;
 const recovery={fileName:input.fileName,fileType:input.fileType,s3Key:prepared.s3Key};
 try{
  const target=new URL(prepared.s3UploadUrl);if(target.protocol!=='https:'&&!(target.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(target.hostname)))throw Error('Unsafe storage URL');
  if(target.username||target.password)throw Error('Unsafe storage URL');
  const form=new FormData();for(const [key,value] of Object.entries(prepared.s3UploadFields))form.append(key,String(value));form.append('file',new Blob([bytes],{type:input.fileType}),input.fileName);
  const response=await fetch(target,{method:'POST',body:form,redirect:'error',signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Storage rejected upload');
  return await call('file_register',recovery);
 }catch{
  const error=new Error('Upload completion is unconfirmed. Inspect owned files or retry file_register with the recovery fields. Do not repeat file_upload blindly.');
  error.toJSON=()=>({code:'file_upload_unconfirmed',message:error.message,recovery});throw error;
 }
}
