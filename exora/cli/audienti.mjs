#!/usr/bin/env node
import { isAssignmentCommand, assignmentCli } from './assignment.mjs';
// The CLI is an HTTP client. It has no database access or separate business rules.
const args = process.argv.slice(2);
const usage = `Profiles: audienti profiles list|search|get ID | match evaluate|apply SOURCE CANDIDATE | history RESOLUTION (saved workspace records)
Skills: audienti skills list|show audienti|helper NAME --file INPUT.json|- [--json]
Tools: audienti tools list|describe|decide|runs|balance [--help]
Sender: audienti sender accounts list|get|alias|register|bind|unbind|state|automation|activity report [--profile PATH]
Prospecting: audienti prospecting settings show|save|accounts|account-show|account-save|history [--profile PATH]
Usage: audienti whoami [--json]
       audienti workspace assignments list [--workspace ID]
       audienti workspace prospect assignment get/set --prospect-id ID [--file INPUT.json]
       audienti workspace routing-rules get/replace [--file INPUT.json]
       audienti workspace routing apply --file INPUT.json
       audienti workspace prospect experiment-fit get --prospect-id ID --experiment-id ID
       audienti workspace prospect fit-override set/clear --file INPUT.json
       audienti workspace prospect move --file INPUT.json
       audienti workspace member remove --file INPUT.json
       audienti workspace leave --file INPUT.json

Required environment:
  AUDIENTI_API_URL    Backend base URL including /api/v1
  AUDIENTI_API_TOKEN  Account API token (create it from your Account page)

Use HTTPS for remote hosts. Local HTTP is supported on loopback only.
Agent commands: agent connect --name NAME|poll|cancel|list|revoke ID --profile PATH
Owner permission change: agent permission ID --scope workspace:read|workspace:access --profile USER_PROFILE
Agent capabilities: agent capabilities report --file REPORT.json --profile AGENT_PROFILE
Read capabilities: agent capabilities show [--id AGENT_ID] --profile PROFILE
Account authorization: agent accounts show [--id AGENT_ID] --profile PROFILE
Authorize/revoke: agent accounts authorize --id AGENT_ID --provider email|linkedin --account REF --authorized true|false --profile OWNER_PROFILE
Sharing: agent capabilities sharing --id AGENT_ID --profile OWNER_PROFILE
Share/unshare: agent capabilities share --id AGENT_ID --provider email|linkedin --account REF --workspace ID --shared true|false --profile OWNER_PROFILE
Team member: workspace member USER_ID [--workspace ID] --profile PROFILE
Work execution: work execution claim|start|get PLAN --action ID; release|lookup --claim ID; report --attempt ID
Work feedback: work changes request|list|get|respond|withdraw PLAN --workspace ID
Work: work plan save|list|show|approve|withdraw-approval|cancel|eligibility
Work writes: --file INPUT.json; human review needs a human workspace:access token
Audiences: audience options --kind industries|locations|sizes|types|seniorities|titles|functions|industry_groups [--q TEXT]
           audience list|show ID|create|update ID|archive ID|restore ID
Offers: offer list|show ID|create|update ID|archive ID|restore ID
Offer options: --file FIELDS.json --request-id UUID --expected-revision N --revision N --archived true|false
  audienti prospects replies set|get|list PERSON --workspace ID [--evidence EVIDENCE] [--file INPUT.json]
Account intake: prospects intake --workspace ID --file INPUT.json
                prospects conversation append|list PERSON --workspace ID
Discovery: prospects list|get ID|observation create|citation create|evidence create
           prospects contacts list|record PERSON --workspace ID
           prospects contacts get|retire PERSON CONTACT --workspace ID
           prospects suppression get|set ID --workspace ID
Qualification: experiments qualification submit --file INPUT.json
Approaches: approach list|show ID|save --file REQUEST.json|progress ID|record --file REQUEST.json
Analytics: analytics show --from ISO --to ISO [--experiment ID] [--approach-version ID]
Connections: connections list|register --file REQUEST.json|report --file REQUEST.json
Discovery writes use --file INPUT.json, --workspace ID and stable --request-id UUID
Workspace commands: workspace init|list|create|show|invite|invitations|use
Invitation commands: workspace invitation show|accept|retry|cancel ID
Options: --workspace ID --name NAME --request-id UUID --email EMAIL --generation N
Optional private profile: --profile PATH (outside this repository)
Save an environment token: profile save --scope account:read|workspace:access|agents:manage --profile PATH
Start local MCP stdio server: mcp
--json writes the API response envelope.
`;

async function main() {
  if(args[0]==='prospects'&&['intake','conversation'].includes(args[1])){const {accountIntakeCli}=await import('./account-intake.mjs');await accountIntakeCli(args);return;}
  if(args[0]==='sender'){const {senderAccountsCli}=await import('./sender-accounts.mjs');await senderAccountsCli(args);return;}
  if(args[0]==='prospecting'){const {prospectingSettingsCli}=await import('./prospecting-settings.mjs');await prospectingSettingsCli(args);return;}
  if(args[0]==='prospects'&&args[1]==='replies'){const {accountRepliesCli}=await import('./account-replies.mjs');await accountRepliesCli(args);return;}
  if(args[0]==='prospects'&&args[1]==='contacts'){const {recipientsCli}=await import('./recipients.mjs');await recipientsCli(args);return;}
  if(args[0]==='prospects'&&args[1]==='suppression'){const {suppressionCli}=await import('./suppression.mjs');await suppressionCli(args);return;}
  if(args[0]==='tools'){const {toolsCli}=await import('./tools.mjs');await toolsCli(args);return;}
  if(['topics','posts'].includes(args[0])){const {contentCli}=await import('./content.mjs');await contentCli(args);return;}
  if(args[0]==='work'&&args[1]==='execution'){const {workExecutionCli}=await import('./work-execution.mjs');await workExecutionCli(args);return;}
  if(args[0]==='work'&&args[1]==='changes'){const {workFeedbackCli}=await import('./work-feedback.mjs');await workFeedbackCli(args);return;}
  if(args[0]==='work'){const {workCli}=await import('./work.mjs');await workCli(args);return;}
  if(['prospects','experiments'].includes(args[0])){const {discoveryCli}=await import('./discovery.mjs');await discoveryCli(args);return;}
  if(['approach','analytics','connections'].includes(args[0])){const {progressCli}=await import('./progress.mjs');await progressCli(args);return;}
  if(args[0]==='experiment'){const {experimentCli}=await import('./experiments.mjs');await experimentCli(args);return;}
  if(args[0]==='audience'){const {audienceCli}=await import('./audiences.mjs');await audienceCli(args);return;}
  if(args[0]==='offer'){const {offerCli}=await import('./offers.mjs');await offerCli(args);return;}
  if (args[0] === 'agent') { const { agentCli } = await import('./agents.mjs'); await agentCli(args); return; }
  if (isAssignmentCommand(args)) { await assignmentCli(args); return; }
  if (['workspace', 'profile'].includes(args[0])) { const { workspaceCli } = await import('./workspaces.mjs'); await workspaceCli(args); return; }
  if (args[0] === 'profiles') { const { profilesCli } = await import('./profiles.mjs'); await profilesCli(args); return; }
  if (args[0] === 'skills') { const { skillsCli } = await import('./skills.mjs'); await skillsCli(args); return; }
  if (args[0] === 'mcp' && args.length === 1) { await import('./mcp.mjs'); return; }
  if (args.length === 0 || (args.length === 1 && ['--help', '-h'].includes(args[0]))) { console.log(usage); return; }
  let profileConfig;
  const profileIndex = args.indexOf('--profile');
  if (args[0] === 'whoami' && profileIndex > 0 && args[profileIndex + 1]) {
    const { configuration } = await import('./workspaces.mjs');
    profileConfig = configuration(args[profileIndex + 1], 'account:read');
    args.splice(profileIndex, 2);
  }
  if (args[0] !== 'whoami' || args.length > 2 || (args[1] && args[1] !== '--json')) throw new Error('Unknown command or option. Use audienti --help.');
  const rawUrl = profileConfig ? profileConfig.url : process.env.AUDIENTI_API_URL;
  const token = profileConfig ? profileConfig.token : process.env.AUDIENTI_API_TOKEN;
  if (!rawUrl || !token) throw new Error('Set AUDIENTI_API_URL and AUDIENTI_API_TOKEN. Create a token from your Account page.');
  let base;
  try { base = new URL(rawUrl); } catch { throw new Error('AUDIENTI_API_URL must be a valid API base URL.'); }
  if (base.username || base.password || base.search || base.hash) throw new Error('The API URL must not contain credentials, query parameters, or a fragment.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && local)) throw new Error('Use HTTPS for remote API hosts. HTTP is only allowed on loopback.');
  if (base.pathname.replace(/\/$/, '') !== '/api/v1') throw new Error('AUDIENTI_API_URL must end with /api/v1.');
  base.pathname = '/api/v1/account';
  let response;
  try {
    response = await fetch(base, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(10_000) });
  } catch { throw new Error('Could not reach the API. Check its URL and availability. Redirects are not followed.'); }
  if (!response.ok) {
    if (response.status === 401) throw new Error('Authentication failed. Check whether your token is invalid, expired, or revoked.');
    if (response.status === 403) throw new Error('This token lacks account:read permission.');
    throw new Error(`API request failed (HTTP ${response.status}).`);
  }
  let body;
  try { body = await response.json(); } catch { throw new Error('The API returned an invalid response.'); }
  const data = body?.data;
  if (!data || typeof data.id !== 'string' || !('email' in data) || !('username' in data) || ![data.email, data.username].every(v => v === null || typeof v === 'string')) throw new Error('The API returned an invalid account profile.');
  // Select the documented fields, so an unexpected response cannot print credentials.
  const profile = { id: data.id, email: data.email, username: data.username };
  console.log(args[1] === '--json' ? JSON.stringify({ data: profile }) : `${profile.email ?? profile.username ?? profile.id}\nAccount ID: ${profile.id}`);
}

main().catch(error => { console.error(error.toJSON ? JSON.stringify({ error: error.toJSON() }) : `Audienti: ${error.message}`); process.exitCode = 1; });
