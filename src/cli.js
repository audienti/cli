import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
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
const DEFAULT_PROFILE_IDENTIFIERS = [
  "linkedin/profile",
  "linkedin/company",
  "twitter/profile",
  "phone/profile",
  "email/profile"
];
const DELETE_CONFIRMATION_VALUES = new Set(["yes", "true", "y"]);
const PROSPECTS_ADD_NOTE_USAGE = "Usage: audienti prospects add-note <prsp_id> (--message <text> [--type <note|steer|voicemail_outreach|video_outreach>] [--engagement-type <key>] | --payload <file.json>) [--json] [--account <acct_id>]";
const PROSPECTS_ADD_STEER_USAGE = "Usage: audienti prospects add-steer <prsp_id> (--message <text> [--engagement-type <key>] | --payload <file.json>) [--json] [--account <acct_id>]";
const PROSPECTS_ADD_PROFILE_USAGE = "Usage: audienti prospects add-profile <prsp_id> --url <profile_url|email|phone> [--json] [--account <acct_id>]";
const PROSPECTS_REPORT_BAD_PROFILE_USAGE = "Usage: audienti prospects report-bad-profile <prsp_id> <prof_id|citation_id> [--json] [--account <acct_id>]";
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
    fetchImpl: deps.fetch || globalThis.fetch,
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

  const [resource, action, ...rest] = args;
  const normalizedResource = normalizeResource(resource);

  if (normalizedResource === "auth" && action === "token") return authToken(rest, context);
  if (normalizedResource === "auth" && action === "status") return authStatus(rest, context, { accountOverride });
  if (normalizedResource === "auth" && action === "logout") return authLogout(rest, context);
  if (normalizedResource === "config" && action === "list") return configList(rest, context);
  if (normalizedResource === "accounts" && action === "list") return accountsList(rest, context, { accountOverride });
  if (normalizedResource === "accounts" && action === "select") return accountsSelect(rest, context);
  if (normalizedResource === "users" && action === "list") return usersList(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "list") return offersList(rest, context, { accountOverride });
  if (normalizedResource === "offers" && action === "create") return offersCreate(rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "list") return icpsList(rest, context, { accountOverride });
  if (normalizedResource === "icps" && action === "create") return icpsCreate(rest, context, { accountOverride });
  if (normalizedResource === "companies" && action === "search") return companiesSearch(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "list") return listsList(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "create") return listsCreate(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "show") return listsShow(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "update") return listsUpdate(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "delete") return listsDelete(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "prospects") return listProspects(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "add-prospects") return listsAddProspects(rest, context, { accountOverride });
  if (normalizedResource === "lists" && action === "remove-prospects") return listsRemoveProspects(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "list") return motionsList(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "show") return motionsShow(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "status") return motionsStatus(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "prospects") return motionsProspects(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "add-prospects") return motionsAddProspects(rest, context, { accountOverride });
  if (normalizedResource === "motions" && action === "create") return motionsCreate(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "list") return prospectsList(rest, context, { accountOverride });
  if (normalizedResource === "prospects" && action === "show") return prospectsShow(rest, context, { accountOverride });
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
  if (normalizedResource === "prospects" && action === "import-status") return prospectsImportStatus(rest, context, { accountOverride });
  if (normalizedResource === "tools" && action === "get") return toolsGet(rest, context, { accountOverride });
  if (normalizedResource === "operator" && action === "queue") return operatorQueue(rest, context, { accountOverride });
  if (normalizedResource === "operator" && action === "next") return operatorNext(rest, context, { accountOverride });
  if (normalizedResource === "operator" && action === "outcome") return operatorOutcome(rest, context, { accountOverride });
  if (normalizedResource === "analytics" && ["prospects", "prospect"].includes(action)) return analyticsProspects(rest, context, { accountOverride });
  if (normalizedResource === "analytics" && ["visibility", "visops"].includes(action)) return analyticsVisibility(rest, context, { accountOverride });
  if (normalizedResource === "analytics" && action === "content") return analyticsContent(rest, context, { accountOverride });

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

function normalizeTopicParts(parts) {
  if (parts[0] === "plays") return ["motions", ...parts.slice(1)];
  if (parts[0] === "principals") return ["users", ...parts.slice(1)];
  return parts;
}

function normalizeResource(resource) {
  if (resource === "principals") return "users";
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
    accountName: config.accountName || null
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
    accountName: account.name
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

async function listsList(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError("Usage: audienti lists list [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const lists = await client.lists(accountId);
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

async function offersList(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError("Usage: audienti offers list [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const offers = await client.offers(accountId);
  if (values.json) return writeJson(context.stdout, offers);

  renderOffers(offers, context);
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

async function icpsList(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError("Usage: audienti icps list [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const icps = await client.icps(accountId);
  if (values.json) return writeJson(context.stdout, icps);

  renderIcps(icps, context);
}

async function icpsCreate(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    payload: { type: "string" },
    name: { type: "string" },
    notes: { type: "string" },
    "discovery-keyword": { type: "string" }
  });
  if (positionals.length > 0) {
    throw new CommandError("Usage: audienti icps create (--name <text> [--notes <text>] [--discovery-keyword <text>] | --payload <file.json>) [--json] [--account <acct_id>]");
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const icpPayload = await icpCreatePayload(values);
  const icp = await client.createIcp(accountId, { icp: icpPayload });
  if (values.json) return writeJson(context.stdout, icp);

  writeLine(context.stdout, `Created ICP ${display(icp?.name)} (${display(icp?.prefix_id)}).`);
  if (icp?.notes) writeLine(context.stdout, `Notes: ${icp.notes}`);
  if (icp?.discovery_keyword) writeLine(context.stdout, `Discovery keyword: ${icp.discovery_keyword}`);
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

async function listsCreate(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    name: { type: "string" },
    description: { type: "string" },
    "campaign-hook": { type: "string" },
    "audience-note": { type: "string" }
  });
  if (positionals.length > 0 || !values.name) {
    throw new CommandError("Usage: audienti lists create --name <text> [--description <text>] [--campaign-hook <text>] [--audience-note <text>] [--json] [--account <acct_id>]");
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
    "campaign-hook": { type: "string" },
    "audience-note": { type: "string" }
  });
  const hasCampaignUpdate = values["campaign-hook"] || values["audience-note"];
  const hasUpdateField = values.name || values.description || hasCampaignUpdate;
  if (positionals.length !== 1 || !hasUpdateField) {
    throw new CommandError("Usage: audienti lists update <list_id> [--name <text>] [--description <text>] [--campaign-hook <text>] [--audience-note <text>] [--json] [--account <acct_id>]");
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
      campaign_brief: Object.keys(campaignBrief).length > 0 ? campaignBrief : undefined
    })
  });
  if (values.json) return writeJson(context.stdout, payload);

  writeLine(context.stdout, `Updated list ${display(payload?.name)} (${display(payload?.prefix_id)}).`);
  if (payload?.description) writeLine(context.stdout, `Description: ${payload.description}`);
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
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length > 0) throw new CommandError("Usage: audienti motions list [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const motions = await client.motions(accountId);
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
  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const { payload, rejected } = await performBulkMutation(() =>
    client.addMotionProspects(accountId, motionId, compactObject({
      prospect_ids: prospectIds,
      assigned_user_id: values["assigned-user"]
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

async function prospectsList(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
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
  });
  if (positionals.length > 0) throw new CommandError("Usage: audienti prospects list [--json] [filters] [--account <acct_id>]");
  if (values.csv && values.json) throw new CommandError("Choose one output format: use either --csv or --json.");
  if (values.page && values.offset) throw new CommandError("Choose one pagination mode: use either --page or --offset.");
  if (values.all && (values.page || values.offset)) throw new CommandError("--all cannot be combined with --page or --offset.");
  if (values.motion && values.play) throw new CommandError("Choose one motion filter: use either --motion or --play.");
  if (values.company && values["company-profile"]) throw new CommandError("Choose one company filter: use either --company or --company-profile.");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const query = compactObject({
    query: values.query,
    company: values.company,
    company_profile_id: values["company-profile"],
    motion_id: values.motion,
    play_id: values.play,
    list_id: values.list,
    stage: values.stage,
    assigned_user_id: values["assigned-user"],
    limit: values.limit,
    offset: values.offset,
    page: values.page,
    include_profiles: values.profiles
  });
  const payload = values.all ?
    await fetchAllProspects(client, accountId, query, { totalLimit: parseProspectTotalLimit(values.limit) }) :
    await client.prospects(accountId, query);
  if (values.json) return writeJson(context.stdout, payload);
  if (values.csv) return writeLine(context.stdout, prospectsToCsv(payload?.prospects || []));

  renderProspects(payload, context, { wide: values.wide || values.all, profiles: values.profiles });
}

async function prospectsShow(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, jsonOptions());
  if (positionals.length !== 1) throw new CommandError("Usage: audienti prospects show <prsp_id> [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const prospect = await client.prospect(accountId, positionals[0]);
  if (values.json) return writeJson(context.stdout, prospect);

  renderProspect(prospect, context);
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
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    "connection-state": { type: "string" }
  });

  if (positionals.length !== 1) {
    throw new CommandError("Usage: audienti prospects sequence-preview <prsp_id> [--json] [--connection-state <state>] [--account <acct_id>]");
  }

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.prospectSequencePreview(accountId, positionals[0], compactObject({
    connection_state: values["connection-state"]
  }));
  if (values.json) return writeJson(context.stdout, payload);

  renderProspectSequencePreview(payload, context);
}

async function prospectsSequenceExport(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, {
    ...jsonOptions(),
    csv: { type: "boolean" },
    branch: { type: "string" },
    branches: { type: "string" },
    "angle-index": { type: "string" }
  });
  if (positionals.length !== 1) {
    throw new CommandError("Usage: audienti prospects sequence-export <prsp_id> [--json|--csv] [--branch <both|no-accept|accepted>] [--account <acct_id>]");
  }
  if (values.csv && values.json) throw new CommandError("Choose one output format: use either --csv or --json.");
  if (values.branch && values.branches) throw new CommandError("Choose one branch filter: use either --branch or --branches.");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.prospectSequenceExport(accountId, positionals[0], compactObject({
    branches: values.branches || values.branch,
    angle_index: values["angle-index"]
  }));
  if (values.json) return writeJson(context.stdout, payload);
  if (values.csv) return writeLine(context.stdout, sequenceExportRowsToCsv(payload?.rows || []));

  renderProspectSequenceExport(payload, context);
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

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.prospectImport(accountId, compactObject({
    linkedin_url: positionals[0],
    list_id: values.list,
    motion_id: values.motion,
    assigned_user_id: values["assigned-user"]
  }));
  if (values.json) return writeJson(context.stdout, payload);

  renderProspectImportStarted(payload, context);
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

async function operatorQueue(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, operatorFilterOptions());
  if (positionals.length > 0) throw new CommandError("Usage: audienti operator queue [--json] [filters] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.operatorQueue(accountId, operatorQuery(values));
  if (values.json) return writeJson(context.stdout, payload);

  renderOperatorQueue(payload, context);
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
  const { values, positionals } = parseCommandArgs(args, analyticsOptions());
  if (positionals.length > 0) throw new CommandError("Usage: audienti analytics prospects [--window 24h] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.analyticsProspects(accountId, analyticsQuery(values));
  if (values.json) return writeJson(context.stdout, payload);

  renderAnalyticsProspects(payload, context);
}

async function analyticsVisibility(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, analyticsOptions());
  if (positionals.length > 0) throw new CommandError("Usage: audienti analytics visibility [--window 24h] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.analyticsVisibility(accountId, analyticsQuery(values));
  if (values.json) return writeJson(context.stdout, payload);

  renderAnalyticsVisibility(payload, context);
}

async function analyticsContent(args, context, { accountOverride } = {}) {
  const { values, positionals } = parseCommandArgs(args, analyticsOptions());
  if (positionals.length > 0) throw new CommandError("Usage: audienti analytics content [--window 24h] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]");

  const { client, accountId } = await requireAccountContext(context, { accountOverride });
  const payload = await client.analyticsContent(accountId, analyticsQuery(values));
  if (values.json) return writeJson(context.stdout, payload);

  renderAnalyticsContent(payload, context);
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

function analyticsQuery(values) {
  return compactObject({
    window: values.window,
    account_user_id: values.user
  });
}

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
  );
}

async function icpCreatePayload(values) {
  if (values.payload) {
    if (values.name || values.notes || values["discovery-keyword"]) {
      throw new CommandError("Choose one ICP input mode: either --payload <file.json> or the simple --name/--notes/--discovery-keyword flags.");
    }

    return readJsonPayload(values.payload);
  }

  if (!values.name) {
    throw new CommandError("Usage: audienti icps create (--name <text> [--notes <text>] [--discovery-keyword <text>] | --payload <file.json>) [--json] [--account <acct_id>]");
  }

  return compactObject({
    name: values.name,
    notes: values.notes,
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

function writeLine(stream, text = "") {
  stream.write(`${text}\n`);
}

function writeJson(stream, value) {
  writeLine(stream, JSON.stringify(value, null, 2));
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
  if (list?.description) writeLine(context.stdout, `Description: ${list.description}`);
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

function renderIcps(icps, context) {
  if (!Array.isArray(icps) || icps.length === 0) return writeLine(context.stdout, "No ICPs found.");

  writeLine(context.stdout, "ICP ID\tNAME\tDISCOVERY KEYWORD\tAGENT");
  for (const icp of icps) {
    writeLine(
      context.stdout,
      [
        display(icp.prefix_id),
        display(icp.name),
        display(icp.discovery_keyword),
        display(icp.agent?.name)
      ].join("\t")
    );
  }
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

  writeLine(context.stdout, "MOTION ID\tSTATUS\tKIND\tNAME");
  for (const motion of motions) {
    writeLine(context.stdout, `${display(motion.prefix_id)}\t${display(motion.status)}\t${display(motion.kind)}\t${display(motion.name)}`);
  }
}

function renderMotion(motion, context) {
  writeLine(context.stdout, `Motion: ${display(motion?.name)} (${display(motion?.prefix_id)})`);
  writeLine(context.stdout, `Status: ${display(motion?.status)}`);
  writeLine(context.stdout, `Kind: ${display(motion?.kind)}`);
  if (motion?.offer?.name) writeLine(context.stdout, `Offer: ${motion.offer.name} (${display(motion.offer.prefix_id)})`);
  if (motion?.icp?.name) writeLine(context.stdout, `ICP: ${motion.icp.name} (${display(motion.icp.prefix_id)})`);
  if (motion?.list?.name) writeLine(context.stdout, `List: ${motion.list.name} (${display(motion.list.prefix_id)})`);
  if (motion?.principal_account_user?.id) {
    writeLine(
      context.stdout,
      `Principal: ${display(motion.principal_account_user.name || motion.principal_account_user.email)} (${display(motion.principal_account_user.id)})`
    );
  }
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

function renderProspect(prospect, context) {
  writeLine(context.stdout, `Prospect: ${display(prospect?.display_name || prospect?.name)} (${display(prospect?.prefix_id)})`);
  if (prospect?.company) writeLine(context.stdout, `Company: ${prospect.company}`);
  if (prospect?.title) writeLine(context.stdout, `Title: ${prospect.title}`);
  if (prospect?.linkedin_url) writeLine(context.stdout, `LinkedIn: ${prospect.linkedin_url}`);
  if (prospect?.account_prospect?.pipeline_stage) writeLine(context.stdout, `Stage: ${prospect.account_prospect.pipeline_stage}`);
  if (nextActionLabel(prospect?.queue)) writeLine(context.stdout, `Next action: ${nextActionLabel(prospect.queue)}`);
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

function renderProspectSequencePreview(payload, context) {
  const prospect = payload?.prospect || {};
  const report = payload?.report || {};
  const preview = report?.last_preview || {};
  const selected = report?.selected || {};
  const summary = report?.summary || {};
  const steps = Array.isArray(report?.steps) ? report.steps : [];
  const contextInfo = payload?.context || {};

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

  steps.forEach((step, index) => {
    const kind = display(step.kind).toUpperCase();
    const stage = display(step.stage);
    const channel = display(step.channel);
    const timing = step?.timing?.mode === "scheduled" ? ` [scheduled ${display(step?.timing?.scheduled_for)}]` : "";
    writeLine(context.stdout, `${index + 1}. ${kind} | ${stage} | ${channel}${timing}`);

    if (step.disposition) writeLine(context.stdout, `   Disposition: ${step.disposition}`);
    if (step.transition_label) writeLine(context.stdout, `   Transition: ${step.transition_label}`);
    if (step.rationale) writeLine(context.stdout, `   Why: ${step.rationale}`);
    if (step.guidance) writeLine(context.stdout, `   Guidance: ${step.guidance}`);
    if (step.body) writeLine(context.stdout, `   Body: ${step.body}`);
    if (step.empty_body_reason) writeLine(context.stdout, `   Empty body reason: ${step.empty_body_reason}`);
    if (step.missing_reason) writeLine(context.stdout, `   Missing reason: ${step.missing_reason}`);
  });
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

  writeLine(context.stdout, "MOVE ID\tKIND\tPROSPECT\tMOTION\tNEXT ACTION");
  for (const row of queue) {
    writeLine(context.stdout, operatorRowLine(row));
  }
}

function renderOperatorNext(row, context) {
  if (!row) return writeLine(context.stdout, "No operator moves found.");

  writeLine(context.stdout, "MOVE ID\tKIND\tPROSPECT\tMOTION\tNEXT ACTION");
  writeLine(context.stdout, operatorRowLine(row));
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

function renderAnalyticsProspects(payload, context) {
  writeLine(context.stdout, `Prospect analytics (${analyticsWindowLabel(payload)})`);
  writeAnalyticsScope(payload, context);
  writeLine(context.stdout, `Prospects added: ${display(payload?.prospects_added_count, 0)}`);
  writeAnalyticsActionSummary(payload?.actions, context, "Actions");
  writeCountTable(context, "Action breakdown", payload?.actions?.breakdown, ["ACTION", "COUNT", "AUTOMATED", "AUTO %"], actionBreakdownRow);
  writeCountTable(context, "Queue stages", payload?.queue_stages, ["STAGE", "COUNT"], countRow);
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
  if (payload?.account_user) {
    writeLine(context.stdout, `User: ${entityLabel(payload.account_user)}`);
  } else {
    writeLine(context.stdout, "User: all account users");
  }
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

  writeLine(context.stdout, headers.join("\t"));
  for (const row of list) writeLine(context.stdout, mapRow(row).join("\t"));
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

function analyticsWindowLabel(payload) {
  const window = payload?.window || {};
  const key = display(window.key, "24h");
  if (!window.started_at || !window.ended_at) return key;

  return `${key}: ${window.started_at} to ${window.ended_at}`;
}

function percentageLabel(value) {
  return value === undefined || value === null || value === "" ? "n/a" : `${value}%`;
}

function operatorRowLine(row) {
  return [
    display(row?.id),
    display(row?.opportunity_kind),
    display(row?.prospect?.display_name || row?.prospect?.name || row?.profile?.display_name),
    display(row?.motion?.name),
    display(nextActionLabel(row))
  ].join("\t");
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
    "Start here for local agents:",
    "  audienti help agent-workflows",
    "",
    "Implemented commands:",
    "  audienti auth token <token> [--host <url>]",
    "  audienti auth status",
    "  audienti auth logout",
    "  audienti config list [--json]",
    "  audienti accounts list [--json]",
    "  audienti accounts select <acct_id>",
    "  audienti users list [--json]",
    "  audienti offers list [--json]",
    "  audienti offers create --name <text> [--json]",
    "  audienti icps list [--json]",
    "  audienti icps create (--name <text> | --payload <file.json>) [--json]",
    "  audienti companies search --query <text> [--json]",
    "  audienti lists list [--json]",
    "  audienti lists create --name <text> [--json]",
    "  audienti lists show <list_id> [--json]",
    "  audienti lists update <list_id> [--json]",
    "  audienti lists delete <list_id> --confirm <yes|true|Y|y> [--json]",
    "  audienti lists prospects <list_id> [--json]",
    "  audienti lists add-prospects <list_id> <prsp_id> [prsp_id...] [--json]",
    "  audienti lists remove-prospects <list_id> <prsp_id> [prsp_id...] [--json]",
    "  audienti motions list [--json]",
    "  audienti motions show <motn_id> [--json]",
    "  audienti motions status <motn_id> [--json]",
    "  audienti motions prospects <motn_id> [--json]",
    "  audienti motions add-prospects <motn_id> <prsp_id> [prsp_id...] [--json]",
    "  audienti motions create --payload <file.json> [--json]",
    "  audienti prospects list [--json]",
    "  audienti prospects show <prsp_id> [--json]",
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
    "  audienti prospects import-status <primp_id> [--json]",
    "  audienti tools get <email|phone> --url <linkedin_url> [--json]",
    "  audienti operator next [--json|--plan|--done|--skip|--fail|--return]",
    "  audienti operator queue [--json]",
    "  audienti operator outcome <row_id> --payload <file.json> [--json]",
    "  audienti analytics prospects [--window 24h] [--user <account_user_id|email|name|me>] [--json]",
    "  audienti analytics visibility [--window 24h] [--user <account_user_id|email|name|me>] [--json]",
    "  audienti analytics content [--window 24h] [--user <account_user_id|email|name|me>] [--json]",
    "",
    "Planned submit-shape help topics:",
    "  audienti prospects disposition help",
    "",
    "Global options:",
    "  --account <acct_id>  Use an account for one command without saving it",
    "  --help, -h           Show help",
    "",
    "Run `audienti <command> help` for accepted options, examples, and payload shapes."
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
    "  Active account: account name and acct_ id, or none selected"
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
    "  Active account: account name and acct_ id, or none selected"
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
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  List the account users that can be used as motion principals or assignees.",
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

  ["offers", [
    "Usage:",
    "  audienti offers list [--json]",
    "  audienti offers create --name <text> [--json]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  List the offers available to the current account so an agent can choose offer_id for motion creation."
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

  ["icps", [
    "Usage:",
    "  audienti icps list [--json]",
    "  audienti icps create (--name <text> | --payload <file.json>) [--json]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  List the ICPs available to the current account so an agent can choose icp_id for motion creation or targeting work."
  ].join("\n")],

  ["icps list", [
    "Usage:",
    "  audienti icps list [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "API:",
    "  GET /api/v1/accounts/:account_id/icps.json",
    "",
    "Output shape:",
    "  id: integer",
    "  prefix_id: icpp_",
    "  name: string",
    "  notes: string | null",
    "  discovery_keyword: string | null",
    "  agent: { id, name } | null"
  ].join("\n")],

  ["icps create", [
    "Usage:",
    "  audienti icps create (--name <text> [--notes <text>] [--discovery-keyword <text>] | --payload <file.json>) [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Create a new account ICP that can be attached to a motion or reused for targeting work.",
    "",
    "Input shape:",
    "  name: string  Required ICP name",
    "  notes: string | optional",
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
    "      \"discovery_keyword\": \"renewal\"",
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

  ["lists", [
    "Usage:",
    "  audienti lists list [--json]",
    "  audienti lists create --name <text> [--json]",
    "  audienti lists show <list_id> [--json]",
    "  audienti lists update <list_id> [--json]",
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
    "  audienti lists list [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
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
    "  hubspot_synced: boolean"
  ].join("\n")],

  ["lists create", [
    "Usage:",
    "  audienti lists create --name <text> [--description <text>] [--campaign-hook <text>] [--audience-note <text>] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Purpose:",
    "  Create a new list so an agent can build prospect membership from zero.",
    "",
    "Input shape:",
    "  name: string  Required list name",
    "  description: string | optional",
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
    "  audienti lists update <list_id> [--name <text>] [--description <text>] [--campaign-hook <text>] [--audience-note <text>] [--json] [--account <acct_id>]",
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
    "  list.campaign_brief.hook: string | optional",
    "  list.campaign_brief.audience_note: string | optional",
    "",
    "API:",
    "  PATCH /api/v1/accounts/:account_id/lists/:id.json"
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
    "  audienti motions list [--json]",
    "  audienti motions show <motn_id> [--json]",
    "  audienti motions status <motn_id> [--json]",
    "  audienti motions prospects <motn_id> [--json]",
    "  audienti motions add-prospects <motn_id> <prsp_id> [prsp_id...] [--json]",
    "  audienti motions create --payload <file.json> [--json]",
    "",
    "Status: read, create, status, and prospect attachment commands implemented",
    "",
    "CLI synonym:",
    "  `plays` is accepted anywhere `motions` is accepted",
    "",
    "ID shape:",
    "  motn_id: motn_ prefix id"
  ].join("\n")],

  ["motions list", [
    "Usage:",
    "  audienti motions list [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
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
    "  principal_account_user.id: integer"
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
    "  inbound_channels: [linkedin | reddit | x | tiktok | instagram | facebook] | optional",
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
    "    \"list_id\": \"list_abc123\"",
    "  }",
    "",
    "Behavior:",
    "  The API calls Motions::Setup and the managed graph provisioner. If principal_account_user_id is omitted, the authenticated account user is used.",
    "  Use `audienti offers list`, `audienti icps list`, and `audienti users list` to resolve valid ids before calling this command."
  ].join("\n")],

  ["prospects", [
    "Usage:",
    "  audienti prospects list [--json] [filters]",
    "  audienti prospects show <prsp_id> [--json]",
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
    "  audienti prospects import-status <primp_id> [--json]",
    "",
    "Status: read commands, per-prospect draft preview, sequence preview, and import implemented; disposition planned",
    "",
    "Filters:",
    "  --query <text>",
    "  --company <text>",
    "  --company-profile <prof_id|citation_id>",
    "  --motion <motn_id>",
    "  --play <motn_id>",
    "  --list <list_id>",
    "  --stage <stage>",
    "  --assigned-user <account_user_id|me>",
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
    "  --assigned-user <id|me>         Filter by assigned account user",
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
    "  audienti prospects list --all --csv"
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

  ["prospects sequence-export", [
    "Usage:",
    "  audienti prospects sequence-export <prsp_id> [--json|--csv] [--branch <both|no-accept|accepted>] [--angle-index <n>] [--account <acct_id>]",
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

  ["prospects disposition", [
    "Usage:",
    "  audienti prospects disposition <prsp_id> --payload <file.json> [--account <acct_id>]",
    "",
    "Status: planned",
    "",
    "Input shape:",
    "  action: defer | nurture | reject | restore",
    "  reason: string | optional",
    "  delay_until: ISO8601 datetime | optional",
    "  note: string | optional",
    "",
    "JSON example:",
    "  {",
    "    \"action\": \"nurture\",",
    "    \"reason\": \"not_a_fit\",",
    "    \"note\": \"Not a fit for this motion right now.\"",
    "  }"
  ].join("\n")],

  ["tools", [
    "Usage:",
    "  audienti tools get <email|phone> --url <linkedin_url> [--json]",
    "",
    "Status: implemented",
    "",
    "Commands:",
    "  audienti tools get  Run a LinkedIn URL through the existing import and contact-enrichment pipeline, then return the first selected email or phone."
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

  ["operator", [
    "Usage:",
    "  audienti operator next [--json|--plan|--done|--skip|--fail|--return]",
    "  audienti operator queue [--json]",
    "  audienti operator outcome <row_id> --payload <file.json>",
    "",
    "Status: read commands and prospect next-move writeback implemented",
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
    "  audienti analytics prospects [--window 24h] [--user <account_user_id|email|name|me>] [--json]",
    "  audienti analytics visibility [--window 24h] [--user <account_user_id|email|name|me>] [--json]",
    "  audienti analytics visops [--window 24h] [--user <account_user_id|email|name|me>] [--json]",
    "  audienti analytics content [--window 24h] [--user <account_user_id|email|name|me>] [--json]",
    "",
    "Status: implemented",
    "",
    "Window:",
    "  --window <24h|7d|1w|day|week>",
    "  --user <account_user_id|email|name|me>  Narrow analytics to one account user. Email/name partials are accepted when they match exactly one account user.",
    "",
    "Output:",
    "  Account-scoped analytics for prospects, visibility engagement, and ContentOps publishing."
  ].join("\n")],

  ["analytics prospects", [
    "Usage:",
    "  audienti analytics prospects [--window 24h] [--user <account_user_id|email|name|me>] [--json] [--account <acct_id>]",
    "",
    "Status: implemented",
    "",
    "Output shape:",
    "  prospects_added_count: account prospects added in the window",
    "  account_user: selected account user when --user is provided, otherwise null",
    "  actions: outbound action totals, type breakdown, and automated percentage",
    "  queue_stages[]: current account prospect stage counts",
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
    "  audienti offers list",
    "  audienti icps list",
    "",
    "2. Create a motion or play",
    "  audienti motions create --payload <file.json>",
    "  audienti motions status <motn_id>",
    "",
    "3. Add a new prospect from LinkedIn and poll enrichment",
    "  audienti lists create --name \"Target list\"",
    "  audienti prospects import https://www.linkedin.com/in/example --list <list_id> --assigned-user me",
    "  audienti prospects import-status <primp_id>",
    "  audienti prospects show <prsp_id>",
    "  audienti tools get email --url https://www.linkedin.com/in/example",
    "",
    "4. Find an existing prospect and inspect next step",
    "  audienti prospects list --query \"name or company\" --wide",
    "  audienti companies search --query \"Honeywell\"",
    "  audienti prospects list --company-profile <prof_id>",
    "  audienti prospects show <prsp_id>",
    "  audienti prospects timeline <prsp_id> --types post,comment,reaction --json",
    "  audienti prospects message-types <prsp_id>",
    "  audienti prospects add-profile <prsp_id> --url prospect@example.com",
    "  audienti prospects report-bad-profile <prsp_id> <prof_id>",
    "  audienti prospects add-note <prsp_id> --type steer --message \"Meeting will not happen\" --engagement-type action.meeting.canceled",
    "  audienti prospects sequence-preview <prsp_id>",
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
    "  audienti operator outcome <row_id> --payload <file.json>",
    "",
    "7. Inspect account analytics",
    "  audienti analytics prospects --window 24h",
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
    "  Prospect disposition still lacks a dedicated CLI mutation.",
    "  Operator outcome writeback is implemented for prospect rows, not visibility rows."
  ].join("\n")]
]);
