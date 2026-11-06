import { readProfile, writeProfile, validateUrl, configuration, profileFrom, WorkspaceRequestError, errorGuidance } from './workspaces.mjs';
import { z } from 'zod';
import {readJsonFile} from './json-file.mjs';

export const agentManagementOperations = ['agent_list','agent_revoke','agent_permission','agent_capabilities_set','agent_capabilities_get','agent_inventory_get','agent_capability_sharing_get','agent_capability_sharing_set','agent_account_authorizations_get','agent_account_authorization_set'];
// The seven capability groups and the 'approve' guardrail (#120). 'listen' is the retired name of 'research'; the server still accepts it.
const capabilityKeys=['find','enrich','expand','research','engage','sync','notify','approve','listen'];
const inventoryLabel=z.string().trim().min(1).max(80);
// Capability rows (ADR 015). The server checks ids, providers and access against the catalog; the client checks the shape.
const capabilityRow=z.object({capability:z.string().min(1).max(64),provider:z.string().min(1).max(32).optional(),via:z.string().min(1).max(140),account:z.string().min(1).max(200).optional(),access:z.enum(['read','write','send']),cost:z.enum(['owner','credits']).optional(),status:z.enum(['connected','needs_sign_in','unavailable']),limits:z.object({daily:z.number().int().min(0).max(100000).optional(),hourly:z.number().int().min(0).max(100000).optional()}).strict().optional(),identity:z.object({namespace:z.string().min(1).max(64),accountId:z.string().min(1).max(256)}).strict().optional()}).strict();
// A LinkedIn seat's cadence, InMail and safe limits (brief 09); the server checks the bounds.
const seatLimit=z.number().int().min(0).max(100000);
const seatFacts={checkEverySeconds:z.number().int().min(3600).max(604800).optional(),inmail:z.object({available:z.boolean(),quotaPerMonth:seatLimit.optional(),creditsLeft:seatLimit.optional()}).strict().optional(),plan:z.enum(['free','premium_career','premium_business','premium_all_in_one','sales_navigator_core','sales_navigator_advanced','recruiter_lite']).optional(),limits:z.object({connectionRequestsPerDay:seatLimit.optional(),connectionRequestsPerWeek:seatLimit.optional(),messagesPerDay:seatLimit.optional(),inmailPerMonth:seatLimit.optional()}).strict().optional()};
const accountEntry=z.object({capability:z.string(),tools:z.array(z.string()).min(1).max(8)}).strict();
const accountReport=z.object({provider:z.enum(['email','linkedin']),accountRef:z.string().min(1).max(200),status:z.enum(['healthy','unavailable','disconnected']),accountIdentity:z.object({namespace:z.string(),accountId:z.string()}).strict().optional(),capabilities:z.array(accountEntry).max(16),...seatFacts}).strict();
const capabilityReport=z.object({runtime:z.object({name:z.string().trim().min(1).max(80),model:z.string().trim().min(1).max(80).optional()}).strict(),capabilities:z.array(capabilityRow).max(64),seats:z.array(z.object({provider:z.literal('linkedin'),account:z.string().min(1).max(200),...seatFacts}).strict()).max(50).optional()}).strict();
const eitherReport=z.union([capabilityReport,accountReport]);
const inventoryEntry=z.object({category:z.enum(['web_search','web_browse','people_data','company_data','email','linkedin','social','crm','spreadsheet','docs','chat','calendar','tasks','files','code','scheduling','memory','other']),name:inventoryLabel,access:z.array(z.enum(['read','write','send'])).min(1).max(3),status:z.enum(['connected','needs_sign_in','unavailable']),via:inventoryLabel.optional(),tools:z.array(z.string().min(1).max(128)).max(16).optional()}).strict();
export const agentOperations = {
 agent_inventory_report:{description:'Older shape, kept for one release; use agent_capabilities_report instead. Reports the tools and connectors this agent already has (search, mailboxes, CRM, sheets, chat, scheduling, memory). Replaces the whole inventory. List only what is already available; never connect anything new and never include credentials. Requires an active agent profile.',schema:z.object({runtime:z.object({name:inventoryLabel,model:inventoryLabel.optional()}).strict(),entries:z.array(inventoryEntry).max(64)}).strict()},
 agent_inventory_show:{description:'Read this agent\u2019s own reported tool inventory. Requires an active agent profile.',schema:z.object({}).strict()},
 agent_inventory_get:{schema:z.object({id:z.string().uuid()}).strict()},
 agent_account_authorizations_get:{schema:z.object({id:z.string().uuid()}).strict()},
 agent_account_authorizations_show:{schema:z.object({}).strict()},
 agent_account_authorization_set:{schema:z.object({id:z.string().uuid(),provider:z.enum(['email','linkedin']),accountRef:z.string().min(1).max(200),authorized:z.boolean()}).strict()},
 agent_capability_sharing_get: {schema:z.object({id:z.string().uuid()}).strict()},
 agent_capability_sharing_set: {schema:z.object({id:z.string().uuid(),provider:z.enum(['email','linkedin']),accountRef:z.string().min(1).max(200),workspaceId:z.string().uuid(),shared:z.boolean()}).strict()},
 // One object schema for MCP clients; callAgent then requires exactly one of the two report shapes.
 agent_capabilities_report: {description:'Getting started step 2: report what this agent can do as capability rows ({ runtime, capabilities: [{ capability, provider?, via, account?, access, cost?, status, limits?, identity? }], seats?: [{ provider: "linkedin", account, checkEverySeconds?, plan?, inmail?, limits? }] }), ids from the capability catalog. A LinkedIn account sends only when its rows carry identity { namespace: "linkedin", accountId: the member id }; a mailbox without one is matched by its address. Replaces the previous report. The old per-account shape (provider, accountRef, status, capabilities) is still accepted. Never use via "audienti" and never include credentials. Requires an active agent profile.',schema:z.object({runtime:capabilityReport.shape.runtime.optional(),provider:accountReport.shape.provider.optional(),accountRef:accountReport.shape.accountRef.optional(),status:accountReport.shape.status.optional(),accountIdentity:accountReport.shape.accountIdentity,capabilities:z.array(z.union([capabilityRow,accountEntry])).max(64),seats:capabilityReport.shape.seats,...seatFacts}).strict(),shape:eitherReport},
 agent_capabilities_list: {description:'Read what this agent can do now: its own capability rows plus Audienti hosted rows for the workspace (when the workspace has credits and the user approved the group). Uses the profile workspace unless workspaceId is given. Requires an active agent profile.',schema:z.object({workspaceId:z.string().uuid().optional()}).strict()},
 agent_capabilities_show: {schema:z.object({}).strict()},
 agent_capabilities_get: {schema:z.object({id:z.string().uuid()}).strict()},
 agent_permission: {schema:z.object({id:z.string().uuid(),scope:z.enum(['workspace:read','workspace:access'])}).strict()},
 agent_capabilities_set: {schema:z.object({id:z.string().uuid(),capabilities:z.array(z.enum(capabilityKeys)).min(1).max(9)}).strict()},
 agent_connect: { schema: z.object({ name: z.string().trim().min(1).max(80), capabilities: z.array(z.enum(capabilityKeys)).max(9).optional(), write: z.boolean().optional() }).strict() },
 agent_poll: { schema: z.object({}).strict() },
 agent_cancel: { schema: z.object({}).strict() },
 agent_list: { schema: z.object({}).strict() },
 agent_revoke: { schema: z.object({ id: z.string().uuid() }).strict() },
};
async function request(config, path, body, authenticated = false, method = body === undefined ? 'GET' : 'POST') {
 const url = validateUrl(config.url);
 let response;
 try { response = await fetch(new URL(`/api/v1${path}`, url), { method, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${config.token ?? ''}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(10000) }); }
 catch { throw new Error('Could not reach the API. Redirects are not followed.'); }
 let result; try { result = await response.json(); } catch { throw new Error('The API returned an invalid response.'); }
 if (!response.ok) {
  const code = typeof result?.error?.code === 'string' && /^[a-z_]+$/.test(result.error.code) ? result.error.code : 'request_failed';
  // A refused report says why (ADR 015), with the same safety checks as the workspace client.
  const message = result?.error?.message;
  const detail = response.status === 400 && (code === 'validation_error' || code === 'hosted_via_reserved') && typeof message === 'string' && message.length <= 300 && !/[\u0000-\u001f\u007f]/.test(message) && !(config.token && message.includes(config.token)) ? ` ${message}` : '';
  throw new WorkspaceRequestError(response.status, code, `Agent request failed: ${code} (HTTP ${response.status}).${detail}`, undefined, undefined, undefined, errorGuidance(result?.error, config.token));
 }
 if (!result || !Object.hasOwn(result, 'data')) throw new Error('The API returned an invalid response.');
 return result.data;
}
export async function callAgent(name, args, config, profilePath) {
 const input = agentOperations[name]?.schema.safeParse(args);
 if (!input?.success || (agentOperations[name].shape && !agentOperations[name].shape.safeParse(args).success)) throw new Error('Invalid agent command or arguments.');
 if (agentManagementOperations.includes(name) && (config.profile?.agent || config.profile?.pendingAgent)) throw new Error('Use a separate user management profile with an agents:manage token.');
 if(name==='agent_account_authorizations_get') return {data:await request(config,`/agents/${input.data.id}/account-authorizations`,undefined,true)};
 if(name==='agent_account_authorization_set') {const {id,...body}=input.data;return {data:await request(config,`/agents/${id}/account-authorizations`,body,true)};}
 if(name==='agent_account_authorizations_show') {
  if(!config.profile?.agent || !/^agt_/.test(config.token ?? '')) throw new Error('Use an active agent profile for authorization self readback.');
  return {data:await request(config,'/agent-account-authorizations',undefined,true)};
 }
 if (name === 'agent_capability_sharing_get') return {data:await request(config,`/agents/${input.data.id}/capability-sharing`,undefined,true)};
 if (name === 'agent_capability_sharing_set') {const {id,...body}=input.data;return {data:await request(config,`/agents/${id}/capability-sharing`,body,true)};}
 if (name === 'agent_inventory_get') return {data:await request(config,`/agents/${input.data.id}/inventory`,undefined,true)};
 if (name === 'agent_inventory_show' || name === 'agent_inventory_report') {
  if (!config.profile?.agent || !/^agt_/.test(config.token ?? '')) throw new Error('Use an active agent profile for tool inventory report and self readback.');
  return {data:await request(config,'/agent-inventory',name==='agent_inventory_report' ? input.data : undefined,true,name==='agent_inventory_report' ? 'PUT' : 'GET')};
 }
 if (name === 'agent_capabilities_get') return {data:await request(config,`/agents/${input.data.id}/capabilities`,undefined,true)};
 if (name === 'agent_capabilities_list') {
  if (!config.profile?.agent || !/^agt_/.test(config.token ?? '')) throw new Error('Use an active agent profile for capability check-in and self readback.');
  const workspaceId = input.data.workspaceId ?? config.workspaceId;
  return {data:await request(config,`/agent-capabilities${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`,undefined,true)};
 }
 if (name === 'agent_capabilities_show' || name === 'agent_capabilities_report') {
  if (!config.profile?.agent || !/^agt_/.test(config.token ?? '')) throw new Error('Use an active agent profile for capability check-in and self readback.');
  return {data:await request(config,'/agent-capabilities',name==='agent_capabilities_report' ? input.data : undefined,true,name==='agent_capabilities_report' ? 'PUT' : 'GET')};
 }
 if (name === 'agent_list') return { data: await request(config, '/agents', undefined, true) };
 if (name === 'agent_permission') return {data:await request(config, `/agents/${input.data.id}/permission`, {scope:input.data.scope}, true)};
 if (name === 'agent_capabilities_set') return {data:await request(config, `/agents/${input.data.id}/approved-capabilities`, {capabilities:input.data.capabilities}, true)};
 if (name === 'agent_revoke') return { data: await request(config, `/agents/${input.data.id}/revoke`, {}, true) };
 if (!profilePath) throw new Error('Use a separate private --profile PATH for each agent.');
 const profile = readProfile(profilePath);
 const url = validateUrl(config.url).toString().replace(/\/$/, '');
 if (name === 'agent_connect') {
  if (profile.pendingAgent || profile.agent) throw new Error('This profile already has an agent connection. Poll/cancel the pending connection or choose a new profile.');
  if (Object.keys(profile.tokens ?? {}).length) throw new Error('Use a new agent profile without user API tokens.');
  // Prove that private persistence is possible before asking the server for secrets.
  writeProfile(profilePath, { ...profile, url });
  const data = await request(config, '/agent-connections', input.data);
  if (!/^adc_[A-Za-z0-9_-]{43}$/.test(data.secret) || !/^agt_[A-Za-z0-9_-]{43}$/.test(data.credential) || !z.string().uuid().safeParse(data.id).success || !/^[A-F0-9]{4}-[A-F0-9]{4}$/.test(data.code)) throw new Error('Invalid connection response.');
  writeProfile(profilePath, { ...profile, url, pendingAgent: { id: data.id, secret: data.secret, credential: data.credential, expiresAt: data.expiresAt } });
  config.token = undefined; config.workspaceId = undefined;
  return { data: { status: 'pending', id: data.id, code: data.code, approvalUrl: data.approvalUrl, approvalPath: `/agents/connect/${data.id}`, expiresAt: data.expiresAt, interval: 5, instructions: 'Give your user the approval URL and the code, then run agent poll with this profile every interval seconds, in this same turn and without waiting for them to reply, until the status is active, denied or expired.' } };
 }
 const secret = profile.pendingAgent?.secret ?? profile.connectionSecret;
 if (!secret) throw new Error('No connection in this profile.');
 if (url !== profile.url) throw new Error('The pending connection belongs to a different API host.');
 const data = await request(config, name === 'agent_poll' ? '/agent-connections/poll' : '/agent-connections/cancel', { secret });
 if (data.status === 'active') {
  const credential = profile.pendingAgent?.credential ?? profile.tokens?.['workspace:read'];
  writeProfile(profilePath, { ...profile, agent: data.agent, connectionSecret: secret, pendingAgent: undefined, tokens: { 'workspace:read': credential } });
  config.token = credential;
 } else if (['denied', 'expired'].includes(data.status)) { writeProfile(profilePath, { ...profile, pendingAgent: undefined, agent: undefined, connectionSecret: undefined, tokens: undefined, workspaceId: undefined }); config.token = undefined; config.workspaceId = undefined; }
 return { data };
}
export async function agentCli(args) {
 const flags = {}; const positions = []; let json = false;
 for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') { json = true; continue; }
  if (args[i].startsWith('--')) {
   const key = args[i].slice(2);
   if (key === 'write') { flags.write = true; continue; }
   if (!['profile', 'name','capabilities','scope','file','id','provider','account','workspace','shared','authorized','set'].includes(key) || !args[i+1] || args[i+1].startsWith('--')) throw new Error('Unknown or incomplete agent option.');
   flags[key] = args[++i];
  } else positions.push(args[i]);
 }
 let name = `agent_${positions[1]}`;
 let input = positions[1] === 'permission' ? {id:positions[2],scope:flags.scope} : positions[1] === 'connect' ? { name: flags.name, ...(flags.write ? { write: true } : {}), ...(flags.capabilities ? { capabilities: flags.capabilities.split(',').map(key => key.trim()).filter(Boolean) } : {}) } : positions[1] === 'revoke' ? { id: positions[2] } : {};
 if(positions[1]==='accounts') {
  if(positions[2]==='show') {name=flags.id ? 'agent_account_authorizations_get' : 'agent_account_authorizations_show';input=flags.id ? {id:flags.id} : {};}
  else if(positions[2]==='authorize' && ['true','false'].includes(flags.authorized)) {name='agent_account_authorization_set';input={id:flags.id,provider:flags.provider,accountRef:flags.account,authorized:flags.authorized==='true'};}
  else throw new Error('Use agent accounts show [--id ID] or authorize --id ID --provider PROVIDER --account REF --authorized true|false.');
 }
 if (positions[1] === 'inventory') {
  if (positions[2] === 'report' && flags.file && !flags.id) {name='agent_inventory_report';input=readJsonFile(flags.file,32768,'Inventory file');console.error('Notice: agent capabilities report --file PATH is the current command; inventory reports are translated into capability rows.');}
  else if (positions[2] === 'show' && !flags.file) {name=flags.id ? 'agent_inventory_get' : 'agent_inventory_show';input=flags.id ? {id:flags.id} : {};}
  else throw new Error('Use agent inventory report --file PATH or show [--id ID].');
 }
 if (positions[1] === 'capabilities') {
  if (flags.set !== undefined && positions[2]) {name='agent_capabilities_set';input={id:positions[2],capabilities:flags.set.split(',').map(key => key.trim()).filter(Boolean)};}
  else  if (positions[2] === 'sharing' && flags.id) {name='agent_capability_sharing_get';input={id:flags.id};}
  else if (positions[2] === 'share' && flags.id && ['true','false'].includes(flags.shared)) {name='agent_capability_sharing_set';input={id:flags.id,provider:flags.provider,accountRef:flags.account,workspaceId:flags.workspace,shared:flags.shared==='true'};}
  else if (positions[2] === 'report'  && flags.file && !flags.id) {name='agent_capabilities_report';input=readCapabilityFile(flags.file);}
  else if (positions[2] === 'show' && !flags.file) {name=flags.id ? 'agent_capabilities_get' : 'agent_capabilities_show';input=flags.id ? {id:flags.id} : {};}
  else if (positions[2] === undefined && !flags.file && !flags.id) {name='agent_capabilities_list';input=flags.workspace ? {workspaceId:flags.workspace} : {};}
  else throw new Error('Use agent capabilities [--workspace ID] [--json], report --file PATH or show [--id ID].');
 }
 const result = await callAgent(name, input, configuration(flags.profile, agentManagementOperations.includes(name) ? 'agents:manage' : 'workspace:access'), profileFrom(flags.profile));
 console.log(name === 'agent_capabilities_list' && !json ? capabilityText(result.data) : JSON.stringify(result));
}

/** Plain text for agent capabilities: own rows that work now, then rows that work with Audienti hosted tools. */
export function capabilityText(data) {
 const rows = Array.isArray(data?.effective) ? data.effective : [];
 const line = row => `  ${row.capability}${row.provider ? ` (${row.provider})` : ''} via ${row.via}${row.account ? `, account ${row.account}` : ''}${row.status === 'connected' ? '' : `, ${row.status.replaceAll('_', ' ')}`}${row.hostedTool ? `, ${row.hostedTool.id}${row.hostedTool.credits === undefined ? '' : ` about ${row.hostedTool.credits} credits a call`}` : ''}${row.stale ? ', stale' : ''}`;
 const own = rows.filter(row => row.via !== 'audienti'), hosted = rows.filter(row => row.via === 'audienti');
 return [
  `Works now${data?.stale ? ' (report is over seven days old; report again)' : ''}:`, ...(own.length ? own.map(line) : ['  nothing reported yet: audienti agent capabilities report --file CAPABILITIES.json']),
  'Works with Audienti tools:', ...(hosted.length ? hosted.map(line) : [data?.workspaceId ? '  none: the workspace has no credits or the user has not approved these groups' : '  pick a workspace to see them: --workspace ID']),
  ...managedText(data?.managedAccounts),
 ].join('\n');
}

/** #444: what each LinkedIn account connected through Audienti may do. Off means the agent may not do it, which is not a missing tool. */
function managedText(accounts) {
 if (!Array.isArray(accounts) || !accounts.length) return [];
 return ['Accounts connected through Audienti (what each action is set to):', ...accounts.flatMap(account => [`  ${account.name ?? account.accountRef}`, ...(account.modes ?? []).map(mode => `    ${mode.label}: ${mode.modeName} (${mode.meaning})`)]), '  Off means the agent may not do it. Do not look for a tool for it.'];
}

function readCapabilityFile(path) {return readJsonFile(path,32768,'Capability file');}
