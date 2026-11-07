#!/usr/bin/env node
import { clientHeaders, CLI_VERSION, versionRefusal, clientUpdateGuidance, clientError } from './client-version.mjs';
if (process.argv.length === 3 && ['--version', '-v', 'version'].includes(process.argv[2])) { console.log(CLI_VERSION); process.exit(0); }
import { isAssignmentCommand, assignmentCli } from './assignment.mjs';
import { playbookHelp } from './playbook-help.mjs';
// The CLI is an HTTP client. It has no database access or separate business rules.
const args = process.argv.slice(2);
const usage = `Profiles: audienti profiles list|search|get ID | match evaluate|apply SOURCE CANDIDATE | history RESOLUTION (saved workspace records)
Skills: audienti skills list [--compact]|show SKILL|read SKILL RESOURCE|helper NAME --file INPUT.json|- [--json]
Tools: audienti call TOOL ['JSON'] | tools search "WORDS"|get TOOL|list|runs|balance [--help]
Sender: audienti sender accounts list|get|alias|register|bind|unbind|state|workspaces|automation|activity report [--profile PATH]
Managed accounts: audienti sender managed list|connect [--provider linkedin|whatsapp] [--workspace ID] [--profile PATH] (connect: the user only; returns a sign-in link)
                  audienti sender managed plan MANAGED_ACCOUNT_ID --plan free|premium_career|premium_business|premium_all_in_one|sales_navigator_core|sales_navigator_advanced|recruiter_lite|none [--workspace ID]  (the user only; sets the connection note length; none clears it)
                  audienti sender managed post create MANAGED_ACCOUNT_ID (--text TEXT|--text-file PATH) [--attachment ID] [--reason TEXT] [--request-id UUID]  (publish a post you wrote; to retry after a timeout, repeat the same --request-id so it never posts twice; the account's Publish posts mode decides: Automatic posts it, Draft for approval saves it for the owner, Off refuses)
                  audienti sender managed post list [--account ID] [--state draft|approved|posting|published|rejected|failed|unknown]; post get POST_ID
                  audienti sender managed post approve POST_ID [--text TEXT]; post reject POST_ID [--reason TEXT]  (the account owner, a person, only)
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
Version: audienti --version | -v | version (prints the installed version)

  AUDIENTI_API_URL    Backend base URL including /api/v1
  AUDIENTI_API_TOKEN  API token from Settings > API tokens (Read account for whoami; Manage workspaces for other commands)

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
Work: work plan save  (audienti work --help lists the options of each work command)
Work: work list|show|approve|withdraw-approval|cancel|skip|eligibility|activity
Activity: work activity --workspace ID [--search TEXT] [--cursor-at ISO --cursor-id ID]
Work list: work list --workspace ID [--order oldest|priority] [--queue review|blocked|activity]
           a plan that only waits for its cadence is in neither review nor blocked; it returns to review when the wait ends
Work writes: --file INPUT.json; human review needs a human workspace:access token
Audiences: audience options --kind industries|locations|sizes|types|seniorities|titles|functions [--q TEXT]
           audience list|show ID|create|update ID|archive ID|restore ID [--json]
           audience summary [--audience ID]|people ID|companies ID
           audience test ID --url LINKEDIN_URL --request-id UUID  (spends hosted credits unless the profile is saved)
Files: file upload PATH --type MIME|list|prepare|register|download|delete ID (personal files, human token only)
Operator Custom steps: hand-tasks [list [--state open|ready|done|skipped]]|show ID|done ID --outcome TEXT [--notes TEXT] [--result replied|meeting_booked]|skip ID --reason TEXT|event ID [--name TEXT]  (a person does a Custom step by hand and records what happened)
Queue: audienti queue [list]|next|claim ID [--note TEXT]|done ID [--note TEXT]|skip ID --note TEXT [--reason-code CODE]|release ID [--workspace ID]  (start here after you connect; without --workspace an agent reads every workspace its user approved it in; done or skip again with a new --note corrects the note of a finished task)
Runs: audienti runs [list] [--workspace ID] [--agent ID] [--status all|running|done|failed] [--cursor-at ISO_DATE --cursor-id ID] (includes plain skip reasons and codes)
Attachments: audienti attachments upload FILE [--duration SECONDS]  (store an image or voice note, get its id for content.attachments)
Outcome checks: audienti outcomes report TASK_ID --file RESULTS.json  (results for the people an outcomes.check task lists)
Saved posts: audienti posts list [--topic-id ID]|get ID  (savedByOperationId names the tool run that saved a post; read it with audienti tools runs get ID)
Saved topics: audienti topics list|get ID|create --input FILE --request-id UUID
Questions: audienti ask "QUESTION" [--context TEXT] [--option TEXT]... [--campaign ID] [--task ID]  (questions for your user go to Operator, not chat)
           audienti questions [list] [--state open|answered|withdrawn|all] | show ID | withdraw ID | answer ID --answer TEXT
Rooms: audienti rooms directory|inbox|ack|send|thread|threads|create|list|read|retire|restore|redact|resume|pause|profile|hook|watch|wait (audienti rooms help)
KV: audienti kv get KEY|set KEY VALUE [--json] [--nx] [--if-version N] [--ttl 7d|--expires-at TIME]|list [--prefix P]|search [--key TEXT] [--value TEXT]|delete KEY  (small state between runs; never credentials)
Offers: offer list|show ID|create|update ID|archive ID|restore ID [--json]
Offer options: --file FIELDS.json --request-id UUID --expected-revision N --revision N --archived true|false
  audienti prospects replies set|get|list PERSON --workspace ID [--evidence EVIDENCE] [--file INPUT.json]
Account intake: prospects intake --workspace ID --file INPUT.json
                prospects conversation append|list PERSON --workspace ID
Discovery: prospects list|get ID|timeline ID [--limit N]|observation create|citation create|evidence create
           prospects contacts list|record PERSON [--file INPUT.json] [--request-id UUID] --workspace ID
           prospects contacts get|retire|whatsapp-check PERSON CONTACT [--file INPUT.json] --workspace ID
           prospects suppression get|set ID --workspace ID
           prospects duplicates list --workspace ID | get|merge|dismiss PERSON --workspace ID [--primary PROFILE_ID | --keep-both]  (same name and photo: the newer record is held until you decide; a merge with no flag retires the other LinkedIn channel and says which)
           prospects outreach-profile PERSON --primary PROFILE_ID --workspace ID  (change the LinkedIn profile outreach uses for a person; the other LinkedIn channel is retired and the chosen one is used again if it was retired)
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
           intent list [--playbook ID] [--workspace ID]  (the closed set of message labels: name, direction, event, channels, typed detail; --playbook adds that playbook's own labels as customLabels; output is JSON)
           intent suggest (--text TEXT | --text-file PATH) --channel email|linkedin [--direction inbound|outbound] [--context TEXT] [--request-id UUID] [--workspace ID]  (paid: what a message may mean, read by a model; prints the price per 1M input tokens first; suggests labels with a quote and reason, records nothing; keep one with intent record)
           intent record --person ID --evidence ID --label NAME --quote TEXT --reason TEXT [--confidence high|medium|low] [--request-id UUID] [--participation ID] [--workspace ID]  (what a stored message means; get EVIDENCE from prospects conversation append|list; --file LABELS.json for several labels or a typed detail such as a stop result or a meeting time; every label is checked and a refusal says what to fix; a message you sent that asks for a meeting takes --label meeting_requested on its outbound evidence)
           intent correct --person ID --event ID (--label NAME --quote TEXT --reason TEXT [--confidence high|medium|low] | --file LABEL.json | --retract) [--request-id UUID] [--workspace ID]  (a person changes or withdraws one label; the old one stays in the history; a change that routes the person elsewhere opens a decision and a change away from a stop never lifts it until a person confirms; an agent token is refused)
           decision list [--state open|decided|all] [--person ID] [--participation ID] [--limit N] [--workspace ID]  (what Operator asks the person when the rules do not decide; an open decision holds its person)
           decision options ID [--workspace ID]  (one decision with the options the playbook allows)
           decision ask --participation ID [--reason TEXT] [--request-id UUID] [--workspace ID]  (ask the person to decide about one running person)
           decision prepare ID --recommended OPTION_ID --option OPTION_ID=ANALYSIS ... [--file PREPARE.json] [--request-id UUID] [--workspace ID]  (an agent adds its view: two to five options, one line each)
           decision answer ID --option OPTION_ID [--name NAME [--title TEXT] [--email ADDRESS] [--linkedin-url URL]] [--workspace ID]  (a person picks; the move runs once; the name goes with name_person)
           audit list [--workspace ID] [--since 7d] [--actor agent|person] [--category NAME] [--format json|csv]
           budgets set --workspace ID [--agent ID --cap N|none] [--new-agent-cap N|none] [--at-limit pause|ask] [--alert80 on|off]  (alert80 covers Operator and email at 80%)
Qualification: campaigns qualification submit --file INPUT.json
Campaign summary: campaign summary [--workspace ID]  (campaign counts per state, and per campaign its audience, offer, playbook, goal stage, people, engaged and at-goal counts)
Find prospects: campaign find CAMPAIGN_ID --count N --max-credits C  (searches with the audience filters, checks each person, admits only fits; stops at N fits or the credit cap and reports the spend)
                campaign check CAMPAIGN_ID --url LINKEDIN_URL [--request-id UUID] [--source-url URL --source-industry TEXT [--source-kind website|register|other] [--source-location TEXT] [--source-note TEXT]]  (checks one person the same way; reuse the request ID after an interruption; a source confirms a company with no LinkedIn page)
Target companies: campaign targets CAMPAIGN_ID [--limit N --after CURSOR]  (reads the companies people must work at to join)
                  campaign targets CAMPAIGN_ID --add acme.com,linkedin.com/company/globex [--remove old.com] | --set FILE|-  (one company per line; saves a new revision)
Playbooks: playbook list [--archived] [--limit N --cursor ID]|actions|show ID [--revision N]|save --file REQUEST.json|archive ID|restore ID|draft show ID|save ID --file REQUEST.json|discard ID [--expected-updated-at T]|publish ID [--request-id UUID]|rules show ID|rules save ID --file REQUEST.json|delete ID|progress PARTICIPATION_ID|record --file REQUEST.json|event PARTICIPATION_ID --kind KIND --reason TEXT  (audienti playbook SUBCOMMAND --help for the request shape)
Newer audience: campaign show CAMPAIGN_ID  (its audience says the revision it uses, the newest revision and the rules a move adds and removes)
                campaign use-audience CAMPAIGN_ID [--expected-revision N]  (moves the campaign to the newest audience revision; people already in it stay; an audit event records it. Without --expected-revision it uses the campaign's current revision number. audienceSwitch.changed is false when it was already on the newest revision)
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
Save an environment token: profile save --scope account:read|workspace:read|workspace:access|agents:manage --profile PATH
Tokens: token show [--profile PATH]  (what the token can do; workspace:read can look but is refused on every change)
Start local MCP stdio server: mcp  (audienti mcp --help for the settings)
--json writes the API response envelope.
`;

const MCP_HELP = `audienti mcp starts the MCP server on stdio. An agent app runs it as a command; do not type it in a shell.
Settings come from the environment of that command:
  AUDIENTI_PROFILE   the profile file made by agent connect or profile save (the usual way)
  AUDIENTI_API_URL and AUDIENTI_API_TOKEN   instead of a profile: the API URL ending in /api/v1 and a token
The workspace: a tool that works in a workspace takes workspaceId in its input. Call workspace_select once with a workspaceId to set a default for the session.
Tool names follow the commands: playbook_get for playbook show, playbook_draft_get for playbook draft show.
Errors name the MCP tool to call next, not the command.`;
// Example inputs for the commands that save prospects, so `--help` shows a working shape.
const examples = {
  'decision prepare': { recommended: 'snooze_30', options: [{ id: 'snooze_30', analysis: 'They said ask again in March, so wait a month.' }, { id: 'continue', analysis: 'Keep the plan; a follow-up may go this week.' }] },
  'prospects conversation append': { requestId: 'UUID', item: { source: { provider: 'email', accountRef: 'you@yourcompany.com', itemId: 'PROVIDER_MESSAGE_ID', threadId: null }, payload: { direction: 'outbound', conversationType: 'direct', occurredAt: '2026-11-06T14:00:00Z', subject: 'Ten minutes on late invoices?', body: 'Hi Jordan, could we find 20 minutes next week?', participants: null } } },
  'intent correct': { label: 'not_interested', quote: 'not a fit for us right now', reason: 'They decline, so this is not interest.' },
  'intent record': [{ label: 'stop', quote: 'please stop writing to me', reason: 'They ask us to stop.', result: { type: 'reply.stop', scope: 'person' } }],
  'prospects observation create': { requestId: 'UUID', kind: 'person', source: { provider: 'linkedin', url: 'https://www.linkedin.com/in/jane-doe' }, fields: { name: 'Jane Doe', title: 'VP Sales', imageUrl: 'https://media.licdn.com/dms/image/PHOTO_ID' }, provenance: { url: 'https://example.com/team/jane' }, observedAt: '2026-01-01T00:00:00Z', skill: { id: 'signal-prospect-research', version: '1' } },
  'prospects citation create': { requestId: 'UUID', source: { kind: 'prospect', id: 'PERSON_PROSPECT_ID' }, target: { kind: 'prospect', id: 'COMPANY_PROSPECT_ID' }, edgeType: 'works_at', roles: [{ roleId: 'role-1', title: 'VP Sales', current: true, observedAt: '2026-01-01T00:00:00Z' }] },
  'prospects evidence create': { requestId: 'UUID', subject: { kind: 'person', prospectId: 'PROSPECT_ID' }, campaignId: 'CAMPAIGN_ID', campaignRevision: 1, kind: 'interpretation', data: { conclusion: 'Leads a 40-person sales team', reason: 'Team page lists her as VP Sales' }, sourceUrl: 'https://example.com/team', observedAt: '2026-01-01T00:00:00Z', skill: { id: 'signal-prospect-research', version: '1' } },
  'prospects contacts whatsapp-check': { requestId: 'UUID', managedAccountId: 'MANAGED_ACCOUNT_ID', approved: false },
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
  const example = Object.entries(examples).find(([command]) => words.join(' ').startsWith(command) || (words.length > 0 && command.startsWith(words.join(' '))));
  if (example) console.log(`\nExample --file INPUT.json for ${example[0]}:\n${JSON.stringify(example[1], null, 1)}\n${example[0].startsWith('decision') ? 'Choose option ids from `audienti decision options ID`. One plain line each, at most 140 characters, no IDs or error codes.' : example[0].startsWith('intent') ? `\nA message you sent that asks for a meeting (store it first with prospects conversation append, direction outbound):\naudienti intent record --person PERSON --evidence EVIDENCE --label meeting_requested --quote "find 20 minutes next week" --reason "We ask for a call next week."\nRules: the "Label a message with its words" and "Label a message you sent" sections of the getting-started replies reference.` : 'Steps and rules: the "Save prospects and contacts" section of llms.txt.'}`);
}

/** Says what is wrong with a command no handler took, instead of one message for every case. */
function unknownCommandMessage(words) {
  const first = words[0];
  if (first === undefined) return 'Give a command. Use audienti --help.';
  if (first.startsWith('-')) return `Put the command first, then its options: audienti COMMAND [--workspace ID] [--profile PATH]. "${first}" is an option, not a command. Use audienti --help.`;
  if (first === 'mcp') return 'mcp starts the local MCP server and takes no options. Run: audienti mcp';
  return `"${first}" is not an audienti command. Use audienti --help for the commands. Most commands also take --workspace ID, and --profile PATH when the profile is not set in AUDIENTI_PROFILE.`;
}

async function main() {
  if (args[0] === 'playbook' && args.slice(1).some(value => value === '--help' || value === '-h')) { console.log(playbookHelp(args[1]?.startsWith('-') ? undefined : ['draft', 'rules'].includes(args[1]) && args[2] && !args[2].startsWith('-') ? `${args[1]}_${args[2]}` : args[1])); return; }
  if (args[0] === 'mcp' && args.length === 2 && (args[1] === '--help' || args[1] === '-h')) { console.log(MCP_HELP); return; }
  if (args[0] === 'work' && !['execution', 'changes'].includes(args[1]) && args.slice(1).some(value => value === '--help' || value === '-h')) { const {workHelp}=await import('./work.mjs'); const sub = args[1]?.startsWith('-') ? undefined : args[1] === 'plan' ? 'plan save' : args[1]; console.log(workHelp(sub)); return; }
  if (args.length > 1 && args.slice(1).some(value => value === '--help' || value === '-h') && !['tools', 'call', 'skills'].includes(args[0])) { commandHelp(); return; }
  if(args[0]==='prospects'&&['intake','conversation'].includes(args[1])){const {accountIntakeCli}=await import('./account-intake.mjs');await accountIntakeCli(args);return;}
  if(args[0]==='sender'){const {senderAccountsCli}=await import('./sender-accounts.mjs');await senderAccountsCli(args);return;}
  if(args[0]==='prospecting'){const {prospectingSettingsCli}=await import('./prospecting-settings.mjs');await prospectingSettingsCli(args);return;}
  if(args[0]==='prospects'&&args[1]==='replies'){const {accountRepliesCli}=await import('./account-replies.mjs');await accountRepliesCli(args);return;}
  if(args[0]==='prospects'&&args[1]==='contacts'){const {recipientsCli}=await import('./recipients.mjs');await recipientsCli(args);return;}
  if(args[0]==='runs'){const {runsCli}=await import('./runs.mjs');await runsCli(args);return;}
  if(args[0]==='usage'){const {usageCli}=await import('./usage.mjs');await usageCli(args);return;}
  if(args[0]==='decision'){const {decisionCli}=await import('./decision.mjs');await decisionCli(args);return;}
  if(args[0]==='intent'){const {intentCli}=await import('./intent.mjs');await intentCli(args);return;}
  if(args[0]==='audit'){const {auditCli}=await import('./audit.mjs');await auditCli(args);return;}
  if(args[0]==='secret'||args[0]==='secrets'){const {secretsCli}=await import('./secrets.mjs');await secretsCli(args);return;}
  if(args[0]==='budgets'){const {budgetsCli}=await import('./budgets.mjs');await budgetsCli(args);return;}
  if(args[0]==='guardrails'||args[0]==='dnc'){const {guardrailsCli}=await import('./guardrails.mjs');await guardrailsCli(args);return;}
  if(args[0]==='prospects'&&args[1]==='suppression'){const {suppressionCli}=await import('./suppression.mjs');await suppressionCli(args);return;}
  if(args[0]==='prospects'&&(args[1]==='duplicates'||args[1]==='outreach-profile')){const {duplicatesCli}=await import('./duplicates.mjs');await duplicatesCli(args);return;}
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
  if (['workspace', 'profile', 'token'].includes(args[0])) { const { workspaceCli } = await import('./workspaces.mjs'); await workspaceCli(args); return; }
  if (args[0] === 'profiles') { const { profilesCli } = await import('./profiles.mjs'); await profilesCli(args); return; }
  if (args[0] === 'skills') { const { skillsCli } = await import('./skills.mjs'); await skillsCli(args); return; }
  if (args[0] === 'mcp' && args.length === 1) { await import('./mcp.mjs'); return; }
  if (args.length === 0 || (args.length === 1 && ['--help', '-h'].includes(args[0]))) { console.log(usage); return; }
  let profileConfig;
  const profileIndex = args.indexOf('--profile');
  if (args[0] === 'whoami' && profileIndex > 0 && args[profileIndex + 1]) {
    const { configuration } = await import('./workspaces.mjs');
    profileConfig = configuration(args[profileIndex + 1], 'account:read');
    if (!profileConfig.token) throw new Error('whoami needs a human account token with Read account (account:read), made in Settings > API tokens. Agents confirm their connection with: audienti workspace list --profile PATH');
    args.splice(profileIndex, 2);
  } else if (args[0] === 'whoami' && profileIndex < 0 && process.env.AUDIENTI_PROFILE && !(process.env.AUDIENTI_API_URL && process.env.AUDIENTI_API_TOKEN)) {
    // The profile named by AUDIENTI_PROFILE (#448), unless the URL and token are in the environment.
    const { configuration } = await import('./workspaces.mjs');
    profileConfig = configuration(undefined, 'account:read');
    if (!profileConfig.token) throw new Error('whoami needs a human account token with Read account (account:read), made in Settings > API tokens, and AUDIENTI_PROFILE holds none. Agents confirm their connection with: audienti workspace list');
  }
  if (args[0] !== 'whoami') throw new Error(unknownCommandMessage(args));
  if (args.length > 2 || (args[1] && args[1] !== '--json')) throw new Error('whoami takes only --json and --profile PATH. Use audienti --help.');
  const rawUrl = profileConfig ? profileConfig.url : process.env.AUDIENTI_API_URL;
  const token = profileConfig ? profileConfig.token : process.env.AUDIENTI_API_TOKEN;
  if (!rawUrl || !token) throw new Error('Set AUDIENTI_API_URL and AUDIENTI_API_TOKEN, or pass --profile PATH (or set AUDIENTI_PROFILE) to a profile with an account:read token. Create a token in Settings > API tokens.');
  let base;
  try { base = new URL(rawUrl); } catch { throw new Error('AUDIENTI_API_URL must be a valid API base URL.'); }
  if (base.username || base.password || base.search || base.hash) throw new Error('The API URL must not contain credentials, query parameters, or a fragment.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && local)) throw new Error('Use HTTPS for remote API hosts. HTTP is only allowed on loopback.');
  if (base.pathname.replace(/\/$/, '') !== '/api/v1') throw new Error('AUDIENTI_API_URL must end with /api/v1.');
  base.pathname = '/api/v1/account';
  let response;
  try {
    response = await fetch(base, { headers: { ...clientHeaders(profileConfig ?? {}), Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(10_000) });
  } catch { throw new Error('Could not reach the API. Check its URL and availability. Redirects are not followed.'); }
  let body;
  try { body = await response.json(); } catch { /* Preserve the status-specific refusal below. */ }
  if (versionRefusal(body)) throw new Error(versionRefusal(body));
  if (!response.ok) {
    if (response.status === 401) throw clientError(new Error('Authentication failed. Check whether your token is invalid, expired, or revoked.'),body);
    if (response.status === 403) { if (clientUpdateGuidance(body)) console.error(clientUpdateGuidance(body)); await whoamiWithoutAccount(base, token, args[1] === '--json'); return; }
    throw clientError(new Error(`API request failed (HTTP ${response.status}).`),body);
  }
  if (clientUpdateGuidance(body)) console.error(clientUpdateGuidance(body));
  const data = body?.data;
  if (!data || typeof data.id !== 'string' || !('email' in data) || !('username' in data) || ![data.email, data.username].every(v => v === null || typeof v === 'string')) throw new Error('The API returned an invalid account profile.');
  // Select the documented fields, so an unexpected response cannot print credentials.
  const profile = { id: data.id, email: data.email, username: data.username };
  console.log(args[1] === '--json' ? JSON.stringify({ data: profile }) : `${profile.email ?? profile.username ?? profile.id}\nAccount ID: ${profile.id}`);
}

// What a token without "Read account" can still show (#607): its permission, and the workspaces it reaches. It says which token to add.
const TOKEN_CHOICES = { 'account:read': 'Read account', 'workspace:read': 'Read workspaces and files (read only)', 'workspace:access': 'Manage workspaces and files', 'agents:manage': 'Manage agents' };
async function whoamiWithoutAccount(base, token, json) {
  const add = 'To see the account email and ID, create a second token with "Read account" in Settings > API tokens (scope account:read) and use it with whoami.';
  // Text from the API is shown with control characters removed, and never with the bearer token in it.
  const plain = value => typeof value === 'string' ? value.replaceAll(token, '[removed]').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120) : '';
  const ask = async path => {
    const url = new URL(base); url.pathname = `/api/v1/${path}`;
    try {
      const response = await fetch(url, { headers: { ...clientHeaders(), Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(10_000) });
      const result = await response.json();
      if (versionRefusal(result)) return { updateRequired: versionRefusal(result) };
      if (!response.ok) return { failed: `HTTP ${response.status}`, client: result.client };
      const data = result?.data;
      return data === undefined || data === null ? { failed: 'an invalid response' } : { data, client: result.client };
    } catch { return { failed: 'no usable answer' }; }
  };
  const tokenAnswer = await ask('token');
  if (tokenAnswer.updateRequired) throw new Error(tokenAnswer.updateRequired);
  const info = tokenAnswer.data;
  if (!info || typeof info.scope !== 'string') throw clientError(new Error(`This token lacks account:read permission. ${add}`),tokenAnswer);
  const reaches = info.scope === 'workspace:read' || info.scope === 'workspace:access';
  const answer = reaches ? await ask('workspaces') : undefined;
  if (answer?.updateRequired) throw new Error(answer.updateRequired);
  const clientAnswer = answer?.client ? answer : tokenAnswer;
  if (clientUpdateGuidance(clientAnswer)) console.error(clientUpdateGuidance(clientAnswer));
  const lookupFailed = answer && (answer.failed || !Array.isArray(answer.data)) ? (answer.failed ?? 'an invalid response') : undefined;
  const workspaces = answer && !lookupFailed ? answer.data.filter(row => row && typeof row.id === 'string').map(row => ({ id: plain(row.id), name: plain(row.name) })) : undefined;
  const summary = { kind: plain(info.kind), scope: plain(info.scope), permission: TOKEN_CHOICES[info.scope] ?? plain(info.scope), canChange: info.canChange === true, ...(typeof info.expiresAt === 'string' ? { expiresAt: plain(info.expiresAt) } : {}) };
  // A workspace list that could not be read is not an empty list: say so and exit with an error.
  if (lookupFailed) process.exitCode = 1;
  if (json) { console.log(JSON.stringify({ data: { account: null, token: summary, ...(reaches ? { workspaces: workspaces ?? null } : {}), ...(lookupFailed ? { workspacesError: `Could not read the workspaces (${lookupFailed}).` } : {}), missingScope: 'account:read', next: add } })); return; }
  console.log([`Token: ${summary.permission} (${summary.scope}), ${summary.canChange ? 'can change data' : 'read only'}${summary.expiresAt ? `, expires ${summary.expiresAt}` : ''}`, 'Account: not shown. This token lacks account:read.', add, ...(!reaches ? [] : lookupFailed ? [`Workspaces: could not be read (${lookupFailed}). Run audienti workspace list to try again.`] : ['Workspaces this token reaches:', ...(workspaces.length ? workspaces.map(row => `  ${row.name || '(no name)'}  ${row.id}`) : ['  none'])])].join('\n'));
}

main().catch(error => { console.error(JSON.stringify({ error: error.toJSON ? error.toJSON() : { code: 'client_error', message: error.message } })); process.exitCode = 1; });
