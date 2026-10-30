import {approachOperations} from './approach-operations.mjs';
import {connectionRegistryOperations} from './connection-registry-operations.mjs';
import { hostedToolOperations, paidToolByName, isPaidToolOperation, paidToolResult } from './tools-operations.mjs';
import { workspaceExecutionOperations } from './work-execution-operations.mjs';
import { workFeedbackOperations } from './work-feedback-operations.mjs';
import { accountReplyOperations } from './account-reply-operations.mjs';
import { accountIntakeOperations } from './account-intake-operations.mjs';
import { recipientOperations } from './recipient-operations.mjs';
import { suppressionOperations } from './suppression-operations.mjs';
import { workOperations } from './work-operations.mjs';
import { assignmentOperations } from './assignment-operations.mjs';
import {discoveryOperations} from './discovery-operations.mjs';
import {experimentOperations} from './experiment-operations.mjs';
import {audienceOperations} from './audience-operations.mjs';
import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {offerOperations} from './offer-operations.mjs';
const uuid = z.string().uuid();
const workspace = { workspaceId: uuid.optional() };
export const operations = {
 ...approachOperations,
 ...connectionRegistryOperations,
 ...hostedToolOperations,
 ...workOperations,
 ...workspaceExecutionOperations,
 ...workFeedbackOperations,
 ...suppressionOperations,
 ...recipientOperations,
 ...accountIntakeOperations,
 ...accountReplyOperations,
 ...assignmentOperations,
 ...discoveryOperations,
 ...offerOperations,
 ...audienceOperations,
 ...experimentOperations,
 workspace_sending_settings_get: {schema:z.object({...workspace,userId:uuid.optional()}).strict(),method:'GET',path:a=>`/workspaces/${a.workspaceId}/sending-settings${a.userId?'?userId='+encodeURIComponent(a.userId):''}`,scoped:true,description:'Read workspace sending defaults, or own member effective hours, ramp and activity limits with userId. A workspace Admin may read another member. External activities remain agent-managed; these values do not authorize sending.'},
 workspace_member: {schema:z.object({...workspace,userId:uuid}).strict(),method:'GET',path:a=>`/workspaces/${a.workspaceId}/members/${a.userId}`,scoped:true},
 workspace_agent_access: { schema:z.object(workspace).strict(), method:'GET', path:a=>`/workspaces/${a.workspaceId}/agent-access`, scoped:true },
 workspace_agent_access_set: { schema:z.object({...workspace,userId:uuid,blocked:z.boolean()}).strict(), method:'POST', path:a=>`/workspaces/${a.workspaceId}/members/${a.userId}/agent-access`, body:a=>({blocked:a.blocked}), scoped:true },
 workspace_initialize: { schema: z.object({}).strict(), method: 'POST', path: () => '/workspaces/bootstrap' },
 workspace_list: { schema: z.object({}).strict(), method: 'GET', path: () => '/workspaces' },
 workspace_create: { schema: z.object({ name: z.string().trim().min(1).max(80), requestId: uuid }).strict(), method: 'POST', path: () => '/workspaces', body: a => a },
 workspace_get: { schema: z.object(workspace).strict(), method: 'GET', path: a => `/workspaces/${a.workspaceId}`, scoped: true },
 workspace_invite: { schema: z.object({ ...workspace, email: z.string().trim().email() }).strict(), method: 'POST', path: a => `/workspaces/${a.workspaceId}/invitations`, body: a => ({ email: a.email }), scoped: true },
 workspace_invitation_retry: { schema: z.object({ ...workspace, id: uuid }).strict(), method: 'POST', path: a => `/workspaces/${a.workspaceId}/invitations/${a.id}/retry`, scoped: true },
 workspace_invitation_cancel: { schema: z.object({ ...workspace, id: uuid }).strict(), method: 'POST', path: a => `/workspaces/${a.workspaceId}/invitations/${a.id}/cancel`, scoped: true },
 workspace_invitations: { schema: z.object({}).strict(), method: 'GET', path: () => '/me/invitations' },
 workspace_invitation_get: { schema: z.object({ id: uuid, generation: z.number().int().positive() }).strict(), method: 'GET', path: a => `/invitations/${a.id}?generation=${a.generation}` },
 workspace_invitation_accept: { schema: z.object({ id: uuid, generation: z.number().int().positive() }).strict(), method: 'POST', path: a => `/invitations/${a.id}/accept`, body: a => ({ generation: a.generation }) },
 workspace_select: { schema: z.object({ workspaceId: uuid }).strict(), method: 'GET', path: a => `/workspaces/${a.workspaceId}` },
};
function profilePath(path) {
 const target=resolve(path); const parent=dirname(target);
 const repo=realpathSync(fileURLToPath(new URL('..',import.meta.url)));
 const lexical=relative(repo,parent);
 if(!lexical || (!lexical.startsWith('..') && !isAbsolute(lexical))) throw new Error('Store CLI profiles outside the repository.');
 mkdirSync(parent,{recursive:true,mode:0o700});
 const realParent=realpathSync(parent);
 const rel=relative(repo,realParent);
 if (!rel || (!rel.startsWith('..') && !isAbsolute(rel))) throw new Error('Store CLI profiles outside the repository.');
 return resolve(realParent,target.slice(parent.length+1));
}
export function readProfile(path) {
 if (!path) return {};
 const target=profilePath(path);
 try {
  if(lstatSync(target).isSymbolicLink()) throw new Error("CLI profiles must not be symbolic links.");
  const stat=statSync(target);
  if ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()) throw new Error('CLI profile must be owned by you and readable only by you (chmod 600).');
  return JSON.parse(readFileSync(target,'utf8'));
 } catch(error) {if(error.code==='ENOENT') return {};throw new Error('Could not read a private CLI profile. Check ownership, permissions and JSON format.');}
}
export function writeProfile(path, profile) {
 if (!path) throw new Error('Supply --profile PATH outside the repository.');
 const target=profilePath(path); const temporary=`${target}.${process.pid}.tmp`;
 writeFileSync(temporary,JSON.stringify(profile)+'\n',{mode:0o600,flag:'wx'}); renameSync(temporary,target);
}
export function configuration(path, scope='workspace:access') {
 const profile=readProfile(path);
 const agentProfile = Boolean(profile.agent || profile.pendingAgent || profile.connectionSecret);
 return { url:agentProfile ? profile.url : process.env.AUDIENTI_API_URL ?? profile.url, token:agentProfile ? (scope === 'workspace:access' ? profile.tokens?.['workspace:read'] : undefined) : process.env.AUDIENTI_API_TOKEN ?? (scope === 'workspace:access' ? profile.tokens?.['workspace:read'] ?? profile.tokens?.[scope] : profile.tokens?.[scope]), workspaceId:profile.workspaceId, profile };
}
export function validateUrl(value) {
 let url;try {url=new URL(value);}catch{throw new Error('Set AUDIENTI_API_URL to an API URL ending with /api/v1.');}
 if(url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/,'')!=='/api/v1') throw new Error('The API URL must end with /api/v1 and contain no credentials, query or fragment.');
 if(url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw new Error('Use HTTPS for remote API hosts.');
 return url;
}
export class WorkspaceRequestError extends Error {
 constructor(status, code, message, retryAt, blockers, requestTraceId) { super(message); this.status = status; this.code = code; this.retryAt = retryAt; this.blockers = blockers; this.requestTraceId = requestTraceId; }
 toJSON() { return { ...(this.requestId ? {requestId:this.requestId,recovery:this.recovery} : {}), ...(this.requestTraceId ? {requestTraceId:this.requestTraceId} : {}), code:this.code, status:this.status, message:this.message, ...(this.retryAt ? {retryAt:this.retryAt} : {}), ...(this.blockers ? {blockers:this.blockers} : {}) }; }
}
export class HostedResponseUnknown extends Error {
 constructor(requestId, reason, requestTraceId) { super('The server response is unknown. Paid work may have started. Retry using the same requestId and principal; never generate a new ID to recover this call.'); this.requestId=requestId; this.reason=reason; this.requestTraceId=requestTraceId; }
 toJSON() { return {...(this.requestTraceId?{requestTraceId:this.requestTraceId}:{}),code:'response_unknown',requestId:this.requestId,reason:this.reason,message:this.message,recovery:'retry_same_request_id'}; }
}
export async function callWorkspace(name, args, config) {
 const operation=operations[name]; if(!operation) throw new Error('Unknown workspace operation.');
 const parsed=operation.schema.safeParse(args);if(!parsed.success) throw new Error('Invalid workspace arguments. Check IDs and required fields.');
 const input={...parsed.data};
 if(operation.scoped) { input.workspaceId ??= config.workspaceId;if(!uuid.safeParse(input.workspaceId).success) throw new Error('Select a workspace or supply --workspace ID.'); }
 const url=validateUrl(config.url); if(!config.token) throw new Error('A workspace:access token is required. Configure the environment or a private profile.');
 const target=new URL(`/api/v1${operation.path(input)}`,url);
 let response;try {response=await fetch(target,{method:operation.method,headers:{Authorization:`Bearer ${config.token}`,Accept:'application/json','Content-Type':'application/json',...((operation.traced||name.startsWith('tools_'))?{'X-Audienti-Interface':config.interface==='mcp'?'mcp':'cli'}:{})},...(['POST','PUT','PATCH'].includes(operation.method)?{body:JSON.stringify(operation.body?.(input)??{})}:{}),redirect:'error',signal:AbortSignal.timeout(operation.timeoutMs ?? 10000)});}catch(error){if(isPaidToolOperation(name))throw new HostedResponseUnknown(input.requestId,['TimeoutError','AbortError'].includes(error?.name)?'timeout':'transport_failure');throw new Error('Could not reach the API. Redirects are not followed.');}
 const headerTrace=(operation.traced||name.startsWith('tools_'))&&uuid.safeParse(response.headers.get('x-request-trace-id')).success?response.headers.get('x-request-trace-id'):undefined;
 let result;try{result=await response.json();}catch{if(isPaidToolOperation(name))throw new HostedResponseUnknown(input.requestId,'invalid_response',headerTrace);throw new Error('The API returned an invalid response.');}
 const requestTraceId=uuid.safeParse(result?.requestTraceId).success?result.requestTraceId:headerTrace;
 if(!response.ok) {
  const code = typeof result?.error?.code==='string' && /^[a-z_]+$/.test(result.error.code) ? result.error.code : 'request_failed';
  const retryAt = typeof result?.error?.retryAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(result.error.retryAt) ? result.error.retryAt : undefined;
  const blockers = code==='execution_blocked' && Array.isArray(result?.error?.blockers) && result.error.blockers.length<=28 && result.error.blockers.every(v=>typeof v==='string' && /^[a-z_]+$/.test(v)) ? result.error.blockers : undefined;
  const error = new WorkspaceRequestError(response.status, code, `Workspace request failed: ${code} (HTTP ${response.status}).${retryAt ? ` Retry after ${retryAt}.` : ''}`, retryAt, blockers, requestTraceId);
  if(isPaidToolOperation(name)){error.requestId=input.requestId;error.recovery=response.status>=500?'retry_same_request_id':'inspect_rejection';}
  throw error;
 }
 if(!result || !Object.hasOwn(result,'data')) {if(isPaidToolOperation(name))throw new HostedResponseUnknown(input.requestId,'invalid_response',requestTraceId);throw new Error('The API returned an invalid response.');}
 const paidResult = paidToolResult(name, result?.data);
 if(isPaidToolOperation(name)&&(!uuid.safeParse(paidResult?.operationId).success||paidResult.requestId!==input.requestId||!['running','succeeded','failed','uncertain','rejected'].includes(paidResult.status)))throw new HostedResponseUnknown(input.requestId,'invalid_response',requestTraceId);
 if(name==='workspace_select') config.workspaceId=input.workspaceId;
 return {data:result.data,...(requestTraceId?{requestTraceId}:{})};
}
export async function workspaceCli(args) {
 const flags={}; const position=[];
 for(let i=0;i<args.length;i++) {
  if(args[i]==='--json') continue;
  if(args[i].startsWith('--')) {const key=args[i].slice(2);if(!['profile','workspace','name','request-id','email','generation','scope','user'].includes(key)||!args[i+1]||args[i+1].startsWith('--')) throw new Error('Unknown or incomplete option.');flags[key]=args[++i];}
  else position.push(args[i]);
 }
 if(position[0]==='profile' && position[1]==='save') {
  if(!['account:read','workspace:access','agents:manage'].includes(flags.scope)) throw new Error('Specify --scope account:read, workspace:access or agents:manage.');
  const url=validateUrl(process.env.AUDIENTI_API_URL).toString().replace(/\/$/,'');const token=process.env.AUDIENTI_API_TOKEN;if(!token) throw new Error('Set AUDIENTI_API_TOKEN.');
  const profile=readProfile(flags.profile);if(profile.agent || profile.pendingAgent || profile.connectionSecret) throw new Error('Use a separate user profile; agent profiles cannot store user API tokens.');writeProfile(flags.profile,{...profile,url,tokens:{...profile.tokens,[flags.scope]:token}});console.log('Profile saved.');return;
 }
 const config=configuration(flags.profile);const command=position.slice(1).join(' ');
 let name, input={};
 if(command==='sending-settings') {name='workspace_sending_settings_get';input={workspaceId:flags.workspace,...(flags.user?{userId:flags.user}:{})};}
 else if(command==='agent-access') {name='workspace_agent_access';input={workspaceId:flags.workspace};}
 else if(['agent-access block','agent-access restore'].includes(command)) {name='workspace_agent_access_set';input={workspaceId:flags.workspace,userId:flags.user,blocked:command.endsWith('block')};}
 else if(command==='init') name='workspace_initialize';
 else if(command==='list') name='workspace_list';
 else if(command==='create') {name='workspace_create';input={name:flags.name,requestId:flags['request-id']};}
 else if(command==='show') {name='workspace_get';input={workspaceId:flags.workspace};}
 else if(command==='invite') {name='workspace_invite';input={workspaceId:flags.workspace,email:flags.email};}
 else if(command==='invitations') name='workspace_invitations';
 else if(position[1]==='member' && position.length===3) {name='workspace_member';input={workspaceId:flags.workspace,userId:position[2]};}
 else if(position[1]==='use' && position.length===3) {name='workspace_select';input={workspaceId:position[2]};}
 else if(position[1]==='invitation' && position.length===4) {
  const action=position[2];name={show:'workspace_invitation_get',accept:'workspace_invitation_accept',retry:'workspace_invitation_retry',cancel:'workspace_invitation_cancel'}[action];
  input={id:position[3],...(['retry','cancel'].includes(action)?{workspaceId:flags.workspace}:{generation:Number(flags.generation)})};
 }
 if(!name) throw new Error('Unknown workspace command. Use audienti --help.');
 const result=await callWorkspace(name,input,config);

 if(name==='workspace_select') writeProfile(flags.profile,{...config.profile,workspaceId:config.workspaceId});
 console.log(JSON.stringify(result));
}
