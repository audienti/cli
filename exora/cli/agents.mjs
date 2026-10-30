import { readProfile, writeProfile, validateUrl, configuration, WorkspaceRequestError } from './workspaces.mjs';
import { z } from 'zod';
import {readJsonFile} from './json-file.mjs';

export const agentManagementOperations = ['agent_list','agent_revoke','agent_permission','agent_capabilities_get','agent_capability_sharing_get','agent_capability_sharing_set','agent_account_authorizations_get','agent_account_authorization_set'];
export const agentOperations = {
 agent_account_authorizations_get:{schema:z.object({id:z.string().uuid()}).strict()},
 agent_account_authorizations_show:{schema:z.object({}).strict()},
 agent_account_authorization_set:{schema:z.object({id:z.string().uuid(),provider:z.enum(['email','linkedin']),accountRef:z.string().min(1).max(200),authorized:z.boolean()}).strict()},
 agent_capability_sharing_get: {schema:z.object({id:z.string().uuid()}).strict()},
 agent_capability_sharing_set: {schema:z.object({id:z.string().uuid(),provider:z.enum(['email','linkedin']),accountRef:z.string().min(1).max(200),workspaceId:z.string().uuid(),shared:z.boolean()}).strict()},
 agent_capabilities_report: {schema:z.object({provider:z.enum(['email','linkedin']),accountRef:z.string().min(1).max(200),status:z.enum(['healthy','unavailable','disconnected']),accountIdentity:z.object({namespace:z.string(),accountId:z.string()}).strict().optional(),capabilities:z.array(z.object({capability:z.string(),tools:z.array(z.string()).min(1).max(8)}).strict()).max(16)}).strict()},
 agent_capabilities_show: {schema:z.object({}).strict()},
 agent_capabilities_get: {schema:z.object({id:z.string().uuid()}).strict()},
 agent_permission: {schema:z.object({id:z.string().uuid(),scope:z.enum(['workspace:read','workspace:access'])}).strict()},
 agent_connect: { schema: z.object({ name: z.string().trim().min(1).max(80) }).strict() },
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
  throw new WorkspaceRequestError(response.status, code, `Agent request failed: ${code} (HTTP ${response.status}).`);
 }
 if (!result || !Object.hasOwn(result, 'data')) throw new Error('The API returned an invalid response.');
 return result.data;
}
export async function callAgent(name, args, config, profilePath) {
 const input = agentOperations[name]?.schema.safeParse(args);
 if (!input?.success) throw new Error('Invalid agent command or arguments.');
 if (agentManagementOperations.includes(name) && (config.profile?.agent || config.profile?.pendingAgent)) throw new Error('Use a separate user management profile with an agents:manage token.');
 if(name==='agent_account_authorizations_get') return {data:await request(config,`/agents/${input.data.id}/account-authorizations`,undefined,true)};
 if(name==='agent_account_authorization_set') {const {id,...body}=input.data;return {data:await request(config,`/agents/${id}/account-authorizations`,body,true)};}
 if(name==='agent_account_authorizations_show') {
  if(!config.profile?.agent || !/^agt_/.test(config.token ?? '')) throw new Error('Use an active agent profile for authorization self readback.');
  return {data:await request(config,'/agent-account-authorizations',undefined,true)};
 }
 if (name === 'agent_capability_sharing_get') return {data:await request(config,`/agents/${input.data.id}/capability-sharing`,undefined,true)};
 if (name === 'agent_capability_sharing_set') {const {id,...body}=input.data;return {data:await request(config,`/agents/${id}/capability-sharing`,body,true)};}
 if (name === 'agent_capabilities_get') return {data:await request(config,`/agents/${input.data.id}/capabilities`,undefined,true)};
 if (name === 'agent_capabilities_show' || name === 'agent_capabilities_report') {
  if (!config.profile?.agent || !/^agt_/.test(config.token ?? '')) throw new Error('Use an active agent profile for capability check-in and self readback.');
  return {data:await request(config,'/agent-capabilities',name==='agent_capabilities_report' ? input.data : undefined,true,name==='agent_capabilities_report' ? 'PUT' : 'GET')};
 }
 if (name === 'agent_list') return { data: await request(config, '/agents', undefined, true) };
 if (name === 'agent_permission') return {data:await request(config, `/agents/${input.data.id}/permission`, {scope:input.data.scope}, true)};
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
  return { data: { status: 'pending', id: data.id, code: data.code, approvalUrl: data.approvalUrl, approvalPath: `/agents/connect/${data.id}`, expiresAt: data.expiresAt, interval: 5, instructions: 'Open the approval URL, sign in, enter the matching code and approve. Then run agent poll with this profile.' } };
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
 const flags = {}; const positions = [];
 for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') continue;
  if (args[i].startsWith('--')) {
   const key = args[i].slice(2);
   if (!['profile', 'name','scope','file','id','provider','account','workspace','shared','authorized'].includes(key) || !args[i+1] || args[i+1].startsWith('--')) throw new Error('Unknown or incomplete agent option.');
   flags[key] = args[++i];
  } else positions.push(args[i]);
 }
 let name = `agent_${positions[1]}`;
 let input = positions[1] === 'permission' ? {id:positions[2],scope:flags.scope} : positions[1] === 'connect' ? { name: flags.name } : positions[1] === 'revoke' ? { id: positions[2] } : {};
 if(positions[1]==='accounts') {
  if(positions[2]==='show') {name=flags.id ? 'agent_account_authorizations_get' : 'agent_account_authorizations_show';input=flags.id ? {id:flags.id} : {};}
  else if(positions[2]==='authorize' && ['true','false'].includes(flags.authorized)) {name='agent_account_authorization_set';input={id:flags.id,provider:flags.provider,accountRef:flags.account,authorized:flags.authorized==='true'};}
  else throw new Error('Use agent accounts show [--id ID] or authorize --id ID --provider PROVIDER --account REF --authorized true|false.');
 }
 if (positions[1] === 'capabilities') {
  if (positions[2] === 'sharing' && flags.id) {name='agent_capability_sharing_get';input={id:flags.id};}
  else if (positions[2] === 'share' && flags.id && ['true','false'].includes(flags.shared)) {name='agent_capability_sharing_set';input={id:flags.id,provider:flags.provider,accountRef:flags.account,workspaceId:flags.workspace,shared:flags.shared==='true'};}
  else if (positions[2] === 'report'  && flags.file && !flags.id) {name='agent_capabilities_report';input=readCapabilityFile(flags.file);}
  else if (positions[2] === 'show' && !flags.file) {name=flags.id ? 'agent_capabilities_get' : 'agent_capabilities_show';input=flags.id ? {id:flags.id} : {};}
  else throw new Error('Use agent capabilities report --file PATH or show [--id ID].');
 }
 console.log(JSON.stringify(await callAgent(name, input, configuration(flags.profile, agentManagementOperations.includes(name) ? 'agents:manage' : 'workspace:access'), flags.profile)));
}

function readCapabilityFile(path) {return readJsonFile(path,32768,'Capability file');}
