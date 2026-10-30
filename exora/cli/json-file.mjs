import {openSync,closeSync,fstatSync,readSync,constants} from 'node:fs';
export function readJsonFile(path,limit,label){
 let fd;
 try{
  fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const stat=fstatSync(fd);if(!stat.isFile()||stat.size>limit)throw new Error();
  const buffer=Buffer.alloc(limit+1);let length=0,read=0;
  do{read=readSync(fd,buffer,length,buffer.length-length,null);length+=read;}while(read&&length<buffer.length);
  if(length>limit)throw new Error();
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,length)));
 }catch{throw new Error(`${label} must be regular, non-symlink JSON no larger than ${limit/1024} KiB.`);}
 finally{if(fd!==undefined)closeSync(fd)}
}
