import { clientHeaders, versionRefusal, reportClientUpdate, clientError } from './client-version.mjs';
import { readProfile, writeProfile, withProfileLock, validateUrl, configuration, profileFrom, WorkspaceRequestError, errorGuidance } from './workspaces.mjs';
import { randomBytes, randomUUID } from 'node:crypto';
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
 agent_reconnect: { description: 'Reuse an existing stable Agent ID. With the private profile, valid credentials are read back without rotation; missing or expired credentials start explicit owner-approved recovery. It never creates a new Agent or expands permissions.', schema: z.object({ agentId: z.string().uuid().optional() }).strict() },
 agent_poll: { schema: z.object({}).strict() },
 agent_cancel: { schema: z.object({}).strict() },
 agent_list: { schema: z.object({}).strict() },
 agent_revoke: { schema: z.object({ id: z.string().uuid() }).strict() },
};
async function request(config, path, body, authenticated = false, method = body === undefined ? 'GET' : 'POST') {
 const url = validateUrl(config.url);
 let response;
 try { response = await fetch(new URL(`/api/v1${path}`, url), { method, headers: { ...clientHeaders(config), Accept: 'application/json', 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${config.token ?? ''}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(10000) }); }
 catch { throw new Error('Could not reach the API. Redirects are not followed.'); }
 let result; try { result = await response.json(); } catch { throw new Error('The API returned an invalid response.'); }
 if (response.ok) reportClientUpdate(result,config);
 if (!response.ok) {
  if(versionRefusal(result)) throw clientError(new WorkspaceRequestError(response.status,'client_update_required',versionRefusal(result)),result);
  const code = typeof result?.error?.code === 'string' && /^[a-z_]+$/.test(result.error.code) ? result.error.code : 'request_failed';
  // A refused report says why (ADR 015), with the same safety checks as the workspace client.
  const message = result?.error?.message;
  const detail = response.status === 400 && (code === 'validation_error' || code === 'hosted_via_reserved') && typeof message === 'string' && message.length <= 300 && !/[\u0000-\u001f\u007f]/.test(message) && !(config.token && message.includes(config.token)) ? ` ${message}` : '';
  throw clientError(new WorkspaceRequestError(response.status, code, `Agent request failed: ${code} (HTTP ${response.status}).${detail}`, undefined, undefined, undefined, errorGuidance(result?.error, config.token)),result);
 }
 if (!result || !Object.hasOwn(result, 'data')) throw new Error('The API returned an invalid response.');
 config.clientCompatibility = result.client;
 return result.data;
}
const recoverySecret = /^adc_[A-Za-z0-9_-]{43}$/;
const recoveryCredential = /^agt_[A-Za-z0-9_-]{43}$/;
const recoveryCode = /^[A-F0-9]{4}-[A-F0-9]{4}$/;
const recoveryRequest = value => value && z.string().uuid().safeParse(value.requestId).success && z.string().uuid().safeParse(value.targetAgentId).success && recoverySecret.test(value.secret) && recoveryCredential.test(value.credential) && recoveryCode.test(value.code);
const recoveryCodeValue = () => `${randomBytes(2).toString('hex').toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`;
async function reconnectAgent(input, config, profilePath) {
 return withProfileLock(profilePath, async () => {
  const profile = readProfile(profilePath);
  const url = validateUrl(config.url).toString().replace(/\/$/, '');
  if (profile.url && profile.url !== url) throw new Error('The agent profile belongs to a different API host.');
  if (!profile.agent && !profile.pendingRecovery && Object.keys(profile.tokens ?? {}).length) throw new Error('Use a separate private profile without user API tokens for agent recovery.');
  const pending = profile.pendingRecovery;
  const explicitId = input.agentId;
  const storedId = profile.agent?.id;
  const targetAgentId = pending?.targetAgentId ?? storedId ?? explicitId;
  if (!targetAgentId) throw new Error('Supply the exact stable Agent ID with --agent-id, or use a profile that already has an agent identity.');
  if ((explicitId && explicitId !== targetAgentId) || (storedId && storedId !== targetAgentId)) throw new Error('The profile identity and requested Agent ID do not match. Refusing to act as a different agent.');
  if (pending && (!recoveryRequest(pending) || pending.targetAgentId !== targetAgentId)) throw new Error('The saved recovery request is invalid or bound to a different Agent ID.');
  const lockedConfig = { ...config, url, profile };
  const oldCredential = profile.tokens?.['workspace:read'];
  if (!pending && profile.agent && recoveryCredential.test(oldCredential ?? '')) {
   lockedConfig.token = oldCredential;
   try {
    const readback = await request(lockedConfig, '/agent-capabilities', undefined, true);
    if (!readback.agent || readback.agent.id !== targetAgentId) throw new Error('The saved credential belongs to a different Agent ID. Refusing to reconnect.');
    const saved = { ...profile, url, agent: readback.agent };
    writeProfile(profilePath, saved); config.profile = saved; config.token = oldCredential; config.url = url;
    return { data: { status: 'active', agent: readback.agent, reused: true } };
   } catch (error) {
    if (!(error instanceof WorkspaceRequestError) || error.status !== 401 || error.code !== 'unauthorized') throw error;
   }
  }
  const requestData = pending ? (({ requestId, targetAgentId, secret, credential, code }) => ({ requestId, targetAgentId, secret, credential, code }))(pending) : { requestId: randomUUID(), targetAgentId, secret: `adc_${randomBytes(32).toString('base64url')}`, credential: `agt_${randomBytes(32).toString('base64url')}`, code: recoveryCodeValue() };
  if (!recoveryRequest(requestData)) throw new Error('Could not prepare a valid identity-bound recovery request.');
  const persisted = { ...profile, url, pendingRecovery: requestData };
  // Persist the exact replay material before the network call. A second CLI process waits on this lock and reuses it.
  writeProfile(profilePath, persisted);
  lockedConfig.profile = persisted; lockedConfig.token = undefined;
  const data = await request(lockedConfig, '/agent-connections', requestData);
  if (!z.string().uuid().safeParse(data.id).success || data.recovery !== true || !recoveryCode.test(data.code) || typeof data.expiresAt !== 'string') throw new Error('Invalid recovery response.');
  const saved = { ...persisted, pendingRecovery: { ...requestData, id: data.id, expiresAt: data.expiresAt, approvalPath: `/agents/connect/${data.id}`, approvalUrl: data.approvalUrl } };
  writeProfile(profilePath, saved); config.profile = saved; config.token = undefined; config.workspaceId = undefined; config.url = url;
  return { data: { status: data.status === 'approved' ? 'approved' : 'pending', id: data.id, targetAgentId, code: data.code, approvalUrl: data.approvalUrl, approvalPath: `/agents/connect/${data.id}`, expiresAt: data.expiresAt, interval: 5, instructions: 'Give your user the approval URL and code, then run agent poll with this profile every interval seconds until the status is active, denied or expired. Existing permissions and workspace access stay unchanged during recovery.' } };
 });
}
async function callAgentProfileOperation(name, input, config, profilePath) {
 const profile = readProfile(profilePath);
 const url = validateUrl(config.url).toString().replace(/\/$/, '');
 config.profile = profile;
 if (name === 'agent_connect') {
  if (profile.pendingAgent || profile.pendingRecovery) throw new Error('This profile already has an agent connection. Poll or cancel the pending connection before trying again.');
  if (profile.agent) throw new Error(`This profile already belongs to Agent ${profile.agent.id}. Use audienti agent reconnect --agent-id ${profile.agent.id} to restore it, or use a separate profile to add a distinct Agent.`);
  if (Object.keys(profile.tokens ?? {}).length) throw new Error('Use a new agent profile without user API tokens.');
  // Prove that private persistence is possible before asking the server for secrets.
  writeProfile(profilePath, { ...profile, url });
  const data = await request(config, '/agent-connections', input);
  if (!/^adc_[A-Za-z0-9_-]{43}$/.test(data.secret) || !/^agt_[A-Za-z0-9_-]{43}$/.test(data.credential) || !z.string().uuid().safeParse(data.id).success || !/^[A-F0-9]{4}-[A-F0-9]{4}$/.test(data.code)) throw new Error('Invalid connection response.');
  writeProfile(profilePath, { ...profile, url, pendingAgent: { id: data.id, secret: data.secret, credential: data.credential, expiresAt: data.expiresAt } });
  config.token = undefined; config.workspaceId = undefined;
  return { data: { status: 'pending', id: data.id, code: data.code, approvalUrl: data.approvalUrl, approvalPath: `/agents/connect/${data.id}`, expiresAt: data.expiresAt, interval: 5, instructions: 'Give your user the approval URL and the code, then run agent poll with this profile every interval seconds, in this same turn and without waiting for them to reply, until the status is active, denied or expired.' } };
 }
 const secret = profile.pendingRecovery?.secret ?? profile.pendingAgent?.secret ?? profile.connectionSecret;
 if (!secret) throw new Error('No connection in this profile.');
 if (url !== profile.url) throw new Error('The pending connection belongs to a different API host.');
 const data = await request(config, name === 'agent_poll' ? '/agent-connections/poll' : '/agent-connections/cancel', { secret });
 if (data.status === 'active') {
  const expectedId = profile.pendingRecovery?.targetAgentId ?? (profile.recoveryConnection ? profile.agent?.id : undefined);
  if (expectedId && data.agent?.id !== expectedId) throw new Error('The server returned a different Agent ID. Refusing to update this profile.');
  const credential = profile.pendingRecovery?.credential ?? profile.pendingAgent?.credential ?? profile.tokens?.['workspace:read'];
  const recovering = Boolean(profile.pendingRecovery || profile.recoveryConnection || data.recovery);
  writeProfile(profilePath, { ...profile, agent: data.agent, connectionSecret: secret, recoveryConnection: recovering, pendingRecovery: undefined, pendingAgent: undefined, tokens: recovering ? { ...profile.tokens, 'workspace:read': credential } : { 'workspace:read': credential } });
  config.token = credential;
 } else if (['denied', 'expired'].includes(data.status)) {
  if (profile.pendingRecovery || profile.recoveryConnection) { writeProfile(profilePath, { ...profile, pendingRecovery: undefined, ...(profile.recoveryConnection ? { connectionSecret: undefined, recoveryConnection: undefined } : {}) }); config.token = profile.tokens?.['workspace:read']; }
  else { writeProfile(profilePath, { ...profile, pendingAgent: undefined, agent: undefined, connectionSecret: undefined, tokens: undefined, workspaceId: undefined }); config.token = undefined; config.workspaceId = undefined; }
 }
 return { data };
}
export async function callAgent(name, args, config, profilePath) {
 const result = await callAgentData(name, args, config, profilePath);
 return config.clientCompatibility ? { ...result, client: config.clientCompatibility } : result;
}
async function callAgentData(name, args, config, profilePath) {
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
 if (name === 'agent_reconnect') return reconnectAgent(input.data, config, profilePath);
 if (['agent_connect','agent_poll','agent_cancel'].includes(name)) return withProfileLock(profilePath, () => callAgentProfileOperation(name, input.data, config, profilePath));
 throw new Error('Invalid agent command or arguments.');
}
export async function agentCli(args) {
 const flags = {}; const positions = []; let json = false;
 for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') { json = true; continue; }
  if (args[i].startsWith('--')) {
   const key = args[i].slice(2);
   if (key === 'write') { flags.write = true; continue; }
   if (!['profile', 'name','capabilities','scope','file','id','agent-id','provider','account','workspace','shared','authorized','set'].includes(key) || !args[i+1] || args[i+1].startsWith('--')) throw new Error('Unknown or incomplete agent option.');
   flags[key] = args[++i];
  } else positions.push(args[i]);
 }
 let name = `agent_${positions[1]}`;
 let input = positions[1] === 'permission' ? {id:positions[2],scope:flags.scope} : positions[1] === 'connect' ? { name: flags.name, ...(flags.write ? { write: true } : {}), ...(flags.capabilities ? { capabilities: flags.capabilities.split(',').map(key => key.trim()).filter(Boolean) } : {}) } : positions[1] === 'reconnect' ? { ...(flags['agent-id'] ? { agentId: flags['agent-id'] } : {}) } : positions[1] === 'revoke' ? { id: positions[2] } : {};
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
