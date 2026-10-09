import { parseArgs } from "node:util";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { ApiError, AudientiClient, DEFAULT_HOST, normalizeHost } from "./api-client.js";
import { configDirectory, configPath, deleteConfig, maskToken, readConfig, writeConfig } from "./config.js";
import { methodologyHelp, skillCatalog, skillDetails } from "./agent-skills.js";

class CommandError extends Error {
  constructor(message, { exitCode = 1 } = {}) {
    super(message);
    this.name = "CommandError";
    this.exitCode = exitCode;
  }
}

const MAX_ALL_PROSPECTS = 1000;
const DEFAULT_LIST_LIMIT = 20;
const MOTION_ALIASES = ["plays", "experiments", "experiment"];
const MOTION_CHANGE_ACTIONS = new Set([
  "create", "update", "update-premise", "clone", "activate", "pause", "archive",
  "add-tag", "remove-tag", "bulk-add-tag", "bulk-remove-tag", "bulk-update-principal",
  "bulk-update-status", "retire-strategy"
]);
const API_MAX_LIST_LIMIT = 100;
const DEFAULT_LOOKUP_TIMEOUT_SECONDS = 60;
const DEFAULT_LOOKUP_POLL_INTERVAL_SECONDS = 2;
const DEFAULT_AUTH_LOGIN_TIMEOUT_SECONDS = 180;
// Start covers signup plus email confirmation, which takes longer than a sign-in.
const DEFAULT_START_LOGIN_TIMEOUT_SECONDS = 900;
const DEFAULT_SETUP_TIMEOUT_SECONDS = 300;
const DEFAULT_PAYMENT_POLL_INTERVAL_SECONDS = 3;
const START_USAGE = "Usage: audienti start [--host https://app.audienti.com] [--no-open] [--json]";
const SETUP_USAGE = "Usage: audienti setup [--url <company_url>] [--city <city> --state <code> --country <code>] [--sell-to <who you sell to>] [--ask <what the prospect says yes to>] [--yes] [--json]";
const SETUP_FLAGS_EXAMPLE = "audienti setup --url https://acme.com --sell-to \"<who you sell to>\" --ask \"<what they say yes to>\" --yes";
const DEFAULT_WRITER_TEST_RUN_TIMEOUT_SECONDS = 180;
const DEFAULT_WRITER_TEST_RUN_POLL_INTERVAL_SECONDS = 2;
const PACKAGE_NAME = "@audienti/cli";
const DEFAULT_NPM_REGISTRY = "https://registry.npmjs.org";
const DEFAULT_PROFILE_IDENTIFIERS = [
  "linkedin/profile",
  "linkedin/company",
  "twitter/profile",
  "phone/profile",
  "email/profile"
];
const DELETE_CONFIRMATION_VALUES = new Set(["yes", "true", "y"]);
const MOTION_STATUS_VALUES = new Set(["draft", "preparing", "active", "closing", "paused", "archived"]);
const PROSPECT_INACTIVE_REASON_VALUES = new Set(["nurture", "non_responsive", "not_fit", "bad_data_404"]);
const PROSPECT_STATUS_VALUES = new Set(["active", ...PROSPECT_INACTIVE_REASON_VALUES, "rejected"]);
const OUTBOUND_METRICS_OUTCOMES = new Set([
  "success",
  "failure",
  "first_attempt_success",
  "succeeded_after_retry",
  "failed_without_retry",
  "failed_after_retry",
  "in_progress",
  "unresolved"
]);
const PROSPECTS_ADD_NOTE_USAGE = "Usage: audienti prospects add-note <prsp_id> (--message <text> [--type <note|steer|voicemail_outreach|video_outreach>] [--engagement-type <key>] | --payload <file.json>) [--json] [--account <acct_id>]";
const PROSPECTS_ADD_STEER_USAGE = "Usage: audienti prospects add-steer <prsp_id> (--message <text> [--engagement-type <key>] | --payload <file.json>) [--json] [--account <acct_id>]";
const PROSPECTS_ADD_PROFILE_USAGE = "Usage: audienti prospects add-profile <prsp_id> --url <profile_url|email|phone> [--json] [--account <acct_id>]";
const PROSPECTS_REPORT_BAD_PROFILE_USAGE = "Usage: audienti prospects report-bad-profile <prsp_id> <prof_id|citation_id> [--json] [--account <acct_id>]";
const PROSPECTS_DESTINATION_USAGE = "Usage: audienti prospects set-destination <prsp_id> [prsp_id...] --type <list|experiment> (--destination <id> | --name <name>) [--mode <add|move>] [--json] [--account <acct_id>]. A new experiment name creates a transition without setup.";
const PROSPECTS_ASSIGN_USAGE = "Usage: audienti prospects assign <prsp_id> [prsp_id...] --assigned-user <id|me|unassign> [--json] [--account <acct_id>]";
const PROSPECTS_MOVE_ACCOUNT_USAGE = "Usage: audienti prospects move-account <prsp_id> --target-account <acct_id> [--assigned-user <id|me>] [--target-motion <motn_id>] [--target-list <list_id>] [--apply] [--json] [--account <source_acct_id>]";
const PROSPECTS_SET_STATUS_USAGE = "Usage: audienti prospects set-status <prsp_id> --status <active|nurture|non_responsive|not_fit|bad_data_404|rejected> [--json] [--account <acct_id>]";
const PROSPECTS_REPLAN_USAGE = "Usage: audienti prospects replan <prsp_id> [--apply] [--json] [--account <acct_id>]";
const PROSPECTS_REENRICH_USAGE = "Usage: audienti prospects reenrich <prsp_id> [--profile <prof_id|citation_id>] [--apply] [--json] [--account <acct_id>]";
const PROSPECTS_REFRESH_QUEUE_USAGE = "Usage: audienti prospects refresh-queue <prsp_id> [--apply] [--json] [--account <acct_id>]";
const PROSPECTS_REJECT_USAGE = "Usage: audienti prospects reject <prsp_id> [--json] [--account <acct_id>]";
const PROSPECTS_NURTURE_USAGE = "Usage: audienti prospects nurture <prsp_id> [--reason <nurture|non_responsive|not_fit|bad_data_404>] [--json] [--account <acct_id>]";
const PROSPECTS_RESTORE_USAGE = "Usage: audienti prospects restore <prsp_id> [--json] [--account <acct_id>]";
const PROSPECTS_LOCK_USAGE = "Usage: audienti prospects lock <prsp_id> [--note <text>] [--kind <protected_relationship|company_policy>] [--json] [--account <acct_id>]";
const PROSPECTS_UNLOCK_USAGE = "Usage: audienti prospects unlock <prsp_id> [--json] [--account <acct_id>]";
const PROSPECTS_CHECK_USAGE = "Usage: audienti prospects check [--json|--csv] [filters] [--account <acct_id>]";
const PROSPECTS_IMPORT_BATCH_USAGE = "Usage: audienti prospects import-batch --file <csv|jsonl|json> [--list <list_id>] [--motion <motn_id>] [--new-list <name>] [--new-transition <name>] [--assigned-user <id|me>] [--json] [--account <acct_id>]";
const OPERATOR_FAILED_DRAFTS_USAGE = "Usage: audienti operator failed-drafts [--json] [filters] [--account <acct_id>]";
const OPERATOR_FAILED_DRAFTS_REQUEUE_USAGE = "Usage: audienti operator failed-drafts requeue (--all | <row_id> [row_id...]) [--limit <n>] [--json] [filters] [--account <acct_id>]";
const INBOX_OPS_QUEUE_USAGE = "Usage: audienti inbox-ops queue [--page <n>] [--offset <n>|--cursor <token>] [--group-by domain] [--json] [--account <acct_id>]";
const INBOX_OPS_BULK_VERBS = {
  ignore: "ignore",
  "filter-sender": "filter_sender",
  "filter-domain": "filter_domain",
  "allow-sender": "allow_sender",
  "allow-domain": "allow_domain"
};
const INBOX_OPS_BULK_LABELS = {
  ignore: "Ignore",
  "filter-sender": "Always filter the sender of",
  "filter-domain": "Always filter the domain of",
  "allow-sender": "Always show the sender of",
  "allow-domain": "Always show the domain of"
};
const INBOX_OPS_SNAPSHOT_FILENAME = "inbox-ops-snapshot.json";
const INBOX_OPS_MAX_PAGES = 50;
const INBOX_OPS_BATCH_SIZE = 50;
const INBOX_OPS_PAGE_ATTEMPTS = 4;
const INBOX_OPS_RETRY_STATUSES = [502, 503, 504];
const INBOX_OPS_RETRY_DELAY_MS = 2000;
const NETWORK_OPS_QUEUE_USAGE = "Usage: audienti network-ops queue [--page <n>] [--offset <n>|--cursor <token>] [--json] [--account <acct_id>]";
const NETWORK_OPS_ACCEPT_USAGE = "Usage: audienti network-ops accept <row_id> [--json] [--account <acct_id>]";
const NETWORK_OPS_DECLINE_USAGE = "Usage: audienti network-ops decline <row_id> [--json] [--account <acct_id>]";
const OPERATOR_PAGINATION_HELP = [
  "Read pagination:",
  "  --page <n>       Positive page number",
  "  --offset <n>     Exact returned next_offset, including zero",
  "  --cursor <token> Opaque returned next_cursor; cannot be combined with --offset",
  "  Follow the printed continuation with the same account and filters, even after an empty page.",
  "  Pagination is not accepted with outcome or requeue operations.",
  ""
];
const INBOX_OPS_FILTERS_USAGE = "Usage: audienti inbox-ops filters [--json] [--account <acct_id>]";
const INBOX_OPS_RULE_USAGE = "Usage: audienti inbox-ops rule <row_id> --scope <sender|domain> --disposition <allow|filter> [--json] [--account <acct_id>]";
const INBOX_OPS_RULE_SET_USAGE = "Usage: audienti inbox-ops rule set --scope <sender|domain> --key <email|domain> --disposition <allow|filter> [--json] [--account <acct_id>]";
const INBOX_OPS_RULE_REMOVE_USAGE = "Usage: audienti inbox-ops rule remove --scope <sender|domain> --key <email|domain> [--json] [--account <acct_id>]";
const INBOX_OPS_ROW_ID_PATTERN = /^inbox_ops_message_[1-9]\d*$/;
const NETWORK_OPS_ROW_ID_PATTERN = /^network_ops_event_[1-9]\d*$/;
const DNC_ADD_USAGE = "Usage: audienti dnc add <email|citation_id|profile_url> [--json] [--account <acct_id>]";
const DNC_IMPORT_USAGE = "Usage: audienti dnc import --file <txt|csv> [--json] [--account <acct_id>]";
const DNC_REMOVE_USAGE = "Usage: audienti dnc remove <dnc_entry_id> [--json] [--account <acct_id>]";
const COMPANY_RULES_CREATE_USAGE = "Usage: audienti company-rules create (--linkedin-url <url> | --domain <domain>) --disposition <monitor|nurture|not_fit|reject> [--name <text>] [--user <account_user_id|email|me>] [--note <text>] [--json] [--account <acct_id>]";
const COMPANY_RULES_UPDATE_USAGE = "Usage: audienti company-rules update <rule_id> [--linkedin-url <url>] [--domain <domain>] [--disposition <monitor|nurture|not_fit|reject>] [--name <text>] [--user <account_user_id|email|me|none>] [--note <text>] [--json] [--account <acct_id>]";
const COMPANY_RULES_REMOVE_USAGE = "Usage: audienti company-rules remove <rule_id> [--json] [--account <acct_id>]";
const COMPANY_RULES_APPLY_USAGE = "Usage: audienti company-rules apply (<rule_id>|--all) [--json] [--account <acct_id>]";
const COMPANY_RULES_SHOW_USAGE = "Usage: audienti company-rules show <rule_id> [--json] [--account <acct_id>]";
const HUBSPOT_SHOW_USAGE = "Usage: audienti hubspot show [--errors] [--limit <n>] [--json] [--account <acct_id>]";
const HUBSPOT_CONNECT_USAGE = "Usage: audienti hubspot connect (--token <private_app_token> | --token-stdin) [--json] [--account <acct_id>]";
const WEBHOOK_STATUS_VALUES = new Set(["enabled", "disabled"]);
const HUBSPOT_DISCONNECT_USAGE = "Usage: audienti hubspot disconnect [--json] [--account <acct_id>]";
const HUBSPOT_SYNC_USAGE = "Usage: audienti hubspot sync [--json] [--account <acct_id>]";
const HUBSPOT_RETRY_USAGE = "Usage: audienti hubspot retry <event_id> [--json] [--account <acct_id>]";
const HUBSPOT_LIST_SYNCS_CREATE_USAGE = "Usage: audienti hubspot list-syncs create --hubspot-list <hubspot_list_id> --signal <signal_id> --source-agent <agent_id> [--json] [--account <acct_id>]";
const HUBSPOT_LIST_SYNCS_UPDATE_USAGE = "Usage: audienti hubspot list-syncs update <list_sync_id> --signal <signal_id> --source-agent <agent_id> [--json] [--account <acct_id>]";
const HUBSPOT_LIST_SYNCS_REMOVE_USAGE = "Usage: audienti hubspot list-syncs remove <list_sync_id> [--json] [--account <acct_id>]";
const HUBSPOT_LIST_SYNCS_SYNC_USAGE = "Usage: audienti hubspot list-syncs sync <list_sync_id> [--json] [--account <acct_id>]";
const WEBHOOKS_LIST_USAGE = "Usage: audienti webhooks list [--json] [--account <acct_id>]";
const WEBHOOKS_CREATE_USAGE = "Usage: audienti webhooks create [--label <text>] [--signal <signal_id>] [--list <list_id>] [--json] [--account <acct_id>]";
const WEBHOOKS_UPDATE_USAGE = "Usage: audienti webhooks update <endpoint_id> [--label <text>] [--status <enabled|disabled>] [--signal <signal_id|none>] [--json] [--account <acct_id>]";
const WEBHOOKS_ROTATE_USAGE = "Usage: audienti webhooks rotate <endpoint_id> [--json] [--account <acct_id>]";
const WEBHOOKS_REMOVE_USAGE = "Usage: audienti webhooks remove <endpoint_id> [--json] [--account <acct_id>]";
const REPLY_ALERTS_SHOW_USAGE = "Usage: audienti reply-alerts show [--json]";
const REPLY_ALERTS_UPDATE_USAGE = "Usage: audienti reply-alerts update [--phone <number|none>] [--sms <true|false>] [--slack <true|false>] [--json]";
const PAYMENT_SHOW_USAGE = "Usage: audienti payment show [--json] [--account <acct_id>]";
const PAYMENT_CODE_USAGE = "Usage: audienti payment code <signup_code> [--json] [--account <acct_id>]";
const BRAND_PROFILE_SHOW_USAGE = "Usage: audienti brand-profile show [--json] [--account <acct_id>]";
const BRAND_PROFILE_UPDATE_USAGE = "Usage: audienti brand-profile update [--voice <text>] [--style <text>] [--do-not-use <text>] [--json] [--account <acct_id>]";
const ACCOUNTS_SHOW_USAGE = "Usage: audienti accounts show [<acct_id>] [--json] [--account <acct_id>]";
const LINKEDIN_LOOKUPS_USAGE = "Usage: audienti linkedin-lookups <company-sizes|company-types|functions|industries|job-titles|locations|seniorities> [--query <text>] [--icp <icp_id>] [--json] [--account <acct_id>]";
const LINKEDIN_LOOKUP_KINDS = new Map([
  ["company-sizes", { path: "company_sizes", query: "none", icp: true }],
  ["company-types", { path: "company_types", query: "none", icp: true }],
  ["functions", { path: "functions", query: "required", icp: true }],
  ["industries", { path: "industries", query: "required", icp: false }],
  ["job-titles", { path: "job_titles", query: "required", icp: true }],
  ["locations", { path: "locations", query: "required", icp: true }],
  ["seniorities", { path: "seniorities", query: "optional", icp: true }]
]);
const TASKS_LIST_USAGE = "Usage: audienti tasks list [--status <open|completed>] [--limit <n>] [--json] [--account <acct_id>]";
const TASKS_ADD_USAGE = "Usage: audienti tasks add --title <text> --due <time> [--prospect <prsp_id>] [--list <list_id>] [--assigned-user <id|me>] [--notes <text>] [--json] [--account <acct_id>]";
const TASKS_COMPLETE_USAGE = "Usage: audienti tasks complete <ptsk_id> [--json] [--account <acct_id>]";
const USERS_ACTIVITY_USAGE = "Usage: audienti users activity [account_user_id|me] [--mode <actor|account_usage|related>] [--window <24h|7d|30d>] [--platform <linkedin|email|gmail>] [--query <text>] [--limit <n>] [--page <n>] [--json] [--account <acct_id>]";
const USERS_AUTOMATION_SHOW_USAGE = "Usage: audienti users automation show <account_user_id|me> [--platform linkedin] [--json] [--account <acct_id>]";
const USERS_AUTOMATION_UPDATE_USAGE = "Usage: audienti users automation update <account_user_id|me> --payload <file.json> [--apply] [--json] [--account <acct_id>]";
const SETUP_PLAY_PREFLIGHT_USAGE = "Usage: audienti setup play preflight [--principal <account_user_id|email|name|me>] [--platform linkedin] [--json] [--account <acct_id>]";
const OFFERS_SHOW_USAGE = "Usage: audienti offers show <offr_id> [--json] [--account <acct_id>]";
const OFFERS_UPDATE_USAGE = "Usage: audienti offers update <offr_id> [--name <text>] [--description <text>] [--url <url>] [--json] [--account <acct_id>]";
const OFFERS_DELETE_USAGE = "Usage: audienti offers delete <offr_id> --confirm <yes|true|Y|y> [--json] [--account <acct_id>]";
const WRITER_TEST_RUN_USAGE = "Usage: audienti writer test-run <prsp_id> [--json] [--mode <plan|report|step>] [--branch <both|no-accept|accepted>] [--step <step_key|row_number>] [--report <rprt_id>] [--no-wait] [--timeout-seconds <n>] [--poll-interval-seconds <n>] [--account <acct_id>]";
const WRITER_TEST_RUN_SHOW_USAGE = "Usage: audienti writer test-run show <prsp_id> <rprt_id> [--json] [--account <acct_id>]";
const MOTIONS_ANALYTICS_USAGE = "Usage: audienti motions analytics <motn_id> [--window 30d] [--json] [--account <acct_id>]";
const MOTIONS_UPDATE_USAGE = "Usage: audienti motions update <motn_id> ([--status <draft|preparing|active|closing|paused|archived>] [--tags <tag[,tag...]>] [--own-post-engagement <true|false>] [--start-date <YYYY-MM-DD|none>] [--end-date <YYYY-MM-DD|none>] [--maximum-company-count <n|none>] [--approach <text>] [--gift <gift_id|none>] | --payload <file.json>) [--json] [--account <acct_id>]";
const CONTENT_PROGRAMS_USAGE = "Usage: audienti content programs [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]";
const CONTENT_PLAN_USAGE = "Usage: audienti content plan <cprg_id|rprt_id> [--report] [--user <id|me>] [--week <n>] [--due] [--json] [--account <acct_id>]";
const CONTENT_PLANS_USAGE = "Usage: audienti content plans [--user <id|me>] [--page <n>] [--json] [--account <acct_id>]";
const CONTENT_POST_REPLY_USAGE = "Usage: audienti content post-reply <cpwi_id> --comment <cctk_id> --body <text> [--user <id|me>] [--json] [--account <acct_id>]";
const CONTENT_SHOW_USAGE = "Usage: audienti content show <cpwi_id> [--json] [--account <acct_id>]";
const CONTENT_POSTS_USAGE = "Usage: audienti content posts [--user <account_user_id|email|name|me>] [--page <n>] [--json] [--account <acct_id>]";
const CONTENT_TRACK_USAGE = "Usage: audienti content track <linkedin_post_url> [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]";
const CONTENT_ENGAGEMENT_USAGE = "Usage: audienti content engagement <cpwi_id> [--json] [--account <acct_id>]";
const CONTENT_FEEDBACK_USAGE = "Usage: audienti content feedback <cpwi_id> (--message <text> | --payload <file.json>) [--json] [--account <acct_id>]";
const CONTENT_APPROVE_USAGE = "Usage: audienti content approve <cpwi_id> [--json] [--account <acct_id>]";
const CONTENT_SCHEDULE_USAGE = "Usage: audienti content schedule <cpwi_id> --at <time> [--json] [--account <acct_id>]";
const CONTENT_PUBLISH_USAGE = "Usage: audienti content publish <cpwi_id> --url <permalink> [--json] [--account <acct_id>]";
const CONTENT_COMMENTS_USAGE = "Usage: audienti content comments [--unresolved] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]";
const CONTENT_REPLY_USAGE = "Usage: audienti content reply <cctk_id> [--body <text>] [--json] [--account <acct_id>]";
const CONTENT_DISMISS_USAGE = "Usage: audienti content dismiss <cctk_id> [--json] [--account <acct_id>]";
const MOTIONS_ADD_TAG_USAGE = "Usage: audienti motions add-tag <motn_id> <tag> [--json] [--account <acct_id>]";
const MOTIONS_REMOVE_TAG_USAGE = "Usage: audienti motions remove-tag <motn_id> <tag> [--json] [--account <acct_id>]";
const MOTIONS_DELETE_USAGE = "Usage: audienti motions delete <motn_id> --confirm <yes|true|Y|y> [--json] [--account <acct_id>]";
const MOTIONS_CLONE_USAGE = "Usage: audienti motions clone <motn_id> --name <text> [--json] [--account <acct_id>]";
const MOTIONS_MOVE_PROSPECTS_USAGE = "Usage: audienti motions move-prospects <source_motn_id> --target <target_motn_id> <prsp_id> [prsp_id...] [--json] [--account <acct_id>]";
const MOTIONS_RUN_DISCOVERY_USAGE = "Usage: audienti motions run-discovery <motn_id> [--target-count <n>] [--json] [--account <acct_id>]";
const MOTIONS_SETUP_STATE_USAGE = "Usage: audienti motions setup-state [--principal <account_user_id|me>] [--json] [--account <acct_id>]";
const MOTIONS_QUICK_START_USAGE = "Usage: audienti motions quick-start --url <company_url> [--city <city> --state <code> --country <code>] [--principal <account_user_id|me>] [--feedback <text>] [--offer-type <type>] [--force] [--confirm] [--wait] [--timeout-seconds <n>] [--poll-interval-seconds <n>] [--json] [--account <acct_id>]";
const MOTIONS_ABM_COMPANIES_LIST_USAGE = "Usage: audienti motions abm-companies <motn_id> list [--json] [--account <acct_id>]";
const MOTIONS_ABM_COMPANIES_ADD_USAGE = "Usage: audienti motions abm-companies <motn_id> add (<domain_or_linkedin_url>... | --file <txt|json>) [--json] [--account <acct_id>]";
const MOTIONS_ABM_COMPANIES_REMOVE_USAGE = "Usage: audienti motions abm-companies <motn_id> remove <row_id> [--json] [--account <acct_id>]";
const MOTIONS_PROFILE_SIGNALS_LIST_USAGE = "Usage: audienti motions profile-signals <motn_id> list [--json] [--account <acct_id>]";
const MOTIONS_PROFILE_SIGNALS_ADD_USAGE = "Usage: audienti motions profile-signals <motn_id> add (<profile_url> [--category <competitor|influencer|partner|customer|recruiter>] | --owned --social-cookie <id>) [--roles <commenters,reactors>] [--json] [--account <acct_id>]";
const MOTIONS_PROFILE_SIGNALS_REMOVE_USAGE = "Usage: audienti motions profile-signals <motn_id> remove <signal_id> [--json] [--account <acct_id>]";
const ICPS_SHOW_USAGE = "Usage: audienti icps show <icp_id> [--json] [--account <acct_id>]";
const ICPS_LIST_USAGE = "Usage: audienti icps list [--status <active|archived|all>] [--tag <tag>] [--json] [--account <acct_id>]";
const ICPS_UPDATE_USAGE = "Usage: audienti icps update <icp_id> ([--name <text>] [--notes <text>] [--discovery-keyword <text>] [--tags <tag[,tag...]>] | --payload <file.json>) [--json] [--account <acct_id>]";
const ICPS_ARCHIVE_USAGE = "Usage: audienti icps archive <icp_id> [--json] [--account <acct_id>]";
const ICPS_RESTORE_USAGE = "Usage: audienti icps restore <icp_id> [--json] [--account <acct_id>]";
const ICPS_ADD_TAG_USAGE = "Usage: audienti icps add-tag <icp_id> <tag> [--json] [--account <acct_id>]";
const ICPS_REMOVE_TAG_USAGE = "Usage: audienti icps remove-tag <icp_id> <tag> [--json] [--account <acct_id>]";
const LISTS_ADD_TAG_USAGE = "Usage: audienti lists add-tag <list_id> <tag> [--json] [--account <acct_id>]";
const LISTS_REMOVE_TAG_USAGE = "Usage: audienti lists remove-tag <list_id> <tag> [--json] [--account <acct_id>]";
const LIST_ROUTING_RULES_LIST_USAGE = "Usage: audienti lists routing-rules <list_id> list [--json] [--account <acct_id>]";
const LIST_ROUTING_RULES_CREATE_USAGE = "Usage: audienti lists routing-rules <list_id> create --payload <file.json> [--json] [--account <acct_id>]";
const LIST_ROUTING_RULES_UPDATE_USAGE = "Usage: audienti lists routing-rules <list_id> update <rule_id> --payload <file.json> [--json] [--account <acct_id>]";
const LIST_ROUTING_RULES_REMOVE_USAGE = "Usage: audienti lists routing-rules <list_id> remove <rule_id> [--json] [--account <acct_id>]";
const LIST_ROUTING_RULES_MOVE_USAGE = "Usage: audienti lists routing-rules <list_id> move <rule_id> <up|down> [--json] [--account <acct_id>]";
const LIST_ROUTING_RULES_APPLY_USAGE = "Usage: audienti lists routing-rules <list_id> apply [--json] [--account <acct_id>]";
const ANALYTICS_PROSPECTS_USAGE = "Usage: audienti analytics prospects [--window 24h] [--cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD] [--motion <motn_id>] [--list <list_id>] [--provenance <source>] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]";
const ANALYTICS_PROSPECTS_COHORT_ANALYSIS_USAGE = "Usage: audienti analytics prospects cohort-analysis [--weeks <n>] [--window 24h] [--motion <motn_id>] [--list <list_id>] [--provenance <source>] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]";
const ANALYTICS_USERS_USAGE = "Usage: audienti analytics users [--user <account_user_id|email|name|me>] [--window 30d | --start YYYY-MM-DD --end YYYY-MM-DD] [--cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD] [--motion <motn_id>] [--list <list_id>] [--provenance <source>] [--platform <linkedin|email|gmail>] [--json] [--account <acct_id>]";
const ANALYTICS_DASHBOARD_USAGE = "Usage: audienti analytics dashboard [--cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD] [--play-tag <tag>] [--motion <motn_id>] [--list <list_id>] [--offer <offr_id>] [--icp <icp_id>] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]";
const ANALYTICS_MOTIONS_USAGE = "Usage: audienti analytics motions [--json] [--account <acct_id>]";
const ANALYTICS_ICPS_USAGE = "Usage: audienti analytics icps [--json] [--account <acct_id>]";
const ANALYTICS_METRICS_USAGE = "Usage: audienti analytics metrics [--cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD | --cohort-preset week-to-date] [--interval <daily|weekly>] [--user <account_user_id|email|name|me>] [--motion <motn_id>] [--play-tag <tag>] [--list <list_id>] [--offer <offr_id>] [--icp <icp_id>] [--social-cookie <scok_id>] [--platform <platform>] [--action <action_key>] [--outcome <success|failure|first_attempt_success|succeeded_after_retry|failed_without_retry|failed_after_retry|in_progress|unresolved>] [--json] [--account <acct_id>]";
const ANALYTICS_STAGES_USAGE = "Usage: audienti analytics stages [--interval weekly|monthly] [--cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD] [--play-tag <tag>] [--motion <motn_id>] [--list <list_id>] [--offer <offr_id>] [--icp <icp_id>] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]";
const ANALYTICS_COHORT_LIST_USAGE = "Usage: audienti analytics cohorts create-list --name <text> --start YYYY-MM-DD --end YYYY-MM-DD [--event connection_request_sent] [--user <account_user_id|email|name|me>] [--note-mode <any|with_note|blank>] [--motion <motn_id>] [--offer <offr_id>] [--icp <icp_id>] [--play-tag <tag>] [--json] [--account <acct_id>]";
const TOOLS_LIST_USAGE = "Usage: audienti tools list [--json]";
const TOOLS_HUMANIZE_USAGE = "Usage: audienti tools humanize --file <path> [--tone <professional|academic|blog|casual|creative|scientific|technical>] [--language <language>] [--async [--wait]] [--json] [--account <acct_id>]";
const TOOL_RUN_FLAGS_USAGE = "[--request-key <key>] [--wait [--timeout-seconds <n>] [--poll-interval-seconds <n>]] [--json] [--account <acct_id>]";
const TOOLS_EMAIL_FIND_USAGE = `Usage: audienti tools email-find (--first-name <name> --last-name <name> --company-domain <domain> | --linkedin-url <url> | --file <csv|jsonl|json>) ${TOOL_RUN_FLAGS_USAGE}`;
const TOOLS_LINKEDIN_ENRICH_USAGE = `Usage: audienti tools linkedin-enrich (--url <linkedin_url> [--kind <person|company>] | --file <csv|jsonl|json>) ${TOOL_RUN_FLAGS_USAGE}`;
const TOOLS_SIGNALS_FIND_USAGE = `Usage: audienti tools signals-find --icp <text> --question <text> [--count <1-10>] [--date-window-days <n>] ${TOOL_RUN_FLAGS_USAGE}`;
const TOOLS_WRITE_USAGE = `Usage: audienti tools write --purpose <text> --audience <text> --fact <text> [--fact <text> ...] --channel <channel> [--tone <tone>] [--subject|--no-subject] [--prospect <prsp_id>] ${TOOL_RUN_FLAGS_USAGE}`;
const TOOLS_RUNS_USAGE = "Usage: audienti tools runs (list [--tool <tool>] [--status <status>] [--limit <n>] [--cursor <id>] | show <trun_id> | results <trun_id> [--limit <n>] [--cursor <n>] | export <trun_id> [--format <csv|json>] [--output <path>]) [--json] [--account <acct_id>]";
const NETWORK_USAGE = "Usage: audienti network (list|export) --cookie <scok_id> [--platform <linkedin|twitter>] [--kind <connection|follow>] [--direction <incoming|outgoing>] [--query <text>] [--limit <n>] [--cursor <n>] [--format <csv|json>] [--output <path>] [--json] [--account <acct_id>]";
const TOOLS_LINKEDIN_REVIEW_USAGE = "Usage: audienti tools linkedin-review --url <linkedin_url> [--icp <icp_id>] [--json] [--account <acct_id>]";
const TOOLS_LINKEDIN_REVIEW_REPORTS_USAGE = "Usage: audienti tools linkedin-review reports [--limit <n>] [--json] [--account <acct_id>]";
const TOOLS_LINKEDIN_REVIEW_SHOW_USAGE = "Usage: audienti tools linkedin-review show <rprt_id> [--json] [--account <acct_id>]";
const TOOLS_LINKEDIN_REVIEW_STATUS_USAGE = "Usage: audienti tools linkedin-review status <rprt_id> [--json] [--account <acct_id>]";
const TOOLS_LINKEDIN_STRATEGY_REVIEW_LIST_USAGE = "Usage: audienti tools linkedin-strategy-review list [--limit <n>] [--json] [--account <acct_id>]";
const TOOLS_LINKEDIN_STRATEGY_REVIEW_CREATE_USAGE = "Usage: audienti tools linkedin-strategy-review create --url <linkedin_profile_url> [--json] [--account <acct_id>]";
const TOOLS_LINKEDIN_STRATEGY_REVIEW_SHOW_USAGE = "Usage: audienti tools linkedin-strategy-review show <rprt_id> [--json] [--account <acct_id>]";
const TOOLS_LINKEDIN_STRATEGY_REVIEW_DELETE_USAGE = "Usage: audienti tools linkedin-strategy-review delete <rprt_id> --confirm <yes|true|Y|y> [--json] [--account <acct_id>]";
const TOOLS_LINKEDIN_STRATEGY_REVIEW_USAGE = [
  TOOLS_LINKEDIN_STRATEGY_REVIEW_LIST_USAGE,
  TOOLS_LINKEDIN_STRATEGY_REVIEW_CREATE_USAGE,
  TOOLS_LINKEDIN_STRATEGY_REVIEW_SHOW_USAGE,
  TOOLS_LINKEDIN_STRATEGY_REVIEW_DELETE_USAGE
].join("\n");
const LISTS_BULK_ADD_TAG_USAGE = "Usage: audienti lists bulk-add-tag --tag <tag> <list_id> [list_id...] [--json] [--account <acct_id>]";
const LISTS_MERGE_USAGE = "Usage: audienti lists merge <list_id> <list_id> [--json] [--account <acct_id>]";
const LISTS_EXPORT_USAGE = "Usage: audienti lists export <list_id> [--output <file.csv>] [--inactive-reason <reason>] [--json] [--account <acct_id>]";
const LIST_ROUTING_RULES_TOGGLE_USAGE = "Usage: audienti lists routing-rules <list_id> toggle <rule_id> [--json] [--account <acct_id>]";
const ICPS_BULK_ADD_TAG_USAGE = "Usage: audienti icps bulk-add-tag --tag <tag> <icp_id> [icp_id...] [--json] [--account <acct_id>]";
const ICPS_CLONE_USAGE = "Usage: audienti icps clone <icp_id> [--json] [--account <acct_id>]";
const ICPS_DELETE_USAGE = "Usage: audienti icps delete <icp_id> --confirm <yes|true|Y|y> [--json] [--account <acct_id>]";
const ICPS_PROSPECTS_USAGE = "Usage: audienti icps prospects <icp_id> [--query <text>] [--limit <n>] [--offset <n> | --page <n>] [--profiles] [--json] [--account <acct_id>]";
const OFFERS_REGENERATE_RESEARCH_USAGE = "Usage: audienti offers regenerate-research <offr_id> [--guidance <text>] [--json] [--account <acct_id>]";
const OFFERS_UPDATE_WRITEUP_USAGE = "Usage: audienti offers update-writeup <offr_id> --description <text> [--json] [--account <acct_id>]";
const OFFERS_ADD_ARTIFACTS_USAGE = "Usage: audienti offers add-artifacts <offr_id> <file> [file...] [--json] [--account <acct_id>]";
const OFFERS_REMOVE_ARTIFACT_USAGE = "Usage: audienti offers remove-artifact <offr_id> <artifact_id> [--json] [--account <acct_id>]";
const OFFERS_ADD_GIFT_USAGE = "Usage: audienti offers add-gift <offr_id> --title <text> [--summary <text>] [--send-url <url>] [--file <path>] [--json] [--account <acct_id>]";
const OFFERS_UPDATE_GIFT_USAGE = "Usage: audienti offers update-gift <offr_id> <gift_id> [--title <text>] [--summary <text>] [--send-url <url>] [--file <path>] [--remove-file] [--status <on|off>] [--json] [--account <acct_id>]";
const OFFERS_TURN_OFF_GIFT_USAGE = "Usage: audienti offers turn-off-gift <offr_id> <gift_id> [--json] [--account <acct_id>]";
const OFFERS_TURN_ON_GIFT_USAGE = "Usage: audienti offers turn-on-gift <offr_id> <gift_id> [--json] [--account <acct_id>]";
const OFFERS_UPDATE_INSIGHT_USAGE = "Usage: audienti offers update-insight <offr_id> <insight_id> [--content <text>] [--source-url <url>] [--status <on|off>] [--json] [--account <acct_id>]";
const OFFERS_TURN_OFF_INSIGHT_USAGE = "Usage: audienti offers turn-off-insight <offr_id> <insight_id> [--json] [--account <acct_id>]";
const OFFERS_TURN_ON_INSIGHT_USAGE = "Usage: audienti offers turn-on-insight <offr_id> <insight_id> [--json] [--account <acct_id>]";
const MOTIONS_CREATE_USAGE = "Usage: audienti motions create --payload <file.json> [--gift <gift_id|none>] [--json] [--account <acct_id>]";
const TASKS_UPDATE_USAGE = "Usage: audienti tasks update <ptsk_id> [--title <text>] [--due <time>] [--notes <text>] [--prospect <prsp_id|\"\">] [--list <list_id|\"\">] [--assigned-user <id|me>] [--json] [--account <acct_id>]";
const TASKS_BULK_UPDATE_USAGE = "Usage: audienti tasks bulk-update --action <complete|reassign> [--assigned-user <id|me>] <ptsk_id> [ptsk_id...] [--json] [--account <acct_id>]";
const SOCIAL_COOKIES_SYNC_MESSAGES_USAGE = "Usage: audienti social-cookies sync-messages <scok_id> [--folder <folder>] [--retry] [--json] [--account <acct_id>]";
const COHORT_STAGE_ORDER = [
  "identified",
  "pre_connect",
  "connect_request",
  "connected",
  "engaged",
  "meeting_requested",
  "meeting_outcome_accepted",
  "meeting_outcome_declined",
  "nurture",
  "non_responsive",
  "delayed",
  "rejected",
  "cancel"
];
const DAY_OF_WEEK_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SEQUENCE_EXPORT_CSV_COLUMNS = [
  "prospect_id",
  "prospect_name",
  "branch",
  "branch_label",
  "step_number",
  "kind",
  "key",
  "stage",
  "channel",
  "scheduled_for",
  "available",
  "status",
  "subject",
  "body",
  "warnings",
  "writer_engine",
  "rationale",
  "guidance",
  "transition_label",
  "disposition",
  "missing_reason",
  "empty_body_reason"
];

export async function run(argv = process.argv.slice(2), deps = {}) {
  const context = {
    env: deps.env || process.env,
    cwd: deps.cwd || process.cwd(),
    fetchImpl: deps.fetch || globalThis.fetch,
    now: deps.now || (() => new Date()),
    sleep: deps.sleep || sleep,
    stdout: deps.stdout || process.stdout,
    stderr: deps.stderr || process.stderr,
    stdin: deps.stdin || process.stdin
  };

  try {
    const exitCode = await dispatch(argv, context);
    return exitCode ?? 0;
  } catch (error) {
    writeLine(context.stderr, `Error: ${error.message}`);
    return error.exitCode ?? 1;
  }
}

async function dispatch(argv, context) {
  const { args, accountOverride } = extractGlobalOptions(argv);
  if (args.length === 0 && !(await readConfig({ env: context.env })).token) return start([], context);
  const helpTopic = helpTopicFromArgs(args);

  if (helpTopic) {
    writeLine(context.stdout, helpFor(helpTopic));
    return 0;
  }

  const implicitHelpTopic = incompleteHelpTopicFromArgs(args);
  if (implicitHelpTopic) {
    writeLine(context.stdout, helpFor(implicitHelpTopic));
    return 0;
  }

  const [resource, action, ...rest] = args;
  const normalizedResource = normalizeResource(resource);
  if (normalizedResource === "skills") return agentSkills(action, rest, context);
  if (normalizedResource === "tools" && action === "gift-research") return giftResearch(rest, context);
  const changesTargeting = ["abm-companies", "company-filters", "profile-signals"].includes(action) && ["add", "remove", "delete"].includes(rest[1]);
  if (normalizedResource === "motions" && (MOTION_CHANGE_ACTIONS.has(action) || changesTargeting)) remindExperimentMethodology(context);
  const parityActionTopic = `${normalizedResource} ${action}`;
  if (PARITY_ACTION_COMMANDS.has(parityActionTopic)) return runParityActionCommand(parityActionTopic, rest, context, { accountOverride });

  if (normalizedResource === "auth" && action === "token") return authToken(rest, context);
  if (normalizedResource === "auth" && action === "login") return authLogin(rest, context);
  if (normalizedResource === "auth" && action === "status") return authStatus(rest, context, { accountOverride });
  if (normalizedResource === "auth" && action === "logout") return authLogout(rest, context);
  if (normalizedResource === "config" && action === "list") return configList(rest, context);
  if (normalizedResource === "update" && action === "check") return updateCheck(rest, context);
  if (normalizedResource === "accounts" && action === "list") return accountsList(rest, context, { accountOverride });
  if (normalizedResource === "accounts" && action === "select") return accountsSelect(rest, context);
  if (normalizedResource === "accounts" && action === "show") return accountsShow(rest, context, { accountOverride });
  if (normalizedResource === "linkedin-lookups") return linkedinLookups(action, rest, context, { accountOverride });
  if (normalizedResource === "users" && action === "list") return usersList(rest, context, { accountOverride });
  if (normalizedResource === "users" && action === "select") return usersSelect(rest, context, { accountOverride });
  if (normalizedResource === "users" && action === "activity") return usersActivity(rest, context, { accountOverride });
  if (normalizedResource === "users" && action === "automation") return usersAutomation(rest, context, { accountOverride });
  if (normalizedResource === "start") return start(args.slice(1), context);
  if (normalizedResource === "setup" && (action === undefined || action.startsWith("--"))) return setupWizard(args.slice(1), context, { accountOverride });
  if (normalizedResource === "setup" && action === "play" && rest[0] === "preflight") return setupPlayPreflight(rest.slice(1), context, { accountOverride });
  if (normalizedResource === "social-cookies" && action === "sync-messages") return socialCookiesSyncMessages(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "list") return offersList(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "show") return offersShow(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "create") return offersCreate(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "update") return offersUpdate(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "delete") return offersDelete(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "regenerate-research") return offersRegenerateResearch(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "update-writeup") return offersUpdateWriteup(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "add-artifacts") return offersAddArtifacts(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "remove-artifact") return offersRemoveArtifact(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "add-gift") return offersAddGift(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "update-gift") return offersUpdateGift(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "turn-off-gift") return offersSetGiftStatus(rest, context, { accountOverride, status: "inactive" });
  if (normalizedResource === "offers" && action === "turn-on-gift") return offersSetGiftStatus(rest, context, { accountOverride, status: "active" });
  if (normalizedResource === "offers" && action === "update-insight") return offersUpdateInsight(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "turn-off-insight") return offersSetInsightStatus(rest, context, { accountOverride, status: "inactive" });
  if (normalizedResource === "offers" && action === "turn-on-insight") return offersSetInsightStatus(rest, context, { accountOverride, status: "active" });
  if (normalizedResource === "icps" && action === "list") return icpsList(rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "show") return icpsShow(rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "analytics") return analyticsIcps(rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "create") return icpsCreate(rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "update") return icpsUpdate(rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "archive") return icpsLifecycleMutation("archive", rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "restore") return icpsLifecycleMutation("restore", rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "add-tag") return icpsTagMutation("add", rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "remove-tag") return icpsTagMutation("remove", rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "bulk-add-tag") return icpsBulkAddTag(rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "clone") return icpsClone(rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "delete") return icpsDelete(rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "prospects") return icpsProspects(rest, context, { accountOverride });
  if (normalizedResource === "companies" && action === "search") return companiesSearch(rest, context, { accountOverride });
  if (normalizedResource === "dnc" && action === "list") return dncList(rest, context, { accountOverride });
  if (normalizedResource === "dnc" && action === "add") return dncAdd(rest, context, { accountOverride });
  if (normalizedResource === "dnc" && action === "import") return dncImport(rest, context, { accountOverride });
  if (normalizedResource === "dnc" && ["remove", "delete"].includes(action)) return dncRemove(rest, context, { accountOverride });
  if (normalizedResource === "company-rules" && action === "list") return companyRulesList(rest, context, { accountOverride });
  if (normalizedResource === "company-rules" && action === "show") return companyRulesShow(rest, context, { accountOverride });
  if (normalizedResource === "company-rules" && action === "create") return companyRulesCreate(rest, context, { accountOverride });
  if (normalizedResource === "company-rules" && action === "update") return companyRulesUpdate(rest, context, { accountOverride });
  if (normalizedResource === "company-rules" && ["remove", "delete"].includes(action)) return companyRulesRemove(rest, context, { accountOverride });
  if (normalizedResource === "company-rules" && action === "apply") return companyRulesApply(rest, context, { accountOverride });
  if (normalizedResource === "hubspot" && action === "list-syncs") return hubspotListSyncs(rest[0], rest.slice(1), context, { accountOverride });
  if (normalizedResource === "hubspot") return hubspotCommand(action, rest, context, { accountOverride });
  if (normalizedResource === "webhooks") return webhooksCommand(action, rest, context, { accountOverride });
  if (normalizedResource === "reply-alerts") return replyAlertsCommand(action, rest, context);
  if (normalizedResource === "brand-profile") return brandProfileCommand(action, rest, context, { accountOverride });
  if (normalizedResource === "payment") return paymentCommand(action, rest, context, { accountOverride });
  if (normalizedResource === "find") return findByName([action, ...rest].filter((value) => value !== undefined), context, { accountOverride });
  if (normalizedResource === "tags" && action === "list") return tagsList(rest, context, { accountOverride });
  if (normalizedResource === "tags" && action === "show") return tagsShow(rest, context, { accountOverride });
  if (normalizedResource === "tasks" && ["list", "manage"].includes(action)) return tasksList(rest, context, { accountOverride });
  if (normalizedResource === "tasks" && action === "add") return tasksAdd(rest, context, { accountOverride });
  if (normalizedResource === "tasks" && action === "complete") return tasksComplete(rest, context, { accountOverride });
  if (normalizedResource === "tasks" && action === "update") return tasksUpdate(rest, context, { accountOverride });
  if (normalizedResource === "tasks" && action === "bulk-update") return tasksBulkUpdate(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "list") return listsList(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "create") return listsCreate(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "show") return listsShow(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "update") return listsUpdate(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "add-tag") return listsTagMutation("add", rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "remove-tag") return listsTagMutation("remove", rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "delete") return listsDelete(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "bulk-add-tag") return listsBulkAddTag(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "merge") return listsMerge(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "export") return listsExport(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "prospects") return listProspects(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "add-prospects") return listsAddProspects(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "remove-prospects") return listsRemoveProspects(rest, context, { accountOverride });
  if (normalizedResource === "lists" && ["routing-rules", "rules"].includes(action)) return listsRoutingRules(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "list") return motionsList(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "show") return motionsShow(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "signals") return motionsSignals(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "status") return motionsStatus(rest, context, { accountOverride });
  if (normalizedResource === "motions" && ["abm-companies", "company-filters"].includes(action)) return motionsAbmCompanies(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "profile-signals") return motionsProfileSignals(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "analytics") return motionsAnalytics(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "prospects") return motionsProspects(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "add-prospects") return motionsAddProspects(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "create") return motionsCreate(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "update") return motionsUpdate(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "add-tag") return motionsTagMutation("add", rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "remove-tag") return motionsTagMutation("remove", rest, context, { accountOverride });
  if (normalizedResource === "motions" && ["activate", "pause", "archive"].includes(action)) return motionsStatusShortcut(action, rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "delete") return motionsDelete(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "clone") return motionsClone(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "move-prospects") return motionsMoveProspects(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "run-discovery") return motionsRunDiscovery(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "quick-start") return motionsQuickStart(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "setup-state") return motionsSetupState(rest, context, { accountOverride });
  if (normalizedResource === "content" && action === "programs") return contentPrograms(rest, context, { accountOverride });
  if (normalizedResource === "content" && action === "plans") return contentPlans(rest, context, { accountOverride });
  if (normalizedResource === "content" && ["plan-update", "plan-approve", "plan-research", "plan-draft", "plan-visuals"].includes(action)) return contentPlanAction(action, rest, context, { accountOverride });
  if (normalizedResource === "content" && action === "post-reply") return contentPostReply(rest, context, { accountOverride });
  if (normalizedResource === "content" && action === "plan") return contentPlan(rest, context, { accountOverride });
  if (normalizedResource === "content" && action === "show") return contentShow(rest, context, { accountOverride });
  if (normalizedResource === "content" && action === "posts") return contentPosts(rest, context, { accountOverride });
  if (normalizedResource === "content" && action === "track") return contentTrack(rest, context, { accountOverride });
  if (normalizedResource === "content" && action === "engagement") return contentEngagement(rest, context, { accountOverride });
  if (normalizedResource === "content" && action === "feedback") return contentFeedback(rest, context, { accountOverride });
  if (normalizedResource === "content" && action === "approve") return contentApprove(rest, context, { accountOverride });
  if (normalizedResource === "content" && action === "schedule") return contentSchedule(rest, context, { accountOverride });
  if (normalizedResource === "content" && action === "publish") return contentPublish(rest, context, { accountOverride });
  if (normalizedResource === "content" && action === "comments") return contentComments(rest, context, { accountOverride });
  if (normalizedResource === "content" && action === "reply") return contentReply(rest, context, { accountOverride });
  if (normalizedResource === "content" && action === "dismiss") return contentDismiss(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "list") return prospectsList(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "check") return prospectsCheck(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "show") return prospectsShow(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "set-destination") return prospectsSetDestination(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "assign") return prospectsAssign(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "move-account") return prospectsMoveAccount(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "set-status") return prospectsSetStatus(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "replan") return prospectsReplan(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "reenrich") return prospectsReenrich(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "refresh-queue") return prospectsRefreshQueue(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "reject") return prospectsDisposition("reject", rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "nurture") return prospectsDisposition("nurture", rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "restore") return prospectsDisposition("restore", rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "lock") return prospectsLock(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "unlock") return prospectsUnlock(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "timeline") return prospectsTimeline(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "message-types") return prospectsMessageTypes(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "write") return prospectsWrite(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "add-note") return prospectsAddNote(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "add-steer") return prospectsAddSteer(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "add-profile") return prospectsAddProfile(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "report-bad-profile") return prospectsReportBadProfile(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "sequence-preview") return prospectsSequencePreview(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "sequence-export") return prospectsSequenceExport(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "import") return prospectsImport(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "import-batch") return prospectsImportBatch(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "import-status") return prospectsImportStatus(rest, context, { accountOverride });
  if (normalizedResource === "writer" && action === "test-run") return writerTestRun(rest, context, { accountOverride });
  if (normalizedResource === "tools" && action === "list") return toolsList(rest, context);
  if (normalizedResource === "tools" && action === "get") return toolsGet(rest, context, { accountOverride });
  if (normalizedResource === "tools" && action === "humanize") return toolsHumanize(rest, context, { accountOverride });
  if (normalizedResource === "tools" && action === "email-find") return toolsEmailFind(rest, context, { accountOverride });
  if (normalizedResource === "tools" && action === "linkedin-enrich") return toolsLinkedinEnrich(rest, context, { accountOverride });
  if (normalizedResource === "tools" && action === "signals-find") return toolsSignalsFind(rest, context, { accountOverride });
  if (normalizedResource === "tools" && action === "write") return toolsWrite(rest, context, { accountOverride });
  if (normalizedResource === "tools" && action === "runs") return toolsRuns(rest, context, { accountOverride });
  if (normalizedResource === "network") return networkCommand(action, rest, context, { accountOverride });
  if (normalizedResource === "tools" && action === "linkedin-review") return toolsLinkedinReview(rest, context, { accountOverride });
  if (normalizedResource === "tools" && action === "linkedin-strategy-review") return toolsLinkedinStrategyReview(rest, context, { accountOverride });
  if (normalizedResource === "operator" && action === "failed-drafts") return operatorFailedDrafts(rest, context, { accountOverride });
  if (normalizedResource === "operator" && action === "queue") return operatorQueue(rest, context, { accountOverride });
  if (normalizedResource === "operator" && action === "next") return operatorNext(rest, context, { accountOverride });
  if (normalizedResource === "operator" && action === "outcome") return operatorOutcome(rest, context, { accountOverride });
  if (normalizedResource === "operator" && action === "answer") return operatorAnswer(rest, context, { accountOverride });
  if (normalizedResource === "network-ops" && action === "queue") return networkOpsQueue(rest, context, { accountOverride });
  if (normalizedResource === "network-ops" && ["accept", "decline", "reject"].includes(action)) {
    return networkOpsAction(action, rest, context, { accountOverride });
  }
  if (normalizedResource === "inbox-ops" && action === "queue") return inboxOpsQueue(rest, context, { accountOverride });
  if (normalizedResource === "inbox-ops" && action === "filters") return inboxOpsFilters(rest, context, { accountOverride });
  if (normalizedResource === "inbox-ops" && action === "rule") return inboxOpsRule(rest, context, { accountOverride });
  if (normalizedResource === "inbox-ops" && Object.hasOwn(INBOX_OPS_BULK_VERBS, action)) return inboxOpsBulk(action, rest, context, { accountOverride });
  if (normalizedResource === "analytics" && ["prospects", "prospect"].includes(action)) return analyticsProspects(rest, context, { accountOverride });
  if (normalizedResource === "analytics" && ["users", "user"].includes(action)) return analyticsUsers(rest, context, { accountOverride });
  if (normalizedResource === "analytics" && ["visibility", "visops"].includes(action)) return analyticsVisibility(rest, context, { accountOverride });
  if (normalizedResource === "analytics" && action === "content") return analyticsContent(rest, context, { accountOverride });
  if (normalizedResource === "analytics" && ["dashboard", "campaign", "campaigns"].includes(action)) return analyticsDashboard(rest, context, { accountOverride });
  if (normalizedResource === "analytics" && ["motions", "plays"].includes(action)) return analyticsMotions(rest, context, { accountOverride });
  if (normalizedResource === "analytics" && ["icps", "icp"].includes(action)) return analyticsIcps(rest, context, { accountOverride });
  if (normalizedResource === "analytics" && action === "metrics") return analyticsMetrics(rest, context, { accountOverride });
  if (normalizedResource === "analytics" && action === "stages") return analyticsStages(rest, context, { accountOverride });
  if (normalizedResource === "analytics" && ["cohorts", "cohort"].includes(action)) return analyticsCohorts(rest, context, { accountOverride });

  throw new CommandError(usage(), { exitCode: resource ? 1 : 0 });
}

function extractGlobalOptions(argv) {
  const args = [];
  let accountOverride;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--account") {
      const rawAccountOverride = argv[index + 1];
      if (!rawAccountOverride || rawAccountOverride.startsWith("--")) {
        throw new CommandError("--account requires an account id.");
      }
      accountOverride = rawAccountOverride.trim();
      if (!accountOverride) throw new CommandError("--account requires an account id.");
      index += 1;
    } else if (arg.startsWith("--account=")) {
      accountOverride = arg.slice("--account=".length).trim();
      if (!accountOverride) throw new CommandError("--account requires an account id.");
    } else {
      args.push(arg);
    }
  }

  return { args, accountOverride };
}

function helpTopicFromArgs(args) {
  if (args.length === 0) return [];
  if (args[0] === "--help" || args[0] === "-h") return [];
  if (args.at(-1) === "help") return normalizeTopicParts(args.slice(0, -1));
  if (args[0] === "help") return normalizeTopicParts(args.slice(1));

  const helpIndex = args.findIndex((arg) => arg === "--help" || arg === "-h");
  if (helpIndex === -1) return null;

  return normalizeTopicParts(args.slice(0, helpIndex));
}

function incompleteHelpTopicFromArgs(args) {
  if (args.length === 0 || args[0] === "help") return null;
  if (args.some((arg) => arg === "--help" || arg === "-h" || arg.startsWith("-"))) return null;

  const topicParts = normalizeTopicParts(args);
  const topic = topicParts.join(" ").trim();
  const helpText = HELP_TOPICS.get(topic);
  if (!helpText) return null;

  return usageAllowsExactCommand(helpText, topic) ? null : topicParts;
}

function usageAllowsExactCommand(helpText, topic) {
  return usageCommandsFor(helpText).some((command) => usageCommandAllowsExactTopic(command, topic));
}

function usageCommandsFor(helpText) {
  return helpText.split("\n").flatMap((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("audienti ")) return [trimmed.slice("audienti ".length)];

    const oneLineUsage = trimmed.match(/^Usage:\s+audienti\s+(.+)$/);
    return oneLineUsage ? [oneLineUsage[1]] : [];
  });
}

function usageCommandAllowsExactTopic(command, topic) {
  if (command === topic) return true;
  if (!command.startsWith(`${topic} `)) return false;

  const remainder = command.slice(topic.length).trimStart();
  return remainder.startsWith("[");
}

function normalizeTopicParts(parts) {
  if (parts[0] === "account") return ["accounts", ...parts.slice(1)];
  if (normalizeResource(parts[0]) === "motions") return ["motions", ...parts.slice(1)];
  if (parts[0] === "principals") return ["users", ...parts.slice(1)];
  if (parts[0] === "writers") return ["writer", ...parts.slice(1)];
  return parts;
}

function normalizeResource(resource) {
  if (resource === "account") return "accounts";
  if (resource === "principals") return "users";
  if (resource === "writers") return "writer";
  if (resource === "company_rules" || resource === "company-rules") return "company-rules";
  if (resource === "hubspot_integration" || resource === "hubspot-integration") return "hubspot";
  if (resource === "prospect_webhook_endpoints" || resource === "prospect-webhook-endpoints") return "webhooks";
  if (resource === "reply_alerts") return "reply-alerts";
  if (resource === "brand_profile") return "brand-profile";
  if (resource === "linkedin_lookups" || resource === "linkedin-lookups") return "linkedin-lookups";
  if (resource === "social_cookie" || resource === "social_cookies") return "social-cookies";
  return MOTION_ALIASES.includes(resource) ? "motions" : resource;
}

function remindExperimentMethodology(context) {
  writeLine(context.stderr, "Experiment methodology: read `audienti help methodology`; record a baseline, target and review date before starting. A new trigger, ICP, offer or value chain means a new experiment. Sending controls still apply.");
}

async function giftResearch(args, context) {
  const usage = "Usage: audienti tools gift-research --url <website> [--json]";
  const { values, positionals } = parseCommandArgs(args, { ...jsonOptions(), url: { type: "string" } });
  if (positionals.length || !values.url) throw new CommandError(usage);
  let website;
  try {
    website = new URL(values.url);
  } catch {
    throw new CommandError("--url must be an HTTP(S) website URL, for example https://example.com.");
  }
  if (!["http:", "https:"].includes(website.protocol) || website.username || website.password) {
    throw new CommandError("--url must be an HTTP(S) website URL without embedded credentials.");
  }
  const skill = skillDetails("audienti-gift-research");
  const brief = { kind: "agent_research_brief", skill: skill.name, website: website.href, execution: "agent", instructions: skill.instructions };
  if (values.json) return writeJson(context.stdout, brief);
  writeLine(context.stdout, `Website: ${brief.website}\nResearch instructions for the agent; research has not run.\n\n${brief.instructions}`);
}

async function agentSkills(action, args, context) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (action === "list" && positionals.length === 0) {
    const catalog = skillCatalog();
    if (values.json) return writeJson(context.stdout, catalog);
    for (const skill of catalog.skills) writeLine(context.stdout, `${skill.name} [${skill.source}] — ${skill.description}`);
    writeLine(context.stdout, `\nSelected marketplace skills (${catalog.marketplace.scope}): ${catalog.marketplace.url}/tree/${catalog.marketplace.commit}\nBefore using a social finder, check the local tools and network access available to this agent.\nUse audienti skills show <name> for instructions or upstream links and install commands.`);
    return;
  }
  if (action !== "show" || positionals.length !== 1) throw new CommandError("Usage: audienti skills list [--json] | audienti skills show <name> [--json]");
  const skill = skillDetails(positionals[0]);
  if (!skill) throw new CommandError(`Unknown skill "${positionals[0]}". Run audienti skills list.`);
  if (values.json) return writeJson(context.stdout, skill);
  writeLine(context.stdout, `${skill.name} [${skill.source}]\n${skill.description}\n\n${skill.instructions}`);
  if (skill.source === "marketplace") {
    writeLine(context.stdout, `\nSource: ${skill.repository_url}\nREADME: ${skill.readme_url}`);
    for (const [host, commands] of Object.entries(skill.install)) writeLine(context.stdout, `\n${host}:\n${commands.join("\n")}`);
  }
}

async function authToken(args, context) {
  const { values, positionals } = parseCommandArgs(args, {
    host: { type: "string" }
  });

  if (positionals.length !== 1) {
    throw new CommandError("Usage: audienti auth token <token> [--host https://app.audienti.com]");
  }

  const token = positionals[0].trim();
  if (!token) throw new CommandError("API token cannot be blank.");

  const host = normalizeHost(values.host || DEFAULT_HOST);
  const client = new AudientiClient({ host, token, fetchImpl: context.fetchImpl });
  const user = await client.me();

  await writeConfig({ host, token }, { env: context.env });

  const userLabel = user?.name || user?.email || user?.id;
  writeLine(context.stdout, userLabel ? `Authenticated to ${host} as ${userLabel}.` : `Authenticated to ${host}.`);
  writeLine(context.stdout, "Run `audienti accounts list` to choose an account.");
}

async function authLogin(args, context) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    host: { type: "string" },
    "timeout-seconds": { type: "string" },
    "no-open": { type: "boolean" }
  });

  if (positionals.length > 0) {
    throw new CommandError("Usage: audienti auth login [--host https://app.audienti.com] [--timeout-seconds <n>] [--no-open] [--json]");
  }

  const host = normalizeHost(values.host || DEFAULT_HOST);
  const timeoutSeconds = normalizeOptionalPositiveInteger(values["timeout-seconds"], "--timeout-seconds") || DEFAULT_AUTH_LOGIN_TIMEOUT_SECONDS;
  const { client, user, payload } = await browserSignIn({
    host,
    timeoutSeconds,
    open: !values["no-open"],
    context,
    announce(authUrl, callbackUrl) {
      if (values.json) {
        writeJson(context.stdout, {
          kind: "auth_login_start",
          auth_url: authUrl,
          callback_url: callbackUrl,
          timeout_seconds: timeoutSeconds
        });
      } else {
        writeLine(context.stdout, "Open this URL to authenticate Audienti CLI:");
        writeLine(context.stdout, authUrl);
      }
    }
  });

  const result = {
    kind: "auth_login_complete",
    host: client.host,
    user: user?.name || payload.user_name || payload.user_email || user?.email || null,
    account_id: payload.account_id || null,
    account_name: payload.account_name || null
  };

  if (values.json) return writeJson(context.stdout, result);

  writeLine(context.stdout, `Authenticated to ${client.host} as ${result.user || "current user"}.`);
  if (result.account_id) writeLine(context.stdout, `Selected account ${result.account_name || result.account_id} (${result.account_id}).`);
  if (!result.account_id) writeLine(context.stdout, "Run `audienti accounts list` to choose an account.");
}

async function browserSignIn({ host, timeoutSeconds, open, context, announce }) {
  const state = randomBytes(24).toString("hex");
  const callback = await createAuthCallbackServer({ state, context });
  const authUrl = new URL("/cli/auth", host);
  authUrl.searchParams.set("redirect_uri", callback.redirectUri);
  authUrl.searchParams.set("state", state);

  announce(authUrl.toString(), callback.redirectUri);
  if (open) openBrowser(authUrl.toString(), context);

  let payload;
  try {
    payload = await callback.wait(timeoutSeconds);
  } finally {
    await callback.close();
  }

  const client = new AudientiClient({ host: payload.host || host, token: payload.token, fetchImpl: context.fetchImpl });
  const user = await client.me();
  await writeConfig({
    host: client.host,
    token: payload.token,
    accountId: payload.account_id || undefined,
    accountName: payload.account_name || undefined
  }, { env: context.env });

  return { client, user, payload };
}

async function start(args, context) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    host: { type: "string" },
    "no-open": { type: "boolean" }
  });
  if (positionals.length > 0) throw new CommandError(START_USAGE);

  const interactive = stdinIsInteractive(context) && !values.json;
  const say = (line = "") => {
    if (!values.json) writeLine(context.stdout, line);
  };
  let config = await readConfig({ env: context.env });
  const host = normalizeHost(values.host || config.host || DEFAULT_HOST);

  say("Welcome to Audienti.");
  say();
  // The first two intro screens of the web signup. The third names the
  // price, so it is shown at the pay step, where the price is known.
  START_INTRO.slice(0, 2).forEach((screen, index) => writeIntroPoint(say, index + 1, screen));

  let session = await savedSession(config, context);
  if (!session && !interactive) {
    const payload = {
      kind: "start",
      status: "sign_in_required",
      signed_in: false,
      host,
      sign_up_url: new URL("/users/sign_up", host).toString(),
      sign_in_command: "audienti auth login",
      next_command: "audienti start"
    };
    if (values.json) return writeJson(context.stdout, payload);

    say("Sign in or create an account to continue.");
    say(`  New here? Create an account at ${payload.sign_up_url}`);
    say("  Then run `audienti auth login` in a terminal (it opens your browser),");
    say("  or save an API token with `audienti auth token <token>`.");
    say("Next: run `audienti start` again.");
    return 0;
  }

  const prompter = createPrompter(context);
  try {
    if (session) {
      say(`You're signed in as ${session.label}.`);
    } else {
      say("First, sign in or create an account.");
      const { client, user, payload } = await browserSignIn({
        host,
        timeoutSeconds: DEFAULT_START_LOGIN_TIMEOUT_SECONDS,
        open: !values["no-open"],
        context,
        announce(authUrl) {
          say("We'll open Audienti in your browser. New here? Choose \"sign up for an account\" on that page.");
          say("If the browser doesn't open, visit:");
          say(`  ${authUrl}`);
          say("Waiting for you to finish in the browser (confirm your email if asked)...");
        }
      });
      config = await readConfig({ env: context.env });
      session = { client, label: user?.name || payload.user_name || user?.email || payload.user_email || "you" };
      say(`Signed in as ${session.label}.`);
    }

    const account = await chooseStartAccount(session.client, config, { interactive, prompter, say });
    const accountUser = account ? await chooseStartAccountUser(session.client, account, { interactive, prompter, say }) : null;
    if (account) {
      const sameAccount = account.prefix_id === config.accountId;
      await writeConfig({
        ...config,
        accountId: account.prefix_id,
        accountName: account.name,
        accountUserId: accountUser ? String(accountUser.id) : sameAccount ? config.accountUserId : undefined,
        accountUserName: accountUser ? accountUser.name : sameAccount ? config.accountUserName : undefined,
        accountUserEmail: accountUser ? accountUser.email : sameAccount ? config.accountUserEmail : undefined
      }, { env: context.env });
    }

    const status = !account ? "account_selection_required" : !accountUser ? "account_user_selection_required" : "ready";
    const nextCommand = status === "account_selection_required"
      ? "audienti accounts select <acct_id>"
      : status === "account_user_selection_required"
        ? "audienti users select <account_user_id|email|name|me>"
        : interactive ? "audienti setup" : SETUP_FLAGS_EXAMPLE;

    // Payment comes before setup, as on the web: unpaid accounts run nothing.
    const payment = status === "ready" ? await session.client.accountPayment(account.prefix_id) : null;
    const paymentNeeded = payment?.state === "payment_needed";
    const startStatus = paymentNeeded ? "payment_required" : status;
    const startNext = paymentNeeded ? "audienti payment code <signup_code>" : nextCommand;

    if (values.json) {
      return writeJson(context.stdout, {
        kind: "start",
        status: startStatus,
        signed_in: true,
        host: session.client.host,
        user: session.label,
        account: account ? { id: account.prefix_id, name: account.name } : null,
        account_user: accountUser ? { id: accountUser.id, name: accountUser.name || null, email: accountUser.email || null } : null,
        ...(paymentNeeded ? { payment_url: payment.payment_url || null } : {}),
        next_command: startNext
      });
    }

    if (payment?.state === "payment_stopped") throw new CommandError(PAYMENT_STOPPED_MESSAGE);

    if (status !== "ready" || !interactive) {
      if (paymentNeeded) writeAccountPayment(payment, context);
      say(`Next: ${startNext}`);
      return 0;
    }

    if (paymentNeeded) {
      say();
      await startPayStep(session.client, account.prefix_id, payment, { prompter, say, context, open: !values["no-open"] });
    }

    return startSetupStep(session.client, account, context, { prompter, say });
  } finally {
    prompter.close();
  }
}

// The three intro screens of the web signup (Users::SignupIntro), word for word.
const START_INTRO = [
  {
    title: "See who's ready to buy from you this week.",
    body: "Give us your website. In a few minutes you'll see your ideal buyer, your offer in plain words, and real people showing signs they're ready right now."
  },
  {
    title: "We warm them up in your name, like a person would.",
    body: "We view, follow and like their posts on LinkedIn, weekdays 9 to 5 your time, at a normal human pace. By the time you reach out, they've already seen your name."
  },
  {
    title: "Get {credits} of credits for {price}.",
    body: "A free trial would only show you a demo. Your {price} gets you {credits} of credits that do real work: real buyers found and warmed up on your profile, with messages written and waiting for your OK. Nothing goes out unless you approve it."
  }
];

const PAYMENT_STOPPED_MESSAGE = "The payment for this account was returned, so nothing runs. Contact Audienti support to start again.";

function writeIntroPoint(say, number, screen, values = {}) {
  const fill = (text) => text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
  say(`${number}. ${fill(screen.title)}`);
  say(`   ${fill(screen.body)}`);
  say();
}

// Same as Accounts::Admission.usage_label for dollars: $5, or $5.50.
function dollarLabel(cents) {
  const amount = Number(cents) || 0;
  return amount % 100 === 0 ? `$${amount / 100}` : `$${(amount / 100).toFixed(2)}`;
}

// Pay by card in the browser, or type a signup code here. The card form needs
// a browser; the terminal waits until the account shows as paid.
async function startPayStep(client, accountId, payment, { prompter, say, context, open }) {
  const usage = payment?.card_usage?.unit === "usd_cents" ? dollarLabel(payment.card_usage.amount) : "starting";
  writeIntroPoint(say, 3, START_INTRO[2], { price: dollarLabel(payment?.price?.amount), credits: usage });

  for (;;) {
    const answer = await prompter.ask("Press Enter to pay by card in your browser, or type a signup code: ");
    if (!answer) break;

    try {
      await client.redeemSignupCode(accountId, answer);
      say("Code accepted. No card needed.");
      say();
      return;
    } catch (error) {
      if (!(error instanceof ApiError) || ![403, 422, 429].includes(error.status)) throw error;
      say(typeof error.body?.error === "string" ? error.body.error : "That code didn't work.");
    }
  }

  say("Opening the pay page in your browser. If it doesn't open, visit:");
  say(`  ${payment.payment_url}`);
  if (open) openBrowser(payment.payment_url, context);
  say("Waiting for your payment...");

  const deadline = context.now().getTime() + DEFAULT_START_LOGIN_TIMEOUT_SECONDS * 1000;
  let current = payment;
  while (current?.state === "payment_needed") {
    if (context.now().getTime() >= deadline) {
      throw new CommandError("We haven't seen your payment yet. Finish on the pay page, then run `audienti start` again.");
    }
    await context.sleep(DEFAULT_PAYMENT_POLL_INTERVAL_SECONDS * 1000);
    current = await client.accountPayment(accountId);
  }
  if (current?.state === "payment_stopped") throw new CommandError(PAYMENT_STOPPED_MESSAGE);

  say("Payment received. Thank you.");
  say();
}

// Lands on the setup step the person is on, as the web does after a return.
async function startSetupStep(client, account, context, { prompter, say }) {
  const accountId = account.prefix_id;
  const goLiveAccount = { id: accountId, name: account.name };
  const state = await client.setupState(accountId);
  if (state?.step === "live") {
    say("Setup is done. LinkedIn is connected and your experiment is live.");
    say("Next: audienti operator next");
    return 0;
  }
  if (state?.step === "go_live") {
    writeGoLiveStep(client.host, say, { state, account: goLiveAccount });
    return 0;
  }
  if (state?.step === "targeting" && state.draft_id) {
    // Read the saved draft as it is. Generating again could replace a draft
    // the person already edited.
    say("Your draft is ready. Let's check it.");
    say();
    return setupWizard([], context, { prompter, resumeDraftId: state.draft_id });
  }

  say();
  if (await askYesNo(prompter, "Set up your first experiment now? [Y/n] ", { defaultYes: true })) {
    say();
    return setupWizard([], context, { prompter });
  }

  say("No problem. When you're ready, run: audienti setup");
  return 0;
}

function goLiveUrl(host) {
  return new URL("/quick_start/go_live", host).toString();
}

// Step 3. LinkedIn sign-in has no terminal prompt yet, so the person
// finishes it on the setup page, which grants the LinkedIn account to the
// browser's current account only. The page has no account in its URL, so
// name the account the terminal set up and send the person to switch first.
function writeGoLiveStep(host, say, { state = null, account = null } = {}) {
  if (state?.motion) say(`Your experiment: ${display(state.motion.name)} (${display(state.motion.prefix_id)}).`);
  say("Last step: connect LinkedIn to go live.");
  say("Connecting starts outreach: we view, follow and like the people we find, weekdays, 9 to 5 your time. Connection requests and messages wait for your OK.");
  say("The terminal can't connect LinkedIn yet. Finish this step on the web.");
  if (account?.id) {
    const label = account.name ? `${account.name} (${account.id})` : account.id;
    say(`First make sure the browser is on the account ${label}. If it shows another account, switch here:`);
    say(`  ${new URL("/accounts", host).toString()}`);
    say("Then open:");
  }
  say(`  ${goLiveUrl(host)}`);
  say("Audienti keeps finding people in the meantime. Check where setup stands with: audienti motions setup-state");
}

async function savedSession(config, context) {
  if (!config.token) return null;

  const client = clientFromConfig(config, context);
  try {
    const user = await client.me();
    return { client, label: user?.name || user?.email || "you" };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

async function chooseStartAccount(client, config, { interactive, prompter, say }) {
  const accounts = await client.accounts();
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new CommandError("This login has no Audienti account yet. Finish creating one in the browser, then run `audienti start` again.");
  }

  const saved = accounts.find((account) => account.prefix_id === config.accountId);
  if (accounts.length === 1) {
    say(`Using account ${accounts[0].name} (${accounts[0].prefix_id}).`);
    return accounts[0];
  }

  if (!interactive) {
    if (saved) {
      say(`Using account ${saved.name} (${saved.prefix_id}).`);
      return saved;
    }
    say("You have several accounts:");
    for (const account of accounts) say(`  ${account.prefix_id}\t${account.name}`);
    return null;
  }

  say("Which account should the CLI use?");
  accounts.forEach((account, index) => {
    say(`  ${index + 1}. ${account.name} (${account.prefix_id})${account === saved ? " - current" : ""}`);
  });
  const defaultIndex = saved ? accounts.indexOf(saved) + 1 : null;
  const account = await askChoice(prompter, accounts, {
    question: defaultIndex ? `Account [${defaultIndex}]: ` : "Account: ",
    defaultChoice: saved,
    resolve: (answer) => resolveAccountSelection(accounts, answer)
  });
  say(`Using account ${account.name} (${account.prefix_id}).`);
  return account;
}

async function chooseStartAccountUser(client, account, { interactive, prompter, say }) {
  const users = await client.users(account.prefix_id);
  const rows = Array.isArray(users) ? users : [];
  const currentUsers = rows.filter((candidate) => candidate.current);
  const automatic = currentUsers.length === 1 ? currentUsers[0] : rows.length === 1 ? rows[0] : null;
  if (automatic) {
    say(`Working as ${accountUserLabel(automatic)}.`);
    return automatic;
  }

  if (!interactive || rows.length === 0) {
    say("Pick which account user you are:");
    for (const accountUser of rows) say(`  ${accountUserLabel(accountUser)}`);
    return null;
  }

  say("Which account user are you?");
  rows.forEach((accountUser, index) => say(`  ${index + 1}. ${accountUserLabel(accountUser)}`));
  const accountUser = await askChoice(prompter, rows, {
    question: "Account user: ",
    resolve: (answer) => resolveAccountUserSelection(rows, answer)
  });
  say(`Working as ${accountUserLabel(accountUser)}.`);
  return accountUser;
}

async function askChoice(prompter, choices, { question, defaultChoice = null, resolve }) {
  for (;;) {
    const answer = await prompter.ask(question);
    if (!answer && defaultChoice) return defaultChoice;

    const number = Number(answer);
    if (Number.isInteger(number) && number >= 1 && number <= choices.length) return choices[number - 1];

    try {
      const match = answer ? resolve(answer) : null;
      if (match) return match;
    } catch (error) {
      if (!(error instanceof CommandError)) throw error;
    }
    prompter.say(`Type a number from 1 to ${choices.length}.`);
  }
}

async function askYesNo(prompter, question, { defaultYes = false } = {}) {
  for (;;) {
    const answer = (await prompter.ask(question)).toLowerCase();
    if (!answer) return defaultYes;
    if (/^y(es)?$/.test(answer)) return true;
    if (/^no?$/.test(answer)) return false;
    prompter.say("Please answer y or n.");
  }
}

function stdinIsInteractive(context) {
  return Boolean(context.stdin && context.stdin.isTTY);
}

// One line reader per command run. The async iterator buffers lines typed
// ahead of a question, so several questions can share one input stream.
function createPrompter(context) {
  let reader;
  let lines;

  return {
    async ask(question) {
      if (!lines) {
        reader = createInterface({ input: context.stdin, terminal: false });
        lines = reader[Symbol.asyncIterator]();
      }
      context.stdout.write(question);
      const { value, done } = await lines.next();
      if (done) throw new CommandError("Input ended before the questions were answered. Run the command again when you're ready.");
      return String(value).trim();
    },
    say(line = "") {
      writeLine(context.stdout, line);
    },
    close() {
      reader?.close();
    }
  };
}

const SETUP_QUESTIONS = [
  {
    key: "url",
    title: "What's your company website?",
    good: "https://acme.com",
    bad: "acme (not a full web address)",
    skip: "Press Enter to use the website saved on your account."
  },
  {
    key: "sell-to",
    title: "Who do you sell to? One sentence.",
    good: "Heads of finance at US software companies with 50-500 people.",
    bad: "Everyone who could use our product.",
    skip: "Press Enter to skip."
  },
  {
    key: "ask",
    title: "What do you want the prospect to say yes to?",
    good: "A 20-minute call to see if our audit fits their month-end close.",
    bad: "Buy now.",
    skip: "Press Enter to skip."
  }
];

async function setupWizard(args, context, { accountOverride, prompter: sharedPrompter, resumeDraftId = null } = {}) {
  const resume = Boolean(resumeDraftId);
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    url: { type: "string" },
    city: { type: "string" },
    state: { type: "string" },
    country: { type: "string" },
    "sell-to": { type: "string" },
    ask: { type: "string" },
    yes: { type: "boolean" }
  });
  if (positionals.length > 0) throw new CommandError(SETUP_USAGE);

  const interactive = stdinIsInteractive(context) && !values.json;
  const say = (line = "") => {
    if (!values.json) writeLine(context.stdout, line);
  };

  if (!interactive && !values.url) {
    throw new CommandError([
      "No terminal is attached, so `audienti setup` can't ask questions.",
      "Pass the answers as flags instead:",
      `  ${SETUP_FLAGS_EXAMPLE}`,
      SETUP_USAGE
    ].join("\n"));
  }

  const config = await readConfig({ env: context.env });
  if (!config.token) {
    throw new CommandError("You're not signed in yet. Run `audienti start` to sign in or create an account, then run `audienti setup`.");
  }
  const accountId = accountOverride || config.accountId;
  if (!accountId) {
    throw new CommandError("No account is picked yet. Run `audienti start` to choose one, then run `audienti setup`.");
  }
  const client = clientFromConfig(config, context);
  const prompter = sharedPrompter || createPrompter(context);

  try {
    const answers = { url: values.url, "sell-to": values["sell-to"], ask: values.ask };
    if (interactive && !resume) {
      say("Step 1 of 3: Your company. Three quick questions.");
      for (const [index, question] of SETUP_QUESTIONS.entries()) {
        if (answers[question.key] !== undefined) continue;

        say();
        say(`${index + 1}/${SETUP_QUESTIONS.length}  ${question.title}`);
        say(`     Good: ${question.good}`);
        say(`     Bad:  ${question.bad}`);
        say(`     ${question.skip}`);
        answers[question.key] = await prompter.ask("> ");
      }
      say();
    }

    const sellTo = cleanSentence(answers["sell-to"]);
    const ask = cleanSentence(answers.ask);
    let place = { city: values.city, state_code: values.state, country_code: values.country };
    const requestBody = () => ({
      quick_start: compactObject({
        company_url: String(answers.url || "").trim() || undefined,
        ...place,
        feedback: setupFeedback({ sellTo, ask })
      })
    });

    let draft = resume ? await client.quickStart(accountId, resumeDraftId) : null;
    if (!resume) say("Reading your website and drafting your first experiment. This usually takes a minute or two.");
    while (!draft) {
      try {
        draft = await client.createQuickStart(accountId, requestBody());
        break;
      } catch (error) {
        // Step 1 needs the person's place before the first draft. The API
        // names the field; ask for it here and send again.
        if (!(error instanceof ApiError && error.body?.field === "location")) throw setupCreateError(error);
        const reason = cleanSentence(typeof error.body?.error === "string" ? error.body.error : "We need your city, state or province, and country");
        if (!interactive) {
          throw new CommandError(`${reason}. Pass --city, --state and --country, for example --city Denver --state CO --country US.`);
        }
        say(`${reason}.`);
        place = await askSetupPlace(prompter, place);
        say();
      }
    }

    let polls = 0;
    draft = await waitForQuickStartDraft(client, accountId, draft, context, {
      timeoutSeconds: DEFAULT_SETUP_TIMEOUT_SECONDS,
      pollIntervalSeconds: DEFAULT_LOOKUP_POLL_INTERVAL_SECONDS,
      onPoll() {
        polls += 1;
        if (polls % 5 === 1) say(SETUP_PROGRESS[Math.min(Math.floor(polls / 5), SETUP_PROGRESS.length - 1)]);
      }
    });

    if (draft?.status === "failed") throw setupDraftFailedError(draft?.error);
    if (!quickStartReady(draft)) {
      throw new CommandError("The draft is taking longer than usual. Nothing was created. Run `audienti setup` again in a few minutes.");
    }

    let confirmed = Boolean(values.yes);
    if (!confirmed && interactive) {
      say("Step 2 of 3: Verify your targeting.");
      ({ draft, confirmed } = await reviewSetupDraft(client, accountId, draft, { ask, prompter, say }));
    } else {
      renderSetupDraft(draft, { ask }, say);
    }

    if (!confirmed) {
      const payload = {
        kind: "setup",
        status: "draft_ready",
        created: false,
        draft,
        next_command: interactive ? "audienti setup" : "Re-run with --yes to create it."
      };
      if (values.json) return writeJson(context.stdout, payload);

      say("Nothing was created.");
      say(interactive
        ? "Run `audienti setup` again whenever you're ready. Changing your answers changes the draft."
        : "Re-run the same command with --yes to create it.");
      return 0;
    }

    remindExperimentMethodology(context);
    const confirmation = await client.confirmQuickStart(accountId, draft.id, {});
    const connectUrl = goLiveUrl(client.host);
    if (values.json) {
      return writeJson(context.stdout, {
        kind: "setup",
        status: "created",
        created: true,
        draft,
        motion: confirmation?.motion || null,
        reservation: confirmation?.reservation || null,
        next_step: {
          connect_linkedin_url: connectUrl,
          check_command: "audienti setup play preflight"
        }
      });
    }

    const motion = confirmation?.motion || {};
    say(`Created your first experiment: ${display(motion.name)} (${display(motion.prefix_id)}). Finding people now.`);
    say();
    say("Step 3 of 3: Go live.");
    const goLiveAccount = {
      id: accountId,
      name: accountId === config.accountId ? config.accountName : undefined
    };
    writeGoLiveStep(client.host, say, { account: goLiveAccount });
    say("Nothing is sent until LinkedIn is connected, and nothing sends without your approval.");
    return 0;
  } finally {
    if (!sharedPrompter) prompter.close();
  }
}

const SETUP_PROGRESS = [
  "Reading your website...",
  "Working out who buys from you...",
  "Drafting your offer and the first buying signals...",
  "Still working. Thanks for waiting..."
];

function cleanSentence(value) {
  return String(value || "").trim().replace(/[\s.]+$/, "");
}

function setupFeedback({ sellTo, ask }) {
  const parts = [];
  if (sellTo) parts.push(`We sell to: ${sellTo}.`);
  if (ask) parts.push(`What we want the prospect to say yes to: ${ask}.`);
  return parts.join(" ") || undefined;
}

function setupCreateError(error) {
  if (!(error instanceof ApiError)) return error;

  const reason = typeof error.body?.error === "string" ? cleanSentence(error.body.error) : null;
  if (error.status === 401) {
    return new CommandError("Your saved login no longer works. Run `audienti start` to sign in again.");
  }
  if (error.status === 403) {
    return new CommandError("Only an account admin can replace the website already saved on this account. Run `audienti setup` again and press Enter at the website question to use the saved one.");
  }
  if (error.status === 422 && error.body?.status === "failed") return setupDraftFailedError(reason);
  if (error.status === 422) {
    return new CommandError(`That website didn't work: ${reason || "it was rejected"}. Use a full public address like https://acme.com, then run \`audienti setup\` again.`);
  }
  return error;
}

function setupDraftFailedError(reason) {
  const detail = reason ? ` (${cleanSentence(reason)})` : "";
  return new CommandError(`We couldn't draft an experiment from that website${detail}. Nothing was created. Run \`audienti setup\` again in a few minutes. If it keeps failing, check the address or add a sentence about who you sell to.`);
}

function renderSetupDraft(draft, { ask }, say) {
  const preview = draft?.preview || {};
  const icp = preview.icp || {};
  const offer = preview.offer || {};
  const titles = Array.isArray(icp.job_titles) && icp.job_titles.length ? ` (${icp.job_titles.join(", ")})` : "";

  say("Here's the draft:");
  if (preview.company_name || preview.product_or_service) {
    say(`  Your business: ${[preview.company_name, preview.product_or_service].filter(Boolean).join(" - ")}`);
  }
  say(`  Who you'll reach: ${display(icp.name, "people who fit your website")}${titles}`);
  say(`  Your offer: ${[offer.title, offer.description].filter(Boolean).join(" - ") || "drafted from your website"}`);
  const signals = Array.isArray(preview.signals) ? preview.signals : [];
  if (signals.length) say(`  Signals: ${signals.map((signal) => signal.signal_text || signal.name).filter(Boolean).join(" · ")}`);
  say(`  The ask: ${ask || "not set; the writer will suggest one"}`);
  if (preview.premise) say(`  Why now: ${preview.premise}`);
  const examples = Array.isArray(preview.example_people) ? preview.example_people : [];
  if (examples.length) {
    say("  Example people with these job titles (a sample to check the audience, not your prospects):");
    for (const person of examples) {
      say(`    - ${[person.name, [person.job_title, person.company].filter(Boolean).join(" at "), person.location].filter(Boolean).join(", ")}`);
    }
  }
  say();
}

async function askSetupPlace(prompter, place) {
  const city = await askKeeping(prompter, "City", place.city);
  const stateCode = await askKeeping(prompter, "State or province code, like CO or ON", place.state_code);
  const country = await askKeeping(prompter, "Country code", place.country_code || "US");
  return { city, state_code: stateCode, country_code: country };
}

// Asks one question; Enter keeps the value shown in brackets.
async function askKeeping(prompter, label, current) {
  const shown = current ? ` [${current}]` : "";
  const answer = await prompter.ask(`${label}${shown}: `);
  return answer || current || undefined;
}

const SETUP_DRAFT_CHOICES = "Press Enter to create this experiment, or type a to change the audience, o the offer, s the signals, or n to stop: ";

// Step 2: show the cards, let the person change one card at a time through
// the same editor as the setup page, then create on Enter.
async function reviewSetupDraft(client, accountId, initialDraft, { ask, prompter, say }) {
  let draft = initialDraft;
  for (;;) {
    renderSetupDraft(draft, { ask }, say);
    const answer = (await prompter.ask(SETUP_DRAFT_CHOICES)).toLowerCase();
    if (!answer || /^y(es)?$/.test(answer)) return { draft, confirmed: true };
    if (/^no?$/.test(answer)) return { draft, confirmed: false };

    const section = { a: "icp", audience: "icp", o: "offer", offer: "offer", s: "signals", signals: "signals" }[answer];
    if (!section) {
      say("Press Enter, or type a, o, s or n.");
      continue;
    }
    draft = await editSetupDraftCard(client, accountId, draft, section, { prompter, say });
    say();
  }
}

async function editSetupDraftCard(client, accountId, draft, section, { prompter, say }) {
  const preview = draft?.preview || {};
  let values;
  if (section === "icp") {
    const icp = preview.icp || {};
    const name = await askKeeping(prompter, "Who you'll reach, in one line", icp.name);
    const titles = await askKeeping(prompter, "Job titles, separated by commas", (icp.job_titles || []).join(", "));
    values = { name, job_titles: String(titles || "").split(",").map((title) => title.trim()).filter(Boolean) };
  } else if (section === "offer") {
    const offer = preview.offer || {};
    values = {
      title: await askKeeping(prompter, "Offer name", offer.title),
      description: await askKeeping(prompter, "Offer in one or two sentences", offer.description)
    };
  } else {
    const signals = Array.isArray(preview.signals) ? preview.signals : [];
    if (!signals.length) {
      say("This draft has no signals to change.");
      return draft;
    }
    const rows = [];
    for (const [index, signal] of signals.entries()) {
      const before = signal.signal_text || signal.name;
      const text = await askKeeping(prompter, `Signal ${index + 1}`, before);
      // The name stays only while the text is the same; a new text names itself.
      rows.push(compactObject({
        index,
        name: text === before ? signal.name : undefined,
        signal_text: text,
        company_signal_category: signal.company_signal_category
      }));
    }
    values = { signals: rows };
  }

  try {
    const updated = await client.updateQuickStart(accountId, draft.id, { section, draft: values });
    say("Saved.");
    return updated;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 422) throw error;
    say(`That change wasn't saved: ${cleanSentence(error.body?.error || "it was rejected")}.`);
    return draft;
  }
}

async function createAuthCallbackServer({ state, context }) {
  let resolvePayload;
  let rejectPayload;
  const waitPromise = new Promise((resolve, reject) => {
    resolvePayload = resolve;
    rejectPayload = reject;
  });

  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found.");
      return;
    }

    const payload = Object.fromEntries(url.searchParams.entries());
    if (payload.state !== state) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Audienti CLI authentication failed: state mismatch.");
      rejectPayload(new CommandError("Browser authentication state mismatch."));
      return;
    }

    if (!payload.token) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Audienti CLI authentication failed: missing token.");
      rejectPayload(new CommandError("Browser authentication callback did not include a token."));
      return;
    }

    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Audienti CLI authenticated</title><p>Audienti CLI is authenticated. You can close this window.</p>");
    resolvePayload(payload);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address();

  return {
    redirectUri: `http://127.0.0.1:${port}/callback`,
    wait(timeoutSeconds) {
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new CommandError(`Timed out waiting for browser authentication after ${timeoutSeconds} seconds.`)), timeoutSeconds * 1000);
      });

      return Promise.race([waitPromise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()));
    }
  };
}

function openBrowser(url, context) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];

  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
  } catch (error) {
    writeLine(context.stderr, `Could not open browser automatically: ${error.message}`);
  }
}

async function authStatus(args, context, { accountOverride } = {}) {
  assertNoPositionals(args, "Usage: audienti auth status [--account <acct_id>]");

  const config = await readConfig({ env: context.env });
  if (!config.token) {
    writeLine(context.stdout, "Not authenticated. Run `audienti auth login`.");
    return 1;
  }

  const client = clientFromConfig(config, context);
  const user = await client.me();
  const userLabel = user?.name || user?.email || user?.id || "unknown user";
  const accountId = accountOverride || config.accountId;
  const accountSuffix = accountOverride && accountOverride !== config.accountId ? " (override)" : "";

  writeLine(context.stdout, `Host: ${client.host}`);
  writeLine(context.stdout, `Token: ${maskToken(config.token)}`);
  writeLine(context.stdout, `User: ${userLabel}`);

  if (accountId) {
    const name = !accountOverride && config.accountName ? `${config.accountName} ` : "";
    writeLine(context.stdout, `Active account: ${name}(${accountId})${accountSuffix}`);
  } else {
    writeLine(context.stdout, "Active account: none selected");
  }

  const accountUser = defaultAccountUserConfig(config, { accountOverride });
  if (accountUser.id) {
    const name = accountUser.name ? `${accountUser.name} ` : "";
    writeLine(context.stdout, `Default account user: ${name}(${accountUser.id})`);
  } else {
    writeLine(context.stdout, "Default account user: none selected");
  }
}

async function authLogout(args, context) {
  assertNoPositionals(args, "Usage: audienti auth logout");

  await deleteConfig({ env: context.env });
  writeLine(context.stdout, "Logged out.");
}

async function configList(args, context) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError("Usage: audienti config list [--json]");

  const filePath = configPath(context.env);
  const config = await readConfig({ env: context.env });
  const payload = {
    path: filePath,
    exists: Object.keys(config).length > 0,
    host: config.host || null,
    token: config.token ? maskToken(config.token) : null,
    accountId: config.accountId || null,
    accountName: config.accountName || null,
    accountUserId: config.accountUserId || null,
    accountUserName: config.accountUserName || null,
    accountUserEmail: config.accountUserEmail || null
  };

  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Path: ${payload.path}`);
  writeLine(context.stdout, `Exists: ${payload.exists ? "yes" : "no"}`);
  writeLine(context.stdout, `Host: ${payload.host || "none"}`);
  writeLine(context.stdout, `Token: ${payload.token || "none"}`);

  if (payload.accountId) {
    const name = payload.accountName ? `${payload.accountName} ` : "";
    writeLine(context.stdout, `Active account: ${name}(${payload.accountId})`);
  } else {
    writeLine(context.stdout, "Active account: none selected");
  }

  if (payload.accountUserId) {
    const name = payload.accountUserName ? `${payload.accountUserName} ` : "";
    writeLine(context.stdout, `Default account user: ${name}(${payload.accountUserId})`);
  } else {
    writeLine(context.stdout, "Default account user: none selected");
  }
}

async function updateCheck(args, context) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    registry: { type: "string" }
  });
  if (positionals.length > 0) throw new CommandError("Usage: audienti update check [--json] [--registry <url>]");

  const localPackage = await readLocalPackageMetadata();
  let payload;

  try {
    const latestVersion = await fetchLatestPackageVersion({
      fetchImpl: context.fetchImpl,
      registry: values.registry
    });
    const updateAvailable = compareVersions(localPackage.version, latestVersion) < 0;
    payload = updateCheckPayload({
      currentVersion: localPackage.version,
      latestVersion,
      status: updateAvailable ? "update_available" : "current",
      updateAvailable,
      registry: values.registry || DEFAULT_NPM_REGISTRY,
      now: context.now()
    });
  } catch (error) {
    payload = updateCheckPayload({
      currentVersion: localPackage.version,
      latestVersion: null,
      status: "unknown",
      updateAvailable: null,
      registry: values.registry || DEFAULT_NPM_REGISTRY,
      error: error.message,
      now: context.now()
    });
  }

  if (values.json) {
    writeJson(context.stdout, payload);
    return payload.status === "unknown" ? 1 : 0;
  }

  renderUpdateCheck(payload, context);
  return payload.status === "unknown" ? 1 : 0;
}

async function accountsList(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    json: { type: "boolean" }
  });
  if (positionals.length > 0) throw new CommandError("Usage: audienti accounts list [--json] [--account <acct_id>]");

  const config = await requireAuthenticatedConfig(context);
  const accounts = await clientFromConfig(config, context).accounts();
  const activeAccountId = accountOverride || config.accountId;

  if (values.json) {
    writeLine(context.stdout, JSON.stringify(accounts, null, 2));
    return;
  }

  if (!accounts.length) {
    writeLine(context.stdout, "No accounts found.");
    return;
  }

  writeLine(context.stdout, "  ACCOUNT ID\tNAME");
  for (const account of accounts) {
    const accountId = account.prefix_id;
    if (!accountId) throw new CommandError("Account payload is missing prefix_id.");

    const marker = accountId === activeAccountId ? "*" : " ";
    writeLine(context.stdout, `${marker} ${accountId}\t${account.name}`);
  }
}

async function accountsShow(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 1) throw new CommandError(ACCOUNTS_SHOW_USAGE);

  const config = await requireAuthenticatedConfig(context);
  const accountId = positionals[0] || accountOverride || config.accountId;
  if (!accountId) {
    throw new CommandError("No active account. Run `audienti accounts select <acct_id>`, pass `--account <acct_id>`, or give an account id.");
  }

  const account = await clientFromConfig(config, context).account(accountId);
  if (values.json) return writeJson(context.stdout, account);

  writeLine(context.stdout, `Account: ${display(account?.name)} (${display(account?.prefix_id || accountId)})`);
  writeLine(context.stdout, `Personal: ${account?.personal ? "yes" : "no"}`);
  writeLine(context.stdout, `Members: ${Array.isArray(account?.account_users) ? account.account_users.length : 0}`);
  writeLine(context.stdout, `Created: ${display(account?.created_at, "-")}`);
}

async function linkedinLookups(kind, args, context, { accountOverride } = {}) {
  const lookup = LINKEDIN_LOOKUP_KINDS.get(String(kind || "").replaceAll("_", "-"));
  if (!lookup) throw new CommandError(LINKEDIN_LOOKUPS_USAGE);

  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    query: { type: "string" },
    icp: { type: "string" }
  });
  const query = values.query?.trim();
  const invalid = positionals.length > 0 ||
    (lookup.query === "required" && !query) ||
    (lookup.query === "none" && values.query !== undefined) ||
    (!lookup.icp && values.icp !== undefined);
  if (invalid) throw new CommandError(LINKEDIN_LOOKUPS_USAGE);

  const config = await requireAuthenticatedConfig(context);
  const params = { q: query };
  if (values.icp) {
    const accountId = accountOverride || config.accountId;
    if (!accountId) {
      throw new CommandError("No active account. Run `audienti accounts select <acct_id>` or pass `--account <acct_id>` to look up with --icp.");
    }
    params.icp_id = values.icp;
    params.account_id = accountId;
  }

  const payload = await clientFromConfig(config, context).linkedinLookup(lookup.path, params);
  if (values.json) return writeJson(context.stdout, payload);

  const rows = Array.isArray(payload) ? payload : [];
  if (rows.length === 0) return writeLine(context.stdout, "No results found.");

  writeLine(context.stdout, "ID\tNAME\tSOURCE");
  for (const row of rows) {
    writeLine(context.stdout, [display(row.id, "-"), display(row.name), display(row.source, "-")].join("\t"));
  }
}

async function accountsSelect(args, context) {
  const { positionals } = parseCommandArgs(args, {});
  if (positionals.length !== 1) throw new CommandError("Usage: audienti accounts select <acct_id>");

  const requestedAccountId = positionals[0];
  const config = await requireAuthenticatedConfig(context);
  const accounts = await clientFromConfig(config, context).accounts();
  const account = resolveAccountSelection(accounts, requestedAccountId);

  if (!account) {
    throw new CommandError(`Account ${requestedAccountId} does not exist or is not visible to this token.`);
  }

  await writeConfig({
    ...config,
    accountId: account.prefix_id,
    accountName: account.name,
    accountUserId: account.prefix_id === config.accountId ? config.accountUserId : undefined,
    accountUserName: account.prefix_id === config.accountId ? config.accountUserName : undefined,
    accountUserEmail: account.prefix_id === config.accountId ? config.accountUserEmail : undefined
  }, { env: context.env });

  writeLine(context.stdout, `Selected account ${account.name} (${account.prefix_id}).`);
}

function resolveAccountSelection(accounts, term) {
  const requested = String(term || "").trim();
  if (!requested) return null;

  const exactPrefix = accounts.find((candidate) => candidate.prefix_id === requested);
  if (exactPrefix) return exactPrefix;

  const normalizedRequested = requested.toLowerCase();
  const exactName = accounts.find((candidate) => String(candidate.name || "").toLowerCase() === normalizedRequested);
  if (exactName) return exactName;

  const matches = accounts.filter((candidate) => {
    const prefixId = String(candidate.prefix_id || "").toLowerCase();
    const name = String(candidate.name || "").toLowerCase();
    return prefixId.includes(normalizedRequested) || name.includes(normalizedRequested);
  });

  if (matches.length === 1) return matches[0];
  if (matches.length === 0) return null;

  const options = matches.map((candidate) => `${candidate.name} (${candidate.prefix_id})`).join(", ");
  throw new CommandError(`Account term "${requested}" matched multiple accounts: ${options}.`);
}

function resolveAccountUserSelection(users, term) {
  const requested = String(term || "").trim();
  if (!requested) return null;

  if (requested.toLowerCase() === "me") {
    const currentUsers = users.filter((candidate) => candidate.current);
    if (currentUsers.length === 1) return currentUsers[0];
    if (currentUsers.length > 1) throw new CommandError("The token matched multiple current account users.");
    return null;
  }

  const exactId = users.find((candidate) => String(candidate.id) === requested);
  if (exactId) return exactId;

  const normalizedRequested = requested.toLowerCase();
  const exactEmail = users.find((candidate) => String(candidate.email || "").toLowerCase() === normalizedRequested);
  if (exactEmail) return exactEmail;

  const exactName = users.find((candidate) => String(candidate.name || "").toLowerCase() === normalizedRequested);
  if (exactName) return exactName;

  const matches = users.filter((candidate) => {
    const id = String(candidate.id || "").toLowerCase();
    const name = String(candidate.name || "").toLowerCase();
    const email = String(candidate.email || "").toLowerCase();
    return id.includes(normalizedRequested) || name.includes(normalizedRequested) || email.includes(normalizedRequested);
  });

  if (matches.length === 1) return matches[0];
  if (matches.length === 0) return null;

  const options = matches.map(accountUserLabel).join(", ");
  throw new CommandError(`Account user term "${requested}" matched multiple account users: ${options}.`);
}

function accountUserLabel(accountUser) {
  const name = accountUser?.name || accountUser?.email || `Account user ${accountUser?.id}`;
  return `${name} (${accountUser?.id})`;
}

async function listsList(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    tag: { type: "string" }
  });
  if (positionals.length > 0) throw new CommandError("Usage: audienti lists list [--tag <tag>] [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const lists = filterRecordsByTag(await client.lists(accountId), values.tag, "tags");
  if (values.json) return writeJson(context.stdout, lists);

  renderLists(lists, context);
}

async function usersList(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError("Usage: audienti users list [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const users = await client.users(accountId);
  if (values.json) return writeJson(context.stdout, users);

  renderUsers(users, context);
}

async function usersSelect(args, context, { accountOverride } = {}) {
  const { positionals } = parseCommandArgs(args, {});
  if (positionals.length !== 1) throw new CommandError("Usage: audienti users select <account_user_id|email|name|me> [--account <acct_id>]");

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const users = await client.users(accountId);
  const accountUser = resolveAccountUserSelection(users, positionals[0]);
  if (!accountUser) {
    throw new CommandError(`Account user ${positionals[0]} does not exist or is not visible in account ${accountId}.`);
  }

  await writeConfig({
    ...config,
    accountId,
    accountName: accountOverride && accountOverride !== config.accountId ? undefined : config.accountName,
    accountUserId: String(accountUser.id),
    accountUserName: accountUser.name,
    accountUserEmail: accountUser.email
  }, { env: context.env });

  writeLine(context.stdout, `Selected account user ${accountUserLabel(accountUser)}.`);
}

async function usersActivity(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    mode: { type: "string" },
    window: { type: "string" },
    platform: { type: "string" },
    query: { type: "string" },
    limit: { type: "string" },
    page: { type: "string" }
  });
  if (positionals.length > 1) throw new CommandError(USERS_ACTIVITY_USAGE);

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const payload = await client.userActivity(accountId, resolveAccountUserId(positionals[0] || "me", config, { accountOverride }), compactObject({
    mode: values.mode,
    window: values.window,
    platform: values.platform,
    query: values.query,
    limit: values.limit,
    page: values.page
  }));
  if (values.json) return writeJson(context.stdout, payload);

  renderUserActivity(payload, context);
}

async function usersAutomation(args, context, { accountOverride } = {}) {
  const [action, ...rest] = args;
  if (action === "show") return usersAutomationShow(rest, context, { accountOverride });
  if (action === "update") return usersAutomationUpdate(rest, context, { accountOverride });

  throw new CommandError(`${USERS_AUTOMATION_SHOW_USAGE}\n${USERS_AUTOMATION_UPDATE_USAGE}`);
}

async function usersAutomationShow(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    platform: { type: "string" }
  });
  if (positionals.length !== 1) throw new CommandError(USERS_AUTOMATION_SHOW_USAGE);

  const platform = automationPlatform(values.platform);
  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const accountUserId = resolveAccountUserId(positionals[0], config, { accountOverride });
  const payload = await client.userAutomation(accountId, accountUserId, { platform });
  if (values.json) return writeJson(context.stdout, payload);

  renderUserAutomation(payload, context);
}

async function usersAutomationUpdate(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    payload: { type: "string" },
    apply: { type: "boolean" }
  });
  if (positionals.length !== 1 || !values.payload) throw new CommandError(USERS_AUTOMATION_UPDATE_USAGE);

  const platform = automationPlatform();
  const requestedAutomation = await readJsonPayload(values.payload);
  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const accountUserId = resolveAccountUserId(positionals[0], config, { accountOverride });
  const payload = await client.updateUserAutomation(
    accountId,
    accountUserId,
    { automation: { ...requestedAutomation, platform, apply: Boolean(values.apply) } },
    { platform }
  );
  if (values.json) return writeJson(context.stdout, payload);

  renderUserAutomation(payload, context);
}

function automationPlatform(value = "linkedin") {
  const platform = String(value || "").trim().toLowerCase();
  if (platform !== "linkedin") throw new CommandError("--platform must be linkedin.");

  return platform;
}

async function setupPlayPreflight(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    principal: { type: "string" },
    platform: { type: "string" }
  });
  if (positionals.length > 0) throw new CommandError(SETUP_PLAY_PREFLIGHT_USAGE);

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const payload = await client.socialCookies(accountId, compactObject({
    account_user_id: resolveAccountUserId(values.principal || "me", config, { accountOverride }),
    platform: values.platform || "linkedin"
  }));
  if (values.json) return writeJson(context.stdout, payload);

  renderSetupPlayPreflight(payload, context);
}

async function socialCookiesSyncMessages(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    folder: { type: "string" },
    retry: { type: "boolean" }
  });
  if (positionals.length !== 1 || (values.folder !== undefined && !String(values.folder).trim())) {
    throw new CommandError(SOCIAL_COOKIES_SYNC_MESSAGES_USAGE);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.syncSocialCookieMessages(accountId, positionals[0], compactObject({
    folder: values.folder,
    retry: values.retry ? true : undefined
  }));
  if (values.json) return writeJson(context.stdout, payload);

  renderSocialCookieSync(payload, context);
}

async function offersList(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError("Usage: audienti offers list [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const offers = await client.offers(accountId);
  if (values.json) return writeJson(context.stdout, offers);

  renderOffers(offers, context);
}

async function offersShow(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(OFFERS_SHOW_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const offer = await client.offer(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, offer);

  renderOffer(offer, context);
}

async function offersCreate(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    name: { type: "string" },
    description: { type: "string" },
    url: { type: "string" }
  });
  if (positionals.length > 0 || !values.name || (!values.description && !values.url)) {
    throw new CommandError("Usage: audienti offers create --name <text> [--description <text>] [--url <url>] [--json] [--account <acct_id>]");
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const offer = await client.createOffer(accountId, {
    offer: compactObject({
      name: values.name,
      description: values.description,
      url: values.url
    })
  });
  if (values.json) return writeJson(context.stdout, offer);

  writeLine(context.stdout, `Created offer ${display(offer?.name)} (${display(offer?.prefix_id)}).`);
  if (offer?.description) writeLine(context.stdout, `Description: ${offer.description}`);
  if (offer?.url) writeLine(context.stdout, `URL: ${offer.url}`);
}

async function offersUpdate(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    name: { type: "string" },
    description: { type: "string" },
    url: { type: "string" }
  });
  const hasUpdateField = values.name || values.description !== undefined || values.url !== undefined;
  if (positionals.length !== 1 || !hasUpdateField) {
    throw new CommandError(OFFERS_UPDATE_USAGE);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const offer = await client.updateOffer(accountId, positionals[0], {
    offer: compactObject({
      name: values.name,
      description: values.description,
      url: values.url
    })
  });
  if (values.json) return writeJson(context.stdout, offer);

  writeLine(context.stdout, `Updated offer ${display(offer?.name)} (${display(offer?.prefix_id)}).`);
  renderOffer(offer, context);
}

async function offersDelete(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    confirm: { type: "string" }
  });
  const normalizedConfirm = String(values.confirm || "").trim().toLowerCase();
  if (positionals.length !== 1 || !DELETE_CONFIRMATION_VALUES.has(normalizedConfirm)) {
    throw new CommandError(OFFERS_DELETE_USAGE);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.deleteOffer(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Deleted offer ${display(payload?.name)} (${display(payload?.prefix_id)}).`);
}

async function offersRegenerateResearch(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, { ...jsonOptions(), guidance: { type: "string" } });
  if (positionals.length !== 1) throw new CommandError(OFFERS_REGENERATE_RESEARCH_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const offer = await client.regenerateOfferResearch(accountId, positionals[0], compactObject({ guidance: values.guidance }));
  if (values.json) return writeJson(context.stdout, offer);

  writeLine(context.stdout, `Queued a new research write-up for offer ${display(offer?.name)} (${display(offer?.prefix_id)}).`);
}

async function offersUpdateWriteup(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, { ...jsonOptions(), description: { type: "string" } });
  if (positionals.length !== 1 || values.description === undefined) throw new CommandError(OFFERS_UPDATE_WRITEUP_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const offer = await client.updateOfferWriteup(accountId, positionals[0], { offer: { description: values.description } });
  if (values.json) return writeJson(context.stdout, offer);

  writeLine(context.stdout, `Updated the write-up for offer ${display(offer?.name)} (${display(offer?.prefix_id)}).`);
}

async function offersAddArtifacts(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length < 2) throw new CommandError(OFFERS_ADD_ARTIFACTS_USAGE);

  const [offerId, ...paths] = positionals;
  const artifacts = [];
  for (const path of paths) {
    let data;
    try {
      data = await readFile(path);
    } catch (error) {
      throw new CommandError(`Cannot read ${path}: ${error.message}`);
    }
    artifacts.push({ filename: basename(path), data: data.toString("base64") });
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.addOfferArtifacts(accountId, offerId, { artifacts });
  if (values.json) return writeJson(context.stdout, payload);

  const count = payload?.attached_count ?? artifacts.length;
  writeLine(context.stdout, `Attached ${count} ${count === 1 ? "artifact" : "artifacts"} to offer ${display(payload?.offer_id || offerId)}.`);
  renderOfferArtifacts(payload?.artifacts, context);
}

async function offersRemoveArtifact(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 2) throw new CommandError(OFFERS_REMOVE_ARTIFACT_USAGE);

  const [offerId, artifactId] = positionals;
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.removeOfferArtifact(accountId, offerId, artifactId);
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Removed artifact ${display(artifactId)} from offer ${display(payload?.offer_id || offerId)}.`);
}

const OFFER_SHELF_STATUSES = { on: "active", off: "inactive", active: "active", inactive: "inactive" };

function offerShelfStatus(value, usage) {
  if (value === undefined) return undefined;

  const status = OFFER_SHELF_STATUSES[String(value).trim().toLowerCase()];
  if (!status) throw new CommandError(`--status must be on or off.\n${usage}`);
  return status;
}

async function offerGiftFile(path) {
  if (path === undefined) return undefined;

  try {
    return { filename: basename(path), data: (await readFile(path)).toString("base64") };
  } catch (error) {
    throw new CommandError(`Cannot read ${path}: ${error.message}`);
  }
}

async function offersAddGift(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    title: { type: "string" },
    summary: { type: "string" },
    "send-url": { type: "string" },
    file: { type: "string" }
  });
  if (positionals.length !== 1 || !String(values.title || "").trim()) throw new CommandError(OFFERS_ADD_GIFT_USAGE);

  const gift = compactObject({
    title: values.title,
    summary: values.summary,
    send_url: values["send-url"],
    file: await offerGiftFile(values.file)
  });
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.createOfferGift(accountId, positionals[0], { gift });
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Added gift ${display(payload?.gift?.title)} (${display(payload?.gift?.prefix_id)}) to offer ${display(payload?.offer_id || positionals[0])}.`);
  renderOfferGifts([payload?.gift], context);
}

async function offersUpdateGift(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    title: { type: "string" },
    summary: { type: "string" },
    "send-url": { type: "string" },
    file: { type: "string" },
    "remove-file": { type: "boolean" },
    status: { type: "string" }
  });
  if (values.file !== undefined && values["remove-file"]) throw new CommandError("Use --file or --remove-file, not both.");
  const gift = compactObject({
    title: values.title,
    summary: values.summary,
    send_url: values["send-url"],
    remove_file: values["remove-file"] ? true : undefined,
    status: offerShelfStatus(values.status, OFFERS_UPDATE_GIFT_USAGE)
  });
  if (positionals.length !== 2 || (Object.keys(gift).length === 0 && values.file === undefined)) throw new CommandError(OFFERS_UPDATE_GIFT_USAGE);

  const file = await offerGiftFile(values.file);
  if (file) gift.file = file;
  const [offerId, giftId] = positionals;
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.updateOfferGift(accountId, offerId, giftId, { gift });
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Updated gift ${display(payload?.gift?.title)} (${display(payload?.gift?.prefix_id || giftId)}).`);
  renderOfferGifts([payload?.gift], context);
}

async function offersSetGiftStatus(args, context, { accountOverride, status } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 2) throw new CommandError(status === "active" ? OFFERS_TURN_ON_GIFT_USAGE : OFFERS_TURN_OFF_GIFT_USAGE);

  const [offerId, giftId] = positionals;
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.updateOfferGift(accountId, offerId, giftId, { gift: { status } });
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Turned ${status === "active" ? "on" : "off"} gift ${display(payload?.gift?.title)} (${display(payload?.gift?.prefix_id || giftId)}).`);
}

async function offersUpdateInsight(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    content: { type: "string" },
    "source-url": { type: "string" },
    status: { type: "string" }
  });
  const insight = compactObject({
    content: values.content,
    source_url: values["source-url"],
    status: offerShelfStatus(values.status, OFFERS_UPDATE_INSIGHT_USAGE)
  });
  if (positionals.length !== 2 || Object.keys(insight).length === 0) throw new CommandError(OFFERS_UPDATE_INSIGHT_USAGE);

  const [offerId, insightId] = positionals;
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.updateOfferInsight(accountId, offerId, insightId, { insight });
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Updated insight ${display(payload?.insight?.id || insightId)}.`);
  renderOfferInsights([payload?.insight], context);
}

async function offersSetInsightStatus(args, context, { accountOverride, status } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 2) throw new CommandError(status === "active" ? OFFERS_TURN_ON_INSIGHT_USAGE : OFFERS_TURN_OFF_INSIGHT_USAGE);

  const [offerId, insightId] = positionals;
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.updateOfferInsight(accountId, offerId, insightId, { insight: { status } });
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Turned ${status === "active" ? "on" : "off"} insight ${display(payload?.insight?.id || insightId)}.`);
}

async function icpsList(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    tag: { type: "string" },
    status: { type: "string" }
  });
  const status = values.status;
  if (positionals.length > 0 || (status && !["active", "archived", "all"].includes(status))) throw new CommandError(ICPS_LIST_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const icps = filterRecordsByTag(await client.icps(accountId, { status }), values.tag, "tags");
  if (values.json) return writeJson(context.stdout, icps);

  renderIcps(icps, context);
}

async function icpsLifecycleMutation(action, args, context, { accountOverride } = {}) {
  const usageText = action === "archive" ? ICPS_ARCHIVE_USAGE : ICPS_RESTORE_USAGE;
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(usageText);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const result = action === "archive" ?
    await client.archiveIcp(accountId, positionals[0]) :
    await client.restoreIcp(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, result);

  const verb = action === "archive" ? "Archived" : "Restored";
  writeLine(context.stdout, `${verb} ICP ${display(result?.icp?.name)} (${display(result?.icp?.prefix_id)}).`);
  writeIcpLifecycleEffects(result, context);
}

async function icpsShow(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(ICPS_SHOW_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const icp = await client.icp(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, icp);

  renderIcp(icp, context);
}

async function icpsCreate(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    payload: { type: "string" },
    name: { type: "string" },
    notes: { type: "string" },
    tags: { type: "string" },
    "discovery-keyword": { type: "string" }
  });
  if (positionals.length > 0) {
    throw new CommandError("Usage: audienti icps create (--name <text> [--notes <text>] [--discovery-keyword <text>] [--tags <tag[,tag...]>] | --payload <file.json>) [--json] [--account <acct_id>]");
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const icpPayload = await icpCreatePayload(values);
  const icp = await client.createIcp(accountId, { icp: icpPayload });
  if (values.json) return writeJson(context.stdout, icp);

  writeLine(context.stdout, `Created ICP ${display(icp?.name)} (${display(icp?.prefix_id)}).`);
  if (icp?.notes) writeLine(context.stdout, `Notes: ${icp.notes}`);
  if (Array.isArray(icp?.tags)) writeLine(context.stdout, `Tags: ${display(icp.tags.join(", "), "-")}`);
  if (icp?.discovery_keyword) writeLine(context.stdout, `Discovery keyword: ${icp.discovery_keyword}`);
}

async function icpsUpdate(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    payload: { type: "string" },
    name: { type: "string" },
    notes: { type: "string" },
    tags: { type: "string" },
    "discovery-keyword": { type: "string" }
  });
  const hasUpdateField = values.payload || icpSimpleFieldsPresent(values);
  if (positionals.length !== 1 || !hasUpdateField) {
    throw new CommandError(ICPS_UPDATE_USAGE);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const icp = await client.updateIcp(accountId, positionals[0], { icp: await icpUpdatePayload(values) });
  if (values.json) return writeJson(context.stdout, icp);

  writeLine(context.stdout, `Updated ICP ${display(icp?.name)} (${display(icp?.prefix_id)}).`);
  renderIcp(icp, context);
}

async function icpsTagMutation(action, args, context, { accountOverride } = {}) {
  const usageText = action === "add" ? ICPS_ADD_TAG_USAGE : ICPS_REMOVE_TAG_USAGE;
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 2) {
    throw new CommandError(usageText);
  }

  const [icpId, tag] = positionals;
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const icp = action === "add" ?
    await client.addIcpTag(accountId, icpId, { tag }) :
    await client.removeIcpTag(accountId, icpId, { tag });
  if (values.json) return writeJson(context.stdout, icp);

  const verb = action === "add" ? "Added" : "Removed";
  const preposition = action === "add" ? "to" : "from";
  writeLine(context.stdout, `${verb} tag ${display(tag)} ${preposition} ICP ${display(icp?.name)} (${display(icp?.prefix_id)}).`);
  if (Array.isArray(icp?.tags)) writeLine(context.stdout, `Tags: ${display(icp.tags.join(", "), "-")}`);
}

async function icpsBulkAddTag(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, { ...jsonOptions(), tag: { type: "string" } });
  if (positionals.length === 0 || !String(values.tag || "").trim()) throw new CommandError(ICPS_BULK_ADD_TAG_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const icps = await client.bulkAddIcpTag(accountId, { icp_ids: positionals, tag: values.tag });
  if (values.json) return writeJson(context.stdout, icps);

  const count = Array.isArray(icps) ? icps.length : 0;
  writeLine(context.stdout, `Added tag ${display(values.tag)} to ${count} ${count === 1 ? "ICP" : "ICPs"}.`);
}

async function icpsClone(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(ICPS_CLONE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const icp = await client.cloneIcp(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, icp);

  writeLine(context.stdout, `Cloned ICP as ${display(icp?.name)} (${display(icp?.prefix_id)}).`);
}

async function icpsDelete(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, { ...jsonOptions(), confirm: { type: "string" } });
  const normalizedConfirm = String(values.confirm || "").trim().toLowerCase();
  if (positionals.length !== 1 || !DELETE_CONFIRMATION_VALUES.has(normalizedConfirm)) throw new CommandError(ICPS_DELETE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.deleteIcp(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Deleted ICP ${display(payload?.name)} (${display(payload?.prefix_id)}).`);
}

async function icpsProspects(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    query: { type: "string" },
    limit: { type: "string" },
    offset: { type: "string" },
    page: { type: "string" },
    profiles: { type: "boolean" }
  });
  if (positionals.length !== 1) throw new CommandError(ICPS_PROSPECTS_USAGE);
  if (values.page && values.offset) throw new CommandError("Choose one pagination mode: use either --page or --offset.");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.icpProspects(accountId, positionals[0], compactObject({
    query: values.query,
    limit: values.limit,
    offset: values.offset,
    page: values.page,
    include_profiles: values.profiles
  }));
  if (values.json) return writeJson(context.stdout, payload);

  renderProspects(payload, context, { profiles: values.profiles });
  const meta = payload?.meta || {};
  writeLine(context.stdout, `Showing ${display(meta.returned_count, 0)} of ${display(meta.total_count, 0)} matched prospects.`);
}

async function companiesSearch(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    query: { type: "string" }
  });
  if (positionals.length > 0 || !values.query) {
    throw new CommandError("Usage: audienti companies search --query <text> [--json] [--account <acct_id>]");
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.companies(accountId, { query: values.query });
  if (values.json) return writeJson(context.stdout, payload);

  renderCompanies(payload, context);
}

async function dncList(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    limit: { type: "string" },
    offset: { type: "string" }
  });
  if (positionals.length > 0) throw new CommandError("Usage: audienti dnc list [--limit <n>] [--offset <n>] [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.dncEntries(accountId, compactObject({ limit: values.limit, offset: values.offset }));
  if (values.json) return writeJson(context.stdout, payload);

  renderDncEntries(payload, context);
}

async function dncAdd(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(DNC_ADD_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.createDncEntry(accountId, { value: positionals[0] });
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `DNC entry ${display(payload?.status, "created")}: ${display(payload?.dnc_entry?.canonical_value || payload?.dnc_entry?.citation_id)} (${display(payload?.dnc_entry?.prefix_id || payload?.dnc_entry?.id)}).`);
}

async function dncImport(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    file: { type: "string" }
  });
  if (positionals.length > 0 || !values.file) throw new CommandError(DNC_IMPORT_USAGE);

  const body = await readFile(values.file, "utf8");
  const importValues = parseDncImportValues(body);
  if (importValues.length === 0) throw new CommandError("DNC import file did not contain any values.");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.importDncEntries(accountId, { values: importValues, filename: basename(values.file) });
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Imported DNC entries. Accepted ${display(payload?.accepted_count, 0)}, skipped ${display(payload?.skipped_count, 0)}, invalid ${display(payload?.invalid_count, 0)}, matched ${display(payload?.matched_prospect_count, 0)}.`);
}

async function dncRemove(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(DNC_REMOVE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.deleteDncEntry(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Removed DNC entry ${display(payload?.prefix_id || payload?.id || positionals[0])}.`);
}

async function companyRulesList(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError("Usage: audienti company-rules list [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.companyRules(accountId);
  if (values.json) return writeJson(context.stdout, payload);

  renderCompanyRules(payload, context);
}

async function companyRulesShow(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(COMPANY_RULES_SHOW_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.companyRule(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  const rule = payload?.company_rule;
  writeLine(context.stdout, `Company rule ${display(rule?.name || rule?.domain || rule?.linkedin_company_identifier)} (${display(rule?.prefix_id || rule?.id)})`);
  writeLine(context.stdout, `Disposition: ${display(rule?.disposition)} | Scope: ${companyRuleScopeLabel(rule)} | Active: ${rule?.active ? "yes" : "no"}`);
  writeLine(context.stdout, `LinkedIn: ${display(rule?.linkedin_company_url || rule?.linkedin_company_identifier, "-")}`);
  writeLine(context.stdout, `Domain: ${display(rule?.domain, "-")}`);
  if (rule?.note) writeLine(context.stdout, `Note: ${rule.note}`);
}

async function companyRulesCreate(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, companyRuleOptions());
  if (positionals.length > 0 || (!values["linkedin-url"] && !values.domain) || !values.disposition) {
    throw new CommandError(COMPANY_RULES_CREATE_USAGE);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.createCompanyRule(accountId, { company_rule: companyRulePayload(values) });
  if (values.json) return writeJson(context.stdout, payload);

  const rule = payload?.company_rule;
  writeLine(context.stdout, `Created company rule ${display(rule?.name || rule?.domain || rule?.linkedin_company_identifier)} (${display(rule?.prefix_id || rule?.id)}).`);
  writeLine(context.stdout, `Disposition: ${display(rule?.disposition)} | Scope: ${companyRuleScopeLabel(rule)}`);
}

async function companyRulesUpdate(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, companyRuleOptions());
  const hasUpdate = values.disposition || values.name !== undefined || values["linkedin-url"] !== undefined || values.domain !== undefined || values.user !== undefined || values.note !== undefined;
  if (positionals.length !== 1 || !hasUpdate) throw new CommandError(COMPANY_RULES_UPDATE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.updateCompanyRule(accountId, positionals[0], { company_rule: companyRulePayload(values) });
  if (values.json) return writeJson(context.stdout, payload);

  const rule = payload?.company_rule;
  writeLine(context.stdout, `Updated company rule ${display(rule?.name || rule?.domain || rule?.linkedin_company_identifier)} (${display(rule?.prefix_id || rule?.id)}).`);
  writeLine(context.stdout, `Disposition: ${display(rule?.disposition)} | Scope: ${companyRuleScopeLabel(rule)}`);
}

async function companyRulesRemove(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(COMPANY_RULES_REMOVE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.deleteCompanyRule(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Removed company rule ${display(payload?.company_rule?.prefix_id || payload?.company_rule?.id || positionals[0])}.`);
}

async function companyRulesApply(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    all: { type: "boolean" }
  });
  if ((values.all && positionals.length > 0) || (!values.all && positionals.length !== 1)) {
    throw new CommandError(COMPANY_RULES_APPLY_USAGE);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = values.all ?
    await client.applyAllCompanyRules(accountId) :
    await client.applyCompanyRule(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  if (values.all) {
    writeLine(context.stdout, `Applied company rules. Matched ${display(payload?.matched_count, 0)}, changed ${display(payload?.applied_count, 0)}.`);
  } else {
    writeLine(context.stdout, `Applied company rule. Matched ${display(payload?.matched_count, 0)}, changed ${display(payload?.applied_count, 0)}.`);
  }
}

async function hubspotCommand(action, args, context, { accountOverride } = {}) {
  if (action === "show") return hubspotShow(args, context, { accountOverride });
  if (action === "connect") return hubspotConnect(args, context, { accountOverride });
  if (action === "disconnect") return hubspotDisconnect(args, context, { accountOverride });
  if (action === "sync") return hubspotSync(args, context, { accountOverride });
  if (action === "retry") return hubspotRetry(args, context, { accountOverride });

  throw new CommandError(`Unknown hubspot command "${display(action, "")}". Run \`audienti hubspot --help\`.`);
}

async function hubspotShow(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    errors: { type: "boolean" },
    limit: { type: "string" }
  });
  if (positionals.length > 0) throw new CommandError(HUBSPOT_SHOW_USAGE);
  const limit = normalizeOptionalPositiveInteger(values.limit, "--limit");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.hubspotIntegration(accountId, {
    log_status: values.errors ? "error" : undefined,
    limit
  });
  if (values.json) return writeJson(context.stdout, payload);

  const integration = payload?.hubspot_integration;
  if (!integration) {
    writeLine(context.stdout, "HubSpot: not connected.");
    return;
  }

  writeLine(context.stdout, `HubSpot: ${display(integration.status)} | Auto sync: ${integration.auto_sync_enabled ? "on" : "off"}`);
  writeLine(context.stdout, `Portal: ${display(integration.external_account_name, "-")} (${display(integration.external_account_id, "-")})`);
  writeLine(context.stdout, `Last synced: ${display(integration.last_synced_at, "never")}`);
  if (integration.last_error_message) writeLine(context.stdout, `Last error: ${integration.last_error_message}`);

  const listSyncs = payload?.list_syncs || [];
  writeLine(context.stdout, `List syncs: ${listSyncs.length}`);
  for (const listSync of listSyncs) {
    writeLine(context.stdout, `  ${display(listSync.id)}  ${display(listSync.source_list_name || listSync.source_list_id)}  ${display(listSync.display_status || listSync.status)}  signal: ${display(listSync.custom_signal?.name, "-")}`);
  }

  const events = payload?.recent_events || [];
  writeLine(context.stdout, `Recent events: ${events.length}`);
  for (const event of events) {
    const retry = event.retryable ? "  (retryable)" : "";
    writeLine(context.stdout, `  ${display(event.id)}  ${display(event.status)}  ${display(event.event_type)}  ${display(event.message, "")}${retry}`);
  }
}

async function hubspotConnect(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    token: { type: "string" },
    "token-stdin": { type: "boolean" }
  });
  const useStdin = Boolean(values["token-stdin"]);
  if (positionals.length > 0 || useStdin === (values.token !== undefined)) throw new CommandError(HUBSPOT_CONNECT_USAGE);

  const token = (useStdin ? await readStdinText(context) : String(values.token)).trim();
  if (!token) throw new CommandError(HUBSPOT_CONNECT_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.connectHubspot(accountId, { personal_access_token: token });
  if (values.json) return writeJson(context.stdout, payload);

  const integration = payload?.hubspot_integration;
  writeLine(context.stdout, `Connected HubSpot portal ${display(integration?.external_account_name || integration?.external_account_id)}.`);
  if (payload?.warning) writeLine(context.stdout, `Warning: ${payload.warning}`);
}

async function hubspotDisconnect(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError(HUBSPOT_DISCONNECT_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.disconnectHubspot(accountId);
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, "Disconnected HubSpot.");
}

async function hubspotSync(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError(HUBSPOT_SYNC_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.syncHubspot(accountId);
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, display(payload?.message, "HubSpot sync all queued."));
}

async function hubspotRetry(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(HUBSPOT_RETRY_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.retryHubspotEvent(accountId, { event_id: positionals[0] });
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, display(payload?.message, "HubSpot retry queued."));
}

async function hubspotListSyncs(action, args, context, { accountOverride } = {}) {
  const options = {
    ...jsonOptions(),
    "hubspot-list": { type: "string" },
    signal: { type: "string" },
    "source-agent": { type: "string" }
  };

  if (action === "create") {
    const { values, positionals } = parseCommandArgs(args, options);
    if (positionals.length > 0 || !values["hubspot-list"] || !values.signal || !values["source-agent"]) {
      throw new CommandError(HUBSPOT_LIST_SYNCS_CREATE_USAGE);
    }

    const { client, accountId } = await requireAccountContext(context, { accountOverride });
    const payload = await client.createHubspotListSync(accountId, {
      source_list_id: values["hubspot-list"],
      custom_signal_id: values.signal,
      source_agent_id: values["source-agent"]
    });
    if (values.json) return writeJson(context.stdout, payload);

    const listSync = payload?.list_sync;
    writeLine(context.stdout, `Created HubSpot list sync ${display(listSync?.id)} for ${display(listSync?.source_list_name || listSync?.source_list_id)}.`);
    return;
  }

  if (action === "update") {
    const { values, positionals } = parseCommandArgs(args, options);
    if (positionals.length !== 1 || !values.signal || !values["source-agent"]) throw new CommandError(HUBSPOT_LIST_SYNCS_UPDATE_USAGE);

    const { client, accountId } = await requireAccountContext(context, { accountOverride });
    const payload = await client.updateHubspotListSync(accountId, positionals[0], {
      custom_signal_id: values.signal,
      source_agent_id: values["source-agent"]
    });
    if (values.json) return writeJson(context.stdout, payload);

    writeLine(context.stdout, `Updated HubSpot list sync ${display(payload?.list_sync?.id || positionals[0])}. Updated prospects: ${display(payload?.updated_count, 0)}.`);
    return;
  }

  if (action === "remove" || action === "delete") {
    const { values, positionals } = parseCommandArgs(args, jsonOptions());
    if (positionals.length !== 1) throw new CommandError(HUBSPOT_LIST_SYNCS_REMOVE_USAGE);

    const { client, accountId } = await requireAccountContext(context, { accountOverride });
    const payload = await client.deleteHubspotListSync(accountId, positionals[0]);
    if (values.json) return writeJson(context.stdout, payload);

    writeLine(context.stdout, `Removed HubSpot list sync ${display(payload?.id || positionals[0])}.`);
    return;
  }

  if (action === "sync") {
    const { values, positionals } = parseCommandArgs(args, jsonOptions());
    if (positionals.length !== 1) throw new CommandError(HUBSPOT_LIST_SYNCS_SYNC_USAGE);

    const { client, accountId } = await requireAccountContext(context, { accountOverride });
    const payload = await client.syncHubspotListSync(accountId, positionals[0]);
    if (values.json) return writeJson(context.stdout, payload);

    writeLine(context.stdout, display(payload?.message, "HubSpot list sync queued."));
    return;
  }

  throw new CommandError(`Unknown hubspot list-syncs command "${display(action, "")}". Run \`audienti hubspot list-syncs --help\`.`);
}

async function webhooksCommand(action, args, context, { accountOverride } = {}) {
  const options = {
    ...jsonOptions(),
    label: { type: "string" },
    signal: { type: "string" },
    list: { type: "string" },
    status: { type: "string" }
  };

  if (action === "list") {
    const { values, positionals } = parseCommandArgs(args, jsonOptions());
    if (positionals.length > 0) throw new CommandError(WEBHOOKS_LIST_USAGE);

    const { client, accountId } = await requireAccountContext(context, { accountOverride });
    const payload = await client.prospectWebhookEndpoints(accountId);
    if (values.json) return writeJson(context.stdout, payload);

    const endpoints = payload?.prospect_webhook_endpoints || [];
    if (endpoints.length === 0) {
      writeLine(context.stdout, "No prospect webhook endpoints.");
      return;
    }
    for (const endpoint of endpoints) {
      writeLine(context.stdout, `${display(endpoint.id)}  ${display(endpoint.display_label || endpoint.label)}  ${display(endpoint.status)}  ${display(endpoint.url)}`);
    }
    return;
  }

  if (action === "create") {
    const { values, positionals } = parseCommandArgs(args, options);
    if (positionals.length > 0 || values.status !== undefined) throw new CommandError(WEBHOOKS_CREATE_USAGE);

    const body = {};
    if (values.label !== undefined) body.label = values.label;
    if (values.signal !== undefined) body.custom_signal_id = values.signal;
    if (values.list !== undefined) body.list_id = values.list;

    const { client, accountId } = await requireAccountContext(context, { accountOverride });
    const payload = await client.createProspectWebhookEndpoint(accountId, body);
    if (values.json) return writeJson(context.stdout, payload);

    writeWebhookEndpoint("Created", payload?.prospect_webhook_endpoint, context);
    return;
  }

  if (action === "update") {
    const { values, positionals } = parseCommandArgs(args, options);
    const body = {};
    if (values.label !== undefined) body.label = values.label;
    if (values.status !== undefined) {
      if (!WEBHOOK_STATUS_VALUES.has(values.status)) throw new CommandError("--status must be enabled or disabled.");
      body.status = values.status;
    }
    if (values.signal !== undefined) body.custom_signal_id = values.signal === "none" ? "" : values.signal;
    if (positionals.length !== 1 || values.list !== undefined || Object.keys(body).length === 0) {
      throw new CommandError(WEBHOOKS_UPDATE_USAGE);
    }

    const { client, accountId } = await requireAccountContext(context, { accountOverride });
    const payload = await client.updateProspectWebhookEndpoint(accountId, positionals[0], body);
    if (values.json) return writeJson(context.stdout, payload);

    writeWebhookEndpoint("Updated", payload?.prospect_webhook_endpoint, context);
    return;
  }

  if (action === "rotate") {
    const { values, positionals } = parseCommandArgs(args, jsonOptions());
    if (positionals.length !== 1) throw new CommandError(WEBHOOKS_ROTATE_USAGE);

    const { client, accountId } = await requireAccountContext(context, { accountOverride });
    const payload = await client.rotateProspectWebhookEndpoint(accountId, positionals[0]);
    if (values.json) return writeJson(context.stdout, payload);

    writeWebhookEndpoint("Rotated", payload?.prospect_webhook_endpoint, context);
    return;
  }

  if (action === "remove" || action === "delete") {
    const { values, positionals } = parseCommandArgs(args, jsonOptions());
    if (positionals.length !== 1) throw new CommandError(WEBHOOKS_REMOVE_USAGE);

    const { client, accountId } = await requireAccountContext(context, { accountOverride });
    const payload = await client.deleteProspectWebhookEndpoint(accountId, positionals[0]);
    if (values.json) return writeJson(context.stdout, payload);

    writeLine(context.stdout, `Removed prospect webhook endpoint ${display(payload?.id || positionals[0])}.`);
    return;
  }

  throw new CommandError(`Unknown webhooks command "${display(action, "")}". Run \`audienti webhooks --help\`.`);
}

async function readStdinText(context) {
  const input = context.stdin;
  if (!input) return "";

  let text = "";
  for await (const chunk of input) text += String(chunk);
  return text;
}

function writeWebhookEndpoint(verb, endpoint, context) {
  writeLine(context.stdout, `${verb} prospect webhook endpoint ${display(endpoint?.display_label || endpoint?.label)} (${display(endpoint?.id)}).`);
  writeLine(context.stdout, `Status: ${display(endpoint?.status)} | Signal: ${display(endpoint?.custom_signal?.name, "-")} | List: ${display(endpoint?.list?.name, "-")}`);
  writeLine(context.stdout, `URL: ${display(endpoint?.url)}`);
}

async function replyAlertsCommand(action, args, context) {
  if (action === "show") {
    const { values, positionals } = parseCommandArgs(args, jsonOptions());
    if (positionals.length > 0) throw new CommandError(REPLY_ALERTS_SHOW_USAGE);

    const config = await requireAuthenticatedConfig(context);
    const client = clientFromConfig(config, context);
    const payload = await client.replyAlerts();
    if (values.json) return writeJson(context.stdout, payload);

    writeReplyAlerts(payload?.reply_alerts, context);
    return;
  }

  if (action === "update") {
    const { values, positionals } = parseCommandArgs(args, {
      ...jsonOptions(),
      phone: { type: "string" },
      sms: { type: "string" },
      slack: { type: "string" }
    });
    const body = {};
    if (values.phone !== undefined) body.phone_number = values.phone === "none" ? "" : values.phone;
    if (values.sms !== undefined) body.sms_enabled = parseBooleanString(values.sms, "--sms");
    if (values.slack !== undefined) body.slack_enabled = parseBooleanString(values.slack, "--slack");
    if (positionals.length > 0 || Object.keys(body).length === 0) throw new CommandError(REPLY_ALERTS_UPDATE_USAGE);

    const config = await requireAuthenticatedConfig(context);
    const client = clientFromConfig(config, context);
    const payload = await client.updateReplyAlerts(body);
    if (values.json) return writeJson(context.stdout, payload);

    writeLine(context.stdout, "Updated reply alerts.");
    writeReplyAlerts(payload?.reply_alerts, context);
    return;
  }

  throw new CommandError(`Unknown reply-alerts command "${display(action, "")}". Run \`audienti reply-alerts --help\`.`);
}

function writeReplyAlerts(alerts, context) {
  writeLine(context.stdout, `SMS: ${alerts?.sms_enabled ? "on" : "off"} | Phone: ${display(alerts?.phone_number, "-")} | Active: ${alerts?.sms_active ? "yes" : "no"}`);
  writeLine(context.stdout, `Slack: ${alerts?.slack_enabled ? "on" : "off"} | Connected: ${alerts?.slack_connected ? "yes" : "no"} | Channel: ${display(alerts?.slack_channel, "-")}`);
}

async function paymentCommand(action, args, context, { accountOverride } = {}) {
  if (action === "show") {
    const { values, positionals } = parseCommandArgs(args, jsonOptions());
    if (positionals.length > 0) throw new CommandError(PAYMENT_SHOW_USAGE);

    const { client, accountId } = await requireAccountContext(context, { accountOverride });
    const payload = await client.accountPayment(accountId);
    if (values.json) return writeJson(context.stdout, payload);

    writeAccountPayment(payload, context);
    return;
  }

  if (action === "code") {
    const { values, positionals } = parseCommandArgs(args, jsonOptions());
    if (positionals.length !== 1) throw new CommandError(PAYMENT_CODE_USAGE);

    const { client, accountId } = await requireAccountContext(context, { accountOverride });
    const payload = await client.redeemSignupCode(accountId, positionals[0]);
    if (values.json) return writeJson(context.stdout, payload);

    writeLine(context.stdout, "Code accepted. No card needed.");
    writeAccountPayment(payload, context);
    return;
  }

  throw new CommandError(`Unknown payment command "${display(action, "")}". Run \`audienti payment --help\`.`);
}

function writeAccountPayment(payment, context) {
  const state = payment?.state;
  if (state === "payment_needed") {
    const price = payment?.price?.amount ? `$${payment.price.amount / 100}` : "the starting charge";
    const credits = payment?.card_usage?.unit === "usd_cents" && payment.card_usage.amount ? ` The card charge gets you $${payment.card_usage.amount / 100} of credits.` : "";
    writeLine(context.stdout, `Payment needed: pay ${price} by card or use a signup code.${credits}`);
    writeLine(context.stdout, `Card: open ${display(payment?.payment_url, "-")}`);
    writeLine(context.stdout, "Code: audienti payment code <signup_code>");
    return;
  }

  if (state === "payment_stopped") {
    writeLine(context.stdout, "Stopped: the payment for this account was returned. Nothing runs.");
    return;
  }

  writeLine(context.stdout, `State: ${display(state, "-")}`);
  writeLine(context.stdout, `Let in by: ${display(payment?.admitted_via, "-")}`);
  const usage = payment?.starting_usage;
  if (usage) writeLine(context.stdout, `Starting usage: ${usage.amount} ${usage.unit}`);
}

async function brandProfileCommand(action, args, context, { accountOverride } = {}) {
  if (action === "show") {
    const { values, positionals } = parseCommandArgs(args, jsonOptions());
    if (positionals.length > 0) throw new CommandError(BRAND_PROFILE_SHOW_USAGE);

    const { client, accountId } = await requireAccountContext(context, { accountOverride });
    const payload = await client.brandProfile(accountId);
    if (values.json) return writeJson(context.stdout, payload);

    writeBrandProfile(payload?.brand_profile, context);
    return;
  }

  if (action === "update") {
    const { values, positionals } = parseCommandArgs(args, {
      ...jsonOptions(),
      voice: { type: "string" },
      style: { type: "string" },
      "do-not-use": { type: "string" }
    });
    const body = {};
    if (values.voice !== undefined) body.voice = values.voice;
    if (values.style !== undefined) body.style = values.style;
    if (values["do-not-use"] !== undefined) body.do_not_use = values["do-not-use"];
    if (positionals.length > 0 || Object.keys(body).length === 0) throw new CommandError(BRAND_PROFILE_UPDATE_USAGE);

    const { client, accountId } = await requireAccountContext(context, { accountOverride });
    const payload = await client.updateBrandProfile(accountId, body);
    if (values.json) return writeJson(context.stdout, payload);

    writeLine(context.stdout, "Updated brand profile.");
    writeBrandProfile(payload?.brand_profile, context);
    return;
  }

  throw new CommandError(`Unknown brand-profile command "${display(action, "")}". Run \`audienti brand-profile --help\`.`);
}

function writeBrandProfile(profile, context) {
  writeLine(context.stdout, `Voice: ${display(profile?.voice, "-")}`);
  writeLine(context.stdout, `Style: ${display(profile?.style, "-")}`);
  writeLine(context.stdout, `Do not use: ${display(profile?.do_not_use, "-")}`);
}

// Same search as the web ⌘K "Jump to" pop-up: people, companies, experiments and users by name, at most 5 of each.
async function findByName(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  const query = positionals.join(" ").trim();
  if (!query) throw new CommandError("Usage: audienti find <name> [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.jumpTo(accountId, query);
  if (values.json) return writeJson(context.stdout, payload);

  renderFindResults(payload, context);
}

async function tagsList(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError("Usage: audienti tags list [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.tags(accountId);
  if (values.json) return writeJson(context.stdout, payload);

  renderTags(payload, context);
}

async function tagsShow(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError("Usage: audienti tags show <tag> [--json] [--account <acct_id>]");

  const tag = tagList(positionals[0])[0];
  if (!tag) throw new CommandError("Usage: audienti tags show <tag> [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = {
    tag,
    icps: filterRecordsByTag(await client.icps(accountId), tag, "tags"),
    lists: filterRecordsByTag(await client.lists(accountId), tag, "tags"),
    motions: filterRecordsByTag(await client.motions(accountId), tag, "play_tags")
  };
  if (values.json) return writeJson(context.stdout, payload);

  renderTagDetails(payload, context);
}

async function tasksList(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, taskListOptions());
  if (positionals.length > 0) throw new CommandError(TASKS_LIST_USAGE);
  validateTaskStatus(values.status);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.tasks(accountId, compactObject({
    status: values.status,
    limit: values.limit ? boundedListLimit(values.limit) : undefined
  }));
  if (values.json) return writeJson(context.stdout, payload);

  renderTasks(payload, context);
}

async function tasksAdd(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, taskAddOptions());
  if (positionals.length > 0 || !values.title || !values.due) throw new CommandError(TASKS_ADD_USAGE);
  if (values.prospect && values.list) throw new CommandError("Use either --prospect or --list, not both.");

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const task = compactObject({
    title: values.title,
    due_at: values.due,
    notes: values.notes,
    prospect_id: values.prospect,
    list_id: values.list,
    assignee_account_user_id: resolveAccountUserId(values["assigned-user"], config, { accountOverride })
  });
  const payload = await client.createTask(accountId, { task });
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Created task ${display(payload?.prefix_id || payload?.id)}.`);
  writeLine(context.stdout, `Title: ${display(payload?.title)}`);
  if (payload?.notes) writeLine(context.stdout, `Description: ${payload.notes}`);
  writeLine(context.stdout, `Due: ${display(payload?.due_at, "-")} | Association: ${taskAssociationLabel(payload)}`);
}

async function tasksComplete(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(TASKS_COMPLETE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.completeTask(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Completed task ${display(payload?.prefix_id || payload?.id || positionals[0])}.`);
}

async function tasksUpdate(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, taskAddOptions());
  const fields = {
    title: values.title,
    due_at: values.due,
    notes: values.notes,
    prospect_id: values.prospect,
    list_id: values.list,
    assignee_account_user_id: values["assigned-user"]
  };
  const sentFields = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (positionals.length !== 1 || sentFields.length === 0) throw new CommandError(TASKS_UPDATE_USAGE);
  if (values.prospect && values.list) throw new CommandError("Use either --prospect or --list, not both.");

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const task = Object.fromEntries(sentFields);
  if (task.assignee_account_user_id !== undefined) {
    task.assignee_account_user_id = resolveAccountUserId(task.assignee_account_user_id, config, { accountOverride }) ?? "";
  }
  const payload = await client.updateTask(accountId, positionals[0], { task });
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Updated task ${display(payload?.prefix_id || payload?.id || positionals[0])}.`);
  writeLine(context.stdout, `Title: ${display(payload?.title)}`);
  writeLine(context.stdout, `Due: ${display(payload?.due_at, "-")} | Association: ${taskAssociationLabel(payload)}`);
}

async function tasksBulkUpdate(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    action: { type: "string" },
    "assigned-user": { type: "string" }
  });
  const bulkAction = String(values.action || "").trim();
  if (positionals.length === 0 || !["complete", "reassign"].includes(bulkAction)) throw new CommandError(TASKS_BULK_UPDATE_USAGE);
  if (bulkAction === "reassign" && !values["assigned-user"]) throw new CommandError("--assigned-user is required with --action reassign.");

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const payload = await client.bulkUpdateTasks(accountId, compactObject({
    task_ids: positionals,
    bulk_action: bulkAction,
    assignee_account_user_id: bulkAction === "reassign" ? resolveAccountUserId(values["assigned-user"], config, { accountOverride }) : undefined
  }));
  if (values.json) return writeJson(context.stdout, payload);

  const count = payload?.count ?? 0;
  const noun = count === 1 ? "task" : "tasks";
  writeLine(context.stdout, bulkAction === "complete" ? `Completed ${count} ${noun}.` : `Queued reassignment of ${count} ${noun}.`);
}

async function listsCreate(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    name: { type: "string" },
    description: { type: "string" },
    tags: { type: "string" },
    "campaign-hook": { type: "string" },
    "audience-note": { type: "string" }
  });
  if (positionals.length > 0 || !values.name) {
    throw new CommandError("Usage: audienti lists create --name <text> [--description <text>] [--tags <tag[,tag...]>] [--campaign-hook <text>] [--audience-note <text>] [--json] [--account <acct_id>]");
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const campaignBrief = compactObject({
    hook: values["campaign-hook"],
    audience_note: values["audience-note"]
  });
  const payload = await client.createList(accountId, {
    list: compactObject({
      name: values.name,
      description: values.description,
      tags: tagList(values.tags),
      campaign_brief: Object.keys(campaignBrief).length > 0 ? campaignBrief : undefined
    })
  });
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Created list ${display(payload?.name)} (${display(payload?.prefix_id)}).`);
  if (payload?.description) writeLine(context.stdout, `Description: ${payload.description}`);
}

async function listsShow(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError("Usage: audienti lists show <list_id> [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const list = await client.list(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, list);

  renderList(list, context);
}

async function listsUpdate(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    name: { type: "string" },
    description: { type: "string" },
    tags: { type: "string" },
    "campaign-hook": { type: "string" },
    "audience-note": { type: "string" }
  });
  const hasCampaignUpdate = values["campaign-hook"] || values["audience-note"];
  const hasUpdateField = values.name || values.description || values.tags !== undefined || hasCampaignUpdate;
  if (positionals.length !== 1 || !hasUpdateField) {
    throw new CommandError("Usage: audienti lists update <list_id> [--name <text>] [--description <text>] [--tags <tag[,tag...]>] [--campaign-hook <text>] [--audience-note <text>] [--json] [--account <acct_id>]");
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const campaignBrief = compactObject({
    hook: values["campaign-hook"],
    audience_note: values["audience-note"]
  });
  const payload = await client.updateList(accountId, positionals[0], {
    list: compactObject({
      name: values.name,
      description: values.description,
      tags: values.tags !== undefined ? tagList(values.tags) : undefined,
      campaign_brief: Object.keys(campaignBrief).length > 0 ? campaignBrief : undefined
    })
  });
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Updated list ${display(payload?.name)} (${display(payload?.prefix_id)}).`);
  if (payload?.description) writeLine(context.stdout, `Description: ${payload.description}`);
}

async function listsTagMutation(action, args, context, { accountOverride } = {}) {
  const usageText = action === "add" ? LISTS_ADD_TAG_USAGE : LISTS_REMOVE_TAG_USAGE;
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 2) {
    throw new CommandError(usageText);
  }

  const [listId, tag] = positionals;
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = action === "add" ?
    await client.addListTag(accountId, listId, { tag }) :
    await client.removeListTag(accountId, listId, { tag });
  if (values.json) return writeJson(context.stdout, payload);

  const verb = action === "add" ? "Added" : "Removed";
  const preposition = action === "add" ? "to" : "from";
  writeLine(context.stdout, `${verb} tag ${display(tag)} ${preposition} list ${display(payload?.name)} (${display(payload?.prefix_id)}).`);
  if (Array.isArray(payload?.tags)) writeLine(context.stdout, `Tags: ${display(payload.tags.join(", "), "-")}`);
}

async function listsDelete(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    confirm: { type: "string" }
  });
  const normalizedConfirm = String(values.confirm || "").trim().toLowerCase();
  if (positionals.length !== 1 || !DELETE_CONFIRMATION_VALUES.has(normalizedConfirm)) {
    throw new CommandError("Usage: audienti lists delete <list_id> --confirm <yes|true|Y|y> [--json] [--account <acct_id>]");
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.deleteList(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Deleted list ${display(payload?.name)} (${display(payload?.prefix_id)}).`);
  if (payload?.reassigned_agent_count !== undefined) {
    writeLine(context.stdout, `Reassigned agents: ${display(payload.reassigned_agent_count, 0)}`);
  }
}

async function listsBulkAddTag(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, { ...jsonOptions(), tag: { type: "string" } });
  if (positionals.length === 0 || !String(values.tag || "").trim()) throw new CommandError(LISTS_BULK_ADD_TAG_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const lists = await client.bulkAddListTag(accountId, { list_ids: positionals, tag: values.tag });
  if (values.json) return writeJson(context.stdout, lists);

  const count = Array.isArray(lists) ? lists.length : 0;
  writeLine(context.stdout, `Added tag ${display(values.tag)} to ${count} ${count === 1 ? "list" : "lists"}.`);
}

async function listsMerge(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 2) throw new CommandError(LISTS_MERGE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const list = await client.mergeLists(accountId, { list_ids: positionals });
  if (values.json) return writeJson(context.stdout, list);

  writeLine(context.stdout, `Merged into list ${display(list?.name)} (${display(list?.prefix_id)}); the newer list was deleted.`);
  writeLine(context.stdout, `Prospects: ${display(list?.prospect_count, 0)}`);
}

async function listsExport(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    output: { type: "string" },
    "inactive-reason": { type: "string" }
  });
  if (positionals.length !== 1) throw new CommandError(LISTS_EXPORT_USAGE);

  const listId = positionals[0];
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const csv = String(await client.exportList(accountId, listId, compactObject({ inactive_reason: values["inactive-reason"] })) ?? "");

  if (values.output) {
    await writeFile(values.output, csv);
    if (values.json) return writeJson(context.stdout, { list_id: listId, output: values.output, bytes: Buffer.byteLength(csv) });
    return writeLine(context.stdout, `Wrote list ${display(listId)} CSV to ${values.output}.`);
  }
  if (values.json) return writeJson(context.stdout, { list_id: listId, csv });

  context.stdout.write(csv);
}

async function listProspects(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    all: { type: "boolean" },
    csv: { type: "boolean" },
    limit: { type: "string" },
    offset: { type: "string" },
    page: { type: "string" },
    profiles: { type: "boolean" },
    wide: { type: "boolean" }
  });
  if (positionals.length !== 1) throw new CommandError("Usage: audienti lists prospects <list_id> [--json] [options] [--account <acct_id>]");
  if (values.csv && values.json) throw new CommandError("Choose one output format: use either --csv or --json.");
  if (values.page && values.offset) throw new CommandError("Choose one pagination mode: use either --page or --offset.");
  if (values.all && (values.page || values.offset)) throw new CommandError("--all cannot be combined with --page or --offset.");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const listId = positionals[0];
  const query = compactObject({
    limit: values.limit,
    offset: values.offset,
    page: values.page,
    include_profiles: values.profiles
  });
  const payload = values.all ?
    await fetchAllPages((pageQuery) => client.listProspects(accountId, listId, pageQuery), query, { totalLimit: parseProspectTotalLimit(values.limit) }) :
    await client.listProspects(accountId, listId, query);

  if (values.json) return writeJson(context.stdout, payload);
  if (values.csv) return writeLine(context.stdout, prospectsToCsv(payload?.prospects || []));

  renderProspects(payload, context, { wide: values.wide || values.all, profiles: values.profiles });
}

async function listsAddProspects(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length < 2) {
    throw new CommandError("Usage: audienti lists add-prospects <list_id> <prsp_id> [prsp_id...] [--json] [--account <acct_id>]");
  }

  const [listId, ...prospectIds] = positionals;
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const { payload, rejected } = await performBulkMutation(() =>
    client.addListProspects(accountId, listId, { prospect_ids: prospectIds }));
  if (values.json) {
    writeJson(context.stdout, payload);
    return rejected ? 1 : 0;
  }

  renderBulkMutationResult(payload, context, {
    successLabel: `Added ${successCount(payload)} prospects to list ${listId}.`,
    zeroSuccessLabel: `No prospects were added to list ${listId}.`
  });
  return rejected ? 1 : 0;
}

async function listsRemoveProspects(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length < 2) {
    throw new CommandError("Usage: audienti lists remove-prospects <list_id> <prsp_id> [prsp_id...] [--json] [--account <acct_id>]");
  }

  const [listId, ...prospectIds] = positionals;
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const { payload, rejected } = await performBulkMutation(() =>
    client.removeListProspects(accountId, listId, { prospect_ids: prospectIds }));
  if (values.json) {
    writeJson(context.stdout, payload);
    return rejected ? 1 : 0;
  }

  renderBulkMutationResult(payload, context, {
    successLabel: `Removed ${successCount(payload)} prospects from list ${listId}.`,
    zeroSuccessLabel: `No prospects were removed from list ${listId}.`
  });
  return rejected ? 1 : 0;
}

async function listsRoutingRules(args, context, { accountOverride } = {}) {
  const [listId, subaction, ...rest] = args;
  if (!listId || !subaction) {
    throw new CommandError("Usage: audienti lists routing-rules <list_id> <list|create|update|remove|move|toggle|apply> [args] [--json] [--account <acct_id>]");
  }

  if (subaction === "list") return listRoutingRulesList(listId, rest, context, { accountOverride });
  if (subaction === "create") return listRoutingRulesCreate(listId, rest, context, { accountOverride });
  if (subaction === "update") return listRoutingRulesUpdate(listId, rest, context, { accountOverride });
  if (["remove", "delete"].includes(subaction)) return listRoutingRulesRemove(listId, rest, context, { accountOverride });
  if (subaction === "move") return listRoutingRulesMove(listId, rest, context, { accountOverride });
  if (subaction === "toggle") return listRoutingRulesToggle(listId, rest, context, { accountOverride });
  if (subaction === "apply") return listRoutingRulesApply(listId, rest, context, { accountOverride });

  throw new CommandError("Usage: audienti lists routing-rules <list_id> <list|create|update|remove|move|toggle|apply> [args] [--json] [--account <acct_id>]");
}

async function listRoutingRulesList(listId, args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError(LIST_ROUTING_RULES_LIST_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.listRoutingRules(accountId, listId);
  if (values.json) return writeJson(context.stdout, payload);

  renderListRoutingRules(payload, context);
}

async function listRoutingRulesCreate(listId, args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    payload: {type: "string"}
  });
  if (positionals.length > 0 || !values.payload) throw new CommandError(LIST_ROUTING_RULES_CREATE_USAGE);

  const ruleInput = await readJsonPayload(values.payload);
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.createListRoutingRule(accountId, listId, {routing_rule: ruleInput});
  if (values.json) return writeJson(context.stdout, payload);

  const rule = payload?.routing_rule;
  writeLine(context.stdout, `Created routing rule ${display(rule?.name)} (${display(rule?.id)}) on list ${display(payload?.list_id || listId)}.`);
}

async function listRoutingRulesUpdate(listId, args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    payload: {type: "string"}
  });
  if (positionals.length !== 1 || !values.payload) throw new CommandError(LIST_ROUTING_RULES_UPDATE_USAGE);

  const ruleInput = await readJsonPayload(values.payload);
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.updateListRoutingRule(accountId, listId, positionals[0], {routing_rule: ruleInput});
  if (values.json) return writeJson(context.stdout, payload);

  const rule = payload?.routing_rule;
  writeLine(context.stdout, `Updated routing rule ${display(rule?.name)} (${display(rule?.id)}) on list ${display(payload?.list_id || listId)}.`);
}

async function listRoutingRulesRemove(listId, args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(LIST_ROUTING_RULES_REMOVE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.removeListRoutingRule(accountId, listId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  const rule = payload?.routing_rule;
  writeLine(context.stdout, `Removed routing rule ${display(rule?.name)} (${display(rule?.id || positionals[0])}) from list ${display(listId)}.`);
}

async function listRoutingRulesMove(listId, args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  const [ruleId, direction] = positionals;
  if (positionals.length !== 2 || !["up", "down"].includes(direction)) {
    throw new CommandError(LIST_ROUTING_RULES_MOVE_USAGE);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.moveListRoutingRule(accountId, listId, ruleId, {direction});
  if (values.json) return writeJson(context.stdout, payload);

  const verb = payload?.moved ? "Moved" : "Could not move";
  writeLine(context.stdout, `${verb} routing rule ${display(ruleId)} ${direction} on list ${display(payload?.list_id || listId)}.`);
  renderListRoutingRules(payload, context);
}

async function listRoutingRulesToggle(listId, args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(LIST_ROUTING_RULES_TOGGLE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.toggleListRoutingRule(accountId, listId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  const rule = payload?.routing_rule;
  const state = rule?.enabled ? "Enabled" : "Disabled";
  writeLine(context.stdout, `${state} routing rule ${display(rule?.name)} (${display(rule?.id || positionals[0])}) on list ${display(payload?.list_id || listId)}.`);
}

async function listRoutingRulesApply(listId, args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError(LIST_ROUTING_RULES_APPLY_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.applyListRoutingRules(accountId, listId);
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Routing rules will be applied in the background to list ${display(payload?.list_id || listId)}.`);
}

async function motionsList(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    tag: { type: "string" }
  });
  if (positionals.length > 0) throw new CommandError("Usage: audienti motions list [--tag <tag>] [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const motions = filterRecordsByTag(await client.motions(accountId), values.tag, "play_tags");
  if (values.json) return writeJson(context.stdout, motions);

  renderMotions(motions, context);
}

async function motionsShow(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError("Usage: audienti motions show <motn_id> [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const motion = await client.motion(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, motion);

  renderMotion(motion, context);
}

async function motionsSignals(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError("Usage: audienti motions signals <motn_id> [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.motionSignals(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  renderMotionDiscoverySignals(payload, context);
}

async function motionsStatus(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError("Usage: audienti motions status <motn_id> [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const status = await client.motionStatus(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, status);

  renderMotionStatus(status, context);
}

async function motionsRunDiscovery(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    "target-count": { type: "string" }
  });
  if (positionals.length !== 1) throw new CommandError(MOTIONS_RUN_DISCOVERY_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  let payload;
  try {
    payload = await client.runMotionDiscovery(accountId, positionals[0], compactObject({
      target_count: normalizeOptionalPositiveInteger(values["target-count"], "--target-count")
    }));
  } catch (error) {
    if (!(error instanceof ApiError) || !error.body || typeof error.body !== "object") throw error;

    payload = error.body;
    if (values.json) writeJson(context.stdout, payload);
    else renderMotionDiscoveryRun(payload, context);
    return 1;
  }

  if (values.json) {
    writeJson(context.stdout, payload);
    return payload?.enqueued ? 0 : 1;
  }

  renderMotionDiscoveryRun(payload, context);
  return payload?.enqueued ? 0 : 1;
}

async function motionsQuickStart(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    url: { type: "string" },
    city: { type: "string" },
    state: { type: "string" },
    country: { type: "string" },
    principal: { type: "string" },
    feedback: { type: "string" },
    "offer-type": { type: "string" },
    force: { type: "boolean" },
    confirm: { type: "boolean" },
    wait: { type: "boolean" },
    "timeout-seconds": { type: "string" },
    "poll-interval-seconds": { type: "string" }
  });
  if (positionals.length > 0 || !values.url) throw new CommandError(MOTIONS_QUICK_START_USAGE);

  const timeoutSeconds = normalizeOptionalPositiveInteger(values["timeout-seconds"], "--timeout-seconds") || DEFAULT_LOOKUP_TIMEOUT_SECONDS;
  const pollIntervalSeconds = normalizeOptionalPositiveInteger(values["poll-interval-seconds"], "--poll-interval-seconds") || DEFAULT_LOOKUP_POLL_INTERVAL_SECONDS;
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const requestBody = {
    quick_start: compactObject({
      company_url: values.url,
      city: values.city,
      state_code: values.state,
      country_code: values.country,
      principal_account_user_id: values.principal,
      feedback: values.feedback,
      offer_type: values["offer-type"],
      force: values.force || undefined
    })
  };

  let draft = await client.createQuickStart(accountId, requestBody);
  if (values.wait && !quickStartReady(draft)) {
    draft = await waitForQuickStartDraft(client, accountId, draft, context, { timeoutSeconds, pollIntervalSeconds });
  }

  if (values.confirm) {
    if (!quickStartReady(draft)) {
      throw new CommandError(`Quick-start draft ${display(draft?.id)} is ${display(draft?.status)}. Re-run with --wait or confirm after it is ready.`);
    }

    remindExperimentMethodology(context);
    const payload = await client.confirmQuickStart(accountId, draft.id, {});
    if (values.json) return writeJson(context.stdout, payload);

    renderQuickStartConfirmation(payload, context);
    return;
  }

  if (values.json) return writeJson(context.stdout, draft);
  renderQuickStartDraft(draft, context);
}

async function motionsSetupState(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    principal: { type: "string" }
  });
  if (positionals.length > 0) throw new CommandError(MOTIONS_SETUP_STATE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const query = values.principal ? { "quick_start[principal_account_user_id]": values.principal } : {};
  const state = await client.setupState(accountId, query);
  if (values.json) return writeJson(context.stdout, state);

  const stepNames = { company: "Your company", targeting: "Verify your targeting", go_live: "Go live" };
  if (state.step === "live") {
    writeLine(context.stdout, "Setup: done. LinkedIn is connected and you are live.");
  } else {
    writeLine(context.stdout, `Setup: step ${state.step_number} of 3, ${stepNames[state.step] || state.step}`);
  }
  if (state.blocker) writeLine(context.stdout, `Next: ${state.blocker}`);
  if (state.motion) {
    writeLine(context.stdout, `Experiment: ${state.motion.name} (${state.motion.prefix_id})`);
    writeLine(context.stdout, `Prospects: ${state.people_found}${state.finding_people ? " (looking for your signals; the first ones can take a day)" : ""}`);
  }
}

async function motionsAnalytics(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    window: { type: "string" }
  });
  if (positionals.length !== 1) throw new CommandError(MOTIONS_ANALYTICS_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.analyticsProspects(accountId, {
    motion_id: positionals[0],
    window: values.window || "30d"
  });
  if (values.json) return writeJson(context.stdout, payload);

  renderMotionAnalytics(payload, context);
}

async function motionsProspects(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    all: { type: "boolean" },
    csv: { type: "boolean" },
    limit: { type: "string" },
    offset: { type: "string" },
    page: { type: "string" },
    profiles: { type: "boolean" },
    wide: { type: "boolean" }
  });
  if (positionals.length !== 1) throw new CommandError("Usage: audienti motions prospects <motn_id> [--json] [options] [--account <acct_id>]");
  if (values.csv && values.json) throw new CommandError("Choose one output format: use either --csv or --json.");
  if (values.page && values.offset) throw new CommandError("Choose one pagination mode: use either --page or --offset.");
  if (values.all && (values.page || values.offset)) throw new CommandError("--all cannot be combined with --page or --offset.");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const motionId = positionals[0];
  const query = compactObject({
    limit: values.limit,
    offset: values.offset,
    page: values.page,
    include_profiles: values.profiles
  });
  const payload = values.all ?
    await fetchAllPages((pageQuery) => client.motionProspects(accountId, motionId, pageQuery), query, { totalLimit: parseProspectTotalLimit(values.limit) }) :
    await client.motionProspects(accountId, motionId, query);

  if (values.json) return writeJson(context.stdout, payload);
  if (values.csv) return writeLine(context.stdout, prospectsToCsv(payload?.prospects || []));

  renderProspects(payload, context, { wide: values.wide || values.all, profiles: values.profiles });
}

async function motionsAddProspects(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    "assigned-user": { type: "string" }
  });
  if (positionals.length < 2) {
    throw new CommandError("Usage: audienti motions add-prospects <motn_id> <prsp_id> [prsp_id...] [--assigned-user <id|me>] [--json] [--account <acct_id>]");
  }

  const [motionId, ...prospectIds] = positionals;
  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const { payload, rejected } = await performBulkMutation(() =>
    client.addMotionProspects(accountId, motionId, compactObject({
      prospect_ids: prospectIds,
      assigned_user_id: resolveAccountUserId(values["assigned-user"], config, { accountOverride })
    })));
  if (values.json) {
    writeJson(context.stdout, payload);
    return rejected ? 1 : 0;
  }

  renderBulkMutationResult(payload, context, {
    successLabel: `Assigned ${successCount(payload)} prospects to motion ${motionId}.`,
    zeroSuccessLabel: `No prospects were assigned to motion ${motionId}.`
  });
  return rejected ? 1 : 0;
}

async function motionsCreate(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    payload: { type: "string" },
    gift: { type: "string" }
  });
  if (positionals.length > 0 || !values.payload) {
    throw new CommandError(MOTIONS_CREATE_USAGE);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = withMotionGift(normalizeMotionCreatePayload(await readJsonPayload(values.payload)), values.gift);
  const created = await client.createMotion(accountId, { motion: payload });
  if (values.json) return writeJson(context.stdout, created);

  writeLine(context.stdout, `Created motion ${display(created?.name)} (${display(created?.prefix_id)}).`);
  renderMotion(created, context);
}

// --gift names a ready gift on the motion's offer. "none" clears the gift.
function normalizeMotionGift(value) {
  if (value === undefined) return undefined;

  const gift = String(value).trim();
  if (!gift) throw new CommandError("--gift needs a gift id or none.");
  return gift.toLowerCase() === "none" ? null : gift;
}

function withMotionGift(payload, value) {
  const gift = normalizeMotionGift(value);
  if (gift === undefined || !payload || typeof payload !== "object" || Array.isArray(payload)) return payload;

  return { ...payload, offer_gift_id: gift };
}

function normalizeMotionCreatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  rejectMotionPlanningMode(payload);
  validateMotionSignalRows(payload);
  if (String(payload.kind || "").trim().toLowerCase() !== "inbound") return payload;
  if (Object.prototype.hasOwnProperty.call(payload, "inbound_channels")) return payload;

  return { ...payload, inbound_channels: ["linkedin"] };
}

async function motionsAbmCompanies(args, context, { accountOverride } = {}) {
  const [motionId, subaction, ...rest] = args;
  if (!motionId || !subaction) throw new CommandError("Usage: audienti motions abm-companies <motn_id> <list|add|remove> [args] [--json] [--account <acct_id>]");

  if (subaction === "list") return motionsAbmCompaniesList(motionId, rest, context, { accountOverride });
  if (subaction === "add") return motionsAbmCompaniesAdd(motionId, rest, context, { accountOverride });
  if (["remove", "delete"].includes(subaction)) return motionsAbmCompaniesRemove(motionId, rest, context, { accountOverride });

  throw new CommandError("Usage: audienti motions abm-companies <motn_id> <list|add|remove> [args] [--json] [--account <acct_id>]");
}

async function motionsAbmCompaniesList(motionId, args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError(MOTIONS_ABM_COMPANIES_LIST_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.motionAbmCompanies(accountId, motionId);
  if (values.json) return writeJson(context.stdout, payload);

  renderMotionAbmCompanies(payload, context);
}

async function motionsAbmCompaniesAdd(motionId, args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    file: { type: "string" }
  });
  if ((positionals.length === 0 && !values.file) || (positionals.length > 0 && values.file)) {
    throw new CommandError(MOTIONS_ABM_COMPANIES_ADD_USAGE);
  }

  const entries = values.file ? await motionAbmCompanyEntriesFromFile(values.file) : positionals;
  if (entries.length === 0) throw new CommandError(MOTIONS_ABM_COMPANIES_ADD_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.addMotionAbmCompanies(accountId, motionId, { abm_companies: entries });
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Company filters: ${Array.isArray(payload?.abm_companies) ? payload.abm_companies.length : 0}`);
  renderMotionAbmCompanies(payload, context);
  renderMotionAbmCompanyErrors(payload, context);
}

async function motionsAbmCompaniesRemove(motionId, args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(MOTIONS_ABM_COMPANIES_REMOVE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.removeMotionAbmCompany(accountId, motionId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Removed company filter ${display(positionals[0])} from motion ${display(payload?.motion_id || motionId)}.`);
  renderMotionAbmCompanies(payload, context);
}

const MOTIONS_PROFILE_SIGNALS_USAGE = "Usage: audienti motions profile-signals <motn_id> <list|add|remove> [args] [--json] [--account <acct_id>]";

async function motionsProfileSignals(args, context, { accountOverride } = {}) {
  const [motionId, subaction, ...rest] = args;
  if (!motionId || !subaction) throw new CommandError(MOTIONS_PROFILE_SIGNALS_USAGE);

  if (subaction === "list") return motionsProfileSignalsList(motionId, rest, context, { accountOverride });
  if (subaction === "add") return motionsProfileSignalsAdd(motionId, rest, context, { accountOverride });
  if (["remove", "delete"].includes(subaction)) return motionsProfileSignalsRemove(motionId, rest, context, { accountOverride });

  throw new CommandError(MOTIONS_PROFILE_SIGNALS_USAGE);
}

async function motionsProfileSignalsList(motionId, args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError(MOTIONS_PROFILE_SIGNALS_LIST_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.motionProfileSignals(accountId, motionId);
  if (values.json) return writeJson(context.stdout, payload);

  renderMotionProfileSignals(payload, context);
}

async function motionsProfileSignalsAdd(motionId, args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    category: { type: "string" },
    owned: { type: "boolean" },
    "social-cookie": { type: "string" },
    roles: { type: "string" }
  });
  const owned = Boolean(values.owned);
  if (owned ? (positionals.length > 0 || !values["social-cookie"]) : positionals.length !== 1) {
    throw new CommandError(MOTIONS_PROFILE_SIGNALS_ADD_USAGE);
  }

  const profileSignal = owned
    ? { category: "owned", social_cookie_id: values["social-cookie"] }
    : { url: positionals[0], ...(values.category ? { category: values.category } : {}) };
  if (values.roles !== undefined) {
    const roles = String(values.roles).split(",").map((role) => role.trim().toLowerCase()).filter(Boolean);
    if (roles.some((role) => !["commenters", "reactors"].includes(role))) throw new CommandError(MOTIONS_PROFILE_SIGNALS_ADD_USAGE);
    profileSignal.commenters_enabled = roles.includes("commenters");
    profileSignal.reactors_enabled = roles.includes("reactors");
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.addMotionProfileSignal(accountId, motionId, { profile_signal: profileSignal });
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Tracking ${display(payload?.profile_signal?.canonical_url)} for motion ${display(payload?.motion_id || motionId)}.`);
  renderMotionProfileSignals(payload, context);
}

async function motionsProfileSignalsRemove(motionId, args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(MOTIONS_PROFILE_SIGNALS_REMOVE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.removeMotionProfileSignal(accountId, motionId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Removed profile signal ${display(positionals[0])} from motion ${display(payload?.motion_id || motionId)}.`);
  renderMotionProfileSignals(payload, context);
}

async function motionsDelete(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    confirm: { type: "string" }
  });
  const normalizedConfirm = String(values.confirm || "").trim().toLowerCase();
  if (positionals.length !== 1 || !DELETE_CONFIRMATION_VALUES.has(normalizedConfirm)) {
    throw new CommandError(MOTIONS_DELETE_USAGE);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.deleteMotion(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Deleted motion ${display(payload?.name)} (${display(payload?.prefix_id)}).`);
}

async function motionsUpdate(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    payload: { type: "string" },
    status: { type: "string" },
    approach: { type: "string" },
    tags: { type: "string" },
    "own-post-engagement": { type: "string" },
    "start-date": { type: "string" },
    "end-date": { type: "string" },
    "maximum-company-count": { type: "string" },
    gift: { type: "string" }
  });
  const hasUpdateField = values.payload || motionSimpleFieldsPresent(values);
  if (positionals.length !== 1 || !hasUpdateField) {
    throw new CommandError(MOTIONS_UPDATE_USAGE);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const motion = await client.updateMotion(accountId, positionals[0], { motion: await motionUpdatePayload(values) });
  const statusBlocked = motion?.status_change?.status === "blocked";
  if (values.json) {
    writeJson(context.stdout, motion);
    return statusBlocked ? 1 : undefined;
  }

  writeLine(context.stdout, `Updated motion ${display(motion?.name)} (${display(motion?.prefix_id)}).`);
  renderMotion(motion, context);
  if (!statusBlocked) return undefined;

  writeLine(
    context.stderr,
    `Status not changed to ${display(motion.status_change.requested_status)}: ${display(motion.status_change.reason)}. Other changes were saved.`
  );
  return 1;
}

async function motionUpdatePayload(values) {
  if (values.payload) {
    if (motionSimpleFieldsPresent(values)) {
      throw new CommandError("Choose one motion input mode: either --payload <file.json> or the simple motion update flags.");
    }

    const payload = await readJsonPayload(values.payload);
    rejectMotionPlanningMode(payload);
    validateMotionSignalRows(payload);
    return payload;
  }

  const payload = compactObject({
    status: normalizeMotionStatus(values.status),
    play_tags: values.tags !== undefined ? tagList(values.tags) : undefined,
    own_post_engagement: values["own-post-engagement"] !== undefined ? parseBooleanString(values["own-post-engagement"], "--own-post-engagement") : undefined
  });
  const nullableSettings = {
    approach: values.approach,
    starts_on: normalizeMotionDate(values["start-date"], "--start-date"),
    ends_on: normalizeMotionDate(values["end-date"], "--end-date"),
    maximum_company_count: normalizeMotionMaximumCompanyCount(values["maximum-company-count"]),
    offer_gift_id: normalizeMotionGift(values.gift)
  };
  for (const [key, value] of Object.entries(nullableSettings)) {
    if (value !== undefined) payload[key] = value;
  }

  return payload;
}

function motionSimpleFieldsPresent(values) {
  return Boolean(values.status) ||
    values.approach !== undefined ||
    values.tags !== undefined ||
    values["own-post-engagement"] !== undefined ||
    values["start-date"] !== undefined ||
    values["end-date"] !== undefined ||
    values["maximum-company-count"] !== undefined ||
    values.gift !== undefined;
}

function rejectMotionPlanningMode(payload) {
  if (payload && Object.prototype.hasOwnProperty.call(payload, "post_accept_planning_mode")) {
    throw new CommandError("post_accept_planning_mode is read-only. Set a nonblank Approach for adaptive planning, or clear Approach to use the existing sequence.");
  }
}

function normalizeMotionDate(value, flagName) {
  if (value === undefined) return undefined;

  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "none") return null;
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new CommandError(`${flagName} must be YYYY-MM-DD or none.`);

  const [, year, month, day] = match.map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new CommandError(`${flagName} must be YYYY-MM-DD or none.`);
  }

  return normalized;
}

function normalizeMotionMaximumCompanyCount(value) {
  if (value === undefined) return undefined;
  if (String(value || "").trim().toLowerCase() === "none") return null;

  return normalizeOptionalPositiveInteger(value, "--maximum-company-count");
}

function validateMotionSignalRows(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;

  for (const row of Array.isArray(payload.signal_rows) ? payload.signal_rows : []) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    if (!String(row.posting_language || "").trim()) continue;

    const scope = String(row.scope || "company").trim().toLowerCase();
    const category = String(row.company_signal_category || "").trim().toLowerCase();
    if (scope === "company" && category === "hiring") continue;

    throw new CommandError("posting_language is only supported on company-scope hiring signal rows.");
  }
}

async function motionAbmCompanyEntriesFromFile(path) {
  const contents = await readFile(path, "utf8");
  const trimmed = contents.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      return Array.isArray(parsed.abm_companies) ? parsed.abm_companies :
        (Array.isArray(parsed.company_filters) ? parsed.company_filters :
          (Array.isArray(parsed.items) ? parsed.items : []));
    }
  } catch {
    // Plain text files use one company domain or LinkedIn company URL per line.
  }

  return trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function motionsStatusShortcut(action, args, context, { accountOverride } = {}) {
  const usage = `Usage: audienti motions ${action} <motn_id> [--json] [--account <acct_id>]`;
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) {
    throw new CommandError(usage);
  }

  const statusByAction = {
    activate: "active",
    pause: "paused",
    archive: "archived"
  };
  return updateMotionStatus(positionals[0], statusByAction[action], context, { accountOverride, json: values.json });
}

async function updateMotionStatus(motionId, status, context, { accountOverride, json } = {}) {
  const normalizedStatus = normalizeMotionStatus(status);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const motion = await client.updateMotion(accountId, motionId, {
    motion: {
      status: normalizedStatus
    }
  });
  if (json) return writeJson(context.stdout, motion);

  writeLine(context.stdout, `Updated motion ${display(motion?.name)} (${display(motion?.prefix_id)}) to ${display(motion?.status)}.`);
  renderMotion(motion, context);
}

async function contentPrograms(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    user: { type: "string" }
  });
  if (positionals.length > 0) throw new CommandError(CONTENT_PROGRAMS_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const programs = await client.contentPrograms(accountId, compactObject({ user: values.user }));
  if (values.json) return writeJson(context.stdout, programs);

  renderContentPrograms(programs, context);
}

async function contentPlans(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, { ...jsonOptions(), user: { type: "string" }, page: { type: "string" } });
  if (positionals.length) throw new CommandError(CONTENT_PLANS_USAGE);
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.contentPlans(accountId, compactObject({ user: values.user, page: values.page }));
  if (values.json) return writeJson(context.stdout, payload);
  for (const plan of payload.plans || []) context.stdout.write(`${plan.prefix_id}  ${plan.channel}  ${plan.status}  ${plan.title}\n`);
  context.stdout.write("Open a plan: content plan <rprt_id> --report\n");
  if (payload.next_page) context.stdout.write(`More plans: content plans --page ${payload.next_page}\n`);
}

async function contentPlanAction(action, args, context, { accountOverride } = {}) {
  const usage = `Usage: audienti content ${action} <rprt_id> --day <n> [--user <id|me>] [--payload <file.json>] [--feedback <text>] [--style <id>] [--aspect-ratio <w:h>] [--json] [--account <acct_id>]`;
  const { values, positionals } = parseCommandArgs(args, { ...jsonOptions(), day: { type: "string" }, user: { type: "string" }, payload: { type: "string" }, feedback: { type: "string" }, style: { type: "string" }, "aspect-ratio": { type: "string" } });
  const day = Number(values.day);
  if (positionals.length !== 1 || !Number.isInteger(day) || day < 1 || (action === "plan-update" && !values.payload)) throw new CommandError(usage);
  if (values["aspect-ratio"] && !/^\d+:\d+$/.test(values["aspect-ratio"])) throw new CommandError("Aspect ratio must be w:h.");
  const body = compactObject({ user: values.user });
  if (action === "plan-update") {
    body.item = await readJsonPayload(values.payload);
    if (!body.item || typeof body.item !== "object" || Array.isArray(body.item)) throw new CommandError("Plan update payload must be a JSON object.");
  }
  if (action === "plan-draft") body.draft_feedback = values.feedback || "";
  if (action === "plan-visuals") body.visual_generation = compactObject({ ad_style_id: values.style, aspect_ratio_option: values["aspect-ratio"] });
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  let result;
  if (action === "plan-update") result = await client.contentPlanUpdate(accountId, positionals[0], day, body);
  else if (action === "plan-approve") result = await client.contentPlanApprove(accountId, positionals[0], day, body);
  else if (action === "plan-research") result = await client.contentPlanResearch(accountId, positionals[0], day, body);
  else if (action === "plan-draft") result = await client.contentPlanDraft(accountId, positionals[0], day, body);
  else result = await client.contentPlanVisuals(accountId, positionals[0], day, body);
  if (values.json) return writeJson(context.stdout, result);
  context.stdout.write(`${result.title || "Content plan"}: ${result.status}\n`);
}

async function contentPostReply(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, { ...jsonOptions(), comment: { type: "string" }, body: { type: "string" }, user: { type: "string" } });
  if (positionals.length !== 1 || !values.comment || !values.body?.trim()) throw new CommandError(CONTENT_POST_REPLY_USAGE);
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const result = await client.contentPostReply(accountId, positionals[0], values.comment, compactObject({ reply_body: values.body, user: values.user }));
  if (values.json) return writeJson(context.stdout, result);
  context.stdout.write(`Reply approved for post ${result.prefix_id}; check engagement for delivery status.\n`);
}

async function contentPlan(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    week: { type: "string" },
    due: { type: "boolean" },
    report: { type: "boolean" },
    user: { type: "string" }
  });
  if (positionals.length !== 1) throw new CommandError(CONTENT_PLAN_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = values.report
    ? await client.contentPlanReport(accountId, positionals[0], compactObject({ user: values.user }))
    : await client.contentPlan(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  if (values.report) {
    context.stdout.write(`${payload.title || "Content plan"}: ${payload.status}\n`);
    for (const row of payload.content_plan || []) context.stdout.write(`Day ${row.day_number}  ${row.channel}  ${row.title}  ${row.execution?.workflow_phase || "Not started"}\n${row.finalized_content || ""}\n`);
    return;
  }
  const week = values.week ? Number.parseInt(values.week, 10) : null;
  let rows = Array.isArray(payload?.rows) ? payload.rows : [];
  if (week) rows = rows.filter((row) => Number(row.week_number) === week);
  if (values.due) rows = rows.filter((row) => ["researching", "drafting", "needs_operator_review", "needs_operator_approval", "scheduled", "ready_to_post"].includes(row.stage));
  renderContentPlanRows(rows, context);
}

async function contentShow(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(CONTENT_SHOW_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const item = await client.contentWorkItem(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, item);

  renderContentWorkItem(item, context);
}

async function contentPosts(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, { ...jsonOptions(), user: { type: "string" }, page: { type: "string" } });
  if (positionals.length) throw new CommandError(CONTENT_POSTS_USAGE);
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.contentTrackedPosts(accountId, { ...(values.user ? { user: values.user } : {}), ...(values.page ? { page: values.page } : {}) });
  if (values.json) return writeJson(context.stdout, payload);
  for (const post of payload.posts || []) context.stdout.write(`${post.prefix_id}  ${post.status}  ${post.published_at || "Publication time unavailable"}  ${post.url}\n`);
  if (payload.next_page) context.stdout.write(`More posts: content posts --page ${payload.next_page}\n`);
}

async function contentTrack(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, { ...jsonOptions(), user: { type: "string" } });
  if (positionals.length !== 1) throw new CommandError(CONTENT_TRACK_USAGE);
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const post = await client.contentTrackPost(accountId, { url: positionals[0], ...(values.user ? { user: values.user } : {}) });
  if (values.json) return writeJson(context.stdout, post);
  context.stdout.write(`Tracking ${post.prefix_id}: ${post.status}\n${post.url}\n`);
}

async function contentEngagement(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(CONTENT_ENGAGEMENT_USAGE);
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const post = await client.contentTrackedPost(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, post);
  context.stdout.write(`${post.title || "LinkedIn post"}: ${post.status}\n${post.url}\n`);
  if (post.error) context.stdout.write(`Tracking error: ${post.error}\n`);
  context.stdout.write(`Reposts reported: ${post.repost_count ?? "unavailable"}; reposter identities unavailable\n`);
  for (const category of ["comments", "reactions"]) {
    const state = post.categories?.[category] || {};
    context.stdout.write(`${category}: ${state.status || "pending"}, ${state.collected_count ?? 0} collected\n`);
    if (state.error) context.stdout.write(`  ${state.error}\n`);
    for (const engagement of post[category] || []) {
      const person = engagement.profile || {};
      context.stdout.write(`  ${person.name || "Unknown person"} | ${person.title || "Title unavailable"} | ${person.company || "Company unavailable"} | ${person.url || "Profile unavailable"}\n`);
      if (engagement.text) context.stdout.write(`  ${engagement.commented_at || "Time unavailable"}: ${engagement.text}\n`);
      if (engagement.task?.id) context.stdout.write(`  Reply task: ${engagement.task.id} (${engagement.task.delivery_state || engagement.task.status})\n`);
    }
  }
}

async function contentFeedback(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    message: { type: "string" },
    payload: { type: "string" }
  });
  if (positionals.length !== 1 || (!values.message && !values.payload)) throw new CommandError(CONTENT_FEEDBACK_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = values.payload ? await readJsonPayload(values.payload) : { draft_feedback: values.message };
  const item = await client.contentFeedback(accountId, positionals[0], payload);
  if (values.json) return writeJson(context.stdout, item);

  writeLine(context.stdout, `Queued feedback for ${display(item?.prefix_id)}.`);
  renderContentWorkItem(item, context);
}

async function contentApprove(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(CONTENT_APPROVE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const item = await client.contentApprove(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, item);

  writeLine(context.stdout, `Approved ${display(item?.prefix_id)}.`);
  renderContentWorkItem(item, context);
}

async function contentSchedule(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    at: { type: "string" }
  });
  if (positionals.length !== 1 || !values.at) throw new CommandError(CONTENT_SCHEDULE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const item = await client.contentSchedule(accountId, positionals[0], { scheduled_at: values.at });
  if (values.json) return writeJson(context.stdout, item);

  writeLine(context.stdout, `Scheduled ${display(item?.prefix_id)}.`);
  renderContentWorkItem(item, context);
}

async function contentPublish(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    url: { type: "string" }
  });
  if (positionals.length !== 1 || !values.url) throw new CommandError(CONTENT_PUBLISH_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const item = await client.contentPublish(accountId, positionals[0], { permalink: values.url });
  if (values.json) return writeJson(context.stdout, item);

  writeLine(context.stdout, `Published ${display(item?.prefix_id)}.`);
  renderContentWorkItem(item, context);
}

async function contentComments(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    unresolved: { type: "boolean" },
    user: { type: "string" }
  });
  if (positionals.length > 0) throw new CommandError(CONTENT_COMMENTS_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const comments = await client.contentComments(accountId, compactObject({ unresolved: values.unresolved === false ? false : true, user: values.user }));
  if (values.json) return writeJson(context.stdout, comments);

  renderContentComments(comments, context);
}

async function contentReply(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    body: { type: "string" }
  });
  if (positionals.length !== 1) throw new CommandError(CONTENT_REPLY_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const comment = await client.contentReply(accountId, positionals[0], compactObject({ body: values.body }));
  if (values.json) return writeJson(context.stdout, comment);

  writeLine(context.stdout, `Sent reply for ${display(comment?.prefix_id)}.`);
}

async function contentDismiss(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(CONTENT_DISMISS_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const comment = await client.contentDismiss(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, comment);

  writeLine(context.stdout, `Dismissed ${display(comment?.prefix_id)}.`);
}

function normalizeMotionStatus(status) {
  if (status === undefined) return undefined;

  const normalizedStatus = String(status || "").trim().toLowerCase();
  if (!MOTION_STATUS_VALUES.has(normalizedStatus)) {
    throw new CommandError(MOTIONS_UPDATE_USAGE);
  }

  return normalizedStatus;
}

function parseBooleanString(value, flagName) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;

  throw new CommandError(`${flagName} must be true or false.`);
}

async function motionsTagMutation(action, args, context, { accountOverride } = {}) {
  const usageText = action === "add" ? MOTIONS_ADD_TAG_USAGE : MOTIONS_REMOVE_TAG_USAGE;
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 2) {
    throw new CommandError(usageText);
  }

  const [motionId, tag] = positionals;
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const motion = action === "add" ?
    await client.addMotionTag(accountId, motionId, { tag }) :
    await client.removeMotionTag(accountId, motionId, { tag });
  if (values.json) return writeJson(context.stdout, motion);

  const verb = action === "add" ? "Added" : "Removed";
  const preposition = action === "add" ? "to" : "from";
  writeLine(context.stdout, `${verb} tag ${display(tag)} ${preposition} motion ${display(motion?.name)} (${display(motion?.prefix_id)}).`);
  if (Array.isArray(motion?.play_tags)) writeLine(context.stdout, `Tags: ${display(motion.play_tags.join(", "), "-")}`);
}

async function motionsClone(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    name: { type: "string" }
  });
  if (positionals.length !== 1 || !values.name) {
    throw new CommandError(MOTIONS_CLONE_USAGE);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const cloned = await client.cloneMotion(accountId, positionals[0], {
    motion: {
      name: values.name
    }
  });
  if (values.json) return writeJson(context.stdout, cloned);

  writeLine(context.stdout, `Cloned motion ${display(positionals[0])} as ${display(cloned?.name)} (${display(cloned?.prefix_id)}).`);
  renderMotion(cloned, context);
}

async function motionsMoveProspects(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    target: { type: "string" }
  });
  if (positionals.length < 2 || !values.target) {
    throw new CommandError(MOTIONS_MOVE_PROSPECTS_USAGE);
  }

  const [sourceMotionId, ...prospectIds] = positionals;
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.moveMotionProspects(accountId, sourceMotionId, {
    target_motion_id: values.target,
    prospect_ids: prospectIds
  });
  if (values.json) return writeJson(context.stdout, payload);

  const moved = Number(payload?.moved || 0);
  const failed = Array.isArray(payload?.failed) ? payload.failed.length : 0;
  writeLine(context.stdout, `Moved ${moved} prospects from ${display(sourceMotionId)} to ${display(values.target)}.`);
  if (failed > 0) {
    writeLine(context.stdout, `${failed} prospects failed.`);
  }
}

async function prospectsList(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, prospectFilterOptions());
  if (positionals.length > 0) throw new CommandError("Usage: audienti prospects list [--json] [filters] [--account <acct_id>]");
  if (values.csv && values.json) throw new CommandError("Choose one output format: use either --csv or --json.");
  validateProspectFilterValues(values);

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const query = prospectQueryFromValues(values, config, { accountOverride });
  const payload = values.all ?
    await fetchAllProspects(client, accountId, query, { totalLimit: parseProspectTotalLimit(values.limit) }) :
    await client.prospects(accountId, query);
  if (values.json) return writeJson(context.stdout, payload);
  if (values.csv) return writeLine(context.stdout, prospectsToCsv(payload?.prospects || []));

  renderProspects(payload, context, { wide: values.wide || values.all, profiles: values.profiles });
}

async function prospectsCheck(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, prospectFilterOptions());
  if (positionals.length > 0) throw new CommandError(PROSPECTS_CHECK_USAGE);
  if (values.csv && values.json) throw new CommandError("Choose one output format: use either --csv or --json.");
  if (values.company || values["company-profile"]) throw new CommandError("Company filters are not supported for `prospects check`; it already finds prospects missing a certified company.");
  validateProspectFilterValues(values);

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const query = {
    ...prospectQueryFromValues(values, config, { accountOverride }),
    data_quality: "missing_certified_company"
  };
  const rawPayload = values.all ?
    await fetchAllProspects(client, accountId, query, { totalLimit: parseProspectTotalLimit(values.limit) }) :
    await client.prospects(accountId, query);
  const payload = withProspectAppUrls(rawPayload, client.host);

  if (values.json) return writeJson(context.stdout, payload);
  if (values.csv) return writeLine(context.stdout, prospectCheckToCsv(payload?.prospects || []));

  renderProspectCheck(payload, context);
}

function prospectFilterOptions() {
  return {
    ...jsonOptions(),
    all: { type: "boolean" },
    csv: { type: "boolean" },
    query: { type: "string" },
    company: { type: "string" },
    "company-profile": { type: "string" },
    motion: { type: "string" },
    play: { type: "string" },
    list: { type: "string" },
    stage: { type: "string" },
    "assigned-user": { type: "string" },
    limit: { type: "string" },
    offset: { type: "string" },
    page: { type: "string" },
    profiles: { type: "boolean" },
    wide: { type: "boolean" }
  };
}

function validateProspectFilterValues(values) {
  if (values.page && values.offset) throw new CommandError("Choose one pagination mode: use either --page or --offset.");
  if (values.all && (values.page || values.offset)) throw new CommandError("--all cannot be combined with --page or --offset.");
  if (values.motion && values.play) throw new CommandError("Choose one motion filter: use either --motion or --play.");
  if (values.company && values["company-profile"]) throw new CommandError("Choose one company filter: use either --company or --company-profile.");
}

function prospectQueryFromValues(values, config, { accountOverride } = {}) {
  return compactObject({
    query: values.query,
    company: values.company,
    company_profile_id: values["company-profile"],
    motion_id: values.motion,
    play_id: values.play,
    list_id: values.list,
    stage: values.stage,
    assigned_user_id: resolveAccountUserId(values["assigned-user"], config, { accountOverride }),
    limit: values.limit,
    offset: values.offset,
    page: values.page,
    include_profiles: values.profiles
  });
}

async function prospectsSetDestination(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(), type: { type: "string" }, destination: { type: "string" },
    name: { type: "string" }, mode: { type: "string", default: "add" }
  });
  if (!positionals.length || !["list", "experiment"].includes(values.type) ||
      !["add", "move"].includes(values.mode) || Boolean(values.destination) === Boolean(values.name)) {
    throw new CommandError(PROSPECTS_DESTINATION_USAGE);
  }
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const { payload, rejected } = await performBulkMutation(() => client.setProspectDestination(accountId, compactObject({
    prospect_ids: positionals, destination_type: values.type === "list" ? "list" : "motion",
    destination_id: values.destination, name: values.name, mode: values.mode
  })));
  if (values.json) writeJson(context.stdout, payload);
  else {
    writeLine(context.stdout, `${payload.created ? "Created " : ""}${display(payload.destination?.name)}: ${payload.added?.length || 0} added, ${payload.moved?.length || 0} moved, ${payload.skipped?.length || 0} skipped, ${payload.failed?.length || 0} failed.`);
    for (const row of payload.failed || []) writeLine(context.stdout, `${row.id}: ${row.message || row.reason}`);
  }
  return rejected ? 1 : 0;
}

async function prospectsAssign(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    "assigned-user": { type: "string" }
  });
  if (positionals.length < 1 || !values["assigned-user"]) {
    throw new CommandError(PROSPECTS_ASSIGN_USAGE);
  }

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const assignedUserId = resolveAccountUserId(values["assigned-user"], config, { accountOverride });
  const { payload, rejected } = await performBulkMutation(() =>
    client.assignProspects(accountId, {
      prospect_ids: positionals,
      assigned_user_id: assignedUserId
    }));
  if (values.json) {
    writeJson(context.stdout, payload);
    return rejected ? 1 : 0;
  }

  const successLabel = values["assigned-user"] === "unassign" ?
    `Unassigned ${successCount(payload)} prospects.` :
    `Assigned ${successCount(payload)} prospects to ${display(assignedUserId)}.`;
  renderBulkMutationResult(payload, context, {
    successLabel,
    zeroSuccessLabel: "No prospects were assigned."
  });
  return rejected ? 1 : 0;
}

async function prospectsShow(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError("Usage: audienti prospects show <prsp_id> [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const prospect = await client.prospect(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, prospect);

  renderProspect(prospect, context);
}

async function prospectsMoveAccount(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    "target-account": { type: "string" },
    "assigned-user": { type: "string" },
    "target-motion": { type: "string" },
    "target-list": { type: "string" },
    apply: { type: "boolean" }
  });
  if (positionals.length !== 1 || !values["target-account"]) {
    throw new CommandError(PROSPECTS_MOVE_ACCOUNT_USAGE);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const prospectId = positionals[0];
  const request = compactObject({
    target_account_id: values["target-account"],
    assigned_user_id: values["assigned-user"],
    target_motion_id: values["target-motion"],
    target_list_id: values["target-list"]
  });
  const preview = await performProspectAccountMove(() =>
    client.moveProspectAccount(accountId, prospectId, { ...request, apply: false }));

  if (!values.apply) {
    if (values.json) writeJson(context.stdout, preview.payload);
    else renderProspectAccountMove(preview.payload, context, { applying: false });
    return preview.rejected ? 1 : 0;
  }

  if (preview.rejected || preview.payload?.success !== true || preview.payload?.eligible !== true || !preview.payload?.manifest_digest) {
    if (values.json) writeJson(context.stdout, preview.payload);
    else renderProspectAccountMove(preview.payload, context, { applying: true });
    return 1;
  }

  const final = await performProspectAccountMove(() => client.moveProspectAccount(accountId, prospectId, {
    ...request,
    apply: true,
    manifest_digest: preview.payload.manifest_digest
  }));
  if (values.json) writeJson(context.stdout, final.payload);
  else renderProspectAccountMove(final.payload, context, { applying: true });

  return final.rejected || final.payload?.applied !== true ? 1 : 0;
}

async function prospectsReplan(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    apply: { type: "boolean" }
  });
  if (positionals.length !== 1) throw new CommandError(PROSPECTS_REPLAN_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.replanProspect(accountId, positionals[0], compactObject({
    apply: values.apply
  }));
  if (values.json) return writeJson(context.stdout, payload);

  renderProspectReplan(payload, context);
}

async function prospectsReenrich(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    apply: { type: "boolean" },
    profile: { type: "string" }
  });
  if (positionals.length !== 1) throw new CommandError(PROSPECTS_REENRICH_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.reenrichProspect(accountId, positionals[0], compactObject({
    apply: values.apply,
    profile_id: values.profile
  }));
  if (values.json) return writeJson(context.stdout, payload);

  renderProspectReenrich(payload, context);
}

async function prospectsRefreshQueue(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    apply: { type: "boolean" }
  });
  if (positionals.length !== 1) throw new CommandError(PROSPECTS_REFRESH_QUEUE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.refreshProspectQueue(accountId, positionals[0], compactObject({
    apply: values.apply
  }));
  if (values.json) return writeJson(context.stdout, payload);

  renderProspectRefreshQueue(payload, context);
}

async function prospectsDisposition(action, args, context, { accountOverride } = {}) {
  const usageText = {
    reject: PROSPECTS_REJECT_USAGE,
    nurture: PROSPECTS_NURTURE_USAGE,
    restore: PROSPECTS_RESTORE_USAGE
  }[action];
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    reason: { type: "string" }
  });
  const inactiveReason = values.reason ? String(values.reason).trim() : undefined;
  if (
    positionals.length !== 1 ||
    (action !== "nurture" && inactiveReason) ||
    (action === "nurture" && inactiveReason && !PROSPECT_INACTIVE_REASON_VALUES.has(inactiveReason))
  ) {
    throw new CommandError(usageText);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const prospectId = positionals[0];
  const payload = action === "reject" ?
    await client.rejectProspect(accountId, prospectId) :
    action === "restore" ?
      await client.restoreProspect(accountId, prospectId) :
      await client.nurtureProspect(accountId, prospectId, compactObject({ inactive_reason: inactiveReason }));
  if (values.json) return writeJson(context.stdout, payload);

  renderProspectDisposition(payload, context, { action });
}

async function prospectsSetStatus(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    status: { type: "string" }
  });
  const status = String(values.status || "").trim();
  if (positionals.length !== 1 || !PROSPECT_STATUS_VALUES.has(status)) {
    throw new CommandError(PROSPECTS_SET_STATUS_USAGE);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await mutateProspectStatus(client, accountId, positionals[0], status);
  if (values.json) return writeJson(context.stdout, payload);

  renderProspectDisposition(payload, context, { action: "set-status" });
}

async function prospectsLock(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    kind: { type: "string" },
    note: { type: "string" }
  });
  if (positionals.length !== 1) throw new CommandError(PROSPECTS_LOCK_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.lockProspect(accountId, positionals[0], compactObject({
    lock_kind: values.kind,
    lock_note: values.note
  }));
  if (values.json) return writeJson(context.stdout, payload);

  renderProspectDisposition(payload, context, { action: "lock" });
}

async function prospectsUnlock(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(PROSPECTS_UNLOCK_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.unlockProspect(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  renderProspectDisposition(payload, context, { action: "unlock" });
}

async function mutateProspectStatus(client, accountId, prospectId, status) {
  if (status === "active") return client.restoreProspect(accountId, prospectId);
  if (status === "rejected") return client.rejectProspect(accountId, prospectId);

  return client.nurtureProspect(accountId, prospectId, { inactive_reason: status });
}

async function prospectsTimeline(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    limit: { type: "string" },
    type: { type: "string" },
    types: { type: "string" }
  });
  if (positionals.length !== 1) {
    throw new CommandError("Usage: audienti prospects timeline <prsp_id> [--json] [--types <post,comment,reaction>] [--limit <n>] [--account <acct_id>]");
  }
  if (values.type && values.types) throw new CommandError("Choose one type filter: use either --type or --types.");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.prospectTimeline(accountId, positionals[0], compactObject({
    limit: values.limit,
    types: values.types || values.type
  }));
  if (values.json) return writeJson(context.stdout, payload);

  renderProspectTimeline(payload, context);
}

async function prospectsMessageTypes(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) {
    throw new CommandError("Usage: audienti prospects message-types <prsp_id> [--json] [--account <acct_id>]");
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.prospectMessageTypes(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  renderProspectMessageTypes(payload, context);
}

async function prospectsWrite(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    type: { type: "string" },
    surface: { type: "string" }
  });
  const surfaceKey = values.type || values.surface;

  if (positionals.length !== 1 || !surfaceKey) {
    throw new CommandError("Usage: audienti prospects write <prsp_id> --type <surface_key> [--json] [--account <acct_id>]");
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.writeProspectMessage(accountId, positionals[0], { surface_key: surfaceKey });
  if (values.json) return writeJson(context.stdout, payload);

  renderProspectMessage(payload, context);
}

async function prospectsAddNote(args, context, { accountOverride } = {}) {
  return prospectNoteCommand(args, context, {
    accountOverride,
    usageText: PROSPECTS_ADD_NOTE_USAGE
  });
}

async function prospectsAddSteer(args, context, { accountOverride } = {}) {
  return prospectNoteCommand(args, context, {
    accountOverride,
    forcedType: "steer",
    usageText: PROSPECTS_ADD_STEER_USAGE
  });
}

async function prospectsAddProfile(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    url: { type: "string" }
  });
  if (positionals.length !== 1 || !values.url) throw new CommandError(PROSPECTS_ADD_PROFILE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const response = await client.addProspectProfile(accountId, positionals[0], { url: values.url });
  if (values.json) return writeJson(context.stdout, response);

  renderProspectProfileMutation(response, context, { action: "Added" });
}

async function prospectsReportBadProfile(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 2) throw new CommandError(PROSPECTS_REPORT_BAD_PROFILE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const response = await client.reportBadProspectProfile(accountId, positionals[0], { profile_id: positionals[1] });
  if (values.json) return writeJson(context.stdout, response);

  renderProspectProfileMutation(response, context, { action: "Reported" });
}

async function prospectNoteCommand(args, context, { accountOverride, forcedType, usageText }) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    payload: { type: "string" },
    message: { type: "string" },
    type: { type: "string" },
    "track-as-engagement": { type: "boolean" },
    "engagement-type": { type: "string" },
    "engagement-key": { type: "string" }
  });

  if (positionals.length !== 1) {
    throw new CommandError(usageText);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await prospectNotePayload(values, { forcedType, usageText });
  const response = await client.addProspectNote(accountId, positionals[0], payload);
  if (values.json) return writeJson(context.stdout, response);

  renderProspectNote(response, context);
}

async function prospectsSequencePreview(args, context, { accountOverride } = {}) {
  return runSequencePreviewCommand(args, context, {
    accountOverride,
    usageText: "Usage: audienti prospects sequence-preview <prsp_id> [--json] [--connection-state <state>] [--account <acct_id>]",
    title: "Sequence preview"
  });
}

async function writerTestRun(args, context, { accountOverride } = {}) {
  if (["show", "status"].includes(args[0])) {
    return writerTestRunShow(args.slice(1), context, { accountOverride });
  }

  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    branch: { type: "string" },
    branches: { type: "string" },
    mode: { type: "string" },
    step: { type: "string" },
    "angle-index": { type: "string" },
    report: { type: "string" },
    "timeout-seconds": { type: "string" },
    "poll-interval-seconds": { type: "string" },
    "no-wait": { type: "boolean" }
  });
  if (positionals.length !== 1) throw new CommandError(WRITER_TEST_RUN_USAGE);
  if (values.branch && values.branches) throw new CommandError("Choose one branch filter: use either --branch or --branches.");
  const draftMode = normalizeWriterTestRunMode(values.mode);
  if (draftMode === "target" && !values.step) throw new CommandError("Step mode requires --step <step_key|row_number>.");
  if (draftMode === "target" && !values.branch && !values.branches) throw new CommandError("Step mode requires --branch <no-accept|accepted>.");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const prospectId = positionals[0];
  const branchFilter = values.branches || values.branch || "both";
  const requestBody = compactObject({
    branches: branchFilter,
    angle_index: values["angle-index"],
    draft_mode: draftMode,
    target_step: values.step,
    session_report_id: values.report
  });

  let payload;
  try {
    const startedPayload = await client.createProspectSequenceExportJob(accountId, prospectId, requestBody);
    if (values["no-wait"]) {
      if (values.json) return writeJson(context.stdout, startedPayload);

      const completedPayload = sequenceExportJobResultPayload(startedPayload);
      if (completedPayload) return renderWriterTestRun(completedPayload, context);

      return renderWriterTestRunJobStatus(startedPayload, context, {
        prospectId,
        reportId: startedPayload?.report?.prefix_id || startedPayload?.report?.id
      });
    }

    payload = await waitForProspectSequenceExportJob(client, accountId, prospectId, startedPayload, {
      timeoutSeconds: normalizePositiveInteger(values["timeout-seconds"]) || DEFAULT_WRITER_TEST_RUN_TIMEOUT_SECONDS,
      pollIntervalSeconds: normalizePositiveInteger(values["poll-interval-seconds"]) || DEFAULT_WRITER_TEST_RUN_POLL_INTERVAL_SECONDS,
      sleepImpl: context.sleep
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new CommandError(writerReportApiUnavailableMessage({ host: client.host }));
    }

    if (error instanceof ApiError && error.status === 504 && draftMode === "target") {
      throw new CommandError(writerTestRunStepTimeoutMessage({ prospectId, branchFilter, step: values.step }));
    }

    throw error;
  }
  if (values.json) return writeJson(context.stdout, payload);

  renderWriterTestRun(payload, context);
}

async function writerTestRunShow(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 2) throw new CommandError(WRITER_TEST_RUN_SHOW_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const [prospectId, reportId] = positionals;
  const response = await client.prospectSequenceExportJob(accountId, prospectId, reportId);
  if (values.json) return writeJson(context.stdout, response);

  const payload = sequenceExportJobResultPayload(response);
  if (payload) return renderWriterTestRun(payload, context);

  renderWriterTestRunJobStatus(response, context, { prospectId, reportId });
}

async function runSequencePreviewCommand(args, context, { accountOverride, usageText, title }) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    "connection-state": { type: "string" }
  });

  if (positionals.length !== 1) {
    throw new CommandError(usageText);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.prospectSequencePreview(accountId, positionals[0], compactObject({
    connection_state: values["connection-state"]
  }));
  if (values.json) return writeJson(context.stdout, payload);

  renderProspectSequencePreview(payload, context, { title });
}

async function prospectsSequenceExport(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    csv: { type: "boolean" },
    branch: { type: "string" },
    branches: { type: "string" },
    "draft-mode": { type: "string" },
    "target-step": { type: "string" },
    "angle-index": { type: "string" }
  });
  if (positionals.length !== 1) {
    throw new CommandError("Usage: audienti prospects sequence-export <prsp_id> [--json|--csv] [--branch <both|no-accept|accepted>] [--draft-mode <all|plan|target>] [--target-step <step_key|row_number>] [--account <acct_id>]");
  }
  if (values.csv && values.json) throw new CommandError("Choose one output format: use either --csv or --json.");
  if (values.branch && values.branches) throw new CommandError("Choose one branch filter: use either --branch or --branches.");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.prospectSequenceExport(accountId, positionals[0], compactObject({
    branches: values.branches || values.branch,
    angle_index: values["angle-index"],
    draft_mode: values["draft-mode"],
    target_step: values["target-step"]
  }));
  if (values.json) return writeJson(context.stdout, payload);
  if (values.csv) return writeLine(context.stdout, sequenceExportRowsToCsv(payload?.rows || []));

  renderProspectSequenceExport(payload, context);
}

function normalizeWriterTestRunMode(value) {
  const normalized = String(value || "plan").trim().toLowerCase();
  if (["report", "draft", "drafts", "all", "full"].includes(normalized)) return "all";
  if (normalized === "plan") return "plan";
  if (["step", "target"].includes(normalized)) return "target";

  throw new CommandError("Unsupported writer test-run mode. Use report, plan, or step.");
}

function writerTestRunStepTimeoutMessage({ prospectId, branchFilter, step }) {
  return [
    `Timed out while drafting writer step ${display(step)} on branch ${display(branchFilter)}.`,
    "The timeline command is working; this timeout happened during the selected writer generation, not account selection or API connectivity.",
    `Inspect the timeline with \`audienti writer test-run ${prospectId}\`, then retry the row or use its step key, for example \`--step connection_request\`.`
  ].join(" ");
}

function writerReportApiUnavailableMessage({ host }) {
  return [
    `The configured Audienti API at ${host} does not support report-backed writer sessions yet.`,
    "This CLI expects the /sequence_export_jobs writer report API.",
    "Use a local app server running this branch and re-auth with `audienti auth token <token> --host <url>`, or deploy this branch before pointing the CLI at production."
  ].join(" ");
}

async function prospectsImport(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    list: { type: "string" },
    motion: { type: "string" },
    "new-list": { type: "string" },
    "new-transition": { type: "string" },
    "assigned-user": { type: "string" }
  });
  if (positionals.length !== 1) {
    throw new CommandError("Usage: audienti prospects import <linkedin_url> [--list <list_id>] [--motion <motn_id>] [--new-list <name>] [--new-transition <name>] [--assigned-user <id|me>] [--json] [--account <acct_id>]");
  }

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const payload = await client.prospectImport(accountId, compactObjectPreservingFields({
    linkedin_url: positionals[0],
    list_id: values.list,
    motion_id: values.motion,
    new_list_name: values["new-list"],
    new_transition_name: values["new-transition"],
    assigned_user_id: resolveAccountUserId(values["assigned-user"], config, { accountOverride })
  }, ["new_list_name", "new_transition_name"]));
  if (values.json) return writeJson(context.stdout, payload);

  renderProspectImportStarted(payload, context);
}

async function prospectsImportBatch(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    file: { type: "string" },
    list: { type: "string" },
    motion: { type: "string" },
    "assigned-user": { type: "string" },
    "new-list": { type: "string" },
    "new-transition": { type: "string" }
  });
  if (positionals.length > 0 || !values.file) {
    throw new CommandError(PROSPECTS_IMPORT_BATCH_USAGE);
  }

  const rows = await readProspectImportBatchFile(values.file);
  if (rows.length === 0) throw new CommandError("Import batch file did not contain any prospects.");

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const result = await client.prospectImportBatch(accountId, {
    rows,
    defaults: compactObjectPreservingFields({
      list_id: values.list,
      motion_id: values.motion,
      new_list_name: values["new-list"],
      new_transition_name: values["new-transition"],
      assigned_user_id: resolveAccountUserId(values["assigned-user"], config, { accountOverride })
    }, ["new_list_name", "new_transition_name"])
  });

  if (values.json) {
    writeJson(context.stdout, result);
    return result.summary.failed > 0 ? 1 : 0;
  }

  renderProspectImportBatchResult(result, context);
  return result.summary.failed > 0 ? 1 : 0;
}

async function prospectsImportStatus(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) {
    throw new CommandError("Usage: audienti prospects import-status <primp_id> [--json] [--account <acct_id>]");
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.prospectImportStatus(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  renderProspectImportStatus(payload, context);
}

async function toolsGet(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    url: { type: "string" },
    "timeout-seconds": { type: "string" },
    "poll-interval-seconds": { type: "string" }
  });
  const lookupType = normalizeLookupType(positionals[0]);

  if (positionals.length !== 1 || !lookupType || !values.url) {
    throw new CommandError("Usage: audienti tools get <email|phone> --url <linkedin_url> [--json] [--timeout-seconds <n>] [--poll-interval-seconds <n>] [--account <acct_id>]");
  }

  const timeoutSeconds = normalizePositiveInteger(values["timeout-seconds"]) || DEFAULT_LOOKUP_TIMEOUT_SECONDS;
  const pollIntervalSeconds = normalizePositiveInteger(values["poll-interval-seconds"]) || DEFAULT_LOOKUP_POLL_INTERVAL_SECONDS;
  const linkedinUrl = values.url.trim();

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const started = await client.prospectImport(accountId, { linkedin_url: linkedinUrl });
  const completed = await waitForProspectImport(client, accountId, started, {
    timeoutSeconds,
    pollIntervalSeconds,
    sleepImpl: context.sleep
  });
  const value = contactLookupValue(completed, lookupType);
  const response = {
    kind: lookupType,
    url: linkedinUrl,
    found: Boolean(value),
    value: value || null,
    import_id: completed?.prefix_id || started?.prefix_id || null,
    status: completed?.status || started?.status || null,
    ready: completed?.ready === true,
    prospect: completed?.prospect || started?.prospect || null,
    pipeline: completed?.pipeline || started?.pipeline || null
  };

  if (values.json) return writeJson(context.stdout, response);

  if (response.found) {
    writeLine(context.stdout, response.value);
    return;
  }

  writeLine(context.stdout, `No ${lookupType} found for ${linkedinUrl}.`);
  if (response.import_id) writeLine(context.stdout, `Import: ${response.import_id}`);
}

async function toolsLinkedinReview(args, context, { accountOverride } = {}) {
  if (args[0] === "reports") return toolsLinkedinReviewReports(args.slice(1), context, { accountOverride });
  if (args[0] === "show") return toolsLinkedinReviewShow(args.slice(1), context, { accountOverride });
  if (args[0] === "status") return toolsLinkedinReviewStatus(args.slice(1), context, { accountOverride });

  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    url: { type: "string" },
    icp: { type: "string" }
  });
  const linkedinUrl = (values.url || positionals[0] || "").trim();

  if (!linkedinUrl || positionals.length > (values.url ? 0 : 1)) {
    throw new CommandError(TOOLS_LINKEDIN_REVIEW_USAGE);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.linkedinReview(accountId, {
    linkedin_url: linkedinUrl,
    icp_id: values.icp
  });
  if (values.json) return writeJson(context.stdout, payload);

  renderLinkedinReviewStarted(payload, context);
}

async function toolsList(args, context) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError(TOOLS_LIST_USAGE);

  const payload = { tools: availableTools() };
  if (values.json) return writeJson(context.stdout, payload);

  renderToolsList(payload.tools, context);
}

async function toolsHumanize(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    ...TOOL_RUN_WAIT_OPTIONS,
    file: { type: "string" },
    tone: { type: "string" },
    language: { type: "string" },
    async: { type: "boolean" }
  });

  if (positionals.length > 0 || !values.file || (values.wait && !values.async)) {
    throw new CommandError(TOOLS_HUMANIZE_USAGE);
  }

  const text = await readHumanizerFile(values.file);
  if (values.async) {
    return submitToolRun("humanize", compactObject({ text, tone: values.tone, language: values.language }), values, context, { accountOverride });
  }
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.humanizeText(accountId, {
    text,
    tone: values.tone,
    language: values.language
  });

  if (values.json) return writeJson(context.stdout, payload);

  const humanizedText = String(payload?.humanized_text || "");
  if (!humanizedText.trim()) {
    throw new CommandError("The humanizer response did not include humanized_text.");
  }
  context.stdout.write(humanizedText);
  if (!humanizedText.endsWith("\n")) context.stdout.write("\n");
}

async function toolsLinkedinReviewReports(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    limit: { type: "string" }
  });

  if (positionals.length > 0) {
    throw new CommandError(TOOLS_LINKEDIN_REVIEW_REPORTS_USAGE);
  }

  const limit = boundedListLimit(values.limit);
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.linkedinReviewReports(accountId, { limit });
  if (values.json) return writeJson(context.stdout, payload);

  renderLinkedinReviewReports(payload, context);
}

async function toolsLinkedinReviewShow(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());

  if (positionals.length !== 1) {
    throw new CommandError(TOOLS_LINKEDIN_REVIEW_SHOW_USAGE);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.linkedinReviewStatus(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  renderLinkedinReviewReport(payload, context);
}

async function toolsLinkedinReviewStatus(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());

  if (positionals.length !== 1) {
    throw new CommandError(TOOLS_LINKEDIN_REVIEW_STATUS_USAGE);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.linkedinReviewStatus(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  renderLinkedinReviewStatus(payload, context);
}

async function toolsLinkedinStrategyReview(args, context, { accountOverride } = {}) {
  const [subaction, ...rest] = args;
  if (subaction === "list") return toolsLinkedinStrategyReviewList(rest, context, { accountOverride });
  if (subaction === "create") return toolsLinkedinStrategyReviewCreate(rest, context, { accountOverride });
  if (subaction === "show") return toolsLinkedinStrategyReviewShow(rest, context, { accountOverride });
  if (subaction !== "delete") throw new CommandError(TOOLS_LINKEDIN_STRATEGY_REVIEW_USAGE);

  const { values, positionals } = parseCommandArgs(rest, { ...jsonOptions(), confirm: { type: "string" } });
  const normalizedConfirm = String(values.confirm || "").trim().toLowerCase();
  if (positionals.length !== 1 || !DELETE_CONFIRMATION_VALUES.has(normalizedConfirm)) {
    throw new CommandError(TOOLS_LINKEDIN_STRATEGY_REVIEW_DELETE_USAGE);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.deleteLinkedinStrategyReview(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Deleted LinkedIn strategy review report ${display(payload?.id || positionals[0])}.`);
}

async function toolsLinkedinStrategyReviewList(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, { ...jsonOptions(), limit: { type: "string" } });
  if (positionals.length > 0) throw new CommandError(TOOLS_LINKEDIN_STRATEGY_REVIEW_LIST_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.linkedinStrategyReviews(accountId, compactObject({ limit: values.limit }));
  if (values.json) return writeJson(context.stdout, payload);

  const rows = Array.isArray(payload?.reports) ? payload.reports : [];
  if (rows.length === 0) {
    writeLine(context.stdout, "No LinkedIn strategy review reports found.");
    return;
  }
  writeAlignedTable(context, ["REPORT ID", "STATUS", "STAGE", "PROFILE", "UPDATED"], rows.map(linkedinReviewReportRow));
  writeLine(context.stdout, "");
  writeLine(context.stdout, "Inspect one report with `audienti tools linkedin-strategy-review show <rprt_id>`.");
}

async function toolsLinkedinStrategyReviewCreate(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, { ...jsonOptions(), url: { type: "string" } });
  if (positionals.length > 0 || !values.url) throw new CommandError(TOOLS_LINKEDIN_STRATEGY_REVIEW_CREATE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.createLinkedinStrategyReview(accountId, { linkedin_url: values.url });
  if (values.json) return writeJson(context.stdout, payload);

  renderLinkedinReviewStatus(payload, context, { title: "LinkedIn strategy review queued" });
  const reportId = payload?.report?.prefix_id;
  if (reportId) writeLine(context.stdout, `Run \`audienti tools linkedin-strategy-review show ${reportId}\` to check progress.`);
}

async function toolsLinkedinStrategyReviewShow(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(TOOLS_LINKEDIN_STRATEGY_REVIEW_SHOW_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.linkedinStrategyReview(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

  renderLinkedinReviewStatus(payload, context, { title: "LinkedIn strategy review" });
  const content = payload?.content?.payload || {};
  if (Object.keys(content).length === 0) {
    writeLine(context.stdout, "");
    writeLine(context.stdout, "No report content is available yet.");
    return;
  }
  writeLine(context.stdout, "");
  writeLine(context.stdout, "Use --json for the full report content.");
}

async function operatorQueue(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, operatorFilterOptions(operatorPaginationOptions()));
  if (positionals.length > 0) throw new CommandError("Usage: audienti operator queue [--json] [filters] [--account <acct_id>]");

  const query = { ...operatorQuery(values), ...operatorPaginationQuery(values) };
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.operatorQueue(accountId, query);
  if (values.json) return writeJson(context.stdout, payload);

  renderOperatorRead(payload, context, { command: "operator queue", accountId, query }, () => renderOperatorQueue(payload, context));
}

async function inboxOpsQueue(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    ...operatorPaginationOptions(),
    "group-by": { type: "string" }
  });
  if (positionals.length > 0) throw new CommandError(INBOX_OPS_QUEUE_USAGE);
  const groupBy = values["group-by"];
  if (groupBy !== undefined && groupBy !== "domain") throw new CommandError("--group-by only supports domain.");

  const query = { opportunity_kind: "inbox", ...operatorPaginationQuery(values) };
  const singlePage = [values.page, values.offset, values.cursor].some((value) => value !== undefined);
  const { client, accountId } = await requireAccountContext(context, { accountOverride });

  if (singlePage) {
    const payload = await client.operatorQueue(accountId, query);
    const rows = numberInboxOpsRows(inboxOpsPayloadRows(payload));
    await writeInboxOpsSnapshot(context, { accountId, rows });
    if (values.json) return writeJson(context.stdout, payload);

    renderOperatorRead(payload, context, { command: "inbox-ops queue", accountId, query }, () => renderInboxOpsQueue(rows, context, { groupBy }));
    return;
  }

  const { rows, pages, truncated } = await fetchAllInboxOpsRows(client, accountId, query, context);
  await writeInboxOpsSnapshot(context, { accountId, rows });
  if (values.json) {
    return writeJson(context.stdout, {
      kind: "inbox_ops_queue",
      account_id: accountId,
      row_count: rows.length,
      pages_fetched: pages,
      truncated,
      decision_queue: rows
    });
  }

  renderInboxOpsQueue(rows, context, { groupBy });
  if (truncated) {
    writeLine(context.stdout, `Stopped after ${pages} pages; clear some rows and re-run to list the rest.`);
  }
}

// One inbox page read can take the server 15-30s, so a busy proxy sometimes
// answers 502/503/504. Retry that page a few times before failing the listing.
async function fetchInboxOpsPageWithRetry(client, accountId, query, context) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await client.operatorQueue(accountId, query);
    } catch (error) {
      const retryable = error instanceof ApiError && INBOX_OPS_RETRY_STATUSES.includes(error.status);
      if (!retryable || attempt >= INBOX_OPS_PAGE_ATTEMPTS) throw error;
      writeLine(context.stderr, `Page read returned HTTP ${error.status}; retrying (${attempt}/${INBOX_OPS_PAGE_ATTEMPTS - 1})...`);
      await context.sleep(INBOX_OPS_RETRY_DELAY_MS * attempt);
    }
  }
}

async function fetchAllInboxOpsRows(client, accountId, baseQuery, context) {
  const rows = [];
  const seen = new Set();
  let query = { ...baseQuery };
  let pages = 0;
  let truncated = false;

  for (;;) {
    const payload = await fetchInboxOpsPageWithRetry(client, accountId, query, context);
    pages += 1;
    for (const row of inboxOpsPayloadRows(payload)) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
    if (payload?.has_more !== true) break;
    if (pages >= INBOX_OPS_MAX_PAGES) {
      truncated = true;
      break;
    }

    const cursor = payload?.metrics?.next_cursor;
    const nextOffset = payload?.metrics?.next_offset;
    if (!cursor && !payload?.next_page) break;
    query = compactObject({
      ...baseQuery,
      operator_page: payload?.next_page,
      operator_cursor: cursor || undefined,
      operator_offset: cursor ? undefined : (nextOffset ?? undefined)
    });
  }

  return { rows: numberInboxOpsRows(rows), pages, truncated };
}

function inboxOpsPayloadRows(payload) {
  const decisionQueue = Array.isArray(payload?.decision_queue) ? payload.decision_queue : [];
  const rows = decisionQueue.length > 0 ? decisionQueue : [payload?.next_move].filter(Boolean);
  return rows.filter((row) => row?.id).map((row) => ({
    id: String(row.id),
    display_name: row.display_name,
    sender: row?.inbox_ops?.sender,
    domain: row?.inbox_ops?.domain,
    subject: row?.inbox_ops?.subject,
    channel: row?.inbox_ops?.channel,
    connected_account: row?.inbox_ops?.connected_account,
    state: row?.inbox_ops?.state
  }));
}

function numberInboxOpsRows(rows) {
  return rows.map((row, index) => ({ number: index + 1, ...row }));
}

function inboxOpsSnapshotPath(context) {
  return join(configDirectory(context.env), INBOX_OPS_SNAPSHOT_FILENAME);
}

async function writeInboxOpsSnapshot(context, { accountId, rows }) {
  await mkdir(configDirectory(context.env), { recursive: true });
  await writeFile(inboxOpsSnapshotPath(context), JSON.stringify({
    version: 1,
    account_id: accountId,
    listed_at: context.now().toISOString(),
    rows
  }, null, 2));
}

async function readInboxOpsSnapshot(context, accountId) {
  let snapshot;
  try {
    snapshot = JSON.parse(await readFile(inboxOpsSnapshotPath(context), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
  if (!Array.isArray(snapshot?.rows)) return null;
  if (String(snapshot.account_id) !== String(accountId)) {
    throw new CommandError(`The current Inbox Ops list belongs to account ${snapshot.account_id}. Run \`audienti inbox-ops queue --account ${accountId}\` first.`);
  }
  return snapshot;
}

function parseInboxOpsSelectors(positionals) {
  const numbers = new Set();
  const rowIds = [];
  const tokens = positionals.flatMap((value) => String(value).split(",")).map((token) => token.trim()).filter(Boolean);

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      numbers.add(Number(token));
      continue;
    }
    const range = /^(\d+)-(\d+)$/.exec(token);
    if (range) {
      const [start, end] = [Number(range[1]), Number(range[2])];
      if (start < 1 || end < start) throw new CommandError(`Invalid range "${token}". Use ascending ranges like 1-25.`);
      for (let number = start; number <= end; number += 1) numbers.add(number);
      continue;
    }
    if (INBOX_OPS_ROW_ID_PATTERN.test(token)) {
      rowIds.push(token);
      continue;
    }
    throw new CommandError(`Unrecognized selector "${token}". Use numbers, ranges like 1-25, or row ids like inbox_ops_message_123.`);
  }
  if (numbers.has(0)) throw new CommandError("Row numbers start at 1.");

  return { numbers: [...numbers].sort((left, right) => left - right), rowIds };
}

function inboxOpsDomainMatches(rowDomain, domain) {
  const candidate = String(rowDomain || "").trim().toLowerCase();
  const wanted = String(domain || "").trim().toLowerCase().replace(/^@/, "").replace(/\.$/, "");
  if (!candidate || !wanted) return false;
  return candidate === wanted || candidate.endsWith(`.${wanted}`);
}

function inboxOpsSenderMatches(rowSender, sender) {
  const candidate = String(rowSender || "").trim().toLowerCase();
  const wanted = String(sender || "").trim().toLowerCase();
  return Boolean(candidate) && candidate === wanted;
}

async function resolveInboxOpsSelection(context, accountId, { positionals, domain, sender, usage }) {
  const { numbers, rowIds } = parseInboxOpsSelectors(positionals);
  const needsSnapshot = numbers.length > 0 || domain !== undefined || sender !== undefined;
  const snapshot = needsSnapshot ? await readInboxOpsSnapshot(context, accountId) : null;
  if (needsSnapshot && !snapshot) {
    throw new CommandError("No Inbox Ops list for this account yet. Run `audienti inbox-ops queue` first, then select rows by number.");
  }

  const selected = [];
  const seen = new Set();
  const add = (row) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    selected.push(row);
  };

  for (const number of numbers) {
    const row = snapshot.rows.find((candidate) => candidate.number === number);
    if (!row) {
      throw new CommandError(`Row ${number} is not in the current Inbox Ops list (1-${snapshot.rows.length}). Re-run \`audienti inbox-ops queue\` to refresh the numbers.`);
    }
    add(row);
  }
  if (domain !== undefined) {
    const matches = snapshot.rows.filter((row) => inboxOpsDomainMatches(row.domain, domain));
    if (matches.length === 0) throw new CommandError(`No listed rows match domain ${domain}.`);
    matches.forEach(add);
  }
  if (sender !== undefined) {
    const matches = snapshot.rows.filter((row) => inboxOpsSenderMatches(row.sender, sender));
    if (matches.length === 0) throw new CommandError(`No listed rows match sender ${sender}.`);
    matches.forEach(add);
  }
  for (const rowId of rowIds) add(snapshot?.rows.find((row) => row.id === rowId) || { id: rowId });
  if (selected.length === 0) throw new CommandError(usage);

  return selected;
}

function inboxOpsBulkUsage(verb) {
  return `Usage: audienti inbox-ops ${verb} <numbers|ranges|row_ids...> [--domain <domain>] [--sender <email>] [--dry-run] [--yes] [--json] [--account <acct_id>]`;
}

async function inboxOpsBulk(verb, args, context, { accountOverride } = {}) {
  const operation = INBOX_OPS_BULK_VERBS[verb];
  const usage = inboxOpsBulkUsage(verb);
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    domain: { type: "string" },
    sender: { type: "string" },
    "dry-run": { type: "boolean" },
    yes: { type: "boolean" }
  });
  if (positionals.length === 0 && values.domain === undefined && values.sender === undefined) throw new CommandError(usage);
  if (values["dry-run"] && values.yes) throw new CommandError("Choose either --dry-run or --yes, not both.");
  if (values.domain !== undefined && !String(values.domain).trim()) throw new CommandError("--domain must not be blank.");
  if (values.sender !== undefined && !String(values.sender).trim()) throw new CommandError("--sender must not be blank.");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const keyedRule = inboxOpsKeyedRule(operation, values, positionals);
  if (keyedRule) return inboxOpsBulkKeyedRule(verb, keyedRule, values, context, { client, accountId });

  const selected = await resolveInboxOpsSelection(context, accountId, {
    positionals, domain: values.domain, sender: values.sender, usage
  });
  if (!values.json) renderInboxOpsManifest(context, verb, selected);

  if (values["dry-run"]) {
    const payload = await inboxOpsActionsInBatches(client, accountId, { operation, rows: selected, dryRun: true });
    if (values.json) return writeJson(context.stdout, payload);
    return renderInboxOpsBulkResults(context, { selected, payload });
  }

  if (!values.yes) {
    const confirmed = await confirmInboxOpsAction(context);
    if (!confirmed) {
      if (values.json) return writeJson(context.stdout, { applied: false, operation, row_ids: selected.map((row) => row.id), message: "Re-run with --yes to apply." });
      writeLine(context.stdout, "");
      writeLine(context.stdout, "Nothing applied. Re-run with --yes to apply, or --dry-run to validate on the server.");
      return;
    }
  }

  const payload = await inboxOpsActionsInBatches(client, accountId, { operation, rows: selected, dryRun: false });
  if (values.json) return writeJson(context.stdout, payload);
  renderInboxOpsBulkResults(context, { selected, payload });
}

function inboxOpsKeyedRule(operation, values, positionals) {
  if (operation === "ignore" || positionals.length > 0) return null;
  const [disposition, scope] = operation.split("_");
  const key = scope === "domain" ? values.domain : values.sender;
  const otherKey = scope === "domain" ? values.sender : values.domain;
  if (key === undefined || otherKey !== undefined) return null;
  return { scope, disposition, key: String(key).trim() };
}

async function inboxOpsBulkKeyedRule(verb, { scope, disposition, key }, values, context, { client, accountId }) {
  const snapshot = await readInboxOpsSnapshot(context, accountId).catch(() => null);
  const matches = (snapshot?.rows || []).filter((row) => (scope === "domain" ? inboxOpsDomainMatches(row.domain, key) : inboxOpsSenderMatches(row.sender, key)));
  const action = disposition === "allow" ? "Always show" : "Always filter";
  if (!values.json) {
    const listed = matches.length > 0 ? ` Listed rows affected: ${compressNumbers(matches.map((row) => row.number))}.` : "";
    writeLine(context.stdout, `${action} ${scope} ${key}.${listed}`);
    writeLine(context.stdout, "This rule is durable and applies to every current and future matching message across your accounts.");
  }
  if (values["dry-run"]) {
    if (values.json) return writeJson(context.stdout, { dry_run: true, rule: { scope, disposition, key }, listed_row_ids: matches.map((row) => row.id) });
    return writeLine(context.stdout, "Dry run: no rule was written.");
  }
  if (!values.yes) {
    const confirmed = await confirmInboxOpsAction(context);
    if (!confirmed) {
      if (values.json) return writeJson(context.stdout, { applied: false, rule: { scope, disposition, key }, message: "Re-run with --yes to apply." });
      writeLine(context.stdout, "Nothing applied. Re-run with --yes to apply.");
      return;
    }
  }

  const payload = await client.setInboxOpsRule(accountId, { scope, key, disposition });
  if (values.json) return writeJson(context.stdout, payload);
  renderInboxOpsRule(payload, context);
}

async function inboxOpsActionsInBatches(client, accountId, { operation, rows, dryRun }) {
  const results = [];
  let last = null;
  for (let index = 0; index < rows.length; index += INBOX_OPS_BATCH_SIZE) {
    const batch = rows.slice(index, index + INBOX_OPS_BATCH_SIZE);
    last = await client.inboxOpsActions(accountId, compactObject({
      operation,
      row_ids: batch.map((row) => row.id),
      dry_run: dryRun || undefined
    }));
    results.push(...(Array.isArray(last?.results) ? last.results : []));
  }

  const counts = {};
  for (const result of results) counts[result.status] = (counts[result.status] || 0) + 1;
  return { ...(last || {}), operation, dry_run: dryRun, counts, results };
}

async function confirmInboxOpsAction(context) {
  if (!stdinIsInteractive(context)) return false;
  const prompt = createInterface({ input: context.stdin, output: context.stdout });
  try {
    const answer = await prompt.question("Apply? [y/N] ");
    return /^y(es)?$/i.test(String(answer).trim());
  } finally {
    prompt.close();
  }
}

function compressNumbers(numbers) {
  const sorted = [...new Set(numbers.filter((value) => Number.isInteger(value)))].sort((left, right) => left - right);
  const parts = [];
  let start = null;
  let previous = null;
  for (const number of sorted) {
    if (start === null) {
      start = previous = number;
      continue;
    }
    if (number === previous + 1) {
      previous = number;
      continue;
    }
    parts.push(start === previous ? String(start) : `${start}-${previous}`);
    start = previous = number;
  }
  if (start !== null) parts.push(start === previous ? String(start) : `${start}-${previous}`);
  return parts.join(",");
}

async function networkOpsQueue(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    ...operatorPaginationOptions()
  });
  if (positionals.length > 0) throw new CommandError(NETWORK_OPS_QUEUE_USAGE);

  const query = { opportunity_kind: "network", ...operatorPaginationQuery(values) };
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.operatorQueue(accountId, query);
  if (values.json) return writeJson(context.stdout, payload);

  renderOperatorRead(payload, context, { command: "network-ops queue", accountId, query }, () => renderNetworkOpsQueue(payload, context, { accountId }));
}

async function networkOpsAction(action, args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  const canonicalAction = action === "reject" ? "decline" : action;
  const usage = canonicalAction === "accept" ? NETWORK_OPS_ACCEPT_USAGE : NETWORK_OPS_DECLINE_USAGE;
  if (positionals.length !== 1) throw new CommandError(usage);

  const rowId = positionals[0];
  if (!NETWORK_OPS_ROW_ID_PATTERN.test(rowId)) {
    throw new CommandError("<row_id> must match network_ops_event_<positive integer>.");
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.networkOpsAction(accountId, rowId, canonicalAction);
  if (values.json) return writeJson(context.stdout, payload);

  renderNetworkOpsAction(payload, context);
}

async function inboxOpsFilters(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError(INBOX_OPS_FILTERS_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.inboxOpsFilters(accountId);
  if (values.json) return writeJson(context.stdout, payload);

  renderInboxOpsFilters(payload, context);
}

async function inboxOpsRule(args, context, { accountOverride } = {}) {
  if (args[0] === "set" || args[0] === "remove") {
    return inboxOpsRuleKeyMutation(args[0], args.slice(1), context, { accountOverride });
  }

  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    scope: { type: "string" },
    disposition: { type: "string" }
  });
  if (positionals.length !== 1) throw new CommandError(INBOX_OPS_RULE_USAGE);
  if (!["sender", "domain"].includes(values.scope)) throw new CommandError("--scope must be sender or domain.");
  if (!["allow", "filter"].includes(values.disposition)) throw new CommandError("--disposition must be allow or filter.");

  const rowId = positionals[0];
  if (!INBOX_OPS_ROW_ID_PATTERN.test(rowId)) {
    throw new CommandError("<row_id> must match inbox_ops_message_<positive integer>.");
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.updateInboxOpsRule(accountId, rowId, {
    scope: values.scope,
    disposition: values.disposition
  });
  if (values.json) return writeJson(context.stdout, payload);

  renderInboxOpsRule(payload, context);
}

async function inboxOpsRuleKeyMutation(action, args, context, { accountOverride } = {}) {
  const usage = action === "set" ? INBOX_OPS_RULE_SET_USAGE : INBOX_OPS_RULE_REMOVE_USAGE;
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    scope: { type: "string" },
    key: { type: "string" },
    disposition: { type: "string" }
  });
  if (positionals.length > 0) throw new CommandError(usage);
  if (!["sender", "domain"].includes(values.scope)) throw new CommandError("--scope must be sender or domain.");
  if (!String(values.key || "").trim()) throw new CommandError("--key is required.");
  if (action === "set" && !["allow", "filter"].includes(values.disposition)) {
    throw new CommandError("--disposition must be allow or filter.");
  }
  if (action === "remove" && values.disposition) {
    throw new CommandError("inbox-ops rule remove does not accept --disposition.");
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const body = compactObject({
    scope: values.scope,
    key: values.key,
    disposition: action === "set" ? values.disposition : undefined
  });
  const payload = action === "set"
    ? await client.setInboxOpsRule(accountId, body)
    : await client.removeInboxOpsRule(accountId, body);
  if (values.json) return writeJson(context.stdout, payload);

  renderInboxOpsRule(payload, context);
}

async function operatorFailedDrafts(args, context, { accountOverride } = {}) {
  if (args[0] === "requeue") {
    return operatorFailedDraftsRequeue(args.slice(1), context, { accountOverride });
  }

  const { values, positionals } = parseCommandArgs(args, operatorFailedDraftOptions(operatorPaginationOptions()));
  if (positionals.length > 0) throw new CommandError(OPERATOR_FAILED_DRAFTS_USAGE);

  const query = { ...operatorFailedDraftQuery(values), ...operatorPaginationQuery(values) };
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.operatorQueue(accountId, query);
  if (values.json) return writeJson(context.stdout, payload);

  renderOperatorRead(payload, context, { command: "operator failed-drafts", accountId, query }, () => renderOperatorFailedDrafts(payload, context));
}

async function operatorFailedDraftsRequeue(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, operatorFailedDraftOptions({
    all: { type: "boolean" },
    limit: { type: "string" }
  }));
  if (values.all && positionals.length > 0) throw new CommandError("Choose either --all or row ids, not both.");
  if (!values.all && positionals.length === 0) throw new CommandError(OPERATOR_FAILED_DRAFTS_REQUEUE_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.requeueOperatorFailedDrafts(accountId, compactObject({
    ...operatorFailedDraftQuery(values),
    all: values.all || undefined,
    limit: values.limit,
    row_ids: positionals.length > 0 ? positionals : undefined
  }));
  if (values.json) return writeJson(context.stdout, payload);

  renderOperatorFailedDraftRequeue(payload, context);
}

async function operatorNext(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, operatorNextOptions());
  if (positionals.length > 0) throw new CommandError("Usage: audienti operator next [--json|--plan|--done|--skip|--fail|--return] [filters] [--note <text>] [--account <acct_id>]");
  if (values.json && values.plan) throw new CommandError("Choose one output format: use either --json or --plan.");
  const outcomeStatus = operatorNextOutcomeStatus(values);
  if (values.plan && outcomeStatus) throw new CommandError("Choose one mode: use either --plan or an outcome flag.");
  if (outcomeStatus && [values.page, values.offset, values.cursor].some((value) => value !== undefined)) {
    throw new CommandError("Pagination is only available for reads; omit --page, --offset, and --cursor when recording an outcome.");
  }
  if (!outcomeStatus && (values.note !== undefined || values["occurred-at"] !== undefined)) {
    throw new CommandError("--note and --occurred-at require an outcome flag: --done, --skip, --fail, or --return.");
  }

  const query = { ...operatorQuery(values), ...operatorPaginationQuery(values) };
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.operatorNext(accountId, query);
  if (outcomeStatus) {
    const response = await client.operatorOutcome(accountId, operatorNextOutcomePayload(payload?.next_move, {
      status: outcomeStatus,
      note: values.note,
      occurredAt: values["occurred-at"],
      filters: payload?.filters
    }));
    if (values.json) return writeJson(context.stdout, response);

    return renderOperatorOutcome(response, context);
  }
  if (values.json) return writeJson(context.stdout, payload);
  renderOperatorRead(payload, context, { command: "operator next", accountId, query, plan: values.plan }, () => {
    if (values.plan) return renderOperatorPlan(payload?.next_move, context);
    renderOperatorNext(payload?.next_move, context);
  });
}

async function operatorOutcome(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    payload: { type: "string" }
  });
  if (positionals.length !== 1 || !values.payload) {
    throw new CommandError("Usage: audienti operator outcome <row_id> --payload <file.json> [--json] [--account <acct_id>]");
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await readJsonPayload(values.payload);
  const response = await client.operatorOutcome(accountId, {
    ...payload,
    row_id: positionals[0]
  });
  if (values.json) return writeJson(context.stdout, response);

  renderOperatorOutcome(response, context);
}

async function operatorAnswer(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    choice: { type: "string" },
    principal: { type: "string" },
    answer: { type: "string" }
  });
  if (positionals.length !== 1 || (values.choice !== undefined) === (values.answer !== undefined)) {
    throw new CommandError("Usage: audienti operator answer <row_id> (--choice <id> | --answer <text>) [--json] [--account <acct_id>]");
  }
  if (!String(values.choice ?? values.answer).trim()) throw new CommandError("The choice or answer must not be blank.");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const filters = compactObject({ principal_account_user_id: values.principal });
  const payload = await client.operatorRow(accountId, positionals[0], filters);
  const row = payload?.row;
  const action = row?.next_action;
  if (String(row?.id) !== positionals[0] || action?.type !== "answer_planner_question" ||
      !row.fingerprint || !action.decision_id || !action.context_fingerprint) {
    throw new CommandError("This row has no current planner question. Refresh the Operator queue.");
  }
  const response = await client.operatorAnswer(accountId, {
    ...filters,
    row_id: row.id,
    fingerprint: row.fingerprint,
    decision_id: action.decision_id,
    context_fingerprint: action.context_fingerprint,
    ...(values.choice !== undefined ? { choice_id: values.choice } : { answer: values.answer })
  });
  if (values.json) return writeJson(context.stdout, response);
  writeLine(context.stdout, "Answer recorded. Planning the next step.");
}

async function analyticsProspects(args, context, { accountOverride } = {}) {
  if (args[0] === "cohort-analysis") {
    return analyticsProspectsCohortAnalysis(args.slice(1), context, { accountOverride });
  }

  const { values, positionals } = parseCommandArgs(args, analyticsProspectsOptions());
  if (positionals.length > 0) throw new CommandError(ANALYTICS_PROSPECTS_USAGE);

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const payload = await client.analyticsProspects(accountId, analyticsQuery(values, config, { accountOverride }));
  if (values.json) return writeJson(context.stdout, payload);

  renderAnalyticsProspects(payload, context);
}

async function analyticsProspectsCohortAnalysis(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    weeks: { type: "string" },
    window: { type: "string" },
    motion: { type: "string" },
    list: { type: "string" },
    provenance: { type: "string" },
    user: { type: "string" }
  });
  if (positionals.length > 0) throw new CommandError(ANALYTICS_PROSPECTS_COHORT_ANALYSIS_USAGE);

  const weeks = normalizedCohortAnalysisWeeks(values.weeks);
  const cohorts = weeklyCohorts({ weeks, now: currentDate(context) });
  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const rows = [];

  for (const cohort of cohorts) {
    const payload = await client.analyticsProspects(accountId, compactObject({
      window: values.window,
      account_user_id: resolveAccountUserId(values.user, config, { accountOverride }),
      motion_id: values.motion,
      list_id: values.list,
      provenance: values.provenance,
      cohort_start: cohort.start_date,
      cohort_end: cohort.end_date
    }));
    rows.push(cohortAnalysisRow(payload, cohort));
  }

  const payload = {
    kind: "prospect_cohort_analysis",
    weeks,
    window: values.window || "24h",
    motion: rows.find((row) => row.motion)?.motion || motionPayload(values.motion),
    list: rows.find((row) => row.list)?.list || listPayload(values.list),
    provenance: rows.find((row) => row.provenance)?.provenance || provenancePayload(values.provenance),
    account_user: rows.find((row) => row.account_user)?.account_user || null,
    cohorts: rows
  };
  if (values.json) return writeJson(context.stdout, payload);

  renderAnalyticsProspectCohortAnalysis(payload, context);
}

async function analyticsUsers(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, analyticsUsersOptions());
  if (positionals.length > 0) throw new CommandError(ANALYTICS_USERS_USAGE);
  validateDatePair(values.start, values.end, "--start", "--end");
  validateDatePair(values["cohort-start"], values["cohort-end"], "--cohort-start", "--cohort-end");

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const payload = await client.analyticsUsers(accountId, analyticsUsersQuery(values, config, { accountOverride }));
  if (values.json) return writeJson(context.stdout, payload);

  renderAnalyticsUsers(payload, context);
}

async function analyticsVisibility(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, analyticsOptions());
  if (positionals.length > 0) throw new CommandError("Usage: audienti analytics visibility [--window 24h] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]");

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const payload = await client.analyticsVisibility(accountId, analyticsQuery(values, config, { accountOverride }));
  if (values.json) return writeJson(context.stdout, payload);

  renderAnalyticsVisibility(payload, context);
}

async function analyticsContent(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, analyticsOptions());
  if (positionals.length > 0) throw new CommandError("Usage: audienti analytics content [--window 24h] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]");

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const payload = await client.analyticsContent(accountId, analyticsQuery(values, config, { accountOverride }));
  if (values.json) return writeJson(context.stdout, payload);

  renderAnalyticsContent(payload, context);
}

async function analyticsDashboard(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, analyticsDashboardOptions());
  if (positionals.length > 0) throw new CommandError(ANALYTICS_DASHBOARD_USAGE);
  validateDatePair(values["cohort-start"], values["cohort-end"], "--cohort-start", "--cohort-end");

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const payload = await client.analyticsDashboard(accountId, analyticsDashboardQuery(values, config, { accountOverride }));
  if (values.json) return writeJson(context.stdout, payload);

  renderAnalyticsDashboard(payload, context);
}

async function analyticsMotions(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError(ANALYTICS_MOTIONS_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.analyticsMotions(accountId);
  if (values.json) return writeJson(context.stdout, payload);

  renderAnalyticsMotions(payload, context);
}

async function analyticsIcps(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError(ANALYTICS_ICPS_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.analyticsIcps(accountId);
  if (values.json) return writeJson(context.stdout, payload);

  renderAnalyticsIcps(payload, context);
}

async function analyticsMetrics(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, analyticsMetricsOptions());
  if (positionals.length > 0) throw new CommandError(ANALYTICS_METRICS_USAGE);
  validateAnalyticsMetricsValues(values);

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const payload = await client.analyticsMetrics(accountId, analyticsMetricsQuery(values, config, { accountOverride }));
  if (values.json) return writeJson(context.stdout, payload);

  renderAnalyticsMetrics(payload, context);
}

async function analyticsStages(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, analyticsStagesOptions());
  if (positionals.length > 0) throw new CommandError(ANALYTICS_STAGES_USAGE);
  validateDatePair(values["cohort-start"], values["cohort-end"], "--cohort-start", "--cohort-end");

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const payload = await client.analyticsStages(accountId, analyticsStagesQuery(values, config, { accountOverride }));
  if (values.json) return writeJson(context.stdout, payload);

  renderAnalyticsStages(payload, context);
}

async function analyticsCohorts(args, context, { accountOverride } = {}) {
  const action = args[0];
  if (action !== "create-list") throw new CommandError(ANALYTICS_COHORT_LIST_USAGE);

  const { values, positionals } = parseCommandArgs(args.slice(1), analyticsCohortListOptions());
  if (positionals.length > 0 || !values.name || !values.start || !values.end) {
    throw new CommandError(ANALYTICS_COHORT_LIST_USAGE);
  }

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const payload = await client.createAnalyticsCohortList(accountId, compactObject({
    name: values.name,
    start_date: values.start,
    end_date: values.end,
    event_type: values.event || "connection_request_sent",
    account_user_id: resolveAccountUserId(values.user, config, { accountOverride }),
    note_mode: values["note-mode"],
    motion_id: values.motion,
    offer_id: values.offer,
    icp_id: values.icp,
    play_tag: values["play-tag"] || values.tag
  }));
  if (values.json) return writeJson(context.stdout, payload);

  renderAnalyticsCohortList(payload, context);
}

function parseCommandArgs(args, options) {
  try {
    return parseArgs({
      args,
      options,
      allowPositionals: true,
      strict: true
    });
  } catch (error) {
    throw new CommandError(error.message);
  }
}

function assertNoPositionals(args, usageText) {
  const { positionals } = parseCommandArgs(args, {});
  if (positionals.length > 0) throw new CommandError(usageText);
}

async function requireAuthenticatedConfig(context) {
  const config = await readConfig({ env: context.env });
  if (!config.token) {
    throw new CommandError("Not authenticated. Run `audienti auth login` or `audienti auth token <token>`.");
  }

  return config;
}

async function requireAccountContext(context, { accountOverride } = {}) {
  const config = await requireAuthenticatedConfig(context);
  const accountId = accountOverride || config.accountId;
  if (!accountId) {
    throw new CommandError("No active account. Run `audienti accounts select <acct_id>` or pass `--account <acct_id>`.");
  }

  return {
    accountId,
    config,
    client: clientFromConfig(config, context)
  };
}

function resolveAccountUserId(value, config = {}, { accountOverride } = {}) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return undefined;
  if (rawValue.toLowerCase() !== "me") return rawValue;

  return defaultAccountUserConfig(config, { accountOverride }).id || "me";
}

function defaultAccountUserConfig(config = {}, { accountOverride } = {}) {
  if (!config.accountUserId) return {};
  if (accountOverride && accountOverride !== config.accountId) return {};

  return {
    id: String(config.accountUserId),
    name: config.accountUserName,
    email: config.accountUserEmail
  };
}

function clientFromConfig(config, context) {
  return new AudientiClient({
    host: config.host || DEFAULT_HOST,
    token: config.token,
    fetchImpl: context.fetchImpl
  });
}

function jsonOptions() {
  return {
    json: { type: "boolean" }
  };
}

function boundedListLimit(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_LIST_LIMIT;

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) throw new CommandError("--limit must be a positive integer.");

  return Math.min(parsed, API_MAX_LIST_LIMIT);
}

function taskListOptions() {
  return {
    ...jsonOptions(),
    status: { type: "string" },
    limit: { type: "string" }
  };
}

function taskAddOptions() {
  return {
    ...jsonOptions(),
    title: { type: "string" },
    due: { type: "string" },
    prospect: { type: "string" },
    list: { type: "string" },
    "assigned-user": { type: "string" },
    notes: { type: "string" }
  };
}

function validateTaskStatus(status) {
  if (!status) return;
  if (!["open", "completed"].includes(status)) throw new CommandError("--status must be open or completed.");
}

function operatorFilterOptions(extra = {}) {
  return {
    ...jsonOptions(),
    principal: { type: "string" },
    motion: { type: "string" },
    list: { type: "string" },
    stage: { type: "string" },
    "opportunity-kind": { type: "string" },
    "writing-status": { type: "string" },
    ...extra
  };
}

function operatorNextOptions() {
  return operatorFilterOptions({
    ...operatorPaginationOptions(),
    plan: { type: "boolean" },
    done: { type: "boolean" },
    skip: { type: "boolean" },
    fail: { type: "boolean" },
    return: { type: "boolean" },
    note: { type: "string" },
    "occurred-at": { type: "string" }
  });
}

function operatorPaginationOptions() {
  return { page: { type: "string" }, offset: { type: "string" }, cursor: { type: "string" } };
}

function operatorPaginationQuery(values) {
  const page = normalizeOptionalPositiveInteger(values.page, "--page");
  if (values.page !== undefined && page === undefined) throw new CommandError("--page must be a positive integer.");
  if (page !== undefined && !Number.isSafeInteger(page)) throw new CommandError("--page must be a safe positive integer.");

  let offset;
  if (values.offset !== undefined) {
    offset = Number(values.offset);
    if (!Number.isSafeInteger(offset) || offset < 0 || String(offset) !== values.offset.trim()) {
      throw new CommandError("--offset must be a nonnegative integer.");
    }
  }
  if (values.cursor !== undefined && !values.cursor.trim()) throw new CommandError("--cursor must not be blank.");
  if (values.cursor !== undefined && offset !== undefined) throw new CommandError("Choose either --cursor or --offset, not both.");

  return compactObject({ operator_page: page, operator_offset: offset, operator_cursor: values.cursor });
}

function operatorFailedDraftOptions(extra = {}) {
  return {
    ...jsonOptions(),
    principal: { type: "string" },
    motion: { type: "string" },
    list: { type: "string" },
    stage: { type: "string" },
    query: { type: "string" },
    ...extra
  };
}

function operatorQuery(values) {
  return compactObject({
    principal_account_user_id: values.principal,
    motion_id: values.motion,
    list_id: values.list,
    stage: values.stage,
    opportunity_kind: values["opportunity-kind"],
    writing_status: values["writing-status"]
  });
}

function operatorFailedDraftQuery(values) {
  return compactObject({
    principal_account_user_id: values.principal,
    motion_id: values.motion,
    list_id: values.list,
    stage: values.stage,
    query: values.query,
    opportunity_kind: "prospect",
    writing_status: "draft_failed"
  });
}

function operatorNextOutcomeStatus(values) {
  const selected = [
    values.done ? "done" : null,
    values.skip ? "skipped" : null,
    values.fail ? "failed" : null,
    values.return ? "returned" : null
  ].filter(Boolean);
  if (selected.length > 1) throw new CommandError("Choose one outcome flag: --done, --skip, --fail, or --return.");

  return selected[0];
}

function operatorNextOutcomePayload(row, { status, note, occurredAt, filters }) {
  if (!row) throw new CommandError("No operator moves found.");
  if (!row.id) throw new CommandError("The next operator move is missing a row id.");
  if (!row.fingerprint) throw new CommandError("The next operator move is missing a fingerprint; update the server before using outcome shortcuts.");

  return compactObject({
    row_id: row.id,
    status,
    fingerprint: row.fingerprint,
    queue_filters: filters,
    note,
    occurred_at: occurredAt
  });
}

function analyticsOptions() {
  return {
    ...jsonOptions(),
    window: { type: "string" },
    user: { type: "string" }
  };
}

function analyticsProspectsOptions() {
  return {
    ...analyticsOptions(),
    "cohort-start": { type: "string" },
    "cohort-end": { type: "string" },
    motion: { type: "string" },
    list: { type: "string" },
    provenance: { type: "string" }
  };
}

function analyticsUsersOptions() {
  return {
    ...jsonOptions(),
    user: { type: "string" },
    window: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    "cohort-start": { type: "string" },
    "cohort-end": { type: "string" },
    motion: { type: "string" },
    list: { type: "string" },
    provenance: { type: "string" },
    platform: { type: "string" },
    channel: { type: "string" }
  };
}

function analyticsDashboardOptions() {
  return {
    ...jsonOptions(),
    "cohort-start": { type: "string" },
    "cohort-end": { type: "string" },
    "play-tag": { type: "string" },
    tag: { type: "string" },
    motion: { type: "string" },
    list: { type: "string" },
    offer: { type: "string" },
    icp: { type: "string" },
    user: { type: "string" }
  };
}

function analyticsStagesOptions() {
  return {
    ...analyticsDashboardOptions(),
    interval: { type: "string" }
  };
}

function analyticsMetricsOptions() {
  return {
    ...jsonOptions(),
    "cohort-start": { type: "string" },
    "cohort-end": { type: "string" },
    "cohort-preset": { type: "string" },
    interval: { type: "string" },
    user: { type: "string" },
    motion: { type: "string" },
    "play-tag": { type: "string" },
    list: { type: "string" },
    offer: { type: "string" },
    icp: { type: "string" },
    "social-cookie": { type: "string" },
    platform: { type: "string" },
    action: { type: "string" },
    outcome: { type: "string" }
  };
}

function analyticsCohortListOptions() {
  return {
    ...jsonOptions(),
    name: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    event: { type: "string" },
    user: { type: "string" },
    "note-mode": { type: "string" },
    motion: { type: "string" },
    offer: { type: "string" },
    icp: { type: "string" },
    "play-tag": { type: "string" },
    tag: { type: "string" }
  };
}

function analyticsQuery(values, config = {}, { accountOverride } = {}) {
  return compactObject({
    window: values.window,
    cohort_start: values["cohort-start"],
    cohort_end: values["cohort-end"],
    motion_id: values.motion,
    list_id: values.list,
    provenance: values.provenance,
    account_user_id: resolveAccountUserId(values.user, config, { accountOverride })
  });
}

function analyticsUsersQuery(values, config = {}, { accountOverride } = {}) {
  const hasDateRange = Boolean(values.start || values.end);
  return compactObject({
    account_user_id: resolveAccountUserId(values.user || "me", config, { accountOverride }),
    window: hasDateRange ? undefined : (values.window || "30d"),
    start_date: values.start,
    end_date: values.end,
    cohort_start: values["cohort-start"],
    cohort_end: values["cohort-end"],
    motion_id: values.motion,
    list_id: values.list,
    provenance: values.provenance,
    platform: values.platform || values.channel
  });
}

function analyticsDashboardQuery(values, config = {}, { accountOverride } = {}) {
  return compactObject({
    cohort_start_date: values["cohort-start"],
    cohort_end_date: values["cohort-end"],
    play_tag: values["play-tag"] || values.tag,
    motion_id: values.motion,
    list_id: values.list,
    offer_id: values.offer,
    icp_id: values.icp,
    account_user_id: resolveAccountUserId(values.user, config, { accountOverride })
  });
}

function analyticsStagesQuery(values, config = {}, { accountOverride } = {}) {
  return compactObject({
    ...analyticsDashboardQuery(values, config, { accountOverride }),
    interval: values.interval
  });
}

function analyticsMetricsQuery(values, config = {}, { accountOverride } = {}) {
  return compactObject({
    cohort_start_date: values["cohort-start"],
    cohort_end_date: values["cohort-end"],
    cohort_preset: values["cohort-preset"] === "week-to-date" ? "week_to_date" : values["cohort-preset"],
    interval: values.interval,
    account_user_id: resolveAccountUserId(values.user, config, { accountOverride }),
    motion_id: values.motion,
    play_tag: values["play-tag"],
    list_id: values.list,
    offer_id: values.offer,
    icp_id: values.icp,
    social_cookie_id: values["social-cookie"],
    platform: values.platform,
    action_key: values.action,
    outcome: values.outcome
  });
}

function validateAnalyticsMetricsValues(values) {
  for (const [key, value] of Object.entries(values)) {
    if (key !== "json" && typeof value === "string" && value.trim() === "") {
      throw new CommandError(`--${key} cannot be blank.`);
    }
  }

  validateDatePair(values["cohort-start"], values["cohort-end"], "--cohort-start", "--cohort-end");
  validateIsoDate(values["cohort-start"], "--cohort-start");
  validateIsoDate(values["cohort-end"], "--cohort-end");

  if (values["cohort-preset"] && (values["cohort-start"] || values["cohort-end"])) {
    throw new CommandError("--cohort-preset cannot be combined with --cohort-start or --cohort-end.");
  }
  if (values["cohort-preset"] && values["cohort-preset"] !== "week-to-date") {
    throw new CommandError("--cohort-preset must be week-to-date.");
  }
  if (values.interval && !["daily", "weekly"].includes(values.interval)) {
    throw new CommandError("--interval must be daily or weekly.");
  }
  if (values.outcome && !OUTBOUND_METRICS_OUTCOMES.has(values.outcome)) {
    throw new CommandError("--outcome must be one of success, failure, first_attempt_success, succeeded_after_retry, failed_without_retry, failed_after_retry, in_progress, unresolved.");
  }
}

function validateIsoDate(value, flagName) {
  if (!value) return;

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match ? new Date(`${value}T00:00:00Z`) : null;
  const valid = date && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  if (!valid) throw new CommandError(`${flagName} must be a valid date in YYYY-MM-DD format.`);
}

function validateDatePair(start, end, startFlag, endFlag) {
  if ((start && !end) || (!start && end)) {
    throw new CommandError(`${startFlag} and ${endFlag} must be provided together.`);
  }
}

function normalizedCohortAnalysisWeeks(rawValue) {
  const weeks = Number.parseInt(rawValue || "4", 10);
  if (!Number.isInteger(weeks) || weeks <= 0) {
    throw new CommandError("--weeks must be a positive integer.");
  }
  if (weeks > 26) {
    throw new CommandError("--weeks must be 26 or less.");
  }

  return weeks;
}

function currentDate(context) {
  const raw = typeof context.now === "function" ? context.now() : context.now;
  const date = raw instanceof Date ? raw : new Date(raw || Date.now());
  if (Number.isNaN(date.getTime())) return utcDateOnly(new Date());

  return utcDateOnly(date);
}

function weeklyCohorts({ weeks, now }) {
  const currentWeekStart = startOfUtcWeek(now);
  const rows = [];

  for (let offset = weeks - 1; offset >= 0; offset -= 1) {
    const start = addUtcDays(currentWeekStart, offset * -7);
    const plannedEnd = addUtcDays(start, 6);
    const end = plannedEnd > now ? now : plannedEnd;
    rows.push({
      start_date: isoDate(start),
      end_date: isoDate(end)
    });
  }

  return rows;
}

function startOfUtcWeek(date) {
  const day = date.getUTCDay();
  const mondayOffset = (day + 6) % 7;
  return addUtcDays(date, -mondayOffset);
}

function utcDateOnly(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return utcDateOnly(next);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function cohortAnalysisRow(payload, fallbackCohort) {
  const cohort = payload?.cohort || fallbackCohort;
  const stages = {};
  const stageLabels = {};
  for (const row of Array.isArray(payload?.queue_stages) ? payload.queue_stages : []) {
    const key = String(row?.key || "").trim();
    if (!key) continue;

    stages[key] = row?.count || 0;
    stageLabels[key] = row?.label || key;
  }

  return {
    cohort,
    label: `${display(cohort.start_date)} to ${display(cohort.end_date)}`,
    total_count: payload?.cohort_prospects_count ?? payload?.prospects_added_count ?? 0,
    motion: payload?.motion || null,
    list: payload?.list || null,
    provenance: payload?.provenance || null,
    account_user: payload?.account_user || null,
    stages,
    stage_labels: stageLabels
  };
}

function motionPayload(motionId) {
  if (!motionId) return null;

  return { prefix_id: motionId, name: motionId };
}

function provenancePayload(provenance) {
  if (!provenance) return null;

  return {
    key: provenance,
    label: humanize(provenance),
    field: "account_prospects.intake_source"
  };
}

function listPayload(listId) {
  if (!listId) return null;

  return { prefix_id: listId, name: listId };
}

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => {
      if (value === undefined || value === null) return false;
      if (Array.isArray(value)) return true;

      return String(value).trim() !== "";
    })
  );
}

function compactObjectPreservingFields(object, fields) {
  const compacted = compactObject(object);
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(object, field) && object[field] !== undefined) {
      compacted[field] = object[field];
    }
  }
  return compacted;
}

async function readLocalPackageMetadata() {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  return {
    name: packageJson.name || PACKAGE_NAME,
    version: packageJson.version
  };
}

async function fetchLatestPackageVersion({ fetchImpl, registry }) {
  if (!fetchImpl) throw new Error("This Node runtime does not provide fetch.");

  const response = await fetchImpl(registryLatestPackageUrl(registry), {
    headers: {
      accept: "application/vnd.npm.install-v1+json, application/json"
    }
  });
  const bodyText = await response.text();
  const body = bodyText ? JSON.parse(bodyText) : {};

  if (!response.ok) {
    throw new Error(body?.error || body?.message || `Registry returned HTTP ${response.status}.`);
  }

  const version = body?.version?.toString().trim();
  if (!version) throw new Error("Registry response did not include a version.");

  return version;
}

function registryLatestPackageUrl(registry) {
  const base = new URL(registry || DEFAULT_NPM_REGISTRY);
  if (!base.pathname.endsWith("/")) base.pathname = `${base.pathname}/`;

  return new URL(`${encodeURIComponent(PACKAGE_NAME)}/latest`, base).toString();
}

function updateCheckPayload({ currentVersion, latestVersion, status, updateAvailable, registry, error, now }) {
  return {
    kind: "update_check",
    package_name: PACKAGE_NAME,
    current_version: currentVersion,
    latest_version: latestVersion,
    update_available: updateAvailable,
    status,
    install_command: `npm install --global ${PACKAGE_NAME}`,
    registry,
    checked_at: now.toISOString(),
    error: error || null
  };
}

function compareVersions(currentVersion, latestVersion) {
  const current = parseVersion(currentVersion);
  const latest = parseVersion(latestVersion);

  for (let index = 0; index < 3; index += 1) {
    if (current.parts[index] !== latest.parts[index]) return current.parts[index] - latest.parts[index];
  }

  if (current.prerelease === latest.prerelease) return 0;
  if (!current.prerelease) return 1;
  if (!latest.prerelease) return -1;

  return current.prerelease.localeCompare(latest.prerelease);
}

function parseVersion(version) {
  const [core, prerelease = ""] = String(version || "").split("-", 2);
  const parts = core.split(".").map((part) => Number.parseInt(part, 10));

  return {
    parts: [parts[0] || 0, parts[1] || 0, parts[2] || 0],
    prerelease
  };
}

function tagList(value) {
  if (value === undefined) return undefined;

  return String(value)
    .split(/[\r\n,;]+/)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag, index, tags) => tags.indexOf(tag) === index);
}

function companyRuleOptions() {
  return {
    ...jsonOptions(),
    name: { type: "string" },
    "linkedin-url": { type: "string" },
    domain: { type: "string" },
    disposition: { type: "string" },
    user: { type: "string" },
    note: { type: "string" }
  };
}

function companyRulePayload(values) {
  const userValue = values.user === undefined ? undefined : String(values.user || "").trim();
  const userCleared = userValue && ["none", "account", "all"].includes(userValue.toLowerCase());

  return compactObject({
    name: values.name,
    linkedin_company_url: values["linkedin-url"],
    domain: values.domain,
    disposition: values.disposition,
    note: values.note,
    scope_kind: userValue === undefined ? undefined : (userCleared ? "account" : "account_user"),
    account_user_id: userValue === undefined ? undefined : (userCleared ? "" : userValue)
  });
}

function parseDncImportValues(body) {
  return String(body || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",")[0])
    .map((value) => value.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

function filterRecordsByTag(records, value, field) {
  const tag = tagList(value)?.[0];
  if (!tag) return records;

  return Array.isArray(records) ? records.filter((record) => (tagList(record?.[field]) || []).includes(tag)) : [];
}

async function icpCreatePayload(values) {
  if (values.payload) {
    if (icpSimpleFieldsPresent(values)) {
      throw new CommandError("Choose one ICP input mode: either --payload <file.json> or the simple --name/--notes/--discovery-keyword/tags flags.");
    }

    return readJsonPayload(values.payload);
  }

  if (!values.name) {
    throw new CommandError("Usage: audienti icps create (--name <text> [--notes <text>] [--discovery-keyword <text>] [--tags <tag[,tag...]>] | --payload <file.json>) [--json] [--account <acct_id>]");
  }

  return compactObject({
    name: values.name,
    notes: values.notes,
    tags: values.tags !== undefined ? tagList(values.tags) : undefined,
    discovery_keyword: values["discovery-keyword"]
  });
}

async function icpUpdatePayload(values) {
  if (values.payload) {
    if (icpSimpleFieldsPresent(values)) {
      throw new CommandError("Choose one ICP input mode: either --payload <file.json> or the simple --name/--notes/--discovery-keyword/tags flags.");
    }

    return readJsonPayload(values.payload);
  }

  return compactObject({
    name: values.name,
    notes: values.notes,
    tags: values.tags !== undefined ? tagList(values.tags) : undefined,
    discovery_keyword: values["discovery-keyword"]
  });
}

function icpSimpleFieldsPresent(values) {
  return Boolean(values.name) || values.notes !== undefined || values.tags !== undefined || values["discovery-keyword"] !== undefined;
}

async function prospectNotePayload(values, { forcedType, usageText } = {}) {
  const engagementKey = values["engagement-type"] || values["engagement-key"];

  if (values.payload) {
    if (values.message || values.type || values["track-as-engagement"] || engagementKey) {
      throw new CommandError("Choose one prospect note input mode: either --payload <file.json> or the simple --message/--type/--engagement-type flags.");
    }

    const payload = await readJsonPayload(values.payload);
    return normalizeProspectNoteType(payload, forcedType);
  }

  if (!values.message) {
    throw new CommandError(usageText || PROSPECTS_ADD_NOTE_USAGE);
  }

  if (values["track-as-engagement"] && !engagementKey) {
    throw new CommandError("--track-as-engagement requires --engagement-type <key>.");
  }

  if (forcedType && values.type && values.type !== forcedType) {
    throw new CommandError(`This command only supports --type ${forcedType}. Use \`audienti prospects add-note\` for other note types.`);
  }

  return compactObject({
    note_type: forcedType || values.type || "note",
    message: values.message,
    track_as_engagement: values["track-as-engagement"] || Boolean(engagementKey),
    engagement_key: engagementKey
  });
}

function normalizeProspectNoteType(payload, forcedType) {
  if (!forcedType) return payload;

  const noteType = String(payload?.note_type || "").trim();
  if (noteType && noteType !== forcedType) {
    throw new CommandError(`Payload note_type must be ${forcedType} for this command. Use \`audienti prospects add-note\` for other note types.`);
  }

  return {
    ...payload,
    note_type: forcedType
  };
}

async function fetchAllPages(fetchPage, baseQuery, { totalLimit = MAX_ALL_PROSPECTS } = {}) {
  const prospects = [];
  let offset = 0;
  let totalCount = null;

  while (prospects.length < totalLimit) {
    const remaining = totalLimit - prospects.length;
    const batchLimit = Math.min(remaining, API_MAX_LIST_LIMIT);
    const payload = await fetchPage({
      ...baseQuery,
      limit: batchLimit,
      offset
    });
    const rows = Array.isArray(payload?.prospects) ? payload.prospects : [];
    const meta = payload?.meta || {};
    totalCount = normalizePositiveInteger(meta.total_count) ?? totalCount;
    const hasMore = meta.has_more === true || (totalCount !== null && (offset + rows.length) < totalCount);

    prospects.push(...rows.slice(0, remaining));

    if (rows.length === 0) break;
    offset += rows.length;
    if (!hasMore) break;
  }

  const inferredTotal = totalCount ?? prospects.length;
  return {
    prospects,
    meta: {
      total_count: inferredTotal,
      limit: Math.min(totalLimit, API_MAX_LIST_LIMIT),
      offset: 0,
      page: 1,
      returned_count: prospects.length,
      has_more: prospects.length < inferredTotal,
      all: true,
      max_total: totalLimit,
      truncated: prospects.length < inferredTotal
    }
  };
}

async function fetchAllProspects(client, accountId, baseQuery, { totalLimit = MAX_ALL_PROSPECTS } = {}) {
  return fetchAllPages((pageQuery) => client.prospects(accountId, pageQuery), baseQuery, { totalLimit });
}

async function waitForProspectImport(client, accountId, startedPayload, {
  timeoutSeconds = DEFAULT_LOOKUP_TIMEOUT_SECONDS,
  pollIntervalSeconds = DEFAULT_LOOKUP_POLL_INTERVAL_SECONDS,
  sleepImpl = sleep
} = {}) {
  if (importFinished(startedPayload)) return startedPayload;

  const importId = startedPayload?.prefix_id;
  if (!importId) {
    throw new CommandError("Prospect import did not return an import id.");
  }

  const timeoutAt = Date.now() + (timeoutSeconds * 1000);
  let latest = startedPayload;

  while (Date.now() < timeoutAt) {
    await sleepImpl(pollIntervalSeconds * 1000);
    latest = await client.prospectImportStatus(accountId, importId);
    if (importFinished(latest)) return latest;
  }

  throw new CommandError(`Timed out after ${timeoutSeconds} seconds waiting for import ${importId}.`);
}

function importFinished(payload) {
  return payload?.ready === true || payload?.status === "completed" || payload?.status === "failed";
}

async function waitForProspectSequenceExportJob(client, accountId, prospectId, startedPayload, {
  timeoutSeconds = DEFAULT_WRITER_TEST_RUN_TIMEOUT_SECONDS,
  pollIntervalSeconds = DEFAULT_WRITER_TEST_RUN_POLL_INTERVAL_SECONDS,
  sleepImpl = sleep
} = {}) {
  const firstResult = sequenceExportJobResultPayload(startedPayload);
  if (firstResult) return firstResult;

  const reportId = startedPayload?.report?.prefix_id || startedPayload?.report?.id;
  if (!reportId) {
    throw new CommandError("Writer test run did not return a sequence export job id.");
  }
  if (sequenceExportJobFailed(startedPayload)) {
    throw new CommandError(writerTestRunJobFailureMessage(startedPayload, { reportId }));
  }

  const timeoutAt = Date.now() + (timeoutSeconds * 1000);
  let latest = startedPayload;

  while (Date.now() < timeoutAt) {
    await sleepImpl(pollIntervalSeconds * 1000);
    latest = await client.prospectSequenceExportJob(accountId, prospectId, reportId);
    const result = sequenceExportJobResultPayload(latest);
    if (result) return result;
    if (sequenceExportJobFailed(latest)) {
      throw new CommandError(writerTestRunJobFailureMessage(latest, { reportId }));
    }
  }

  throw new CommandError(`Timed out after ${timeoutSeconds} seconds waiting for writer test run ${reportId}. The server job may still finish. Check it with: audienti writer test-run show ${prospectId} ${reportId}`);
}

function sequenceExportJobResultPayload(payload) {
  if (payload?.report?.status !== "completed") return null;

  const result = payload?.content?.payload;
  if (!result || typeof result !== "object") return null;

  result.meta ||= {};
  result.meta.report_id = payload?.report?.prefix_id || payload?.report?.id || result.meta.report_id;
  return result;
}

function sequenceExportJobFailed(payload) {
  const status = payload?.report?.status || payload?.run?.status;
  return status === "failed" || status === "canceled";
}

function writerTestRunJobFailureMessage(payload, { reportId }) {
  const reason = payload?.content?.flat_payload?.error || payload?.error || "The sequence export job failed.";
  return `Writer test run ${reportId} failed: ${reason}`;
}

function renderWriterTestRunJobStatus(payload, context, { prospectId, reportId }) {
  const report = payload?.report || {};
  const run = payload?.run || {};
  const status = report.status || run.status || "unknown";

  writeLine(context.stdout, "Writer test run job");
  writeLine(context.stdout, `Report: ${display(report.prefix_id || reportId)} (${display(status)})`);
  if (report.stage) writeLine(context.stdout, `Stage: ${display(report.stage)}`);
  if (run.status) writeLine(context.stdout, `Run: ${display(run.status)}`);
  if (report.updated_at) writeLine(context.stdout, `Updated: ${display(report.updated_at)}`);

  const error = payload?.content?.flat_payload?.error || payload?.error;
  if (error) {
    writeLine(context.stdout, `Error: ${display(error)}`);
    return;
  }

  writeLine(context.stdout, `Not complete yet. Check later: audienti writer test-run show ${prospectId} ${report.prefix_id || reportId}`);
}

function parseProspectTotalLimit(value) {
  const parsed = normalizePositiveInteger(value);
  if (parsed === null) return MAX_ALL_PROSPECTS;

  return Math.min(parsed, MAX_ALL_PROSPECTS);
}

function normalizePositiveInteger(value) {
  if (value === undefined || value === null || value === "") return null;

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return parsed;
}

function normalizeOptionalPositiveInteger(value, flagName) {
  if (value === undefined || value === null || value === "") return undefined;

  const parsed = normalizePositiveInteger(value);
  if (parsed === null || String(parsed) !== String(value).trim()) {
    throw new CommandError(`${flagName} must be a positive integer.`);
  }

  return parsed;
}

function normalizeLookupType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "email" || normalized === "phone") return normalized;

  return null;
}

function contactLookupValue(payload, lookupType) {
  if (lookupType === "email") return firstValue(payload?.data?.emails);
  if (lookupType === "phone") return firstValue(payload?.data?.phones);

  return null;
}

async function readJsonPayload(filePath) {
  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    throw new CommandError(`Could not read payload file ${filePath}: ${error.message}`);
  }

  try {
    const payload = JSON.parse(contents);
    if (!payload || Array.isArray(payload) || typeof payload !== "object") {
      throw new Error("payload must be a JSON object");
    }
    return payload;
  } catch (error) {
    throw new CommandError(`Invalid JSON payload in ${filePath}: ${error.message}`);
  }
}

async function readHumanizerFile(filePath) {
  let bytes;
  try {
    bytes = await readFile(filePath);
  } catch (error) {
    throw new CommandError(`Could not read humanizer file ${filePath}: ${error.message}`);
  }

  let contents;
  try {
    contents = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CommandError(`Humanizer file ${filePath} must be valid UTF-8 text.`);
  }

  if (!contents.trim()) throw new CommandError("Humanizer file cannot be blank.");

  return contents;
}

async function readProspectImportBatchFile(filePath) {
  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    throw new CommandError(`Could not read import batch file ${filePath}: ${error.message}`);
  }

  return parseProspectImportBatch(contents, filePath);
}

function parseProspectImportBatch(contents, filePath = "batch file") {
  const trimmed = String(contents || "").trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") || (trimmed.startsWith("{") && !trimmed.includes("\n"))) {
    try {
      const parsed = JSON.parse(trimmed);
      return normalizeImportBatchRows(Array.isArray(parsed) ? parsed : [parsed], filePath);
    } catch (error) {
      throw new CommandError(`Invalid JSON import batch in ${filePath}: ${error.message}`);
    }
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  if (looksLikeCsvHeader(lines[0])) {
    return parseProspectImportCsv(lines, filePath);
  }

  const rows = lines.map((line, index) => {
    if (line.startsWith("{")) {
      try {
        return { ...JSON.parse(line), row: index + 1 };
      } catch (error) {
        throw new CommandError(`Invalid JSONL row ${index + 1} in ${filePath}: ${error.message}`);
      }
    }

    return { linkedin_url: line, row: index + 1 };
  });

  return normalizeImportBatchRows(rows, filePath);
}

function looksLikeCsvHeader(line) {
  const headers = parseCsvLine(line).map((header) => header.trim().toLowerCase());
  return headers.includes("linkedin_url") || headers.includes("url");
}

function parseProspectImportCsv(lines, filePath) {
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, headerIndex) => {
      row[header] = values[headerIndex] || "";
      return row;
    }, { row: index + 1 });
  });

  return normalizeImportBatchRows(rows, filePath);
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (character === "\"" && inQuotes && next === "\"") {
      current += "\"";
      index += 1;
    } else if (character === "\"") {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function normalizeImportBatchRows(rows, filePath) {
  return rows.map((row, index) => {
    const rowNumber = row?.row || index + 1;
    const normalized = typeof row === "string" ? { linkedin_url: row } : row;
    const linkedinUrl = normalized?.linkedin_url || normalized?.url;
    if (!linkedinUrl) throw new CommandError(`Missing linkedin_url on row ${rowNumber} in ${filePath}.`);

    const result = compactObject({
      row: rowNumber,
      linkedin_url: linkedinUrl,
      list_id: normalized.list_id,
      motion_id: normalized.motion_id,
      new_list_name: normalized.new_list_name,
      new_transition_name: normalized.new_transition_name,
      assigned_user_id: normalized.assigned_user_id || normalized.assigned_user
    });

    for (const field of ["new_list_name", "new_transition_name"]) {
      if (Object.prototype.hasOwnProperty.call(normalized, field)) result[field] = normalized[field];
    }

    return result;
  });
}

function writeLine(stream, text = "") {
  stream.write(`${text}\n`);
}

function writeJson(stream, value) {
  writeLine(stream, JSON.stringify(value, null, 2));
}

function renderUpdateCheck(payload, context) {
  writeLine(context.stdout, `Package: ${payload.package_name}`);
  writeLine(context.stdout, `Current version: ${display(payload.current_version, "-")}`);
  writeLine(context.stdout, `Latest version: ${display(payload.latest_version, "unknown")}`);

  if (payload.status === "update_available") {
    writeLine(context.stdout, "Status: update available");
    writeLine(context.stdout, `Update: ${payload.install_command}`);
  } else if (payload.status === "current") {
    writeLine(context.stdout, "Status: current");
  } else {
    writeLine(context.stdout, "Status: unknown");
    if (payload.error) writeLine(context.stdout, `Error: ${payload.error}`);
  }
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function renderLists(lists, context) {
  if (!Array.isArray(lists) || lists.length === 0) return writeLine(context.stdout, "No lists found.");

  writeLine(context.stdout, "LIST ID\tPROSPECTS\tNAME");
  for (const list of lists) {
    writeLine(context.stdout, `${display(list.prefix_id)}\t${display(list.prospect_count, 0)}\t${display(list.name)}`);
  }
}

function renderList(list, context) {
  writeLine(context.stdout, `List: ${display(list?.name)} (${display(list?.prefix_id)})`);
  writeLine(context.stdout, `Prospects: ${display(list?.prospect_count, 0)}`);
  if (Array.isArray(list?.tags)) writeLine(context.stdout, `Tags: ${display(list.tags.join(", "), "-")}`);
  if (list?.description) writeLine(context.stdout, `Description: ${list.description}`);
}

function renderListRoutingRules(payload, context) {
  const rules = Array.isArray(payload?.routing_rules) ? payload.routing_rules : [];
  if (rules.length === 0) return writeLine(context.stdout, "No routing rules found.");

  writeLine(context.stdout, "RULE ID\tPOSITION\tENABLED\tACTION\tTARGET\tNAME");
  for (const rule of rules) {
    writeLine(context.stdout, [
      display(rule.id),
      display(rule.position),
      rule.enabled ? "yes" : "no",
      display(rule.action_kind),
      routingRuleTargetLabel(rule),
      display(rule.name)
    ].join("\t"));
  }
}

function routingRuleTargetLabel(rule) {
  return rule?.target_account_user?.name ||
    rule?.target_account_user?.email ||
    rule?.target_list?.name ||
    "-";
}

function renderFindResults(payload, context) {
  const groups = [["People", payload?.people], ["Companies", payload?.companies], ["Experiments", payload?.experiments], ["Users", payload?.users]];
  if (groups.every(([, rows]) => !Array.isArray(rows) || rows.length === 0)) return writeLine(context.stdout, "Nothing found.");

  for (const [title, rows] of groups) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    writeLine(context.stdout, title);
    for (const row of rows) {
      writeLine(context.stdout, ["  " + display(row.name), display(row.detail, ""), display(row.path, "")].join("\t"));
    }
  }
}

function renderTags(tags, context) {
  if (!Array.isArray(tags) || tags.length === 0) return writeLine(context.stdout, "No tags found.");

  writeLine(context.stdout, "TAG\tICPS\tLISTS\tMOTIONS\tTOTAL");
  for (const tag of tags) {
    writeLine(
      context.stdout,
      [
        display(tag.name),
        display(tag.icp_count, 0),
        display(tag.list_count, 0),
        display(tag.motion_count, 0),
        display(tag.total_count, 0)
      ].join("\t")
    );
  }
}

function renderTagDetails(payload, context) {
  const icps = Array.isArray(payload?.icps) ? payload.icps : [];
  const lists = Array.isArray(payload?.lists) ? payload.lists : [];
  const motions = Array.isArray(payload?.motions) ? payload.motions : [];

  writeLine(context.stdout, `Tag: ${display(payload?.tag)}`);
  writeLine(context.stdout, `ICPs: ${icps.length}`);
  writeLine(context.stdout, `Lists: ${lists.length}`);
  writeLine(context.stdout, `Motions: ${motions.length}`);
  writeLine(context.stdout);
  writeLine(context.stdout, "ICPs");
  renderIcps(icps, context);
  writeLine(context.stdout);
  writeLine(context.stdout, "Lists");
  renderLists(lists, context);
  writeLine(context.stdout);
  writeLine(context.stdout, "Motions");
  renderMotions(motions, context);
}

function renderTasks(payload, context) {
  const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
  const meta = payload?.meta || {};

  writeLine(context.stdout, `Tasks: ${display(meta.status, "open")} (${display(tasks.length, 0)} shown, ${display(meta.open_count, 0)} open, ${display(meta.completed_count, 0)} completed)`);
  if (tasks.length === 0) return writeLine(context.stdout, "No tasks found.");

  writeAlignedTable(
    context,
    ["TASK ID", "STATUS", "DUE", "ASSOCIATION", "TITLE"],
    tasks.map((task) => [
      display(task.prefix_id || task.id),
      display(task.status_label || task.status),
      display(task.due_at, "-"),
      taskAssociationLabel(task),
      display(task.title)
    ])
  );

  for (const task of tasks) {
    if (task?.notes) writeLine(context.stdout, `${display(task.prefix_id || task.id)} description: ${task.notes}`);
  }
}

function taskAssociationLabel(task) {
  const association = task?.association || {};
  if (!association.type || association.type === "none") return "No association";

  const name = association.name || association.id;
  return `${association.type}:${display(name)}`;
}

function renderUsers(users, context) {
  if (!Array.isArray(users) || users.length === 0) return writeLine(context.stdout, "No account users found.");

  writeLine(context.stdout, "ACCOUNT USER ID\tCURRENT\tROLES\tNAME\tEMAIL");
  for (const user of users) {
    writeLine(
      context.stdout,
      [
        display(user.id),
        user.current ? "yes" : "no",
        display(Array.isArray(user.roles) && user.roles.length > 0 ? user.roles.join(",") : "member"),
        display(user.name),
        display(user.email)
      ].join("\t")
    );
  }
}

function renderUserActivity(payload, context) {
  const accountUser = payload?.account_user || {};
  const summary = payload?.summary || {};
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const pagination = payload?.pagination || {};

  writeLine(context.stdout, `User: ${display(accountUser.name || accountUser.email)} (${display(accountUser.id)})`);
  writeLine(context.stdout, `Window actions: ${display(summary.window_count, 0)}`);
  if (pagination.page || pagination.pages) {
    writeLine(context.stdout, `Page: ${display(pagination.page, 1)} of ${display(pagination.pages, 1)}`);
  }
  renderCountRows(context, "By platform", summary.by_platform);
  renderCountRows(context, "By action", summary.by_key);

  if (events.length === 0) return writeLine(context.stdout, "No activity events found.");

  writeLine(context.stdout, "TIME\tACTION\tPLATFORM\tPROSPECT\tCOMPANY\tDETAILS");
  for (const event of events) {
    writeLine(context.stdout, [
      display(event.occurred_at),
      display(event.action_label || event.key),
      display(event.platform),
      display(event.prospect?.name || event.prospect?.display_name || event.prospect?.prefix_id),
      display(event.prospect?.company),
      display(event.details)
    ].join("\t"));
  }
}

function renderUserAutomation(payload, context) {
  const accountUser = payload?.account_user || {};
  const socialCookie = payload?.social_cookie || {};
  const snapshot = payload?.current || payload?.after || {};
  const mode = payload?.applied === true ? "applied" : (payload?.preview === true ? "preview" : "current");
  const platform = socialCookie.service_identifier || "linkedin";

  writeLine(
    context.stdout,
    `Automation ${mode}: ${accountUserLabel(accountUser)} | ${platform} | policy ${display(snapshot.policy_source, "unknown")}`
  );
  renderUserAutomationSchedule(snapshot, context);
  renderUserAutomationControls(snapshot, context);
  renderUserAutomationLimits(snapshot?.limits, context);

  if (payload?.preview === true) {
    writeLine(context.stdout, "No changes applied. Review the preview, then rerun with --apply.");
  } else if (payload?.applied === true && payload?.audit_id) {
    writeLine(context.stdout, `Audit: ${payload.audit_id}`);
  }
}

function renderUserAutomationSchedule(snapshot, context) {
  if (!snapshot?.time_zone && snapshot?.in_working_hours === undefined) return;

  const parts = [display(snapshot.time_zone, "unknown timezone")];
  if (snapshot.in_working_hours !== undefined) {
    parts.push(snapshot.in_working_hours ? "in working hours" : "outside working hours");
  }
  if (snapshot.today_window?.summary) parts.push(`today ${snapshot.today_window.summary}`);
  writeLine(context.stdout, `Schedule: ${parts.join(" | ")}`);
}

function renderUserAutomationControls(snapshot, context) {
  const controls = snapshot?.controls || {};
  const entries = [
    ["automatic sending", controls.automatic_sending_enabled],
    ["visibility operations", controls.visibility_operations_autopilot_enabled],
    ["follow", controls.follow_autopilot_enabled],
    ["withdraw invitations", controls.withdraw_connection_autopilot_enabled],
    ["risk cooldown", snapshot?.risk_cooldown_enabled]
  ].filter(([, enabled]) => enabled !== undefined);
  if (entries.length === 0) return;

  writeLine(context.stdout, `Controls: ${entries.map(([label, enabled]) => `${label} ${enabled ? "on" : "off"}`).join(" | ")}`);
}

function renderUserAutomationLimits(limits, context) {
  const categories = Array.isArray(limits?.categories) ? limits.categories : [];
  const categorySummaries = categories.map(automationDailyLimitSummary).filter(Boolean);
  if (categorySummaries.length > 0) {
    writeLine(context.stdout, `Daily category limits: ${categorySummaries.join(" | ")}`);
  }

  const aggregateSummary = automationDailyLimitSummary(limits?.aggregate_visibility);
  if (aggregateSummary) writeLine(context.stdout, `Aggregate visibility: ${aggregateSummary.replace(/^Aggregate visibility\s+/i, "")}`);

  const bindingLimits = Array.isArray(limits?.binding_limits) ? limits.binding_limits.filter(Boolean) : [];
  if (bindingLimits.length > 0) writeLine(context.stdout, `Binding limits: ${bindingLimits.join(", ")}`);
}

function automationDailyLimitSummary(limit) {
  if (!limit || typeof limit !== "object") return null;

  const label = display(limit.label || limit.category, "Limit");
  const used = limit.used?.daily ?? limit.usage?.daily;
  const effective = limit.effective?.daily;
  const remaining = limit.remaining?.daily;
  if (used === undefined && effective === undefined && remaining === undefined) return null;

  return `${label} ${display(used, "?")}/${display(effective, "?")} daily (${display(remaining, "?")} remaining)`;
}

function renderSetupPlayPreflight(payload, context) {
  const accountUser = payload?.account_user || {};
  const socialCookie = payload?.social_cookie || null;
  const urls = socialCookie?.urls || {};

  writeLine(
    context.stdout,
    `Setup preflight: ${display(payload?.platform, "linkedin")} for ${display(accountUser.name || accountUser.email)} (${display(accountUser.id)})`
  );
  writeLine(context.stdout, `Status: ${payload?.ready ? "ready" : "blocked"} (${display(payload?.reason, "unknown")})`);
  renderSetupUserLocation(accountUser.location, context);

  if (socialCookie) {
    writeLine(
      context.stdout,
      `Connected account: ${display(socialCookie.username || socialCookie.name)} (${display(socialCookie.prefix_id)})`
    );
    writeLine(context.stdout, `Connection status: ${display(socialCookie.status)}`);
    writeLine(context.stdout, `Mapped to account: ${socialCookie.accessible_to_account ? "yes" : "no"}`);
    writeLine(context.stdout, `Actionable: ${socialCookie.actionable ? "yes" : "no"}`);
    if ((socialCookie.service_identifier || payload?.platform) === "linkedin") {
      renderSetupLinkedInCapabilities(socialCookie.capabilities?.linkedin, context);
    }
    renderSetupProxyLocation(socialCookie.proxy_location, context);
    renderSetupAutomationSummary(socialCookie.automation || {}, context);
  } else {
    writeLine(context.stdout, "Connected account: none");
  }

  if (!socialCookie && payload?.setup_url) {
    writeLine(context.stdout, `Setup URL: ${payload.setup_url}`);
  } else if (payload?.reason === "needs_account_access" && urls.mapping_url) {
    writeLine(context.stdout, `Mapping URL: ${urls.mapping_url}`);
  } else if (payload?.reason === "needs_reconnect" && urls.edit_url) {
    writeLine(context.stdout, `Edit URL: ${urls.edit_url}`);
  } else if (urls.edit_url) {
    writeLine(context.stdout, `Edit URL: ${urls.edit_url}`);
  }
}

function renderSocialCookieSync(payload, context) {
  const requestStatus = payload?.requested ? "accepted" : "not requested";
  const coalesced = payload?.coalesced ? " (coalesced)" : "";
  writeLine(context.stdout, `Email sync: ${requestStatus}${coalesced} for ${display(payload?.social_cookie_id)}`);
  if (payload?.reason) writeLine(context.stdout, `Reason: ${payload.reason}`);

  const states = Array.isArray(payload?.sync_states) ? payload.sync_states : [];
  if (states.length === 0) return writeLine(context.stdout, "No durable sync state returned.");

  writeLine(context.stdout, "FOLDER\tSTATUS\tGENERATION\tATTEMPTS\tDUE\tLAST SUCCESS\tLAST ERROR\tSYNCED THROUGH");
  for (const state of states) {
    writeLine(context.stdout, [
      display(state?.canonical_folder),
      display(state?.status),
      display(state?.generation, "0"),
      display(state?.attempts, "0"),
      display(state?.due_at),
      display(state?.last_success_at),
      display(state?.last_error_code),
      display(state?.last_synced_through_at)
    ].join("\t"));
  }
}

function renderSetupLinkedInCapabilities(capabilities, context) {
  const storedBoolean = (value) => value === true ? "yes" : value === false ? "no" : "unknown";
  writeLine(
    context.stdout,
    `LinkedIn capabilities (stored): Premium ${storedBoolean(capabilities?.premium)}, Sales Navigator ${storedBoolean(capabilities?.sales_navigator)}; last checked ${display(capabilities?.checked_at, "not recorded")}`
  );
}

function renderSetupAutomationSummary(automation, context) {
  const summary = [
    `autopilot ${automation.autopilot_enabled ? "on" : "off"}`,
    `automatic sending ${automation.automatic_sending_enabled ? "on" : "off"}`,
    `connection requests ${automation.connection_request_autopilot_enabled ? "on" : "off"}`
  ];

  writeLine(context.stdout, `Automation: ${summary.join(", ")}`);
  if (automation.time_zone || automation.today_window || automation.in_working_hours !== undefined) {
    writeLine(
      context.stdout,
      [
        `Working hours: ${display(automation.time_zone, "unknown timezone")}`,
        `today ${display(automation.today_window?.summary, "unknown")}`,
        `currently ${automation.in_working_hours ? "inside" : "outside"}`
      ].join(", ")
    );
  }
  renderSetupPacingSummary(automation.pacing, context);
}

function renderSetupUserLocation(location, context) {
  const country = location?.country_code || "not configured";
  const place = [location?.city, location?.state_code].filter(Boolean).join(", ");
  const details = [place, location?.time_zone].filter(Boolean).join("; ");
  writeLine(context.stdout, `User location: ${country}${details ? ` (${details})` : ""}`);
}

function renderSetupProxyLocation(proxyLocation, context) {
  const configured = proxyLocation?.configured || {};
  const configuredCountry = configured.country_code || "not configured";
  const configuredPlace = [configured.city, configured.state_code].filter(Boolean).join(", ");
  const configuredDetails = [configuredPlace, configured.postal_code].filter(Boolean).join(" ");
  writeLine(
    context.stdout,
    `Cookie proxy location: ${configuredCountry}${configuredDetails ? ` (${configuredDetails})` : ""}`
  );

  const effective = proxyLocation?.effective || {};
  const effectivePlace = [effective.country_code, effective.region, effective.city].filter(Boolean).join(", ");
  if (!effectivePlace && proxyLocation?.source && proxyLocation.source !== "unavailable") {
    writeLine(context.stdout, `Effective proxy: not verified (${proxyLocation.source})`);
    return;
  }
  if (!effectivePlace || proxyLocation?.source === "unavailable") {
    writeLine(context.stdout, "Effective proxy: unavailable");
    return;
  }

  const evidence = [proxyLocation?.source, effective.checked_at ? `checked ${effective.checked_at}` : null]
    .filter(Boolean)
    .join("; ");
  writeLine(context.stdout, `Effective proxy: ${effectivePlace}${evidence ? ` (${evidence})` : ""}`);
}

function renderSetupPacingSummary(pacing, context) {
  if (!pacing) return;

  const quotas = pacing.weekly_quotas || {};
  writeLine(
    context.stdout,
    [
      `Weekly quotas: profile visits ${formatSetupQuota(quotas.profile_visits)}`,
      `invitations ${formatSetupQuota(quotas.invitations)}`,
      `messages ${formatSetupQuota(quotas.messages)}`
    ].join(", ")
  );
  const motionActiveDays = Array.isArray(pacing.motion_active_days) ? pacing.motion_active_days : [];
  writeLine(context.stdout, `Motion active days: ${motionActiveDays.join(", ") || "none"}`);
  writeLine(context.stdout, `Outstanding invitation cap: ${display(pacing.outstanding_invitation_cap)}`);

  const ramp = pacing.ramp_config || {};
  writeLine(
    context.stdout,
    `Invitation ramp: ${display(ramp.starting_daily_invitations)}/day start, +${display(ramp.weekly_increment)}/week`
  );

  const current = pacing.current || {};
  const inventoryBlocked = Boolean(current.inventory_blocking_reason);
  writeLine(
    context.stdout,
    [
      `${inventoryBlocked ? "Invitation pacing headroom" : "Invitation capacity"}: ${display(current.daily_usage)} used today`,
      `${display(current.daily_target)} daily target`,
      `${display(current.ramp_limit_today)} ramp limit today`,
      `${display(current.effective_available)} ${inventoryBlocked ? "headroom" : "available"} (binding: ${display(current.binding_constraint)})`
    ].join(", ")
  );
  if (current.current_outstanding !== undefined || current.remaining_outstanding_slots !== undefined) {
    writeLine(
      context.stdout,
      `Outstanding invitations: ${display(current.current_outstanding)} current, ${display(current.remaining_outstanding_slots)} slots remaining`
    );
  }
  if (current.inventory_blocking_reason) {
    writeLine(context.stdout, `Invitation inventory: blocked (${current.inventory_blocking_reason})`);
  }
}

function formatSetupQuota(value) {
  if (value === null) return "unlimited";
  if (value === undefined) return "unknown";
  return display(value);
}

function renderCountRows(context, label, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  writeLine(context.stdout, `${label}: ${rows.map((row) => `${display(row.label || row.key)} ${display(row.count, 0)}`).join(" | ")}`);
}

function renderOffers(offers, context) {
  if (!Array.isArray(offers) || offers.length === 0) return writeLine(context.stdout, "No offers found.");

  writeLine(context.stdout, "OFFER ID\tNAME\tURL");
  for (const offer of offers) {
    writeLine(
      context.stdout,
      [
        display(offer.prefix_id),
        display(offer.name),
        display(offer.url)
      ].join("\t")
    );
  }
}

function renderOffer(offer, context) {
  writeLine(context.stdout, `Offer: ${display(offer?.name)} (${display(offer?.prefix_id)})`);
  if (offer?.description) writeLine(context.stdout, `Description: ${offer.description}`);
  if (offer?.url) writeLine(context.stdout, `URL: ${offer.url}`);
  if (Array.isArray(offer?.artifacts) && offer.artifacts.length > 0) renderOfferArtifacts(offer.artifacts, context);
  if (Array.isArray(offer?.gifts)) renderOfferGifts(offer.gifts, context);
  if (Array.isArray(offer?.insights)) renderOfferInsights(offer.insights, context);
}

const OFFER_GIFT_STATE_LABELS = { ready: "ready", needs_link: "needs a link", off: "off" };

function renderOfferGifts(gifts, context) {
  const rows = (Array.isArray(gifts) ? gifts : []).filter(Boolean);
  if (rows.length === 0) return writeLine(context.stdout, "No gifts.");

  writeLine(context.stdout, "GIFT ID\tSTATE\tTITLE\tSEND LINK\tWHO IT HELPS");
  for (const gift of rows) {
    writeLine(
      context.stdout,
      [
        display(gift.prefix_id || gift.id),
        display(OFFER_GIFT_STATE_LABELS[gift.state] || gift.state),
        display(gift.title),
        display(gift.send_url || gift.file?.filename, "-"),
        display(gift.summary, "-")
      ].join("\t")
    );
  }
}

function renderOfferInsights(insights, context) {
  const rows = (Array.isArray(insights) ? insights : []).filter(Boolean);
  if (rows.length === 0) return writeLine(context.stdout, "No insights.");

  writeLine(context.stdout, "INSIGHT ID\tSTATUS\tINSIGHT\tSOURCE");
  for (const insight of rows) {
    writeLine(
      context.stdout,
      [
        display(insight.id),
        insight.status === "active" ? "on" : insight.status === "inactive" ? "off" : display(insight.status),
        display(insight.content),
        display(insight.source_url || insight.source_label, "-")
      ].join("\t")
    );
  }
}

function renderOfferArtifacts(artifacts, context) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) return writeLine(context.stdout, "No artifacts attached.");

  writeLine(context.stdout, "ARTIFACT ID\tFILENAME\tTYPE\tBYTES");
  for (const artifact of artifacts) {
    writeLine(context.stdout, [display(artifact.id), display(artifact.filename), display(artifact.content_type, "-"), display(artifact.byte_size, 0)].join("\t"));
  }
}

function renderIcps(icps, context) {
  if (!Array.isArray(icps) || icps.length === 0) return writeLine(context.stdout, "No ICPs found.");

  writeLine(context.stdout, "ICP ID\tNAME\tSTATUS\tTAGS\tDISCOVERY KEYWORD\tSENIORITY MODE\tAGENT");
  for (const icp of icps) {
    writeLine(
      context.stdout,
      [
        display(icp.prefix_id),
        display(icp.name),
        icp.archived === true ? "archived" : "active",
        display(Array.isArray(icp.tags) && icp.tags.length > 0 ? icp.tags.join(",") : "-"),
        display(icp.discovery_keyword),
        display(icp.seniority_match_mode),
        display(icp.agent?.name)
      ].join("\t")
    );
  }
}

function renderIcp(icp, context) {
  writeLine(context.stdout, `ICP: ${display(icp?.name)} (${display(icp?.prefix_id)})`);
  writeLine(context.stdout, `Status: ${icp?.archived === true ? "archived" : "active"}`);
  if (Array.isArray(icp?.tags)) writeLine(context.stdout, `Tags: ${display(icp.tags.join(", "), "-")}`);
  if (icp?.notes) writeLine(context.stdout, `Notes: ${icp.notes}`);
  if (icp?.discovery_keyword) writeLine(context.stdout, `Discovery keyword: ${icp.discovery_keyword}`);
  if (icp?.seniority_match_mode) writeLine(context.stdout, `Seniority match mode: ${icp.seniority_match_mode}`);
  if (icp?.agent?.name) writeLine(context.stdout, `Agent: ${icp.agent.name}`);
}

function writeIcpLifecycleEffects(result, context) {
  const motions = Array.isArray(result?.primary_motions) ? result.primary_motions : [];
  if (motions.length > 0) {
    const counts = new Map();
    for (const motion of motions) counts.set(motion.status, (counts.get(motion.status) || 0) + 1);
    const summary = [...counts.entries()].map(([status, count]) => `${count} ${status}`).join(", ");
    writeLine(context.stdout, `Primary motions: ${summary}.`);
  } else {
    writeLine(context.stdout, "Primary motions: none.");
  }
  writeLine(context.stdout, `Secondary motion links preserved: ${display(result?.secondary_motion_count, 0)}.`);
}

function renderCompanies(payload, context) {
  const companies = Array.isArray(payload?.companies) ? payload.companies : [];
  if (companies.length === 0) return writeLine(context.stdout, "No companies found.");

  writeLine(context.stdout, "PROFILE ID\tCITATION ID\tNAME\tLINKEDIN\tINDUSTRY\tLOCATION");
  for (const company of companies) {
    writeLine(
      context.stdout,
      [
        display(company.prefix_id),
        display(company.citation_id),
        display(company.display_name || company.name),
        display(company.url),
        display(company.industry),
        display(company.location)
      ].join("\t")
    );
  }
}

function renderDncEntries(payload, context) {
  const entries = Array.isArray(payload?.dnc_entries) ? payload.dnc_entries : [];
  if (entries.length === 0) return writeLine(context.stdout, "No DNC entries found.");

  writeLine(context.stdout, "DNC ID\tKIND\tVALUE\tIDENTIFIER\tSOURCE\tPROSPECT");
  for (const entry of entries) {
    writeLine(
      context.stdout,
      [
        display(entry.prefix_id || entry.id),
        display(entry.key_kind),
        display(entry.canonical_value || entry.citation_id),
        display(entry.identifier),
        display(entry.source_kind),
        display(entry.prospect_id)
      ].join("\t")
    );
  }
}

function renderCompanyRules(payload, context) {
  const rules = Array.isArray(payload?.company_rules) ? payload.company_rules : [];
  if (rules.length === 0) return writeLine(context.stdout, "No company rules found.");

  writeLine(context.stdout, "RULE ID\tCOMPANY\tDOMAIN\tDISPOSITION\tSCOPE\tACTIVE");
  for (const rule of rules) {
    writeLine(
      context.stdout,
      [
        display(rule.prefix_id || rule.id),
        display(rule.name || rule.linkedin_company_identifier || rule.linkedin_company_url),
        display(rule.domain),
        display(rule.disposition),
        companyRuleScopeLabel(rule),
        rule.active ? "yes" : "no"
      ].join("\t")
    );
  }
}

function companyRuleScopeLabel(rule) {
  if (rule?.scope_kind === "account_user") {
    return `user:${display(rule.account_user_email || rule.account_user_id)}`;
  }

  return "account";
}

async function performBulkMutation(perform) {
  try {
    return { payload: await perform(), rejected: false };
  } catch (error) {
    if (error instanceof ApiError && error.status === 422 && Array.isArray(error.body?.failed)) {
      return { payload: error.body, rejected: true };
    }
    throw error;
  }
}

async function performProspectAccountMove(perform) {
  try {
    return { payload: await perform(), rejected: false };
  } catch (error) {
    const body = error instanceof ApiError && error.body && typeof error.body === "object" ? error.body : null;
    if (body && (body.schema_version !== undefined || body.error_kind !== undefined)) {
      return { payload: body, rejected: true };
    }
    throw error;
  }
}

function renderProspectAccountMove(payload, context, { applying }) {
  const phase = payload?.applied ? "applied" : "preview";
  writeLine(context.stdout, `Move account ${phase} for ${entityLabel(payload?.prospect)}.`);
  writeLine(context.stdout, `Source: ${entityLabel(payload?.source)}`);
  writeLine(context.stdout, `Target: ${entityLabel(payload?.target)}`);
  writeLine(context.stdout, `Eligible: ${payload?.eligible ? "yes" : "no"}`);
  writeLine(context.stdout, `Applied: ${payload?.applied ? "yes" : "no"}`);

  const source = payload?.source || {};
  const sourceLists = Array.isArray(source.lists) ? source.lists.map(entityLabel).filter(Boolean) : [];
  writeLine(context.stdout, `Current assignee: ${entityLabel(source.assigned_user) || "unassigned"}`);
  writeLine(context.stdout, `Current motion: ${entityLabel(source.motion) || "none"}`);
  writeLine(context.stdout, `Current lists: ${sourceLists.join(", ") || "none"}`);

  const mappings = payload?.mappings || {};
  writeLine(context.stdout, `Assigned user: ${entityLabel(mappings.assigned_user) || "not mapped"}`);
  writeLine(context.stdout, `Target motion: ${entityLabel(mappings.motion) || "not mapped"}`);
  writeLine(context.stdout, `Target list: ${entityLabel(mappings.list) || "not mapped"}`);

  renderProspectAccountMoveCounts("Last 30 days", payload?.summary_30_days, context);
  renderProspectAccountMoveCounts("All time", payload?.all_time_counts, context);

  for (const [disposition, counts] of Object.entries(payload?.dispositions || {})) {
    renderProspectAccountMoveCounts(humanize(disposition), counts, context);
  }
  renderProspectAccountMoveExpectedState(payload?.expected_state, context);
  renderProspectAccountMoveIssues("Blockers", payload?.blockers, context);
  renderProspectAccountMoveIssues("Warnings", payload?.warnings, context);
  if (payload?.refresh?.status) {
    writeLine(context.stdout, `Refresh: ${display(payload.refresh.status)}`);
  }
  if (payload?.error) writeLine(context.stdout, `Error: ${singleLine(payload.error)}`);

  if (!applying && payload?.success && !payload?.applied) {
    writeLine(context.stdout, "Run again with --apply to move this prospect.");
  } else if (applying && payload?.eligible !== true) {
    writeLine(context.stdout, "The preview is not eligible to apply.");
  } else if (applying && !payload?.applied) {
    writeLine(context.stdout, "The account move was not applied.");
  }
}

function renderProspectAccountMoveCounts(label, counts, context) {
  if (!counts || typeof counts !== "object") return;

  const entries = Object.entries(counts).filter(([, count]) => Number(count) !== 0);
  if (entries.length === 0) return;
  writeLine(context.stdout, `${label}: ${entries.map(([key, count]) => `${humanize(key)} ${display(count)}`).join(", ")}`);
}

function renderProspectAccountMoveIssues(label, issues, context) {
  if (!Array.isArray(issues) || issues.length === 0) return;

  writeLine(context.stdout, `${label}: ${issues.length}`);
  for (const issue of issues) {
    const message = typeof issue === "string" ? issue : issue?.message || issue?.error || issue?.reason || JSON.stringify(issue);
    writeLine(context.stdout, `- ${singleLine(message)}`);
  }
}

function renderProspectAccountMoveExpectedState(expectedState, context) {
  if (!expectedState || typeof expectedState !== "object") return;

  const source = expectedState.source || {};
  const target = expectedState.target || {};
  writeLine(
    context.stdout,
    `Expected source: account prospect ${source.account_prospect ? "present" : "absent"}, executable work ${source.executable_work ? "present" : "absent"}`
  );
  writeLine(
    context.stdout,
    `Expected target: account prospect ${target.account_prospect ? "present" : "absent"}, events ${display(target.event_count, 0)}`
  );
}

function renderBulkMutationResult(payload, context, { successLabel, zeroSuccessLabel }) {
  const failed = Array.isArray(payload?.failed) ? payload.failed : [];

  writeLine(context.stdout, successCount(payload) > 0 ? successLabel : zeroSuccessLabel);
  writeLine(context.stdout, `Failures: ${failed.length}`);

  failed.forEach((row) => {
    writeLine(context.stdout, `- ${display(row?.id, "unknown")}: ${display(row?.reason, "failed")}`);
  });
}

function renderMotions(motions, context) {
  if (!Array.isArray(motions) || motions.length === 0) return writeLine(context.stdout, "No motions found.");

  writeAlignedTable(context, ["MOTION ID", "STATUS", "KIND", "NAME"], motions.map(motionTableRow));
}

function motionTableRow(motion) {
  return [
    display(motion?.prefix_id),
    display(motion?.status),
    display(motion?.kind),
    display(motion?.name)
  ];
}

function renderMotion(motion, context) {
  writeLine(context.stdout, `Motion: ${display(motion?.name)} (${display(motion?.prefix_id)})`);
  writeLine(context.stdout, `Status: ${display(motion?.status)}`);
  writeLine(context.stdout, `Kind: ${display(motion?.kind)}`);
  writeLine(context.stdout, `Approach: ${display(motion?.approach, "not set")}`);
  writeLine(context.stdout, `Start date: ${display(motion?.starts_on, "not set")}`);
  writeLine(context.stdout, `End date: ${display(motion?.ends_on, "not set")}`);
  writeLine(context.stdout, `Maximum companies: ${display(motion?.maximum_company_count, "not set")}`);
  renderExecutableConfiguration(motion?.executable_configuration, context);
  if (motion?.offer?.name) writeLine(context.stdout, `Offer: ${motion.offer.name} (${display(motion.offer.prefix_id)})`);
  if (motion?.offer_gift?.title) writeLine(context.stdout, `Gift: ${motion.offer_gift.title} (${display(motion.offer_gift.prefix_id)})`);
  if (motion?.icp?.name) writeLine(context.stdout, `ICP: ${motion.icp.name} (${display(motion.icp.prefix_id)})`);
  if (motion?.list?.name) writeLine(context.stdout, `List: ${motion.list.name} (${display(motion.list.prefix_id)})`);
  writeLine(context.stdout, `Own-post engagement: ${motion?.own_post_engagement ? "enabled" : "disabled"}`);
  if (Array.isArray(motion?.inbound_channels)) writeLine(context.stdout, `Inbound channels: ${display(motion.inbound_channels.join(", "), "-")}`);
  renderMotionLopaProfiles(motion?.lopa_profiles, context);
  renderMotionSignalRows(motion?.signal_rows, context);
  renderMotionDiscoverySignals(motion?.discovery_signals, context);
  renderMotionAbmCompanies(motion, context, { showEmpty: false });
  if (Array.isArray(motion?.play_tags)) writeLine(context.stdout, `Tags: ${display(motion.play_tags.join(", "), "-")}`);
  if (motion?.principal_account_user?.id) {
    writeLine(
      context.stdout,
      `Principal: ${display(motion.principal_account_user.name || motion.principal_account_user.email)} (${display(motion.principal_account_user.id)})`
    );
  }
}

function renderMotionLopaProfiles(rows, context) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  writeLine(context.stdout, "LOPA profiles:");
  for (const row of rows) {
    writeLine(context.stdout, `- ${display(row.url)} (${display(row.source_type, "other")})`);
  }
}

function renderMotionSignalRows(rows, context) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  writeLine(context.stdout, "Signal rows:");
  for (const row of rows) {
    const filters = [
      row.company_signal_category ? `category=${row.company_signal_category}` : null,
      row.role_terms ? `roles=${singleLine(row.role_terms)}` : null,
      row.posting_language ? `posting_language=${singleLine(row.posting_language)}` : null,
      row.topics ? `topics=${singleLine(row.topics)}` : null
    ].filter(Boolean).join("; ");
    writeLine(context.stdout, `- ${display(row.scope)}: ${display(row.question)}${filters ? ` [${filters}]` : ""}`);
  }
}

function renderMotionDiscoverySignals(payload, context) {
  if (!payload || typeof payload !== "object") return;

  const rows = Array.isArray(payload?.signals) ? payload.signals : [];
  const counts = payload?.counts || {};
  const motionId = payload?.prefix_id ? ` (${display(payload.prefix_id)})` : "";

  writeLine(context.stdout, `Motion-owned discovery signals${motionId}: ${display(counts.total, "0")} total, ${display(counts.actionable, "0")} actionable, ${display(counts.inactive, "0")} inactive`);
  if (rows.length === 0) return;

  for (const row of rows) {
    const status = row.actionable ? "actionable" : display(row.status, "inactive");
    const sourceCounts = row.source_counts || {};
    const detail = [
      row.canonical_url || row.topic?.slug || row.source_key,
      `sources=${display(sourceCounts.total, "0")}/${display(sourceCounts.accepted, "0")}/${display(sourceCounts.rejected, "0")}`
    ].filter(Boolean).join("; ");
    writeLine(context.stdout, `- [${status}] ${display(row.type, "signal")}: ${display(row.label, "unnamed")} (${detail})`);
  }
}

function renderMotionAbmCompanies(payload, context, { showEmpty = true } = {}) {
  const rows = Array.isArray(payload?.abm_companies) ? payload.abm_companies : [];
  if (rows.length === 0) {
    if (showEmpty) writeLine(context.stdout, "No company filters found.");
    return;
  }

  writeAlignedTable(context, ["ROW ID", "KIND", "VALUE", "STATUS"], rows.map((row) => [
    display(row.id),
    display(row.kind),
    display(row.normalized_value || row.raw_value),
    display(row.status)
  ]));
}

function renderMotionProfileSignals(payload, context) {
  const rows = Array.isArray(payload?.profile_signals) ? payload.profile_signals : [];
  if (rows.length === 0) return writeLine(context.stdout, "No profile signals found.");

  writeAlignedTable(context, ["SIGNAL ID", "CATEGORY", "PROFILE", "STATUS"], rows.map((row) => [
    display(row.id),
    display(row.source_kind === "owned" ? "owned" : row.category),
    display(row.canonical_url),
    display(row.status)
  ]));
}

function renderMotionAbmCompanyErrors(payload, context) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  if (errors.length === 0) return;

  writeLine(context.stdout, "Errors:");
  for (const error of errors) {
    writeLine(context.stdout, `- ${display(error.input)}: ${display(error.error)}`);
  }
}

function renderContentPrograms(programs, context) {
  if (!Array.isArray(programs) || programs.length === 0) return writeLine(context.stdout, "No ContentOps programs found.");

  writeAlignedTable(context, ["PROGRAM ID", "OWNER", "STAGE", "BLOCKED", "CURRENT", "SCHEDULED", "STALE"], programs.map((program) => [
    display(program.prefix_id),
    display(program.owner?.name || program.owner?.email),
    display(program.stage),
    display(program.blocking_reason, "-"),
    display(program.current_piece?.prefix_id || program.current_piece?.piece_key, "-"),
    display(program.scheduled_piece?.prefix_id || program.scheduled_piece?.piece_key, "-"),
    program.plan_stale_motion_set ? "yes" : "no"
  ]));
}

function renderContentPlanRows(rows, context) {
  if (!Array.isArray(rows) || rows.length === 0) return writeLine(context.stdout, "No ContentOps plan rows found.");

  writeAlignedTable(context, ["DAY", "DATE", "MOTION", "STAGE", "STATUS", "TITLE"], rows.map((row) => [
    display(row.day_number),
    display(row.planned_publish_on, "-"),
    display(row.motion?.name || row.motion?.motion_prefix_id, "-"),
    display(row.stage, "-"),
    display(row.publish_status || row.workflow_phase, "-"),
    display(row.title)
  ]));
}

function renderContentWorkItem(item, context) {
  writeLine(context.stdout, `Content item: ${display(item?.title)} (${display(item?.prefix_id)})`);
  writeLine(context.stdout, `Stage: ${display(item?.stage)}`);
  writeLine(context.stdout, `Blocking: ${display(item?.blocking_reason, "-")}`);
  if (item?.motion?.name || item?.motion?.motion_prefix_id) writeLine(context.stdout, `Motion: ${display(item.motion.name || item.motion.motion_prefix_id)}`);
  if (item?.scheduled_at) writeLine(context.stdout, `Scheduled: ${item.scheduled_at}`);
  if (item?.permalink) writeLine(context.stdout, `Permalink: ${item.permalink}`);
  if (item?.finalized_content) {
    writeLine(context.stdout, "");
    writeLine(context.stdout, item.finalized_content);
  }
}

function renderContentComments(comments, context) {
  if (!Array.isArray(comments) || comments.length === 0) return writeLine(context.stdout, "No ContentOps comment tasks found.");

  writeAlignedTable(context, ["TASK ID", "STATUS", "COMMENTER", "FIT", "OUTCOME", "COMMENT"], comments.map((comment) => [
    display(comment.prefix_id),
    display(comment.status),
    display(comment.commenter?.name),
    display(comment.fit_badge?.status || comment.fit_badge, "-"),
    display(comment.promotion_outcome, "-"),
    display(truncateCliText(comment.comment_body, 80))
  ]));
}

function renderMotionStatus(status, context) {
  writeLine(context.stdout, `Motion: ${display(status?.name)} (${display(status?.prefix_id)})`);
  writeLine(context.stdout, `State: ${display(status?.state)}`);
  writeLine(context.stdout, `Reason: ${display(status?.reason_label || status?.reason_key)}`);
  renderExecutableConfiguration(status?.executable_configuration, context);
  if (status?.description) writeLine(context.stdout, status.description);
  if (status?.action?.label) writeLine(context.stdout, `Action: ${status.action.label}`);
  renderDiscoveryRunReceipt(status?.discovery_run, context);
  if (status?.next_eligible_at) writeLine(context.stdout, `Retry at: ${status.next_eligible_at}`);
  if (Number(status?.enrichment_failed_prospect_count) > 0) {
    writeLine(context.stdout, `Enrichment failed (retries exhausted): ${status.enrichment_failed_prospect_count} prospects`);
  }
}

function renderExecutableConfiguration(config, context) {
  if (!config || typeof config !== "object") return;

  writeLine(context.stdout, `Valid config: ${config.valid ? "yes" : "no"}`);
  if (!config.valid && (config.reason_label || config.reason_key)) {
    writeLine(context.stdout, `Config reason: ${display(config.reason_label || config.reason_key)}`);
  }
  if (!config.valid && config.description) {
    writeLine(context.stdout, `Config detail: ${config.description}`);
  }
}

function renderProspects(payload, context, { wide = false, profiles = false } = {}) {
  const prospects = Array.isArray(payload?.prospects) ? payload.prospects : [];
  if (prospects.length === 0) return writeLine(context.stdout, "No prospects found.");
  const profileIdentifiers = profiles ? profileIdentifiersForPayload(payload, prospects) : [];

  if (wide) {
    const headers = ["PROSPECT ID", "STAGE", "STATUS", "FIT SCORE", "NAME", "TITLE", "COMPANY", "EMAIL", "LINKEDIN", "MOTION", "LISTS"];
    if (profiles) headers.push(...profileIdentifiers, ...profileIdentifiers.map((identifier) => `${identifier}_url`));
    headers.push("NEXT ACTION", "UPDATED AT");
    writeLine(context.stdout, headers.join("\t"));
    for (const prospect of prospects) {
      const row = [
        display(prospect.prefix_id),
        display(prospect.account_prospect?.pipeline_stage),
        display(prospect.account_prospect?.status),
        display(prospect.account_prospect?.fit_score),
        display(prospect.display_name || prospect.name),
        display(prospect.title),
        display(prospect.company),
        display(prospect.email),
        display(prospect.linkedin_url),
        display(prospect.account_prospect?.motion?.name),
        display((prospect.lists || []).map((list) => list.name).join(" | "))
      ];
      if (profiles) {
        row.push(...profileIdentifiers.map((identifier) => display(profileCitationIdsForIdentifier(prospect, identifier))));
        row.push(...profileIdentifiers.map((identifier) => display(profileUrlsForIdentifier(prospect, identifier))));
      }
      row.push(display(nextActionLabel(prospect.queue)), display(prospect.updated_at));
      writeLine(context.stdout, row.join("\t"));
    }
    return;
  }

  const headers = ["PROSPECT ID", "STAGE", "NAME", "COMPANY"];
  if (profiles) headers.push(...profileIdentifiers);
  headers.push("NEXT ACTION");
  writeLine(context.stdout, headers.join("\t"));
  for (const prospect of prospects) {
    const row = [
      display(prospect.prefix_id),
      display(prospect.account_prospect?.pipeline_stage),
      display(prospect.display_name || prospect.name),
      display(prospect.company)
    ];
    if (profiles) row.push(...profileIdentifiers.map((identifier) => display(profileCitationIdsForIdentifier(prospect, identifier))));
    row.push(display(nextActionLabel(prospect.queue)));
    writeLine(context.stdout, row.join("\t"));
  }
}

function renderProspectCheck(payload, context) {
  const prospects = Array.isArray(payload?.prospects) ? payload.prospects : [];
  const totalCount = display(payload?.meta?.total_count, prospects.length);
  if (prospects.length === 0) return writeLine(context.stdout, "No suspect prospects found.");

  writeLine(context.stdout, `Suspect prospects: ${totalCount}`);
  writeLine(context.stdout, "PROSPECT ID\tSTAGE\tNAME\tREPORTED COMPANY\tCERTIFIED\tREASON\tURL");
  for (const prospect of prospects) {
    const certification = prospect.company_certification || {};
    writeLine(context.stdout, [
      display(prospect.prefix_id),
      display(prospect.account_prospect?.pipeline_stage),
      display(prospect.display_name || prospect.name),
      display(certification.reported_company || prospect.company),
      certification.status === "certified" ? "yes" : "no",
      display(certification.reason, "missing_employment_citation"),
      display(prospect.app_url)
    ].join("\t"));
  }
}

function renderProspect(prospect, context) {
  writeLine(context.stdout, `Prospect: ${display(prospect?.display_name || prospect?.name)} (${display(prospect?.prefix_id)})`);
  if (prospect?.company) writeLine(context.stdout, `Company: ${prospect.company}`);
  if (prospect?.title) writeLine(context.stdout, `Title: ${prospect.title}`);
  if (prospect?.linkedin_url) writeLine(context.stdout, `LinkedIn: ${prospect.linkedin_url}`);
  if (prospect?.account_prospect?.pipeline_stage) writeLine(context.stdout, `Stage: ${prospect.account_prospect.pipeline_stage}`);
  if (nextActionLabel(prospect?.queue)) writeLine(context.stdout, `Next action: ${nextActionLabel(prospect.queue)}`);
}

function renderProspectReplan(payload, context) {
  const prospect = payload?.prospect || {};
  const current = payload?.current || {};
  const replanned = payload?.replanned || {};
  const status = replanStatusLabel(payload);
  const reason = payload?.reason_code || payload?.refresh?.reason;

  writeLine(context.stdout, `Replan ${status} for ${display(prospect.display_name || prospect.name)} (${display(prospect.prefix_id)}).`);
  writeLine(context.stdout, `Changed: ${payload?.changed ? "yes" : "no"}`);
  if (reason) writeLine(context.stdout, `Reason: ${reason}`);
  writeLine(context.stdout, `Current: ${formatCoachAction(current.next_action)}`);
  writeLine(context.stdout, `Replanned: ${formatCoachAction(replanned.next_action)}`);
  if (replanned.rationale) writeLine(context.stdout, `Rationale: ${replanned.rationale}`);
  if (replanned.guidance) writeLine(context.stdout, `Guidance: ${replanned.guidance}`);
  if (payload?.status === "dry_run") {
    writeLine(context.stdout, "Run again with --apply to persist this plan.");
  } else if (payload?.status === "coach_error") {
    writeLine(context.stdout, "The plan was not persisted. Fix the coach error and rerun with --apply.");
  } else if (payload?.status === "pending") {
    writeLine(context.stdout, "The replan request was recorded but is not applied yet. Retry after the refresh reason clears.");
  } else if (payload?.status === "busy") {
    writeLine(context.stdout, "Planner execution is busy. No replan was applied; retry later.");
  } else if (payload?.status === "failed") {
    writeLine(context.stdout, "The request was recorded, but the Planner could not apply it. Review the reason before retrying.");
  } else if (payload?.status === "evaluation_error") {
    writeLine(context.stdout, "Planner evaluation failed. Fix the evaluation error and rerun with --apply.");
  } else if (payload?.status === "not_applied") {
    writeLine(context.stdout, "The plan was not persisted. Review the reason before retrying.");
  }
}

function renderProspectReenrich(payload, context) {
  const prospect = payload?.prospect || {};
  const profile = payload?.profile || {};
  const completeness = payload?.completeness || {};
  const enrichment = payload?.enrichment || {};
  const status = payload?.status === "queued" ? "queued" : (payload?.status === "not_queued" ? "not queued" : "dry run");

  writeLine(context.stdout, `Re-enrich ${status} for ${display(prospect.display_name || prospect.name)} (${display(prospect.prefix_id)}).`);
  writeLine(context.stdout, `Profile: ${display(profile.prefix_id)} ${display(profile.identifier)} ${display(profile.url)}`);
  writeLine(context.stdout, `Profile status: ${display(profile.status)}`);
  writeLine(context.stdout, `Thin profile signals: ${completeness.thin_profile_signals ? "yes" : "no"}`);
  writeLine(context.stdout, `Experience entries: ${sumObjectValues(completeness.experience_counts)}`);
  writeLine(context.stdout, `Substantive bio length: ${display(completeness.substantive_bio_length, 0)}`);
  if (profile.invalid_reason) writeLine(context.stdout, `Invalid reason: ${profile.invalid_reason}`);
  if (enrichment.retry_counter_reset) writeLine(context.stdout, "A stale enrichment retry counter will be cleared.");
  if (enrichment.next_enrichment_at) writeLine(context.stdout, `Next enrichment at: ${enrichment.next_enrichment_at}`);
  if (payload?.status === "dry_run") writeLine(context.stdout, "Run again with --apply to queue full enrichment.");
  if (payload?.status === "not_queued") writeLine(context.stdout, "The profile was not queued, usually because an active enrichment is already running.");
}

function renderProspectRefreshQueue(payload, context) {
  const prospect = payload?.prospect || {};
  const draftCache = payload?.draft_cache || {};
  const coachCache = payload?.coach_cache || {};
  const refresh = payload?.queue_refresh || {};
  const status = payload?.status === "applied" ? "applied" : "dry run";

  writeLine(context.stdout, `Refresh queue ${status} for ${display(prospect.display_name || prospect.name)} (${display(prospect.prefix_id)}).`);
  writeLine(context.stdout, `Coach cache: ${coachCache.present ? "present" : "empty"}`);
  if (coachCache.evaluated_at) writeLine(context.stdout, `Coach evaluated at: ${coachCache.evaluated_at}`);
  writeLine(context.stdout, `Draft cache rows: ${display(draftCache.count, 0)}`);
  writeLine(context.stdout, `Draft statuses: ${formatObjectCounts(draftCache.by_status)}`);
  writeLine(context.stdout, `Action types: ${Array.isArray(draftCache.action_types) && draftCache.action_types.length > 0 ? draftCache.action_types.join(", ") : "none"}`);
  if (payload?.applied) {
    writeLine(context.stdout, `Deleted draft rows: ${display(draftCache.deleted_count, 0)}`);
    writeLine(context.stdout, `Draft prewarm queued: ${display(refresh?.draft_prewarm?.enqueued_rows, 0)}`);
  } else {
    writeLine(context.stdout, "Run again with --apply to clear coach/draft cache and rebuild the queue row.");
  }
}

function sumObjectValues(value) {
  if (!value || typeof value !== "object") return 0;

  return Object.values(value).reduce((sum, item) => sum + Number(item || 0), 0);
}

function formatObjectCounts(value) {
  if (!value || typeof value !== "object" || Object.keys(value).length === 0) return "none";

  return Object.entries(value)
    .map(([key, count]) => `${key}:${count}`)
    .join(", ");
}

const REPLAN_STATUS_LABELS = Object.freeze({
  dry_run: "dry run",
  coach_error: "coach error",
  not_applied: "not applied",
  pending: "pending",
  busy: "busy",
  failed: "failed",
  evaluation_error: "evaluation error"
});

function replanStatusLabel(payload) {
  const rawStatus = payload?.status;
  if (Object.prototype.hasOwnProperty.call(REPLAN_STATUS_LABELS, rawStatus)) {
    return REPLAN_STATUS_LABELS[rawStatus];
  }

  return payload?.applied ? "applied" : "not applied";
}

function formatCoachAction(nextAction = {}) {
  const action = nextAction?.label || nextAction?.type || "none";
  const mode = nextAction?.request_mode || nextAction?.mode;
  const timing = nextAction?.timing?.mode;
  const details = compactText([mode, timing]).join(", ");

  return details ? `${action} (${details})` : action;
}

function renderProspectDisposition(payload, context, { action }) {
  const prospect = payload?.prospect || {};
  const accountProspect = payload?.account_prospect || {};
  const actionLabel = {
    reject: "Rejected",
    nurture: "Moved to nurture",
    restore: "Restored",
    "set-status": "Set status for",
    lock: "Locked",
    unlock: "Unlocked"
  }[action] || display(payload?.status, "Updated");

  writeLine(context.stdout, `${actionLabel} prospect ${display(prospect.display_name || prospect.name)} (${display(prospect.prefix_id)}).`);
  if (accountProspect.status) writeLine(context.stdout, `Status: ${accountProspect.status}`);
  if (accountProspect.inactive_reason) writeLine(context.stdout, `Inactive reason: ${accountProspect.inactive_reason}`);
  if (accountProspect.locked_at) writeLine(context.stdout, `Locked at: ${accountProspect.locked_at}`);
  if (accountProspect.lock_kind) writeLine(context.stdout, `Lock kind: ${accountProspect.lock_kind}`);
  if (accountProspect.lock_note) writeLine(context.stdout, `Lock note: ${accountProspect.lock_note}`);
  if (payload?.system_list?.name) writeLine(context.stdout, `List: ${payload.system_list.name} (${display(payload.system_list.prefix_id)})`);
}

function renderProspectTimeline(payload, context) {
  const prospect = payload?.prospect || {};
  const timeline = Array.isArray(payload?.timeline) ? payload.timeline : [];

  writeLine(context.stdout, `Prospect: ${display(prospect.display_name || prospect.name)} (${display(prospect.prefix_id)})`);
  if (timeline.length === 0) {
    writeLine(context.stdout, "No timeline items found.");
    return;
  }

  writeLine(context.stdout, "OCCURRED AT\tTYPE\tTEXT\tURL");
  for (const item of timeline) {
    writeLine(context.stdout, [
      display(item.occurred_at),
      display(item.type),
      display(item.text),
      display(item.url)
    ].join("\t"));
  }
}

function renderProspectMessageTypes(payload, context) {
  const surfaces = Array.isArray(payload?.message_surfaces) ? payload.message_surfaces : [];
  const prospect = payload?.prospect || {};

  writeLine(context.stdout, `Prospect: ${display(prospect.display_name || prospect.name)} (${display(prospect.prefix_id)})`);
  if (surfaces.length === 0) {
    writeLine(context.stdout, "No message types found.");
    return;
  }

  writeLine(context.stdout, "TYPE\tAVAILABLE\tMESSAGE TYPE\tSTAGE\tCHANNEL");
  for (const surface of surfaces) {
    writeLine(context.stdout, [
      display(surface.key),
      surface.available ? "yes" : "no",
      display(surface.canonical_message_type),
      display(surface.stage),
      display(surface.channel)
    ].join("\t"));
    if (!surface.available && surface.missing_reason) {
      writeLine(context.stdout, `  reason: ${surface.missing_reason}`);
    }
  }
}

function renderProspectMessage(payload, context) {
  const prospect = payload?.prospect || {};
  const surface = payload?.message_surface || {};

  writeLine(context.stdout, `Prospect: ${display(prospect.display_name || prospect.name)} (${display(prospect.prefix_id)})`);
  writeLine(context.stdout, `Type: ${display(surface.key)}`);
  writeLine(context.stdout, `Message type: ${display(surface.canonical_message_type)}`);
  writeLine(context.stdout, `Stage: ${display(surface.stage)}`);
  writeLine(context.stdout, `Channel: ${display(surface.channel)}`);
  writeLine(context.stdout, `Available: ${surface.available ? "yes" : "no"}`);
  writeLine(context.stdout, `Status: ${display(surface.status)}`);

  if (surface.subject) writeLine(context.stdout, `Subject: ${surface.subject}`);
  if (surface.body) {
    writeLine(context.stdout, "Body:");
    writeLine(context.stdout, surface.body);
  }
  if (!surface.body && surface.empty_body_reason) writeLine(context.stdout, `Empty body reason: ${surface.empty_body_reason}`);
  if (!surface.available && surface.missing_reason) writeLine(context.stdout, `Missing reason: ${surface.missing_reason}`);
}

function renderProspectNote(payload, context) {
  const prospect = payload?.prospect || {};
  const note = payload?.note || {};
  const event = payload?.event || {};

  writeLine(context.stdout, `Prospect: ${display(prospect.display_name || prospect.name)} (${display(prospect.prefix_id)})`);
  writeLine(context.stdout, `Type: ${display(note.note_type)}`);
  writeLine(context.stdout, `Tracked as engagement: ${note.tracked_as_engagement ? "yes" : "no"}`);
  if (note.engagement_key) {
    const engagementLabel = note.engagement_label ? `${note.engagement_label} (${note.engagement_key})` : note.engagement_key;
    writeLine(context.stdout, `Engagement: ${engagementLabel}`);
  }
  if (event.prefix_id) writeLine(context.stdout, `Event: ${event.prefix_id} (${display(event.key)})`);
  if (note.message) {
    writeLine(context.stdout, "Message:");
    writeLine(context.stdout, note.message);
  }
}

function renderProspectProfileMutation(payload, context, { action }) {
  const prospect = payload?.prospect || {};
  const profile = payload?.profile || {};
  const status = payload?.status ? ` (${payload.status})` : "";

  writeLine(context.stdout, `${action} profile${status}.`);
  writeLine(context.stdout, `Prospect: ${display(prospect.display_name || prospect.name)} (${display(prospect.prefix_id)})`);
  writeLine(context.stdout, `Profile: ${display(profile.citation_id || profile.prefix_id)}`);
  if (profile.identifier) writeLine(context.stdout, `Type: ${profile.identifier}`);
  if (profile.username) writeLine(context.stdout, `Username: ${profile.username}`);
  if (profile.url) writeLine(context.stdout, `URL: ${profile.url}`);
}

function renderProspectSequencePreview(payload, context, { title = "Sequence preview" } = {}) {
  const prospect = payload?.prospect || {};
  const report = payload?.report || {};
  const preview = report?.last_preview || {};
  const selected = report?.selected || {};
  const summary = report?.summary || {};
  const steps = Array.isArray(report?.steps) ? report.steps : [];
  const contextInfo = payload?.context || {};

  writeLine(context.stdout, title);
  writeLine(context.stdout, `Prospect: ${display(prospect.display_name || selected.prospect_name)} (${display(prospect.prefix_id || selected.prospect_id)})`);
  if (contextInfo.source) writeLine(context.stdout, `Context: ${contextInfo.source}`);
  if (contextInfo.message) writeLine(context.stdout, contextInfo.message);
  if (selected.motion_name) writeLine(context.stdout, `Motion: ${selected.motion_name}`);
  if (selected.agent_name) writeLine(context.stdout, `Agent: ${selected.agent_name}`);
  if (selected.offer_name) writeLine(context.stdout, `Offer: ${selected.offer_name}`);
  if (summary.channel_sequence?.length) writeLine(context.stdout, `Channels: ${summary.channel_sequence.join(" -> ")}`);
  if (summary.total_duration_days !== undefined) writeLine(context.stdout, `Duration days: ${summary.total_duration_days}`);
  if (report.preview_history_count !== undefined) writeLine(context.stdout, `Preview runs: ${report.preview_history_count}`);
  if (preview.generated_at) writeLine(context.stdout, `Generated at: ${preview.generated_at}`);
  if (report.status) writeLine(context.stdout, `Status: ${report.status}`);

  if (steps.length === 0) {
    writeLine(context.stdout, "No sequence steps were generated.");
    return;
  }

  writeLine(context.stdout, "");
  writeLine(context.stdout, "Sequence:");

  steps.forEach((step, index) => renderSequenceStep(step, index, context));
}

function renderWriterTestRun(payload, context) {
  const prospect = payload?.prospect || {};
  const branches = Array.isArray(payload?.branches) ? payload.branches : [];
  const draftMode = payload?.meta?.draft_mode || "all";
  const targetStep = payload?.meta?.target_step;

  writeLine(context.stdout, "Writer campaign simulator");
  writeLine(context.stdout, `Prospect: ${display(prospect.display_name || prospect.name)} (${display(prospect.prefix_id)})`);
  if (payload?.meta?.report_id) writeLine(context.stdout, `Report: ${display(payload.meta.report_id)}`);
  if (payload?.context?.source) writeLine(context.stdout, `Context: ${payload.context.source}`);
  if (payload?.context?.message) writeLine(context.stdout, payload.context.message);
  if (payload?.context?.motion_name) writeLine(context.stdout, `Motion: ${payload.context.motion_name}`);
  if (payload?.context?.agent_name) writeLine(context.stdout, `Agent: ${payload.context.agent_name}`);
  if (payload?.context?.offer_name) writeLine(context.stdout, `Offer: ${payload.context.offer_name}`);
  writeLine(context.stdout, `Mode: ${display(draftMode)}`);
  if (targetStep) writeLine(context.stdout, `Target step: ${display(targetStep)}`);
  writeLine(context.stdout, `Start: ${isoDate(currentDate(context))}`);
  writeLine(context.stdout, "DATE: step execution date; for WAIT rows, the wait clears on that date.");
  writeLine(context.stdout, "Scenario: simulate the full path if the prospect does not reply.");
  if (draftMode === "plan") {
    writeLine(context.stdout, "Drafts are skipped; this run only plans the path and context.");
  } else if (draftMode === "target") {
    writeLine(context.stdout, "Only the target step is drafted; later steps are omitted.");
  } else {
    writeLine(context.stdout, "This can take a while because the writer drafts every message step.");
  }

  if (branches.length === 0) {
    writeLine(context.stdout, "No simulator branches were generated.");
    return;
  }

  for (const branch of branches) {
    const steps = Array.isArray(branch.steps) ? branch.steps : [];
    const summary = branch.summary || {};
    writeLine(context.stdout, "");
    writeLine(context.stdout, `${display(branch.label)} (${display(branch.key)})`);
    if (summary.channel_sequence?.length) writeLine(context.stdout, `Channels: ${summary.channel_sequence.join(" -> ")}`);
    if (summary.total_duration_days !== undefined) writeLine(context.stdout, `Duration days: ${summary.total_duration_days}`);
    if (summary.terminal_disposition) writeLine(context.stdout, `Terminal disposition: ${summary.terminal_disposition}`);

    if (steps.length === 0) {
      writeLine(context.stdout, "No steps.");
      continue;
    }

    renderWriterStepTable(steps, context);
    if (draftMode === "target") renderWriterTargetDraft(branch, context);
  }
}

function renderWriterStepTable(steps, context) {
  writeLine(context.stdout, "#   DATE        DOW  TYPE  ACTION                                      CH       STATUS");
  writeLine(context.stdout, "--  ----------  ---  ----  ------------------------------------------  -------  ---------");
  steps.forEach((step, index) => renderWriterStepRow(step, index, context));
}

function renderWriterStepRow(step, index, context) {
  const stepDate = writerStepDate(step, context);
  const row = [
    fixedWidth(index + 1, 2, { align: "right" }),
    fixedWidth(stepDate, 10),
    fixedWidth(writerStepDow(stepDate), 3),
    fixedWidth(compactKindLabel(step.kind), 4),
    fixedWidth(writerStepAction(step), 42),
    fixedWidth(compactChannelLabel(step.channel), 7),
    fixedWidth(compactWriterStatusLabel(step.status), 9)
  ].join("  ");
  writeLine(context.stdout, row);
}

function renderWriterTargetDraft(branch, context) {
  const steps = Array.isArray(branch.steps) ? branch.steps : [];
  const resolvedTargetStep = String(branch.resolved_target_step || "").trim();
  const draftedStep = steps.find((step) => step?.kind === "message" && step?.key === resolvedTargetStep) ||
    [...steps].reverse().find((step) => step?.kind === "message" && (step.body || step.text || step.subject));
  if (!draftedStep) return;

  writeLine(context.stdout, "");
  writeLine(context.stdout, `Drafted copy: ${display(draftedStep.stage)}${branch.resolved_target_step ? ` (${branch.resolved_target_step})` : ""}`);
  const targetUrl = writerDraftTargetUrl(draftedStep);
  if (targetUrl) writeLine(context.stdout, `Replying to: ${targetUrl}`);
  if (draftedStep.status && draftedStep.status !== "success") writeLine(context.stdout, `Status: ${draftedStep.status}`);
  if (String(draftedStep.status || "") === "quality_failure") {
    const qualityCodes = Array.isArray(draftedStep.quality_codes) ? draftedStep.quality_codes.filter(Boolean) : [];
    if (qualityCodes.length) writeLine(context.stdout, `Quality failure: ${qualityCodes.join(", ")}`);
    if (draftedStep.blank_reason) writeLine(context.stdout, `Blank reason: ${draftedStep.blank_reason}`);
    if (draftedStep.writer_path) writeLine(context.stdout, `Writer path: ${draftedStep.writer_path}`);
    if (draftedStep.writer_engine) writeLine(context.stdout, `Writer engine: ${draftedStep.writer_engine}`);
  }
  for (const warning of Array.isArray(draftedStep.warnings) ? draftedStep.warnings : []) {
    if (warning) writeLine(context.stdout, `Warning: ${warning}`);
  }
  if (draftedStep.missing_reason) writeLine(context.stdout, `Missing reason: ${draftedStep.missing_reason}`);
  if (draftedStep.subject) writeLine(context.stdout, `Subject: ${draftedStep.subject}`);
  const body = draftedStep.body || draftedStep.text || draftedStep.empty_body_reason;
  writeLine(context.stdout, display(body || "No draft body returned."));
}

function writerDraftTargetUrl(step) {
  const target = step?.target || {};
  return target.post_url || target.comment_url || target.url || null;
}

function writerStepDate(step, context) {
  if (step?.timing?.mode === "scheduled") return dateOnlyLabel(step?.timing?.scheduled_for);
  return String(display(step.kind)).toLowerCase() === "terminal" ? "after" : isoDate(currentDate(context));
}

function writerStepDow(dateLabel) {
  const date = parseDateOnlyLabel(dateLabel);
  return date ? DAY_OF_WEEK_LABELS[date.getUTCDay()] : "";
}

function dateOnlyLabel(value) {
  const raw = String(display(value)).trim();
  return raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || raw;
}

function parseDateOnlyLabel(value) {
  const match = String(display(value)).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function writerStepAction(step) {
  return display(step.stage || step.key);
}

function compactKindLabel(kind) {
  const value = String(display(kind)).toLowerCase();
  if (value === "message") return "MSG";
  if (value === "action") return "ACT";
  if (value === "event") return "EVT";
  if (value === "terminal") return "END";
  if (value === "wait") return "WAIT";
  return display(kind).toUpperCase();
}

function compactChannelLabel(channel) {
  const value = String(display(channel));
  if (value === "LinkedIn") return "LI";
  if (value === "LinkedIn InMail") return "InMail";
  if (value === "Timeline") return "Wait";
  if (value === "Disposition") return "Done";
  return value;
}

function compactWriterStatusLabel(status) {
  const value = String(display(status));
  if (value === "quality_failure") return "quality";
  return value;
}

function fixedWidth(value, width, options = {}) {
  const text = truncateCliText(value, width);
  return options.align === "right" ? text.padStart(width) : text.padEnd(width);
}

function truncateCliText(value, maxLength) {
  const text = String(display(value)).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function renderSequenceStep(step, index, context) {
  const kind = display(step.kind).toUpperCase();
  const stage = display(step.stage);
  const channel = display(step.channel);
  const timing = step?.timing?.mode === "scheduled" ? ` [scheduled ${display(step?.timing?.scheduled_for)}]` : "";
  writeLine(context.stdout, `${index + 1}. ${kind} | ${stage} | ${channel}${timing}`);

  if (step.disposition) writeLine(context.stdout, `   Disposition: ${step.disposition}`);
  if (step.status) writeLine(context.stdout, `   Status: ${step.status}`);
  if (step.transition_label) writeLine(context.stdout, `   Transition: ${step.transition_label}`);
  if (step.rationale) writeLine(context.stdout, `   Why: ${step.rationale}`);
  if (step.guidance) writeLine(context.stdout, `   Guidance: ${step.guidance}`);
  if (step.subject) writeLine(context.stdout, `   Subject: ${step.subject}`);
  if (step.body) writeLine(context.stdout, `   Body: ${step.body}`);
  if (step.empty_body_reason) writeLine(context.stdout, `   Empty body reason: ${step.empty_body_reason}`);
  if (step.missing_reason) writeLine(context.stdout, `   Missing reason: ${step.missing_reason}`);
  if (step.kind === "decision") {
    for (const option of step.next_action?.options || []) writeLine(context.stdout, `   ${display(option.id)}: ${display(option.label)}`);
    if (step.eligible_action_families?.length) writeLine(context.stdout, `   Eligible next steps: ${step.eligible_action_families.map(humanize).join(", ")}`);
  }
}

function renderProspectSequenceExport(payload, context) {
  const prospect = payload?.prospect || {};
  const branches = Array.isArray(payload?.branches) ? payload.branches : [];

  writeLine(context.stdout, `Prospect: ${display(prospect.display_name || prospect.name)} (${display(prospect.prefix_id)})`);
  if (payload?.context?.source) writeLine(context.stdout, `Context: ${payload.context.source}`);
  if (branches.length === 0) {
    writeLine(context.stdout, "No sequence rows were generated.");
    return;
  }

  for (const branch of branches) {
    writeLine(context.stdout, "");
    writeLine(context.stdout, `${display(branch.label)} (${display(branch.key)})`);
    const rows = Array.isArray(branch.rows) ? branch.rows : [];
    if (rows.length === 0) {
      writeLine(context.stdout, "No rows.");
      continue;
    }

    writeLine(context.stdout, "STEP\tKIND\tSTAGE\tCHANNEL\tSCHEDULED FOR\tBODY");
    for (const row of rows) {
      writeLine(context.stdout, [
        display(row.step_number),
        display(row.kind),
        display(row.stage),
        display(row.channel),
        display(row.scheduled_for),
        display(row.body || row.disposition || row.missing_reason)
      ].join("\t"));
    }
  }
}

function renderProspectImportStarted(payload, context) {
  writeLine(context.stdout, `Started prospect import ${display(payload?.prefix_id)}.`);
  writeLine(context.stdout, `Status: ${display(payload?.status)}`);
  if (payload?.profile?.status) writeLine(context.stdout, `Profile: ${payload.profile.status}`);
  writeProspectImportProspectLine(payload, context);
  if (payload?.prefix_id) writeLine(context.stdout, `Run \`audienti prospects import-status ${payload.prefix_id}\` to check completion.`);
}

function renderProspectImportBatchResult(result, context) {
  const imports = Array.isArray(result?.imports) ? result.imports : [];
  const failed = Array.isArray(result?.failed) ? result.failed : [];

  writeLine(context.stdout, `Started ${display(result?.summary?.started, 0)} prospect imports.`);
  writeLine(context.stdout, `Failures: ${display(result?.summary?.failed, 0)}`);

  if (imports.length > 0) {
    writeLine(context.stdout, "IMPORT ID\tPROSPECT\tPROSPECT ID\tSTATUS");
    for (const payload of imports) {
      writeLine(context.stdout, [
        display(payload?.prefix_id),
        display(payload?.prospect?.display_name || payload?.prospect?.name),
        display(payload?.prospect?.prefix_id),
        display(payload?.status)
      ].join("\t"));
    }
  }

  for (const row of failed) {
    writeLine(context.stdout, `- row ${display(row.row)} ${display(row.linkedin_url)}: ${display(row.error, "failed")}`);
  }
}

function renderProspectImportStatus(payload, context) {
  writeLine(context.stdout, `Import: ${display(payload?.prefix_id)}`);
  writeLine(context.stdout, `Status: ${display(payload?.status)}`);
  writeLine(context.stdout, `Ready: ${payload?.ready ? "yes" : "no"}`);
  if (payload?.pipeline?.enrichment_status) writeLine(context.stdout, `Enrichment: ${payload.pipeline.enrichment_status}`);
  if (payload?.pipeline?.expansion_status) writeLine(context.stdout, `Expansion: ${payload.pipeline.expansion_status}`);
  writeProspectImportProspectLine(payload, context);

  const email = firstValue(payload?.data?.emails);
  const phone = firstValue(payload?.data?.phones);
  const socialCount = Array.isArray(payload?.data?.social_profiles) ? payload.data.social_profiles.length : 0;
  if (email) writeLine(context.stdout, `Email: ${email}`);
  if (phone) writeLine(context.stdout, `Phone: ${phone}`);
  writeLine(context.stdout, `Social profiles: ${socialCount}`);
}

function renderLinkedinReviewStarted(payload, context) {
  renderLinkedinReviewStatus(payload, context, { title: "LinkedIn review queued" });
  const reportId = payload?.report?.prefix_id;
  if (reportId) writeLine(context.stdout, `Run \`audienti tools linkedin-review status ${reportId}\` to check progress.`);
}

function renderToolsList(tools, context) {
  writeAlignedTable(context, ["TOOL", "COMMAND", "REPORTS"], tools.map((tool) => [
    tool.id,
    tool.command,
    tool.reports_command || "-"
  ]));
}

function renderLinkedinReviewReports(payload, context) {
  const rows = Array.isArray(payload?.reports) ? payload.reports : [];
  if (rows.length === 0) {
    writeLine(context.stdout, "No LinkedIn review reports found.");
    return;
  }

  writeAlignedTable(context, ["REPORT ID", "STATUS", "STAGE", "PROFILE", "UPDATED"], rows.map(linkedinReviewReportRow));
  writeLine(context.stdout, "");
  writeLine(context.stdout, "Inspect one report with `audienti tools linkedin-review status <rprt_id>`.");
}

function linkedinReviewReportRow(entry) {
  const report = entry?.report || {};
  const profile = entry?.profile || {};

  return [
    display(report.prefix_id),
    display(report.display_status || report.status),
    display(report.stage),
    display(profile.display_name || profile.url || profile.username || report.title || report.input_url),
    display(report.updated_at)
  ];
}

function renderLinkedinReviewStatus(payload, context, { title = "LinkedIn review status" } = {}) {
  const report = payload?.report || {};
  const profile = payload?.profile || {};
  const run = payload?.run || {};
  const queue = payload?.queue || {};
  const icp = payload?.icp || {};

  writeLine(context.stdout, `${title}: ${display(report.prefix_id)}`);
  writeLine(context.stdout, `Status: ${display(report.display_status || report.status)}`);
  if (report.stage) writeLine(context.stdout, `Stage: ${report.stage}`);
  if (profile.url) writeLine(context.stdout, `Profile: ${profile.url}`);
  if (profile.display_name) writeLine(context.stdout, `Profile name: ${profile.display_name}`);
  if (icp.name || icp.id) writeLine(context.stdout, `ICP: ${display(icp.name)} (${display(icp.id)})`);
  if (run.status) writeLine(context.stdout, `Run: ${run.status}`);
  if (queue.state && queue.state !== "none") {
    writeLine(context.stdout, `Queue: ${queue.state} (${display(queue.pending_count, 0)} pending)`);
  }
  if (report.updated_at) writeLine(context.stdout, `Updated: ${report.updated_at}`);
  if (report.completed_at) writeLine(context.stdout, `Completed: ${report.completed_at}`);
  if (report.url) writeLine(context.stdout, `URL: ${report.url}`);
}

function renderLinkedinReviewReport(payload, context) {
  renderLinkedinReviewStatus(payload, context, { title: "LinkedIn review report" });

  const report = payload?.report || {};
  const content = payload?.content?.payload || {};
  if (!content || Object.keys(content).length === 0) {
    writeLine(context.stdout, "");
    writeLine(context.stdout, report.display_status === "completed" || report.status === "completed"
      ? "No report content is available yet."
      : "Report content is not available until the review completes.");
    return;
  }

  const observed = objectValue(content.observed_profile);
  const scores = objectValue(content.scores);
  const findings = objectValue(content.findings);
  const strategy = objectValue(content.strategy);
  const rewrite = objectValue(content.rewrite);
  const leadMagnets = Array.isArray(content.lead_magnets) ? content.lead_magnets : [];

  writeSection(context, "Summary");
  writeField(context, "Name", observed.name || report.title);
  writeField(context, "Headline", observed.headline);
  writeField(context, "Location", observed.location);
  writeField(context, "Authority score", scores.authority_score);
  writeField(context, "Score summary", scores.summary);
  writeField(context, "Bottom line", findings.bottom_line);

  writeSection(context, "Strategy");
  writeField(context, "Buyer persona", strategy.buyer_persona);
  writeField(context, "Strategic gap", strategy.strategic_gap);
  writeField(context, "Opportunity", strategy.strategic_opportunity);
  writeField(context, "Fit", strategy.fit_assessment);
  writeBullets(context, "Next steps", strategy.next_steps);

  writeSection(context, "Recommended Rewrite");
  writeField(context, "Headline", rewrite.recommended_headline);
  writeField(context, "Why", rewrite.recommended_reason);
  writeField(context, "Bio", rewrite.recommended_bio);
  writeBullets(context, "Improvement suggestions", rewrite.improvement_suggestions);

  writeSection(context, "Findings");
  writeBullets(context, "What's working", Array.isArray(findings.whats_working) ? findings.whats_working.map(summaryItem) : []);
  writeBullets(context, "Revenue leaks", Array.isArray(findings.revenue_leaks) ? findings.revenue_leaks.map(summaryItem) : []);

  writeSection(context, "Lead Magnets");
  if (leadMagnets.length === 0) {
    writeLine(context.stdout, "None");
  } else {
    leadMagnets.slice(0, 5).forEach((magnet, index) => {
      const headline = display(magnet?.headline || magnet?.title, `Idea ${index + 1}`);
      const contentType = magnet?.content_type ? ` (${magnet.content_type})` : "";
      writeLine(context.stdout, `${index + 1}. ${headline}${contentType}`);
      if (magnet?.subheadline) writeLine(context.stdout, `   ${magnet.subheadline}`);
      if (magnet?.description) writeLine(context.stdout, `   ${magnet.description}`);
    });
  }
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function writeSection(context, title) {
  writeLine(context.stdout, "");
  writeLine(context.stdout, title);
  writeLine(context.stdout, "-".repeat(title.length));
}

function writeField(context, label, value) {
  const text = String(display(value)).trim();
  if (!text) return;

  writeLine(context.stdout, `${label}: ${text}`);
}

function writeBullets(context, label, values) {
  const rows = Array.isArray(values) ? values.map((value) => String(display(value)).trim()).filter(Boolean) : [];
  if (rows.length === 0) return;

  writeLine(context.stdout, `${label}:`);
  rows.forEach((row) => writeLine(context.stdout, `- ${row}`));
}

function summaryItem(item) {
  if (!item || typeof item !== "object") return item;

  return [item.title, item.description].map((value) => String(display(value)).trim()).filter(Boolean).join(": ");
}

function availableTools() {
  return [
    {
      id: "get-email",
      command: "audienti tools get email --url <linkedin_url>",
      description: "Find the first selected email for a LinkedIn person URL.",
      reports_command: null,
      status_command: null
    },
    {
      id: "get-phone",
      command: "audienti tools get phone --url <linkedin_url>",
      description: "Find the first selected phone for a LinkedIn person URL.",
      reports_command: null,
      status_command: null
    },
    {
      id: "humanize",
      command: "audienti tools humanize --file <path> [--tone <tone>] [--language <language>]",
      description: "Humanize arbitrary text from a UTF-8 file and print the transformed result.",
      reports_command: null,
      status_command: null
    },
    {
      id: "email-find",
      command: "audienti tools email-find --first-name <name> --last-name <name> --company-domain <domain> | --linkedin-url <url> | --file <path>",
      description: "Find work emails without creating prospects. Returns a run id; add --wait for results.",
      reports_command: "audienti tools runs list --tool email-find",
      status_command: "audienti tools runs show <trun_id>"
    },
    {
      id: "linkedin-enrich",
      command: "audienti tools linkedin-enrich --url <linkedin_url> [--kind person|company] | --file <path>",
      description: "Enrich LinkedIn person or company URLs without creating prospects.",
      reports_command: "audienti tools runs list --tool linkedin-enrich",
      status_command: "audienti tools runs show <trun_id>"
    },
    {
      id: "signals-find",
      command: "audienti tools signals-find --icp <text> --question <text> [--count <n>]",
      description: "Find companies matching an ICP and a signal question, with source links.",
      reports_command: "audienti tools runs list --tool signals-find",
      status_command: "audienti tools runs show <trun_id>"
    },
    {
      id: "write",
      command: "audienti tools write --purpose <text> --audience <text> --fact <text> --channel <channel>",
      description: "Write one draft from a brief. Nothing is sent.",
      reports_command: "audienti tools runs list --tool write",
      status_command: "audienti tools runs show <trun_id>"
    },
    {
      id: "network",
      command: "audienti network list --cookie <scok_id> [--kind connection|follow]",
      description: "List or export your saved connections, followers and following (owner only).",
      reports_command: null,
      status_command: null
    },
    {
      id: "linkedin-review",
      command: "audienti tools linkedin-review --url <linkedin_url> [--icp <icp_id>]",
      description: "Create a LinkedIn personal profile authority review and ICP-fit positioning blueprint.",
      reports_command: "audienti tools linkedin-review reports",
      status_command: "audienti tools linkedin-review status <rprt_id>",
      show_command: "audienti tools linkedin-review show <rprt_id>"
    }
  ];
}

function writeProspectImportProspectLine(payload, context) {
  const prospect = payload?.prospect;
  if (!prospect) return;

  writeLine(context.stdout, `Prospect: ${display(prospect.display_name || prospect.name)} (${display(prospect.prefix_id)})`);
  if (prospect.company) writeLine(context.stdout, `Company: ${prospect.company}`);
  if (prospect.title) writeLine(context.stdout, `Title: ${prospect.title}`);
}

function firstValue(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  return rows[0]?.value || rows[0]?.username || rows[0]?.url || null;
}

function renderOperatorQueue(payload, context) {
  const queue = Array.isArray(payload?.decision_queue) ? payload.decision_queue : [];
  if (queue.length === 0) {
    renderOperatorNext(payload?.next_move, context);
    return;
  }

  writeOperatorRows(context, queue);
  queue.forEach((row) => renderPlannerQuestion(row, context));
}

function renderOperatorRead(payload, context, continuation, renderRows) {
  if (["reset_to_legacy", "cursor_stale"].includes(payload?.metrics?.cursor_status)) {
    writeLine(context.stdout, "Queue changed; restarted at the first page.");
  }
  const hasRows = payload?.next_move || payload?.decision_queue?.length > 0;
  if (!hasRows && (payload?.has_more === true || payload?.metrics?.scan_ceiling_reached === true)) {
    writeLine(context.stdout, "No ready rows in this page.");
  } else {
    renderRows();
  }
  if (payload?.metrics?.scan_ceiling_reached === true) {
    writeLine(context.stdout, "Queue scan limit reached; more work may remain. Narrow the filters to inspect it.");
  }
  // /next exposes one focal move, while next_offset covers the whole scanned page.
  const focalMoveShown = continuation.command === "operator next" && payload?.next_move;
  if (payload?.has_more === true && !focalMoveShown) {
    const command = operatorContinuationCommand(payload, continuation);
    writeLine(context.stdout, command ? `More rows: ${command}` : "More work may remain; narrow the filters to continue.");
  }
}

function operatorContinuationCommand(payload, { command, accountId, query, plan }) {
  const args = ["audienti", ...command.split(" ")];
  const cursor = payload?.metrics?.next_cursor;
  if (payload.next_page) args.push(...operatorCommandOption("page", payload.next_page));
  if (cursor) {
    args.push(...operatorCommandOption("cursor", cursor));
  } else {
    if (!payload.next_page) return null;
    if (payload?.metrics?.next_offset !== undefined && payload.metrics.next_offset !== null) {
      args.push(...operatorCommandOption("offset", payload.metrics.next_offset));
    }
  }
  args.push(...operatorCommandOption("account", accountId));
  args.push(...operatorContinuationFilters(command, query, payload.filters));
  if (plan) args.push("--plan");
  return args.map(operatorCommandArgument).join(" ");
}

function operatorContinuationFilters(command, query, resolvedFilters = {}) {
  if (["inbox-ops queue", "network-ops queue"].includes(command)) return [];

  const filters = { ...resolvedFilters, ...query };
  const flags = {
    principal_account_user_id: "principal", motion_id: "motion", list_id: "list",
    stage: "stage", opportunity_kind: "opportunity-kind", writing_status: "writing-status"
  };
  filters.stage ||= filters.pipeline_stage;
  if (command === "operator failed-drafts") {
    delete flags.opportunity_kind;
    delete flags.writing_status;
    flags.query = "query";
  }
  return Object.entries(flags).flatMap(([key, flag]) => {
    const value = filters[key];
    return value === undefined || value === null || value === "" ? [] : operatorCommandOption(flag, Array.isArray(value) ? value.join(",") : value);
  });
}

function operatorCommandOption(flag, value) {
  const text = String(value);
  return text.startsWith("-") ? [`--${flag}=${text}`] : [`--${flag}`, text];
}

function operatorCommandArgument(value) {
  const text = String(value);
  return /^[a-zA-Z0-9_./:@=-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;
}

function renderInboxOpsQueue(rows, context, { groupBy } = {}) {
  if (rows.length === 0) return writeLine(context.stdout, "No Inbox Ops rows found.");

  if (groupBy === "domain") {
    const groups = new Map();
    for (const row of rows) {
      const domain = row.domain || "-";
      if (!groups.has(domain)) groups.set(domain, []);
      groups.get(domain).push(row.number);
    }
    const sorted = [...groups.entries()].sort(([leftDomain, left], [rightDomain, right]) => right.length - left.length || leftDomain.localeCompare(rightDomain));
    writeAlignedTable(context, ["DOMAIN", "COUNT", "ROWS"], sorted.map(([domain, numbers]) => [domain, numbers.length, compressNumbers(numbers)]));
    writeLine(context.stdout, "");
    writeLine(context.stdout, `${rows.length} rows across ${groups.size} domains.`);
    writeLine(context.stdout, "Filter a whole domain: audienti inbox-ops filter-domain --domain <domain> --yes");
    writeLine(context.stdout, "Ignore listed rows: audienti inbox-ops ignore 1-25 --yes");
    return;
  }

  writeAlignedTable(context, ["#", "ROW ID", "SENDER", "DOMAIN", "SUBJECT", "CONNECTED INBOX"], rows.map((row) => [
    row.number,
    display(row.id),
    display(row.sender),
    display(row.domain),
    display(row.subject),
    display(row.connected_account)
  ]));
  writeLine(context.stdout, "");
  writeLine(context.stdout, `${rows.length} rows. Numbers stay valid until you re-run this command.`);
  writeLine(context.stdout, "Act by number: audienti inbox-ops ignore 1-25 | filter-domain 3,7 | filter-sender 12 | allow-sender 4 (add --yes to apply, --dry-run to validate)");
  writeLine(context.stdout, "Group first: audienti inbox-ops queue --group-by domain");
}

function renderInboxOpsManifest(context, verb, selected) {
  writeLine(context.stdout, `${INBOX_OPS_BULK_LABELS[verb]} ${selected.length} message${selected.length === 1 ? "" : "s"}:`);
  writeAlignedTable(context, ["#", "ROW ID", "SENDER", "DOMAIN", "SUBJECT"], selected.map((row) => [
    row.number ?? "-",
    display(row.id),
    display(row.sender),
    display(row.domain),
    display(row.subject)
  ]));
}

function renderInboxOpsBulkResults(context, { selected, payload }) {
  const numbers = new Map(selected.map((row) => [row.id, row.number]));
  const results = Array.isArray(payload?.results) ? payload.results : [];
  writeLine(context.stdout, "");
  writeAlignedTable(context, ["#", "ROW ID", "RESULT", "DETAIL"], results.map((result) => [
    numbers.get(result.row_id) ?? "-",
    display(result.row_id),
    humanize(result.status),
    inboxOpsResultDetail(result)
  ]));
  const counts = payload?.counts || {};
  const summary = ["applied", "planned", "skipped", "rejected"]
    .filter((status) => counts[status])
    .map((status) => `${humanize(status)} ${counts[status]}`)
    .join(", ");
  writeLine(context.stdout, "");
  writeLine(context.stdout, payload?.dry_run ? `Dry run: ${summary || "nothing to do"}. No changes were made.` : `${summary || "Nothing changed"}.`);
  if (!payload?.dry_run && counts.applied) {
    writeLine(context.stdout, "Row numbers stay valid until you re-run `audienti inbox-ops queue`.");
  }
}

function inboxOpsResultDetail(result) {
  const parts = [];
  if (result.reason) parts.push(humanize(result.reason));
  if (result.scope && result.key) parts.push(`${result.disposition || ""} ${result.scope} ${result.key}`.trim());
  if (result.message) parts.push(result.message);
  return parts.join(" | ") || "-";
}

function renderNetworkOpsQueue(payload, context, { accountId }) {
  const decisionQueue = Array.isArray(payload?.decision_queue) ? payload.decision_queue : [];
  const rows = decisionQueue.length > 0 ? decisionQueue : [payload?.next_move].filter(Boolean);
  if (rows.length === 0) return writeLine(context.stdout, "No Network Ops rows found.");

  writeAlignedTable(context, ["ROW ID", "PERSON", "HEADLINE", "MESSAGE", "STATE"], rows.map((row) => [
    display(row?.id),
    operatorSubjectLabel(row),
    row?.network_ops?.headline || "-",
    row?.network_ops?.note || "-",
    display(row?.network_ops?.state)
  ]));

  for (const row of rows) {
    const accountOption = ` --account ${operatorCommandArgument(accountId)}`;
    writeLine(context.stdout, "");
    writeLine(context.stdout, `Accept: audienti network-ops accept ${row.id}${accountOption}`);
    writeLine(context.stdout, `Decline: audienti network-ops decline ${row.id}${accountOption}`);
  }
}

function renderNetworkOpsAction(payload, context) {
  const actionKey = String(payload?.action?.key || "");
  const label = actionKey.endsWith("_decline") ? "Decline" : "Acceptance";
  const person = payload?.request?.display_name || payload?.request?.id || payload?.row_id;
  writeLine(context.stdout, `${label} queued for ${display(person)} (${display(payload?.row_id)}).`);
  if (payload?.action?.prefix_id) {
    writeLine(context.stdout, `Action: ${payload.action.prefix_id} (${display(payload.action.state)})`);
  }
  writeLine(context.stdout, "Queued means provider execution was requested; it is not confirmation that LinkedIn completed the action.");
}

function renderInboxOpsFilters(payload, context) {
  const owner = payload?.owner || {};
  const filters = payload?.email_filters || {};
  writeLine(context.stdout, `Inbox Ops filters for ${display(owner.email || owner.name || owner.id)}`);
  writeLine(context.stdout, `Subscriptions: ${filters.subscriptions === false ? "Show" : "Filter"}`);
  writeLine(context.stdout, `Automated/no-reply: ${filters.automated_no_reply === false ? "Show" : "Filter"}`);
  writeLine(context.stdout, `Provider promotions: ${filters.provider_promotions === false ? "Show" : "Filter"}`);
  writeInboxOpsRules(context, "Sender rules", filters.sender_rules);
  writeInboxOpsRules(context, "Domain rules", filters.domain_rules);
}

function writeInboxOpsRules(context, heading, rules) {
  const rows = Object.entries(rules || {}).sort(([left], [right]) => left.localeCompare(right));
  writeLine(context.stdout, "");
  writeLine(context.stdout, heading);
  if (rows.length === 0) return writeLine(context.stdout, "None");

  writeAlignedTable(context, ["KEY", "DISPOSITION"], rows.map(([key, disposition]) => [key, humanize(disposition)]));
}

function renderInboxOpsRule(payload, context) {
  const rule = payload?.rule || {};
  if (rule.action === "remove") {
    writeLine(context.stdout, `Removed ${display(rule.scope)} rule ${display(rule.normalized_key)}.`);
    return writeLine(context.stdout, "Re-run `audienti inbox-ops queue` to inspect the current queue.");
  }

  const action = rule.disposition === "allow" ? "Always showing" : "Always filtering";
  writeLine(context.stdout, `${action} ${display(rule.scope)} ${display(rule.normalized_key)}.`);
  writeLine(context.stdout, "Re-run `audienti inbox-ops queue` to inspect the current queue.");
}

function renderOperatorNext(row, context) {
  if (!row) return writeLine(context.stdout, "No operator moves found.");

  writeOperatorRows(context, [row]);
  renderPlannerQuestion(row, context);
}

function renderPlannerQuestion(row, context) {
  const action = row?.next_action;
  if (action?.type !== "answer_planner_question") return;
  writeLine(context.stdout, `Question (${row.id}): ${display(action.prompt)}`);
  for (const option of action.options || []) {
    writeLine(context.stdout, `  ${display(option.id)}: ${display(option.label)}`);
  }
  writeLine(context.stdout, `Answer: audienti operator answer ${row.id} --choice <id> or --answer <text>`);
}

function renderOperatorPlan(row, context) {
  if (!row) return writeLine(context.stdout, "No operator moves found.");

  const nextAction = row.next_action || {};
  const cta = row.cta || {};
  const draft = row.operator_draft || {};
  renderPlannerQuestion(row, context);

  writeLine(context.stdout, "Static operator plan");
  writeLine(context.stdout, `Move: ${display(row.id)}`);
  writeLine(context.stdout, `Kind: ${display(row.opportunity_kind)}`);
  writeLine(context.stdout, `Prospect: ${entityLabel(row.prospect)}`);
  if (row.motion) writeLine(context.stdout, `Motion: ${entityLabel(row.motion)}`);
  if (row.pipeline_stage || row.plan_state || row.status_label) {
    writeLine(context.stdout, `State: ${compactText([row.pipeline_stage, row.plan_state, row.status_label]).join(", ")}`);
  }
  if (row.due_label) writeLine(context.stdout, `Due: ${row.due_label}`);

  writeLine(context.stdout, "");
  writeLine(context.stdout, `Next action: ${display(nextActionLabel(row), "Unknown")} (${display(nextAction.type, "unknown")})`);
  if (nextAction.request_mode) writeLine(context.stdout, `Request mode: ${nextAction.request_mode}`);
  const timing = timingLabel(nextAction, row);
  if (timing) writeLine(context.stdout, `Timing: ${timing}`);
  const target = targetLabel(nextAction);
  if (target) writeLine(context.stdout, `Target: ${target}`);

  if (Object.keys(cta).length > 0) {
    writeLine(context.stdout, "");
    writeLine(context.stdout, `CTA: ${ctaLabel(cta)}`);
  }

  if (Object.keys(draft).length > 0) {
    writeLine(context.stdout, "");
    writeLine(context.stdout, `Draft: ${draftLabel(draft)}`);
    if (draft.writer_path) writeLine(context.stdout, `Writer: ${draft.writer_path}`);
    if (draft.subject) writeLine(context.stdout, `Subject: ${draft.subject}`);
    const body = draft.body || draft.text;
    if (body) {
      writeLine(context.stdout, "Body:");
      writeLine(context.stdout, body);
    }
  }

  if (row.rationale) {
    writeLine(context.stdout, "");
    writeLine(context.stdout, "Rationale:");
    writeLine(context.stdout, row.rationale);
  }
  if (row.guidance) {
    writeLine(context.stdout, "");
    writeLine(context.stdout, "Guidance:");
    writeLine(context.stdout, row.guidance);
  }
}

function renderOperatorOutcome(payload, context) {
  const outcome = payload?.operator_outcome || {};
  const rowId = payload?.row_id || outcome.row_id;
  const status = outcome.status || payload?.status || "ok";
  writeLine(context.stdout, `Recorded ${display(status)} outcome for row ${display(rowId)}.`);
  if (payload?.prospect?.prefix_id) {
    writeLine(context.stdout, `Prospect: ${display(payload.prospect.display_name || payload.prospect.name)} (${payload.prospect.prefix_id})`);
  }
  if (payload?.event?.prefix_id) {
    writeLine(context.stdout, `Event: ${payload.event.prefix_id} (${display(payload.event.key)})`);
  }
}

function renderOperatorFailedDrafts(payload, context) {
  const rows = Array.isArray(payload?.decision_queue) ? payload.decision_queue : [];
  if (rows.length === 0) {
    writeLine(context.stdout, "No failed operator drafts found.");
    return;
  }

  writeLine(context.stdout, "Failed operator drafts");
  writeAlignedTable(context, ["ROW ID", "PROSPECT", "MOTION", "STATUS", "REASON", "DRAFT"], rows.map(operatorFailedDraftTableRow));
  writeLine(context.stdout, "");
  writeLine(context.stdout, `Shown: ${rows.length}`);
  writeLine(context.stdout, "Requeue: audienti operator failed-drafts requeue <row_id> [row_id...]");
  writeLine(context.stdout, "If a rewrite fails again, it remains in this list with the latest failure reason.");
}

function renderOperatorFailedDraftRequeue(payload, context) {
  const metrics = payload?.metrics || {};
  const queued = Number(metrics.queued_count || 0);
  const skipped = Number(metrics.skipped_count || 0);
  const failed = Number(metrics.failed_count || 0);
  writeLine(context.stdout, `Queued draft rewrites: ${queued}`);
  if (skipped > 0) writeLine(context.stdout, `Skipped: ${skipped}`);
  if (failed > 0) writeLine(context.stdout, `Failed: ${failed}`);

  writeOperatorFailedDraftRequeueDetails(context, "Queued", payload?.queued);
  writeOperatorFailedDraftRequeueDetails(context, "Skipped", payload?.skipped);
  writeOperatorFailedDraftRequeueDetails(context, "Failed", payload?.failed);

  const message = payload?.message ||
    "Rewrites run asynchronously. Re-run `audienti operator failed-drafts` with the same filters to see drafts that still fail after rewriting.";
  writeLine(context.stdout, "");
  writeLine(context.stdout, message);
}

function writeOperatorFailedDraftRequeueDetails(context, label, rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return;

  writeLine(context.stdout, "");
  writeLine(context.stdout, label);
  writeAlignedTable(context, ["ROW ID", "PROSPECT", "REASON", "DRAFT ID", "JOB ID"], list.map((row) => [
    display(row.row_id),
    display(row.prospect_name || row.prospect_id),
    display(row.reason),
    display(row.draft_id || row.source_draft_id),
    display(row.job_id)
  ]));
}

function operatorFailedDraftTableRow(row) {
  const draft = row?.operator_draft || {};
  return [
    display(row?.id),
    operatorSubjectLabel(row),
    operatorMotionLabel(row),
    display(draft.status || draft.state),
    operatorFailedDraftReason(draft),
    operatorFailedDraftSnippet(draft)
  ];
}

function operatorFailedDraftReason(draft) {
  const payload = draft?.payload || {};
  const codes = Array.isArray(payload.quality_codes) ? payload.quality_codes.filter(Boolean).join(",") : "";
  return display(
    codes ||
      payload.blank_reason ||
      payload.error ||
      payload.message ||
      payload.status ||
      draft?.status ||
      draft?.state,
    "-"
  );
}

function operatorFailedDraftSnippet(draft) {
  const payload = draft?.payload || {};
  return truncateCliText(payload.subject || payload.body || payload.text || "", 64) || "-";
}

function renderAnalyticsProspects(payload, context) {
  writeLine(context.stdout, `Prospect analytics (${analyticsWindowLabel(payload)})`);
  writeAnalyticsCohort(payload, context);
  writeAnalyticsScope(payload, context);
  if (payload?.cohort) {
    writeLine(context.stdout, `Cohort prospects: ${display(payload?.cohort_prospects_count, payload?.prospects_added_count || 0)}`);
  } else {
    writeLine(context.stdout, `Prospects added: ${display(payload?.prospects_added_count, 0)}`);
  }
  writeAnalyticsActionSummary(payload?.actions, context, "Actions");
  writeCountTable(context, "Action breakdown", payload?.actions?.breakdown, ["ACTION", "COUNT", "AUTOMATED", "AUTO %"], actionBreakdownRow);
  writeCountTable(context, payload?.cohort ? "Current cohort stages" : "Queue stages", payload?.queue_stages, ["STAGE", "COUNT"], countRow);
}

function renderMotionAnalytics(payload, context) {
  writeLine(context.stdout, `Motion analytics (${analyticsWindowLabel(payload)})`);
  writeAnalyticsMotion(payload, context);
  if (payload?.motion?.created_at) writeLine(context.stdout, `Created: ${payload.motion.created_at}`);
  writeLine(context.stdout, `Prospects produced: ${display(payload?.prospects_added_count, 0)}`);
  writeCountTable(context, "Prospect cohorts by produced day", payload?.prospects_by_day, ["DATE", "PRODUCED", "ACTIVE", "ACTIVE %", "INACTIVE", "STAGES"], dailyProspectRow);
}

function renderMotionDiscoveryRun(payload, context) {
  const motion = payload?.motion || {};
  const run = payload?.run;
  const label = entityLabel(motion) || payload?.motion_id;
  const prefix = payload?.enqueued ? "Discovery queued" : "Discovery not queued";
  writeLine(context.stdout, `${prefix} for ${display(label)}.`);
  writeLine(context.stdout, `Reason: ${display(payload?.reason)}`);
  writeLine(context.stdout, `Target count: ${display(payload?.target_count)}`);
  renderDiscoveryRunReceipt(run, context);
  if (payload?.next_eligible_at) writeLine(context.stdout, `Retry at: ${payload.next_eligible_at}`);
  if (payload?.suggested_action) writeLine(context.stdout, `Next action: ${payload.suggested_action}`);
}

function renderDiscoveryRunReceipt(run, context) {
  if (run) {
    writeLine(context.stdout, `Run: ${display(run.id)} (${display(run.status)})`);
    if (run.queued_at) writeLine(context.stdout, `Queued: ${run.queued_at}`);
    if (run.started_at) writeLine(context.stdout, `Started: ${run.started_at}`);
    if (run.finished_at) writeLine(context.stdout, `Finished: ${run.finished_at}`);
    if ([run.seen_count, run.submitted_count, run.accepted_count, run.promoted_count, run.rejected_count].some((value) => value != null)) {
      const submittedCount = run.submitted_count ?? run.accepted_count;
      writeLine(context.stdout, `Counts: ${display(run.seen_count)} seen, ${display(submittedCount)} submitted, ${display(run.promoted_count)} promoted, ${display(run.rejected_count)} rejected`);
    }
    if (run.outcome) writeLine(context.stdout, `Outcome: ${run.outcome}`);
    if (run.scope_counts) writeLine(context.stdout, `Scopes: ${display(run.scope_counts.planned)} planned, ${display(run.scope_counts.successful)} successful, ${display(run.scope_counts.failed)} failed, ${display(run.scope_counts.blocked)} blocked`);
    if (run.error_message) writeLine(context.stdout, `Error: ${run.error_message}`);
  }
}

function renderQuickStartDraft(draft, context) {
  writeLine(context.stdout, `Quick-start draft ${display(draft?.id)} is ${display(draft?.status)}.`);
  writeLine(context.stdout, `URL: ${display(draft?.normalized_url)}`);
  if (draft?.principal_account_user) writeLine(context.stdout, `Principal: ${accountUserLabel(draft.principal_account_user)}`);
  if (draft?.expires_at) writeLine(context.stdout, `Expires: ${draft.expires_at}`);
  if (draft?.error) writeLine(context.stdout, `Error: ${draft.error}`);
  if (quickStartReady(draft)) writeLine(context.stdout, `Confirm: audienti motions quick-start --url ${draft.normalized_url} --confirm`);
}

function renderQuickStartConfirmation(payload, context) {
  const motion = payload?.motion || {};
  writeLine(context.stdout, `Quick-start motion ${display(entityLabel(motion) || motion.prefix_id)} ${payload?.reused ? "reused" : "created"}.`);
  writeLine(context.stdout, `Motion status: ${display(motion.status)}`);
  writeLine(context.stdout, `Reservation: ${display(payload?.reservation?.status)} / ${display(payload?.reservation?.launch_status)}`);
  if (payload?.reservation?.launch_reason) writeLine(context.stdout, `Launch reason: ${payload.reservation.launch_reason}`);
}

function quickStartReady(draft) {
  return draft?.ready === true || draft?.status === "ready";
}

function quickStartTerminal(draft) {
  return quickStartReady(draft) || draft?.status === "failed";
}

async function waitForQuickStartDraft(client, accountId, initialDraft, context, { timeoutSeconds, pollIntervalSeconds, onPoll }) {
  let draft = initialDraft;
  const deadline = context.now().getTime() + timeoutSeconds * 1000;

  while (!quickStartTerminal(draft)) {
    if (context.now().getTime() >= deadline) return draft;

    onPoll?.();
    await context.sleep(pollIntervalSeconds * 1000);
    draft = await client.quickStart(accountId, draft.id);
  }

  return draft;
}

function renderAnalyticsDashboard(payload, context) {
  writeLine(context.stdout, `Dashboard analytics (${display(payload?.cohort?.label, "selected cohort")})`);
  if (payload?.cohort) {
    writeLine(context.stdout, `Cohort: ${payload.cohort.start_date} to ${payload.cohort.end_date} (${display(payload.cohort.field, "account_prospects.created_at")})`);
  }
  if (payload?.activity) {
    writeLine(context.stdout, `Activity: ${payload.activity.start_date} to ${payload.activity.end_date} (${display(payload.activity.field, "events.created_at")})`);
  }
  writeDashboardFilters(payload, context);
  writeLine(context.stdout, `Prospects: ${display(payload?.cohort_size, 0)}`);
  writeLine(context.stdout, `Companies: ${display(payload?.cohort_company_target_count, 0)}`);
  writeLine(context.stdout, `People/company: ${display(payload?.cohort_people_per_company_average, "0.0")}`);
  writeLine(context.stdout, `Active: ${display(payload?.active_cohort_count, 0)} (${display(payload?.active_cohort_company_target_count, 0)} companies, ${percentageLabel(payload?.active_cohort_percentage)})`);
  writeLine(context.stdout, `Inactive: ${display(payload?.inactive_cohort_count, 0)}`);
  writeCountTable(context, "Current pipeline stages", payload?.pipeline_stage_counts, ["STAGE", "COUNT"], countRow);
}

function renderAnalyticsMotions(payload, context) {
  const current = payload?.current || {};
  const recent = payload?.recent || {};
  const totals = payload?.totals || {};

  writeLine(context.stdout, "Motion portfolio analytics");
  writeLine(context.stdout, `Current prospects: ${integerLabel(current.total_count)}`);
  writeLine(context.stdout, `Last 7 days: ${integerLabel(recent.total_count)} (${motionAnalyticsWindowLabel(recent.window)})`);
  writeLine(context.stdout, `Motions: ${integerLabel(totals.motion_count)}`);
  writeLine(context.stdout, `Contributing motions: ${integerLabel(totals.contributing_motion_count)}`);
  writeLine(context.stdout, `Active without contribution: ${integerLabel(totals.active_without_contribution_count)}`);
  writeLine(context.stdout, `Current attribution uses the current motion association. Unattributed currently means ${display(current.unattributed_label, "No current motion")}.`);
  writeLine(context.stdout, `Last 7 days uses the recorded source motion. Unattributed means ${display(recent.unattributed_label, "No attributable source motion")}.`);

  writeMotionMixTable(payload?.prospect_mix, context);
  writeMotionContributionTable(payload?.motions, context);
  renderAdaptiveTreatments(payload?.adaptive_treatments, context);
}

function renderAdaptiveTreatments(rollup, context) {
  if (!rollup) return;
  writeLine(context.stdout, "");
  writeLine(context.stdout, "Adaptive treatments (all time; exact outbound-event outcome links)");
  const rows = rollup.treatments || [];
  if (rows.length > 0) {
    writeAlignedTable(context, ["SOURCE MOTION", "APPROACH", "OUTBOUND", "REPLIES", "MEETING ASKS", "ACCEPTED", "QUESTIONS", "MEAN ANSWER (s)"], rows.map((row) => [
      display(row.source_motion_id), display(row.approach_digest).slice(0, 12), integerLabel(row.outbound_count),
      integerLabel(row.replies), integerLabel(row.meeting_asks), integerLabel(row.meetings_accepted),
      `${integerLabel(row.questions)}/${integerLabel(row.decision_count)}`, display(row.mean_answer_latency_seconds)
    ]));
  } else writeLine(context.stdout, "No adaptive treatments yet.");
  writeLine(context.stdout, `Adaptive prospects without an adaptive message link: ${integerLabel(rollup.unattributed?.replies)} replies, ${integerLabel(rollup.unattributed?.meetings_accepted)} accepted meetings.`);
}

function renderAnalyticsIcps(payload, context) {
  const current = payload?.current || {};
  const recent = payload?.recent || {};
  const totals = payload?.totals || {};

  writeLine(context.stdout, "ICP portfolio analytics");
  writeLine(context.stdout, `Current prospects: ${integerLabel(current.total_count)}`);
  writeLine(context.stdout, `Last 7 days: ${integerLabel(recent.total_count)} (${motionAnalyticsWindowLabel(recent.window)})`);
  writeLine(context.stdout, `ICPs: ${integerLabel(totals.icp_count)}`);
  writeLine(context.stdout, `Contributing ICPs: ${integerLabel(totals.contributing_icp_count)}`);
  writeLine(context.stdout, `No recent contribution: ${integerLabel(totals.without_recent_contribution_count)}`);
  writeLine(context.stdout, `Current and last-seven-day counts use the recorded source ICP. Unattributed means ${display(current.unattributed_label, "No attributable source ICP")}.`);

  writeIcpMixTable(payload?.prospect_mix, context);
  writeIcpContributionTable(payload?.icps, context);
}

function writeIcpMixTable(rows, context) {
  const mix = Array.isArray(rows) ? rows : [];
  writeLine(context.stdout, "");
  writeLine(context.stdout, "Prospect mix");
  if (mix.length === 0) return writeLine(context.stdout, "None");

  writeAlignedTable(context, ["ICP", "STATUS", "AGE", "CURRENT", "CURRENT %", "LAST 7 DAYS", "LAST 7 DAYS %"], mix.map((row) => [
    display(row?.name, "Unattributed"),
    row?.archived === true ? "archived" : (row?.id ? "active" : "-"),
    compactAgeLabel(row?.created_at, context.now()),
    display(row?.current?.count, 0),
    percentageLabel(row?.current?.percentage),
    display(row?.recent?.count, 0),
    percentageLabel(row?.recent?.percentage)
  ]), { numericColumns: [false, false, false, true, true, true, true] });
}

function writeIcpContributionTable(rows, context) {
  const icps = Array.isArray(rows) ? rows : [];
  writeLine(context.stdout, "");
  writeLine(context.stdout, "ICP contribution");
  if (icps.length === 0) return writeLine(context.stdout, "None");

  writeAlignedTable(context, ["ICP", "ID", "STATUS", "MOTIONS", "CURRENT", "LAST 7 DAYS", "CONTRIBUTING"], icps.map((row) => [
    display(row?.name, "Unattributed"),
    display(row?.prefix_id, "-"),
    row?.archived === true ? "archived" : (row?.id ? "active" : "-"),
    display(row?.linked_motion_count, 0),
    display(row?.current_prospect_count, 0),
    display(row?.recent_prospect_count, 0),
    row?.contributing === true ? "yes" : "no"
  ]), { numericColumns: [false, false, false, true, true, true, false] });
}

function writeMotionMixTable(rows, context) {
  const mix = Array.isArray(rows) ? rows : [];
  writeLine(context.stdout, "");
  writeLine(context.stdout, "Prospect mix");
  if (mix.length === 0) return writeLine(context.stdout, "None");

  writeAlignedTable(context, ["TYPE", "CURRENT", "CURRENT %", "LAST 7 DAYS", "LAST 7 DAYS %"], mix.map((row) => [
    display(row?.label || row?.key),
    display(row?.current?.count, 0),
    percentageLabel(row?.current?.percentage),
    display(row?.recent?.count, 0),
    percentageLabel(row?.recent?.percentage)
  ]), { numericColumns: [false, true, true, true, true] });
}

function writeMotionContributionTable(rows, context) {
  const motions = Array.isArray(rows) ? rows : [];
  writeLine(context.stdout, "");
  writeLine(context.stdout, "Motion contribution");
  if (motions.length === 0) return writeLine(context.stdout, "None");

  writeAlignedTable(context, ["MOTION", "ID", "TYPE", "STATUS", "CURRENT", "LAST 7 DAYS", "CONTRIBUTING"], motions.map((row) => [
    display(row?.name, "Unattributed"),
    display(row?.prefix_id, "-"),
    display(row?.kind, "unattributed"),
    display(row?.status, "-"),
    display(row?.current_prospect_count, 0),
    display(row?.recent_prospect_count, 0),
    row?.contributing === true ? "yes" : "no"
  ]), { numericColumns: [false, false, false, false, true, true, false] });
}

function motionAnalyticsWindowLabel(window) {
  if (!window?.started_at || !window?.ended_at) return "rolling window";

  return `${window.started_at} to ${window.ended_at}`;
}

function integerLabel(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("en-US") : display(value, 0);
}

function compactAgeLabel(createdAt, now) {
  if (!createdAt) return "-";

  const created = new Date(createdAt);
  const reference = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(created.getTime()) || Number.isNaN(reference.getTime())) return "-";

  const days = Math.max(0, Math.floor((reference.getTime() - created.getTime()) / 86_400_000));
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;

  return `${Math.floor(days / 365)}y`;
}

function renderAnalyticsMetrics(payload, context) {
  const cohort = payload?.cohort || {};
  const summary = payload?.summary || {};
  writeLine(context.stdout, "Outbound metrics");
  writeLine(context.stdout, `Cohort: ${display(cohort.start_date, "-")} to ${display(cohort.end_date, "-")} (${display(cohort.field, "-")})`);
  writeLine(context.stdout, `Current: ${metricsRangeLabel(cohort.start_at, cohort.end_at)}`);
  writeLine(context.stdout, `Previous: ${metricsRangeLabel(cohort.previous_start_at, cohort.previous_end_at)}`);
  writeLine(context.stdout, `Operations: ${display(summary.operation_count, "-")}`);
  writeLine(context.stdout, `First-try success: ${metricsCountRateLabel(summary, "first_attempt_success")}`);
  writeLine(context.stdout, `Recovered: ${metricsCountRateLabel(summary, "succeeded_after_retry")}`);
  writeLine(context.stdout, `Final failures: ${metricsCountRateLabel(summary, "ultimate_failure")}`);
  writeLine(context.stdout, `In progress: ${metricsCountRateLabel(summary, "in_progress")}`);
  writeLine(context.stdout, `Attempts: ${display(summary.attempt_count, "-")}`);

  renderAnalyticsMetricsGrid(payload?.grid, context);
  renderAnalyticsMetricsActions(payload?.action_rows, context);
  if (payload?.scope?.social_cookie == null) renderAnalyticsMetricsCookies(payload?.social_cookie_rows, context);
}

function metricsRangeLabel(startAt, endAt) {
  return startAt && endAt ? `${startAt} to ${endAt}` : "not available";
}

function metricsCountRateLabel(summary, bucket) {
  return `${display(summary?.[`${bucket}_count`], "-")} (${percentageLabel(summary?.[`${bucket}_rate`])})`;
}

function renderAnalyticsMetricsGrid(grid, context) {
  const rows = Array.isArray(grid?.rows) ? grid.rows : [];
  const intervalLabel = grid?.interval === "weekly" ? "Weekly" : "Daily";
  writeLine(context.stdout, "");
  writeLine(context.stdout, `${intervalLabel} rows`);
  if (rows.length === 0) return writeLine(context.stdout, "None");

  writeAlignedTable(context, [
    grid?.row_heading?.toUpperCase() || "PERIOD",
    "OPERATIONS",
    "FIRST-TRY SUCCESS",
    "RECOVERED",
    "FINAL FAILURES",
    "IN PROGRESS",
    "ATTEMPTS"
  ], rows.map((row) => [
    display(row?.label, "-"),
    display(row?.summary?.operation_count, "-"),
    metricsCountRateLabel(row?.summary, "first_attempt_success"),
    metricsCountRateLabel(row?.summary, "succeeded_after_retry"),
    metricsCountRateLabel(row?.summary, "ultimate_failure"),
    metricsCountRateLabel(row?.summary, "in_progress"),
    display(row?.summary?.attempt_count, "-")
  ]), { numericColumns: [false, true, true, true, true, true, true] });
}

function renderAnalyticsMetricsActions(rows, context) {
  const actions = Array.isArray(rows) ? rows : [];
  writeLine(context.stdout, "");
  writeLine(context.stdout, "Action breakdown");
  if (actions.length === 0) return writeLine(context.stdout, "None");

  writeAnalyticsMetricsSummaryTable(context, ["ACTION", "KEY"], actions.map((row) => [
    display(row?.label, "-"),
    display(row?.key, "-")
  ]), actions.map((row) => row?.summary));
}

function renderAnalyticsMetricsCookies(rows, context) {
  const cookies = Array.isArray(rows) ? rows : [];
  writeLine(context.stdout, "");
  writeLine(context.stdout, "Social Cookie breakdown");
  if (cookies.length === 0) return writeLine(context.stdout, "None");

  writeAnalyticsMetricsSummaryTable(context, ["SOCIAL COOKIE", "ID"], cookies.map((row) => [
    display(row?.label, "-"),
    display(row?.prefix_id, "-")
  ]), cookies.map((row) => row?.summary));
}

function writeAnalyticsMetricsSummaryTable(context, identityHeaders, identityRows, summaries) {
  const summaryHeaders = ["OPERATIONS", "FIRST-TRY SUCCESS", "RECOVERED", "FINAL FAILURES", "IN PROGRESS", "ATTEMPTS"];
  const rows = identityRows.map((identity, index) => {
    const summary = summaries[index];
    return [
      ...identity,
      display(summary?.operation_count, "-"),
      metricsCountRateLabel(summary, "first_attempt_success"),
      metricsCountRateLabel(summary, "succeeded_after_retry"),
      metricsCountRateLabel(summary, "ultimate_failure"),
      metricsCountRateLabel(summary, "in_progress"),
      display(summary?.attempt_count, "-")
    ];
  });
  writeAlignedTable(context, [...identityHeaders, ...summaryHeaders], rows, {
    numericColumns: [...identityHeaders.map(() => false), true, true, true, true, true, true]
  });
}

function renderAnalyticsStages(payload, context) {
  const conversionGrid = payload?.conversion_grid || {};
  writeLine(context.stdout, `Stage analytics (${display(payload?.cohort?.label, "selected cohort")})`);
  if (payload?.cohort) {
    writeLine(context.stdout, `Cohort: ${payload.cohort.start_date} to ${payload.cohort.end_date} (${display(payload.cohort.field, "account_prospects.created_at")})`);
  }
  writeDashboardFilters(payload, context);
  writeLine(context.stdout, `Conversion interval: ${display(conversionGrid.interval, "weekly")}`);
  writeLine(context.stdout, `Connection maturity window: ${display(conversionGrid.maturity_days, 21)} days`);
  writeStageConversionTable(conversionGrid, context);
  writeStageAgingTable(payload?.stage_aging, context);
}

function writeStageConversionTable(conversionGrid, context) {
  const rows = Array.isArray(conversionGrid?.rows) ? conversionGrid.rows : [];
  const definitions = Array.isArray(conversionGrid?.stage_definitions) ? conversionGrid.stage_definitions : [];
  const columns = definitions.filter((definition) => definition?.key);
  const totalValues = conversionGrid?.total_values || {};

  writeLine(context.stdout, "");
  writeLine(context.stdout, display(conversionGrid?.window_description, "Conversion cohorts"));
  if (rows.length === 0 || columns.length === 0) return writeLine(context.stdout, "None");

  const headers = ["COHORT", ...columns.map((column) => display(column.label || column.key))];
  const tableRows = rows.map((row) => [
    display(row?.label),
    ...columns.map((column) => stageMetricValueLabel(row?.values?.[column.key]))
  ]);
  if (Object.keys(totalValues).length > 0) {
    tableRows.push([
      "TOTAL",
      ...columns.map((column) => stageMetricValueLabel(totalValues[column.key]))
    ]);
  }

  writeAlignedTable(context, headers, tableRows);
}

function writeStageAgingTable(stageAging, context) {
  const rows = Array.isArray(stageAging?.rows) ? stageAging.rows : [];
  writeLine(context.stdout, "");
  writeLine(context.stdout, "Stage Aging");
  if (rows.length === 0) return writeLine(context.stdout, "None");

  const totals = stageAging?.totals || {};
  writeLine(
    context.stdout,
    `Totals: ${display(totals.current_count, 0)} current, ${display(totals.due_soon_count, 0)} due soon, ${display(totals.overdue_count, 0)} overdue (${percentageLabel(totals.overdue_rate)})`
  );
  writeAlignedTable(
    context,
    ["STAGE", "SLA", "CURRENT", "DUE SOON", "OVERDUE", "OVERDUE %", "MED AGE", "OLDEST AGE", "OLDEST IDLE"],
    rows.map(stageAgingRow),
    { numericColumns: [false, true, true, true, true, true, true, true, true] }
  );
}

function stageAgingRow(row) {
  return [
    display(row?.label || row?.key),
    dayCountLabel(row?.due_after_days),
    display(row?.current_count, 0),
    display(row?.due_soon_count, 0),
    display(row?.overdue_count, 0),
    percentageLabel(row?.overdue_rate),
    dayCountLabel(row?.median_stage_age_days),
    dayCountLabel(row?.oldest_stage_age_days),
    dayCountLabel(row?.oldest_idle_days)
  ];
}

function stageMetricValueLabel(value) {
  if (!value) return "-";
  if (value.kind === "count") return display(value.count, 0);

  const numerator = display(value.numerator, 0);
  const denominator = display(value.denominator, 0);
  const suffix = value.maturing ? " maturing" : "";
  return `${numerator}/${denominator} ${percentageLabel(value.rate)}${suffix}`;
}

function dayCountLabel(value) {
  return value === undefined || value === null || value === "" ? "-" : `${value}d`;
}

function renderAnalyticsCohortList(payload, context) {
  const list = payload?.list || {};
  writeLine(context.stdout, `Created analytics cohort list ${display(list.name)} (${display(list.prefix_id)}).`);
  writeLine(context.stdout, `Matched prospects: ${display(payload?.matched_count, 0)}`);
  const query = payload?.query || {};
  if (query.event_type) writeLine(context.stdout, `Event: ${display(query.event_type)}`);
  if (query.start_date || query.end_date) writeLine(context.stdout, `Activity: ${display(query.start_date)} to ${display(query.end_date)} (${display(query.date_field, "events.created_at")})`);
  if (query.note_mode && query.note_mode !== "any") writeLine(context.stdout, `Note mode: ${display(query.note_mode)}`);
}

function renderAnalyticsProspectCohortAnalysis(payload, context) {
  const cohorts = Array.isArray(payload?.cohorts) ? payload.cohorts : [];
  writeLine(context.stdout, `Prospect cohort analysis (${display(payload?.weeks, cohorts.length)} weeks)`);
  writeLine(context.stdout, `Activity window: ${display(payload?.window, "24h")}`);
  writeLine(context.stdout, "Cohorts: account_prospects.created_at, calendar weeks, oldest first");
  writeAnalyticsMotion(payload, context);
  writeAnalyticsList(payload, context);
  writeAnalyticsProvenance(payload, context);
  if (payload?.account_user) {
    writeLine(context.stdout, `User: ${entityLabel(payload.account_user)}`);
  } else {
    writeLine(context.stdout, "User: all account users");
  }

  if (cohorts.length === 0) {
    writeLine(context.stdout, "No cohorts generated.");
    return;
  }

  const stageColumns = cohortAnalysisStageColumns(cohorts);
  const headers = ["COHORT", "TOTAL", ...stageColumns.map((column) => column.label)];
  const rows = cohorts.map((row) => [
    row.label,
    row.total_count,
    ...stageColumns.map((column) => row.stages?.[column.key] || 0)
  ]);

  writeLine(context.stdout, "");
  writeAlignedTable(context, headers, rows, {
    numericColumns: headers.map((_, index) => index > 0)
  });
}

function renderAnalyticsUsers(payload, context) {
  writeLine(context.stdout, `User analytics (${analyticsActivityLabel(payload)})`);
  writeAnalyticsCohort(payload, context);
  writeAnalyticsScope(payload, context);
  writeAnalyticsPlatform(payload, context);

  const summary = payload?.summary || {};
  writeLine(context.stdout, `Actions: ${display(summary.total_count, 0)}`);
  writeLine(context.stdout, `Performed by you: ${display(summary.performed_by_user_count, 0)} (${percentageLabel(summary.performed_by_user_percentage)})`);
  writeLine(context.stdout, `Other humans: ${display(summary.performed_by_others_count, 0)} (${percentageLabel(summary.performed_by_others_percentage)})`);
  writeLine(context.stdout, `Agent: ${display(summary.agentic_count, 0)} (${percentageLabel(summary.agentic_percentage)})`);
  writeAnalyticsDailyActions(payload, context);
  writeCountTable(context, "Action mix", payload?.action_mix, ["ACTION", "COUNT", "%"], mixRow);
  writeCountTable(context, "Platform mix", payload?.platform_mix, ["PLATFORM", "COUNT", "%"], mixRow);
}

function renderAnalyticsVisibility(payload, context) {
  writeLine(context.stdout, `Visibility analytics (${analyticsWindowLabel(payload)})`);
  writeAnalyticsScope(payload, context);
  writeLine(context.stdout, `Unique people engaged: ${display(payload?.unique_people_engaged_count, 0)}`);
  writeAnalyticsActionSummary(payload?.engagements, context, "Engagements");
  writeCountTable(context, "Engagement breakdown", payload?.engagements?.breakdown, ["ACTION", "COUNT", "AUTOMATED", "AUTO %"], actionBreakdownRow);
}

function renderAnalyticsContent(payload, context) {
  writeLine(context.stdout, `Content analytics (${analyticsWindowLabel(payload)})`);
  writeAnalyticsScope(payload, context);
  writeLine(context.stdout, `Published posts: ${display(payload?.published_posts_count, 0)}`);
  writeCountTable(context, "Stages", payload?.stage_breakdown, ["STAGE", "COUNT"], countRow);
  writeCountTable(context, "Execution statuses", payload?.execution_status_breakdown, ["STATUS", "COUNT"], countRow);
}

function writeAnalyticsScope(payload, context) {
  writeAnalyticsMotion(payload, context);
  writeAnalyticsList(payload, context);
  writeAnalyticsProvenance(payload, context);
  if (payload?.account_user) {
    writeLine(context.stdout, `User: ${entityLabel(payload.account_user)}`);
  } else {
    writeLine(context.stdout, "User: all account users");
  }
}

function writeDashboardFilters(payload, context) {
  const filters = payload?.filters || {};
  if (filters.motion) writeLine(context.stdout, `Motion: ${entityLabel(filters.motion)}`);
  if (filters.play_tag) writeLine(context.stdout, `Tag: ${filters.play_tag}`);
  if (filters.list) writeLine(context.stdout, `List: ${entityLabel(filters.list)}`);
  if (filters.offer) writeLine(context.stdout, `Offer: ${entityLabel(filters.offer)}`);
  if (filters.icp) writeLine(context.stdout, `ICP: ${entityLabel(filters.icp)}`);
  if (filters.account_user) {
    writeLine(context.stdout, `User: ${entityLabel(filters.account_user)}`);
  } else {
    writeLine(context.stdout, "User: all account users");
  }
}

function writeAnalyticsPlatform(payload, context) {
  if (!payload?.platform) return;

  const label = display(payload.platform.label, payload.platform.key);
  const values = Array.isArray(payload.platform.values) ? payload.platform.values.filter(Boolean).join(", ") : display(payload.platform.key);
  writeLine(context.stdout, `Platform: ${label} (${display(payload.platform.field, "events.platform")}: ${values})`);
}

function writeAnalyticsMotion(payload, context) {
  if (!payload?.motion) return;

  writeLine(context.stdout, `Motion: ${entityLabel(payload.motion)}`);
}

function writeAnalyticsList(payload, context) {
  if (!payload?.list) return;

  writeLine(context.stdout, `List: ${entityLabel(payload.list)}`);
}

function writeAnalyticsProvenance(payload, context) {
  if (!payload?.provenance) return;

  writeLine(context.stdout, `Provenance: ${display(payload.provenance.label, payload.provenance.key)} (${display(payload.provenance.field, "account_prospects.intake_source")})`);
}

function writeAnalyticsCohort(payload, context) {
  const cohort = payload?.cohort;
  if (!cohort) return;

  writeLine(context.stdout, `Cohort: ${display(cohort.start_date)} to ${display(cohort.end_date)} (${display(cohort.field, "account_prospects.created_at")})`);
}

function writeAnalyticsDailyActions(payload, context) {
  const dailyRows = Array.isArray(payload?.daily_actions) ? payload.daily_actions : [];
  writeLine(context.stdout, "");
  writeLine(context.stdout, "Actions by day");
  if (dailyRows.length === 0) return writeLine(context.stdout, "None");

  const actionColumns = dailyActionColumns(dailyRows, payload?.action_mix);
  const headers = ["DATE", "TOTAL", ...actionColumns.map((column) => column.label)];
  const rows = dailyRows.map((row) => [
    row?.date,
    row?.total_count || 0,
    ...actionColumns.map((column) => row?.actions?.[column.key] || 0)
  ]);

  writeAlignedTable(context, headers, rows, {
    numericColumns: headers.map((_, index) => index > 0)
  });
}

function dailyActionColumns(dailyRows, actionMix) {
  const labels = {};
  const keys = [];
  for (const row of Array.isArray(actionMix) ? actionMix : []) {
    const key = String(row?.key || "").trim();
    if (!key) continue;
    if (!keys.includes(key)) keys.push(key);
    labels[key] = row?.label || key;
  }

  for (const row of dailyRows) {
    for (const key of Object.keys(row?.actions || {})) {
      if (!keys.includes(key)) keys.push(key);
      labels[key] ||= key;
    }
  }

  return keys.slice(0, 6).map((key) => ({ key, label: compactActionLabel(key, labels[key] || key) }));
}

function compactActionLabel(key, label) {
  const labels = {
    "action.profile.connect_request_sent": "Connect sent",
    "action.profile.withdraw_connection": "Withdraw",
    "action.profile.follow": "Follow",
    "action.profile.view": "View",
    "action.profile.in_mail_message": "InMail",
    "action.post.comment": "Comment",
    "action.post.like": "Like",
    "messaging.message_sent": "Message",
    "messaging.email_sent": "Email",
    "action.meeting.requested": "Meeting req",
    "action.prospect.nurtured": "Nurtured",
    "action.prospect.motion_completed_no_outcome": "No outcome"
  };
  if (labels[key]) return labels[key];

  const words = String(label || key).split(/\s+/).filter(Boolean);
  return words.length <= 2 ? words.join(" ") : words.slice(0, 2).join(" ");
}

function cohortAnalysisStageColumns(cohorts) {
  const labels = {};
  const keys = [];
  for (const cohort of cohorts) {
    for (const [key, label] of Object.entries(cohort.stage_labels || {})) {
      if (!keys.includes(key)) keys.push(key);
      labels[key] ||= label;
    }
  }

  return keys
    .sort((left, right) => cohortStageRank(left) - cohortStageRank(right) || left.localeCompare(right))
    .map((key) => ({ key, label: labels[key] || key }));
}

function cohortStageRank(key) {
  const index = COHORT_STAGE_ORDER.indexOf(String(key));
  return index === -1 ? COHORT_STAGE_ORDER.length : index;
}

function writeAnalyticsActionSummary(actions, context, label) {
  const total = display(actions?.total_count, 0);
  const automated = display(actions?.automated_count, 0);
  const percentage = percentageLabel(actions?.automated_percentage);
  writeLine(context.stdout, `${label}: ${total} (automated ${automated}, ${percentage})`);
}

function writeCountTable(context, title, rows, headers, mapRow) {
  const list = Array.isArray(rows) ? rows : [];
  writeLine(context.stdout, "");
  writeLine(context.stdout, title);
  if (list.length === 0) return writeLine(context.stdout, "None");

  writeAlignedTable(context, headers, list.map(mapRow));
}

function writeAlignedTable(context, headers, rows, options = {}) {
  const tableRows = [headers, ...rows].map((row) => row.map((value) => display(value)));
  const widths = headers.map((_, index) => Math.max(...tableRows.map((row) => visibleLength(row[index] || ""))));
  const numericColumns = options.numericColumns || headers.map((header, index) => index > 0 && numericHeader(header));

  writeLine(context.stdout, formatAlignedRow(headers, widths, numericColumns));
  writeLine(context.stdout, widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) writeLine(context.stdout, formatAlignedRow(row, widths, numericColumns));
}

function numericHeader(header) {
  return ["COUNT", "AUTOMATED", "AUTO %", "TOTAL", "%", "PRODUCED", "ACTIVE", "ACTIVE %", "INACTIVE"].includes(String(header || "").toUpperCase());
}

function formatAlignedRow(row, widths, numericColumns) {
  return row.map((value, index) => {
    const text = String(display(value));
    return numericColumns[index] ? text.padStart(widths[index]) : text.padEnd(widths[index]);
  }).join("  ");
}

function visibleLength(value) {
  return String(display(value)).length;
}

function actionBreakdownRow(row) {
  return [
    display(row?.label || row?.key),
    display(row?.count, 0),
    display(row?.automated_count, 0),
    percentageLabel(row?.automated_percentage)
  ];
}

function countRow(row) {
  return [
    display(row?.label || row?.key),
    display(row?.count, 0)
  ];
}

function dailyProspectRow(row) {
  const count = Number(row?.count || 0);
  return [
    display(row?.date),
    countDash(row?.count),
    countDash(row?.active_count),
    count > 0 ? percentageLabel(row?.active_percentage) : "-",
    countDash(row?.inactive_count),
    stageSummary(row?.queue_stages)
  ];
}

function countDash(value) {
  return Number(value || 0) === 0 ? "-" : display(value, 0);
}

function stageSummary(rows) {
  const stages = Array.isArray(rows) ? rows.filter((row) => Number(row?.count || 0) > 0) : [];
  if (stages.length === 0) return "-";

  return stages.map((row) => `${display(row?.label || row?.key)} ${display(row?.count, 0)}`).join(" | ");
}

function mixRow(row) {
  return [
    display(row?.label || row?.key),
    display(row?.count, 0),
    percentageLabel(row?.percentage)
  ];
}

function analyticsWindowLabel(payload) {
  const window = payload?.window || {};
  const key = display(window.key, "24h");
  if (!window.started_at || !window.ended_at) return key;

  return `${key}: ${window.started_at} to ${window.ended_at}`;
}

function analyticsActivityLabel(payload) {
  const range = payload?.date_range;
  if (range?.start_date && range?.end_date) {
    return `${range.start_date} to ${range.end_date}`;
  }

  return analyticsWindowLabel(payload);
}

function percentageLabel(value) {
  return value === undefined || value === null || value === "" ? "n/a" : `${value}%`;
}

function humanize(value) {
  const words = String(value || "").trim().replaceAll("-", "_").split("_").filter(Boolean);
  if (words.length === 0) return "-";

  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function writeOperatorRows(context, rows) {
  writeAlignedTable(context, ["MOVE ID", "WORK TYPE", "SUBJECT", "MOTION", "NEXT ACTION"], rows.map(operatorTableRow));
}

function operatorTableRow(row) {
  return [
    display(row?.id),
    operatorWorkTypeLabel(row),
    operatorSubjectLabel(row),
    operatorMotionLabel(row),
    display(nextActionLabel(row))
  ];
}

function operatorWorkTypeLabel(row) {
  return humanize(row?.opportunity_kind || row?.source_kind);
}

function operatorSubjectLabel(row) {
  return display(
    row?.prospect?.display_name ||
      row?.prospect?.name ||
      row?.profile?.display_name ||
      row?.profile?.username ||
      postLabel(row?.post) ||
      row?.display_name ||
      row?.name
  );
}

function operatorMotionLabel(row) {
  return display(row?.motion?.name || row?.motion?.display_name || row?.motion?.prefix_id || row?.motion?.id);
}

function postLabel(post) {
  if (!post) return "";

  const body = String(post.body || "").trim().replace(/\s+/g, " ");
  if (body) return body.length > 48 ? `${body.slice(0, 45)}...` : body;

  return post.url || (post.id ? `Post ${post.id}` : "");
}

function nextActionLabel(source) {
  return source?.recommended_action_label || source?.next_action?.label || source?.cta?.label;
}

function entityLabel(entity) {
  if (!entity) return "";

  const name = entity.display_name || entity.name || entity.prefix_id || entity.id;
  const id = entity.prefix_id || entity.id;
  return id && id !== name ? `${display(name)} (${display(id)})` : display(name);
}

function timingLabel(nextAction, row) {
  const timing = nextAction.timing || {};
  const mode = timing.mode || row.timing_mode;
  const scheduledFor = timing.scheduled_for || row.scheduled_for;
  const parts = compactText([
    mode,
    scheduledFor ? `scheduled for ${scheduledFor}` : null
  ]);

  return parts.join(", ");
}

function targetLabel(nextAction) {
  const target = nextAction.target || {};
  return compactText([
    target.platform,
    target.profile_url,
    target.post_url,
    target.message_event_id ? `message ${target.message_event_id}` : null,
    target.post_id ? `post ${target.post_id}` : null
  ]).join(" | ");
}

function ctaLabel(cta) {
  const action = compactText([cta.action || cta.type, cta.platform ? `on ${cta.platform}` : null]).join(" ");
  const disabled = cta.disabled ? "disabled" : "enabled";
  return `${display(cta.label, "Unnamed CTA")}${action ? ` (${action})` : ""}${cta.disabled === undefined ? "" : `, ${disabled}`}`;
}

function draftLabel(draft) {
  const required = draft.required === true ? "required" : draft.required === false ? "not required" : null;
  const ready = draft.ready === true ? "ready" : draft.ready === false ? "not ready" : null;
  return compactText([draft.state, ready, required]).join(", ") || "unknown";
}

function compactText(values) {
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}

function successCount(payload) {
  if (Array.isArray(payload?.added)) return payload.added.length;
  if (Array.isArray(payload?.removed)) return payload.removed.length;
  if (Array.isArray(payload?.assigned)) return payload.assigned.length;
  return 0;
}

function display(value, fallback = "") {
  return value === undefined || value === null || value === "" ? fallback : value;
}

function singleLine(value) {
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join(", ");
}

function prospectsToCsv(prospects) {
  const profileIdentifiers = profileIdentifiersForPayload({ meta: {} }, prospects);
  const headers = [
    "prefix_id",
    "display_name",
    "name",
    "kind",
    "title",
    "company",
    "email",
    "linkedin_url",
    "website",
    "created_at",
    "updated_at",
    "primary_profile_prefix_id",
    "primary_profile_identifier",
    "primary_profile_username",
    "primary_profile_display_name",
    "primary_profile_job_title",
    "primary_profile_url",
    "primary_profile_status",
    "account_prospect_id",
    "account_prospect_status",
    "account_prospect_score",
    "account_prospect_fit_score",
    "account_prospect_fit_rationale",
    "pipeline_stage",
    "assigned_to_account_user_id",
    "motion_prefix_id",
    "motion_name",
    "motion_kind",
    "motion_status",
    "last_contacted_at",
    "queue_deferred_until",
    "locked_at",
    "lock_kind",
    "list_ids",
    "list_names",
    "recommended_action_label",
    "queue_status_label",
    "queue_status_detail",
    "queue_due_label",
    "queue_rationale",
    "queue_guidance",
    "queue_timing_mode",
    "queue_scheduled_for",
    "queue_latest_touch_at"
  ];
  headers.splice(headers.indexOf("recommended_action_label"), 0, ...profileIdentifiers.flatMap((identifier) => [identifier, `${identifier}_url`]));

  const rows = prospects.map((prospect) => ({
    prefix_id: prospect.prefix_id,
    display_name: prospect.display_name,
    name: prospect.name,
    kind: prospect.kind,
    title: prospect.title,
    company: prospect.company,
    email: prospect.email,
    linkedin_url: prospect.linkedin_url,
    website: prospect.website,
    created_at: prospect.created_at,
    updated_at: prospect.updated_at,
    primary_profile_prefix_id: prospect.primary_profile?.prefix_id,
    primary_profile_identifier: prospect.primary_profile?.identifier,
    primary_profile_username: prospect.primary_profile?.username,
    primary_profile_display_name: prospect.primary_profile?.display_name,
    primary_profile_job_title: prospect.primary_profile?.job_title,
    primary_profile_url: prospect.primary_profile?.url,
    primary_profile_status: prospect.primary_profile?.status,
    account_prospect_id: prospect.account_prospect?.id,
    account_prospect_status: prospect.account_prospect?.status,
    account_prospect_score: prospect.account_prospect?.score,
    account_prospect_fit_score: prospect.account_prospect?.fit_score,
    account_prospect_fit_rationale: prospect.account_prospect?.fit_rationale,
    pipeline_stage: prospect.account_prospect?.pipeline_stage,
    assigned_to_account_user_id: prospect.account_prospect?.assigned_to_account_user_id,
    motion_prefix_id: prospect.account_prospect?.motion?.prefix_id,
    motion_name: prospect.account_prospect?.motion?.name,
    motion_kind: prospect.account_prospect?.motion?.kind,
    motion_status: prospect.account_prospect?.motion?.status,
    last_contacted_at: prospect.account_prospect?.last_contacted_at,
    queue_deferred_until: prospect.account_prospect?.queue_deferred_until,
    locked_at: prospect.account_prospect?.locked_at,
    lock_kind: prospect.account_prospect?.lock_kind,
    list_ids: (prospect.lists || []).map((list) => list.prefix_id).join(" | "),
    list_names: (prospect.lists || []).map((list) => list.name).join(" | "),
    recommended_action_label: prospect.queue?.recommended_action_label,
    queue_status_label: prospect.queue?.status_label,
    queue_status_detail: prospect.queue?.status_detail,
    queue_due_label: prospect.queue?.due_label,
    queue_rationale: prospect.queue?.rationale,
    queue_guidance: prospect.queue?.guidance,
    queue_timing_mode: prospect.queue?.timing_mode,
    queue_scheduled_for: prospect.queue?.scheduled_for,
    queue_latest_touch_at: prospect.queue?.latest_touch_at
  }));

  rows.forEach((row, index) => {
    const prospect = prospects[index];
    for (const identifier of profileIdentifiers) {
      row[identifier] = profileCitationIdsForIdentifier(prospect, identifier);
      row[`${identifier}_url`] = profileUrlsForIdentifier(prospect, identifier);
    }
  });

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvField(row[header])).join(","))
  ].join("\n");
}

function prospectCheckToCsv(prospects) {
  const headers = [
    "prefix_id",
    "display_name",
    "name",
    "title",
    "reported_company",
    "company_certification_status",
    "company_certification_reason",
    "email",
    "linkedin_url",
    "app_url",
    "account_prospect_status",
    "pipeline_stage",
    "assigned_to_account_user_id",
    "motion_prefix_id",
    "motion_name",
    "updated_at"
  ];

  const rows = prospects.map((prospect) => {
    const certification = prospect.company_certification || {};
    return {
      prefix_id: prospect.prefix_id,
      display_name: prospect.display_name,
      name: prospect.name,
      title: prospect.title,
      reported_company: certification.reported_company || prospect.company,
      company_certification_status: certification.status,
      company_certification_reason: certification.reason,
      email: prospect.email,
      linkedin_url: prospect.linkedin_url,
      app_url: prospect.app_url,
      account_prospect_status: prospect.account_prospect?.status,
      pipeline_stage: prospect.account_prospect?.pipeline_stage,
      assigned_to_account_user_id: prospect.account_prospect?.assigned_to_account_user_id,
      motion_prefix_id: prospect.account_prospect?.motion?.prefix_id,
      motion_name: prospect.account_prospect?.motion?.name,
      updated_at: prospect.updated_at
    };
  });

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvField(row[header])).join(","))
  ].join("\n");
}

function withProspectAppUrls(payload, host) {
  if (!payload || !Array.isArray(payload.prospects)) return payload;

  return {
    ...payload,
    prospects: payload.prospects.map((prospect) => ({
      ...prospect,
      app_url: prospectAppUrl(prospect, host)
    }))
  };
}

function prospectAppUrl(prospect, host) {
  const prospectId = String(prospect?.prefix_id || "").trim();
  if (!prospectId) return undefined;

  try {
    return new URL(`/prospects/${encodeURIComponent(prospectId)}`, normalizeHost(host)).toString();
  } catch {
    return undefined;
  }
}

function sequenceExportRowsToCsv(rows) {
  return [
    SEQUENCE_EXPORT_CSV_COLUMNS.join(","),
    ...rows.map((row) => SEQUENCE_EXPORT_CSV_COLUMNS.map((column) => csvField(row?.[column])).join(","))
  ].join("\n");
}

function csvField(value) {
  const text = value === undefined || value === null ? "" : String(value);
  if (!/[",\n]/.test(text)) return text;

  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function profileIdentifiersForPayload(payload, prospects) {
  const configured = Array.isArray(payload?.meta?.profile_identifier_columns) ? payload.meta.profile_identifier_columns : [];
  if (configured.length > 0) return configured;

  const identifiers = new Set(DEFAULT_PROFILE_IDENTIFIERS);

  for (const prospect of prospects) {
    for (const profile of Array.isArray(prospect?.profiles) ? prospect.profiles : []) {
      const identifier = String(profile?.identifier || "").trim();
      if (identifier) identifiers.add(identifier);
    }
    for (const identifier of Object.keys(prospect?.profile_identifiers?.values || {})) {
      if (identifier) identifiers.add(identifier);
    }
  }

  return [
    ...DEFAULT_PROFILE_IDENTIFIERS.filter((identifier) => identifiers.has(identifier)),
    ...Array.from(identifiers).filter((identifier) => !DEFAULT_PROFILE_IDENTIFIERS.includes(identifier)).sort()
  ];
}

function profileCitationIdsForIdentifier(prospect, identifier) {
  return profileEntriesForIdentifier(prospect, identifier)
    .map((profile) => profileCitationId(profile))
    .filter(Boolean)
    .join(", ");
}

function profileUrlsForIdentifier(prospect, identifier) {
  return profileEntriesForIdentifier(prospect, identifier)
    .map((profile) => String(profile?.url || "").trim())
    .filter(Boolean)
    .join(", ");
}

function profileEntriesForIdentifier(prospect, identifier) {
  const values = prospect?.profile_identifiers?.values;
  const structuredEntries = Array.isArray(values?.[identifier]) ? values[identifier] : null;
  if (structuredEntries) return structuredEntries;

  const profiles = Array.isArray(prospect?.profiles) ? prospect.profiles : [];
  return profiles.filter((profile) => String(profile?.identifier || "").trim() === identifier);
}

function profileCitationId(profile) {
  const citationId = String(profile?.citation_id || "").trim();
  if (citationId) return citationId;

  const identifier = String(profile?.identifier || "").trim();
  const username = String(profile?.username || "").trim();
  if (identifier && username) return `${identifier}:${username}`;

  return identifier || username;
}

function usage() {
  return helpFor([]);
}

function helpFor(topicParts) {
  const topic = topicParts.join(" ").trim();
  if (topic === "methodology") return methodologyHelp();
  const helpText = HELP_TOPICS.get(topic);
  if (!helpText) {
    throw new CommandError(`No help topic found for "${topic || "audienti"}". Run \`audienti --help\`.`);
  }

  return helpText;
}

const HELP_TOPICS = new Map([
  ["skills", "Usage:\n  audienti skills list [--json]\n  audienti skills show <name> [--json]\n\nList bundled agent skills and the Audienti marketplace snapshot. Show bundled instructions or upstream links and install commands. No login, app call or installation is performed."],
  ["skills list", "Usage:\n  audienti skills list [--json]\n\nList bundled skills and marketplace discovery metadata without network or login."],
  ["skills show", "Usage:\n  audienti skills show <name> [--json]\n\nPrint bundled skill instructions, or upstream source links and host-specific install commands. Read each upstream README for its dependencies. Installation is a separate action."],
  ["tools gift-research", "Usage:\n  audienti tools gift-research --url <website> [--json]\n\nGive the agent the website-gift-research skill and the supplied HTTP(S) URL. The agent browses using its own tools. The CLI does not fetch the website, call Audienti, require login, create gifts or return research results.\n\nRead the skill without a website:\n  audienti skills show audienti-gift-research"],
  ["", [
    "Usage:",
    "  audienti <command> [options]",
    "",
    "Start:",
    "  audienti start                      Guided first run: sign in, pay, set up your first experiment",
    "  audienti setup                      Guided setup of your first experiment",
    "  audienti auth login                 Sign in through the browser",
    "  audienti auth token <token>         Save an API token",
    "  audienti accounts list             See accounts available to this token",
    "  audienti accounts select <acct_id>  Use one account by default",
    "  audienti users select <user>        Use one account user by default",
    "  audienti help agent-workflows       Common agent/operator paths",
    "  audienti help methodology           Outbound experiment strategy",
    "  audienti skills list                Bundled skills and marketplace discovery",
    "",
    "Work areas:",
    "  Setup & identity",
    "    audienti auth status",
    "    audienti config list",
    "    audienti accounts show [acct_id]",
    "    audienti update check",
    "    audienti setup play preflight",
    "    audienti users list",
    "    audienti users select <account_user_id|email|name|me>",
    "    audienti users activity [account_user_id|me]",
    "    audienti users automation show <account_user_id|me>",
    "    audienti users automation update <account_user_id|me> --payload <file.json> [--apply]",
    "",
    "  Email sync",
    "    audienti social-cookies sync-messages <scok_id> [--folder <folder>] [--retry]",
    "",
    "  Motions / plays",
    "    audienti motions list",
    "    audienti motions show <motn_id>",
    "    audienti motions analytics <motn_id>",
    "    audienti motions run-discovery <motn_id>",
    "    audienti motions quick-start --url <company_url> --confirm --wait",
    "    audienti motions prospects <motn_id>",
    "    audienti motions abm-companies <motn_id> list",
    "    audienti motions abm-companies <motn_id> add <domain_or_linkedin_url>...",
    "    audienti motions create --payload <file.json>",
    "    audienti motions update <motn_id> [--status <state>] [--tags <tag[,tag...]>] [--own-post-engagement <true|false>] [--start-date <date|none>] [--end-date <date|none>] [--maximum-company-count <n|none>] [--approach <text>]",
    "    audienti motions update <motn_id> --payload <file.json>",
    "    audienti motions add-tag <motn_id> <tag>",
    "    audienti motions remove-tag <motn_id> <tag>",
    "    audienti motions activate <motn_id>",
    "    audienti motions pause <motn_id>",
    "    audienti motions delete <motn_id> --confirm <yes|true|Y|y>",
    "    audienti motions clone <motn_id> --name <text>",
    "    audienti motions move-prospects <source_motn_id> --target <target_motn_id> <prsp_id> [prsp_id...]",
    `    Tip: ${MOTION_ALIASES.map((alias) => "`" + alias + "`").join(", ")} are aliases for motions; see audienti help methodology.`,
    "",
    "  ContentOps",
    "    audienti content programs",
    "    audienti content plan <cprg_id>",
    "    audienti content show <cpwi_id>",
    "    audienti content track <linkedin_post_url>",
    "    audienti content posts",
    "    audienti content engagement <cpwi_id>",
    "    audienti content feedback <cpwi_id> --message <text>",
    "    audienti content approve <cpwi_id>",
    "    audienti content publish <cpwi_id> --url <permalink>",
    "    audienti content comments",
    "",
    "  Prospects",
    "    audienti prospects list [filters]",
    "    audienti prospects check [filters]",
    "    audienti prospects show <prsp_id>",
    "    audienti prospects assign <prsp_id> --assigned-user <id|me|unassign>",
    "    audienti prospects move-account <prsp_id> --target-account <acct_id> [--apply]",
    "    audienti prospects set-status <prsp_id> --status <active|nurture|non_responsive|not_fit|bad_data_404|rejected>",
    "    audienti prospects replan <prsp_id> [--apply]",
    "    audienti prospects reenrich <prsp_id> [--apply]",
    "    audienti prospects refresh-queue <prsp_id> [--apply]",
    "    audienti prospects lock <prsp_id> [--note <text>]",
    "    audienti prospects reject <prsp_id>",
    "    audienti prospects nurture <prsp_id> [--reason <reason>]",
    "    audienti prospects restore <prsp_id>",
    "    audienti prospects unlock <prsp_id>",
    "    audienti prospects timeline <prsp_id>",
    "    audienti prospects import <linkedin_url> [--motion <motn_id>]",
    "    audienti prospects import-batch --file <csv|jsonl|json>",
    "    audienti prospects add-note <prsp_id> --message <text>",
    "    audienti prospects add-profile <prsp_id> --url <profile_url|email|phone>",
    "",
    "  Lists & targeting inputs",
    "    audienti lists list [--tag <tag>]",
    "    audienti lists prospects <list_id>",
    "    audienti lists add-tag <list_id> <tag>",
    "    audienti lists remove-tag <list_id> <tag>",
    "    audienti lists routing-rules <list_id> list",
    "    audienti lists routing-rules <list_id> create --payload <file.json>",
    "    audienti lists routing-rules <list_id> apply",
    "    audienti lists bulk-add-tag --tag <tag> <list_id> [list_id...]",
    "    audienti lists merge <list_id> <list_id>",
    "    audienti lists export <list_id> [--output <file.csv>]",
    "    audienti find <name>",
    "    audienti tags list",
    "    audienti tags show <tag>",
    "    audienti tasks list [--status open]",
    "    audienti tasks add --title <text> --due <time>",
    "    audienti tasks complete <ptsk_id>",
    "    audienti tasks update <ptsk_id> [--title <text>]",
    "    audienti tasks bulk-update --action <complete|reassign> <ptsk_id> [ptsk_id...]",
    "    audienti offers list",
    "    audienti offers show <offr_id>",
    "    audienti offers update <offr_id> [--name <text>]",
    "    audienti offers delete <offr_id> --confirm <yes|true|Y|y>",
    "    audienti offers regenerate-research <offr_id> [--guidance <text>]",
    "    audienti offers update-writeup <offr_id> --description <text>",
    "    audienti offers add-artifacts <offr_id> <file> [file...]",
    "    audienti offers add-gift <offr_id> --title <text> [--send-url <url>]",
    "    audienti icps list [--status <active|archived|all>] [--tag <tag>]",
    "    audienti icps show <icp_id>",
    "    audienti icps update <icp_id> [--tags <tag[,tag...]> | --payload <file.json>]",
    "    audienti icps archive <icp_id>",
    "    audienti icps restore <icp_id>",
    "    audienti icps add-tag <icp_id> <tag>",
    "    audienti icps remove-tag <icp_id> <tag>",
    "    audienti icps bulk-add-tag --tag <tag> <icp_id> [icp_id...]",
    "    audienti icps clone <icp_id>",
    "    audienti icps delete <icp_id> --confirm <yes|true|Y|y>",
    "    audienti icps prospects <icp_id> [--query <text>]",
    "    audienti companies search --query <text>",
    "    audienti linkedin-lookups <kind> [--query <text>]",
    "    audienti dnc list",
    "    audienti dnc add <email|citation_id|profile_url>",
    "    audienti company-rules list",
    "    audienti company-rules show <rule_id>",
    "    audienti company-rules create (--linkedin-url <url> | --domain <domain>) --disposition <state>",
    "    audienti hubspot show",
    "    audienti webhooks list",
    "    audienti brand-profile show",
    "    audienti payment show",
    "    audienti payment code <signup_code>",
    "    audienti reply-alerts show",
    "",
    "  Writer",
    "    audienti writer test-run <prsp_id>",
    "    audienti prospects write <prsp_id> --type <surface_key>",
    "    audienti prospects sequence-export <prsp_id>",
    "",
  "  Operator queue",
  "    audienti operator next --plan",
  "    audienti operator answer <row_id> (--choice <id> | --answer <text>)",
  "    audienti operator next --done --note <text>",
  "    audienti operator queue",
  "    audienti operator failed-drafts",
  "    audienti operator failed-drafts requeue <row_id>",
  "",
  "  Inbox Ops",
  "    audienti inbox-ops queue [--group-by domain]",
  "    audienti inbox-ops ignore <numbers|ranges> --yes",
  "    audienti inbox-ops filter-domain <numbers|ranges> | --domain <domain> --yes",
  "    audienti inbox-ops filter-sender|allow-sender|allow-domain <numbers|ranges> --yes",
  "    audienti inbox-ops filters",
  "    audienti inbox-ops rule <row_id> --scope <sender|domain> --disposition <allow|filter>",
  "",
  "  Network Ops",
  "    audienti network-ops queue",
  "    audienti network-ops accept <row_id>",
  "    audienti network-ops decline <row_id>",
  "",
    "  Analytics",
    "    audienti analytics motions",
    "    audienti analytics prospects --window 24h",
    "    audienti analytics dashboard --play-tag <tag>",
    "    audienti analytics metrics --cohort-preset week-to-date",
    "    audienti analytics stages --interval weekly",
    "    audienti analytics cohorts create-list --name \"Blank note test\" --start 2026-07-20 --end 2026-07-20 --note-mode blank",
    "    audienti analytics prospects cohort-analysis --weeks 4 --motion <motn_id>",
    "    audienti analytics users --user me --window 30d",
    "    audienti analytics visibility --window 24h --user me",
    "    audienti analytics content --window week",
    "",
    "  Utilities",
    "    audienti tools list",
    "    audienti tools get email --url <linkedin_url>",
    "    audienti tools get phone --url <linkedin_url>",
    "    audienti tools humanize --file <path>",
    "    audienti tools linkedin-review --url <linkedin_url> [--icp <icp_id>]",
    "    audienti tools linkedin-review reports",
    "    audienti tools linkedin-review show <rprt_id>",
    "",
    "Common flows:",
    "  Work the next move:  audienti operator next --plan",
    "  Inspect a prospect:  audienti prospects show <prsp_id> --json",
    "  Preview a campaign:  audienti writer test-run <prsp_id>",
    "  Research website gifts: audienti tools gift-research --url <website>",
    "  Analyze one motion:  audienti motions analytics <motn_id>",
    "  Audit motion mix:    audienti analytics motions",
    "  Count one campaign:   audienti analytics dashboard --play-tag <tag>",
    "  Inspect outcomes:      audienti analytics metrics --cohort-preset week-to-date",
    "  Compare stage rates:  audienti analytics stages --interval weekly",
    "  Audit your work:     audienti analytics users --user me --window 30d",
    "  Review reminders:    audienti tasks list",
    "",
    "Global options:",
    "  --account <acct_id>  Use an account for one command without saving it",
    "  --help, -h           Show help",
    "",
    "More help:",
    "  audienti <area> help            Example: audienti prospects help",
    "  audienti <area> <command> help  Example: audienti analytics prospects help",
    "  Use --json when another program or agent will consume the output."
  ].join("\n")],

  ["auth", [
    "Usage:",
    "  audienti auth login [--host <url>] [--timeout-seconds <n>] [--no-open] [--json]",
    "  audienti auth token <token> [--host <url>]",
    "  audienti auth status",
    "  audienti auth logout",
    "",
    "Status: implemented",
    "",
    "Commands:",
    "  audienti auth login          Open Audienti in a browser and save the returned token",
    "  audienti auth token <token>  Validate and save a bearer API token",
    "  audienti auth status         Check live auth and show selected account",
    "  audienti auth logout         Delete local CLI auth config",
    "",
    "Run `audienti auth login help` for browser authentication."
  ].join("\n")],

  ["auth login", [
    "Usage:",
    "  audienti auth login [--host <url>] [--timeout-seconds <n>] [--no-open] [--json]",
    "",
    "Status: implemented",
    "",
    "Options:",
    "  --host <url>           Audienti host. Default: https://app.audienti.com",
    "  --timeout-seconds <n>  Wait budget before the command fails. Default: 180",
    "  --no-open              Print the URL without opening a browser",
    "  --json                 Print machine-readable start and completion payloads",
    "",
    "Flow:",
    "  Starts a temporary 127.0.0.1 callback server, opens /cli/auth in the browser,",
    "  and saves the returned API token to ~/.config/audienti/config.json after validation.",
    "",
    "Example:",
    "  audienti auth login --host https://app.audienti.com"
  ].join("\n")],

  ["auth token", [
    "Usage:",
    "  audienti auth token <token> [--host <url>]",
    "",
    "Status: implemented",
    "",
    "Options:",
    "  --host <url>  Audienti host. Default: https://app.audienti.com",
    "",
    "Input shape:",
    "  token: string  Existing V10 API token copied from /api_tokens",
    "  host: url      Optional absolute http(s) URL",
    "",
    "Validation:",
    "  Calls GET /api/v1/me.json with Authorization: Bearer <token> before saving.",
    "",
    "Local config:",
    "  Writes host and token to ~/.config/audienti/config.json with mode 0600.",
    "",
    "Example:",
    "  audienti auth token aud_123 --host http://localhost:3000"
  ].join("\n")],

  ["auth status", [
    "Usage:",
    "  audienti auth status [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Output shape:",
    "  Host: string",
    "  Token: masked string",
    "  User: string",
    "  Active account: account name and acct_ id, or none selected",
    "  Default account user: account user name and id, or none selected"
  ].join("\n")],

  ["auth logout", [
    "Usage:",
    "  audienti auth logout",
    "",
    "Status: implemented",
    "",
    "Effect:",
    "  Deletes ~/.config/audienti/config.json if it exists."
  ].join("\n")],

  ["config", [
    "Usage:",
    "  audienti config list [--json]",
    "",
    "Status: implemented",
    "",
    "Commands:",
    "  audienti config list  Show the local CLI config path and saved values"
  ].join("\n")],

  ["config list", [
    "Usage:",
    "  audienti config list [--json]",
    "",
    "Status: implemented",
    "",
    "Output shape:",
    "  Path: absolute config.json path",
    "  Exists: yes|no",
    "  Host: string or none",
    "  Token: masked string or none",
    "  Active account: account name and acct_ id, or none selected",
    "  Default account user: account user name and id, or none selected"
  ].join("\n")],

  ["update", [
    "Usage:",
    "  audienti update check [--json] [--registry <url>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Check whether this local Audienti CLI install is behind the latest published package.",
    "",
    "Commands:",
    "  audienti update check  Compare the local package version to the npm registry"
  ].join("\n")],

  ["update check", [
    "Usage:",
    "  audienti update check [--json] [--registry <url>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Report whether this local CLI should be updated.",
    "",
    "Output shape:",
    "  package_name: @audienti/cli",
    "  current_version: local package version",
    "  latest_version: latest registry version, or null when unknown",
    "  update_available: true | false | null",
    "  status: current | update_available | unknown",
    "  install_command: npm install --global @audienti/cli",
    "  registry: registry URL used for the check",
    "  checked_at: ISO timestamp",
    "  error: string | null",
    "",
    "Options:",
    "  --registry <url>  Alternate npm-compatible registry. Default: https://registry.npmjs.org",
    "",
    "Example:",
    "  audienti update check --json"
  ].join("\n")],

  ["accounts", [
    "Usage:",
    "  audienti accounts list [--json]",
    "  audienti accounts show [<acct_id>] [--json]",
    "  audienti accounts select <acct_id>",
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  acct_id: string  Account prefix id, for example acct_abc123"
  ].join("\n")],

  ["social-cookies", [
    "Usage:",
    "  audienti social-cookies sync-messages <scok_id> [--folder <folder>] [--retry] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Commands:",
    "  audienti social-cookies sync-messages  Request the shared durable email sync slot",
    "",
    "Run `audienti social-cookies sync-messages help` for the request and output contract."
  ].join("\n")],

  ["social-cookies sync-messages", [
    "Usage:",
    "  audienti social-cookies sync-messages <scok_id> [--folder <folder>] [--retry] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Request one account-scoped email sync through the server's durable cookie/folder slot.",
    "",
    "Input shape:",
    "  scok_id: string  Social cookie prefix id or numeric id",
    "  folder: string   Provider folder; omitted means the server's INBOX default",
    "  retry: flag       Explicitly reopen an exhausted or credential-held slot",
    "",
    "Output shape:",
    "  requested, coalesced, reason, sync_states  Server response and durable slot status",
    "  sync_states      Includes status, generation, attempts, due, last error, and watermark",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/social_cookies/:id/sync_messages.json",
    "  The CLI only requests work; provider traversal remains owned by the server worker."
  ].join("\n")],

  ["accounts list", [
    "Usage:",
    "  audienti accounts list [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Output shape:",
    "  id: integer       Raw database id",
    "  prefix_id: acct_  Stable account id for CLI/API routes",
    "  name: string",
    "",
    "Example:",
    "  audienti accounts list --json"
  ].join("\n")],

  ["accounts show", [
    "Usage:",
    `  ${ACCOUNTS_SHOW_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  GET /api/v1/accounts/:id.json",
    "",
    "Input shape:",
    "  acct_id: string  Account prefix id; defaults to --account or the selected account",
    "",
    "Output shape:",
    "  id, prefix_id, name, personal, owner_id, account_users[], created_at, updated_at"
  ].join("\n")],

  ["linkedin-lookups", [
    "Usage:",
    `  ${LINKEDIN_LOOKUPS_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Look up LinkedIn targeting values (the ids used in ICP filters).",
    "",
    "Kinds:",
    "  job-titles, functions, locations  --query required",
    "  industries                        --query required; --icp not supported",
    "  seniorities                       --query optional filter",
    "  company-sizes, company-types      no --query; returns the full list",
    "",
    "ICP option:",
    "  --icp <icp_id> uses values saved on that ICP of the active account (or --account).",
    "  For company-sizes, company-types and seniorities it also saves the list onto that ICP.",
    "",
    "API:",
    "  GET /api/v1/linkedin_lookups/<kind>.json?q=<text>&icp_id=<icp_id>",
    "",
    "Output shape:",
    "  [{ id, name, source? }]",
    "",
    "Example:",
    "  audienti linkedin-lookups job-titles --query \"head of sales\" --json"
  ].join("\n")],

  ["accounts select", [
    "Usage:",
    "  audienti accounts select <acct_id>",
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  acct_id: string  Exact acct_ id, exact account name, or a unique name/id fragment",
    "",
    "Effect:",
    "  Saves accountId and accountName in local CLI config."
  ].join("\n")],

  ["start", [
    "Usage:",
    `  ${START_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Guided first run, the same path as the web. Prints the intro, signs you in (or sends you to",
    "  create an account) through the browser, and picks your account and account user. An unpaid",
    "  account pays by card on the web pay page (opened for you; the terminal waits) or types a",
    "  signup code here. Then setup runs in the terminal from the step you are on: your company,",
    "  verify your targeting (change the audience, offer or signals card), and create the experiment.",
    "  Connecting LinkedIn is finished on the web; the command prints the page address.",
    "  Running `audienti` with no arguments and no saved login starts here.",
    "",
    "Without a terminal:",
    "  Never asks questions. Prints the sign-in command, the pay page when payment is needed, and",
    "  the next step; `--json` returns them (status payment_required with payment_url when unpaid).",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/admission.json",
    "  POST /api/v1/accounts/:account_id/admission.json",
    "  GET /api/v1/accounts/:account_id/quick_start/setup_state.json",
    "",
    "Effect:",
    "  Saves the login, accountId and accountUserId in local CLI config. A signup code is used only",
    "  when you type one. Creates an experiment only when you say so. Sends nothing."
  ].join("\n")],

  ["setup", [
    "Usage:",
    `  ${SETUP_USAGE.slice("Usage: ".length)}`,
    "  audienti setup play preflight [--principal <account_user_id|email|name|me>] [--platform linkedin] [--json]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  `audienti setup` asks three questions (company website, who you sell to, what the prospect",
    "  should say yes to), and your city, state or province, and country when the account needs them.",
    "  It drafts an audience, offer and signals with Quick Start and shows the cards. Type a, o or s",
    "  to change one card (the same editor as the web setup page), or press Enter to create the",
    "  experiment. Then it prints the web page where you connect LinkedIn to go live.",
    "  Nothing sends until LinkedIn is connected and approved.",
    "  Preflight account setup before an agent creates or activates an Audienti play.",
    "",
    "Without a terminal:",
    "  Pass --url (required) and optionally --sell-to, --ask, and --city/--state/--country.",
    "  Add --yes to create the draft.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/quick_start.json",
    "  GET /api/v1/accounts/:account_id/quick_start/:draft_id.json",
    "  PATCH /api/v1/accounts/:account_id/quick_start/:draft_id.json",
    "  POST /api/v1/accounts/:account_id/quick_start/:draft_id/confirm.json",
    "",
    "Commands:",
    "  audienti setup                 Guided setup of your first experiment",
    "  audienti setup play preflight  Check connected-account readiness and direct setup URLs"
  ].join("\n")],

  ["setup play", [
    "Usage:",
    "  audienti setup play preflight [--principal <account_user_id|email|name|me>] [--platform linkedin] [--json]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Check the sender identity prerequisites for a new motion or play."
  ].join("\n")],

  ["setup play preflight", [
    "Usage:",
    `  ${SETUP_PLAY_PREFLIGHT_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Verify that the selected principal has a connected account mapped to the current Audienti account before a play starts capture or outreach.",
    "",
    "Output shape:",
    "  ready: true when the selected principal has a mapped, actionable platform account",
    "  reason: ready | needs_setup | needs_account_access | needs_reconnect",
    "  setup_url: direct operations URL for creating a connected account",
    "  social_cookie.automation.active_days: normalized active day tokens used by server automation guards",
    "  social_cookie.automation.working_hours: normalized timed windows by day token; omitted days are all-day or inactive based on active_days",
    "  social_cookie.automation.time_zone: effective timezone used by server automation guards",
    "  social_cookie.automation.in_working_hours: server-side current schedule decision",
    "  account_user.location: configured user location used as the proxy fallback; unknown fields are null",
    "  social_cookie.proxy_location: configured and last-verified effective proxy geography plus its source",
    "  social_cookie.capabilities.linkedin: stored premium and sales_navigator booleans (null means unknown), plus checked_at; missing or unauthorized data is unknown",
    "  Stored capabilities may be stale. Preflight does not check the provider again.",
    "  social_cookie.automation.pacing: effective LinkedIn quotas, ramp settings, invitation inventory authority, and current capacity",
    "  social_cookie.urls.mapping_url: owner URL for granting account access",
    "  social_cookie.urls.edit_url: operations URL for reconnect/settings review when mapped",
    "",
    "Examples:",
    "  audienti setup play preflight --principal me --platform linkedin",
    "  audienti setup play preflight --principal 42 --json",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/social_cookies.json"
  ].join("\n")],

  ["users", [
    "Usage:",
    "  audienti users list [--json]",
    "  audienti users select <account_user_id|email|name|me>",
    "  audienti users activity [account_user_id|me] [--json]",
    "  audienti users automation show <account_user_id|me> [--platform linkedin] [--json]",
    "  audienti users automation update <account_user_id|me> --payload <file.json> [--apply] [--json]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  List and select the account users that can be used as motion principals or assignees.",
    "",
    "CLI synonym:",
    "  `principals` is accepted anywhere `users` is accepted"
  ].join("\n")],

  ["users automation", [
    "Usage:",
    `  ${USERS_AUTOMATION_SHOW_USAGE.slice("Usage: ".length)}`,
    `  ${USERS_AUTOMATION_UPDATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Inspect or propose account-user-specific LinkedIn automation controls and safety limits.",
    "  Updates preview by default. Only --apply requests persistence."
  ].join("\n")],

  ["users automation show", [
    "Usage:",
    `  ${USERS_AUTOMATION_SHOW_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Read the selected account user's configured and effective automation policy, current usage, remaining capacity, and binding limits.",
    "",
    "Behavior:",
    "  platform defaults to linkedin and currently accepts linkedin only.",
    "  JSON output is the unchanged server response.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/users/:id/automation.json?platform=linkedin"
  ].join("\n")],

  ["users automation update", [
    "Usage:",
    `  ${USERS_AUTOMATION_UPDATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Preview or apply principal-specific LinkedIn controls and hourly, daily, or weekly safety limits.",
    "",
    "Behavior:",
    "  The command does not persist without --apply.",
    "  The CLI merges platform=linkedin and apply=false|true into the payload; those values cannot be overridden by the file.",
    "  Omitted controls are preserved by the server. JSON output is the unchanged server response.",
    "",
    "Payload fields:",
    "  automation_controls: automation booleans, including writing, contact, visibility, and risk-cooldown gates",
    "  action_limits: hourly/daily/weekly caps keyed by profile_view, follow, like, invite, message, comment, or aggregate visibility",
    "  visibility_ramp: enabled, starting_daily_limit, weekly_increment, and optional started_at",
    "",
    "Request body:",
    "  { \"automation\": { ...payload, \"platform\": \"linkedin\", \"apply\": false } }",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/users/:id/automation.json?platform=linkedin"
  ].join("\n")],

  ["users list", [
    "Usage:",
    "  audienti users list [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/users.json",
    "",
    "Output shape:",
    "  id: integer  Account user id used by principal_account_user_id and assigned_user_id",
    "  user_id: integer",
    "  name: string",
    "  email: string",
    "  roles: [admin | member]",
    "  current: boolean"
  ].join("\n")],

  ["users select", [
    "Usage:",
    "  audienti users select <account_user_id|email|name|me> [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Save a default account user for commands that accept `me` or default to the current operator.",
    "",
    "Behavior:",
    "  Validates the account user against `audienti users list` for the active account before saving.",
    "  Selecting a different account with `audienti accounts select` clears the saved account user.",
    "  Passing --account selects the account user for that account and makes it the active account.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/users.json"
  ].join("\n")],

  ["users activity", [
    "Usage:",
    `  ${USERS_ACTIVITY_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Inspect one workspace user's outbound activity feed and action summary.",
    "",
    "Input shape:",
    "  account_user_id: integer account user id, or me for the saved default account user when configured",
    "  mode: actor | account_usage | related",
    "  window: 24h | 7d | 30d",
    "  platform: linkedin | email | gmail",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/operations/users/:user_id/activity.json"
  ].join("\n")],

  ["offers", [
    "Usage:",
    "  audienti offers list [--json]",
    "  audienti offers show <offr_id> [--json]",
    "  audienti offers create --name <text> [--json]",
    "  audienti offers update <offr_id> [--name <text>] [--json]",
    "  audienti offers delete <offr_id> --confirm <yes|true|Y|y> [--json]",
    "  audienti offers regenerate-research <offr_id> [--guidance <text>] [--json]",
    "  audienti offers update-writeup <offr_id> --description <text> [--json]",
    "  audienti offers add-artifacts <offr_id> <file> [file...] [--json]",
    "  audienti offers remove-artifact <offr_id> <artifact_id> [--json]",
    "  audienti offers add-gift <offr_id> --title <text> [--send-url <url> | --file <path>] [--json]",
    "  audienti offers update-gift <offr_id> <gift_id> [--title <text>] [--send-url <url>] [--json]",
    "  audienti offers turn-off-gift <offr_id> <gift_id> [--json]",
    "  audienti offers turn-on-gift <offr_id> <gift_id> [--json]",
    "  audienti offers update-insight <offr_id> <insight_id> [--content <text>] [--json]",
    "  audienti offers turn-off-insight <offr_id> <insight_id> [--json]",
    "  audienti offers turn-on-insight <offr_id> <insight_id> [--json]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Manage the offers available to the current account so an agent can choose offer_id for motion creation."
  ].join("\n")],

  ["offers list", [
    "Usage:",
    "  audienti offers list [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/offers.json",
    "",
    "Output shape:",
    "  id: integer",
    "  prefix_id: offr_",
    "  name: string",
    "  description: string | null",
    "  url: string | null"
  ].join("\n")],

  ["offers create", [
    "Usage:",
    "  audienti offers create --name <text> [--description <text>] [--url <url>] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Create a new offer that can be used immediately for motion creation.",
    "",
    "Input shape:",
    "  name: string  Required offer name",
    "  description: string | optional when url is provided",
    "  url: string | optional when description is provided",
    "",
    "Validation:",
    "  The offer model requires name plus either description or url.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/offers.json",
    "",
    "JSON body:",
    "  {",
    "    \"offer\": {",
    "      \"name\": \"Renewal acceleration audit\",",
    "      \"description\": \"Help revenue teams find renewals at risk before QBRs.\",",
    "      \"url\": \"https://example.com/renewal-audit\"",
    "    }",
    "  }"
  ].join("\n")],

  ["offers show", [
    "Usage:",
    `  ${OFFERS_SHOW_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Show one offer with its artifacts, gifts, and insights.",
    "  A gift is a free, useful thing the offer already has. It is ready once it has a send link or a file; otherwise it needs a link.",
    "  An insight is an exact fact or quote with its source.",
    "",
    "Input shape:",
    "  offr_id: offr_ prefixed id or integer id",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/offers/:id.json"
  ].join("\n")],

  ["offers update", [
    "Usage:",
    `  ${OFFERS_UPDATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Update simple offer fields without changing linked motions.",
    "",
    "Input shape:",
    "  offr_id: offr_ prefixed id or integer id",
    "  name: string | optional",
    "  description: string | optional",
    "  url: string | optional",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/offers/:id.json"
  ].join("\n")],

  ["offers delete", [
    "Usage:",
    `  ${OFFERS_DELETE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  offr_id: offr_ prefixed id or integer id",
    "  confirm: one of yes, true, Y, y",
    "",
    "API:",
    "  DELETE /api/v1/accounts/:account_id/offers/:id.json"
  ].join("\n")],

  ["icps", [
    "Usage:",
    "  audienti icps list [--status <active|archived|all>] [--tag <tag>] [--json]",
    "  audienti icps show <icp_id> [--json]",
    "  audienti icps create (--name <text> | --payload <file.json>) [--json]",
    "  audienti icps update <icp_id> ([--tags <tag[,tag...]>] | --payload <file.json>) [--json]",
    "  audienti icps analytics [--json]",
    "  audienti icps add-tag <icp_id> <tag> [--json]",
    "  audienti icps remove-tag <icp_id> <tag> [--json]",
    "  audienti icps archive <icp_id> [--json]",
    "  audienti icps restore <icp_id> [--json]",
    "  audienti icps bulk-add-tag --tag <tag> <icp_id> [icp_id...] [--json]",
    "  audienti icps clone <icp_id> [--json]",
    "  audienti icps delete <icp_id> --confirm <yes|true|Y|y> [--json]",
    "  audienti icps prospects <icp_id> [--query <text>] [--json]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  List the ICPs available to the current account so an agent can choose icp_id for motion creation or targeting work."
  ].join("\n")],

  ["icps analytics", [
    "Usage:",
    `  ${ANALYTICS_ICPS_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Show the account ICP portfolio's current prospect source mix and rolling seven-day contribution.",
    "",
    "Attribution:",
    "  Current and last-seven-day counts use the recorded source ICP and fall back to the current motion ICP only when source is blank.",
    "  Unattributed means no attributable account source ICP.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/analytics/icps.json"
  ].join("\n")],

  ["icps list", [
    "Usage:",
    `  ${ICPS_LIST_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Options:",
    "  --status <active|archived|all>  Default: active",
    "  --tag <tag>  Filter locally to ICPs whose tags include the normalized tag",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/icps.json",
    "",
    "Output shape:",
    "  id: integer",
    "  prefix_id: icpp_",
    "  name: string",
    "  archived: boolean",
    "  archived_at: ISO-8601 string | null",
    "  notes: string | null",
    "  tags: [string]",
    "  discovery_keyword: string | null",
    "  agent: { id, name } | null"
  ].join("\n")],

  ["icps archive", [
    "Usage:",
    `  ${ICPS_ARCHIVE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Behavior:",
    "  Hides the ICP from new selection. Active primary motions enter closing; inactive and transition primary motions archive; secondary links remain.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/icps/:id/archive.json"
  ].join("\n")],

  ["icps restore", [
    "Usage:",
    `  ${ICPS_RESTORE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Behavior:",
    "  Makes the ICP selectable again without reactivating any motion.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/icps/:id/restore.json"
  ].join("\n")],

  ["icps create", [
    "Usage:",
    "  audienti icps create (--name <text> [--notes <text>] [--discovery-keyword <text>] [--tags <tag[,tag...]>] | --payload <file.json>) [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Create a new account ICP that can be attached to a motion or reused for targeting work.",
    "",
    "Input shape:",
    "  name: string  Required ICP name",
    "  notes: string | optional",
    "  tags: comma-separated tag list | optional",
    "  discovery_keyword: string | optional",
    "  payload: file.json | optional full ICP object using the account API create shape",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/icps.json",
    "",
    "Simple JSON body:",
    "  {",
    "    \"icp\": {",
    "      \"name\": \"Renewal-stage IT leaders\",",
    "      \"notes\": \"IT leaders reviewing vendors before renewal or QBR.\",",
    "      \"discovery_keyword\": \"renewal\",",
    "      \"tags\": [\"enterprise\", \"renewal\"]",
    "    }",
    "  }",
    "",
    "Payload file example:",
    "  {",
    "    \"name\": \"Vendor Management Office\",",
    "    \"text_criteria\": \"Owns vendor governance, renewals, and escalations.\",",
    "    \"discovery_keyword\": \"vendor governance\",",
    "    \"negative_title_exceptions\": [\"sales\", \"recruiting\"],",
    "    \"company_keywords\": {",
    "      \"include\": [\"vendor governance\", \"supplier performance\"],",
    "      \"exclude\": [\"staffing\"]",
    "    },",
    "    \"job_titles_attributes\": [",
    "      {\"name\": \"Vendor Management Office\"},",
    "      {\"name\": \"Strategic Vendor Management\"}",
    "    ]",
    "  }"
  ].join("\n")],

  ["icps show", [
    "Usage:",
    `  ${ICPS_SHOW_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  icp_id: icpp_ prefixed id or integer id",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/icps/:id.json"
  ].join("\n")],

  ["icps update", [
    "Usage:",
    `  ${ICPS_UPDATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Update simple ICP fields, replace the ICP's full tag set, or apply a rich ICP payload patch.",
    "",
    "Input shape:",
    "  icp_id: icpp_ prefixed id or integer id",
    "  name: string | optional",
    "  notes: string | optional",
    "  discovery_keyword: string | optional",
    "  tags: comma-separated tag list | optional",
    "  payload: file.json | optional full or partial ICP object using the account API create shape",
    "",
    "Behavior:",
    "  Choose either --payload or simple flags. Supplied facet collections replace that collection in place; omitted fields and facet collections remain unchanged.",
    "  Human-readable lookup-backed facet names are resolved by the account API. Invalid lookup values fail with 422 and no partial mutation.",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/icps/:id.json",
    "",
    "Simple JSON body:",
    "  {",
    "    \"icp\": {",
    "      \"tags\": [\"enterprise\", \"renewal\"]",
    "    }",
    "  }",
    "",
    "Payload file example:",
    "  {",
    "    \"company_sizes_attributes\": [",
    "      {\"name\": \"1001-5000 employees\"}",
    "    ],",
    "    \"seniorities_attributes\": [",
    "      {\"name\": \"CXO\"}",
    "    ]",
    "  }"
  ].join("\n")],

  ["icps add-tag", [
    "Usage:",
    "  audienti icps add-tag <icp_id> <tag> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Add one normalized tag to an ICP.",
    "",
    "Input shape:",
    "  icp_id: icpp_ prefixed id or integer id",
    "  tag: string",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/icps/:id/add_tag.json",
    "",
    "JSON body:",
    "  {",
    "    \"tag\": \"enterprise\"",
    "  }"
  ].join("\n")],

  ["icps remove-tag", [
    "Usage:",
    "  audienti icps remove-tag <icp_id> <tag> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Remove one normalized tag from an ICP.",
    "",
    "Input shape:",
    "  icp_id: icpp_ prefixed id or integer id",
    "  tag: string",
    "",
    "API:",
    "  DELETE /api/v1/accounts/:account_id/icps/:id/remove_tag.json",
    "",
    "JSON body:",
    "  {",
    "    \"tag\": \"enterprise\"",
    "  }"
  ].join("\n")],

  ["companies", [
    "Usage:",
    "  audienti companies search --query <text> [--json]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Returns persisted LinkedIn company profiles that match a company search query."
  ].join("\n")],

  ["companies search", [
    "Usage:",
    "  audienti companies search --query <text> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/companies.json",
    "",
    "Input shape:",
    "  query: string",
    "",
    "Output shape:",
    "  companies[].prefix_id: prof_ profile id used by --company-profile",
    "  companies[].citation_id: linkedin/company:...",
    "  companies[].display_name: string",
    "  companies[].url: string",
    "  companies[].industry: string | null",
    "  companies[].location: string | null"
  ].join("\n")],

  ["dnc", [
    "Usage:",
    "  audienti dnc list [--json]",
    `  ${DNC_ADD_USAGE.slice("Usage: ".length)}`,
    `  ${DNC_IMPORT_USAGE.slice("Usage: ".length)}`,
    `  ${DNC_REMOVE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Manage account-level do-not-contact entries through the same settings/API path as the app."
  ].join("\n")],

  ["dnc list", [
    "Usage:",
    "  audienti dnc list [--limit <n>] [--offset <n>] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/dnc.json"
  ].join("\n")],

  ["dnc add", [
    "Usage:",
    `  ${DNC_ADD_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  value: email, citation ID, or supported person profile URL",
    "",
    "Behavior:",
    "  Creates or reactivates an account DNC entry and retroactively rejects matching account prospects.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/dnc.json"
  ].join("\n")],

  ["dnc import", [
    "Usage:",
    `  ${DNC_IMPORT_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  file: text or CSV file. The CLI sends one value per line using column one for CSV-like rows.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/dnc/import.json"
  ].join("\n")],

  ["dnc remove", [
    "Usage:",
    `  ${DNC_REMOVE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  DELETE /api/v1/accounts/:account_id/dnc/:id.json"
  ].join("\n")],

  ["hubspot", [
    "Usage:",
    `  ${HUBSPOT_SHOW_USAGE.slice("Usage: ".length)}`,
    `  ${HUBSPOT_CONNECT_USAGE.slice("Usage: ".length)}`,
    `  ${HUBSPOT_DISCONNECT_USAGE.slice("Usage: ".length)}`,
    `  ${HUBSPOT_SYNC_USAGE.slice("Usage: ".length)}`,
    `  ${HUBSPOT_RETRY_USAGE.slice("Usage: ".length)}`,
    `  ${HUBSPOT_LIST_SYNCS_CREATE_USAGE.slice("Usage: ".length)}`,
    `  ${HUBSPOT_LIST_SYNCS_UPDATE_USAGE.slice("Usage: ".length)}`,
    `  ${HUBSPOT_LIST_SYNCS_REMOVE_USAGE.slice("Usage: ".length)}`,
    `  ${HUBSPOT_LIST_SYNCS_SYNC_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Connect HubSpot, queue syncs, retry failed sync events, and manage HubSpot list syncs. The token is never returned.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/hubspot_integration.json",
    "  POST /api/v1/accounts/:account_id/hubspot_integration.json",
    "  DELETE /api/v1/accounts/:account_id/hubspot_integration.json",
    "  POST /api/v1/accounts/:account_id/hubspot_integration/sync_all.json",
    "  POST /api/v1/accounts/:account_id/hubspot_integration/retry_event.json"
  ].join("\n")],

  ["hubspot show", [
    "Usage:",
    `  ${HUBSPOT_SHOW_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/hubspot_integration.json"
  ].join("\n")],

  ["hubspot connect", [
    "Usage:",
    `  ${HUBSPOT_CONNECT_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Notes:",
    "  --token-stdin reads the token from stdin, keeping it out of shell history and the process list.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/hubspot_integration.json"
  ].join("\n")],

  ["hubspot disconnect", [
    "Usage:",
    `  ${HUBSPOT_DISCONNECT_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  DELETE /api/v1/accounts/:account_id/hubspot_integration.json"
  ].join("\n")],

  ["hubspot sync", [
    "Usage:",
    `  ${HUBSPOT_SYNC_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/hubspot_integration/sync_all.json"
  ].join("\n")],

  ["hubspot retry", [
    "Usage:",
    `  ${HUBSPOT_RETRY_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/hubspot_integration/retry_event.json"
  ].join("\n")],

  ["hubspot list-syncs", [
    "Usage:",
    `  ${HUBSPOT_LIST_SYNCS_CREATE_USAGE.slice("Usage: ".length)}`,
    `  ${HUBSPOT_LIST_SYNCS_UPDATE_USAGE.slice("Usage: ".length)}`,
    `  ${HUBSPOT_LIST_SYNCS_REMOVE_USAGE.slice("Usage: ".length)}`,
    `  ${HUBSPOT_LIST_SYNCS_SYNC_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/hubspot_integration/list_syncs.json",
    "  PATCH /api/v1/accounts/:account_id/hubspot_integration/list_syncs/:id.json",
    "  DELETE /api/v1/accounts/:account_id/hubspot_integration/list_syncs/:id.json",
    "  POST /api/v1/accounts/:account_id/hubspot_integration/list_syncs/:id/sync_now.json"
  ].join("\n")],

  ["webhooks", [
    "Usage:",
    `  ${WEBHOOKS_LIST_USAGE.slice("Usage: ".length)}`,
    `  ${WEBHOOKS_CREATE_USAGE.slice("Usage: ".length)}`,
    `  ${WEBHOOKS_UPDATE_USAGE.slice("Usage: ".length)}`,
    `  ${WEBHOOKS_ROTATE_USAGE.slice("Usage: ".length)}`,
    `  ${WEBHOOKS_REMOVE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Manage prospect intake webhook endpoints. Create and rotate return the endpoint URL.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/prospect_webhook_endpoints.json",
    "  POST /api/v1/accounts/:account_id/prospect_webhook_endpoints.json",
    "  PATCH /api/v1/accounts/:account_id/prospect_webhook_endpoints/:id.json",
    "  POST /api/v1/accounts/:account_id/prospect_webhook_endpoints/:id/rotate.json",
    "  DELETE /api/v1/accounts/:account_id/prospect_webhook_endpoints/:id.json"
  ].join("\n")],

  ["webhooks list", [
    "Usage:",
    `  ${WEBHOOKS_LIST_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/prospect_webhook_endpoints.json"
  ].join("\n")],

  ["webhooks create", [
    "Usage:",
    `  ${WEBHOOKS_CREATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospect_webhook_endpoints.json"
  ].join("\n")],

  ["webhooks update", [
    "Usage:",
    `  ${WEBHOOKS_UPDATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/prospect_webhook_endpoints/:id.json"
  ].join("\n")],

  ["webhooks rotate", [
    "Usage:",
    `  ${WEBHOOKS_ROTATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospect_webhook_endpoints/:id/rotate.json"
  ].join("\n")],

  ["webhooks remove", [
    "Usage:",
    `  ${WEBHOOKS_REMOVE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  DELETE /api/v1/accounts/:account_id/prospect_webhook_endpoints/:id.json"
  ].join("\n")],

  ["reply-alerts", [
    "Usage:",
    `  ${REPLY_ALERTS_SHOW_USAGE.slice("Usage: ".length)}`,
    `  ${REPLY_ALERTS_UPDATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Show or change your own SMS and Slack reply alerts. Connect Slack in the web app.",
    "",
    "API:",
    "  GET /api/v1/me/reply_alerts.json",
    "  PATCH /api/v1/me/reply_alerts.json"
  ].join("\n")],

  ["reply-alerts show", [
    "Usage:",
    `  ${REPLY_ALERTS_SHOW_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  GET /api/v1/me/reply_alerts.json"
  ].join("\n")],

  ["reply-alerts update", [
    "Usage:",
    `  ${REPLY_ALERTS_UPDATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  PATCH /api/v1/me/reply_alerts.json"
  ].join("\n")],

  ["payment", [
    "Usage:",
    `  ${PAYMENT_SHOW_USAGE.slice("Usage: ".length)}`,
    `  ${PAYMENT_CODE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  A new account runs after one card charge or a signup code. Show the state, or use a code.",
    "  The card step needs a browser; `payment show` prints the address. Account admins only for `code`.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/admission.json",
    "  POST /api/v1/accounts/:account_id/admission.json"
  ].join("\n")],

  ["payment show", [
    "Usage:",
    `  ${PAYMENT_SHOW_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/admission.json"
  ].join("\n")],

  ["payment code", [
    "Usage:",
    `  ${PAYMENT_CODE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/admission.json"
  ].join("\n")],

  ["brand-profile", [
    "Usage:",
    `  ${BRAND_PROFILE_SHOW_USAGE.slice("Usage: ".length)}`,
    `  ${BRAND_PROFILE_UPDATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Show or change the account brand voice, style, and banned phrases. Account admins only.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/brand_profile.json",
    "  PATCH /api/v1/accounts/:account_id/brand_profile.json"
  ].join("\n")],

  ["brand-profile show", [
    "Usage:",
    `  ${BRAND_PROFILE_SHOW_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/brand_profile.json"
  ].join("\n")],

  ["brand-profile update", [
    "Usage:",
    `  ${BRAND_PROFILE_UPDATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/brand_profile.json"
  ].join("\n")],

  ["company-rules", [
    "Usage:",
    "  audienti company-rules list [--json]",
    `  ${COMPANY_RULES_SHOW_USAGE.slice("Usage: ".length)}`,
    `  ${COMPANY_RULES_CREATE_USAGE.slice("Usage: ".length)}`,
    `  ${COMPANY_RULES_UPDATE_USAGE.slice("Usage: ".length)}`,
    `  ${COMPANY_RULES_REMOVE_USAGE.slice("Usage: ".length)}`,
    `  ${COMPANY_RULES_APPLY_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Manage account-wide and user-scoped company disposition rules keyed by LinkedIn company URL or domain."
  ].join("\n")],

  ["company-rules list", [
    "Usage:",
    "  audienti company-rules list [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/company_rules.json"
  ].join("\n")],

  ["company-rules show", [
    "Usage:",
    `  ${COMPANY_RULES_SHOW_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/company_rules/:id.json"
  ].join("\n")],

  ["company-rules create", [
    "Usage:",
    `  ${COMPANY_RULES_CREATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  linkedin-url: LinkedIn company URL | optional when domain is present",
    "  domain: company domain | optional when linkedin-url is present",
    "  disposition: monitor | nurture | not_fit | reject",
    "  user: account user id, email, or me | optional. Omit for account-wide.",
    "",
    "Behavior:",
    "  Matching prospects are always created first. Rule application then applies the disposition; monitor locks activity with lock_kind=company_policy until dedicated monitor mode exists.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/company_rules.json"
  ].join("\n")],

  ["company-rules update", [
    "Usage:",
    `  ${COMPANY_RULES_UPDATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  user: account user id, email, me, or none. none makes the rule account-wide.",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/company_rules/:id.json"
  ].join("\n")],

  ["company-rules remove", [
    "Usage:",
    `  ${COMPANY_RULES_REMOVE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "API:",
    "  DELETE /api/v1/accounts/:account_id/company_rules/:id.json"
  ].join("\n")],

  ["company-rules apply", [
    "Usage:",
    `  ${COMPANY_RULES_APPLY_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Behavior:",
    "  Backfills active visible account prospects through the same company-rule applicator used after profile writes.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/company_rules/:id/apply.json",
    "  POST /api/v1/accounts/:account_id/company_rules/apply_all.json"
  ].join("\n")],

  ["find", [
    "Usage:",
    "  audienti find <name> [--json]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Find people, companies, experiments and users in the account by name, at most 5 of each.",
    "  A person also matches by company name.",
    "  Uses the same search as the web Jump to pop-up (Cmd+K). Needs at least 2 characters.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/jump_to?q=<name>"
  ].join("\n")],

  ["tags", [
    "Usage:",
    "  audienti tags list [--json]",
    "  audienti tags show <tag> [--json]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Show the shared vocabulary from ICP tags, list tags, and motion play_tags currently in use.",
    "",
    "Run `audienti tags list help` or `audienti tags show help` for output shape."
  ].join("\n")],

  ["tags list", [
    "Usage:",
    "  audienti tags list [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  List normalized tags currently used by account ICPs, lists, and motions so new records can match existing labels.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/tags.json",
    "",
    "Output shape:",
    "  tags[].name: normalized tag string",
    "  tags[].icp_count: number of ICPs using the tag",
    "  tags[].list_count: number of lists using the tag",
    "  tags[].motion_count: number of motions using the tag",
    "  tags[].total_count: icp_count + list_count + motion_count"
  ].join("\n")],

  ["tags show", [
    "Usage:",
    "  audienti tags show <tag> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Show the ICPs, lists, and motions currently using one normalized tag.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/icps.json",
    "  GET /api/v1/accounts/:account_id/lists.json",
    "  GET /api/v1/accounts/:account_id/motions.json",
    "",
    "Output shape:",
    "  tag: normalized tag string",
    "  icps[]: ICP rows whose tags include tag",
    "  lists[]: list rows whose tags include tag",
    "  motions[]: motion rows whose play_tags include tag"
  ].join("\n")],

  ["tasks", [
    "Usage:",
    `  ${TASKS_LIST_USAGE.slice("Usage: ".length)}`,
    `  ${TASKS_ADD_USAGE.slice("Usage: ".length)}`,
    `  ${TASKS_COMPLETE_USAGE.slice("Usage: ".length)}`,
    `  ${TASKS_UPDATE_USAGE.slice("Usage: ".length)}`,
    `  ${TASKS_BULK_UPDATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Add and manage plain reminders for the current account user, optionally associated with a prospect or list.",
    "",
    "Run `audienti tasks list help`, `audienti tasks add help`, or `audienti tasks complete help` for details."
  ].join("\n")],

  ["tasks list", [
    "Usage:",
    `  ${TASKS_LIST_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Options:",
    "  --status <open|completed>  Defaults to open",
    "  --limit <n>                 Defaults to 20, capped at 100",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/tasks.json",
    "",
    "Output shape:",
    "  tasks[].prefix_id: ptsk_ task id",
    "  tasks[].title: string",
    "  tasks[].notes: task description | null",
    "  tasks[].due_at: ISO timestamp",
    "  tasks[].association: prospect, list, or none"
  ].join("\n")],

  ["tasks manage", [
    "Usage:",
    `  ${TASKS_LIST_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Alias:",
    "  `audienti tasks manage` is the same as `audienti tasks list`."
  ].join("\n")],

  ["tasks add", [
    "Usage:",
    `  ${TASKS_ADD_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  title: short reminder name",
    "  due: timestamp string accepted by the app",
    "  notes: optional task description",
    "  prospect: optional prsp_ id",
    "  list: optional list_ id",
    "  assigned-user: account user id or me; defaults to the current account user",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/tasks.json"
  ].join("\n")],

  ["tasks complete", [
    "Usage:",
    `  ${TASKS_COMPLETE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  task_id: ptsk_ prefix id or numeric id for a task assigned to the current account user",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/tasks/:id/complete.json"
  ].join("\n")],

  ["lists", [
    "Usage:",
    "  audienti lists list [--tag <tag>] [--json]",
    "  audienti lists create --name <text> [--tags <tag[,tag...]>] [--json]",
    "  audienti lists show <list_id> [--json]",
    "  audienti lists update <list_id> [--tags <tag[,tag...]>] [--json]",
    "  audienti lists add-tag <list_id> <tag> [--json]",
    "  audienti lists remove-tag <list_id> <tag> [--json]",
    "  audienti lists delete <list_id> --confirm <yes|true|Y|y> [--json]",
    "  audienti lists bulk-add-tag --tag <tag> <list_id> [list_id...] [--json]",
    "  audienti lists merge <list_id> <list_id> [--json]",
    "  audienti lists export <list_id> [--output <file.csv>] [--json]",
    "  audienti lists prospects <list_id> [--json]",
    "  audienti lists add-prospects <list_id> <prsp_id> [prsp_id...] [--json]",
    "  audienti lists remove-prospects <list_id> <prsp_id> [prsp_id...] [--json]",
    "  audienti lists routing-rules <list_id> <list|create|update|remove|move|toggle|apply> [args] [--json]",
    "",
    "Status: read, create, update, delete, membership, and routing-rule commands implemented",
    "",
    "ID shape:",
    "  list_id: list_ prefix id"
  ].join("\n")],

  ["lists routing-rules", [
    "Usage:",
    "  audienti lists routing-rules <list_id> list [--json] [--account <acct_id>]",
    "  audienti lists routing-rules <list_id> create --payload <file.json> [--json] [--account <acct_id>]",
    "  audienti lists routing-rules <list_id> update <rule_id> --payload <file.json> [--json] [--account <acct_id>]",
    "  audienti lists routing-rules <list_id> remove <rule_id> [--json] [--account <acct_id>]",
    "  audienti lists routing-rules <list_id> move <rule_id> <up|down> [--json] [--account <acct_id>]",
    "  audienti lists routing-rules <list_id> toggle <rule_id> [--json] [--account <acct_id>]",
    "  audienti lists routing-rules <list_id> apply [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Configure, inspect, reorder, and relaunch the same routing rules available in the list UI.",
    "  Apply only queues the existing background job; it does not wait for routing to finish.",
    "",
    "Payload shape:",
    "  name: string",
    "  enabled: boolean | optional",
    "  position: non-negative integer | optional",
    "  action_kind: assign_user | route_to_list",
    "  target_account_user_id: account-user id, email, or me | required for assign_user",
    "  target_list_id: list_ prefix id or numeric id | required for route_to_list",
    "  conditions: object | optional",
    "",
    "Condition keys:",
    "  locations, company_locations, seniorities, job_titles, bio_texts,",
    "  company_sizes, company_types, company_keywords, seniority_match_mode, industry_groups",
    "",
    "Location and company_location entries:",
    "  name: string | required; must resolve to a known geography",
    "  negative: boolean | optional",
    "  geo_key: LinkedIn geography id or app key such as app:north_america | optional on write, filled on save",
    "  id: legacy LinkedIn id | treated as geo_key",
    "  Known labels include countries, US states, Canadian provinces, and named regions",
    "  (North America, Europe, EMEA, DACH, Nordics, ANZ, UK and Ireland, Middle East,",
    "  APAC, LATAM, Africa, Oceania). Unknown labels fail with 422.",
    "",
    "Example payload file:",
    "  {",
    "    \"name\": \"VP prospects to Alice\",",
    "    \"enabled\": true,",
    "    \"action_kind\": \"assign_user\",",
    "    \"target_account_user_id\": \"alice@example.com\",",
    "    \"conditions\": {",
    "      \"seniorities\": [{\"id\": \"5\", \"name\": \"Vice President\", \"negative\": false}],",
    "      \"seniority_match_mode\": \"at_least\"",
    "    }",
    "  }",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/lists/:list_id/routing_rules.json",
    "  POST /api/v1/accounts/:account_id/lists/:list_id/routing_rules.json",
    "  PATCH /api/v1/accounts/:account_id/lists/:list_id/routing_rules/:id.json",
    "  DELETE /api/v1/accounts/:account_id/lists/:list_id/routing_rules/:id.json",
    "  PATCH /api/v1/accounts/:account_id/lists/:list_id/routing_rules/:id/move.json",
    "  POST /api/v1/accounts/:account_id/lists/:list_id/routing_rules/apply.json"
  ].join("\n")],

  ["lists list", [
    "Usage:",
    "  audienti lists list [--tag <tag>] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Options:",
    "  --tag <tag>  Filter locally to lists whose tags include the normalized tag",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/lists.json",
    "",
    "Output shape:",
    "  id: integer",
    "  prefix_id: list_",
    "  name: string",
    "  description: string | null",
    "  prospect_count: integer",
    "  protected_system_list: boolean",
    "  hubspot_synced: boolean",
    "  tags: [string]"
  ].join("\n")],

  ["lists create", [
    "Usage:",
    "  audienti lists create --name <text> [--description <text>] [--tags <tag[,tag...]>] [--campaign-hook <text>] [--audience-note <text>] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Create a new list so an agent can build prospect membership from zero.",
    "",
    "Input shape:",
    "  name: string  Required list name",
    "  description: string | optional",
    "  tags: comma-separated tag list | optional",
    "  campaign_hook: string | optional",
    "  audience_note: string | optional",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/lists.json",
    "",
    "JSON body:",
    "  {",
      "    \"list\": {",
      "      \"name\": \"CIO renewal targets\",",
      "      \"description\": \"Accounts to review before QBR outreach.\",",
      "      \"tags\": [\"sarit\", \"pj\"],",
      "      \"campaign_brief\": {",
    "        \"hook\": \"Vendor accountability before renewal\",",
    "        \"audience_note\": \"IT leaders running QBRs and renewals\"",
    "      }",
    "    }",
    "  }"
  ].join("\n")],

  ["lists show", [
    "Usage:",
    "  audienti lists show <list_id> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  list_id: list_ prefix id",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/lists/:id.json"
  ].join("\n")],

  ["lists update", [
    "Usage:",
    "  audienti lists update <list_id> [--name <text>] [--description <text>] [--tags <tag[,tag...]>] [--campaign-hook <text>] [--audience-note <text>] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Update a normal user-created list without changing prospect membership.",
    "",
    "Input shape:",
    "  list_id: list_ prefix id",
    "  list.name: string | optional",
    "  list.description: string | optional",
    "  list.tags: comma-separated tag list | optional",
    "  list.campaign_brief.hook: string | optional",
    "  list.campaign_brief.audience_note: string | optional",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/lists/:id.json"
  ].join("\n")],

  ["lists bulk-add-tag", [
    "Usage:",
    `  ${LISTS_BULK_ADD_TAG_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Add one normalized tag to several lists at once. All lists change or none do.",
    "",
    "Input shape:",
    "  list_id: list_ prefix id or integer id; every id must belong to the account",
    "  tag: string",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/lists/bulk_add_tag.json"
  ].join("\n")],

  ["lists merge", [
    "Usage:",
    `  ${LISTS_MERGE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Merge two lists. The older list keeps its name and gains the newer list's tags, prospects, agents, and routing targets; the newer list is deleted.",
    "  System and HubSpot-synced lists cannot be merged.",
    "",
    "Input shape:",
    "  list_id: exactly two different list ids in the account",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/lists/merge_selected.json"
  ].join("\n")],

  ["lists export", [
    "Usage:",
    `  ${LISTS_EXPORT_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Download the list's prospects as CSV with the same columns as the web export.",
    "  Prints to stdout unless --output is given.",
    "",
    "Input shape:",
    "  list_id: list_ prefix id",
    "  inactive-reason: optional filter for the inactive system list",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/lists/:id/export.json (returns text/csv)"
  ].join("\n")],

  ["lists routing-rules toggle", [
    "Usage:",
    `  ${LIST_ROUTING_RULES_TOGGLE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Turn one routing rule on or off.",
    "",
    "Input shape:",
    "  rule_id: routing rule id on the list",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/lists/:list_id/routing_rules/:id/toggle.json"
  ].join("\n")],

  ["icps bulk-add-tag", [
    "Usage:",
    `  ${ICPS_BULK_ADD_TAG_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Add one normalized tag to several ICPs at once. All ICPs change or none do.",
    "",
    "Input shape:",
    "  icp_id: icpp_ prefix id or integer id; every id must belong to the account",
    "  tag: string",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/icps/bulk_add_tag.json"
  ].join("\n")],

  ["icps clone", [
    "Usage:",
    `  ${ICPS_CLONE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Copy an ICP and its audience rules under a new \"(Copy)\" name.",
    "",
    "Input shape:",
    "  icp_id: icpp_ prefix id or integer id",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/icps/:id/clone.json"
  ].join("\n")],

  ["icps delete", [
    "Usage:",
    `  ${ICPS_DELETE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Delete an ICP. ICPs still used by motions or agents are refused; archive them instead.",
    "",
    "Input shape:",
    "  icp_id: icpp_ prefix id or integer id",
    "  confirm: one of yes, true, Y, y",
    "",
    "API:",
    "  DELETE /api/v1/accounts/:account_id/icps/:id.json"
  ].join("\n")],

  ["icps prospects", [
    "Usage:",
    `  ${ICPS_PROSPECTS_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  List prospects matched to an ICP, newest first, optionally filtered by a text query.",
    "",
    "Input shape:",
    "  icp_id: icpp_ prefix id or integer id",
    "  limit: 1-100 (default 25)",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/icps/:id/prospects.json"
  ].join("\n")],

  ["offers regenerate-research", [
    "Usage:",
    `  ${OFFERS_REGENERATE_RESEARCH_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Queue a new research write-up for an offer, optionally steered by guidance. Returns once queued.",
    "",
    "Input shape:",
    "  offr_id: offr_ prefixed id or integer id",
    "  guidance: optional text",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/offers/:id/regenerate_research.json"
  ].join("\n")],

  ["offers update-writeup", [
    "Usage:",
    `  ${OFFERS_UPDATE_WRITEUP_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Replace an offer's write-up without queueing new research.",
    "",
    "Input shape:",
    "  offr_id: offr_ prefixed id or integer id",
    "  description: text",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/offers/:id/writeup.json"
  ].join("\n")],

  ["offers add-artifacts", [
    "Usage:",
    `  ${OFFERS_ADD_ARTIFACTS_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Attach local files to an offer as artifacts. `audienti offers show` lists attached artifacts.",
    "",
    "Input shape:",
    "  offr_id: offr_ prefixed id or integer id",
    "  file: local file path; sent as base64",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/offers/:offer_id/artifacts.json"
  ].join("\n")],

  ["offers remove-artifact", [
    "Usage:",
    `  ${OFFERS_REMOVE_ARTIFACT_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Remove one artifact from an offer.",
    "",
    "Input shape:",
    "  artifact_id: id from `audienti offers show <offr_id>`",
    "",
    "API:",
    "  DELETE /api/v1/accounts/:account_id/offers/:offer_id/artifacts/:id.json"
  ].join("\n")],

  ["offers add-gift", [
    "Usage:",
    `  ${OFFERS_ADD_GIFT_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Add a gift to an offer by hand. A gift is a free, useful thing you already have, such as a guide, a report, or a tool.",
    "  The gift is ready once it has a send link or a file. Do not use a page that asks for an email as the send link.",
    "",
    "Input shape:",
    "  offr_id: offr_ prefixed id or integer id",
    "  title: string",
    "  summary: who the gift helps | optional",
    "  send-url: the file or page a prospect opens | optional",
    "  file: local file path; sent as base64 | optional",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/offers/:offer_id/gifts.json"
  ].join("\n")],

  ["offers update-gift", [
    "Usage:",
    `  ${OFFERS_UPDATE_GIFT_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Edit a gift, give it a send link or a file, or turn it off or on. Only the given fields change.",
    "  A gift that is turned off or loses its send link is removed from any motion that carried it.",
    "",
    "Input shape:",
    "  gift_id: ogft_ prefixed id or integer id from `audienti offers show <offr_id>`",
    "  status: on | off | optional",
    "  --remove-file: take the attached file off the gift; without a send link the gift then needs a link",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/offers/:offer_id/gifts/:id.json"
  ].join("\n")],

  ["offers turn-off-gift", [
    "Usage:",
    `  ${OFFERS_TURN_OFF_GIFT_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Turn off a gift. It stays on the offer, motions stop carrying it, and later site scans do not turn it back on.",
    "",
    "Input shape:",
    "  gift_id: ogft_ prefixed id or integer id from `audienti offers show <offr_id>`",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/offers/:offer_id/gifts/:id.json"
  ].join("\n")],

  ["offers turn-on-gift", [
    "Usage:",
    `  ${OFFERS_TURN_ON_GIFT_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Turn a gift back on.",
    "",
    "Input shape:",
    "  gift_id: ogft_ prefixed id or integer id from `audienti offers show <offr_id>`",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/offers/:offer_id/gifts/:id.json"
  ].join("\n")],

  ["offers update-insight", [
    "Usage:",
    `  ${OFFERS_UPDATE_INSIGHT_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Edit an insight or turn it off or on. An insight is an exact fact or quote with its source. Only the given fields change.",
    "",
    "Input shape:",
    "  insight_id: integer id from `audienti offers show <offr_id>`",
    "  content: string | optional",
    "  source-url: URL | optional",
    "  status: on | off | optional",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/offers/:offer_id/insights/:id.json"
  ].join("\n")],

  ["offers turn-off-insight", [
    "Usage:",
    `  ${OFFERS_TURN_OFF_INSIGHT_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Turn off an insight. It stays on the offer and later site scans do not turn it back on.",
    "",
    "Input shape:",
    "  insight_id: integer id from `audienti offers show <offr_id>`",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/offers/:offer_id/insights/:id.json"
  ].join("\n")],

  ["offers turn-on-insight", [
    "Usage:",
    `  ${OFFERS_TURN_ON_INSIGHT_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Turn an insight back on.",
    "",
    "Input shape:",
    "  insight_id: integer id from `audienti offers show <offr_id>`",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/offers/:offer_id/insights/:id.json"
  ].join("\n")],

  ["tasks update", [
    "Usage:",
    `  ${TASKS_UPDATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Edit any task in the account. Only the options you pass change; pass an empty --prospect or --list to clear it.",
    "",
    "Input shape:",
    "  task_id: ptsk_ prefix id or numeric id",
    "  assigned-user: account user id or me",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/tasks/:id.json"
  ].join("\n")],

  ["tasks bulk-update", [
    "Usage:",
    `  ${TASKS_BULK_UPDATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Complete several tasks now, or queue their reassignment to one account user.",
    "",
    "Input shape:",
    "  task_id: ptsk_ prefix ids; every id must belong to the account",
    "  action: complete or reassign (reassign needs --assigned-user)",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/tasks/bulk_update.json"
  ].join("\n")],

  ["tools linkedin-strategy-review list", [
    "Usage:",
    `  ${TOOLS_LINKEDIN_STRATEGY_REVIEW_LIST_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  List recent LinkedIn strategy review reports for the active account, newest first.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/tools/linkedin-strategy-review/reports.json"
  ].join("\n")],

  ["tools linkedin-strategy-review create", [
    "Usage:",
    `  ${TOOLS_LINKEDIN_STRATEGY_REVIEW_CREATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Queue a LinkedIn strategy review for a person profile, like the Tools page.",
    "",
    "Input shape:",
    "  url: LinkedIn person profile URL (post and company URLs are refused)",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/tools/linkedin-strategy-review/reports.json"
  ].join("\n")],

  ["tools linkedin-strategy-review show", [
    "Usage:",
    `  ${TOOLS_LINKEDIN_STRATEGY_REVIEW_SHOW_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Show one LinkedIn strategy review's status; --json includes the report content.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/tools/linkedin-strategy-review/reports/:id.json"
  ].join("\n")],

  ["tools linkedin-strategy-review delete", [
    "Usage:",
    `  ${TOOLS_LINKEDIN_STRATEGY_REVIEW_DELETE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Delete one LinkedIn strategy review report.",
    "",
    "Input shape:",
    "  rprt_id: rprt_ report id of a strategy review",
    "  confirm: one of yes, true, Y, y",
    "",
    "API:",
    "  DELETE /api/v1/accounts/:account_id/tools/linkedin-strategy-review/reports/:id.json"
  ].join("\n")],

  ["lists add-tag", [
    "Usage:",
    `  ${LISTS_ADD_TAG_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Add one normalized tag to a list without changing prospect membership.",
    "",
    "Input shape:",
    "  list_id: list_ prefix id",
    "  tag: string",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/lists/:id/add_tag.json",
    "",
    "JSON body:",
    "  {",
    "    \"tag\": \"sarit\"",
    "  }"
  ].join("\n")],

  ["lists remove-tag", [
    "Usage:",
    `  ${LISTS_REMOVE_TAG_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Remove one normalized tag from a list.",
    "",
    "Input shape:",
    "  list_id: list_ prefix id",
    "  tag: string",
    "",
    "API:",
    "  DELETE /api/v1/accounts/:account_id/lists/:id/remove_tag.json",
    "",
    "JSON body:",
    "  {",
    "    \"tag\": \"sarit\"",
    "  }"
  ].join("\n")],

  ["lists delete", [
    "Usage:",
    "  audienti lists delete <list_id> --confirm <yes|true|Y|y> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Delete a normal user-created list. Existing standard disposition/system lists keep their current behavior.",
    "",
    "Input shape:",
    "  list_id: list_ prefix id",
    "  confirm: one of yes, true, Y, y",
    "",
    "Response shape:",
    "  deleted: boolean",
    "  prefix_id: list_",
    "  reassigned_agent_count: integer",
    "",
    "API:",
    "  DELETE /api/v1/accounts/:account_id/lists/:id.json"
  ].join("\n")],

  ["lists prospects", [
    "Usage:",
    "  audienti lists prospects <list_id> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Options:",
    "  --limit <n>                     Max rows for one page; with --all it caps total rows up to 1000",
    "  --page <n>                      1-based page number",
    "  --offset <n>                    Row offset for manual pagination",
    "  --all                           Fetch every matching prospect in the list up to 1000 rows",
    "  --profiles                      Include structured profile identifiers and render per-identifier columns",
    "  --wide                          Render a richer wide table with more columns",
    "  --csv                           Export a rich CSV instead of table output",
    "",
    "Output shape:",
    "  prospects[]: same row shape as `audienti prospects list`",
    "  meta.total_count: total matching prospects in the list",
    "  meta.offset/page/has_more: pagination metadata",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/lists/:list_id/prospects.json"
  ].join("\n")],

  ["lists add-prospects", [
    "Usage:",
    "  audienti lists add-prospects <list_id> <prsp_id> [prsp_id...] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Attach one or more existing account prospects to a list without re-importing them.",
    "",
    "Input shape:",
    "  list_id: list_ prefix id",
    "  prsp_id: one or more prsp_ prefix ids",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/lists/:list_id/prospects.json",
    "",
    "JSON body:",
    "  {",
    "    \"prospect_ids\": [\"prsp_abc123\", \"prsp_def456\"]",
    "  }"
  ].join("\n")],

  ["lists remove-prospects", [
    "Usage:",
    "  audienti lists remove-prospects <list_id> <prsp_id> [prsp_id...] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Remove one or more existing account prospects from a list.",
    "",
    "Input shape:",
    "  list_id: list_ prefix id",
    "  prsp_id: one or more prsp_ prefix ids",
    "",
    "API:",
    "  DELETE /api/v1/accounts/:account_id/lists/:list_id/prospects.json",
    "",
    "JSON body:",
    "  {",
    "    \"prospect_ids\": [\"prsp_abc123\", \"prsp_def456\"]",
    "  }"
  ].join("\n")],

  ["motions", [
    "Usage:",
    "  audienti motions list [--tag <tag>] [--json]",
    "  audienti motions show <motn_id> [--json]",
    "  audienti motions signals <motn_id> [--json]",
    "  audienti motions status <motn_id> [--json]",
    "  audienti motions run-discovery <motn_id> [--target-count <n>] [--json]",
    "  audienti motions quick-start --url <company_url> [--confirm] [--wait] [--json]",
    "  audienti motions setup-state [--json]",
    "  audienti motions analytics <motn_id> [--window 30d] [--json]",
    "  audienti motions prospects <motn_id> [--json]",
    "  audienti motions add-prospects <motn_id> <prsp_id> [prsp_id...] [--json]",
    "  audienti motions abm-companies <motn_id> list [--json]",
    "  audienti motions abm-companies <motn_id> add (<domain_or_linkedin_url>... | --file <txt|json>) [--json]",
    "  audienti motions abm-companies <motn_id> remove <row_id> [--json]",
    "  audienti motions profile-signals <motn_id> list [--json]",
    "  audienti motions profile-signals <motn_id> add (<profile_url> [--category <type>] | --owned --social-cookie <id>) [--roles <commenters,reactors>] [--json]",
    "  audienti motions profile-signals <motn_id> remove <signal_id> [--json]",
    "  audienti motions create --payload <file.json> [--json]",
    `  ${MOTIONS_UPDATE_USAGE.slice("Usage: ".length).replace(" [--account <acct_id>]", "")}`,
    "  audienti motions add-tag <motn_id> <tag> [--json]",
    "  audienti motions remove-tag <motn_id> <tag> [--json]",
    "  audienti motions activate <motn_id> [--json]",
    "  audienti motions pause <motn_id> [--json]",
    "  audienti motions archive <motn_id> [--json]",
    "  audienti motions delete <motn_id> --confirm <yes|true|Y|y> [--json]",
    "  audienti motions clone <motn_id> --name <text> [--json]",
    "  audienti motions move-prospects <source_motn_id> --target <target_motn_id> <prsp_id> [prsp_id...] [--json]",
    "",
    "Status: read, create, quick-start, status update, delete, clone, status, discovery launch, and prospect attachment commands implemented",
    "",
    "CLI synonym:",
    "  `plays` is accepted anywhere `motions` is accepted",
    "",
    "ID shape:",
    "  motn_id: motn_ prefix id"
  ].join("\n")],

  ["content", [
    "Usage:",
    "  audienti content programs [--user <account_user_id|email|name|me>] [--json]",
    "  audienti content plan <cprg_id> [--week <n>] [--due] [--json]",
    "  audienti content show <cpwi_id> [--json]",
    "  audienti content track <linkedin_post_url> [--user <account_user_id|email|name|me>] [--json]",
    "  audienti content posts [--user <account_user_id|email|name|me>] [--json]",
    "  audienti content engagement <cpwi_id> [--json]",
    "  audienti content feedback <cpwi_id> --message <text> [--json]",
    "  audienti content approve <cpwi_id> [--json]",
    "  audienti content schedule <cpwi_id> --at <time> [--json]",
    "  audienti content publish <cpwi_id> --url <permalink> [--json]",
    "  audienti content comments [--unresolved] [--user <account_user_id|email|name|me>] [--json]",
    "  audienti content reply <cctk_id> [--body <text>] [--json]",
    "  audienti content dismiss <cctk_id> [--json]",
    "",
    "API:",
    "  GET/POST /api/v1/accounts/:account_id/content_ops/..."
  ].join("\n")],

  ["content programs", [CONTENT_PROGRAMS_USAGE].join("\n")],
  ["content plan", [CONTENT_PLAN_USAGE].join("\n")],
  ["content plans", CONTENT_PLANS_USAGE],
  ["content post-reply", CONTENT_POST_REPLY_USAGE],
  ...["plan-update", "plan-approve", "plan-research", "plan-draft", "plan-visuals"].map((action) => [`content ${action}`, `Usage: audienti content ${action} <rprt_id> --day <n> [--user <id|me>] [--payload <file.json>] [--feedback <text>] [--style <id>] [--aspect-ratio <w:h>] [--json] [--account <acct_id>]`]),
  ["content show", [CONTENT_SHOW_USAGE].join("\n")],
  ["content posts", [CONTENT_POSTS_USAGE].join("\n")],
  ["content track", [CONTENT_TRACK_USAGE].join("\n")],
  ["content engagement", [CONTENT_ENGAGEMENT_USAGE].join("\n")],
  ["content feedback", [CONTENT_FEEDBACK_USAGE].join("\n")],
  ["content approve", [CONTENT_APPROVE_USAGE].join("\n")],
  ["content schedule", [CONTENT_SCHEDULE_USAGE].join("\n")],
  ["content publish", [CONTENT_PUBLISH_USAGE].join("\n")],
  ["content comments", [CONTENT_COMMENTS_USAGE].join("\n")],
  ["content reply", [CONTENT_REPLY_USAGE].join("\n")],
  ["content dismiss", [CONTENT_DISMISS_USAGE].join("\n")],

  ["motions list", [
    "Usage:",
    "  audienti motions list [--tag <tag>] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Options:",
    "  --tag <tag>  Filter locally to motions whose play_tags include the normalized tag",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/motions.json",
    "",
    "Output shape:",
    "  id: integer",
    "  prefix_id: motn_",
    "  name: string",
    "  kind: outbound | inbound | lopa | transition",
    "  status: draft | active | paused | archived",
    "  offer.prefix_id: offr_",
    "  icp.prefix_id: icpp_",
    "  list.prefix_id: list_ | null",
    "  principal_account_user.id: integer",
    "  play_tags: [string]"
  ].join("\n")],

  ["motions show", [
    "Usage:",
    "  audienti motions show <motn_id> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  motn_id: motn_ prefix id",
    "",
    "Output shape:",
    "  inbound_channels: enabled inbound collectors for inbound motions",
    "  lopa_profiles[]: tracked LinkedIn profile rows for LOPA motions",
    "  signal_rows[]: outbound signal configuration rows",
    "  discovery_signals: Motion-owned Topic/profile signals with status and source counts",
    "  abm_companies[]: motion-scoped positive company filter rows",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/motions/:id.json"
  ].join("\n")],

  ["motions signals", [
    "Usage:",
    "  audienti motions signals <motn_id> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Read the Topic and tracked-profile signals owned by one Motion.",
    "  Active rows feed discovery; paused or inactive rows stay visible but do not feed discovery.",
    "",
    "Output:",
    "  Shows status, canonical source URL or Topic, and accepted/rejected source counts.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/motions/:id/signals.json"
  ].join("\n")],

  ["motions profile-signals", [
    "Usage:",
    `  ${MOTIONS_PROFILE_SIGNALS_LIST_USAGE.slice("Usage: ".length)}`,
    `  ${MOTIONS_PROFILE_SIGNALS_ADD_USAGE.slice("Usage: ".length)}`,
    `  ${MOTIONS_PROFILE_SIGNALS_REMOVE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  List, add, or remove the social profiles a motion tracks for discovery signals.",
    "  --owned tracks your own LinkedIn profile through a connected session in this account.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/motions/:motion_id/profile_signals.json",
    "  POST /api/v1/accounts/:account_id/motions/:motion_id/profile_signals.json",
    "  DELETE /api/v1/accounts/:account_id/motions/:motion_id/profile_signals/:id.json"
  ].join("\n")],

  ["motions abm-companies", [
    "Usage:",
    `  ${MOTIONS_ABM_COMPANIES_LIST_USAGE.slice("Usage: ".length)}`,
    `  ${MOTIONS_ABM_COMPANIES_ADD_USAGE.slice("Usage: ".length)}`,
    `  ${MOTIONS_ABM_COMPANIES_REMOVE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Manage a motion-scoped positive company filter list for isolated ABM discovery runs.",
    "",
    "Input shape:",
    "  motn_id: motn_ prefix id",
    "  domain_or_linkedin_url: company domain or LinkedIn company page URL",
    "  file: plain text one entry per line, or JSON array / { abm_companies: [...] }",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/motions/:motion_id/abm_companies.json",
    "  POST /api/v1/accounts/:account_id/motions/:motion_id/abm_companies.json",
    "  DELETE /api/v1/accounts/:account_id/motions/:motion_id/abm_companies/:row_id.json"
  ].join("\n")],

  ["motions status", [
    "Usage:",
    "  audienti motions status <motn_id> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  motn_id: motn_ prefix id",
    "",
    "Output shape:",
    "  state: healthy_idle | broken",
    "  reason_key: string",
    "  reason_label: string",
    "  executable_configuration: { valid: boolean, reason_key: string | null, reason_label: string | null, description: string | null }",
    "  description: string",
    "  action: { key: string, label: string } | null",
    "  next_eligible_at: persisted retry time when the server can calculate one",
    "  enrichment_failed_prospect_count: actionable prospects whose profile enrichment failed after every retry",
    "  discovery_run: latest run id, status, trigger, seen/submitted/promoted/rejected counts, scope counts, outcome, timestamps, and error_message",
    "  stats: { target_count, deficit, projected_connectable, capacity, daily_target }",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/motions/:id/status.json"
  ].join("\n")],

  ["motions analytics", [
    "Usage:",
    `  ${MOTIONS_ANALYTICS_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Show whether one motion is producing prospect output by day.",
    "",
    "Options:",
    "  --window <w>  AccountProspect.created_at window to inspect. Defaults to 30d. Maximum 90d.",
    "",
    "Output shape:",
    "  motion: selected motion/play, including created_at",
    "  prospects_added_count: prospects produced inside the window",
    "  prospects_by_day[]: date, count, active/inactive counts, and current queue_stages for that produced-day cohort",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/analytics/prospects.json?motion_id=:motion_id"
  ].join("\n")],

  ["motions run-discovery", [
    "Usage:",
    `  ${MOTIONS_RUN_DISCOVERY_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Queue an immediate discovery run for one executable outbound, inbound, or LOPA motion or play.",
    "  An accepted response means the server persisted a pending run receipt before queuing work.",
    "",
    "Options:",
    "  --target-count <n>  Override the manual replenishment target count for this launch.",
    "",
    "Output shape:",
    "  enqueued: true only when a durable run receipt exists and Motions::DiscoverJob was queued",
    "  reason: launched or the authoritative rejection/failure reason",
    "  target_count: requested target count",
    "  next_eligible_at: retry time when the server can calculate one",
    "  suggested_action: concrete operator guidance when blocked",
    "  run: id, status, trigger, target, seen/submitted/promoted/rejected counts, scope counts, outcome, timestamps, and error_message",
    "",
    "Exit status:",
    "  0 when discovery was accepted and queued; 1 when rejected or enqueueing failed.",
    "  With --json, rejected responses remain machine-readable on stdout.",
    "",
    "Common reasons:",
    "  run_in_progress | recent_manual_launch | lock_contention | target_met",
    "  strategy_inventory_exhausted | producer_cooling | enqueue_failed | launch_stalled",
    "  completed_empty | discovery_failed | job_failed",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/motions/:id/run_discovery.json"
  ].join("\n")],

  ["motions quick-start", [
    "Usage:",
    `  ${MOTIONS_QUICK_START_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Draft a quick-start motion from a company URL, then optionally confirm it into a launched quick-start motion.",
    "",
    "Options:",
    "  --url <company_url>       Public HTTP(S) URL used by the quick-start drafter.",
    "  --city <city>             Your city. Needed once, before your first draft; it also sets your time zone.",
    "  --state <code>            Your state or province code, such as TX or ON. Leave out where the country has none.",
    "  --country <code>          Your two-letter country code, such as US or CA.",
    "  --principal <user>        Account user id or me. Defaults to the authenticated token user.",
    "  --feedback <text>         Optional operator guidance for the draft.",
    "  --offer-type <type>       Optional supported offer type hint.",
    "  --force                  Request a fresh draft when inputs should replace an existing ready draft.",
    "  --confirm                Confirm the ready draft into motion setup and discovery launch.",
    "  --wait                   Poll until the generated draft is ready before returning or confirming.",
    "  --timeout-seconds <n>    Maximum wait time. Defaults to 60.",
    "  --poll-interval-seconds <n>  Poll cadence. Defaults to 2.",
    "",
    "Pipeline:",
    "  POST creates or reuses a QuickStartDraft and enqueues GenerateQuickStartDraftJob when needed.",
    "  POST confirm calls QuickStartOrchestrator, creating ICP, offer, signals, motion, reservation, and discovery launch.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/quick_start.json",
    "  GET /api/v1/accounts/:account_id/quick_start/:draft_id.json",
    "  POST /api/v1/accounts/:account_id/quick_start/:draft_id/confirm.json"
  ].join("\n")],

  ["motions setup-state", [
    "Usage:",
    `  ${MOTIONS_SETUP_STATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Show which setup step you are on, what is needed next, and how many people your setup experiment has found.",
    "",
    "Options:",
    "  --principal <user>        Account user id or me. Defaults to the authenticated token user.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/quick_start/setup_state.json"
  ].join("\n")],

  ["motions prospects", [
    "Usage:",
    "  audienti motions prospects <motn_id> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Options:",
    "  --limit <n>                     Max rows for one page; with --all it caps total rows up to 1000",
    "  --page <n>                      1-based page number",
    "  --offset <n>                    Row offset for manual pagination",
    "  --all                           Fetch every prospect in the motion up to 1000 rows",
    "  --profiles                      Include structured profile identifiers and render per-identifier columns",
    "  --wide                          Render a richer wide table with more columns",
    "  --csv                           Export a rich CSV instead of table output",
    "",
    "Output shape:",
    "  prospects[]: same row shape as `audienti prospects list`",
    "  meta.total_count: total matching prospects in the motion",
    "  meta.offset/page/has_more: pagination metadata",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/motions/:motion_id/prospects.json"
  ].join("\n")],

  ["motions add-prospects", [
    "Usage:",
    "  audienti motions add-prospects <motn_id> <prsp_id> [prsp_id...] [--assigned-user <id|me>] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Attach one or more existing prospects to a motion through the same motion assignment seam the app uses.",
    "",
    "Input shape:",
    "  motn_id: motn_ prefix id",
    "  prsp_id: one or more prsp_ prefix ids",
    "  assigned_user_id: account user id or me | optional",
    "",
    "Behavior:",
    "  Runs motion fit gating, preserves motion-owned relationship truth, assigns the motion principal by default, and adds the prospect to the motion-owned list when the motion has one.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/motions/:motion_id/prospects.json",
    "",
    "JSON body:",
    "  {",
    "    \"prospect_ids\": [\"prsp_abc123\", \"prsp_def456\"],",
    "    \"assigned_user_id\": \"me\"",
    "  }"
  ].join("\n")],

  ["motions create", [
    "Usage:",
    `  ${MOTIONS_CREATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Create a motion or play through the same managed setup path the app uses.",
    "",
    "Input shape:",
    "  name: string",
    "  premise: string",
    "  approach: string | optional; a nonblank Approach guides adaptive planning, while blank uses the existing sequence",
    "  kind: outbound | inbound | lopa | transition",
    "  status: draft | active | paused | archived",
    "  offer_id: offr_ prefix id",
    "  offer_gift_id: ogft_ prefix id | null | optional; a ready gift on this offer. --gift <gift_id|none> sets the same field",
    "  principal_account_user_id: integer | me | optional",
    "  icp_id: icpp_ prefix id | optional",
    "  list_id: list_ prefix id | optional",
    "  play_tags: [string] | optional",
    "  starts_on: YYYY-MM-DD | null | optional scheduled activation date",
    "  ends_on: YYYY-MM-DD | null | optional final active date",
    "  maximum_company_count: positive integer | null | optional new-company discovery cap",
    "  signal_rows: [{ scope: company | person | both, question: string, company_signal_category: string | optional, role_terms: string | optional, posting_language: hiring-only string | optional, topics: string | optional }] | optional for outbound motions",
    "  signal_questions: newline-delimited company::, person::, or both:: legacy question text | optional for outbound motions",
    "  inbound_channels: [linkedin | reddit] | optional; defaults to [linkedin] for inbound motions",
    "  lopa_profiles: [{ url: string, source_type: creator | competitor | partner | customer | other }] | optional",
    "",
    "JSON example:",
    "  {",
    "    \"name\": \"Enterprise migration leaders\",",
    "    \"premise\": \"Find operators discussing stalled CRM migrations.\",",
    "    \"kind\": \"outbound\",",
    "    \"status\": \"draft\",",
    "    \"offer_id\": \"offr_abc123\",",
    "    \"principal_account_user_id\": 42,",
    "    \"list_id\": \"list_abc123\",",
    "    \"starts_on\": \"2026-09-01\",",
    "    \"ends_on\": \"2026-09-30\",",
    "    \"maximum_company_count\": 25,",
    "    \"play_tags\": [\"sarit\", \"pj\"]",
    "  }",
    "",
    "Behavior:",
    "  The API calls Motions::Setup and the managed graph provisioner. If principal_account_user_id is omitted, the authenticated account user is used.",
    "  posting_language is only supported on company-scope hiring signal rows; use topics for person discussion evidence.",
    "  Use `audienti offers list`, `audienti icps list`, and `audienti users list` to resolve valid ids before calling this command."
  ].join("\n")],

  ["motions clone", [
    "Usage:",
    `  ${MOTIONS_CLONE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Clone one motion or play's configuration under a new name without copying its people.",
    "",
    "Input shape:",
    "  motn_id: motn_ prefix id",
    "  name: new motion name",
    "",
    "Behavior:",
    "  Copies the motion kind, offer, ICP, principal, premise, approach, maximum company count, targeting profile, suppression policy, secondary roles, and active signal rows.",
    "  The clone starts as draft with a new empty backing list and no inherited schedule dates.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/motions/:id/clone.json",
    "",
    "JSON body:",
    "  {",
    "    \"motion\": {",
    "      \"name\": \"Wine Campaign Restaurant Operators\"",
    "    }",
    "  }"
  ].join("\n")],

  ["motions update", [
    "Usage:",
    `  ${MOTIONS_UPDATE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Change one motion or play's lifecycle status, replace its tag set, or patch rich motion configuration.",
    "",
    "Input shape:",
    "  motn_id: motn_ prefix id",
    "  status: draft | preparing | active | closing | paused | archived | optional",
    "  approach: string | optional; a nonblank Approach guides adaptive planning; --approach \"\" restores the existing sequence",
    "  principal_account_user_id: account user id | me | optional in payload mode",
    "  list_id: list_ prefix id, numeric id, or null | optional in payload mode",
    "  tags: comma-separated tag list | optional",
    "  start-date: YYYY-MM-DD | none | optional",
    "  end-date: YYYY-MM-DD | none | optional",
    "  maximum-company-count: positive integer | none | optional",
    "  gift: ogft_ prefix id | none | optional; a ready gift on the motion's own offer (offer_gift_id in payload mode)",
    "  payload: file.json | optional full or partial motion object using the account API shape",
    "",
    "Behavior:",
    "  Choose either --payload or simple flags. Updates only the provided fields. Use none to clear a schedule date or company cap. Sending --tags replaces the motion's full tag set.",
    "  Payload mode can replace the motion principal and backing list. The principal must belong to the selected account; list_id null clears the backing list.",
    "  The company cap stops only new company discovery; existing company research, people discovery, prospect intake, and automation continue.",
    "  Payload mode supports outbound signal_rows or legacy signal_questions; supplied rows replace the motion's active ready signals.",
    "  posting_language is only supported on company-scope hiring signal rows; use topics for person discussion evidence.",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/motions/:id.json",
    "",
    "Simple JSON body:",
    "  {",
      "    \"motion\": {",
      "      \"status\": \"paused\",",
      "      \"play_tags\": [\"sarit\", \"pj\"]",
      "    }",
    "  }",
    "",
    "Payload file example:",
    "  {",
    "    \"signal_rows\": [",
    "      {",
    "        \"scope\": \"company\",",
    "        \"question\": \"Is the company hiring revenue operations leaders?\",",
    "        \"company_signal_category\": \"hiring\",",
    "        \"role_terms\": \"Revenue Operations\"",
    "      },",
    "      {",
    "        \"scope\": \"person\",",
    "        \"question\": \"Is the person talking about pipeline quality?\",",
    "        \"topics\": \"pipeline quality\"",
    "      }",
    "    ]",
    "  }"
  ].join("\n")],

  ["motions add-tag", [
    "Usage:",
    `  ${MOTIONS_ADD_TAG_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Add one normalized tag to a motion or play.",
    "",
    "Input shape:",
    "  motn_id: motn_ prefix id",
    "  tag: string",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/motions/:id/add_tag.json",
    "",
    "JSON body:",
    "  {",
    "    \"tag\": \"sarit\"",
    "  }"
  ].join("\n")],

  ["motions remove-tag", [
    "Usage:",
    `  ${MOTIONS_REMOVE_TAG_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Remove one normalized tag from a motion or play.",
    "",
    "Input shape:",
    "  motn_id: motn_ prefix id",
    "  tag: string",
    "",
    "API:",
    "  DELETE /api/v1/accounts/:account_id/motions/:id/remove_tag.json",
    "",
    "JSON body:",
    "  {",
    "    \"tag\": \"sarit\"",
    "  }"
  ].join("\n")],

  ["motions activate", [
    "Usage:",
    "  audienti motions activate <motn_id> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Shortcut for `audienti motions update <motn_id> --status active`.",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/motions/:id.json"
  ].join("\n")],

  ["motions pause", [
    "Usage:",
    "  audienti motions pause <motn_id> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Shortcut for `audienti motions update <motn_id> --status paused`.",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/motions/:id.json"
  ].join("\n")],

  ["motions archive", [
    "Usage:",
    "  audienti motions archive <motn_id> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Shortcut for `audienti motions update <motn_id> --status archived`.",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/motions/:id.json"
  ].join("\n")],

  ["motions delete", [
    "Usage:",
    `  ${MOTIONS_DELETE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Delete one motion or play through the same cleanup path the app uses.",
    "",
    "Input shape:",
    "  motn_id: motn_ prefix id",
    "  confirm: one of yes, true, Y, y",
    "",
    "Behavior:",
    "  Removes the motion, its managed custom signals, and its dedicated finder agent. Prospect records remain in the account.",
    "",
    "API:",
    "  DELETE /api/v1/accounts/:account_id/motions/:id.json"
  ].join("\n")],

  ["motions move-prospects", [
    "Usage:",
    `  ${MOTIONS_MOVE_PROSPECTS_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Move prospects out of one motion or play and into another motion or play.",
    "",
    "Input shape:",
    "  source_motn_id: source motn_ prefix id",
    "  target_motn_id: target motn_ prefix id",
    "  prsp_id: one or more prospect prefix ids",
    "",
    "Behavior:",
    "  Move removes each selected prospect from the source motion and source backing list, then adds it to the target motion and target backing list.",
    "  Copy is intentionally not exposed until multi-motion membership exists.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/motions/:id/move_prospects.json",
    "",
    "JSON body:",
    "  {",
    "    \"target_motion_id\": \"motn_target\",",
    "    \"prospect_ids\": [\"prsp_one\", \"prsp_two\"]",
    "  }"
  ].join("\n")],

  ["prospects", [
    "Usage:",
    "  audienti prospects list [--json] [filters]",
    "  audienti prospects check [--json|--csv] [filters]",
    "  audienti prospects show <prsp_id> [--json]",
    "  audienti prospects assign <prsp_id> [prsp_id...] --assigned-user <id|me|unassign> [--json]",
    "  audienti prospects move-account <prsp_id> --target-account <acct_id> [--apply] [--json]",
    "  audienti prospects set-status <prsp_id> --status <active|nurture|non_responsive|not_fit|bad_data_404|rejected> [--json]",
    "  audienti prospects replan <prsp_id> [--apply] [--json]",
    "  audienti prospects reenrich <prsp_id> [--profile <prof_id|citation_id>] [--apply] [--json]",
    "  audienti prospects refresh-queue <prsp_id> [--apply] [--json]",
    "  audienti prospects reject <prsp_id> [--json]",
    "  audienti prospects nurture <prsp_id> [--reason <reason>] [--json]",
    "  audienti prospects restore <prsp_id> [--json]",
    "  audienti prospects lock <prsp_id> [--note <text>] [--json]",
    "  audienti prospects unlock <prsp_id> [--json]",
    "  audienti prospects timeline <prsp_id> [--json]",
    "  audienti prospects message-types <prsp_id> [--json]",
    "  audienti prospects write <prsp_id> --type <surface_key> [--json]",
    "  audienti prospects add-note <prsp_id> --message <text> [--json]",
    "  audienti prospects add-steer <prsp_id> --message <text> [--json]",
    "  audienti prospects add-profile <prsp_id> --url <profile_url|email|phone> [--json]",
    "  audienti prospects report-bad-profile <prsp_id> <prof_id|citation_id> [--json]",
    "  audienti prospects sequence-preview <prsp_id> [--json]",
    "  audienti prospects sequence-export <prsp_id> [--csv]",
    "  audienti prospects import <linkedin_url> [--list <list_id>] [--motion <motn_id>] [--new-list <name>] [--new-transition <name>] [--json]",
    "  audienti prospects import-batch --file <csv|jsonl|json> [--list <list_id>] [--motion <motn_id>] [--new-list <name>] [--new-transition <name>] [--json]",
    "  audienti prospects import-status <primp_id> [--json]",
    "",
    "Status: read commands, assignment, disposition, lock/unlock, per-prospect draft preview, sequence preview, and import implemented",
    "",
    "Filters:",
    "  --query <text>",
    "  --company <text>",
    "  --company-profile <prof_id|citation_id>",
    "  --motion <motn_id>",
    "  --play <motn_id>",
    "  --list <list_id>",
    "  --stage <stage>",
    "  --assigned-user <account_user_id|me|unassigned>",
    "  --limit <n>",
    "  --page <n>",
    "  --offset <n>",
    "  --all",
    "  --profiles",
    "  --wide",
    "  --csv",
    "",
    "ID shape:",
    "  prsp_id: prsp_ prefix id",
    "  primp_id: primp_ prospect import prefix id"
  ].join("\n")],

  ["prospects list", [
    "Usage:",
    "  audienti prospects list [--json] [filters] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Filters:",
    "  --query <text>                  Search name, title, company, email, profile URL",
    "  --company <text>                Filter prospects by company name only",
    "  --company-profile <id>          Filter prospects by a resolved company profile id or citation id",
    "  --motion <motn_id>              Filter to a motion",
    "  --play <motn_id>                Filter to a play using the same motion relationship",
    "  --list <list_id>                Filter to a prospect list",
    "  --stage <stage>                 Filter to a pipeline stage",
    "  --assigned-user <id|me|unassigned>  Filter by assigned account user",
    "  --limit <n>                     Max rows for one page; with --all it caps total rows up to 1000",
    "  --page <n>                      1-based page number",
    "  --offset <n>                    Row offset for manual pagination",
    "  --all                           Fetch every matching prospect up to 1000 rows",
    "  --profiles                      Include structured profile identifiers and render per-identifier columns",
    "  --wide                          Render a richer wide table with more columns",
    "  --csv                           Export a rich CSV instead of table output",
    "",
    "Output shape:",
    "  prospects[].prefix_id: prsp_",
    "  prospects[].primary_profile: profile identity",
    "  prospects[].account_prospect: account-scoped state",
    "  prospects[].queue.next_action: recommended next action",
    "  prospects[].queue.cta: executable call-to-action metadata",
    "  prospects[].profiles[]: full profile rows when --profiles is set",
    "  prospects[].profile_identifiers.columns[]: identifier column contract",
    "  prospects[].profile_identifiers.values[identifier][]: citation_id, username, url",
    "  meta.total_count: total matching prospects",
    "  meta.profile_identifier_columns[]: shared identifier columns for list/export rendering",
    "  meta.offset/page/has_more: pagination metadata",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/prospects.json",
    "",
    "Examples:",
    "  audienti prospects list --stage identified --page 2 --limit 50",
    "  audienti prospects list --assigned-user unassigned",
    "  audienti prospects list --all --csv"
  ].join("\n")],

  ["prospects check", [
    "Usage:",
    "  audienti prospects check [--json|--csv] [filters] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Description:",
    "  Lists suspect people prospects that do not have a certified company employment citation.",
    "  Imported or reported company text is shown for investigation but does not count as certification.",
    "",
    "Filters:",
    "  --query <text>                  Search name, title, company, email, profile URL",
    "  --motion <motn_id>              Filter to a motion",
    "  --play <motn_id>                Filter to a play using the same motion relationship",
    "  --list <list_id>                Filter to a prospect list",
    "  --stage <stage>                 Filter to a pipeline stage",
    "  --assigned-user <id|me|unassigned>  Filter by assigned account user",
    "  --limit <n>                     Max rows for one page; with --all it caps total rows up to 1000",
    "  --page <n>                      1-based page number",
    "  --offset <n>                    Row offset for manual pagination",
    "  --all                           Fetch every matching suspect prospect up to 1000 rows",
    "  --csv                           Export CSV with app_url for operator review",
    "",
    "Output shape:",
    "  prospects[].company_certification.status: missing",
    "  prospects[].company_certification.reason: missing_employment_citation",
    "  prospects[].app_url: product URL for operator inspection",
    "  meta.total_count: total matching suspect prospects",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/prospects.json?data_quality=missing_certified_company",
    "",
    "Examples:",
    "  audienti prospects check --motion <motn_id> --all --csv",
    "  audienti prospects check --assigned-user me --json"
  ].join("\n")],

  ["prospects set-destination", [
    "Usage:",
    `  ${PROSPECTS_DESTINATION_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Behavior:",
    "  Search destinations in the app; pass an existing destination ID or a new name here.",
    "  --type list creates a list; --type experiment with a new name creates a transition without setup.",
    "  Add preserves other lists and skips people assigned to another experiment. Move is explicit.",
    "  Partial failures return their row outcomes and exit 1.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospect_destinations.json"
  ].join("\n")],

  ["prospects assign", [
    "Usage:",
    `  ${PROSPECTS_ASSIGN_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  prsp_id: one or more prsp_ prefix ids",
    "  assigned_user_id: account user id, me, or unassign",
    "",
    "Behavior:",
    "  Updates AccountProspect.assigned_to_account_user_id for existing account prospects without changing motion or list membership.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/assign.json",
    "",
    "JSON body:",
    "  {",
    "    \"prospect_ids\": [\"prsp_abc123\", \"prsp_def456\"],",
    "    \"assigned_user_id\": \"me\"",
    "  }"
  ].join("\n")],

  ["prospects move-account", [
    "Usage:",
    `  ${PROSPECTS_MOVE_ACCOUNT_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Move one prospect and its account-scoped history between accounts where you are an administrator.",
    "",
    "Behavior:",
    "  The command previews before applying and never applies an ineligible preview.",
    "  Pass --apply to run a fresh preview, then apply that exact manifest digest.",
    "  --account selects the source account; --target-account selects the destination.",
    "  --json prints the final server response unchanged.",
    "",
    "Optional target mappings:",
    "  --assigned-user <account_user_id|me>",
    "  --target-motion <motn_id>",
    "  --target-list <list_id>",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/:id/move_account.json"
  ].join("\n")],

  ["prospects set-status", [
    "Usage:",
    `  ${PROSPECTS_SET_STATUS_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Set the account-scoped prospect disposition directly, without routing through a motion.",
    "",
    "Input shape:",
    "  status: active | nurture | non_responsive | not_fit | bad_data_404 | rejected",
    "",
    "Behavior:",
    "  active restores the prospect, rejected uses the rejection/DNC path, and nurture/non_responsive/not_fit/bad_data_404 use the shared inactive disposition path.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/:id/restore.json",
    "  POST /api/v1/accounts/:account_id/prospects/:id/reject.json",
    "  POST /api/v1/accounts/:account_id/prospects/:id/nurture.json"
  ].join("\n")],

  ["prospects show", [
    "Usage:",
    "  audienti prospects show <prsp_id> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  prsp_id: prsp_ prefix id",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/prospects/:id.json"
  ].join("\n")],

  ["prospects replan", [
    "Usage:",
    `  ${PROSPECTS_REPLAN_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Re-run the next-action coach for one account prospect from the CLI without adding a product UI button.",
    "",
    "Behavior:",
    "  Defaults to a dry-run so operators can compare the cached plan with the current planner output.",
    "  Pass --apply to persist the replanned AccountProspect coach payload.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/:id/replan.json",
    "",
    "JSON body:",
    "  {",
    "    \"apply\": true",
    "  }"
  ].join("\n")],

  ["prospects reenrich", [
    "Usage:",
    `  ${PROSPECTS_REENRICH_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Force a full LinkedIn person profile enrichment for one prospect from the CLI.",
    "",
    "Behavior:",
    "  Defaults to a dry-run showing the selected profile, completeness signals, and whether a stale retry counter would be cleared.",
    "  Pass --apply to queue ProfileEnrichJob with a maintenance origin and schedule expansion after enrichment.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/:id/reenrich.json",
    "",
    "JSON body:",
    "  {",
    "    \"apply\": true,",
    "    \"profile_id\": \"prof_abc123\"",
    "  }"
  ].join("\n")],

  ["prospects refresh-queue", [
    "Usage:",
    `  ${PROSPECTS_REFRESH_QUEUE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Clear stale next-action coach and operator draft cache for one account prospect, then rebuild the queue row.",
    "",
    "Behavior:",
    "  Defaults to a dry-run showing coach-cache and draft-cache state.",
    "  Pass --apply to delete this prospect's account-scoped ProspectDraft rows, clear AccountProspect coach cache, and force the queue refresher.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/:id/refresh_queue.json",
    "",
    "JSON body:",
    "  {",
    "    \"apply\": true",
    "  }"
  ].join("\n")],

  ["prospects reject", [
    "Usage:",
    `  ${PROSPECTS_REJECT_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Reject one prospect through the shared disposition and account DNC path.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/:id/reject.json"
  ].join("\n")],

  ["prospects nurture", [
    "Usage:",
    `  ${PROSPECTS_NURTURE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Move one prospect to an inactive nurture disposition through the shared disposition path.",
    "",
    "Input shape:",
    "  reason: nurture | non_responsive | not_fit | bad_data_404. Defaults to nurture.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/:id/nurture.json"
  ].join("\n")],

  ["prospects restore", [
    "Usage:",
    `  ${PROSPECTS_RESTORE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Restore one rejected or inactive prospect through the shared disposition path.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/:id/restore.json"
  ].join("\n")],

  ["prospects lock", [
    "Usage:",
    `  ${PROSPECTS_LOCK_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Lock one prospect immediately through the same protected-relationship path used by the prospect page.",
    "",
    "Input shape:",
    "  kind: protected_relationship | company_policy. Defaults to protected_relationship.",
    "  note: optional operator note explaining the lock.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/:id/lock.json"
  ].join("\n")],

  ["prospects unlock", [
    "Usage:",
    `  ${PROSPECTS_UNLOCK_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Clear one prospect lock through the same unlock path used by the prospect page.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/:id/unlock.json"
  ].join("\n")],

  ["prospects timeline", [
    "Usage:",
    "  audienti prospects timeline <prsp_id> [--json] [--types <post,comment,reaction>] [--limit <n>] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Read one prospect's visible timeline without running sequence preview or generation work.",
    "",
    "Input shape:",
    "  prsp_id: prsp_ prefix id",
    "  types: optional comma-separated filter. Supported: post, comment, action, message, reaction, provenance",
    "  limit: optional max rows, capped by the API",
    "",
    "Output shape:",
    "  timeline[].type: post | comment | action | message | reaction | provenance",
    "  timeline[].occurred_at: ISO-8601 timestamp, newest first",
    "  timeline[].url: source URL when available",
    "  timeline[].text: normalized display text",
    "  timeline[].profile.url: source profile URL when available",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/prospects/:id/timeline.json"
  ].join("\n")],

  ["prospects message-types", [
    "Usage:",
    "  audienti prospects message-types <prsp_id> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  List the sequence surface keys the shared writer can preview for one prospect.",
    "",
    "Output shape:",
    "  message_surfaces[].key: sequence surface key such as connection_request or post_accept_message",
    "  message_surfaces[].canonical_message_type: connection_request | direct_message | inmail | email | post_comment | comment_reply",
    "  message_surfaces[].available: boolean",
    "  message_surfaces[].missing_reason: string | null",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/prospects/:id/message_types.json"
  ].join("\n")],

  ["prospects write", [
    "Usage:",
    "  audienti prospects write <prsp_id> --type <surface_key> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  prsp_id: prsp_ prefix id",
    "  surface_key: one of connection_request, post_accept_message, follow_up_direct_message, email, inbound_reply, public_comment, comment_reply",
    "",
    "Behavior:",
    "  Generates a prospect-specific draft through the shared writer preview path for the selected sequence surface.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/:id/write_message.json",
    "",
    "JSON body:",
    "  {",
    "    \"surface_key\": \"post_accept_message\"",
    "  }"
  ].join("\n")],

  ["prospects add-note", [
    "Usage:",
    `  ${PROSPECTS_ADD_NOTE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Record an internal note, steer guidance, or manual outreach note through the same prospect note event seam the app uses.",
    "",
    "Input shape:",
    "  prsp_id: prsp_ prefix id",
    "  note_type: note | steer | voicemail_outreach | video_outreach",
    "  message: string",
    "  engagement_key: optional shared engagement key such as action.meeting.canceled",
    "",
    "Behavior:",
    "  Passing --engagement-type tracks the note as an external engagement that already happened, which is how the UI records states like a meeting that will not happen.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/:id/add_note.json",
    "",
    "JSON body:",
    "  {",
    "    \"note_type\": \"steer\",",
    "    \"message\": \"Meeting will not happen after procurement pushed it out.\",",
    "    \"track_as_engagement\": true,",
    "    \"engagement_key\": \"action.meeting.canceled\"",
    "  }"
  ].join("\n")],

  ["prospects add-steer", [
    "Usage:",
    `  ${PROSPECTS_ADD_STEER_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Record a steer note through the same prospect note event seam the app uses without requiring --type steer.",
    "",
    "Input shape:",
    "  prsp_id: prsp_ prefix id",
    "  message: string",
    "  engagement_key: optional shared engagement key such as action.meeting.canceled",
    "",
    "Behavior:",
    "  Always submits note_type=steer. Passing --engagement-type tracks the steer as an external engagement that already happened.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/:id/add_note.json",
    "",
    "JSON body:",
    "  {",
    "    \"note_type\": \"steer\",",
    "    \"message\": \"Meeting will not happen after procurement pushed it out.\",",
    "    \"track_as_engagement\": true,",
    "    \"engagement_key\": \"action.meeting.canceled\"",
    "  }"
  ].join("\n")],

  ["prospects add-profile", [
    "Usage:",
    `  ${PROSPECTS_ADD_PROFILE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Add a profile, email address, or phone number to an existing prospect through the same add-profile path used by the prospect show page.",
    "",
    "Input shape:",
    "  prsp_id: prsp_ prospect prefix id",
    "  url: supported profile URL, plain email address, mailto: URL, plain phone number, or tel: URL",
    "",
    "Output shape:",
    "  prospect: prospect summary",
    "  profile: attached profile with prefix_id, citation_id, identifier, username, url, and status",
    "  status: attached | already_attached",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/:id/profiles.json",
    "",
    "JSON body:",
    "  {",
    "    \"url\": \"prospect@example.com\"",
    "  }"
  ].join("\n")],

  ["prospects report-bad-profile", [
    "Usage:",
    `  ${PROSPECTS_REPORT_BAD_PROFILE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Report one of a prospect's attached profiles as bad through the same report action used by the prospect show page.",
    "",
    "Input shape:",
    "  prsp_id: prsp_ prospect prefix id",
    "  prof_id: prof_ prefix id or citation id such as email/profile:name@example.com",
    "",
    "Output shape:",
    "  prospect: prospect summary",
    "  profile: reported profile",
    "  status: reported",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/:id/report_bad_profile.json",
    "",
    "JSON body:",
    "  {",
    "    \"profile_id\": \"prof_abc123\"",
    "  }"
  ].join("\n")],

  ["prospects sequence-preview", [
    "Usage:",
    "  audienti prospects sequence-preview <prsp_id> [--json] [--connection-state <state>] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Run the existing sequence-preview report workflow for one prospect and return the generated report payload.",
    "",
    "Options:",
    "  --connection-state <state>  Optional branch override: not_connected | request_sent | accepted",
    "",
    "Output shape:",
    "  report.selected: resolved prospect, motion, agent, and offer context",
    "  report.steps[]: ordered wait/action/message/terminal steps from the sequence preview tool",
    "  report.summary: channel sequence, touch counts, duration, terminal disposition",
    "  report.last_preview: latest persisted preview history entry",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/:id/sequence_preview.json"
  ].join("\n")],

  ["writer", [
    "Usage:",
    `  ${WRITER_TEST_RUN_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Run a report-backed writer session for one prospect: resolve current context, build the no-reply timeline, and optionally draft selected rows.",
    "",
    "Commands:",
    "  audienti writer test-run <prsp_id>",
    "  audienti writer test-run show <prsp_id> <rprt_id>",
    "",
    "Alias:",
    "  audienti writers test-run <prsp_id>"
  ].join("\n")],

  ["writer test-run", [
    "Usage:",
    `  ${WRITER_TEST_RUN_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Run or continue the prospect-scoped writer session report for a single prospect.",
    "",
    "Commands:",
    "  audienti writer test-run <prsp_id>",
    "  audienti writer test-run show <prsp_id> <rprt_id>",
    "",
    "Behavior:",
    "  Creates or updates a server report for the writing session. The default plan mode writes the timeline to that report without drafting every message. Step mode drafts one selected row against the same report when --report <rprt_id> is passed. Drafting every message requires --mode report.",
    "",
    "Local workflow:",
    "  1. Start the local app server for the workspace, for example: direnv exec . bin/dev",
    "  2. Confirm bin/cli is pointed at the local API: bin/cli config list --json",
    "  3. Start or reopen the timeline report: bin/cli writer test-run <prsp_id>",
    "  4. Save the printed Report id, then draft one row into that same session:",
    "     bin/cli writer test-run <prsp_id> --mode step --branch no-accept --step <row_number|step_key> --report <rprt_id>",
    "  5. To launch work and come back later, add --no-wait, then inspect it with:",
    "     bin/cli writer test-run show <prsp_id> <rprt_id>",
    "",
    "Report workflow:",
    "  The report is the session cache. Plan mode writes the timeline to the report. Step mode reads prior drafted rows from the same report and writes the selected row back to it. Reports expire after the server retention window.",
    "",
    "Options:",
    "  --mode <mode>    plan skips drafting, report drafts every message, step drafts one selected step",
    "  --branch <branch>  Optional branch filter: both | no-accept | accepted",
    "  --step <step_key|row_number>  Required with --mode step. Row numbers come from the # column.",
    "  --report <rprt_id>  Continue an existing writer session report",
    "  --no-wait       Queue the writer report job, print the report id, and exit",
    "  --timeout-seconds <n>  Wait budget before the command fails. Default: 180",
    "  --poll-interval-seconds <n>  Status poll interval. Default: 2",
    "",
    "Output shape:",
    "  branches[].key: no_accept | accepted",
    "  branches[].steps[]: ordered wait/action/message/terminal steps for that simulated path",
    "  branches[].steps[].body: draft copy for message steps only in report mode, step mode, or when already present in the report",
    "  branches[].summary: channel sequence, touch counts, duration, terminal disposition",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/:id/sequence_export_jobs.json, then poll GET /api/v1/accounts/:account_id/prospects/:id/sequence_export_jobs/:job_id.json"
  ].join("\n")],

  ["writer test-run show", [
    "Usage:",
    `  ${WRITER_TEST_RUN_SHOW_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Fetch a writer session report by report id and render the saved output when it is complete.",
    "",
    "Behavior:",
    "  Completed jobs render the same campaign simulator output as the original test-run command. Pending or processing jobs print report status and the check-later command. Failed jobs print the persisted failure reason.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/prospects/:id/sequence_export_jobs/:job_id.json"
  ].join("\n")],

  ["prospects sequence-export", [
    "Usage:",
    "  audienti prospects sequence-export <prsp_id> [--json|--csv] [--branch <both|no-accept|accepted>] [--draft-mode <all|plan|target>] [--target-step <step_key|row_number>] [--angle-index <n>] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Generate the full no-reply path for spreadsheet review without opening or updating a report workspace.",
    "",
    "Branches:",
    "  both: default. Runs no_accept and accepted branches",
    "  no-accept: no reply and no accepted connection request",
    "  accepted: connection request accepted, then no reply otherwise",
    "",
    "Draft modes:",
    "  all: default. Draft every message step",
    "  plan: build the timeline without drafting message bodies",
    "  target: draft only --target-step and return the branch prefix through that step. Row numbers use rows[].step_number.",
    "",
    "Output shape:",
    "  rows[].prospect_id: prsp_",
    "  rows[].branch: no_accept | accepted",
    "  rows[].step_number: spreadsheet row order within the branch",
    "  rows[].kind: message | wait | action | terminal",
    "  rows[].stage/channel/scheduled_for/body: sequence details for spreadsheet columns",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospects/:id/sequence_export.json"
  ].join("\n")],

  ["prospects import", [
    "Usage:",
    "  audienti prospects import <linkedin_url> [--list <list_id>] [--motion <motn_id>] [--assigned-user <id|me>] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  linkedin_url: url  LinkedIn person profile URL, not a company URL",
    "  list_id: list_ prefix id | optional",
    "  motn_id: motn_ prefix id | optional",
    "  assigned_user_id: account user id or me | optional",
    "",
    "Behavior:",
    "  Creates or reuses a person prospect, stores the LinkedIn profile as the prospect primary profile, optionally attaches it to a motion, adds it to the selected list plus the motion list when both are different, and enqueues enrichment plus expansion.",
    "",
    "Output shape:",
    "  prefix_id: primp_ prospect import id",
    "  status: running | completed | failed",
    "  ready: boolean",
    "  prospect.prefix_id: prsp_",
    "  profile.prefix_id: prof_",
    "  pipeline.enrichment_status: profile status",
    "  pipeline.expansion_status: waiting_for_enrichment | pending | completed | blocked",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospect_imports.json",
    "",
    "JSON body:",
    "  {",
    "    \"linkedin_url\": \"https://www.linkedin.com/in/example-person\",",
    "    \"list_id\": \"list_abc123\",",
    "    \"motion_id\": \"motn_abc123\",",
    "    \"assigned_user_id\": \"me\"",
    "  }"
  ].join("\n")],

  ["prospects import-batch", [
    "Usage:",
    `  ${PROSPECTS_IMPORT_BATCH_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  file: CSV with linkedin_url/url header, JSON array, JSONL objects, or newline-delimited LinkedIn URLs",
    "  list_id: list_ prefix id | optional default for every row",
    "  motn_id: motn_ prefix id | optional default for every row",
    "  new_list_name: list name | a row value creates that row's list; command default applies to rows without one",
    "  new_transition_name: system transition name | a row value creates that row's transition; command default applies to rows without one",
    "  assigned_user_id: account user id or me | optional default for every row",
    "",
    "CSV columns:",
    "  linkedin_url or url, list_id, motion_id, new_list_name, new_transition_name, assigned_user_id",
    "",
    "Behavior:",
    "  Starts one normal prospect import per row. Row-level destination names or IDs and assigned_user_id override command defaults.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/prospect_imports.json"
  ].join("\n")],

  ["prospects import-status", [
    "Usage:",
    "  audienti prospects import-status <primp_id> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  primp_id: primp_ prospect import prefix id",
    "",
    "Output shape:",
    "  status: running | completed | failed",
    "  ready: boolean",
    "  prospect: id, prefix_id, display_name, title, company, email, linkedin_url",
    "  profile: imported primary profile with status, bio, job_title, image_url",
    "  data.emails[]: value, source_finder, source_category",
    "  data.phones[]: value",
    "  data.social_profiles[]: identifier, username, url, status",
    "  pipeline.missing_fields[]: enriched profile fields still absent",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/prospect_imports/:id.json"
  ].join("\n")],

  ["tools", [
    "Usage:",
    "  audienti tools list [--json]",
    "  audienti tools get <email|phone> --url <linkedin_url> [--json]",
    "  audienti tools humanize --file <path> [--tone <tone>] [--language <language>] [--async [--wait]] [--json]",
    "  audienti tools email-find --first-name <name> --last-name <name> --company-domain <domain> [--wait] [--json]",
    "  audienti tools email-find --linkedin-url <url> | --file <csv|jsonl|json> [--wait] [--json]",
    "  audienti tools linkedin-enrich --url <linkedin_url> [--kind <person|company>] | --file <path> [--wait] [--json]",
    "  audienti tools signals-find --icp <text> --question <text> [--count <n>] [--date-window-days <n>] [--wait] [--json]",
    "  audienti tools write --purpose <text> --audience <text> --fact <text> --channel <channel> [--wait] [--json]",
    "  audienti tools runs list|show <trun_id>|results <trun_id>|export <trun_id> [--json]",
    "  audienti tools linkedin-review --url <linkedin_url> [--icp <icp_id>] [--json]",
    "  audienti tools linkedin-review reports [--limit <n>] [--json]",
    "  audienti tools linkedin-review show <rprt_id> [--json]",
    "  audienti tools linkedin-review status <rprt_id> [--json]",
    "  audienti tools linkedin-strategy-review list [--limit <n>] [--json]",
    "  audienti tools linkedin-strategy-review create --url <linkedin_profile_url> [--json]",
    "  audienti tools linkedin-strategy-review show <rprt_id> [--json]",
    "  audienti tools linkedin-strategy-review delete <rprt_id> --confirm <yes|true|Y|y> [--json]",
    "",
    "Status: implemented",
    "",
    "Commands:",
    "  audienti tools list             Show available CLI tools and the report commands they support.",
    "  audienti tools get              Run a LinkedIn URL through the existing import and contact-enrichment pipeline, then return the first selected email or phone.",
    "  audienti tools humanize         Humanize arbitrary UTF-8 text and print the result.",
    "  audienti tools email-find       Find work emails without creating prospects (returns a run id).",
    "  audienti tools linkedin-enrich  Enrich LinkedIn person or company URLs without creating prospects.",
    "  audienti tools signals-find     Find companies matching an ICP and a signal question, with sources.",
    "  audienti tools write            Write one draft from a brief. Nothing is sent.",
    "  audienti tools runs             List tool runs and read their status, results and exports.",
    "  audienti tools linkedin-review  Queue a LinkedIn personal profile authority review and ICP-fit positioning blueprint.",
    "  audienti tools linkedin-review reports  List recent LinkedIn Review reports for the active account.",
    "  audienti tools linkedin-review show     View the completed report content in the terminal.",
    "  audienti tools linkedin-review status  Show the current report stage and run status.",
    "  audienti tools linkedin-strategy-review list    List recent LinkedIn strategy review reports.",
    "  audienti tools linkedin-strategy-review create  Queue a LinkedIn strategy review for a person profile.",
    "  audienti tools linkedin-strategy-review show    Show one strategy review's status and content.",
    "  audienti tools linkedin-strategy-review delete  Delete one LinkedIn strategy review report."
  ].join("\n")],

  ["tools list", [
    "Usage:",
    `  ${TOOLS_LIST_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Shows the available CLI-backed tools and which commands create or inspect reports.",
    "",
    "Output:",
    "  Plain text: tool id, create command, and reports command",
    "  JSON: { tools }"
  ].join("\n")],

  ["tools get", [
    "Usage:",
    "  audienti tools get <email|phone> --url <linkedin_url> [--json] [--timeout-seconds <n>] [--poll-interval-seconds <n>] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Uses the existing prospect import enrichment pipeline, waits for completion, and returns the first selected email or phone for the LinkedIn person URL.",
    "",
    "Input shape:",
    "  kind: email | phone",
    "  linkedin_url: url  LinkedIn person profile URL, not a company URL",
    "",
    "Behavior:",
    "  Starts the same account-scoped import flow as `audienti prospects import`, polls `prospects import-status`, and reads the first value from `data.emails[]` or `data.phones[]`.",
    "  phone lookup still depends on the email waterfall selecting an email first, because the current phone waterfall is gated on email discovery.",
    "",
    "Options:",
    "  --timeout-seconds <n>         Total wait budget before the command fails. Default: 60",
    "  --poll-interval-seconds <n>   Delay between import-status polls. Default: 2",
    "",
    "Output:",
    "  Plain text: the selected value on success, or a readable not-found message",
    "  JSON: { kind, url, found, value, import_id, status, ready, prospect, pipeline }"
  ].join("\n")],

  ["tools humanize", [
    "Usage:",
    `  ${TOOLS_HUMANIZE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Sends arbitrary UTF-8 text to Audienti's server-side humanizer without exposing the provider key.",
    "",
    "Options:",
    "  --file <path>       Required UTF-8 text file",
    "  --tone <professional|academic|blog|casual|creative|scientific|technical>",
    "  --language <name>   Optional language hint, for example English",
    "",
    "  --async             Submit as a tool run and print the run id instead (add --wait to poll for the result)",
    "",
    "Output:",
    "  Plain text: only the humanized text, suitable for redirecting to a file",
    "  JSON: { humanized_text, id, input_words, run_id }",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/tools/humanize.json",
    "  POST /api/v1/accounts/:account_id/tools/runs.json (--async)"
  ].join("\n")],

  ["tools linkedin-review", [
    "Usage:",
    "  audienti tools linkedin-review --url <linkedin_url> [--icp <icp_id>] [--json] [--account <acct_id>]",
    "  audienti tools linkedin-review reports [--limit <n>] [--json] [--account <acct_id>]",
    "  audienti tools linkedin-review show <rprt_id> [--json] [--account <acct_id>]",
    "  audienti tools linkedin-review status <rprt_id> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Queues the same LinkedIn Review / Blueprint report as the web tool for a LinkedIn person profile.",
    "",
    "Input shape:",
    "  linkedin_url: url  LinkedIn person profile URL, not a company URL",
    "  icp_id: icpp_ id or numeric id | optional buyer context for positioning rewrites",
    "",
    "Behavior:",
    "  Creates a profile-backed LinkedIn Blueprint report, starts profile enrichment when needed, and queues the authority review once the profile is ready.",
    "  The command returns the report URL and status command immediately; report generation continues in Audienti.",
    "",
    "Options:",
    "  --url <linkedin_url>  LinkedIn person profile URL",
    "  --icp <icp_id>        Optional ICP to tune positioning recommendations",
    "",
    "Output:",
    "  Plain text: queued report id, status, profile, ICP, queue state, and product URL",
    "  JSON: { report, profile, run, queue, icp, queued }",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/tools/linkedin-review/reports.json"
  ].join("\n")],

  ["tools linkedin-review reports", [
    "Usage:",
    `  ${TOOLS_LINKEDIN_REVIEW_REPORTS_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Lists recent LinkedIn Review reports for the active account so you can find report ids and inspect progress.",
    "",
    "Options:",
    "  --limit <n>  Number of recent reports to return. Default: 20, max: 100",
    "",
    "Output:",
    "  Plain text: report id, status, stage, profile, and updated timestamp",
    "  JSON: { reports, count, limit }",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/tools/linkedin-review/reports.json"
  ].join("\n")],

  ["tools linkedin-review show", [
    "Usage:",
    `  ${TOOLS_LINKEDIN_REVIEW_SHOW_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Prints the completed LinkedIn Review report content in the terminal.",
    "",
    "Input shape:",
    "  rprt_id: rprt_ report id from `audienti tools linkedin-review reports`",
    "",
    "Output:",
    "  Plain text: summary, strategy, rewrite, findings, lead magnets, and report URL",
    "  JSON: { report, profile, run, queue, icp, content }",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/tools/linkedin-review/reports/:id.json"
  ].join("\n")],

  ["tools linkedin-review status", [
    "Usage:",
    "  audienti tools linkedin-review status <rprt_id> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Shows whether a LinkedIn Review report is waiting on enrichment, running, completed, or failed.",
    "",
    "Input shape:",
    "  rprt_id: rprt_ report id returned by `audienti tools linkedin-review`",
    "",
    "Output:",
    "  Plain text: report status, stage, run status, queue state, timestamps, and product URL",
    "  JSON: { report, profile, run, queue, icp, queued }",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/tools/linkedin-review/reports/:id.json"
  ].join("\n")],

  ["inbox-ops", [
    "Usage:",
    `  ${INBOX_OPS_QUEUE_USAGE.slice("Usage: ".length)}`,
    `  ${INBOX_OPS_FILTERS_USAGE.slice("Usage: ".length)}`,
    ...Object.keys(INBOX_OPS_BULK_VERBS).map((verb) => `  ${inboxOpsBulkUsage(verb).slice("Usage: ".length)}`),
    `  ${INBOX_OPS_RULE_USAGE.slice("Usage: ".length)}`,
    `  ${INBOX_OPS_RULE_SET_USAGE.slice("Usage: ".length)}`,
    `  ${INBOX_OPS_RULE_REMOVE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Inspect the authenticated owner's private Inbox Ops queue and personal/global email rules, then clear rows in bulk by number or set and remove sender and domain rules.",
    "",
    "Workflow:",
    "  1. audienti inbox-ops queue                      (numbers every row and saves the list locally)",
    "  2. audienti inbox-ops queue --group-by domain    (see which domains dominate)",
    "  3. audienti inbox-ops ignore 1-25 --yes          (or filter-domain / filter-sender / allow-sender / allow-domain)",
    "",
    "Safety:",
    "  Rules always apply to the token owner. Row-based updates derive identity from an authorized current Inbox Ops row.",
    "  Bulk verbs print a manifest and apply only with --yes or an interactive confirmation; --dry-run validates every row on the server without changing anything.",
    "  Key-based set/remove commands normalize and validate the supplied sender or domain on the server.",
    "",
    "Rule values:",
    "  --scope sender|domain",
    "  --disposition allow|filter",
    "",
    "API:",
    "  queue: GET /api/v1/accounts/:account_id/operator.json?opportunity_kind=inbox",
    "  filters: GET /api/v1/accounts/:account_id/inbox_ops/filters.json",
    "  bulk: POST /api/v1/accounts/:account_id/inbox_ops/actions.json",
    "  rule: PATCH /api/v1/accounts/:account_id/inbox_ops/:row_id/rule.json",
    "  keyed rules: PATCH|DELETE /api/v1/accounts/:account_id/inbox_ops/rules.json"
  ].join("\n")],

  ["inbox-ops queue", [
    INBOX_OPS_QUEUE_USAGE,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  List every current private Inbox Ops row for the authenticated owner with a short number, the authoritative sender/domain rule identity, subject, and connected inbox.",
    "  The numbered list is saved locally per account so the bulk verbs can select rows by number until you re-run this command.",
    "  --group-by domain summarizes the same list by sender domain with the row numbers in each group.",
    "",
    "Paging:",
    "  Without paging flags the command follows every page itself. Pass --page, --offset, or --cursor to read exactly one page instead;",
    "  that page is numbered and saved the same way and prints the exact continuation command when more rows remain.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/operator.json?opportunity_kind=inbox"
  ].join("\n")],

  ...Object.keys(INBOX_OPS_BULK_VERBS).map((verb) => [`inbox-ops ${verb}`, [
    inboxOpsBulkUsage(verb),
    "",
    "Status: implemented",
    "",
    "Purpose:",
    verb === "ignore"
      ? "  Hide the selected private inbound threads from Inbox Ops. A newer reply in the same thread reopens it."
      : `  ${INBOX_OPS_BULK_LABELS[verb]} the selected rows by writing one durable ${verb.endsWith("domain") ? "domain" : "sender"} rule per distinct key. Matching current and future messages ${verb.startsWith("allow") ? "always stay visible" : "leave the queue"}.`,
    "",
    "Selectors:",
    "  Numbers and ranges from the last `audienti inbox-ops queue` list: 1 4 7-12 or 1-25,30",
    "  Row ids: inbox_ops_message_<id>",
    "  --domain <domain> selects every listed row whose sender domain matches (subdomains included)",
    "  --sender <email> selects every listed row from that sender",
    ...(verb === "ignore" ? [] : [
      `  With only --${verb.endsWith("domain") ? "domain" : "sender"} and no row selectors, the rule is written directly by key even when the rows are no longer listed.`
    ]),
    "",
    "Safety:",
    "  Prints the manifest first. Applies only with --yes or an interactive confirmation.",
    "  --dry-run sends the batch to the server with dry_run and reports planned/skipped/rejected per row without changing anything.",
    "  Rows another owner controls, stale rows, and malformed ids are rejected individually; the rest still apply.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/inbox_ops/actions.json {operation, row_ids, dry_run}"
  ].join("\n")]),

  ["inbox-ops filters", [
    INBOX_OPS_FILTERS_USAGE,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Read the authenticated owner's normalized personal/global Inbox Ops filters and sender/domain rules.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/inbox_ops/filters.json"
  ].join("\n")],

  ["inbox-ops rule", [
    "Usage:",
    `  ${INBOX_OPS_RULE_USAGE.slice("Usage: ".length)}`,
    `  ${INBOX_OPS_RULE_SET_USAGE.slice("Usage: ".length)}`,
    `  ${INBOX_OPS_RULE_REMOVE_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Set one allow or filter rule from an authorized current Inbox Ops row, or set/remove a normalized rule by key.",
    "",
    "Safety:",
    "  The server derives row-based identities and normalizes and validates direct sender/domain keys.",
    "  Every mutation applies only to the authenticated token owner's personal/global preferences.",
    "",
    "Rule values:",
    "  --scope sender|domain",
    "  --disposition allow|filter",
    "",
    "API:",
    "  row: PATCH /api/v1/accounts/:account_id/inbox_ops/:row_id/rule.json",
    "  key: PATCH|DELETE /api/v1/accounts/:account_id/inbox_ops/rules.json"
  ].join("\n")],

  ["network-ops", [
    "Usage:",
    `  ${NETWORK_OPS_QUEUE_USAGE.slice("Usage: ".length)}`,
    `  ${NETWORK_OPS_ACCEPT_USAGE.slice("Usage: ".length)}`,
    `  ${NETWORK_OPS_DECLINE_USAGE.slice("Usage: ".length)}`,
    "  audienti network-ops reject <row_id> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Inspect the authenticated owner's private inbound LinkedIn connection requests and queue accept or decline provider actions.",
    "  `reject` is accepted as an alias for `decline`.",
    "",
    "Safety:",
    "  Rows always resolve through the current owner-private Network Ops scope. Arbitrary event ids and another user's requests fail closed.",
    "  A successful response means the provider action was queued, not that LinkedIn has confirmed it.",
    "",
    "API:",
    "  queue: GET /api/v1/accounts/:account_id/operator.json?opportunity_kind=network",
    "  action: POST /api/v1/accounts/:account_id/network_ops/:row_id/:accept_or_decline.json"
  ].join("\n")],

  ["network-ops queue", [
    NETWORK_OPS_QUEUE_USAGE,
    "",
    "Status: implemented",
    "",
    ...OPERATOR_PAGINATION_HELP,
    "Purpose:",
    "  List one page of the authenticated owner's pending inbound LinkedIn connection requests, including the already-synced LinkedIn headline and the exact invitation-bound message when available.",
    "  The general equivalent is `audienti operator queue --opportunity-kind network`.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/operator.json?opportunity_kind=network"
  ].join("\n")],

  ["network-ops accept", [
    NETWORK_OPS_ACCEPT_USAGE,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Queue the canonical LinkedIn accept action for one authorized pending Network Ops row.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/network_ops/:row_id/accept.json"
  ].join("\n")],

  ["network-ops decline", [
    NETWORK_OPS_DECLINE_USAGE,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Queue the canonical LinkedIn decline action for one authorized pending Network Ops row. `reject` is an alias.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/network_ops/:row_id/decline.json"
  ].join("\n")],

  ["operator", [
    "Usage:",
    "  audienti operator next [--json|--plan|--done|--skip|--fail|--return]",
    "  audienti operator queue [--json]",
    "  audienti operator failed-drafts [--json]",
    "  audienti operator failed-drafts requeue (--all | <row_id> [row_id...])",
    "  audienti operator outcome <row_id> --payload <file.json>",
    "  audienti operator answer <row_id> (--choice <id> | --answer <text>)",
    "",
    "Status: read commands, failed draft requeue, and prospect next-move writeback implemented",
    "",
    "Filters:",
    "  --principal <account_user_id>",
    "  --motion <motn_id>",
    "  --list <list_id>",
    "  --stage <stage>",
    "  --opportunity-kind prospect|visibility|inbox|network|content",
    "  --writing-status ready|drafting|draft_failed"
  ].join("\n")],

  ["operator next", [
    "Usage:",
    "  audienti operator next [--json|--plan|--done|--skip|--fail|--return] [filters] [--note <text>] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    ...OPERATOR_PAGINATION_HELP,
    "Options:",
    "  --plan  Render a deterministic static plan from the existing next-action coach payload, CTA, and operator draft state",
    "  --done  Mark the current next prospect move completed through the operator outcome API",
    "  --skip  Mark the current next prospect move skipped through the operator outcome API",
    "  --fail  Mark the current next prospect move failed through the operator outcome API",
    "  --return  Mark the current next prospect move returned through the operator outcome API",
    "  --note <text>  Optional outcome note used with --done, --skip, --fail, or --return",
    "  --occurred-at <ISO8601>  Optional completion timestamp used with an outcome flag",
    "",
    "Output shape:",
    "  next_move.id: row id",
    "  next_move.prospect.prefix_id: prsp_ | null",
    "  next_move.opportunity_kind: prospect | visibility",
    "  next_move.next_action: recommended action payload",
    "  next_move.cta: executable CTA metadata",
    "  next_move.operator_draft: draft state | null",
    "  filters: resolved operator filters",
    "  metrics: queue-builder metrics",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/operator/next.json",
    "  POST /api/v1/accounts/:account_id/operator/outcome.json when an outcome flag is used"
  ].join("\n")],

  ["operator queue", [
    "Usage:",
    "  audienti operator queue [--json] [filters] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    ...OPERATOR_PAGINATION_HELP,
    "Output shape:",
    "  next_move: focal operator row",
    "  decision_queue[]: ordered operator rows",
    "  daily_progress: pacing counters",
    "  outcome_rollups: queue rollups",
    "  options: motions, principals, lists, stages",
    "  has_more/next_page: continuation state",
    "  metrics.next_offset/next_cursor: exact continuation position",
    "  metrics.scan_ceiling_reached: incomplete scan; narrow the filters",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/operator.json"
  ].join("\n")],

  ["operator failed-drafts", [
    "Usage:",
    "  audienti operator failed-drafts [--json] [filters] [--account <acct_id>]",
    "  audienti operator failed-drafts requeue (--all | <row_id> [row_id...]) [--limit <n>] [--json] [filters] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    ...OPERATOR_PAGINATION_HELP,
    "Purpose:",
    "  Lists failed prospect operator drafts and queues selected drafts for rewriting.",
    "",
    "Filters:",
    "  --principal <account_user_id>",
    "  --motion <motn_id>",
    "  --list <list_id>",
    "  --stage <stage>",
    "  --query <text>",
    "",
    "Output:",
    "  Plain text: failed draft rows with status, reason, and draft snippet",
    "  JSON list: standard operator queue payload forced to prospect draft_failed rows",
    "  JSON requeue: { status, queued[], skipped[], failed[], metrics, message }",
    "",
    "Notes:",
    "  Requeue is async. A queued response means the rewrite job was accepted, not that the draft passed.",
    "  If a rewrite fails again, rerun the list command with the same filters to see the latest failure reason.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/operator.json?opportunity_kind=prospect&writing_status=draft_failed",
    "  POST /api/v1/accounts/:account_id/operator/failed_drafts/requeue.json"
  ].join("\n")],

  ["operator answer", [
    "Usage:",
    "  audienti operator answer <row_id> (--choice <id> | --answer <text>) [--json] [--account <acct_id>]",
    "  --principal <account_user_id> selects the same authorized sender scope used by operator queue.",
    "",
    "Status: implemented",
    "",
    "Behavior:",
    "  Refetches the exact current row, including questions that are not the next move, then sends its decision and fingerprints.",
    "  Choose exactly one candidate id or a nonblank answer. Answers apply only to this decision; stale or already answered questions return 409.",
    "  A 202 planning response records the answer; it does not authorize a provider send.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/operator/row.json?row_id=:row_id",
    "  POST /api/v1/accounts/:account_id/operator/answer.json"
  ].join("\n")],

  ["operator outcome", [
    "Usage:",
    "  audienti operator outcome <row_id> --payload <file.json> [--json] [--account <acct_id>]",
    "",
    "Status: implemented for prospect rows; visibility rows return a validation error",
    "",
    "Input shape:",
    "  status: done | skipped | failed | returned",
    "  action_type: connection_request | profile_view | follow | send_direct_message | send_email | move_to_nurture | string",
    "  prospect_id: prsp_ prefix id | optional",
    "  event_id: evnt_ prefix id | optional",
    "  note: string | optional",
    "  occurred_at: ISO8601 datetime | optional",
    "",
    "JSON example:",
    "  {",
    "    \"status\": \"done\",",
    "    \"action_type\": \"connection_request\",",
    "    \"prospect_id\": \"prsp_abc123\",",
    "    \"note\": \"Connection request sent.\"",
    "  }",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/operator/outcome.json"
  ].join("\n")],

  ["analytics", [
    "Usage:",
    "  audienti analytics motions [--json]",
    "  audienti analytics icps [--json]",
    "  audienti analytics prospects [--window 24h] [--cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD] [--motion <motn_id>] [--list <list_id>] [--user <account_user_id|email|name|me>] [--json]",
    "  audienti analytics dashboard [--cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD] [--play-tag <tag>] [--motion <motn_id>] [--list <list_id>] [--json]",
    "  audienti analytics metrics [--cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD | --cohort-preset week-to-date] [--interval <daily|weekly>] [--user <account_user_id|email|name|me>] [--motion <motn_id>] [--play-tag <tag>] [--list <list_id>] [--offer <offr_id>] [--icp <icp_id>] [--social-cookie <scok_id>] [--platform <platform>] [--action <action_key>] [--outcome <success|failure|first_attempt_success|succeeded_after_retry|failed_without_retry|failed_after_retry|in_progress|unresolved>] [--json]",
    "  audienti analytics stages [--interval weekly|monthly] [--cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD] [--play-tag <tag>] [--motion <motn_id>] [--list <list_id>] [--json]",
    "  audienti analytics cohorts create-list --name <text> --start YYYY-MM-DD --end YYYY-MM-DD [--note-mode <any|with_note|blank>] [--user <account_user_id|email|name|me>] [--json]",
    "  audienti analytics prospects cohort-analysis [--weeks <n>] [--window 24h] [--motion <motn_id>] [--list <list_id>] [--user <account_user_id|email|name|me>] [--json]",
    "  audienti analytics users [--user <account_user_id|email|name|me>] [--window 30d | --start YYYY-MM-DD --end YYYY-MM-DD] [--cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD] [--motion <motn_id>] [--list <list_id>] [--platform <linkedin|email|gmail>] [--json]",
    "  audienti analytics visibility [--window 24h] [--user <account_user_id|email|name|me>] [--json]",
    "  audienti analytics visops [--window 24h] [--user <account_user_id|email|name|me>] [--json]",
    "  audienti analytics content [--window 24h] [--user <account_user_id|email|name|me>] [--json]",
    "",
    "Status: implemented",
    "",
    "Window:",
    "  --window <24h|7d|1w|day|week>",
    "  --start <YYYY-MM-DD> --end <YYYY-MM-DD>  For user analytics, select the events.created_at activity range instead of --window.",
    "  --cohort-start <YYYY-MM-DD> --cohort-end <YYYY-MM-DD>  Select the AccountProspect.created_at cohort while --window or --start/--end selects the activity period.",
    "  --motion <motn_id>  For prospect and user analytics, filter AccountProspect.motion_id to one motion/play.",
    "  --list <list_id>  Filter analytics to prospects in one list, including analytics cohort lists.",
    "  --play-tag <tag>  For dashboard analytics, filter to motions/lists tagged with a campaign tag.",
    "  --interval <weekly|monthly>  For stages analytics, select the conversion cohort grain.",
    "  Metrics uses events.created_at root-operation cohorts and reports each operation's current outcome across its attempts; it is not an AccountProspect.created_at entry cohort.",
    "  --provenance <source>  Optional lower-level AccountProspect.intake_source filter.",
    "  --platform <linkedin|email|gmail>  For user analytics, filter events.platform. --channel is accepted as an alias.",
    "  cohort-analysis loops over recent weekly AccountProspect.created_at cohorts and compares their current stages.",
    "  cohorts create-list materializes an events.created_at cohort as a normal account list for reuse in dashboard, prospects, and users analytics.",
    "  --user <account_user_id|email|name|me>  Narrow analytics to one account user. For prospect analytics, this means prospects assigned to that account user. Email/name partials are accepted when they match exactly one account user.",
    "",
    "Output:",
    "  Account-scoped analytics for the motion portfolio, ICP portfolio, prospects, campaign dashboard counts, users, visibility engagement, and ContentOps publishing."
  ].join("\n")],

  ["analytics motions", [
    "Usage:",
    `  ${ANALYTICS_MOTIONS_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Show the account motion portfolio's current prospect mix and rolling seven-day contribution.",
    "",
    "Attribution:",
    "  Current counts use each prospect's current motion association; Unattributed means no current motion.",
    "  Last-seven-day counts use the recorded source motion and fall back to the current motion only when source is blank.",
    "  Recent Unattributed means no attributable account source motion.",
    "",
    "Output shape:",
    "  current and recent: totals plus explicit attribution semantics",
    "  totals: motion and contribution counts",
    "  prospect_mix[]: overall and rolling-seven-day count and percentage by motion type",
    "  motions[]: current and rolling-seven-day prospect counts for every account motion",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/analytics/motions.json"
  ].join("\n")],

  ["analytics icps", [
    "Usage:",
    `  ${ANALYTICS_ICPS_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Show the account ICP portfolio's current prospect source mix and rolling seven-day contribution.",
    "",
    "Attribution:",
    "  Current and last-seven-day counts use the recorded source ICP and fall back to the current motion ICP only when source is blank.",
    "  Unattributed means no attributable account source ICP.",
    "",
    "Output shape:",
    "  current and recent: totals plus explicit attribution semantics",
    "  totals: ICP and contribution counts",
    "  prospect_mix[]: ICP created_at plus overall and rolling-seven-day count and percentage",
    "  icps[]: ICP created_at plus current and rolling-seven-day prospect counts",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/analytics/icps.json"
  ].join("\n")],

  ["analytics dashboard", [
    "Usage:",
    `  ${ANALYTICS_DASHBOARD_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Return the dashboard outreach read model through the CLI, including distinct company target counts for a motion, tag, offer, ICP, or user-filtered cohort.",
    "",
    "Options:",
    "  --cohort-start <YYYY-MM-DD> --cohort-end <YYYY-MM-DD>  Select the AccountProspect.created_at cohort.",
    "  --play-tag <tag>  Filter to motions/lists tagged with a campaign tag. --tag is accepted as an alias.",
    "  --motion <motn_id>  Filter to one motion/play.",
    "  --list <list_id>  Filter to prospects in one list, including analytics cohort lists.",
    "  --offer <offr_id>  Filter to one offer.",
    "  --icp <icp_id>  Filter to one ICP.",
    "  --user <account_user_id|email|name|me>  Filter to prospects assigned to one account user.",
    "",
    "Output shape:",
    "  cohort_size: people in the selected cohort",
    "  cohort_company_target_count: distinct company targets in that cohort",
    "  cohort_people_per_company_average: people per company target",
    "  active_cohort_count and active_cohort_company_target_count: still-active campaign cohort counts",
    "  pipeline_stage_counts[]: current stage distribution",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/analytics/dashboard.json"
  ].join("\n")],

  ["analytics metrics", [
    "Usage:",
    `  ${ANALYTICS_METRICS_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Return account-scoped outbound operation outcomes with exactly one authenticated API request.",
    "  The cohort is events.created_at: root operations created in the selected period, measured by their current outcomes.",
    "  This differs from AccountProspect.created_at entry cohorts used by dashboard, stages, and prospect cohort analysis.",
    "",
    "Options:",
    "  --cohort-start <YYYY-MM-DD> --cohort-end <YYYY-MM-DD>  Select an explicit inclusive operation cohort.",
    "  --cohort-preset <week-to-date>  Select the server-defined week-to-date cohort; cannot be combined with explicit dates.",
    "  --interval <daily|weekly>  Request daily or weekly operation rows. The server default is daily.",
    "  --user <account_user_id|email|name|me>  Filter to one account user.",
    "  --motion <motn_id>  Filter operations to prospects in one motion/play.",
    "  --play-tag <tag>  Filter operations to prospects in motions/lists with the tag.",
    "  --list <list_id>  Filter operations to prospects in one list.",
    "  --offer <offr_id>  Filter operations to prospects for one offer.",
    "  --icp <icp_id>  Filter operations to prospects for one ICP.",
    "  --social-cookie <scok_id>  Filter to one account-accessible Social Cookie.",
    "  --platform <platform>  Filter by the normalized event platform.",
    "  --action <action_key>  Filter by the exact outbound action key.",
    "  --outcome <success|failure|first_attempt_success|succeeded_after_retry|failed_without_retry|failed_after_retry|in_progress|unresolved>",
    "    Umbrella filters: success, failure.",
    "    Leaf outcomes: first_attempt_success, succeeded_after_retry, failed_without_retry, failed_after_retry, in_progress, unresolved.",
    "  --json  Print the API response deeply unchanged.",
    "",
    "Output:",
    "  Plain text formats only API-returned operation counts/rates, selected grid rows, actions, and account-wide cookie rows.",
    "  JSON is the canonical outbound_metrics response without client-side cohort, outcome, count, or rate calculations.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/analytics/metrics.json"
  ].join("\n")],

  ["analytics stages", [
    "Usage:",
    `  ${ANALYTICS_STAGES_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Return the stages dashboard read model through the CLI, including weekly or monthly conversion cohorts and current stage aging.",
    "",
    "Options:",
    "  --interval <weekly|monthly>  Conversion cohort grain. Defaults to weekly.",
    "  --cohort-start <YYYY-MM-DD> --cohort-end <YYYY-MM-DD>  Select the AccountProspect.created_at cohort.",
    "  --play-tag <tag>  Filter to motions/lists tagged with a campaign tag. --tag is accepted as an alias.",
    "  --motion <motn_id>  Filter to one motion/play.",
    "  --list <list_id>  Filter to prospects in one list, including analytics cohort lists.",
    "  --offer <offr_id>  Filter to one offer.",
    "  --icp <icp_id>  Filter to one ICP.",
    "  --user <account_user_id|email|name|me>  Filter to prospects assigned to one account user.",
    "",
    "Output shape:",
    "  conversion_grid.rows[]: period label, date bounds, totals_by_stage, and values keyed by stage metric",
    "  conversion_grid.stage_definitions[]: stable metric keys and numerator/denominator stage definitions",
    "  stage_aging.rows[]: current, due soon, overdue, age, and idle counts by current pipeline stage",
    "  stage_aging.totals: rollup current, due soon, overdue, overdue_rate, and oldest_idle_days",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/analytics/stages.json"
  ].join("\n")],

  ["analytics prospects", [
    "Usage:",
    `  ${ANALYTICS_PROSPECTS_USAGE.slice("Usage: ".length)}`,
    `  ${ANALYTICS_PROSPECTS_COHORT_ANALYSIS_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Output shape:",
    "  window: activity/event period for actions",
    "  cohort: selected AccountProspect.created_at cohort when cohort dates are provided",
    "  motion: selected motion/play when --motion is provided",
    "  list: selected list when --list is provided",
    "  provenance: selected AccountProspect.intake_source when --provenance is provided",
    "  prospects_added_count: account prospects added in the window, or cohort size when cohort dates are provided",
    "  cohort_prospects_count: selected AccountProspect.created_at cohort size when cohort dates are provided",
    "  account_user: selected account user when --user is provided, otherwise null",
    "  --user filters AccountProspect.assigned_to_account_user_id, so `--user me` reports prospects assigned to you",
    "  actions: outbound action totals in the window, narrowed to cohort prospects when cohort dates are provided",
    "  queue_stages[]: current account prospect stage counts, narrowed to the selected cohort when cohort dates are provided",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/analytics/prospects.json"
  ].join("\n")],

  ["analytics prospects cohort-analysis", [
    "Usage:",
    `  ${ANALYTICS_PROSPECTS_COHORT_ANALYSIS_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Behavior:",
    "  Calls the prospect analytics endpoint once per weekly AccountProspect.created_at cohort, then renders current pipeline-stage counts side by side so older cohorts can be compared against newer cohorts.",
    "",
    "Options:",
    "  --weeks <n>   Number of calendar-week cohorts to inspect. Defaults to 4. Maximum 26.",
    "  --window <w>  Activity window passed through to each analytics call. Defaults to 24h.",
    "  --motion <motn_id>  Optional motion/play filter.",
    "  --list <list_id>  Optional list filter.",
    "  --provenance <source>  Optional AccountProspect.intake_source filter.",
    "  --user <id>   Optional account-user filter.",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/analytics/prospects.json"
  ].join("\n")],

  ["analytics prospect", [
    "Usage:",
    "  audienti analytics prospect [--window 24h] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]",
    "",
    "Alias for `audienti analytics prospects`."
  ].join("\n")],

  ["analytics users", [
    "Usage:",
    `  ${ANALYTICS_USERS_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Audit one account user's outbound action history with the same actor semantics used by the Operations user analytics page.",
    "",
    "Options:",
    "  --user <account_user_id|email|name|me>  Defaults to me.",
    "  --window <w>                            Activity window. Defaults to 30d when --start/--end are not provided.",
    "  --start <YYYY-MM-DD> --end <YYYY-MM-DD>  Explicit events.created_at activity range.",
    "  --cohort-start <YYYY-MM-DD> --cohort-end <YYYY-MM-DD>  Optional AccountProspect.created_at cohort filter.",
    "  --motion <motn_id>                      Optional motion/play filter.",
    "  --list <list_id>                        Optional list filter.",
    "  --provenance <source>                   Optional AccountProspect.intake_source filter.",
    "  --platform <linkedin|email|gmail>        Optional events.platform filter. `email` includes email and gmail rows; --channel is an alias.",
    "",
    "Output shape:",
    "  account_user: selected account user",
    "  summary: performed-by-user totals and performed-by-others comparison",
    "  daily_actions[]: action counts by events.created_at date",
    "  action_mix[]: action type counts and percentages",
    "  platform: selected platform/channel filter when --platform or --channel is provided",
    "  platform_mix[]: platform counts and percentages",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/analytics/users.json"
  ].join("\n")],

  ["analytics cohorts", [
    "Usage:",
    `  ${ANALYTICS_COHORT_LIST_USAGE.slice("Usage: ".length)}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Materialize an events.created_at cohort as a normal account list so dashboard, prospects, and users analytics can filter by that list later.",
    "",
    "Options:",
    "  --name <text>       Required list name.",
    "  --start <YYYY-MM-DD> --end <YYYY-MM-DD>  Required activity date range.",
    "  --event connection_request_sent          Event selector. This is the supported event today.",
    "  --note-mode <any|with_note|blank>        Optional connection-request note selector.",
    "  --user <account_user_id|email|name|me>   Optional actor filter for the event sender.",
    "  --motion <motn_id>, --offer <offr_id>, --icp <icp_id>, --play-tag <tag>  Optional prospect/motion filters.",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/analytics/cohort_lists.json"
  ].join("\n")],

  ["analytics cohorts create-list", [
    "Usage:",
    `  ${ANALYTICS_COHORT_LIST_USAGE.slice("Usage: ".length)}`,
    "",
    "Alias for `audienti analytics cohorts`."
  ].join("\n")],

  ["analytics user", [
    "Usage:",
    "  audienti analytics user [--user <account_user_id|email|name|me>] [--window 30d | --start YYYY-MM-DD --end YYYY-MM-DD] [--cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD] [--motion <motn_id>] [--json] [--account <acct_id>]",
    "",
    "Alias for `audienti analytics users`."
  ].join("\n")],

  ["analytics visibility", [
    "Usage:",
    "  audienti analytics visibility [--window 24h] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Output shape:",
    "  unique_people_engaged_count: unique prospects or profiles touched by visibility actions in the window",
    "  account_user: selected account user when --user is provided, otherwise null",
    "  engagements: visibility action totals, type breakdown, and automated percentage",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/analytics/visibility.json"
  ].join("\n")],

  ["analytics visops", [
    "Usage:",
    "  audienti analytics visops [--window 24h] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]",
    "",
    "Alias for `audienti analytics visibility`."
  ].join("\n")],

  ["analytics content", [
    "Usage:",
    "  audienti analytics content [--window 24h] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Output shape:",
    "  account_user: selected account user when --user is provided, otherwise null",
    "  published_posts_count: ContentOps work items published in the window",
    "  stage_breakdown[]: current ContentOps work item stage counts",
    "  execution_status_breakdown[]: current ContentOps execution status counts",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/analytics/content.json"
  ].join("\n")],

  ["agent-workflows", [
    "Usage:",
    "  audienti help agent-workflows",
    "",
    "Purpose:",
    "  Give a local coding agent the shortest safe path through the common Audienti production workflows.",
    "",
    "1. Authenticate and select an account",
    "  Before creating, changing or judging any experiment: audienti help methodology",
    "  For website-only gift research: audienti tools gift-research --url <website>",
    "  Discover additional skills: audienti skills list",
    "  audienti auth login",
    "  audienti accounts list",
    "  audienti accounts select <acct_id>",
    "  audienti users list",
    "  audienti users select me",
    "  audienti setup play preflight --principal me --platform linkedin",
    "  audienti offers list",
    "  audienti icps list",
    "",
    "2. Create a motion or play",
    "  audienti setup play preflight --principal <account_user_id|me> --platform linkedin",
    "  audienti motions create --payload <file.json>",
    "  audienti motions abm-companies <motn_id> add --file abm-domains.txt",
    "  audienti motions clone <motn_id> --name \"New subset motion\"",
    "  audienti motions move-prospects <source_motn_id> --target <target_motn_id> <prsp_id> [prsp_id...]",
    "  audienti motions activate <motn_id>",
    "  audienti motions pause <motn_id>",
    "  audienti motions delete <motn_id> --confirm yes",
    "  audienti motions status <motn_id>",
    "  audienti motions run-discovery <motn_id>",
    "",
    "3. Add a new prospect from LinkedIn and poll enrichment",
    "  audienti lists create --name \"Target list\"",
    "  audienti prospects import https://www.linkedin.com/in/example --list <list_id> --assigned-user me",
    "  audienti prospects import-batch --file prospects.csv --motion <motn_id> --assigned-user me",
    "  audienti prospects import-status <primp_id>",
    "  audienti prospects show <prsp_id>",
    "  audienti tools get email --url https://www.linkedin.com/in/example",
    "",
    "4. Find an existing prospect and inspect next step",
    "  audienti prospects list --query \"name or company\" --wide",
    "  audienti prospects list --assigned-user unassigned",
    "  audienti prospects assign <prsp_id> --assigned-user me",
    "  audienti companies search --query \"Honeywell\"",
    "  audienti prospects list --company-profile <prof_id>",
    "  audienti prospects show <prsp_id>",
    "  audienti prospects timeline <prsp_id> --types post,comment,reaction --json",
    "  audienti prospects message-types <prsp_id>",
    "  audienti prospects add-profile <prsp_id> --url prospect@example.com",
    "  audienti prospects report-bad-profile <prsp_id> <prof_id>",
    "  audienti prospects add-note <prsp_id> --type steer --message \"Meeting will not happen\" --engagement-type action.meeting.canceled",
    "  audienti prospects set-status <prsp_id> --status not_fit",
    "  audienti prospects lock <prsp_id> --note \"Emergency hold\"",
    "  audienti prospects reject <prsp_id>",
    "  audienti prospects nurture <prsp_id>",
    "  audienti prospects restore <prsp_id>",
    "  audienti prospects unlock <prsp_id>",
    "  audienti prospects sequence-preview <prsp_id>",
    "  audienti writer test-run <prsp_id>",
    "  audienti prospects sequence-export <prsp_id> --csv",
    "",
    "5. Attach existing prospects without re-importing",
    "  audienti lists add-prospects <list_id> <prsp_id> [prsp_id...]",
    "  audienti motions add-prospects <motn_id> <prsp_id> [prsp_id...]",
    "",
  "6. Work the operator queue",
  "  audienti operator next",
  "  audienti operator next --plan",
  "  audienti operator queue --json",
  "  audienti operator failed-drafts",
  "  audienti operator failed-drafts requeue <row_id>",
  "  audienti operator outcome <row_id> --payload <file.json>",
  "  audienti network-ops queue",
  "  audienti network-ops accept <row_id>",
  "  audienti network-ops decline <row_id>",
  "  audienti inbox-ops queue",
  "  audienti inbox-ops queue --group-by domain",
  "  audienti inbox-ops ignore 1-25 --dry-run",
  "  audienti inbox-ops ignore 1-25 --yes",
  "  audienti inbox-ops filter-domain --domain alerts.example.com --yes",
  "  audienti inbox-ops filters",
  "  audienti inbox-ops rule <row_id> --scope sender --disposition filter",
  "  audienti inbox-ops rule set --scope sender --key news@example.com --disposition filter",
  "  audienti inbox-ops rule remove --scope domain --key example.com",
    "",
    "7. Inspect account analytics",
    "  audienti users activity me --window 7d",
    "  audienti analytics prospects --window 24h",
    "  audienti analytics dashboard --play-tag wine_campaign",
    "  audienti analytics metrics --cohort-preset week-to-date",
    "  audienti analytics stages --interval weekly --play-tag wine_campaign",
    "  audienti analytics cohorts create-list --name \"Connection requests 2026-07-20\" --start 2026-07-20 --end 2026-07-20",
    "  audienti analytics users --user me --window 30d",
    "  audienti analytics visibility --window 24h --user me",
    "  audienti analytics content --window week",
    "",
    "Good defaults:",
    "  Use --json when another tool or agent will parse the result.",
    "  Use --account <acct_id> to avoid mutating the saved account during one-off runs.",
    "  Use `audienti users list` before motion create or prospect assignment when you need a principal or assignee id.",
    "  Prefer prospects import for new LinkedIn people and add-prospects commands for records that already exist.",
    "",
    "Current gaps to plan around:",
    "  Operator outcome writeback is implemented for prospect rows, not visibility rows."
  ].join("\n")]
]);

// Social account credentials (#2306). Secrets never travel as argv flags,
// because argv lands in shell history and the process list. They come from
// stdin, one named environment variable, or a no-echo terminal prompt, and the
// CLI never prints them.
const SOCIAL_SECRET_KEYS = ["password", "otp_secret", "cookie_bundle", "messaging_pin", "otp_code"];
const SOCIAL_SECRET_FLAGS = new Set(["password", "pass", "otp", "otp-code", "code", "otp-secret", "totp", "totp-secret", "cookie", "cookies", "cookie-bundle", "messaging-pin", "pin", "secret"]);
const SOCIAL_PASSWORD_ENV = "AUDIENTI_SOCIAL_PASSWORD";
const SOCIAL_OTP_ENV = "AUDIENTI_OTP_CODE";
const SOCIAL_COOKIE_ATTRIBUTE_KEYS = new Set([
  "service_identifier", "username", "name", "email", "phone_number",
  "geo_location", "country_code", "postal_code", "state_code", "city",
  "imap_server", "imap_port", "smtp_server", "smtp_port", "use_ssl",
  "automation_controls", "rate_limit_overrides", "operator_controls"
]);
const SOCIAL_COOKIE_FIELD_OPTIONS = {
  name: { type: "string" },
  email: { type: "string" },
  attributes: { type: "string" },
  "password-stdin": { type: "boolean" },
  "secrets-stdin": { type: "boolean" },
  "password-env": { type: "boolean" },
  "prompt-password": { type: "boolean" }
};

function rejectSecretArgs(args) {
  for (const arg of args) {
    if (!String(arg).startsWith("--")) continue;
    const flag = String(arg).slice(2).split("=")[0];
    if (SOCIAL_SECRET_FLAGS.has(flag)) {
      throw new CommandError(`--${flag} is not accepted because command-line secrets leak into shell history. Use --password-stdin, --secrets-stdin, --otp-stdin, the ${SOCIAL_PASSWORD_ENV} or ${SOCIAL_OTP_ENV} variable, or the hidden prompt.`);
    }
  }
}

function rejectSecretKeys(object, flag) {
  const walk = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if (SOCIAL_SECRET_KEYS.includes(key)) throw new CommandError(`${flag} must not contain ${key}. Send secrets through stdin, an environment variable, or the hidden prompt.`);
      walk(nested);
    }
  };
  walk(object);
}

function trimSecret(text) {
  return String(text ?? "").replace(/\r?\n$/, "");
}

// Reads one line from the terminal without echoing it.
async function promptHidden(context, question) {
  const input = context.stdin;
  if (!input?.isTTY || typeof input.setRawMode !== "function") {
    throw new CommandError("No terminal is available for a hidden prompt. Use stdin or an environment variable instead.");
  }
  const output = context.stderr || context.stdout;
  output.write(question);
  input.setRawMode(true);
  input.resume();

  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error) => {
      input.removeListener("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const char of String(chunk)) {
        if (char === "\r" || char === "\n" || char === "\u0004") return finish();
        if (char === "\u0003") return finish(new CommandError("Cancelled."));
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    input.on("data", onData);
  });
}

async function readSocialOtp(values, usageLine, context) {
  if (values["otp-stdin"] && values["otp-env"]) throw new CommandError(usageLine);
  let code;
  if (values["otp-stdin"]) code = await readStdinText(context);
  else if (values["otp-env"]) code = context.env?.[SOCIAL_OTP_ENV];
  else if (stdinIsInteractive(context)) code = await promptHidden(context, "One-time code (hidden): ");
  else throw new CommandError(`Provide the code with --otp-stdin, --otp-env (${SOCIAL_OTP_ENV}), or run in a terminal for a hidden prompt.`);

  const trimmed = String(code ?? "").trim();
  if (!trimmed) throw new CommandError("The one-time code is empty.");
  return trimmed;
}

// Returns the secret fields to send, or {} when none were requested.
async function readSocialSecrets(values, usageLine, context, { allowBundle = true } = {}) {
  const sources = ["password-stdin", "secrets-stdin", "password-env", "prompt-password"].filter((key) => values[key]);
  if (sources.length > 1) throw new CommandError(`Use only one of --${sources.join(", --")}.`);
  const [source] = sources;
  if (!source) return {};

  if (source === "password-stdin") return { password: trimSecret(await readStdinText(context)) };
  if (source === "password-env") {
    const password = context.env?.[SOCIAL_PASSWORD_ENV];
    if (!password) throw new CommandError(`${SOCIAL_PASSWORD_ENV} is not set.`);
    return { password };
  }
  if (source === "prompt-password") return { password: await promptHidden(context, "Password (hidden): ") };

  if (!allowBundle) throw new CommandError(usageLine);
  let parsed;
  try {
    parsed = JSON.parse(await readStdinText(context));
  } catch {
    throw new CommandError("--secrets-stdin expects a JSON object with password, otp_secret, or messaging_pin.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CommandError("--secrets-stdin expects a JSON object with password, otp_secret, or messaging_pin.");
  }
  const allowed = ["password", "otp_secret", "messaging_pin"];
  const unknown = Object.keys(parsed).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new CommandError(`--secrets-stdin accepts only ${allowed.join(", ")}.`);
  return parsed;
}

async function socialCookieBody(values, usageLine, context, fields) {
  const attributes = parseJsonObjectOption(values.attributes, "--attributes") || {};
  const unknown = Object.keys(attributes).filter((key) => !SOCIAL_COOKIE_ATTRIBUTE_KEYS.has(key));
  if (unknown.length > 0) {
    throw new CommandError(`--attributes accepts only ${[...SOCIAL_COOKIE_ATTRIBUTE_KEYS].join(", ")}. Secrets go through stdin, an environment variable, or the hidden prompt.`);
  }
  rejectSecretKeys(attributes, "--attributes");

  return {
    ...attributes,
    ...compactObject({ ...fields, name: values.name, email: values.email }),
    ...(await readSocialSecrets(values, usageLine, context))
  };
}

function socialCookieRightsBody(values, usageLine) {
  if (values.workspaces !== undefined) {
    if (values.workspace || values.grant || values.revoke) throw new CommandError(usageLine);
    return { access_account_ids: values.workspaces.split(",").map((id) => id.trim()).filter(Boolean) };
  }
  if (!values.workspace || values.grant === values.revoke) throw new CommandError(usageLine);
  return { access_account_id: values.workspace, granted: Boolean(values.grant) };
}

async function socialCookieSettingsBody(values, usageLine, context) {
  const body = parseJsonObjectOption(values.body, "--body") || {};
  rejectSecretKeys(body, "--body");
  const merged = {
    ...body,
    ...compactObject({
      scope: values.scope,
      enabled: values.enabled,
      key: values.key,
      target: values.target,
      daily: values.daily,
      hourly: values.hourly,
      action_type: values["action-type"],
      mode: values.mode,
      level: values.level
    })
  };

  const secrets = await readSocialSecrets(values, usageLine, context, { allowBundle: false });
  if (Object.keys(secrets).length > 0) {
    if (!["details", "servers"].includes(values.scope)) throw new CommandError("A password is accepted only with --scope details or --scope servers.");
    merged.social_cookie = { ...(merged.social_cookie || {}), ...secrets };
  }
  return merged;
}

function describeSocialCookie(cookie) {
  if (!cookie) return "Social account not found.";
  const lines = [
    `${display(cookie.name || cookie.username)} (${display(cookie.prefix_id)})`,
    `Platform: ${display(cookie.platform)} | Status: ${display(cookie.status)}${cookie.autopilot_paused ? " | Autopilot paused" : ""}`,
    `Connection: ${display(cookie.connection?.title)}`
  ];
  if (cookie.connection?.body) lines.push(`  ${cookie.connection.body}`);
  if (cookie.otp_pending) lines.push("Waiting for a one-time code: run `audienti social-cookies submit-otp`.");
  for (const fact of cookie.account_facts || []) lines.push(`${display(fact?.label)}: ${display(fact?.value)}`);
  return lines.join("\n");
}

// Single-purpose actions that mirror one web button each (#2300, #2302).
// Every entry calls one API route that shares its service with the web action.
const ACCOUNT_OPTION_USAGE = "[--json] [--account <acct_id>]";
const PARITY_ACTION_COMMANDS = new Map([
  ["prospects defer", {
    usage: "audienti prospects defer <prsp_id>",
    purpose: "Push one prospect out of the queue for 24 hours, like Defer in the queue.",
    api: "POST /api/v1/accounts/:account_id/prospects/:id/defer.json",
    run: (client, accountId, [id]) => client.deferProspect(accountId, id),
    done: ([id]) => `Deferred prospect ${id} for 24 hours.`
  }],
  ["prospects delay", {
    usage: "audienti prospects delay <prsp_id> --for <1_day|1_week|1_month|3_months|6_months>",
    purpose: "Delay one prospect and move it to the Delayed list until the window ends.",
    api: "POST /api/v1/accounts/:account_id/prospects/:id/delay.json",
    options: { for: { type: "string" } },
    required: ["for"],
    run: (client, accountId, [id], values) => client.delayProspect(accountId, id, { delay_duration: values.for }),
    done: ([id], payload) => `Delayed prospect ${id} until ${display(payload?.undelay_at)}.`
  }],
  ["prospects monitor", {
    usage: "audienti prospects monitor <prsp_id> [--note <text>]",
    purpose: "Move one prospect to monitoring, like Monitor on the prospect page.",
    api: "POST /api/v1/accounts/:account_id/prospects/:id/monitor.json",
    options: { note: { type: "string" } },
    run: (client, accountId, [id], values) => client.monitorProspect(accountId, id, compactObject({ monitor_note: values.note })),
    done: ([id]) => `Monitoring prospect ${id}.`
  }],
  ["prospects unmonitor", {
    usage: "audienti prospects unmonitor <prsp_id>",
    purpose: "Stop monitoring one prospect.",
    api: "POST /api/v1/accounts/:account_id/prospects/:id/unmonitor.json",
    run: (client, accountId, [id]) => client.unmonitorProspect(accountId, id),
    done: ([id]) => `Stopped monitoring prospect ${id}.`
  }],
  ["prospects rename", {
    usage: "audienti prospects rename <prsp_id> --name <display_name>",
    purpose: "Change a prospect's display name. Backend admins only, like the web action.",
    api: "PATCH /api/v1/accounts/:account_id/prospects/:id/display_name.json",
    options: { name: { type: "string" } },
    required: ["name"],
    run: (client, accountId, [id], values) => client.renameProspect(accountId, id, { display_name: values.name }),
    done: ([id]) => `Renamed prospect ${id}.`
  }],
  ["prospects import-post", {
    usage: "audienti prospects import-post <prsp_id> --url <post_url> [--topic <topic_id>]",
    purpose: "Import one LinkedIn post for a prospect in the background.",
    api: "POST /api/v1/accounts/:account_id/prospects/:id/import_post.json",
    options: { url: { type: "string" }, topic: { type: "string" } },
    required: ["url"],
    run: (client, accountId, [id], values) => client.importProspectPost(accountId, id, compactObject({ url: values.url, topic_id: values.topic })),
    done: ([id]) => `Queued post import for prospect ${id}.`
  }],
  ["prospects sync", {
    usage: "audienti prospects sync <prsp_id> --social-cookie <id>",
    purpose: "Queue a message and email sync for one prospect through the selected LinkedIn account and other eligible sync accounts.",
    api: "POST /api/v1/accounts/:account_id/prospects/:id/sync.json",
    options: { "social-cookie": { type: "string" } },
    required: ["social-cookie"],
    run: (client, accountId, [id], values) => client.syncProspect(accountId, id, compactObject({ social_cookie_id: values["social-cookie"] })),
    done: ([id]) => `Queued message sync for prospect ${id}.`
  }],
  ["prospects cancel-event", {
    usage: "audienti prospects cancel-event <prsp_id> --event <event_id>",
    purpose: "Cancel one scheduled event for a prospect.",
    api: "POST /api/v1/accounts/:account_id/prospects/:id/cancel_scheduled_event.json",
    options: { event: { type: "string" } },
    required: ["event"],
    run: (client, accountId, [id], values) => client.cancelProspectScheduledEvent(accountId, id, { event_id: values.event }),
    done: ([id], payload) => `Canceled scheduled event ${display(payload?.event?.id)} for prospect ${id}.`
  }],
  ["prospects queue-draft", {
    usage: "audienti prospects queue-draft <prsp_id> [--context <json_object>] [--angle <n>]",
    purpose: "Write the queue draft for one prospect, like Write in the queue composer. Without --context the server uses the prospect's current queue action.",
    api: "POST /api/v1/accounts/:account_id/prospects/:id/write.json",
    options: { context: { type: "string" }, angle: { type: "string" } },
    parse: (values) => ({ ...values, context: parseJsonObjectOption(values.context, "--context") }),
    run: (client, accountId, [id], values) => client.writeProspectQueueDraft(accountId, id, compactObject({ context: values.context, angle_index: values.angle })),
    done: ([id]) => `Wrote queue draft for prospect ${id}.`
  }],
  ["prospects rewrite", {
    usage: "audienti prospects rewrite <prsp_id> [--subject <text>] [--message <text>] [--angle <n>]",
    purpose: "Start a fresh queue draft for one prospect in the background.",
    api: "POST /api/v1/accounts/:account_id/prospects/:id/rewrite.json",
    options: { subject: { type: "string" }, message: { type: "string" }, angle: { type: "string" } },
    run: (client, accountId, [id], values) => client.rewriteProspectQueueDraft(accountId, id, compactObject({ subject: values.subject, message: values.message, angle_index: values.angle })),
    done: ([id]) => `Started queue draft rewrite for prospect ${id}.`
  }],
  ["prospects engage", {
    usage: "audienti prospects engage <prsp_id> --type <action_type> [--message <text>] [--subject <text>] [--message-mode <mode>] [--social-cookie <id>] [--profile <id>] [--scheduled-at <iso8601>] [--post <post_id>] [--comment <comment_id>] [--reply-to <event_id>] [--request-event <event_id>] [--request-mode blank] [--queue-action] [--principal <account_user_id>]",
    purpose: "Run one manual engagement for a prospect with the same rules as the prospect composer. Use --post or --comment for post likes and comments, --reply-to for a message reply, and --queue-action to act like the queue composer (a connection request on a disconnected LinkedIn account is prepared, not sent).",
    api: "POST /api/v1/accounts/:account_id/prospects/:id/engage.json",
    options: {
      type: { type: "string" },
      message: { type: "string" },
      subject: { type: "string" },
      "message-mode": { type: "string" },
      "social-cookie": { type: "string" },
      profile: { type: "string" },
      "scheduled-at": { type: "string" },
      post: { type: "string" },
      comment: { type: "string" },
      "reply-to": { type: "string" },
      "request-event": { type: "string" },
      "request-mode": { type: "string" },
      "queue-action": { type: "boolean" },
      principal: { type: "string" }
    },
    required: ["type"],
    run: (client, accountId, [id], values) => client.engageProspect(accountId, id, compactObject({
      action_type: values.type,
      message: values.message,
      subject: values.subject,
      message_mode: values["message-mode"],
      engage_point_id: values["social-cookie"],
      profile_id: values.profile,
      scheduled_at: values["scheduled-at"],
      mention_id: values.post,
      comment_id: values.comment,
      message_id: values["reply-to"],
      request_event_id: values["request-event"],
      request_mode: values["request-mode"],
      queue_action: values["queue-action"] ? true : undefined,
      principal_account_user_id: values.principal
    })),
    done: (_positionals, payload) => display(payload?.message)
  }],
  ["prospects reject-selected", {
    usage: "audienti prospects reject-selected <prsp_id> [<prsp_id> ...]",
    minPositionals: 1,
    maxPositionals: Infinity,
    purpose: "Reject several prospects at once. Locked or unavailable prospects are reported as failed.",
    api: "POST /api/v1/accounts/:account_id/prospects/reject_selected.json",
    run: (client, accountId, ids) => client.rejectSelectedProspects(accountId, { prospect_ids: ids }),
    done: (_positionals, payload) => `Rejected ${payload?.rejected?.length ?? 0}; failed ${payload?.failed?.length ?? 0}.`
  }],
  ["prospects intake", {
    usage: "audienti prospects intake --url <linkedin_url> [--list <list_id>] [--motion <motn_id>] [--new-list <name>] [--new-transition <name>] [--assign <account_user_id>] [--signal <custom_signal_id>]",
    minPositionals: 0,
    maxPositionals: 0,
    purpose: "Add one LinkedIn person by URL, like Add prospect on the web.",
    api: "POST /api/v1/accounts/:account_id/prospects/intake.json",
    options: {
      url: { type: "string" },
      list: { type: "string" },
      motion: { type: "string" },
      "new-list": { type: "string" },
      "new-transition": { type: "string" },
      assign: { type: "string" },
      signal: { type: "string" }
    },
    required: ["url"],
    run: (client, accountId, _positionals, values) => client.intakeProspect(accountId, compactObjectPreservingFields({
      url: values.url,
      list_id: values.list,
      motion_id: values.motion,
      new_list_name: values["new-list"],
      new_transition_name: values["new-transition"],
      assigned_to_account_user_id: values.assign,
      custom_signal_id: values.signal
    }, ["new_list_name", "new_transition_name"])),
    done: () => "Prospect intake queued."
  }],
  ["events retry", {
    usage: "audienti events retry <event_id>",
    purpose: "Retry one failed event, with the same eligibility rules as the web retry button.",
    api: "POST /api/v1/accounts/:account_id/events/:id/retry.json",
    run: (client, accountId, [id]) => client.retryEvent(accountId, id),
    done: ([id], payload) => `Retried event ${id} as ${display(payload?.event?.id)}.`
  }],
  ["profiles delete", {
    usage: "audienti profiles delete <profile_id>",
    purpose: "Remove one profile from its prospect. Backend admins only, like the web action.",
    api: "DELETE /api/v1/accounts/:account_id/profiles/:id.json",
    run: (client, accountId, [id]) => client.deleteProfile(accountId, id),
    done: ([id]) => `Removed profile ${id}.`
  }],
  ["companies stop-pursuing", {
    usage: "audienti companies stop-pursuing <company_profile_id>",
    purpose: "Stop pursuing one company, like Stop pursuing on the company page.",
    api: "POST /api/v1/accounts/:account_id/companies/:id/stop_pursuing.json",
    run: (client, accountId, [id]) => client.stopPursuingCompany(accountId, id),
    done: ([id]) => `Stopped pursuing company ${id}.`
  }],
  ["content defer", {
    usage: "audienti content defer <work_item_id> --for <1_day|1_week|1_month|3_months|6_months>",
    purpose: "Defer one content work item.",
    api: "POST /api/v1/accounts/:account_id/content_ops/work_items/:id/defer.json",
    options: { for: { type: "string" } },
    required: ["for"],
    run: (client, accountId, [id], values) => client.contentDefer(accountId, id, { delay_duration: values.for }),
    done: ([id]) => `Deferred work item ${id}.`
  }],
  ["inbox-ops update-filters", {
    usage: "audienti inbox-ops update-filters [--subscriptions <true|false>] [--automated-no-reply <true|false>] [--provider-promotions <true|false>] [--sender-allow <email>]... [--sender-filter <email>]... [--domain-allow <domain>]... [--domain-filter <domain>]...",
    minPositionals: 0,
    maxPositionals: 0,
    purpose: "Save the owner's Inbox Ops email filters. Rule flags replace the saved list for that rule.",
    api: "PATCH /api/v1/accounts/:account_id/inbox_ops/filters.json",
    options: {
      subscriptions: { type: "string" },
      "automated-no-reply": { type: "string" },
      "provider-promotions": { type: "string" },
      "sender-allow": { type: "string", multiple: true },
      "sender-filter": { type: "string", multiple: true },
      "domain-allow": { type: "string", multiple: true },
      "domain-filter": { type: "string", multiple: true }
    },
    run: (client, accountId, _positionals, values) => client.updateInboxOpsFilters(accountId, compactObject({
      subscriptions: values.subscriptions,
      automated_no_reply: values["automated-no-reply"],
      provider_promotions: values["provider-promotions"],
      sender_allow_rules: values["sender-allow"],
      sender_filter_rules: values["sender-filter"],
      domain_allow_rules: values["domain-allow"],
      domain_filter_rules: values["domain-filter"]
    })),
    done: () => "Saved Inbox Ops filters."
  }],
  ["inbox-ops reply", {
    usage: "audienti inbox-ops reply <row_id> --message <text> [--subject <text>]",
    purpose: "Queue a reply to one Inbox Ops row. Each run sends a new reply token.",
    api: "POST /api/v1/accounts/:account_id/inbox_ops/:row_id/reply.json",
    options: { message: { type: "string" }, subject: { type: "string" } },
    required: ["message"],
    run: (client, accountId, [rowId], values) => client.inboxOpsReply(accountId, rowId, compactObject({
      message: values.message,
      subject: values.subject,
      reply_token: randomUUID()
    })),
    done: ([rowId], payload) => `Reply ${display(payload?.status)} for ${rowId}.`
  }],
  ["inbox-ops draft-reply", {
    usage: "audienti inbox-ops draft-reply <row_id>",
    purpose: "Draft a reply for one Inbox Ops row without sending it.",
    api: "POST /api/v1/accounts/:account_id/inbox_ops/:row_id/reply/write.json",
    run: (client, accountId, [rowId]) => client.inboxOpsWriteReply(accountId, rowId),
    done: (_positionals, payload) => display(payload?.message ?? payload?.body)
  }],
  ["inbox-ops adopt", {
    usage: "audienti inbox-ops adopt <row_id> [--target-account <acct_id>] [--motion <motion_id>]",
    purpose: "Adopt the prospect behind one Inbox Ops row.",
    api: "POST /api/v1/accounts/:account_id/inbox_ops/:row_id/adopt.json",
    options: { "target-account": { type: "string" }, motion: { type: "string" } },
    run: (client, accountId, [rowId], values) => client.inboxOpsAdopt(accountId, rowId, compactObject({
      target_account_id: values["target-account"],
      motion_id: values.motion
    })),
    done: ([rowId]) => `Adopted ${rowId}.`
  }],
  ["network-ops adopt", {
    usage: "audienti network-ops adopt <row_id> --target-account <acct_id> --motion <motion_id>",
    purpose: "Accept one inbound connection request and adopt the person into a motion in an account owned by the request's LinkedIn account owner.",
    api: "POST /api/v1/accounts/:account_id/network_ops/:row_id/adopt.json",
    options: { "target-account": { type: "string" }, motion: { type: "string" } },
    required: ["target-account", "motion"],
    run: (client, accountId, [rowId], values) => client.networkOpsAction(accountId, rowId, "adopt", {
      target_account_id: values["target-account"],
      motion_id: values.motion
    }),
    done: ([rowId]) => `Adopted ${rowId}.`
  }],
  ["network-ops ignore", {
    usage: "audienti network-ops ignore <row_id>",
    purpose: "Ignore one inbound connection request without accepting or declining it.",
    api: "POST /api/v1/accounts/:account_id/network_ops/:row_id/ignore.json",
    run: (client, accountId, [rowId]) => client.networkOpsAction(accountId, rowId, "ignore"),
    done: ([rowId]) => `Ignored ${rowId}.`
  }],
  ["reconciliations add-to-motion", {
    usage: "audienti reconciliations add-to-motion <source_key> --motion <motion_id>",
    purpose: "Add one reconciliation candidate to a motion.",
    api: "POST /api/v1/accounts/:account_id/reconciliations/:id/add_to_motion.json",
    options: { motion: { type: "string" } },
    required: ["motion"],
    run: (client, accountId, [key], values) => client.reconciliationAddToMotion(accountId, key, { motion_id: values.motion }),
    done: ([key]) => `Added ${key} to the motion.`
  }],
  ["reconciliations ignore", {
    usage: "audienti reconciliations ignore <source_key>",
    purpose: "Ignore one reconciliation candidate.",
    api: "POST /api/v1/accounts/:account_id/reconciliations/:id/ignore.json",
    run: (client, accountId, [key]) => client.reconciliationIgnore(accountId, key),
    done: ([key]) => `Ignored ${key}.`
  }],
  // Motion list bulk actions, strategy retirement, launch checks and premise (#2301).
  ["motions bulk-add-tag", {
    usage: "audienti motions bulk-add-tag <motn_id> [<motn_id> ...] --tag <tag>",
    minPositionals: 1,
    maxPositionals: Infinity,
    purpose: "Add one tag to several motions, like Add tag on the motion list. Any motion outside the account fails the whole request.",
    api: "POST /api/v1/accounts/:account_id/motions/bulk_add_tag.json",
    options: { tag: { type: "string" } },
    required: ["tag"],
    run: (client, accountId, ids, values) => client.bulkAddMotionTag(accountId, { motion_ids: ids, tag: values.tag }),
    done: (_positionals, payload) => `Tagged ${payload?.length ?? 0} motions.`
  }],
  ["motions bulk-remove-tag", {
    usage: "audienti motions bulk-remove-tag <motn_id> [<motn_id> ...] --tag <tag>",
    minPositionals: 1,
    maxPositionals: Infinity,
    purpose: "Remove one tag from several motions, like Remove tag on the motion list.",
    api: "POST /api/v1/accounts/:account_id/motions/bulk_remove_tag.json",
    options: { tag: { type: "string" } },
    required: ["tag"],
    run: (client, accountId, ids, values) => client.bulkRemoveMotionTag(accountId, { motion_ids: ids, tag: values.tag }),
    done: (_positionals, payload) => `Removed the tag from ${payload?.length ?? 0} motions.`
  }],
  ["motions bulk-update-principal", {
    usage: "audienti motions bulk-update-principal <motn_id> [<motn_id> ...] --principal <account_user_id>",
    minPositionals: 1,
    maxPositionals: Infinity,
    purpose: "Give several motions the same owner, like Change owner on the motion list. The owner must be a user in this account.",
    api: "POST /api/v1/accounts/:account_id/motions/bulk_update_principal.json",
    options: { principal: { type: "string" } },
    required: ["principal"],
    run: (client, accountId, ids, values) => client.bulkUpdateMotionPrincipal(accountId, { motion_ids: ids, principal_account_user_id: values.principal }),
    done: (_positionals, payload) => `Assigned ${payload?.length ?? 0} motions.`
  }],
  ["motions bulk-update-status", {
    usage: "audienti motions bulk-update-status <motn_id> [<motn_id> ...] --status <preparing|active|closing|paused|archived>",
    minPositionals: 1,
    maxPositionals: Infinity,
    purpose: "Change the status of several motions with the same lifecycle rules as the motion list. Motions the rules block keep their status and are listed with the reason.",
    api: "POST /api/v1/accounts/:account_id/motions/bulk_update_status.json",
    options: { status: { type: "string" } },
    required: ["status"],
    run: (client, accountId, ids, values) => client.bulkUpdateMotionStatus(accountId, { motion_ids: ids, status: values.status }),
    done: (_positionals, payload) => [
      `Set ${payload?.applied_count ?? 0} motions to ${display(payload?.status)}; ${payload?.blocked_count ?? 0} blocked.`,
      ...(payload?.blocked || []).map((row) => `  ${row.motion_id}: ${display(row.reason)}`)
    ].join("\n")
  }],
  ["motions retire-strategy", {
    usage: "audienti motions retire-strategy <motn_id> --strategy <strategy_id>",
    purpose: "Retire one strategy of an inbound motion. Retirement is permanent; the slot refills from the backlog on the next planning pass.",
    api: "POST /api/v1/accounts/:account_id/motions/:id/strategies/:motion_search_scope_id/retire.json",
    options: { strategy: { type: "string" } },
    required: ["strategy"],
    run: (client, accountId, [id], values) => client.retireMotionStrategy(accountId, id, values.strategy),
    done: (_positionals, payload) => (payload?.already_retired
      ? `Strategy ${display(payload?.strategy?.id)} is already retired.`
      : `Retired strategy ${display(payload?.strategy?.id)}.`)
  }],
  ["motions refresh-launch-check", {
    usage: "audienti motions refresh-launch-check <motn_id>",
    purpose: "Recheck whether one motion can launch discovery, without starting discovery.",
    api: "POST /api/v1/accounts/:account_id/motions/:id/refresh_launch_check.json",
    run: (client, accountId, [id]) => client.refreshMotionLaunchCheck(accountId, id),
    done: (_positionals, payload) => `${display(payload?.name)}: demand ${display(payload?.demand_status)}, producer ${display(payload?.producer_status)}, reason ${display(payload?.reason)}.`
  }],
  ["motions refresh-launch-checks", {
    usage: "audienti motions refresh-launch-checks",
    minPositionals: 0,
    maxPositionals: 0,
    purpose: "Recheck launch readiness for every motion in the account, without starting discovery.",
    api: "POST /api/v1/accounts/:account_id/motions/refresh_launch_checks.json",
    run: (client, accountId) => client.refreshMotionLaunchChecks(accountId),
    done: (_positionals, payload) => `Launch checks refreshed: ${display(payload?.summary)}.`
  }],
  ["motions update-premise", {
    usage: "audienti motions update-premise <motn_id> --premise <text>",
    purpose: "Save a motion's premise and rebuild its ICP targeting from it, like Update premise in the Operator.",
    api: "PATCH /api/v1/accounts/:account_id/motions/:id/update_premise.json",
    options: { premise: { type: "string" } },
    required: ["premise"],
    run: (client, accountId, [id], values) => client.updateMotionPremise(accountId, id, { motion: { premise: values.premise } }),
    done: ([id]) => `Updated the premise for ${id}.`
  }],
  // Social account page (#2306). Passwords, OTP codes, cookies, TOTP secrets
  // and the messaging PIN are never argv flags: they come from stdin, an
  // environment variable, or a no-echo terminal prompt, and are never printed.
  ["social-cookies show", {
    usage: "audienti social-cookies show <scok_id>",
    purpose: "Show one social account's connection state and facts, like its Overview. Never shows credentials.",
    api: "GET /api/v1/accounts/:account_id/social_cookies/:id.json",
    run: (client, accountId, [id]) => client.socialCookie(accountId, id),
    done: (_positionals, payload) => describeSocialCookie(payload?.social_cookie)
  }],
  ["social-cookies pause", {
    usage: "audienti social-cookies pause <scok_id>",
    purpose: "Pause one social account so no activity runs until it is resumed.",
    api: "POST /api/v1/accounts/:account_id/social_cookies/:id/pause.json",
    run: (client, accountId, [id]) => client.pauseSocialCookie(accountId, id),
    done: (_positionals, payload) => display(payload?.message)
  }],
  ["social-cookies resume", {
    usage: "audienti social-cookies resume <scok_id>",
    purpose: "Resume a paused social account; it reconnects before activity restarts.",
    api: "POST /api/v1/accounts/:account_id/social_cookies/:id/resume.json",
    run: (client, accountId, [id]) => client.resumeSocialCookie(accountId, id),
    done: (_positionals, payload) => display(payload?.message)
  }],
  ["social-cookies resume-autopilot", {
    usage: "audienti social-cookies resume-autopilot <scok_id>",
    purpose: "Clear an automatic autopilot pause on one social account.",
    api: "POST /api/v1/accounts/:account_id/social_cookies/:id/resume_autopilot.json",
    run: (client, accountId, [id]) => client.resumeSocialCookieAutopilot(accountId, id),
    done: (_positionals, payload) => display(payload?.message)
  }],
  ["social-cookies recheck-account-type", {
    usage: "audienti social-cookies recheck-account-type <scok_id>",
    purpose: "Queue a LinkedIn account-type check (Premium, Sales Navigator) for one connected account.",
    api: "POST /api/v1/accounts/:account_id/social_cookies/:id/recheck_account_type.json",
    run: (client, accountId, [id]) => client.recheckSocialCookieAccountType(accountId, id),
    done: (_positionals, payload) => display(payload?.message)
  }],
  ["social-cookies reconnect", {
    usage: "audienti social-cookies reconnect <scok_id>",
    purpose: "Ask one social account to reconnect; a mailbox rechecks its connection.",
    api: "POST /api/v1/accounts/:account_id/social_cookies/:id/reconnect.json",
    run: (client, accountId, [id]) => client.reconnectSocialCookie(accountId, id),
    done: (_positionals, payload) => display(payload?.message)
  }],
  ["social-cookies delete", {
    usage: "audienti social-cookies delete <scok_id>",
    purpose: "Delete one social account you own.",
    api: "DELETE /api/v1/accounts/:account_id/social_cookies/:id.json",
    run: (client, accountId, [id]) => client.deleteSocialCookie(accountId, id),
    done: (_positionals, payload) => display(payload?.message)
  }],
  ["social-cookies submit-otp", {
    usage: "audienti social-cookies submit-otp <scok_id> [--otp-stdin | --otp-env]",
    purpose: "Send the one-time login code a social account is waiting for. Reads the code from stdin (--otp-stdin), AUDIENTI_OTP_CODE (--otp-env), or a hidden prompt.",
    api: "POST /api/v1/accounts/:account_id/social_cookies/:id/submit_otp.json",
    secretInput: true,
    options: { "otp-stdin": { type: "boolean" }, "otp-env": { type: "boolean" } },
    parse: async (values, usageLine, context) => ({ ...values, otpCode: await readSocialOtp(values, usageLine, context) }),
    run: (client, accountId, [id], values) => client.submitSocialCookieOtp(accountId, id, { otp_code: values.otpCode }),
    done: (_positionals, payload) => display(payload?.message)
  }],
  ["social-cookies create", {
    usage: "audienti social-cookies create --service <linkedin|gmail|...> --username <name> [--name <label>] [--email <email>] [--attributes <json>] [--password-stdin | --secrets-stdin | --password-env | --prompt-password]",
    minPositionals: 0,
    maxPositionals: 0,
    purpose: "Add a social account and queue its login, like Add account on the web. Secrets come from stdin, AUDIENTI_SOCIAL_PASSWORD, or a hidden prompt; never from flags.",
    api: "POST /api/v1/accounts/:account_id/social_cookies.json",
    secretInput: true,
    options: { service: { type: "string" }, username: { type: "string" }, ...SOCIAL_COOKIE_FIELD_OPTIONS },
    required: ["service"],
    parse: async (values, usageLine, context) => ({
      ...values,
      body: { social_cookie: await socialCookieBody(values, usageLine, context, { service_identifier: values.service, username: values.username }) }
    }),
    run: (client, accountId, _positionals, values) => client.createSocialCookie(accountId, values.body),
    done: (_positionals, payload) => `Added social account ${display(payload?.social_cookie?.prefix_id)}; login is queued.`
  }],
  ["social-cookies update", {
    usage: "audienti social-cookies update <scok_id> [--username <name>] [--name <label>] [--email <email>] [--attributes <json>] [--password-stdin | --secrets-stdin | --password-env | --prompt-password]",
    purpose: "Edit one social account's details, controls and limits, like its edit page. A stored password is kept unless a new one is sent.",
    api: "PATCH /api/v1/accounts/:account_id/social_cookies/:id.json",
    secretInput: true,
    options: { username: { type: "string" }, ...SOCIAL_COOKIE_FIELD_OPTIONS },
    parse: async (values, usageLine, context) => ({
      ...values,
      body: { social_cookie: await socialCookieBody(values, usageLine, context, { username: values.username }) }
    }),
    run: (client, accountId, [id], values) => client.updateSocialCookie(accountId, id, values.body),
    done: ([id]) => `Updated social account ${id}.`
  }],
  ["social-cookies rights", {
    usage: "audienti social-cookies rights <scok_id> (--workspace <acct_id> (--grant | --revoke) | --workspaces <acct_id,acct_id>)",
    purpose: "Choose which of your workspaces may use one social account, like its Access tab.",
    api: "PATCH /api/v1/accounts/:account_id/social_cookies/:id/rights.json",
    options: { workspace: { type: "string" }, workspaces: { type: "string" }, grant: { type: "boolean" }, revoke: { type: "boolean" } },
    parse: (values, usageLine) => ({ ...values, body: socialCookieRightsBody(values, usageLine) }),
    run: (client, accountId, [id], values) => client.updateSocialCookieRights(accountId, id, values.body),
    done: (_positionals, payload) => `Workspaces: ${(payload?.accounts || []).map((account) => `${display(account?.name)} (${display(account?.prefix_id)})`).join(", ") || "none"}.`
  }],
  ["social-cookies settings", {
    usage: "audienti social-cookies settings <scok_id> --scope <scope> [--enabled <true|false>] [--key <key>] [--target <n>] [--daily <n>] [--hourly <n>] [--action-type <type>] [--mode <mode>] [--level <level>] [--body <json>] [--password-stdin | --password-env | --prompt-password]",
    purpose: "Change one Overview setting (scopes: sending, gate, action, visibility_mode, operator, limits, limits_preset, hours, advanced, automation, details, location, servers). Only details and servers accept a password, from stdin, AUDIENTI_SOCIAL_PASSWORD, or a hidden prompt.",
    api: "PATCH /api/v1/accounts/:account_id/social_cookies/:id/settings.json",
    secretInput: true,
    options: {
      scope: { type: "string" },
      enabled: { type: "string" },
      key: { type: "string" },
      target: { type: "string" },
      daily: { type: "string" },
      hourly: { type: "string" },
      "action-type": { type: "string" },
      mode: { type: "string" },
      level: { type: "string" },
      body: { type: "string" },
      "password-stdin": { type: "boolean" },
      "password-env": { type: "boolean" },
      "prompt-password": { type: "boolean" }
    },
    required: ["scope"],
    parse: async (values, usageLine, context) => ({ ...values, body: await socialCookieSettingsBody(values, usageLine, context) }),
    run: (client, accountId, [id], values) => client.updateSocialCookieSettings(accountId, id, values.body),
    done: ([id], payload) => `Saved ${display(payload?.scope)} for social account ${id}.`
  }]
]);

for (const [topic, spec] of PARITY_ACTION_COMMANDS) {
  if (HELP_TOPICS.has(topic)) throw new Error(`duplicate help topic ${topic}`);
  HELP_TOPICS.set(topic, [
    "Usage:",
    `  ${spec.usage} ${ACCOUNT_OPTION_USAGE}`,
    "",
    "Status: implemented",
    "",
    "Purpose:",
    `  ${spec.purpose}`,
    "",
    "API:",
    `  ${spec.api}`
  ].join("\n"));
}

// List the single-purpose actions under their group help (`audienti help prospects`).
const parityActionUsagesByGroup = new Map();
for (const [topic, spec] of PARITY_ACTION_COMMANDS) {
  const group = topic.split(" ")[0];
  if (!parityActionUsagesByGroup.has(group)) parityActionUsagesByGroup.set(group, []);
  parityActionUsagesByGroup.get(group).push(`  ${spec.usage} ${ACCOUNT_OPTION_USAGE}`);
}
for (const [group, usages] of parityActionUsagesByGroup) {
  const section = ["Actions:", ...usages].join("\n");
  const existing = HELP_TOPICS.get(group);
  HELP_TOPICS.set(group, existing ? `${existing}\n\n${section}` : section);
}

for (const [topic, text] of HELP_TOPICS) {
  if (topic === "motions" || topic.startsWith("motions ")) {
    HELP_TOPICS.set(topic, `${text}\n\nStrategy:\n  Read audienti help methodology before creating, changing or judging an experiment.\n  ${MOTION_ALIASES.join(", ")} are aliases for motions.`);
  }
}
HELP_TOPICS.set("tools", `${HELP_TOPICS.get("tools")}\n\nAgent research (no app or login):\n  audienti tools gift-research --url <website> [--json]`);

function parseJsonObjectOption(raw, flag) {
  if (raw === undefined) return undefined;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CommandError(`${flag} must be a JSON object, for example '{"selected_action":{"key":"send_email"}}'.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CommandError(`${flag} must be a JSON object, for example '{"selected_action":{"key":"send_email"}}'.`);
  }
  return parsed;
}

async function runParityActionCommand(topic, args, context, { accountOverride } = {}) {
  const spec = PARITY_ACTION_COMMANDS.get(topic);
  const usageLine = `Usage: ${spec.usage} ${ACCOUNT_OPTION_USAGE}`;
  if (spec.secretInput) rejectSecretArgs(args);
  const { values, positionals } = parseCommandArgs(args, { ...jsonOptions(), ...(spec.options || {}) });
  const minPositionals = spec.minPositionals ?? 1;
  const maxPositionals = spec.maxPositionals ?? 1;
  if (positionals.length < minPositionals || positionals.length > maxPositionals) throw new CommandError(usageLine);
  if ((spec.required || []).some((key) => !values[key])) throw new CommandError(usageLine);

  const parsedValues = spec.parse ? await spec.parse(values, usageLine, context) : values;

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await spec.run(client, accountId, positionals, parsedValues);
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, spec.done(positionals, payload));
}

// ---------------------------------------------------------------------------
// Standalone account tools and saved network (#2554). Thin client of the
// tools/runs and social_cookies/:id/network APIs: submit returns a run id
// immediately; --wait polls the run, then prints its results.
// ---------------------------------------------------------------------------

const TOOL_RUN_WAIT_OPTIONS = {
  "request-key": { type: "string" },
  wait: { type: "boolean" },
  "timeout-seconds": { type: "string" },
  "poll-interval-seconds": { type: "string" }
};
const DEFAULT_TOOL_RUN_TIMEOUT_SECONDS = 300;
const DEFAULT_TOOL_RUN_POLL_INTERVAL_SECONDS = 2;
const TOOL_RUN_FINISHED_STATUSES = ["completed", "failed"];

async function toolsEmailFind(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    ...TOOL_RUN_WAIT_OPTIONS,
    "first-name": { type: "string" },
    "last-name": { type: "string" },
    "company-domain": { type: "string" },
    "linkedin-url": { type: "string" },
    file: { type: "string" }
  });
  if (positionals.length > 0) throw new CommandError(TOOLS_EMAIL_FIND_USAGE);

  const single = compactObject({
    first_name: values["first-name"],
    last_name: values["last-name"],
    company_domain: values["company-domain"],
    linkedin_url: values["linkedin-url"]
  });
  const items = values.file
    ? await readToolItemsFile(values.file, ["client_item_id", "first_name", "last_name", "company_domain", "linkedin_url"])
    : [single];
  if (values.file && Object.keys(single).length > 0) throw new CommandError("Use either --file or the single-lookup flags, not both.");
  if (!values.file && !single.linkedin_url && !(single.first_name && single.last_name && single.company_domain)) {
    throw new CommandError(TOOLS_EMAIL_FIND_USAGE);
  }

  return submitToolRun("email_find", { items }, values, context, { accountOverride });
}

async function toolsLinkedinEnrich(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    ...TOOL_RUN_WAIT_OPTIONS,
    url: { type: "string" },
    kind: { type: "string" },
    file: { type: "string" }
  });
  if (positionals.length > 0 || (!values.url && !values.file) || (values.url && values.file)) {
    throw new CommandError(TOOLS_LINKEDIN_ENRICH_USAGE);
  }
  if (values.kind && !["person", "company"].includes(values.kind)) throw new CommandError("--kind must be person or company.");

  const items = values.file
    ? await readToolItemsFile(values.file, ["client_item_id", "linkedin_url", "kind"], { aliases: { url: "linkedin_url" } })
    : [compactObject({ linkedin_url: values.url, kind: values.kind })];
  return submitToolRun("linkedin_enrich", { items }, values, context, { accountOverride });
}

async function toolsSignalsFind(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    ...TOOL_RUN_WAIT_OPTIONS,
    icp: { type: "string" },
    question: { type: "string" },
    count: { type: "string" },
    "date-window-days": { type: "string" }
  });
  if (positionals.length > 0 || !values.icp || !values.question) throw new CommandError(TOOLS_SIGNALS_FIND_USAGE);

  const input = compactObject({
    icp_description: values.icp,
    question: values.question,
    count: normalizeOptionalPositiveInteger(values.count, "--count"),
    date_window_days: normalizeOptionalPositiveInteger(values["date-window-days"], "--date-window-days")
  });
  return submitToolRun("signals_find", input, values, context, { accountOverride });
}

async function toolsWrite(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    ...TOOL_RUN_WAIT_OPTIONS,
    purpose: { type: "string" },
    audience: { type: "string" },
    fact: { type: "string", multiple: true },
    channel: { type: "string" },
    tone: { type: "string" },
    subject: { type: "boolean" },
    "no-subject": { type: "boolean" },
    prospect: { type: "string" }
  });
  const facts = (values.fact || []).map((fact) => fact.trim()).filter(Boolean);
  if (positionals.length > 0 || !values.purpose || !values.audience || !values.channel || facts.length === 0) {
    throw new CommandError(TOOLS_WRITE_USAGE);
  }
  if (values.subject && values["no-subject"]) throw new CommandError("Choose either --subject or --no-subject.");

  const input = compactObject({
    purpose: values.purpose,
    audience: values.audience,
    facts,
    channel: values.channel,
    tone: values.tone,
    prospect_id: values.prospect,
    subject: values.subject ? true : (values["no-subject"] ? false : undefined)
  });
  return submitToolRun("write", input, values, context, { accountOverride });
}

async function submitToolRun(tool, input, values, context, { accountOverride } = {}) {
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const run = await client.createToolRun(accountId, compactObject({ tool, input, request_key: values["request-key"] }));
  if (!values.wait) {
    if (values.json) return writeJson(context.stdout, run);

    writeLine(context.stdout, `${run?.replayed ? "Existing" : "Queued"} run ${display(run?.id)} (${tool}, ${display(run?.item_count, 0)} item(s)).`);
    writeLine(context.stdout, `Check it with: audienti tools runs show ${display(run?.id)}`);
    return 0;
  }

  return finishWaitedRun(client, accountId, run, values, context);
}

async function finishWaitedRun(client, accountId, run, values, context) {
  const finished = await waitForToolRun(client, accountId, run, {
    timeoutSeconds: normalizeOptionalPositiveInteger(values["timeout-seconds"], "--timeout-seconds") || DEFAULT_TOOL_RUN_TIMEOUT_SECONDS,
    pollIntervalSeconds: normalizeOptionalPositiveInteger(values["poll-interval-seconds"], "--poll-interval-seconds") || DEFAULT_TOOL_RUN_POLL_INTERVAL_SECONDS,
    sleepImpl: context.sleep
  });
  const items = await fetchAllToolRunItems(client, accountId, finished.id);
  if (values.json) {
    writeJson(context.stdout, { run: finished, items });
  } else {
    renderToolRun(finished, context);
    renderToolRunItems(finished.tool, items, context);
  }
  return finished.status === "failed" ? 1 : 0;
}

async function waitForToolRun(client, accountId, run, { timeoutSeconds, pollIntervalSeconds, sleepImpl = sleep }) {
  if (!run?.id) throw new CommandError("The tool run response did not include a run id.");
  if (TOOL_RUN_FINISHED_STATUSES.includes(run.status)) return run;

  const timeoutAt = Date.now() + (timeoutSeconds * 1000);
  let latest = run;
  while (Date.now() < timeoutAt) {
    await sleepImpl(pollIntervalSeconds * 1000);
    latest = await client.toolRun(accountId, run.id);
    if (TOOL_RUN_FINISHED_STATUSES.includes(latest?.status)) return latest;
  }

  throw new CommandError(`Timed out after ${timeoutSeconds} seconds waiting for run ${run.id}. It keeps running; check it with: audienti tools runs show ${run.id}`);
}

async function fetchAllToolRunItems(client, accountId, runId) {
  const items = [];
  let cursor;
  for (let page = 0; page < 100; page += 1) {
    const payload = await client.toolRunResults(accountId, runId, compactObject({ limit: 200, cursor }));
    items.push(...(Array.isArray(payload?.items) ? payload.items : []));
    cursor = payload?.next_cursor;
    if (!cursor) break;
  }
  return items;
}

async function toolsRuns(args, context, { accountOverride } = {}) {
  const [subcommand, ...rest] = args;
  if (subcommand === "list") return toolsRunsList(rest, context, { accountOverride });
  if (subcommand === "show") return toolsRunsShow(rest, context, { accountOverride });
  if (subcommand === "results") return toolsRunsResults(rest, context, { accountOverride });
  if (subcommand === "export") return toolsRunsExport(rest, context, { accountOverride });

  throw new CommandError(TOOLS_RUNS_USAGE);
}

async function toolsRunsList(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    tool: { type: "string" },
    status: { type: "string" },
    limit: { type: "string" },
    cursor: { type: "string" }
  });
  if (positionals.length > 0) throw new CommandError(TOOLS_RUNS_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.toolRuns(accountId, compactObject({
    tool: values.tool ? values.tool.replaceAll("-", "_") : undefined,
    status: values.status,
    limit: normalizeOptionalPositiveInteger(values.limit, "--limit"),
    cursor: values.cursor
  }));
  if (values.json) return writeJson(context.stdout, payload);

  const runs = Array.isArray(payload?.runs) ? payload.runs : [];
  if (runs.length === 0) return writeLine(context.stdout, "No tool runs.");
  writeAlignedTable(context, ["ID", "TOOL", "STATUS", "ITEMS", "CREATED"],
    runs.map((run) => [run.id, run.tool, run.details_expired ? `${run.status} (details expired)` : run.status, run.item_count, run.created_at]));
  if (payload?.next_cursor) writeLine(context.stdout, `More runs: audienti tools runs list --cursor ${payload.next_cursor}`);
}

async function toolsRunsShow(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError(TOOLS_RUNS_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const run = await client.toolRun(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, run);

  renderToolRun(run, context);
  return run?.status === "failed" ? 1 : 0;
}

async function toolsRunsResults(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    limit: { type: "string" },
    cursor: { type: "string" }
  });
  if (positionals.length !== 1) throw new CommandError(TOOLS_RUNS_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.toolRunResults(accountId, positionals[0], compactObject({
    limit: normalizeOptionalPositiveInteger(values.limit, "--limit"),
    cursor: values.cursor
  }));
  if (values.json) return writeJson(context.stdout, payload);

  if (payload?.details_expired) return writeLine(context.stdout, "This run's details expired after 90 days; only its summary remains.");
  renderToolRunItems(payload?.run?.tool, Array.isArray(payload?.items) ? payload.items : [], context);
  if (payload?.next_cursor) writeLine(context.stdout, `More results: audienti tools runs results ${positionals[0]} --cursor ${payload.next_cursor}`);
}

async function toolsRunsExport(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    format: { type: "string" },
    output: { type: "string" }
  });
  if (positionals.length !== 1) throw new CommandError(TOOLS_RUNS_USAGE);
  const format = exportFormat(values.format);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.toolRunExport(accountId, positionals[0], format === "json" ? { export_format: "json" } : {});
  return writeExportPayload(payload, format, values.output, context);
}

async function networkCommand(action, args, context, { accountOverride } = {}) {
  if (!["list", "export"].includes(action)) throw new CommandError(NETWORK_USAGE);

  const { values, positionals } = parseCommandArgs(args, {
    ...(action === "list" ? jsonOptions() : {}),
    cookie: { type: "string" },
    platform: { type: "string" },
    kind: { type: "string" },
    direction: { type: "string" },
    query: { type: "string" },
    ...(action === "list" ? { limit: { type: "string" }, cursor: { type: "string" } } : { format: { type: "string" }, output: { type: "string" } })
  });
  if (positionals.length > 0 || !values.cookie) throw new CommandError(NETWORK_USAGE);

  const query = compactObject({
    platform: values.platform || "linkedin",
    kind: values.kind || "connection",
    direction: values.direction,
    network_query: values.query
  });
  const { client, accountId } = await requireAccountContext(context, { accountOverride });

  if (action === "export") {
    const format = exportFormat(values.format);
    const payload = await client.socialCookieNetworkExport(accountId, values.cookie, format === "json" ? { ...query, export_format: "json" } : query);
    return writeExportPayload(payload, format, values.output, context);
  }

  const payload = await client.socialCookieNetwork(accountId, values.cookie, compactObject({
    ...query,
    limit: normalizeOptionalPositiveInteger(values.limit, "--limit"),
    cursor: values.cursor
  }));
  if (values.json) return writeJson(context.stdout, payload);

  renderNetworkCoverage(payload?.coverage, context);
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  if (rows.length > 0) {
    writeAlignedTable(context, ["NAME", "USERNAME", "ID", "LAST SEEN"],
      rows.map((row) => [row.display_name, row.alias_key, row.stable_id, row.last_observed_at]));
  }
  if (payload?.next_cursor) writeLine(context.stdout, `More rows: audienti network list --cookie ${values.cookie} --cursor ${payload.next_cursor}`);
}

function renderNetworkCoverage(coverage, context) {
  if (!coverage) return;

  const state = {
    unsupported_capture: "capture not supported yet (not zero)",
    not_yet_observed: "not yet observed",
    partial: "partial (only what normal work has seen)",
    complete: "complete"
  }[coverage.state] || display(coverage.state);
  writeLine(context.stdout, `${display(coverage.platform)} ${display(coverage.kind)} ${display(coverage.direction)}: ${state}` +
    (coverage.last_observed_at ? `, last seen ${coverage.last_observed_at}` : ""));
}

function exportFormat(value) {
  const format = String(value || "csv").toLowerCase();
  if (!["csv", "json"].includes(format)) throw new CommandError("--format must be csv or json.");
  return format;
}

async function writeExportPayload(payload, format, outputPath, context) {
  const text = format === "json" ? `${JSON.stringify(payload, null, 2)}\n` : String(payload ?? "");
  if (outputPath) {
    await writeFile(outputPath, text);
    return writeLine(context.stderr, `Wrote ${Buffer.byteLength(text)} bytes to ${outputPath}`);
  }
  context.stdout.write(text);
}

function renderToolRun(run, context) {
  writeLine(context.stdout, `Run ${display(run?.id)} (${display(run?.tool)}): ${display(run?.status)}`);
  writeLine(context.stdout, `Items: ${display(run?.item_count, 0)} total, ${display(run?.completed_item_count, 0)} completed, ${display(run?.failed_item_count, 0)} failed`);
  const outcomes = run?.summary?.outcomes || {};
  if (Object.keys(outcomes).length > 0) {
    writeLine(context.stdout, `Outcomes: ${Object.entries(outcomes).map(([outcome, count]) => `${outcome} ${count}`).join(", ")}`);
  }
  if (run?.error_code) writeLine(context.stdout, `Error: ${run.error_code}`);
  if (run?.details_expired) writeLine(context.stdout, "Details expired after 90 days; only this summary remains.");
}

function renderToolRunItems(tool, items, context) {
  if (items.length === 0) return writeLine(context.stdout, "No results yet.");

  writeAlignedTable(context, ["#", "ITEM", "OUTCOME", "RESULT"],
    items.map((item) => [item.position, item.client_item_id, item.outcome || item.status, toolItemSummary(tool, item)]));
}

function toolItemSummary(tool, item) {
  const result = item?.result || {};
  if (item?.error_message && item.outcome !== "success") return item.error_message;
  if (tool === "email_find") return result.email || "";
  if (tool === "linkedin_enrich") return [result.display_name || result.name, result.headline || result.domain].filter(Boolean).join(" - ");
  if (tool === "signals_find") return (result.companies || []).map((company) => company.name).join(", ");
  if (tool === "write") return singleLine([result.subject, result.text].filter(Boolean).join(" | "));
  if (tool === "humanize") return singleLine(result.humanized_text);
  if (tool === "network_export") return `${display(result.exported_row_count, 0)} row(s)`;
  return Object.keys(result).length > 0 ? JSON.stringify(result) : "";
}

// Reads tool items from CSV (header row), JSONL, a JSON array or {items: [...]}.
async function readToolItemsFile(filePath, fields, { aliases = {} } = {}) {
  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    throw new CommandError(`Could not read items file ${filePath}: ${error.message}`);
  }
  const trimmed = String(contents || "").trim();
  if (!trimmed) throw new CommandError(`Items file ${filePath} is empty.`);

  let rows;
  let whole;
  try {
    whole = JSON.parse(trimmed);
  } catch {
    whole = undefined;
  }
  if (whole !== undefined) {
    rows = Array.isArray(whole) ? whole : (Array.isArray(whole?.items) ? whole.items : [whole]);
  } else {
    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines[0].startsWith("{") || lines[0].startsWith("[")) {
      rows = lines.map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new CommandError(`Invalid JSON or JSONL row ${index + 1} in ${filePath}: ${error.message}`);
        }
      });
    } else {
      // CSV: one row per line; quoted commas allowed, no line breaks inside fields.
      const headers = parseCsvLine(lines[0]).map((header) => header.trim());
      rows = lines.slice(1).map((line) => {
        const values = parseCsvLine(line);
        return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
      });
    }
  }

  return rows.map((row) => {
    const normalized = {};
    for (const [rawKey, value] of Object.entries(row || {})) {
      const key = rawKey.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
      const field = aliases[key] || key;
      if (fields.includes(field) && value !== undefined && value !== null) normalized[field] = String(value);
    }
    return compactObject(normalized);
  });
}

const TOOL_RUN_HELP_FOOTER = [
  "",
  "Behavior:",
  "  Returns a run id immediately; the work runs on the server. Nothing is sent and no prospects are created.",
  "  --wait polls `audienti tools runs show` until the run finishes, then prints its results.",
  "  If the CLI exits early, read the run later with `audienti tools runs show|results <trun_id>`.",
  "  --request-key makes a retry safe: the same key and input return the same run.",
  "",
  "Files (--file):",
  "  JSON (an array or {\"items\": [...]}, any formatting), JSONL (one object per line) or CSV with a header row.",
  "  CSV is one row per line; quoted commas are allowed, line breaks inside fields are not.",
  "",
  "Exit codes:",
  "  1 on an API error, a --wait timeout or an aborted (failed) run; otherwise 0.",
  "  Per-item outcomes such as no_match or invalid_input do not change the exit code; read them in the results.",
  "",
  "API:",
  "  POST /api/v1/accounts/:account_id/tools/runs.json",
  "  GET  /api/v1/accounts/:account_id/tools/runs/:id.json",
  "  GET  /api/v1/accounts/:account_id/tools/runs/:id/results.json"
];

for (const [topic, usage, purpose] of [
  ["tools email-find", TOOLS_EMAIL_FIND_USAGE, "Finds work emails from a name and company domain, or from a LinkedIn URL. Prefer this over `tools get email` when you do not want a prospect created."],
  ["tools linkedin-enrich", TOOLS_LINKEDIN_ENRICH_USAGE, "Reads public LinkedIn person or company details through API providers. Never uses your connected LinkedIn account."],
  ["tools signals-find", TOOLS_SIGNALS_FIND_USAGE, "Finds companies that match an ICP description and a signal question, each with a source link. Returns fewer companies, or no match, when proof is weak."],
  ["tools write", TOOLS_WRITE_USAGE, "Writes one draft from your brief using only the facts you give. --prospect adds the existing prospect's name, title and company as read-only context."]
]) {
  HELP_TOPICS.set(topic, ["Usage:", `  ${usage.slice("Usage: ".length)}`, "", "Status: implemented", "", "Purpose:", `  ${purpose}`, ...TOOL_RUN_HELP_FOOTER].join("\n"));
}

HELP_TOPICS.set("tools runs", [
  "Usage:",
  `  ${TOOLS_RUNS_USAGE.slice("Usage: ".length)}`,
  "",
  "Status: implemented",
  "",
  "Purpose:",
  "  Lists tool runs and reads one run's status, per-item results and export. Details expire after 90 days; the summary remains.",
  "  Saved-network runs show their results only to the connected account's owner.",
  "",
  "API:",
  "  GET /api/v1/accounts/:account_id/tools/runs.json",
  "  GET /api/v1/accounts/:account_id/tools/runs/:id.json",
  "  GET /api/v1/accounts/:account_id/tools/runs/:id/results.json",
  "  GET /api/v1/accounts/:account_id/tools/runs/:id/export.json"
].join("\n"));

HELP_TOPICS.set("network", [
  "Usage:",
  `  ${NETWORK_USAGE.slice("Usage: ".length)}`,
  "",
  "Status: implemented",
  "",
  "Purpose:",
  "  Lists, searches or exports the saved connections, followers and following of one connected account.",
  "  Only that account's owner can read it. It shows what normal work has already seen; it never visits LinkedIn or X.",
  "  Coverage says partial, not yet observed, or capture not supported yet; none of these mean zero.",
  "",
  "Defaults:",
  "  --platform linkedin  --kind connection  (follows need --direction incoming|outgoing)",
  "",
  "API:",
  "  GET /api/v1/accounts/:account_id/social_cookies/:social_cookie_id/network.json",
  "  GET /api/v1/accounts/:account_id/social_cookies/:social_cookie_id/network/export.json"
].join("\n"));
