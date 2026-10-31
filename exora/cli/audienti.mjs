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
       audienti workspace prospect campaign-fit get --prospect-id ID --campaign-id ID
       audienti workspace prospect fit-override set/clear --file INPUT.json
       audienti workspace prospect move --file INPUT.json
       audienti workspace member remove --file INPUT.json
       audienti workspace leave --file INPUT.json

Required environment:
  AUDIENTI_API_URL    Backend base URL including /api/v1
  AUDIENTI_API_TOKEN  Account API token (create it from your Account page)

Use HTTPS for remote hosts. Local HTTP is supported on loopback only.
Agent commands: agent connect --name NAME [--capabilities find,enrich,listen,approve]|poll|cancel|list|revoke ID --profile PATH
Owner permission change: agent permission ID --scope workspace:read|workspace:access --profile USER_PROFILE
Owner capability change: agent capabilities ID --set find,enrich,listen,approve --profile USER_PROFILE (agents are refused outside this set)
Agent capabilities: agent capabilities report --file REPORT.json --profile AGENT_PROFILE
Read capabilities: agent capabilities show [--id AGENT_ID] --profile PROFILE
Getting started: skills show getting-started, then agent inventory report --file INVENTORY.json --profile AGENT_PROFILE
Read tool inventory: agent inventory show [--id AGENT_ID] --profile PROFILE
Account authorization: agent accounts show [--id AGENT_ID] --profile PROFILE
Authorize/revoke: agent accounts authorize --id AGENT_ID --provider email|linkedin --account REF --authorized true|false --profile OWNER_PROFILE
Sharing: agent capabilities sharing --id AGENT_ID --profile OWNER_PROFILE
Share/unshare: agent capabilities share --id AGENT_ID --provider email|linkedin --account REF --workspace ID --shared true|false --profile OWNER_PROFILE
Team member: workspace member USER_ID [--workspace ID] --profile PROFILE
Work execution: work execution claim|start|get PLAN --action ID; release|lookup --claim ID; report --attempt ID
Work feedback: work changes request|list|get|respond|withdraw PLAN --workspace ID
Work: work plan save|list|show|approve|withdraw-approval|cancel|eligibility
Activity: work activity --workspace ID [--search TEXT] [--cursor-at ISO --cursor-id ID]
Work list: work list --workspace ID [--order oldest|priority] [--queue review|blocked|activity]
Work writes: --file INPUT.json; human review needs a human workspace:access token
Audiences: audience options --kind industries|locations|sizes|types|seniorities|titles|functions|industry_groups [--q TEXT]
           audience list|show ID|create|update ID|archive ID|restore ID
           audience summary [--audience ID]|people ID|companies ID
           audience test ID --url LINKEDIN_URL --request-id UUID  (spends hosted credits unless the profile is saved)
Files: file upload PATH --type MIME|list|prepare|register|download|delete ID (personal files, human token only)
Queue: audienti queue [list]|next|claim ID|done ID [--note TEXT]|skip ID --note TEXT|release ID  (start here after you connect)
Questions: audienti ask "QUESTION" [--context TEXT] [--option TEXT]... [--campaign ID] [--task ID]  (questions for your owner go to Operator, not chat)
           audienti questions [list] [--state open|answered|withdrawn|all] | show ID | withdraw ID | answer ID --answer TEXT
Rooms: audienti rooms directory|inbox|ack|send|thread|threads|create|list|retire|restore|redact|resume|pause|profile|hook|watch|wait (audienti rooms help)
Offers: offer list|show ID|create|update ID|archive ID|restore ID
Offer options: --file FIELDS.json --request-id UUID --expected-revision N --revision N --archived true|false
  audienti prospects replies set|get|list PERSON --workspace ID [--evidence EVIDENCE] [--file INPUT.json]
Account intake: prospects intake --workspace ID --file INPUT.json
                prospects conversation append|list PERSON --workspace ID
Discovery: prospects list|get ID|observation create|citation create|evidence create
           prospects contacts list|record PERSON --workspace ID
           prospects contacts get|retire PERSON CONTACT --workspace ID
           prospects suppression get|set ID --workspace ID
           guardrails show|pause|resume --workspace ID
           dnc list|add VALUE|remove VALUE --workspace ID
           dnc import --file LIST.csv --workspace ID  (at most 5,000 rows; reports added, skipped and invalid rows)
           dnc export [--output FILE.csv] --workspace ID
           budgets show --workspace ID
           budgets alerts --workspace ID [--limit N]
           usage breakdown [--workspace ID] [--since month|7d|30d|90d] [--by tool|provider|model|caller|day] [--format json|csv]
           audit list [--workspace ID] [--since 7d] [--actor agent|person] [--category NAME] [--format json|csv]
           budgets set --workspace ID [--agent ID --cap N|none] [--new-agent-cap N|none] [--at-limit pause|ask] [--alert80 on|off]  (alert80 covers Operator and email at 80%)
Qualification: campaigns qualification submit --file INPUT.json
Approaches: approach list|show ID|save --file REQUEST.json|progress ID|record --file REQUEST.json
Analytics: analytics show --from ISO --to ISO [--campaign ID] [--approach-version ID] [--format json|csv]
           analytics outbound [--workspace ID] [--days N | --from ISO --to ISO] [--by sender|action|day] [--format json|csv]
           analytics activity [--workspace ID] [--days N | --from ISO --to ISO] [--format json|csv]
           analytics cohorts [--workspace ID] [--stage goal|KEY] [--cohorts N] [--horizon N] [filters] [--format json|csv]
           analytics aging [--workspace ID] [--threshold-days N] [filters] [--format json|csv]
           analytics filters [--workspace ID]  (lists campaign, owner, offer, audience and tag values)
           (filters: --campaign ID --owner ID --offer ID --audience ID --tag TAG; also accepted by analytics show)
Pipeline: pipeline show [--campaign ID] [--approach-version ID]
Connections: connections list|register --file REQUEST.json|report --file REQUEST.json
Discovery writes use --file INPUT.json, --workspace ID and stable --request-id UUID
Workspace commands: workspace init|list|create|show|search|invite|invitations|use
Notifications: workspace notifications --workspace ID [--unread-only true] [--cursor FILE.json]
Read state: workspace notification-read --workspace ID --key KEY --read true|false [--through OBSERVED_AT]
Search: workspace search --workspace ID --query TEXT [--people-only true] [--recent FILE.json]
Invitation commands: workspace invitation show|accept|decline|retry|cancel ID
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
  if(args[0]==='usage'){const {usageCli}=await import('./usage.mjs');await usageCli(args);return;}
  if(args[0]==='audit'){const {auditCli}=await import('./audit.mjs');await auditCli(args);return;}
  if(args[0]==='budgets'){const {budgetsCli}=await import('./budgets.mjs');await budgetsCli(args);return;}
  if(args[0]==='guardrails'||args[0]==='dnc'){const {guardrailsCli}=await import('./guardrails.mjs');await guardrailsCli(args);return;}
  if(args[0]==='prospects'&&args[1]==='suppression'){const {suppressionCli}=await import('./suppression.mjs');await suppressionCli(args);return;}
  if(args[0]==='tools'){const {toolsCli}=await import('./tools.mjs');await toolsCli(args);return;}
  if(['topics','posts'].includes(args[0])){const {contentCli}=await import('./content.mjs');await contentCli(args);return;}
  if(args[0]==='work'&&args[1]==='execution'){const {workExecutionCli}=await import('./work-execution.mjs');await workExecutionCli(args);return;}
  if(args[0]==='work'&&args[1]==='changes'){const {workFeedbackCli}=await import('./work-feedback.mjs');await workFeedbackCli(args);return;}
  if(args[0]==='work'){const {workCli}=await import('./work.mjs');await workCli(args);return;}
  if(['prospects','campaigns'].includes(args[0])){const {discoveryCli}=await import('./discovery.mjs');await discoveryCli(args);return;}
  if(args[0]==='analytics'&&['cohorts','aging','filters'].includes(args[1])){const {cohortCli}=await import('./cohorts.mjs');await cohortCli(args);return;}
  if(args[0]==='analytics'&&['outbound','activity'].includes(args[1])){const {outboundCli}=await import('./outbound.mjs');await outboundCli(args);return;}
  if(['approach','analytics','pipeline','connections'].includes(args[0])){const {progressCli}=await import('./progress.mjs');await progressCli(args);return;}
  if(args[0]==='campaign'){const {campaignCli}=await import('./campaigns.mjs');await campaignCli(args);return;}
  if(args[0]==='audience'){const {audienceCli}=await import('./audiences.mjs');await audienceCli(args);return;}
  if(args[0]==='file'){const {fileCli}=await import('./files.mjs');await fileCli(args);return;}
  if(args[0]==='ask'){const {askCli}=await import('./questions.mjs');await askCli(args);return;}
  if(args[0]==='questions'){const {questionsCli}=await import('./questions.mjs');await questionsCli(args);return;}
  if(args[0]==='queue'){const {queueCli}=await import('./queue.mjs');await queueCli(args);return;}
  if(args[0]==='rooms'){const {roomsCli}=await import('./rooms.mjs');await roomsCli(args);return;}
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
