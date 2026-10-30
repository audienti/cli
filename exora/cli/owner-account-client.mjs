import { configuration,validateUrl,WorkspaceRequestError } from './workspaces.mjs';
export async function callOwnerAccountOperation(operation,args,profilePath=process.env.AUDIENTI_PROFILE,label='prospecting settings') {
 const parsed=operation?.schema.safeParse(args);
 if(!parsed?.success)throw Error(`Invalid ${label} command or fields.`);
 const config=configuration(profilePath,'agents:manage'),profile=config.profile;
 if(profile.pendingAgent||(!profile.agent&&profile.connectionSecret))throw Error('Finish connecting the agent before reading settings.');
 if(profile.agent){
  if(operation.ownerOnly)throw new WorkspaceRequestError(403,'forbidden','Only a human owner profile can change settings or read history.');
  config.url=profile.url;config.token=profile.tokens?.['workspace:read'];
  if(!/^agt_[A-Za-z0-9_-]{43}$/.test(config.token??''))throw Error('A current agent credential is required.');
 }
 if(!config.token)throw Error('Configure an agents:manage user token or an active agent profile.');
 const url=validateUrl(config.url);let response;
 try{response=await fetch(new URL('/api/v1'+operation.path(parsed.data),url),{method:operation.method,headers:{Authorization:`Bearer ${config.token}`,Accept:'application/json','Content-Type':'application/json'},...(operation.method==='POST'?{body:JSON.stringify(operation.body?operation.body(parsed.data):parsed.data)}:{}),redirect:'error',signal:AbortSignal.timeout(10000)});}catch{throw Error('Could not reach the API. Redirects are not followed.');}
 let result;try{result=await response.json();}catch{throw Error('The API returned an invalid response.');}
 if(!response.ok){const code=typeof result?.error?.code==='string'&&/^[a-z_]+$/.test(result.error.code)?result.error.code:'request_failed';throw new WorkspaceRequestError(response.status,code,`${label} request failed: ${code} (HTTP ${response.status}).`);}
 if(!result||!Object.hasOwn(result,'data'))throw Error('The API returned an invalid response.');return result;
}
