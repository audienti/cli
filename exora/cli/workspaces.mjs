import {randomUUID} from 'node:crypto';
import {notificationOperations} from './notification-operations.mjs';
import {roomsOperations} from './rooms-operations.mjs';
import {queueOperations} from './queue-operations.mjs';
import {handTaskOperations} from './hand-task-operations.mjs';
import {kvOperations} from './kv-operations.mjs';
import {outcomeOperations} from './outcome-operations.mjs';
import {attachmentOperations} from './attachment-operations.mjs';
import {questionOperations} from './question-operations.mjs';
import {searchOperations} from './search-operations.mjs';
import {fileOperations,uploadFileContent} from './file-operations.mjs';
import {playbookOperations} from './playbook-operations.mjs';
import {connectionRegistryOperations} from './connection-registry-operations.mjs';
import { budgetOperations } from './budget-operations.mjs';
import { secretOperations } from './secret-operations.mjs';
import { hostedToolOperations, paidToolByName, isPaidToolOperation, paidToolResult } from './tools-operations.mjs';
import { workspaceExecutionOperations, managedAccountOperations } from './work-execution-operations.mjs';
import { workFeedbackOperations } from './work-feedback-operations.mjs';
import { accountReplyOperations } from './account-reply-operations.mjs';
import { accountIntakeOperations } from './account-intake-operations.mjs';
import { recipientOperations } from './recipient-operations.mjs';
import { suppressionOperations } from './suppression-operations.mjs';
import { duplicateOperations } from './duplicate-operations.mjs';
import { guardrailsOperations } from './guardrails-operations.mjs';
import { auditOperations } from './audit-operations.mjs';
import { intentOperations } from './intent-operations.mjs';
import { decisionOperations } from './decision-operations.mjs';
import { usageOperations } from './usage-operations.mjs';
import { outboundOperations } from './outbound-operations.mjs';
import { cohortOperations } from './cohort-operations.mjs';
import { workOperations } from './work-operations.mjs';
import { assignmentOperations } from './assignment-operations.mjs';
import {discoveryOperations} from './discovery-operations.mjs';
import {campaignOperations} from './campaign-operations.mjs';
import {audienceOperations} from './audience-operations.mjs';
import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {offerOperations} from './offer-operations.mjs';
import {readJsonFile} from './json-file.mjs';
const uuid = z.string().uuid();
const workspace = { workspaceId: uuid.optional() };
export const operations = {
 ...searchOperations,
 ...notificationOperations,
 ...roomsOperations,
 ...queueOperations,
 ...handTaskOperations,
 ...kvOperations,
 ...outcomeOperations,
 ...attachmentOperations,
 ...questionOperations,
 ...fileOperations,
 ...playbookOperations,
 ...connectionRegistryOperations,
 ...budgetOperations,
 ...secretOperations,
 ...hostedToolOperations,
 ...workOperations,
 ...workspaceExecutionOperations,
 ...managedAccountOperations,
 ...workFeedbackOperations,
 ...suppressionOperations,
 ...duplicateOperations,
 ...guardrailsOperations,
 ...auditOperations,
 ...intentOperations,
 ...decisionOperations,
 ...usageOperations,
 ...outboundOperations,
 ...cohortOperations,
 ...recipientOperations,
 ...accountIntakeOperations,
 ...accountReplyOperations,
 ...assignmentOperations,
 ...discoveryOperations,
 ...offerOperations,
 ...audienceOperations,
 ...campaignOperations,
 workspace_sending_settings_get: {schema:z.object({...workspace,userId:uuid.optional()}).strict(),method:'GET',path:a=>`/workspaces/${a.workspaceId}/sending-settings${a.userId?'?userId='+encodeURIComponent(a.userId):''}`,scoped:true,description:'Read workspace sending defaults, or own member effective hours, ramp and activity limits with userId. A workspace Admin may read another member. External activities remain agent-managed; these values do not authorize sending.'},
 workspace_sending_settings_save: {schema:z.object({...workspace,userId:uuid.optional(),expectedVersion:z.number().int().nonnegative(),expectedDefaultsVersion:z.number().int().nonnegative().optional(),requestId:uuid,reason:z.string().trim().min(1).max(2000),schedule:z.unknown(),limits:z.unknown(),rampPercent:z.union([z.literal(25),z.literal(50),z.literal(75),z.literal(100)]).optional(),raiseEachMonday:z.boolean().optional()}).strict(),method:'POST',path:a=>`/workspaces/${a.workspaceId}/sending-settings`,body:({workspaceId,...a})=>a,scoped:true,description:'Save workspace sending defaults, or one member\'s hours, limits and ramp with userId. People only: agent credentials are refused. Send expectedVersion from the last read; a stale version is rejected. A reason is recorded with the change.'},
 workspace_usage_summary: {schema:z.object(workspace).strict(),method:'GET',path:a=>`/workspaces/${a.workspaceId}/usage/summary`,scoped:true,description:'Paid tool use for the last 30 days, per tool: operations, cache hits, charged amount (pico USD), pending and expired. Same figures as Settings > Usage.'},
 workspace_usage_callers: {schema:z.object(workspace).strict(),method:'GET',path:a=>`/workspaces/${a.workspaceId}/usage/callers`,scoped:true,description:'People, agents and API keys that have called paid tools in this workspace, for filtering usage calls.'},
 workspace_usage_calls: {schema:z.object({...workspace,after:uuid.optional(),caller:z.string().regex(/^(key|agent|user):[0-9a-f-]{36}$/i).optional(),status:z.enum(['all','succeeded','failed','pending']).optional()}).strict(),method:'GET',path:a=>`/workspaces/${a.workspaceId}/usage/calls?${new URLSearchParams(Object.entries(a).filter(([k,v])=>k!=='workspaceId'&&v!==undefined).map(([k,v])=>[k,String(v)]))}`,scoped:true,description:'Paid tool calls, newest first, 50 per page, with counts by status. Filter by caller (user:ID, agent:ID or key:ID) and status.'},
 workspace_usage_call: {schema:z.object({...workspace,callId:uuid}).strict(),method:'GET',path:a=>`/workspaces/${a.workspaceId}/usage/calls/${a.callId}`,scoped:true,description:'One paid tool call with its request, response and saved result while the payload is kept.'},
 workspace_member: {schema:z.object({...workspace,userId:uuid}).strict(),method:'GET',path:a=>`/workspaces/${a.workspaceId}/members/${a.userId}`,scoped:true},
 workspace_agent_access: { schema:z.object(workspace).strict(), method:'GET', path:a=>`/workspaces/${a.workspaceId}/agent-access`, scoped:true },
 workspace_agent_access_set: { schema:z.object({...workspace,userId:uuid,blocked:z.boolean()}).strict(), method:'POST', path:a=>`/workspaces/${a.workspaceId}/members/${a.userId}/agent-access`, body:a=>({blocked:a.blocked}), scoped:true },
 token_show: { schema: z.object({}).strict(), method: 'GET', path: () => '/token', description: 'Say what the credential you are using can do: its permission and whether it can change things. Works with any valid user API token or agent credential. A read-only token (workspace:read) is refused on every change; ask your user for a workspace:access token to change things.' },
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
 workspace_invitation_decline: { schema: z.object({ id: uuid, generation: z.number().int().positive() }).strict(), method: 'POST', path: a => `/invitations/${a.id}/decline`, body: a => ({ generation: a.generation }) },
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
/** The profile path: --profile wins, then AUDIENTI_PROFILE (the variable the MCP server reads), else none (#448). */
export const profileFrom = flag => flag ?? (process.env.AUDIENTI_PROFILE || undefined);
// The server words a next step with CLI commands. An MCP caller has tools, not commands, so the same step is said with the tool names (#507).
const MCP_WORDING = [['audienti playbook actions','playbook_actions_list'],['playbook draft show','playbook_draft_get'],['playbook draft save','playbook_draft_save'],['playbook draft discard','playbook_draft_discard'],['playbook draft publish','playbook_draft_publish'],['playbook rules show','playbook_rules_get'],['playbook rules save','playbook_rules_save'],['playbook show','playbook_get'],['playbook save','playbook_save'],['audienti playbook save --help','the playbook_save tool description'],['--workspace ID','workspaceId']];
export const surfaceWording = (text, config) => config?.interface === 'mcp' && typeof text === 'string' ? MCP_WORDING.reduce((out, [cli, tool]) => out.replaceAll(cli, tool), text) : text;
export const profileHint = 'Pass --profile PATH, or set AUDIENTI_PROFILE to the profile file.';
export function configuration(path, scope='workspace:access') {
 path=profileFrom(path);
 const profile=readProfile(path);
 const agentProfile = Boolean(profile.agent || profile.pendingAgent || profile.connectionSecret);
 return { url:agentProfile ? profile.url : process.env.AUDIENTI_API_URL ?? profile.url, token:agentProfile ? (scope === 'workspace:access' ? profile.tokens?.['workspace:read'] : undefined) : process.env.AUDIENTI_API_TOKEN ?? (scope === 'workspace:access' ? profile.tokens?.['workspace:access'] ?? profile.tokens?.['workspace:read'] : profile.tokens?.[scope]), workspaceId:profile.workspaceId, profile };
}
export function validateUrl(value) {
 let url;try {url=new URL(value);}catch{throw new Error('Set AUDIENTI_API_URL to an API URL ending with /api/v1.');}
 if(url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/,'')!=='/api/v1') throw new Error('The API URL must end with /api/v1 and contain no credentials, query or fragment.');
 if(url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw new Error('Use HTTPS for remote API hosts.');
 return url;
}
// A refused request that never left this machine. It prints like an API error, so a caller reads one format (#451).
export class InvalidArguments extends Error {
 constructor(message, guidance = {}) { super(message); this.field = guidance.field; this.allowed = guidance.allowed; this.next = guidance.next; }
 toJSON() { return {code:'invalid_arguments',message:this.message,...(this.field ? {field:this.field} : {}),...(this.allowed ? {allowed:this.allowed} : {}),...(this.next ? {next:this.next} : {})}; }
}
// The same field, allowed values and next step the server gives (#483), for a mistake the CLI refuses before sending.
const pathText = path => path.reduce((text, part) => typeof part === 'number' ? `${text}[${part}]` : text ? `${text}.${part}` : String(part), '');
const FIELD_RULES = 'audienti skills read playbook-design references/fields.md';
const WORKSPACE_ID_EXAMPLE = '3f2b8c1e-5d4a-4e7b-9a60-1c2d3e4f5a6b';
export function localGuidance(name, issues, args) {
 const issue = issues[0]; if(!issue) return {};
 const playbook = name.startsWith('playbook_');
 const path = issue.code === 'unrecognized_keys' ? [...issue.path, issue.keys?.[0] ?? ''] : issue.path;
 const fieldText = pathText(path).slice(0, 200), field = /^[A-Za-z0-9_.[\]-]+$/.test(fieldText) ? fieldText : undefined, last = String(path[path.length - 1] ?? '');
 const given = path.reduce((value, part) => value?.[part], args);
 const shown = typeof given === 'string' ? `"${given.slice(0, 60)}"` : 'that value';
 if(issue.code === 'invalid_value') {
  const allowed = issue.values.filter(value => typeof value === 'string' && value.length <= 80).slice(0, 60);
  const phone = playbook && last === 'channel' ? ' A phone call, voicemail or gift is a Custom step: use channel Custom and write in its instructions what the person does by hand. Your agent prepares the script or text and the person records the outcome.' : '';
  const more = playbook && last === 'actionId' ? ' List every action id with its channel: audienti playbook actions.' : playbook && last === 'when' ? ' List the event names: audienti playbook actions.' : '';
  return {field, ...(allowed.length ? {allowed} : {}), next: `Use one of the allowed values in place of ${shown}.${phone}${more}`};
 }
 if(issue.code === 'invalid_union' && issue.discriminator && Array.isArray(issue.options)) {
  const allowed = issue.options.filter(value => typeof value === 'string' && value.length <= 80).slice(0, 60);
  return {field, ...(allowed.length ? {allowed} : {}), next: `Use one of the allowed values in place of ${shown}, spelled exactly.${playbook ? ` Field rules: ${FIELD_RULES}` : ''}`};
 }
 if(issue.code === 'unrecognized_keys') return {field, next: `Remove ${issue.keys.map(key => `"${key}"`).join(', ')} or fix the spelling. ${playbook ? `The fields a playbook has are in the example of: audienti playbook save --help. Field rules: ${FIELD_RULES}` : 'Run audienti --help for the options of this command.'}`};
 if(issue.code === 'invalid_type' && given === undefined && last === 'expectedUpdatedAt') return {field, next: 'Add expectedUpdatedAt (null when there is no draft; otherwise the updatedAt that playbook draft show returned).'};
 if(issue.code === 'invalid_type') return {field, next: given === undefined ? `Add ${last || 'the value'}.${playbook ? ` Field rules: ${FIELD_RULES}` : ''}` : `Send a ${issue.expected} for ${last || field}.${playbook ? ` Field rules: ${FIELD_RULES}` : ''}`};
 if(last === 'workspaceId' && issue.code === 'invalid_format') return {field, next: `Use the Workspace ID from Settings > Workspace in the app. It is a UUID like ${WORKSPACE_ID_EXAMPLE}. Or run audienti workspace list.`};
 return field ? {field, next: `Fix this value and send the command again.${playbook ? ` Field rules: ${FIELD_RULES}` : ''}`} : {};
}
// The next step an error gives an agent (#483): one sentence, the path of the wrong value and the values that would have worked.
// Checked here too, so a response never puts the token or control text into the agent's context.
// #519: a refused label already says in plain words what is wrong; the code and the next step travel beside it.
// Refusals of the decision calls (#522). Their messages tell the person what to do next, so the CLI shows them.
const DECISION_REFUSALS = new Set(['agent_required', 'human_only', 'not_assigned_owner', 'participation_ended', 'decision_not_found', 'decision_closed', 'decision_superseded', 'already_decided', 'option_not_allowed', 'option_count', 'duplicate_option', 'analysis_required', 'analysis_too_long', 'analysis_not_plain', 'workspace_not_found']);
const INTENT_REFUSALS = new Set(['human_only', 'label_event_not_found', 'label_not_in_force', 'no_change', 'original_has_no_message', 'company_stop', 'bounce_not_correctable', 'correction_needs_one_change', 'prospect_not_found', 'conversation_evidence_not_found', 'participation_not_found', 'payload_too_large', 'idempotency_conflict', 'evidence_has_no_body', 'too_many_labels', 'unknown_label', 'already_recorded', 'label_not_available', 'label_direction', 'label_channel', 'duplicate_label', 'must_stand_alone', 'labels_conflict', 'result_required', 'result_mismatch', 'quote_required', 'quote_not_in_message', 'reason_required', 'reason_not_plain', 'detail_not_allowed']);
export function errorGuidance(error, token, config) {
 const clean = text => typeof text === 'string' && !/[\u0000-\u001f\u007f]/.test(text) && !(token && text.includes(token));
 return {
  next: clean(error?.next) && error.next.length <= 600 ? surfaceWording(error.next, config) : undefined,
  field: clean(error?.field) && /^[A-Za-z0-9_.[\]-]{1,200}$/.test(error.field) ? error.field : undefined,
  allowed: Array.isArray(error?.allowed) && error.allowed.length > 0 && error.allowed.length <= 60 && error.allowed.every(value => clean(value) && value.length <= 80) ? error.allowed : undefined
 };
}
export class WorkspaceRequestError extends Error {
 constructor(status, code, message, retryAt, blockers, requestTraceId, guidance = {}) { super(message); this.status = status; this.code = code; this.retryAt = retryAt; this.blockers = blockers; this.requestTraceId = requestTraceId; this.next = guidance.next; this.field = guidance.field; this.allowed = guidance.allowed; }
 toJSON() { return { ...(this.requestId ? {requestId:this.requestId,recovery:this.recovery} : {}), ...(this.requestTraceId ? {requestTraceId:this.requestTraceId} : {}), code:this.code, status:this.status, message:this.message, ...(this.field ? {field:this.field} : {}), ...(this.allowed ? {allowed:this.allowed} : {}), ...(this.next ? {next:this.next} : {}), ...(this.currentRevision!==undefined ? {currentRevision:this.currentRevision} : {}), ...(this.currentUpdatedAt!==undefined ? {currentUpdatedAt:this.currentUpdatedAt} : {}), ...(this.campaigns ? {campaigns:this.campaigns,campaignCount:this.campaignCount} : {}), ...(this.retryAt ? {retryAt:this.retryAt} : {}), ...(this.blockers ? {blockers:this.blockers} : {}), ...(this.errors ? {errors:this.errors} : {}), ...(this.charged ? {charged:this.charged} : {}) }; }
}
export class HostedResponseUnknown extends Error {
 constructor(requestId, reason, requestTraceId) { super('The server response is unknown. Paid work may have started. Retry using the same requestId and principal; never generate a new ID to recover this call.'); this.requestId=requestId; this.reason=reason; this.requestTraceId=requestTraceId; }
 toJSON() { return {...(this.requestTraceId?{requestTraceId:this.requestTraceId}:{}),code:'response_unknown',requestId:this.requestId,reason:this.reason,message:this.message,recovery:'retry_same_request_id'}; }
}
export async function callWorkspace(name, args, config) {
 const operation=operations[name]; if(!operation) throw new Error('Unknown workspace operation.');
 const parsed=operation.schema.safeParse(args);if(!parsed.success) throw new InvalidArguments(`Invalid workspace arguments. Check IDs and required fields: ${parsed.error.issues.slice(0,5).map(i=>`${i.path.join('.')||'input'}: ${i.message}`).join('; ')}.`,localGuidance(name,parsed.error.issues,args));
 const input={...parsed.data};
 if(operation.localUpload)return uploadFileContent(input,(operationName,fields)=>callWorkspace(operationName,fields,config));
 // #333: an agent's own queue covers all its workspaces; a user's reads the selected workspace, as before.
 if(operation.scoped || (operation.agentWide && !/^agt_/.test(config.token ?? ''))) { input.workspaceId ??= config.workspaceId;if(!uuid.safeParse(input.workspaceId).success) throw new Error(config.interface==='mcp'?`Pass workspaceId in the tool input, or call workspace_select once. Find the ID in Settings > Workspace (the Workspace ID row), or call workspace_list. ${config.profile&&Object.keys(config.profile).length?'':profileHint}`.trim():`Select a workspace or supply --workspace ID. Find the ID in Settings > Workspace (the Workspace ID row), or run workspace list. ${config.profile&&Object.keys(config.profile).length?'Run workspace use WORKSPACE_ID once for this profile.':`${profileHint}${/^aud_/.test(config.token ?? '') ? '' : ' An agent that is not connected yet runs agent connect first; then run workspace use WORKSPACE_ID once.'}`}`); }
 const url=validateUrl(config.url); if(!config.token) throw new Error(`A workspace token is required: workspace:access to read and change, or workspace:read to only read. ${profileHint} Or set AUDIENTI_API_URL and AUDIENTI_API_TOKEN.`);
 const target=new URL(`/api/v1${operation.path(input)}`,url);
 let response;try {response=await fetch(target,{method:operation.method,headers:{Authorization:`Bearer ${config.token}`,Accept:'application/json','Content-Type':'application/json',...((operation.traced||name.startsWith('tools_'))?{'X-Audienti-Interface':config.interface==='mcp'?'mcp':'cli'}:{})},...(['POST','PUT','PATCH'].includes(operation.method)?{body:JSON.stringify(operation.body?.(input)??{})}:{}),redirect:'error',signal:AbortSignal.timeout(operation.timeoutMs ?? 10000)});}catch(error){if(isPaidToolOperation(name,input)||operation.recoverable)throw new HostedResponseUnknown(input.requestId,['TimeoutError','AbortError'].includes(error?.name)?'timeout':'transport_failure');throw new Error('Could not reach the API. Redirects are not followed.');}
 const headerTrace=(operation.traced||name.startsWith('tools_'))&&uuid.safeParse(response.headers.get('x-request-trace-id')).success?response.headers.get('x-request-trace-id'):undefined;
 let result;try{result=await response.json();}catch{if(isPaidToolOperation(name,input)||operation.recoverable)throw new HostedResponseUnknown(input.requestId,'invalid_response',headerTrace);throw new Error('The API returned an invalid response.');}
 const requestTraceId=uuid.safeParse(result?.requestTraceId).success?result.requestTraceId:headerTrace;
 if(!response.ok) {
  const code = typeof result?.error?.code==='string' && /^[a-z_]+$/.test(result.error.code) ? result.error.code : 'request_failed';
  const retryAt = typeof result?.error?.retryAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(result.error.retryAt) ? result.error.retryAt : undefined;
  const detail = (INTENT_REFUSALS.has(code) || (name.startsWith('decision_') && DECISION_REFUSALS.has(code)) || (response.status===400 && (code==='invalid_fields' || code==='validation_error' || code==='secret_rejected')) || (response.status===403 && ((code==='insufficient_scope' && /^(This API token can read but not change|This command is for an agent, and this API token is read-only)\./.test(result?.error?.message ?? '')) || code==='agent_required')) || (response.status===404 && (code==='not_found' || code==='no_draft')) || (response.status===422 && code==='playbook_cannot_work') || (response.status===409 && (code==='revision_conflict' || code==='draft_conflict' || code==='playbook_in_use' || code==='definition_archived' || code==='playbook_archived' || code==='starter_playbook' || code==='identity_conflict' || code==='task_not_for_you' || code==='version_conflict' || code==='request_conflict' || code==='campaign_not_ready' || code==='campaign_not_paced' || code==='wrong_event_name' || code==='mark_task_done_first' || code==='no_event' || code==='prepare_first' || code==='task_closed' || code==='not_claimed'))) && typeof result?.error?.message==='string' && result.error.message.length<=(code==='playbook_cannot_work'?2000:1000) && !/[\u0000-\u001f\u007f]/.test(result.error.message) && !/^Workspace request failed/.test(result.error.message) && !(config.token && result.error.message.includes(config.token)) ? result.error.message.trim() : '';
  const blockers = (code==='execution_blocked' || code==='campaign_not_ready') && Array.isArray(result?.error?.blockers) && result.error.blockers.length<=28 && result.error.blockers.every(v=>typeof v==='string' && /^[a-z_]+$/.test(v)) ? result.error.blockers : undefined;
  const error = new WorkspaceRequestError(response.status, code, (name==='intent_record' || name==='intent_correct') && (INTENT_REFUSALS.has(code) || code==='invalid_fields') && detail ? surfaceWording(detail, config) : `Workspace request failed: ${code} (HTTP ${response.status}).${detail ? ` ${surfaceWording(detail, config)}` : ''}${retryAt ? ` Retry after ${retryAt}.` : ''}`, retryAt, blockers, requestTraceId, errorGuidance(result?.error, config.token, config));
  if(code==='playbook_cannot_work'&&Array.isArray(result?.error?.errors)&&result.error.errors.length<=30)error.errors=result.error.errors.filter(item=>item&&typeof item.id==='string'&&typeof item.message==='string').map(item=>({id:item.id,level:item.level,message:item.message,...(typeof item.stageKey==='string'?{stageKey:item.stageKey}:{}),...(item.fix&&typeof item.fix.label==='string'?{fix:{id:item.fix.id,label:item.fix.label}}:{})}));
  if(code==='draft_conflict'&&(result?.error?.currentUpdatedAt===null||/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(result?.error?.currentUpdatedAt??'')))error.currentUpdatedAt=result.error.currentUpdatedAt;
  if(code==='revision_conflict'&&Number.isInteger(result?.error?.currentRevision)&&result.error.currentRevision>=0)error.currentRevision=result.error.currentRevision;
  // A playbook that is in use names the campaigns that use it (#459).
  if(code==='playbook_in_use'&&Array.isArray(result?.error?.campaigns)&&Number.isInteger(result.error.campaignCount)){error.campaigns=result.error.campaigns.slice(0,20).filter(c=>uuid.safeParse(c?.id).success&&typeof c.name==='string'&&c.name.length<=200&&!/[\u0000-\u001f\u007f]/.test(c.name)).map(c=>({id:c.id,name:c.name}));error.campaignCount=result.error.campaignCount;}
  // What a failed paid check already spent (pico USD), so a caller counting its spend never loses it.
  if(typeof result?.error?.charged==='string'&&/^\d{1,20}$/.test(result.error.charged))error.charged=result.error.charged;
  if(isPaidToolOperation(name,input)){error.requestId=input.requestId;error.recovery=response.status>=500?'retry_same_request_id':'inspect_rejection';}
  throw error;
 }
 if(!result || !Object.hasOwn(result,'data')) {if(isPaidToolOperation(name,input)||operation.recoverable)throw new HostedResponseUnknown(input.requestId,'invalid_response',requestTraceId);throw new Error('The API returned an invalid response.');}
 const paidResult = paidToolResult(name, result?.data, input);
 if(isPaidToolOperation(name,input)&&(!uuid.safeParse(paidResult?.operationId).success||paidResult.requestId!==input.requestId||!['running','succeeded','failed','uncertain','rejected'].includes(paidResult.status)))throw new HostedResponseUnknown(input.requestId,'invalid_response',requestTraceId);
 if(name==='workspace_select') config.workspaceId=input.workspaceId;
 return {data:operation.transform?operation.transform(result.data,input):result.data,...(requestTraceId?{requestTraceId}:{})};
}
export async function workspaceCli(args) {
 const flags={}; const position=[];
 for(let i=0;i<args.length;i++) {
  if(args[i]==='--json') continue;
  if(args[i].startsWith('--')) {const key=args[i].slice(2);if(!['profile','workspace','name','request-id','email','generation','scope','user','file','caller','status','after','query','people-only','recent','unread-only','cursor','key','read','through'].includes(key)||!args[i+1]||args[i+1].startsWith('--')) throw new Error('Unknown or incomplete option.');flags[key]=args[++i];}
  else position.push(args[i]);
 }
 if(position[0]==='profile' && position[1]==='save') {
  if(!['account:read','workspace:read','workspace:access','agents:manage'].includes(flags.scope)) throw new Error('Specify --scope account:read, workspace:read, workspace:access or agents:manage.');
  const url=validateUrl(process.env.AUDIENTI_API_URL).toString().replace(/\/$/,'');const token=process.env.AUDIENTI_API_TOKEN;if(!token) throw new Error('Set AUDIENTI_API_TOKEN.');
  const profile=readProfile(profileFrom(flags.profile));if(profile.agent || profile.pendingAgent || profile.connectionSecret) throw new Error('Use a separate user profile; agent profiles cannot store user API tokens.');writeProfile(profileFrom(flags.profile),{...profile,url,tokens:{...profile.tokens,[flags.scope]:token}});console.log('Profile saved.');return;
 }
 const config=configuration(flags.profile);const command=position.slice(1).join(' ');
 // token show works with any saved user token, so it also tries the other slots when there is no workspace token.
 if(position[0]==='token'&&!config.token&&!process.env.AUDIENTI_API_TOKEN&&!(config.profile.agent||config.profile.pendingAgent||config.profile.connectionSecret))config.token=config.profile.tokens?.['agents:manage']??config.profile.tokens?.['account:read'];
 let name, input={};
 if(command==='sending-settings') {name='workspace_sending_settings_get';input={workspaceId:flags.workspace,...(flags.user?{userId:flags.user}:{})};}
 else if(command==='sending-settings save') {if(!flags.file) throw new Error('Supply the settings with --file PATH.');const body=readJsonFile(flags.file,65536,'Settings file');if(!body||typeof body!=='object'||Array.isArray(body)) throw new Error('Settings must be an object.');name='workspace_sending_settings_save';input={...body,workspaceId:flags.workspace??body.workspaceId,...(flags.user?{userId:flags.user}:{})};}
 else if(command==='usage summary') {name='workspace_usage_summary';input={workspaceId:flags.workspace};}
 else if(command==='usage callers') {name='workspace_usage_callers';input={workspaceId:flags.workspace};}
 else if(command==='usage calls') {name='workspace_usage_calls';input={workspaceId:flags.workspace,...(flags.after?{after:flags.after}:{}),...(flags.caller?{caller:flags.caller}:{}),...(flags.status?{status:flags.status}:{})};}
 else if(position[1]==='usage'&&position[2]==='call'&&position.length===4) {name='workspace_usage_call';input={workspaceId:flags.workspace,callId:position[3]};}
 else if(command==='agent-access') {name='workspace_agent_access';input={workspaceId:flags.workspace};}
 else if(['agent-access block','agent-access restore'].includes(command)) {name='workspace_agent_access_set';input={workspaceId:flags.workspace,userId:flags.user,blocked:command.endsWith('block')};}
 else if(position[0]==='token'&&command==='show') name='token_show';
 else if(command==='init') name='workspace_initialize';
 else if(command==='list') name='workspace_list';
 else if(command==='notifications') {if(flags['unread-only']&&!['true','false'].includes(flags['unread-only']))throw new Error('--unread-only must be true or false.');name='workspace_notifications_list';input={workspaceId:flags.workspace,unreadOnly:flags['unread-only']==='true',...(flags.cursor?{cursor:readJsonFile(flags.cursor,4096,'Notification cursor')}:{})};}
 else if(command==='notification-read') {if(!['true','false'].includes(flags.read))throw new Error('--read must be true or false.');name='workspace_notifications_mark';input={workspaceId:flags.workspace,sourceKey:flags.key,isRead:flags.read==='true',...(flags.through?{through:flags.through}:{})};}
 else if(command==='search') {if(flags['people-only']&&!['true','false'].includes(flags['people-only']))throw new Error('--people-only must be true or false.');name='workspace_search';input={workspaceId:flags.workspace,query:flags.query??'',peopleOnly:flags['people-only']==='true',recent:flags.recent?readJsonFile(flags.recent,4096,'Recent references'):[]};}
 else if(command==='create') {name='workspace_create';input={name:flags.name,requestId:flags['request-id']??randomUUID()};}
 else if(command==='show') {name='workspace_get';input={workspaceId:flags.workspace};}
 else if(command==='invite') {name='workspace_invite';input={workspaceId:flags.workspace,email:flags.email};}
 else if(command==='invitations') name='workspace_invitations';
 else if(position[1]==='member' && position.length===3) {name='workspace_member';input={workspaceId:flags.workspace,userId:position[2]};}
 else if(position[1]==='use' && position.length===3) {name='workspace_select';input={workspaceId:position[2]};}
 else if(position[1]==='invitation' && position.length===4) {
  const action=position[2];name={show:'workspace_invitation_get',accept:'workspace_invitation_accept',decline:'workspace_invitation_decline',retry:'workspace_invitation_retry',cancel:'workspace_invitation_cancel'}[action];
  input={id:position[3],...(['retry','cancel'].includes(action)?{workspaceId:flags.workspace}:{generation:Number(flags.generation)})};
 }
 if(!name) throw new Error('Unknown workspace command. Use audienti --help.');
 const result=await callWorkspace(name,input,config);

 if(name==='workspace_select') writeProfile(profileFrom(flags.profile),{...config.profile,workspaceId:config.workspaceId});
 console.log(JSON.stringify(result));
}
