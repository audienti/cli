import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { ApiError, AudientiClient, DEFAULT_HOST, normalizeHost } from "./api-client.js";
import { configPath, deleteConfig, maskToken, readConfig, writeConfig } from "./config.js";

class CommandError extends Error {
  constructor(message, { exitCode = 1 } = {}) {
    super(message);
    this.name = "CommandError";
    this.exitCode = exitCode;
  }
}

const MAX_ALL_PROSPECTS = 1000;
const DEFAULT_LIST_LIMIT = 20;
const API_MAX_LIST_LIMIT = 100;
const DEFAULT_LOOKUP_TIMEOUT_SECONDS = 60;
const DEFAULT_LOOKUP_POLL_INTERVAL_SECONDS = 2;
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
const MOTION_STATUS_VALUES = new Set(["draft", "preparing", "active", "paused", "archived"]);
const PROSPECT_INACTIVE_REASON_VALUES = new Set(["nurture", "non_responsive", "not_fit", "bad_data_404"]);
const PROSPECT_STATUS_VALUES = new Set(["active", ...PROSPECT_INACTIVE_REASON_VALUES, "rejected"]);
const PROSPECTS_ADD_NOTE_USAGE = "Usage: audienti prospects add-note <prsp_id> (--message <text> [--type <note|steer|voicemail_outreach|video_outreach>] [--engagement-type <key>] | --payload <file.json>) [--json] [--account <acct_id>]";
const PROSPECTS_ADD_STEER_USAGE = "Usage: audienti prospects add-steer <prsp_id> (--message <text> [--engagement-type <key>] | --payload <file.json>) [--json] [--account <acct_id>]";
const PROSPECTS_ADD_PROFILE_USAGE = "Usage: audienti prospects add-profile <prsp_id> --url <profile_url|email|phone> [--json] [--account <acct_id>]";
const PROSPECTS_REPORT_BAD_PROFILE_USAGE = "Usage: audienti prospects report-bad-profile <prsp_id> <prof_id|citation_id> [--json] [--account <acct_id>]";
const PROSPECTS_ASSIGN_USAGE = "Usage: audienti prospects assign <prsp_id> [prsp_id...] --assigned-user <id|me|unassign> [--json] [--account <acct_id>]";
const PROSPECTS_SET_STATUS_USAGE = "Usage: audienti prospects set-status <prsp_id> --status <active|nurture|non_responsive|not_fit|bad_data_404|rejected> [--json] [--account <acct_id>]";
const PROSPECTS_REPLAN_USAGE = "Usage: audienti prospects replan <prsp_id> [--apply] [--json] [--account <acct_id>]";
const PROSPECTS_REJECT_USAGE = "Usage: audienti prospects reject <prsp_id> [--json] [--account <acct_id>]";
const PROSPECTS_NURTURE_USAGE = "Usage: audienti prospects nurture <prsp_id> [--reason <nurture|non_responsive|not_fit|bad_data_404>] [--json] [--account <acct_id>]";
const PROSPECTS_RESTORE_USAGE = "Usage: audienti prospects restore <prsp_id> [--json] [--account <acct_id>]";
const PROSPECTS_LOCK_USAGE = "Usage: audienti prospects lock <prsp_id> [--note <text>] [--kind <protected_relationship|company_policy>] [--json] [--account <acct_id>]";
const PROSPECTS_UNLOCK_USAGE = "Usage: audienti prospects unlock <prsp_id> [--json] [--account <acct_id>]";
const PROSPECTS_CHECK_USAGE = "Usage: audienti prospects check [--json|--csv] [filters] [--account <acct_id>]";
const PROSPECTS_IMPORT_BATCH_USAGE = "Usage: audienti prospects import-batch --file <csv|jsonl|json> [--list <list_id>] [--motion <motn_id>] [--assigned-user <id|me>] [--json] [--account <acct_id>]";
const OPERATOR_FAILED_DRAFTS_USAGE = "Usage: audienti operator failed-drafts [--json] [filters] [--account <acct_id>]";
const OPERATOR_FAILED_DRAFTS_REQUEUE_USAGE = "Usage: audienti operator failed-drafts requeue (--all | <row_id> [row_id...]) [--limit <n>] [--json] [filters] [--account <acct_id>]";
const DNC_ADD_USAGE = "Usage: audienti dnc add <email|citation_id|profile_url> [--json] [--account <acct_id>]";
const DNC_IMPORT_USAGE = "Usage: audienti dnc import --file <txt|csv> [--json] [--account <acct_id>]";
const DNC_REMOVE_USAGE = "Usage: audienti dnc remove <dnc_entry_id> [--json] [--account <acct_id>]";
const COMPANY_RULES_CREATE_USAGE = "Usage: audienti company-rules create (--linkedin-url <url> | --domain <domain>) --disposition <monitor|nurture|not_fit|reject> [--name <text>] [--user <account_user_id|email|me>] [--note <text>] [--json] [--account <acct_id>]";
const COMPANY_RULES_UPDATE_USAGE = "Usage: audienti company-rules update <rule_id> [--linkedin-url <url>] [--domain <domain>] [--disposition <monitor|nurture|not_fit|reject>] [--name <text>] [--user <account_user_id|email|me|none>] [--note <text>] [--json] [--account <acct_id>]";
const COMPANY_RULES_REMOVE_USAGE = "Usage: audienti company-rules remove <rule_id> [--json] [--account <acct_id>]";
const COMPANY_RULES_APPLY_USAGE = "Usage: audienti company-rules apply (<rule_id>|--all) [--json] [--account <acct_id>]";
const USERS_ACTIVITY_USAGE = "Usage: audienti users activity [account_user_id|me] [--mode <actor|account_usage|related>] [--window <24h|7d|30d>] [--platform <linkedin|email|gmail>] [--query <text>] [--limit <n>] [--page <n>] [--json] [--account <acct_id>]";
const OFFERS_SHOW_USAGE = "Usage: audienti offers show <offr_id> [--json] [--account <acct_id>]";
const OFFERS_UPDATE_USAGE = "Usage: audienti offers update <offr_id> [--name <text>] [--description <text>] [--url <url>] [--json] [--account <acct_id>]";
const OFFERS_DELETE_USAGE = "Usage: audienti offers delete <offr_id> --confirm <yes|true|Y|y> [--json] [--account <acct_id>]";
const WRITER_TEST_RUN_USAGE = "Usage: audienti writer test-run <prsp_id> [--json] [--mode <plan|report|step>] [--branch <both|no-accept|accepted>] [--step <step_key|row_number>] [--report <rprt_id>] [--no-wait] [--timeout-seconds <n>] [--poll-interval-seconds <n>] [--account <acct_id>]";
const WRITER_TEST_RUN_SHOW_USAGE = "Usage: audienti writer test-run show <prsp_id> <rprt_id> [--json] [--account <acct_id>]";
const MOTIONS_ANALYTICS_USAGE = "Usage: audienti motions analytics <motn_id> [--window 30d] [--json] [--account <acct_id>]";
const MOTIONS_UPDATE_USAGE = "Usage: audienti motions update <motn_id> [--status <draft|preparing|active|paused|archived>] [--tags <tag[,tag...]>] [--own-post-engagement <true|false>] [--json] [--account <acct_id>]";
const CONTENT_PROGRAMS_USAGE = "Usage: audienti content programs [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]";
const CONTENT_PLAN_USAGE = "Usage: audienti content plan <cprg_id> [--week <n>] [--due] [--json] [--account <acct_id>]";
const CONTENT_SHOW_USAGE = "Usage: audienti content show <cpwi_id> [--json] [--account <acct_id>]";
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
const ICPS_SHOW_USAGE = "Usage: audienti icps show <icp_id> [--json] [--account <acct_id>]";
const ICPS_UPDATE_USAGE = "Usage: audienti icps update <icp_id> [--name <text>] [--notes <text>] [--discovery-keyword <text>] [--tags <tag[,tag...]>] [--json] [--account <acct_id>]";
const ICPS_ADD_TAG_USAGE = "Usage: audienti icps add-tag <icp_id> <tag> [--json] [--account <acct_id>]";
const ICPS_REMOVE_TAG_USAGE = "Usage: audienti icps remove-tag <icp_id> <tag> [--json] [--account <acct_id>]";
const LISTS_ADD_TAG_USAGE = "Usage: audienti lists add-tag <list_id> <tag> [--json] [--account <acct_id>]";
const LISTS_REMOVE_TAG_USAGE = "Usage: audienti lists remove-tag <list_id> <tag> [--json] [--account <acct_id>]";
const ANALYTICS_PROSPECTS_USAGE = "Usage: audienti analytics prospects [--window 24h] [--cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD] [--motion <motn_id>] [--provenance <source>] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]";
const ANALYTICS_PROSPECTS_COHORT_ANALYSIS_USAGE = "Usage: audienti analytics prospects cohort-analysis [--weeks <n>] [--window 24h] [--motion <motn_id>] [--provenance <source>] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]";
const ANALYTICS_USERS_USAGE = "Usage: audienti analytics users [--user <account_user_id|email|name|me>] [--window 30d | --start YYYY-MM-DD --end YYYY-MM-DD] [--cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD] [--motion <motn_id>] [--provenance <source>] [--platform <linkedin|email|gmail>] [--json] [--account <acct_id>]";
const ANALYTICS_DASHBOARD_USAGE = "Usage: audienti analytics dashboard [--cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD] [--play-tag <tag>] [--motion <motn_id>] [--offer <offr_id>] [--icp <icp_id>] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]";
const TOOLS_LIST_USAGE = "Usage: audienti tools list [--json]";
const TOOLS_LINKEDIN_REVIEW_USAGE = "Usage: audienti tools linkedin-review --url <linkedin_url> [--icp <icp_id>] [--json] [--account <acct_id>]";
const TOOLS_LINKEDIN_REVIEW_REPORTS_USAGE = "Usage: audienti tools linkedin-review reports [--limit <n>] [--json] [--account <acct_id>]";
const TOOLS_LINKEDIN_REVIEW_SHOW_USAGE = "Usage: audienti tools linkedin-review show <rprt_id> [--json] [--account <acct_id>]";
const TOOLS_LINKEDIN_REVIEW_STATUS_USAGE = "Usage: audienti tools linkedin-review status <rprt_id> [--json] [--account <acct_id>]";
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
    stderr: deps.stderr || process.stderr
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

  if (normalizedResource === "auth" && action === "token") return authToken(rest, context);
  if (normalizedResource === "auth" && action === "status") return authStatus(rest, context, { accountOverride });
  if (normalizedResource === "auth" && action === "logout") return authLogout(rest, context);
  if (normalizedResource === "config" && action === "list") return configList(rest, context);
  if (normalizedResource === "update" && action === "check") return updateCheck(rest, context);
  if (normalizedResource === "accounts" && action === "list") return accountsList(rest, context, { accountOverride });
  if (normalizedResource === "accounts" && action === "select") return accountsSelect(rest, context);
  if (normalizedResource === "users" && action === "list") return usersList(rest, context, { accountOverride });
  if (normalizedResource === "users" && action === "select") return usersSelect(rest, context, { accountOverride });
  if (normalizedResource === "users" && action === "activity") return usersActivity(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "list") return offersList(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "show") return offersShow(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "create") return offersCreate(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "update") return offersUpdate(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "delete") return offersDelete(rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "list") return icpsList(rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "show") return icpsShow(rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "create") return icpsCreate(rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "update") return icpsUpdate(rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "add-tag") return icpsTagMutation("add", rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "remove-tag") return icpsTagMutation("remove", rest, context, { accountOverride });
  if (normalizedResource === "companies" && action === "search") return companiesSearch(rest, context, { accountOverride });
  if (normalizedResource === "dnc" && action === "list") return dncList(rest, context, { accountOverride });
  if (normalizedResource === "dnc" && action === "add") return dncAdd(rest, context, { accountOverride });
  if (normalizedResource === "dnc" && action === "import") return dncImport(rest, context, { accountOverride });
  if (normalizedResource === "dnc" && ["remove", "delete"].includes(action)) return dncRemove(rest, context, { accountOverride });
  if (normalizedResource === "company-rules" && action === "list") return companyRulesList(rest, context, { accountOverride });
  if (normalizedResource === "company-rules" && action === "create") return companyRulesCreate(rest, context, { accountOverride });
  if (normalizedResource === "company-rules" && action === "update") return companyRulesUpdate(rest, context, { accountOverride });
  if (normalizedResource === "company-rules" && ["remove", "delete"].includes(action)) return companyRulesRemove(rest, context, { accountOverride });
  if (normalizedResource === "company-rules" && action === "apply") return companyRulesApply(rest, context, { accountOverride });
  if (normalizedResource === "tags" && action === "list") return tagsList(rest, context, { accountOverride });
  if (normalizedResource === "tags" && action === "show") return tagsShow(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "list") return listsList(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "create") return listsCreate(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "show") return listsShow(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "update") return listsUpdate(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "add-tag") return listsTagMutation("add", rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "remove-tag") return listsTagMutation("remove", rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "delete") return listsDelete(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "prospects") return listProspects(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "add-prospects") return listsAddProspects(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "remove-prospects") return listsRemoveProspects(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "list") return motionsList(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "show") return motionsShow(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "status") return motionsStatus(rest, context, { accountOverride });
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
  if (normalizedResource === "content" && action === "programs") return contentPrograms(rest, context, { accountOverride });
  if (normalizedResource === "content" && action === "plan") return contentPlan(rest, context, { accountOverride });
  if (normalizedResource === "content" && action === "show") return contentShow(rest, context, { accountOverride });
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
  if (normalizedResource === "prospects" && action === "assign") return prospectsAssign(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "set-status") return prospectsSetStatus(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "replan") return prospectsReplan(rest, context, { accountOverride });
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
  if (normalizedResource === "tools" && action === "linkedin-review") return toolsLinkedinReview(rest, context, { accountOverride });
  if (normalizedResource === "operator" && action === "failed-drafts") return operatorFailedDrafts(rest, context, { accountOverride });
  if (normalizedResource === "operator" && action === "queue") return operatorQueue(rest, context, { accountOverride });
  if (normalizedResource === "operator" && action === "next") return operatorNext(rest, context, { accountOverride });
  if (normalizedResource === "operator" && action === "outcome") return operatorOutcome(rest, context, { accountOverride });
  if (normalizedResource === "analytics" && ["prospects", "prospect"].includes(action)) return analyticsProspects(rest, context, { accountOverride });
  if (normalizedResource === "analytics" && ["users", "user"].includes(action)) return analyticsUsers(rest, context, { accountOverride });
  if (normalizedResource === "analytics" && ["visibility", "visops"].includes(action)) return analyticsVisibility(rest, context, { accountOverride });
  if (normalizedResource === "analytics" && action === "content") return analyticsContent(rest, context, { accountOverride });
  if (normalizedResource === "analytics" && ["dashboard", "campaign", "campaigns"].includes(action)) return analyticsDashboard(rest, context, { accountOverride });

  throw new CommandError(usage(), { exitCode: resource ? 1 : 0 });
}

function extractGlobalOptions(argv) {
  const args = [];
  let accountOverride;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--account") {
      accountOverride = argv[index + 1];
      if (!accountOverride || accountOverride.startsWith("--")) {
        throw new CommandError("--account requires an account id.");
      }
      index += 1;
    } else if (arg.startsWith("--account=")) {
      accountOverride = arg.slice("--account=".length);
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
  if (parts[0] === "plays") return ["motions", ...parts.slice(1)];
  if (parts[0] === "principals") return ["users", ...parts.slice(1)];
  if (parts[0] === "writers") return ["writer", ...parts.slice(1)];
  return parts;
}

function normalizeResource(resource) {
  if (resource === "account") return "accounts";
  if (resource === "principals") return "users";
  if (resource === "writers") return "writer";
  if (resource === "company_rules" || resource === "company-rules") return "company-rules";
  return resource === "plays" ? "motions" : resource;
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

async function authStatus(args, context, { accountOverride } = {}) {
  assertNoPositionals(args, "Usage: audienti auth status [--account <acct_id>]");

  const config = await readConfig({ env: context.env });
  if (!config.token) {
    writeLine(context.stdout, "Not authenticated. Run `audienti auth token <token>`.");
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

async function icpsList(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    tag: { type: "string" }
  });
  if (positionals.length > 0) throw new CommandError("Usage: audienti icps list [--tag <tag>] [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const icps = filterRecordsByTag(await client.icps(accountId), values.tag, "tags");
  if (values.json) return writeJson(context.stdout, icps);

  renderIcps(icps, context);
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
    name: { type: "string" },
    notes: { type: "string" },
    tags: { type: "string" },
    "discovery-keyword": { type: "string" }
  });
  const hasUpdateField = values.name || values.notes !== undefined || values.tags !== undefined || values["discovery-keyword"] !== undefined;
  if (positionals.length !== 1 || !hasUpdateField) {
    throw new CommandError(ICPS_UPDATE_USAGE);
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const icp = await client.updateIcp(accountId, positionals[0], {
    icp: compactObject({
      name: values.name,
      notes: values.notes,
      discovery_keyword: values["discovery-keyword"],
      tags: values.tags !== undefined ? tagList(values.tags) : undefined
    })
  });
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
  const payload = await client.runMotionDiscovery(accountId, positionals[0], compactObject({
    target_count: normalizeOptionalPositiveInteger(values["target-count"], "--target-count")
  }));
  if (values.json) return writeJson(context.stdout, payload);

  renderMotionDiscoveryRun(payload, context);
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
    payload: { type: "string" }
  });
  if (positionals.length > 0 || !values.payload) {
    throw new CommandError("Usage: audienti motions create --payload <file.json> [--json] [--account <acct_id>]");
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await readJsonPayload(values.payload);
  const created = await client.createMotion(accountId, { motion: payload });
  if (values.json) return writeJson(context.stdout, created);

  writeLine(context.stdout, `Created motion ${display(created?.name)} (${display(created?.prefix_id)}).`);
  renderMotion(created, context);
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
    status: { type: "string" },
    tags: { type: "string" },
    "own-post-engagement": { type: "string" }
  });
  const hasUpdateField = values.status || values.tags !== undefined || values["own-post-engagement"] !== undefined;
  if (positionals.length !== 1 || !hasUpdateField) {
    throw new CommandError(MOTIONS_UPDATE_USAGE);
  }

  const normalizedStatus = normalizeMotionStatus(values.status);
  const motionAttributes = compactObject({
    status: normalizedStatus,
    play_tags: values.tags !== undefined ? tagList(values.tags) : undefined,
    own_post_engagement: values["own-post-engagement"] !== undefined ? parseBooleanString(values["own-post-engagement"], "--own-post-engagement") : undefined
  });

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const motion = await client.updateMotion(accountId, positionals[0], { motion: motionAttributes });
  if (values.json) return writeJson(context.stdout, motion);

  writeLine(context.stdout, `Updated motion ${display(motion?.name)} (${display(motion?.prefix_id)}).`);
  renderMotion(motion, context);
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

async function contentPlan(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    week: { type: "string" },
    due: { type: "boolean" }
  });
  if (positionals.length !== 1) throw new CommandError(CONTENT_PLAN_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.contentPlan(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, payload);

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
    "assigned-user": { type: "string" }
  });
  if (positionals.length !== 1) {
    throw new CommandError("Usage: audienti prospects import <linkedin_url> [--list <list_id>] [--motion <motn_id>] [--assigned-user <id|me>] [--json] [--account <acct_id>]");
  }

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const payload = await client.prospectImport(accountId, compactObject({
    linkedin_url: positionals[0],
    list_id: values.list,
    motion_id: values.motion,
    assigned_user_id: resolveAccountUserId(values["assigned-user"], config, { accountOverride })
  }));
  if (values.json) return writeJson(context.stdout, payload);

  renderProspectImportStarted(payload, context);
}

async function prospectsImportBatch(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    file: { type: "string" },
    list: { type: "string" },
    motion: { type: "string" },
    "assigned-user": { type: "string" }
  });
  if (positionals.length > 0 || !values.file) {
    throw new CommandError(PROSPECTS_IMPORT_BATCH_USAGE);
  }

  const rows = await readProspectImportBatchFile(values.file);
  if (rows.length === 0) throw new CommandError("Import batch file did not contain any prospects.");

  const { client, accountId, config } = await requireAccountContext(context, { accountOverride });
  const result = {
    summary: {
      total: rows.length,
      started: 0,
      failed: 0
    },
    imports: [],
    failed: []
  };

  for (const row of rows) {
    const body = compactObject({
      linkedin_url: row.linkedin_url,
      list_id: row.list_id || values.list,
      motion_id: row.motion_id || values.motion,
      assigned_user_id: resolveAccountUserId(row.assigned_user_id || values["assigned-user"], config, { accountOverride })
    });

    try {
      const payload = await client.prospectImport(accountId, body);
      result.imports.push(payload);
      result.summary.started += 1;
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;

      result.failed.push({
        row: row.row,
        linkedin_url: row.linkedin_url,
        status: error.status,
        error: error.body?.error || error.message
      });
      result.summary.failed += 1;
    }
  }

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

async function operatorQueue(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, operatorFilterOptions());
  if (positionals.length > 0) throw new CommandError("Usage: audienti operator queue [--json] [filters] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.operatorQueue(accountId, operatorQuery(values));
  if (values.json) return writeJson(context.stdout, payload);

  renderOperatorQueue(payload, context);
}

async function operatorFailedDrafts(args, context, { accountOverride } = {}) {
  if (args[0] === "requeue") {
    return operatorFailedDraftsRequeue(args.slice(1), context, { accountOverride });
  }

  const { values, positionals } = parseCommandArgs(args, operatorFailedDraftOptions());
  if (positionals.length > 0) throw new CommandError(OPERATOR_FAILED_DRAFTS_USAGE);

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.operatorQueue(accountId, operatorFailedDraftQuery(values));
  if (values.json) return writeJson(context.stdout, payload);

  renderOperatorFailedDrafts(payload, context);
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
  if (!outcomeStatus && (values.note !== undefined || values["occurred-at"] !== undefined)) {
    throw new CommandError("--note and --occurred-at require an outcome flag: --done, --skip, --fail, or --return.");
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.operatorNext(accountId, operatorQuery(values));
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
  if (values.plan) return renderOperatorPlan(payload?.next_move, context);

  renderOperatorNext(payload?.next_move, context);
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
    throw new CommandError("Not authenticated. Run `audienti auth token <token>`.");
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
    plan: { type: "boolean" },
    done: { type: "boolean" },
    skip: { type: "boolean" },
    fail: { type: "boolean" },
    return: { type: "boolean" },
    note: { type: "string" },
    "occurred-at": { type: "string" }
  });
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
    offer: { type: "string" },
    icp: { type: "string" },
    user: { type: "string" }
  };
}

function analyticsQuery(values, config = {}, { accountOverride } = {}) {
  return compactObject({
    window: values.window,
    cohort_start: values["cohort-start"],
    cohort_end: values["cohort-end"],
    motion_id: values.motion,
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
    offer_id: values.offer,
    icp_id: values.icp,
    account_user_id: resolveAccountUserId(values.user, config, { accountOverride })
  });
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

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => {
      if (value === undefined || value === null) return false;
      if (Array.isArray(value)) return true;

      return String(value).trim() !== "";
    })
  );
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
    if (values.name || values.notes || values.tags !== undefined || values["discovery-keyword"]) {
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

    return compactObject({
      row: rowNumber,
      linkedin_url: linkedinUrl,
      list_id: normalized.list_id,
      motion_id: normalized.motion_id,
      assigned_user_id: normalized.assigned_user_id || normalized.assigned_user
    });
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
}

function renderIcps(icps, context) {
  if (!Array.isArray(icps) || icps.length === 0) return writeLine(context.stdout, "No ICPs found.");

  writeLine(context.stdout, "ICP ID\tNAME\tTAGS\tDISCOVERY KEYWORD\tAGENT");
  for (const icp of icps) {
    writeLine(
      context.stdout,
      [
        display(icp.prefix_id),
        display(icp.name),
        display(Array.isArray(icp.tags) && icp.tags.length > 0 ? icp.tags.join(",") : "-"),
        display(icp.discovery_keyword),
        display(icp.agent?.name)
      ].join("\t")
    );
  }
}

function renderIcp(icp, context) {
  writeLine(context.stdout, `ICP: ${display(icp?.name)} (${display(icp?.prefix_id)})`);
  if (Array.isArray(icp?.tags)) writeLine(context.stdout, `Tags: ${display(icp.tags.join(", "), "-")}`);
  if (icp?.notes) writeLine(context.stdout, `Notes: ${icp.notes}`);
  if (icp?.discovery_keyword) writeLine(context.stdout, `Discovery keyword: ${icp.discovery_keyword}`);
  if (icp?.agent?.name) writeLine(context.stdout, `Agent: ${icp.agent.name}`);
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
  if (motion?.offer?.name) writeLine(context.stdout, `Offer: ${motion.offer.name} (${display(motion.offer.prefix_id)})`);
  if (motion?.icp?.name) writeLine(context.stdout, `ICP: ${motion.icp.name} (${display(motion.icp.prefix_id)})`);
  if (motion?.list?.name) writeLine(context.stdout, `List: ${motion.list.name} (${display(motion.list.prefix_id)})`);
  writeLine(context.stdout, `Own-post engagement: ${motion?.own_post_engagement ? "enabled" : "disabled"}`);
  if (Array.isArray(motion?.play_tags)) writeLine(context.stdout, `Tags: ${display(motion.play_tags.join(", "), "-")}`);
  if (motion?.principal_account_user?.id) {
    writeLine(
      context.stdout,
      `Principal: ${display(motion.principal_account_user.name || motion.principal_account_user.email)} (${display(motion.principal_account_user.id)})`
    );
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
  if (status?.description) writeLine(context.stdout, status.description);
  if (status?.action?.label) writeLine(context.stdout, `Action: ${status.action.label}`);
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

  writeLine(context.stdout, `Replan ${status} for ${display(prospect.display_name || prospect.name)} (${display(prospect.prefix_id)}).`);
  writeLine(context.stdout, `Changed: ${payload?.changed ? "yes" : "no"}`);
  if (payload?.reason_code) writeLine(context.stdout, `Reason: ${payload.reason_code}`);
  writeLine(context.stdout, `Current: ${formatCoachAction(current.next_action)}`);
  writeLine(context.stdout, `Replanned: ${formatCoachAction(replanned.next_action)}`);
  if (replanned.rationale) writeLine(context.stdout, `Rationale: ${replanned.rationale}`);
  if (replanned.guidance) writeLine(context.stdout, `Guidance: ${replanned.guidance}`);
  if (payload?.status === "dry_run") writeLine(context.stdout, "Run again with --apply to persist this plan.");
  if (payload?.status === "coach_error") writeLine(context.stdout, "The plan was not persisted. Fix the coach error and rerun with --apply.");
}

function replanStatusLabel(payload) {
  if (payload?.status === "dry_run") return "dry run";
  if (payload?.status === "coach_error") return "coach error";
  if (payload?.status === "not_applied") return "not applied";

  return payload?.applied ? "applied" : "dry run";
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
}

function renderOperatorNext(row, context) {
  if (!row) return writeLine(context.stdout, "No operator moves found.");

  writeOperatorRows(context, [row]);
}

function renderOperatorPlan(row, context) {
  if (!row) return writeLine(context.stdout, "No operator moves found.");

  const nextAction = row.next_action || {};
  const cta = row.cta || {};
  const draft = row.operator_draft || {};

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
  const label = entityLabel(motion) || payload?.motion_id;
  const prefix = payload?.enqueued ? "Discovery queued" : "Discovery not queued";
  writeLine(context.stdout, `${prefix} for ${display(label)}.`);
  writeLine(context.stdout, `Reason: ${display(payload?.reason)}`);
  writeLine(context.stdout, `Target count: ${display(payload?.target_count)}`);
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

function renderAnalyticsProspectCohortAnalysis(payload, context) {
  const cohorts = Array.isArray(payload?.cohorts) ? payload.cohorts : [];
  writeLine(context.stdout, `Prospect cohort analysis (${display(payload?.weeks, cohorts.length)} weeks)`);
  writeLine(context.stdout, `Activity window: ${display(payload?.window, "24h")}`);
  writeLine(context.stdout, "Cohorts: account_prospects.created_at, calendar weeks, oldest first");
  writeAnalyticsMotion(payload, context);
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
  const helpText = HELP_TOPICS.get(topic);
  if (!helpText) {
    throw new CommandError(`No help topic found for "${topic || "audienti"}". Run \`audienti --help\`.`);
  }

  return helpText;
}

const HELP_TOPICS = new Map([
  ["", [
    "Usage:",
    "  audienti <command> [options]",
    "",
    "Start:",
    "  audienti auth token <token>         Save an API token",
    "  audienti accounts list             See accounts available to this token",
    "  audienti accounts select <acct_id>  Use one account by default",
    "  audienti users select <user>        Use one account user by default",
    "  audienti help agent-workflows       Common agent/operator paths",
    "",
    "Work areas:",
    "  Setup & identity",
    "    audienti auth status",
    "    audienti config list",
    "    audienti update check",
    "    audienti users list",
    "    audienti users select <account_user_id|email|name|me>",
    "    audienti users activity [account_user_id|me]",
    "",
    "  Motions / plays",
    "    audienti motions list",
    "    audienti motions show <motn_id>",
    "    audienti motions analytics <motn_id>",
    "    audienti motions run-discovery <motn_id>",
    "    audienti motions prospects <motn_id>",
    "    audienti motions create --payload <file.json>",
    "    audienti motions update <motn_id> [--status <state>] [--tags <tag[,tag...]>] [--own-post-engagement <true|false>]",
    "    audienti motions add-tag <motn_id> <tag>",
    "    audienti motions remove-tag <motn_id> <tag>",
    "    audienti motions activate <motn_id>",
    "    audienti motions pause <motn_id>",
    "    audienti motions delete <motn_id> --confirm <yes|true|Y|y>",
    "    audienti motions clone <motn_id> --name <text>",
    "    audienti motions move-prospects <source_motn_id> --target <target_motn_id> <prsp_id> [prsp_id...]",
    "    Tip: `plays` is accepted anywhere `motions` is accepted.",
    "",
    "  ContentOps",
    "    audienti content programs",
    "    audienti content plan <cprg_id>",
    "    audienti content show <cpwi_id>",
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
    "    audienti prospects set-status <prsp_id> --status <active|nurture|non_responsive|not_fit|bad_data_404|rejected>",
    "    audienti prospects replan <prsp_id> [--apply]",
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
    "    audienti tags list",
    "    audienti tags show <tag>",
    "    audienti offers list",
    "    audienti offers show <offr_id>",
    "    audienti offers update <offr_id> [--name <text>]",
    "    audienti offers delete <offr_id> --confirm <yes|true|Y|y>",
    "    audienti icps list [--tag <tag>]",
    "    audienti icps show <icp_id>",
    "    audienti icps update <icp_id> [--tags <tag[,tag...]>]",
    "    audienti icps add-tag <icp_id> <tag>",
    "    audienti icps remove-tag <icp_id> <tag>",
    "    audienti companies search --query <text>",
    "    audienti dnc list",
    "    audienti dnc add <email|citation_id|profile_url>",
    "    audienti company-rules list",
    "    audienti company-rules create (--linkedin-url <url> | --domain <domain>) --disposition <state>",
    "",
    "  Writer",
    "    audienti writer test-run <prsp_id>",
    "    audienti prospects write <prsp_id> --type <surface_key>",
    "    audienti prospects sequence-export <prsp_id>",
    "",
  "  Operator queue",
  "    audienti operator next --plan",
  "    audienti operator next --done --note <text>",
  "    audienti operator queue",
  "    audienti operator failed-drafts",
  "    audienti operator failed-drafts requeue <row_id>",
  "",
    "  Analytics",
    "    audienti analytics prospects --window 24h",
    "    audienti analytics dashboard --play-tag <tag>",
    "    audienti analytics prospects cohort-analysis --weeks 4 --motion <motn_id>",
    "    audienti analytics users --user me --window 30d",
    "    audienti analytics visibility --window 24h --user me",
    "    audienti analytics content --window week",
    "",
    "  Utilities",
    "    audienti tools list",
    "    audienti tools get email --url <linkedin_url>",
    "    audienti tools get phone --url <linkedin_url>",
    "    audienti tools linkedin-review --url <linkedin_url> [--icp <icp_id>]",
    "    audienti tools linkedin-review reports",
    "    audienti tools linkedin-review show <rprt_id>",
    "",
    "Common flows:",
    "  Work the next move:  audienti operator next --plan",
    "  Inspect a prospect:  audienti prospects show <prsp_id> --json",
    "  Preview a campaign:  audienti writer test-run <prsp_id>",
    "  Analyze one motion:  audienti motions analytics <motn_id>",
    "  Count one campaign:   audienti analytics dashboard --play-tag <tag>",
    "  Audit your work:     audienti analytics users --user me --window 30d",
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
    "  audienti auth token <token> [--host <url>]",
    "  audienti auth status",
    "  audienti auth logout",
    "",
    "Status: implemented",
    "",
    "Commands:",
    "  audienti auth token <token>  Validate and save a bearer API token",
    "  audienti auth status         Check live auth and show selected account",
    "  audienti auth logout         Delete local CLI auth config",
    "",
    "Run `audienti auth token help` for token input shape."
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
    "  audienti accounts select <acct_id>",
    "",
    "Status: implemented",
    "",
    "Input shape:",
    "  acct_id: string  Account prefix id, for example acct_abc123"
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

  ["users", [
    "Usage:",
    "  audienti users list [--json]",
    "  audienti users select <account_user_id|email|name|me>",
    "  audienti users activity [account_user_id|me] [--json]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  List and select the account users that can be used as motion principals or assignees.",
    "",
    "CLI synonym:",
    "  `principals` is accepted anywhere `users` is accepted"
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
    "  audienti icps list [--tag <tag>] [--json]",
    "  audienti icps show <icp_id> [--json]",
    "  audienti icps create (--name <text> | --payload <file.json>) [--json]",
    "  audienti icps update <icp_id> [--tags <tag[,tag...]>] [--json]",
    "  audienti icps add-tag <icp_id> <tag> [--json]",
    "  audienti icps remove-tag <icp_id> <tag> [--json]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  List the ICPs available to the current account so an agent can choose icp_id for motion creation or targeting work."
  ].join("\n")],

  ["icps list", [
    "Usage:",
    "  audienti icps list [--tag <tag>] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Options:",
    "  --tag <tag>  Filter locally to ICPs whose tags include the normalized tag",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/icps.json",
    "",
    "Output shape:",
    "  id: integer",
    "  prefix_id: icpp_",
    "  name: string",
    "  notes: string | null",
    "  tags: [string]",
    "  discovery_keyword: string | null",
    "  agent: { id, name } | null"
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
    "  audienti icps update <icp_id> [--name <text>] [--notes <text>] [--discovery-keyword <text>] [--tags <tag[,tag...]>] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Update simple ICP fields or replace the ICP's full tag set.",
    "",
    "Input shape:",
    "  icp_id: icpp_ prefixed id or integer id",
    "  name: string | optional",
    "  notes: string | optional",
    "  discovery_keyword: string | optional",
    "  tags: comma-separated tag list | optional",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/icps/:id.json",
    "",
    "JSON body:",
    "  {",
    "    \"icp\": {",
    "      \"tags\": [\"enterprise\", \"renewal\"]",
    "    }",
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

  ["company-rules", [
    "Usage:",
    "  audienti company-rules list [--json]",
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

  ["lists", [
    "Usage:",
    "  audienti lists list [--tag <tag>] [--json]",
    "  audienti lists create --name <text> [--tags <tag[,tag...]>] [--json]",
    "  audienti lists show <list_id> [--json]",
    "  audienti lists update <list_id> [--tags <tag[,tag...]>] [--json]",
    "  audienti lists add-tag <list_id> <tag> [--json]",
    "  audienti lists remove-tag <list_id> <tag> [--json]",
    "  audienti lists delete <list_id> --confirm <yes|true|Y|y> [--json]",
    "  audienti lists prospects <list_id> [--json]",
    "  audienti lists add-prospects <list_id> <prsp_id> [prsp_id...] [--json]",
    "  audienti lists remove-prospects <list_id> <prsp_id> [prsp_id...] [--json]",
    "",
    "Status: read, create, update, delete, and membership commands implemented",
    "",
    "ID shape:",
    "  list_id: list_ prefix id"
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
    "  audienti motions status <motn_id> [--json]",
    "  audienti motions run-discovery <motn_id> [--target-count <n>] [--json]",
    "  audienti motions analytics <motn_id> [--window 30d] [--json]",
    "  audienti motions prospects <motn_id> [--json]",
    "  audienti motions add-prospects <motn_id> <prsp_id> [prsp_id...] [--json]",
    "  audienti motions create --payload <file.json> [--json]",
    "  audienti motions update <motn_id> [--status <draft|preparing|active|paused|archived>] [--tags <tag[,tag...]>] [--own-post-engagement <true|false>] [--json]",
    "  audienti motions add-tag <motn_id> <tag> [--json]",
    "  audienti motions remove-tag <motn_id> <tag> [--json]",
    "  audienti motions activate <motn_id> [--json]",
    "  audienti motions pause <motn_id> [--json]",
    "  audienti motions archive <motn_id> [--json]",
    "  audienti motions delete <motn_id> --confirm <yes|true|Y|y> [--json]",
    "  audienti motions clone <motn_id> --name <text> [--json]",
    "  audienti motions move-prospects <source_motn_id> --target <target_motn_id> <prsp_id> [prsp_id...] [--json]",
    "",
    "Status: read, create, status update, delete, clone, status, discovery launch, and prospect attachment commands implemented",
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
  ["content show", [CONTENT_SHOW_USAGE].join("\n")],
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
    "API:",
    "  GET /api/v1/accounts/:account_id/motions/:id.json"
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
    "  description: string",
    "  action: { key: string, label: string } | null",
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
    "  Queue an immediate discovery run for one discovery-capable motion or play.",
    "",
    "Options:",
    "  --target-count <n>  Override the manual replenishment target count for this launch.",
    "",
    "Output shape:",
    "  enqueued: true when Motions::DiscoverJob was queued",
    "  reason: launched | run_in_progress | lock_contention | target_met | enqueue_failed",
    "  target_count: requested target count",
    "",
    "API:",
    "  POST /api/v1/accounts/:account_id/motions/:id/run_discovery.json"
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
    "  audienti motions create --payload <file.json> [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Create a motion or play through the same managed setup path the app uses.",
    "",
    "Input shape:",
    "  name: string",
    "  premise: string",
    "  approach: string | optional",
    "  kind: outbound | inbound | lopa | transition",
    "  status: draft | active | paused | archived",
    "  offer_id: offr_ prefix id",
    "  principal_account_user_id: integer | me | optional",
    "  icp_id: icpp_ prefix id | optional",
    "  list_id: list_ prefix id | optional",
    "  play_tags: [string] | optional",
    "  inbound_channels: [linkedin | reddit] | optional",
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
    "    \"play_tags\": [\"sarit\", \"pj\"]",
    "  }",
    "",
    "Behavior:",
    "  The API calls Motions::Setup and the managed graph provisioner. If principal_account_user_id is omitted, the authenticated account user is used.",
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
    "  Copies the motion kind, offer, ICP, principal, premise, approach, targeting profile, suppression policy, secondary roles, and active signal rows.",
    "  The clone starts as draft with a new empty backing list.",
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
    "  Change one motion or play's lifecycle status or replace its tag set.",
    "",
    "Input shape:",
    "  motn_id: motn_ prefix id",
    "  status: draft | preparing | active | paused | archived | optional",
    "  tags: comma-separated tag list | optional",
    "",
    "Behavior:",
    "  Updates only the provided fields. Sending --tags replaces the motion's full tag set.",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/motions/:id.json",
    "",
    "JSON body:",
    "  {",
      "    \"motion\": {",
      "      \"status\": \"paused\",",
      "      \"play_tags\": [\"sarit\", \"pj\"]",
      "    }",
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
    "  audienti prospects set-status <prsp_id> --status <active|nurture|non_responsive|not_fit|bad_data_404|rejected> [--json]",
    "  audienti prospects replan <prsp_id> [--apply] [--json]",
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
    "  audienti prospects import <linkedin_url> [--list <list_id>] [--motion <motn_id>] [--json]",
    "  audienti prospects import-batch --file <csv|jsonl|json> [--list <list_id>] [--motion <motn_id>] [--json]",
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
    "  assigned_user_id: account user id or me | optional default for every row",
    "",
    "CSV columns:",
    "  linkedin_url or url, list_id, motion_id, assigned_user_id",
    "",
    "Behavior:",
    "  Starts one normal prospect import per row. Row-level list_id, motion_id, and assigned_user_id override command defaults.",
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
    "  audienti tools linkedin-review --url <linkedin_url> [--icp <icp_id>] [--json]",
    "  audienti tools linkedin-review reports [--limit <n>] [--json]",
    "  audienti tools linkedin-review show <rprt_id> [--json]",
    "  audienti tools linkedin-review status <rprt_id> [--json]",
    "",
    "Status: implemented",
    "",
    "Commands:",
    "  audienti tools list             Show available CLI tools and the report commands they support.",
    "  audienti tools get              Run a LinkedIn URL through the existing import and contact-enrichment pipeline, then return the first selected email or phone.",
    "  audienti tools linkedin-review  Queue a LinkedIn personal profile authority review and ICP-fit positioning blueprint.",
    "  audienti tools linkedin-review reports  List recent LinkedIn Review reports for the active account.",
    "  audienti tools linkedin-review show     View the completed report content in the terminal.",
    "  audienti tools linkedin-review status  Show the current report stage and run status."
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

  ["operator", [
    "Usage:",
    "  audienti operator next [--json|--plan|--done|--skip|--fail|--return]",
    "  audienti operator queue [--json]",
    "  audienti operator failed-drafts [--json]",
    "  audienti operator failed-drafts requeue (--all | <row_id> [row_id...])",
    "  audienti operator outcome <row_id> --payload <file.json>",
    "",
    "Status: read commands, failed draft requeue, and prospect next-move writeback implemented",
    "",
    "Filters:",
    "  --principal <account_user_id>",
    "  --motion <motn_id>",
    "  --list <list_id>",
    "  --stage <stage>",
    "  --opportunity-kind prospect|visibility",
    "  --writing-status ready|drafting|draft_failed"
  ].join("\n")],

  ["operator next", [
    "Usage:",
    "  audienti operator next [--json|--plan|--done|--skip|--fail|--return] [filters] [--note <text>] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
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
    "Output shape:",
    "  next_move: focal operator row",
    "  decision_queue[]: ordered operator rows",
    "  daily_progress: pacing counters",
    "  outcome_rollups: queue rollups",
    "  options: motions, principals, lists, stages",
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
    "  audienti analytics prospects [--window 24h] [--cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD] [--motion <motn_id>] [--user <account_user_id|email|name|me>] [--json]",
    "  audienti analytics dashboard [--cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD] [--play-tag <tag>] [--motion <motn_id>] [--json]",
    "  audienti analytics prospects cohort-analysis [--weeks <n>] [--window 24h] [--motion <motn_id>] [--user <account_user_id|email|name|me>] [--json]",
    "  audienti analytics users [--user <account_user_id|email|name|me>] [--window 30d | --start YYYY-MM-DD --end YYYY-MM-DD] [--cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD] [--motion <motn_id>] [--platform <linkedin|email|gmail>] [--json]",
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
    "  --play-tag <tag>  For dashboard analytics, filter to motions/lists tagged with a campaign tag.",
    "  --provenance <source>  Optional lower-level AccountProspect.intake_source filter.",
    "  --platform <linkedin|email|gmail>  For user analytics, filter events.platform. --channel is accepted as an alias.",
    "  cohort-analysis loops over recent weekly AccountProspect.created_at cohorts and compares their current stages.",
    "  --user <account_user_id|email|name|me>  Narrow analytics to one account user. For prospect analytics, this means prospects assigned to that account user. Email/name partials are accepted when they match exactly one account user.",
    "",
    "Output:",
    "  Account-scoped analytics for prospects, campaign dashboard counts, users, visibility engagement, and ContentOps publishing."
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

  ["analytics prospects", [
    "Usage:",
    "  audienti analytics prospects [--window 24h] [--cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD] [--motion <motn_id>] [--provenance <source>] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]",
    "  audienti analytics prospects cohort-analysis [--weeks <n>] [--window 24h] [--motion <motn_id>] [--provenance <source>] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Output shape:",
    "  window: activity/event period for actions",
    "  cohort: selected AccountProspect.created_at cohort when cohort dates are provided",
    "  motion: selected motion/play when --motion is provided",
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
    "  audienti auth token <token>",
    "  audienti accounts list",
    "  audienti accounts select <acct_id>",
    "  audienti users list",
    "  audienti users select me",
    "  audienti offers list",
    "  audienti icps list",
    "",
    "2. Create a motion or play",
    "  audienti motions create --payload <file.json>",
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
    "",
    "7. Inspect account analytics",
    "  audienti users activity me --window 7d",
    "  audienti analytics prospects --window 24h",
    "  audienti analytics dashboard --play-tag wine_campaign",
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
