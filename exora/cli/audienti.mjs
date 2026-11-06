#!/usr/bin/env node
import { isAssignmentCommand, assignmentCli } from './assignment.mjs';
import { playbookHelp } from './playbook-help.mjs';
// The CLI is an HTTP client. It has no database access or separate business rules.
const args = process.argv.slice(2);
const usage = `Profiles: audienti profiles list|search|get ID | match evaluate|apply SOURCE CANDIDATE | history RESOLUTION (saved workspace records)
Skills: audienti skills list [--compact]|show SKILL|read SKILL RESOURCE|helper NAME --file INPUT.json|- [--json]
Tools: audienti call TOOL ['JSON'] | tools search "WORDS"|get TOOL|list|runs|balance [--help]
Sender: audienti sender accounts list|get|alias|register|bind|unbind|state|automation|activity report [--profile PATH]
Managed LinkedIn: audienti sender managed list|connect [--workspace ID] [--profile PATH] (connect: the user only; returns a sign-in link)
                  audienti sender managed plan MANAGED_ACCOUNT_ID --plan free|premium_career|premium_business|premium_all_in_one|sales_navigator_core|sales_navigator_advanced|recruiter_lite|none [--workspace ID]  (the user only; sets the connection note length; none clears it)
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
Agent commands: agent connect --name NAME [--write (ask for Allow workspace changes up front)] [--capabilities find,enrich,expand,research,engage,sync,notify,approve]|poll|cancel|list|revoke ID --profile PATH
Owner permission change: agent permission ID --scope workspace:read|workspace:access --profile USER_PROFILE
Owner capability change: agent capabilities ID --set find,enrich,expand,research,engage,sync,notify,approve --profile USER_PROFILE (agents are refused outside this set)
Agent capabilities: agent capabilities report --file CAPABILITIES.json --profile AGENT_PROFILE (capability rows; the old per-account shape still works)
What the agent can do: agent capabilities [--workspace ID] [--json] --profile AGENT_PROFILE (works now, and works with Audienti tools)
Read capabilities: agent capabilities show [--id AGENT_ID] --profile PROFILE
Getting started: skills show getting-started, then agent capabilities report --file CAPABILITIES.json --profile AGENT_PROFILE
Read tool inventory: agent inventory show [--id AGENT_ID] --profile PROFILE (agent inventory report still works; capabilities report is current)
Account authorization: agent accounts show [--id AGENT_ID] --profile PROFILE
Authorize/revoke: agent accounts authorize --id AGENT_ID --provider email|linkedin --account REF --authorized true|false --profile OWNER_PROFILE
Sharing: agent capabilities sharing --id AGENT_ID --profile OWNER_PROFILE
Share/unshare: agent capabilities share --id AGENT_ID --provider email|linkedin --account REF --workspace ID --shared true|false --profile OWNER_PROFILE
Team member: workspace member USER_ID [--workspace ID] --profile PROFILE
Work execution: work execution claim|start|send|get PLAN --action ID (send: managed LinkedIn accounts, --file with claimId and requestId); release|lookup --claim ID; report --attempt ID
Work feedback: work changes request|list|get|respond|withdraw PLAN --workspace ID
Work: work plan save|list|show|approve|withdraw-approval|cancel|skip|eligibility
Activity: work activity --workspace ID [--search TEXT] [--cursor-at ISO --cursor-id ID]
Work list: work list --workspace ID [--order oldest|priority] [--queue review|blocked|activity]
           a plan that only waits for its cadence is in neither review nor blocked; it returns to review when the wait ends
Work writes: --file INPUT.json; human review needs a human workspace:access token
Audiences: audience options --kind industries|locations|sizes|types|seniorities|titles|functions [--q TEXT]
           audience list|show ID|create|update ID|archive ID|restore ID
           audience summary [--audience ID]|people ID|companies ID
           audience test ID --url LINKEDIN_URL --request-id UUID  (spends hosted credits unless the profile is saved)
Files: file upload PATH --type MIME|list|prepare|register|download|delete ID (personal files, human token only)
Hand tasks: hand-tasks [list [--state open|ready|done|skipped]]|show ID|done ID --outcome TEXT [--notes TEXT] [--result replied|meeting_booked]|skip ID --reason TEXT|event ID [--name TEXT]  (a person does a Custom step by hand and records what happened)
Queue: audienti queue [list]|next|claim ID [--note TEXT]|done ID [--note TEXT]|skip ID --note TEXT|release ID [--workspace ID]  (start here after you connect; without --workspace an agent reads every workspace its user approved it in; done or skip again with a new --note corrects the note of a finished task)
Attachments: audienti attachments upload FILE [--duration SECONDS]  (store an image or voice note, get its id for content.attachments)
Outcome checks: audienti outcomes report TASK_ID --file RESULTS.json  (results for the people an outcomes.check task lists)
Saved posts: audienti posts list [--topic-id ID]|get ID  (savedByOperationId names the tool run that saved a post; read it with audienti tools runs get ID)
Saved topics: audienti topics list|get ID|create --input FILE --request-id UUID
Questions: audienti ask "QUESTION" [--context TEXT] [--option TEXT]... [--campaign ID] [--task ID]  (questions for your user go to Operator, not chat)
           audienti questions [list] [--state open|answered|withdrawn|all] | show ID | withdraw ID | answer ID --answer TEXT
Rooms: audienti rooms directory|inbox|ack|send|thread|threads|create|list|read|retire|restore|redact|resume|pause|profile|hook|watch|wait (audienti rooms help)
KV: audienti kv get KEY|set KEY VALUE [--json] [--nx] [--if-version N] [--ttl 7d|--expires-at TIME]|list [--prefix P]|search [--key TEXT] [--value TEXT]|delete KEY  (small state between runs; never credentials)
Offers: offer list|show ID|create|update ID|archive ID|restore ID
Offer options: --file FIELDS.json --request-id UUID --expected-revision N --revision N --archived true|false
  audienti prospects replies set|get|list PERSON --workspace ID [--evidence EVIDENCE] [--file INPUT.json]
Account intake: prospects intake --workspace ID --file INPUT.json
                prospects conversation append|list PERSON --workspace ID
Discovery: prospects list|get ID|timeline ID [--limit N]|observation create|citation create|evidence create
           prospects contacts list|record PERSON [--file INPUT.json] [--request-id UUID] --workspace ID
           prospects contacts get|retire PERSON CONTACT --workspace ID
           prospects suppression get|set ID --workspace ID
           guardrails show|pause|resume --workspace ID
           dnc list|add VALUE|remove VALUE --workspace ID
           dnc import --file LIST.csv --workspace ID  (at most 5,000 rows; reports added, skipped and invalid rows)
           dnc export [--output FILE.csv] --workspace ID
           secret list [--workspace ID]  (names only)
           secret get NAME [--workspace ID] [--json]  (prints the value; the secret records who read it last and when)
           budgets show --workspace ID
           budgets alerts --workspace ID [--limit N]
           usage breakdown [--workspace ID] [--since month|7d|30d|90d] [--by tool|provider|model|caller|day] [--format json|csv]
           workspace usage summary|callers|calls [--after ID] [--caller user:ID|agent:ID|key:ID] [--status all|succeeded|failed|pending]|call ID [--workspace ID]  (paid tool use, last 30 days, and single calls)
           intent list [--workspace ID]  (the closed set of message labels: name, direction, event, channels, typed detail; output is JSON)
           audit list [--workspace ID] [--since 7d] [--actor agent|person] [--category NAME] [--format json|csv]
           budgets set --workspace ID [--agent ID --cap N|none] [--new-agent-cap N|none] [--at-limit pause|ask] [--alert80 on|off]  (alert80 covers Operator and email at 80%)
Qualification: campaigns qualification submit --file INPUT.json
Campaign summary: campaign summary [--workspace ID]  (campaign counts per state, and per campaign its audience, offer, playbook, goal stage, people, engaged and at-goal counts)
Find prospects: campaign find CAMPAIGN_ID --count N --max-credits C  (searches with the audience filters, checks each person, admits only fits; stops at N fits or the credit cap and reports the spend)
                campaign check CAMPAIGN_ID --url LINKEDIN_URL [--request-id UUID]  (checks one person the same way; reuse the request ID after an interruption)
Target companies: campaign targets CAMPAIGN_ID [--limit N --after CURSOR]  (reads the companies people must work at to join)
                  campaign targets CAMPAIGN_ID --add acme.com,linkedin.com/company/globex [--remove old.com] | --set FILE|-  (one company per line; saves a new revision)
Playbooks: playbook list [--archived] [--limit N --cursor ID]|actions|show ID [--revision N]|save --file REQUEST.json|archive ID|restore ID|delete ID|progress PARTICIPATION_ID|record --file REQUEST.json|suggest --file REQUEST.json|suggestions|decide --file REQUEST.json  (audienti playbook SUBCOMMAND --help for the request shape)
Analytics: analytics show --from ISO --to ISO [--campaign ID] [--playbook-version ID] [--format json|csv]
           analytics outbound [--workspace ID] [--days N | --from ISO --to ISO] [--by sender|action|day] [--format json|csv]
           analytics activity [--workspace ID] [--days N | --from ISO --to ISO] [--format json|csv]
           analytics cohorts [--workspace ID] [--stage goal|KEY] [--cohorts N] [--horizon N] [filters] [--format json|csv]
           analytics aging [--workspace ID] [--threshold-days N] [filters] [--format json|csv]
           analytics filters [--workspace ID]  (lists campaign, owner, offer, audience and tag values)
           (filters: --campaign ID --owner ID --offer ID --audience ID --tag TAG; also accepted by analytics show)
Pipeline: pipeline show [--campaign ID] [--playbook-version ID]
Connections: connections list|register --file REQUEST.json|report --file REQUEST.json
Discovery writes use --file INPUT.json, --workspace ID and stable --request-id UUID
Workspace commands: workspace init|list|create|show|search|invite|invitations|use
Notifications: workspace notifications --workspace ID [--unread-only true] [--cursor FILE.json]
Read state: workspace notification-read --workspace ID --key KEY --read true|false [--through OBSERVED_AT]
Search: workspace search --workspace ID --query TEXT [--people-only true] [--recent FILE.json]
Invitation commands: workspace invitation show|accept|decline|retry|cancel ID
Options: --workspace ID --name NAME --request-id UUID --email EMAIL --generation N
Optional private profile: --profile PATH (outside this repository), or the AUDIENTI_PROFILE variable. --profile wins.
Save an environment token: profile save --scope account:read|workspace:access|agents:manage --profile PATH
Start local MCP stdio server: mcp
--json writes the API response envelope.
`;

// Example inputs for the commands that save prospects, so `--help` shows a working shape.
const examples = {
  'prospects observation create': { requestId: 'UUID', kind: 'person', source: { provider: 'linkedin', url: 'https://www.linkedin.com/in/jane-doe' }, fields: { name: 'Jane Doe', title: 'VP Sales', imageUrl: 'https://media.licdn.com/dms/image/PHOTO_ID' }, provenance: { url: 'https://example.com/team/jane' }, observedAt: '2026-01-01T00:00:00Z', skill: { id: 'signal-prospect-research', version: '1' } },
  'prospects citation create': { requestId: 'UUID', source: { kind: 'prospect', id: 'PERSON_PROSPECT_ID' }, target: { kind: 'prospect', id: 'COMPANY_PROSPECT_ID' }, edgeType: 'works_at', roles: [{ roleId: 'role-1', title: 'VP Sales', current: true, observedAt: '2026-01-01T00:00:00Z' }] },
  'prospects evidence create': { requestId: 'UUID', subject: { kind: 'person', prospectId: 'PROSPECT_ID' }, campaignId: 'CAMPAIGN_ID', campaignRevision: 1, kind: 'interpretation', data: { conclusion: 'Leads a 40-person sales team', reason: 'Team page lists her as VP Sales' }, sourceUrl: 'https://example.com/team', observedAt: '2026-01-01T00:00:00Z', skill: { id: 'signal-prospect-research', version: '1' } },
  'prospects contacts record': { kind: 'email|linkedin|mobile|phone', value: 'jane@example.com, or +15551234567 for a mobile or a direct office phone', reason: 'Published on https://example.com/contact', requestId: 'UUID', provenance: { observationId: 'OBSERVATION_ID' } },
  'campaigns qualification submit': { requestId: 'UUID', campaignId: 'CAMPAIGN_ID', campaignRevision: 1, prospectId: 'PERSON_PROSPECT_ID', companyProspectId: 'COMPANY_PROSPECT_ID', companyIcp: { status: 'pass|fail|unverified', evidenceIds: ['COMPANY_EVIDENCE_ID'] }, personIcp: { status: 'pass|fail|unverified', evidenceIds: ['PERSON_EVIDENCE_ID'] }, signal: { status: 'match|no_match|unverified|not_required', evidenceIds: [] }, fit: { status: 'high|moderate|low|no_fit|unscored', evidenceIds: ['PERSON_EVIDENCE_ID'], reason: 'why' }, skill: { id: 'signal-prospect-research', version: '1' } },
};

function commandHelp() {
  const words = args.slice(0, args.findIndex(value => value.startsWith('-'))).filter(Boolean);
  const lines = usage.split('\n');
  let shown = [];
  for (let n = Math.min(words.length, 2); n > 0 && shown.length === 0; n--) {
    const prefix = words.slice(0, n).join(' ');
    shown = lines.filter(line => line.includes(prefix));
  }
  console.log(shown.length ? shown.map(line => line.trim()).join('\n') : usage);
  const example = Object.entries(examples).find(([command]) => words.join(' ').startsWith(command));
  if (example) console.log(`\nExample --file INPUT.json for ${example[0]}:\n${JSON.stringify(example[1], null, 1)}\nSteps and rules: the "Save prospects and contacts" section of llms.txt.`);
}

async function main() {
  if (args[0] === 'playbook' && args.slice(1).some(value => value === '--help' || value === '-h')) { console.log(playbookHelp(args[1]?.startsWith('-') ? undefined : args[1])); return; }
  if (args.length > 1 && args.slice(1).some(value => value === '--help' || value === '-h') && !['tools', 'call', 'skills'].includes(args[0])) { commandHelp(); return; }
  if(args[0]==='prospects'&&['intake','conversation'].includes(args[1])){const {accountIntakeCli}=await import('./account-intake.mjs');await accountIntakeCli(args);return;}
  if(args[0]==='sender'){const {senderAccountsCli}=await import('./sender-accounts.mjs');await senderAccountsCli(args);return;}
  if(args[0]==='prospecting'){const {prospectingSettingsCli}=await import('./prospecting-settings.mjs');await prospectingSettingsCli(args);return;}
  if(args[0]==='prospects'&&args[1]==='replies'){const {accountRepliesCli}=await import('./account-replies.mjs');await accountRepliesCli(args);return;}
  if(args[0]==='prospects'&&args[1]==='contacts'){const {recipientsCli}=await import('./recipients.mjs');await recipientsCli(args);return;}
  if(args[0]==='usage'){const {usageCli}=await import('./usage.mjs');await usageCli(args);return;}
  if(args[0]==='intent'){const {intentCli}=await import('./intent.mjs');await intentCli(args);return;}
  if(args[0]==='audit'){const {auditCli}=await import('./audit.mjs');await auditCli(args);return;}
  if(args[0]==='secret'||args[0]==='secrets'){const {secretsCli}=await import('./secrets.mjs');await secretsCli(args);return;}
  if(args[0]==='budgets'){const {budgetsCli}=await import('./budgets.mjs');await budgetsCli(args);return;}
  if(args[0]==='guardrails'||args[0]==='dnc'){const {guardrailsCli}=await import('./guardrails.mjs');await guardrailsCli(args);return;}
  if(args[0]==='prospects'&&args[1]==='suppression'){const {suppressionCli}=await import('./suppression.mjs');await suppressionCli(args);return;}
  if(args[0]==='call'){const {callCli}=await import('./tools.mjs');await callCli(args);return;}
  if(args[0]==='tools'){const {toolsCli}=await import('./tools.mjs');await toolsCli(args);return;}
  if(['topics','posts'].includes(args[0])){const {contentCli}=await import('./content.mjs');await contentCli(args);return;}
  if(args[0]==='work'&&args[1]==='execution'){const {workExecutionCli}=await import('./work-execution.mjs');await workExecutionCli(args);return;}
  if(args[0]==='work'&&args[1]==='changes'){const {workFeedbackCli}=await import('./work-feedback.mjs');await workFeedbackCli(args);return;}
  if(args[0]==='work'){const {workCli}=await import('./work.mjs');await workCli(args);return;}
  if(['prospects','campaigns'].includes(args[0])){const {discoveryCli}=await import('./discovery.mjs');await discoveryCli(args);return;}
  if(args[0]==='analytics'&&['cohorts','aging','filters'].includes(args[1])){const {cohortCli}=await import('./cohorts.mjs');await cohortCli(args);return;}
  if(args[0]==='analytics'&&['outbound','activity'].includes(args[1])){const {outboundCli}=await import('./outbound.mjs');await outboundCli(args);return;}
  if(['playbook','analytics','pipeline','connections'].includes(args[0])){const {progressCli}=await import('./progress.mjs');await progressCli(args);return;}
  if(args[0]==='campaign'){const {campaignCli}=await import('./campaigns.mjs');await campaignCli(args);return;}
  if(args[0]==='audience'){const {audienceCli}=await import('./audiences.mjs');await audienceCli(args);return;}
  if(args[0]==='file'){const {fileCli}=await import('./files.mjs');await fileCli(args);return;}
  if(args[0]==='ask'){const {askCli}=await import('./questions.mjs');await askCli(args);return;}
  if(args[0]==='questions'){const {questionsCli}=await import('./questions.mjs');await questionsCli(args);return;}
  if(args[0]==='hand-tasks'){const {handTasksCli}=await import('./hand-tasks.mjs');await handTasksCli(args);return;}
  if(args[0]==='queue'){const {queueCli}=await import('./queue.mjs');await queueCli(args);return;}
  if(args[0]==='attachments'){const {attachmentsCli}=await import('./attachments.mjs');await attachmentsCli(args);return;}
  if(args[0]==='outcomes'){const {outcomesCli}=await import('./outcomes.mjs');await outcomesCli(args);return;}
  if(args[0]==='rooms'){const {roomsCli}=await import('./rooms.mjs');await roomsCli(args);return;}
  if(args[0]==='kv'){const {kvCli}=await import('./kv.mjs');await kvCli(args);return;}
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
    if (!profileConfig.token) throw new Error('whoami needs a human account token. Agents confirm their connection with: audienti workspace list --profile PATH');
    args.splice(profileIndex, 2);
  } else if (args[0] === 'whoami' && profileIndex < 0 && process.env.AUDIENTI_PROFILE && !(process.env.AUDIENTI_API_URL && process.env.AUDIENTI_API_TOKEN)) {
    // The profile named by AUDIENTI_PROFILE (#448), unless the URL and token are in the environment.
    const { configuration } = await import('./workspaces.mjs');
    profileConfig = configuration(undefined, 'account:read');
    if (!profileConfig.token) throw new Error('whoami needs a human account token, and AUDIENTI_PROFILE holds none. Agents confirm their connection with: audienti workspace list');
  }
  if (args[0] !== 'whoami' || args.length > 2 || (args[1] && args[1] !== '--json')) throw new Error('Unknown command or option. Use audienti --help.');
  const rawUrl = profileConfig ? profileConfig.url : process.env.AUDIENTI_API_URL;
  const token = profileConfig ? profileConfig.token : process.env.AUDIENTI_API_TOKEN;
  if (!rawUrl || !token) throw new Error('Set AUDIENTI_API_URL and AUDIENTI_API_TOKEN, or pass --profile PATH (or set AUDIENTI_PROFILE) to a profile with an account:read token. Create a token from your Account page.');
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

main().catch(error => { console.error(JSON.stringify({ error: error.toJSON ? error.toJSON() : { code: 'client_error', message: error.message } })); process.exitCode = 1; });
