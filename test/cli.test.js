import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { readConfig, writeConfig } from "../src/config.js";
import { run } from "../src/cli.js";
import { captureStream, createFetch, jsonResponse, withTempConfigHome } from "./helpers.js";

test("global help lists commands and points agents at command-specific shapes", async () => {
  const stdout = captureStream();
  const stderr = captureStream();

  const exitCode = await run(["--help"], { stdout, stderr });

  assert.equal(exitCode, 0);
  assert.match(stdout.output, /Usage:/);
  assert.match(stdout.output, /Start:/);
  assert.match(stdout.output, /Work areas:/);
  assert.match(stdout.output, /Setup & identity/);
  assert.match(stdout.output, /audienti update check/);
  assert.match(stdout.output, /Motions \/ plays/);
  assert.match(stdout.output, /Prospects/);
  assert.match(stdout.output, /Lists & targeting inputs/);
  assert.match(stdout.output, /Writer/);
  assert.match(stdout.output, /Operator queue/);
  assert.match(stdout.output, /Analytics/);
  assert.match(stdout.output, /Utilities/);
  assert.match(stdout.output, /audienti help agent-workflows/);
  assert.match(stdout.output, /audienti users select <user>/);
  assert.match(stdout.output, /audienti operator next --plan/);
  assert.match(stdout.output, /audienti motions analytics <motn_id>/);
  assert.match(stdout.output, /audienti motions run-discovery <motn_id>/);
  assert.match(stdout.output, /audienti motions update <motn_id> \[--status <state>\] \[--tags <tag\[,tag\.\.\.\]>\] \[--own-post-engagement <true\|false>\]/);
  assert.match(stdout.output, /audienti motions add-tag <motn_id> <tag>/);
  assert.match(stdout.output, /audienti motions activate <motn_id>/);
  assert.match(stdout.output, /audienti motions pause <motn_id>/);
  assert.match(stdout.output, /audienti motions delete <motn_id> --confirm <yes\|true\|Y\|y>/);
  assert.match(stdout.output, /audienti motions clone <motn_id> --name <text>/);
  assert.match(stdout.output, /audienti tags list/);
  assert.match(stdout.output, /audienti offers show <offr_id>/);
  assert.match(stdout.output, /audienti offers delete <offr_id> --confirm <yes\|true\|Y\|y>/);
  assert.match(stdout.output, /audienti icps show <icp_id>/);
  assert.match(stdout.output, /audienti icps add-tag <icp_id> <tag>/);
  assert.match(stdout.output, /audienti prospects reject <prsp_id>/);
  assert.match(stdout.output, /audienti prospects nurture <prsp_id>/);
  assert.match(stdout.output, /audienti prospects restore <prsp_id>/);
  assert.match(stdout.output, /audienti prospects set-status <prsp_id> --status <active\|nurture\|non_responsive\|not_fit\|rejected>/);
  assert.match(stdout.output, /audienti prospects lock <prsp_id>/);
  assert.match(stdout.output, /audienti prospects unlock <prsp_id>/);
  assert.match(stdout.output, /audienti analytics prospects cohort-analysis --weeks 4 --motion <motn_id>/);
  assert.match(stdout.output, /audienti analytics dashboard --play-tag <tag>/);
  assert.match(stdout.output, /audienti analytics users --user me --window 30d/);
  assert.match(stdout.output, /audienti content programs/);
  assert.match(stdout.output, /audienti content approve <cpwi_id>/);
  assert.match(stdout.output, /audienti content comments/);
  assert.match(stdout.output, /audienti prospects add-profile <prsp_id> --url <profile_url\|email\|phone>/);
  assert.match(stdout.output, /More help:/);
  assert.match(stdout.output, /audienti <area> <command> help/);
  assert.equal(stderr.output, "");
});

test("bare command prints global help without an error prefix", async () => {
  const stdout = captureStream();
  const stderr = captureStream();

  const exitCode = await run([], { stdout, stderr });

  assert.equal(exitCode, 0);
  assert.match(stdout.output, /Usage:/);
  assert.match(stdout.output, /audienti <command> \[options\]/);
  assert.equal(stderr.output, "");
});

test("command help documents accepted options without calling the api", async () => {
  const stdout = captureStream();
  const fetch = createFetch(() => {
    throw new Error("help must not call the API");
  });

  const exitCode = await run(["auth", "token", "help"], { stdout, fetch });

  assert.equal(exitCode, 0);
  assert.match(stdout.output, /Usage:\n  audienti auth token <token>/);
  assert.match(stdout.output, /--host <url>/);
  assert.match(stdout.output, /Input shape:/);
});

test("update check reports current when the registry version matches", async () => {
  const stdout = captureStream();
  const packageVersion = await currentPackageVersion();
  const fetch = createFetch((url) => {
    assert.equal(url.toString(), "https://registry.example.test/%40audienti%2Fcli/latest");
    return jsonResponse({ version: packageVersion });
  });

  const exitCode = await run(["update", "check", "--registry", "https://registry.example.test"], {
    stdout,
    fetch,
    now: () => new Date("2026-07-16T12:00:00.000Z")
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.output, /Package: @audienti\/cli/);
  assert.match(stdout.output, new RegExp(`Current version: ${escapeRegex(packageVersion)}`));
  assert.match(stdout.output, new RegExp(`Latest version: ${escapeRegex(packageVersion)}`));
  assert.match(stdout.output, /Status: current/);
});

test("update check returns parseable update availability", async () => {
  const stdout = captureStream();
  const fetch = createFetch(() => jsonResponse({ version: "99.0.0" }));

  const exitCode = await run(["update", "check", "--json"], {
    stdout,
    fetch,
    now: () => new Date("2026-07-16T12:00:00.000Z")
  });

  assert.equal(exitCode, 0);
  const payload = JSON.parse(stdout.output);
  assert.equal(payload.kind, "update_check");
  assert.equal(payload.package_name, "@audienti/cli");
  assert.equal(payload.current_version, await currentPackageVersion());
  assert.equal(payload.latest_version, "99.0.0");
  assert.equal(payload.update_available, true);
  assert.equal(payload.status, "update_available");
  assert.equal(payload.install_command, "npm install --global @audienti/cli");
  assert.equal(payload.checked_at, "2026-07-16T12:00:00.000Z");
});

test("update check returns unknown when the registry cannot be queried", async () => {
  const stdout = captureStream();
  const fetch = createFetch(() => jsonResponse({ error: "registry unavailable" }, { status: 503 }));

  const exitCode = await run(["update", "check", "--json"], {
    stdout,
    fetch,
    now: () => new Date("2026-07-16T12:00:00.000Z")
  });

  assert.equal(exitCode, 1);
  const payload = JSON.parse(stdout.output);
  assert.equal(payload.status, "unknown");
  assert.equal(payload.update_available, null);
  assert.equal(payload.latest_version, null);
  assert.equal(payload.error, "registry unavailable");
});

async function currentPackageVersion() {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  return packageJson.version;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("help topics describe submit payload shapes for implemented mutations", async () => {
  const stdout = captureStream();

  const exitCode = await run(["motions", "create", "help"], { stdout });

  assert.equal(exitCode, 0);
  assert.match(stdout.output, /Status: implemented/);
  assert.match(stdout.output, /Input shape:/);
  assert.match(stdout.output, /name: string/);
  assert.match(stdout.output, /premise: string/);
  assert.match(stdout.output, /offer_id: offr_/);
  assert.match(stdout.output, /principal_account_user_id: integer/);
  assert.match(stdout.output, /inbound_channels: \[linkedin \| reddit\]/);
  assert.doesNotMatch(stdout.output, /instagram|facebook|tiktok/);
});

test("agent workflow help gives local agents common production paths", async () => {
  const stdout = captureStream();

  const exitCode = await run(["help", "agent-workflows"], { stdout });

  assert.equal(exitCode, 0);
  assert.match(stdout.output, /Authenticate and select an account/);
  assert.match(stdout.output, /audienti users list/);
  assert.match(stdout.output, /audienti users select me/);
  assert.match(stdout.output, /audienti offers list/);
  assert.match(stdout.output, /audienti icps list/);
  assert.match(stdout.output, /audienti motions create --payload <file\.json>/);
  assert.match(stdout.output, /audienti motions activate <motn_id>/);
  assert.match(stdout.output, /audienti motions pause <motn_id>/);
  assert.match(stdout.output, /audienti prospects import https:\/\/www\.linkedin\.com\/in\/example/);
  assert.match(stdout.output, /audienti motions add-prospects <motn_id> <prsp_id>/);
  assert.match(stdout.output, /audienti prospects add-profile <prsp_id> --url prospect@example.com/);
  assert.match(stdout.output, /audienti prospects report-bad-profile <prsp_id> <prof_id>/);
  assert.match(stdout.output, /audienti prospects set-status <prsp_id> --status not_fit/);
  assert.match(stdout.output, /audienti prospects lock <prsp_id> --note "Emergency hold"/);
  assert.match(stdout.output, /audienti prospects reject <prsp_id>/);
  assert.match(stdout.output, /audienti prospects nurture <prsp_id>/);
  assert.match(stdout.output, /audienti prospects restore <prsp_id>/);
  assert.match(stdout.output, /audienti prospects unlock <prsp_id>/);
  assert.match(stdout.output, /audienti operator next --plan/);
  assert.match(stdout.output, /audienti analytics prospects --window 24h/);
  assert.match(stdout.output, /audienti analytics users --user me --window 30d/);
  assert.match(stdout.output, /audienti analytics visibility --window 24h --user me/);
  assert.match(stdout.output, /audienti analytics content --window week/);
  assert.match(stdout.output, /Current gaps to plan around:/);
  assert.doesNotMatch(stdout.output, /Prospect disposition still lacks/);
  assert.doesNotMatch(stdout.output, /Motion creation still lacks a live CLI mutation/);
});

test("resource help lists child commands", async () => {
  const stdout = captureStream();

  const exitCode = await run(["prospects", "--help"], { stdout });

  assert.equal(exitCode, 0);
  assert.match(stdout.output, /audienti prospects list/);
  assert.match(stdout.output, /audienti prospects check/);
  assert.match(stdout.output, /audienti prospects show <prsp_id>/);
  assert.match(stdout.output, /audienti prospects set-status <prsp_id>/);
  assert.match(stdout.output, /audienti prospects lock <prsp_id>/);
  assert.match(stdout.output, /audienti prospects unlock <prsp_id>/);
  assert.match(stdout.output, /audienti prospects reject <prsp_id>/);
  assert.match(stdout.output, /audienti prospects nurture <prsp_id>/);
  assert.match(stdout.output, /audienti prospects restore <prsp_id>/);
  assert.match(stdout.output, /audienti prospects timeline <prsp_id>/);
  assert.match(stdout.output, /audienti prospects message-types <prsp_id>/);
  assert.match(stdout.output, /audienti prospects write <prsp_id> --type <surface_key>/);
  assert.match(stdout.output, /audienti prospects add-note <prsp_id> --message <text>/);
  assert.match(stdout.output, /audienti prospects add-steer <prsp_id> --message <text>/);
  assert.match(stdout.output, /audienti prospects add-profile <prsp_id> --url <profile_url\|email\|phone>/);
  assert.match(stdout.output, /audienti prospects report-bad-profile <prsp_id> <prof_id\|citation_id>/);
  assert.match(stdout.output, /audienti prospects sequence-preview <prsp_id>/);
  assert.match(stdout.output, /audienti prospects sequence-export <prsp_id>/);
  assert.match(stdout.output, /audienti prospects import <linkedin_url>/);
  assert.match(stdout.output, /Filters:/);
});

test("help works as the final word at resource and nested command levels", async () => {
  const cases = [
    {
      args: ["config", "help"],
      expected: [/audienti config list \[--json\]/, /local CLI config path/]
    },
    {
      args: ["users", "help"],
      expected: [/Usage:\n  audienti users list \[--json\]/, /audienti users select <account_user_id\|email\|name\|me>/]
    },
    {
      args: ["users", "list", "help"],
      expected: [/Usage:\n  audienti users list \[--json\]/, /GET \/api\/v1\/accounts\/:account_id\/users\.json/]
    },
    {
      args: ["users", "select", "help"],
      expected: [/Usage:\n  audienti users select <account_user_id\|email\|name\|me>/, /Save a default account user/]
    },
    {
      args: ["users", "activity", "help"],
      expected: [/Usage:\n  audienti users activity \[account_user_id\|me\]/, /GET \/api\/v1\/accounts\/:account_id\/operations\/users\/:user_id\/activity\.json/]
    },
    {
      args: ["offers", "help"],
      expected: [/Usage:\n  audienti offers list \[--json\]/, /choose offer_id for motion creation/]
    },
    {
      args: ["offers", "list", "help"],
      expected: [/Usage:\n  audienti offers list \[--json\]/, /GET \/api\/v1\/accounts\/:account_id\/offers\.json/]
    },
    {
      args: ["offers", "create", "help"],
      expected: [/Usage:\n  audienti offers create --name <text>/, /POST \/api\/v1\/accounts\/:account_id\/offers\.json/]
    },
    {
      args: ["offers", "show", "help"],
      expected: [/Usage:\n  audienti offers show <offr_id>/, /GET \/api\/v1\/accounts\/:account_id\/offers\/:id\.json/]
    },
    {
      args: ["offers", "update", "help"],
      expected: [/Usage:\n  audienti offers update <offr_id>/, /PATCH \/api\/v1\/accounts\/:account_id\/offers\/:id\.json/]
    },
    {
      args: ["offers", "delete", "help"],
      expected: [/Usage:\n  audienti offers delete <offr_id> --confirm <yes\|true\|Y\|y>/, /DELETE \/api\/v1\/accounts\/:account_id\/offers\/:id\.json/]
    },
    {
      args: ["icps", "help"],
      expected: [/Usage:\n  audienti icps list \[--tag <tag>\] \[--json\]/, /choose icp_id for motion creation/]
    },
    {
      args: ["icps", "list", "help"],
      expected: [/Usage:\n  audienti icps list \[--tag <tag>\] \[--json\]/, /GET \/api\/v1\/accounts\/:account_id\/icps\.json/]
    },
    {
      args: ["icps", "show", "help"],
      expected: [/Usage:\n  audienti icps show <icp_id>/, /GET \/api\/v1\/accounts\/:account_id\/icps\/:id\.json/]
    },
    {
      args: ["icps", "create", "help"],
      expected: [/Usage:\n  audienti icps create \(\--name <text> \[\--notes <text>\] \[\--discovery-keyword <text>\] \[\--tags <tag\[,tag\.\.\.\]>\] \| \-\-payload <file\.json>\)/, /POST \/api\/v1\/accounts\/:account_id\/icps\.json/]
    },
    {
      args: ["icps", "update", "help"],
      expected: [/Usage:\n  audienti icps update <icp_id>/, /PATCH \/api\/v1\/accounts\/:account_id\/icps\/:id\.json/]
    },
    {
      args: ["icps", "add-tag", "help"],
      expected: [/Usage:\n  audienti icps add-tag <icp_id> <tag>/, /POST \/api\/v1\/accounts\/:account_id\/icps\/:id\/add_tag\.json/]
    },
    {
      args: ["icps", "remove-tag", "help"],
      expected: [/Usage:\n  audienti icps remove-tag <icp_id> <tag>/, /DELETE \/api\/v1\/accounts\/:account_id\/icps\/:id\/remove_tag\.json/]
    },
    {
      args: ["companies", "help"],
      expected: [/Usage:\n  audienti companies search --query <text>/, /Returns persisted LinkedIn company profiles/]
    },
    {
      args: ["companies", "search", "help"],
      expected: [/Usage:\n  audienti companies search --query <text>/, /GET \/api\/v1\/accounts\/:account_id\/companies\.json/]
    },
    {
      args: ["dnc", "help"],
      expected: [/Usage:\n  audienti dnc list/, /account-level do-not-contact entries/]
    },
    {
      args: ["company-rules", "create", "help"],
      expected: [/Usage:\n  audienti company-rules create/, /POST \/api\/v1\/accounts\/:account_id\/company_rules\.json/]
    },
    {
      args: ["lists", "create", "help"],
      expected: [/Usage:\n  audienti lists create --name <text>/, /POST \/api\/v1\/accounts\/:account_id\/lists\.json/]
    },
    {
      args: ["lists", "update", "help"],
      expected: [/Usage:\n  audienti lists update <list_id>/, /PATCH \/api\/v1\/accounts\/:account_id\/lists\/:id\.json/]
    },
    {
      args: ["lists", "add-tag", "help"],
      expected: [/Usage:\n  audienti lists add-tag <list_id> <tag>/, /POST \/api\/v1\/accounts\/:account_id\/lists\/:id\/add_tag\.json/]
    },
    {
      args: ["lists", "remove-tag", "help"],
      expected: [/Usage:\n  audienti lists remove-tag <list_id> <tag>/, /DELETE \/api\/v1\/accounts\/:account_id\/lists\/:id\/remove_tag\.json/]
    },
    {
      args: ["tags", "help"],
      expected: [/Usage:\n  audienti tags list \[--json\]/, /shared vocabulary from ICP tags, list tags, and motion play_tags/]
    },
    {
      args: ["tags", "list", "help"],
      expected: [/Usage:\n  audienti tags list \[--json\]/, /GET \/api\/v1\/accounts\/:account_id\/tags\.json/]
    },
    {
      args: ["tags", "show", "help"],
      expected: [/Usage:\n  audienti tags show <tag>/, /GET \/api\/v1\/accounts\/:account_id\/icps\.json/]
    },
    {
      args: ["lists", "delete", "help"],
      expected: [/Usage:\n  audienti lists delete <list_id> --confirm <yes\|true\|Y\|y>/, /DELETE \/api\/v1\/accounts\/:account_id\/lists\/:id\.json/]
    },
    {
      args: ["help", "agent-workflows"],
      expected: [/audienti lists create --name "Target list"/, /audienti motions run-discovery <motn_id>/, /audienti analytics dashboard --play-tag wine_campaign/, /audienti operator outcome <row_id> --payload <file\.json>/]
    },
    {
      args: ["config", "list", "help"],
      expected: [/Usage:\n  audienti config list \[--json\]/, /Token: masked string or none/]
    },
    {
      args: ["prospects", "help"],
      expected: [/audienti prospects list/, /audienti prospects check/, /Filters:/]
    },
    {
      args: ["prospects", "check", "help"],
      expected: [/Usage:\n  audienti prospects check/, /do not have a certified company employment citation/, /app_url/]
    },
    {
      args: ["lists", "prospects", "help"],
      expected: [/Usage:\n  audienti lists prospects <list_id>/, /same row shape as `audienti prospects list`/]
    },
    {
      args: ["motions", "help"],
      expected: [/audienti motions run-discovery <motn_id>/, /audienti motions prospects <motn_id>/, /motn_ prefix id/]
    },
    {
      args: ["plays", "help"],
      expected: [/audienti motions run-discovery <motn_id>/, /audienti motions prospects <motn_id>/, /motn_ prefix id/]
    },
    {
      args: ["operator", "help"],
      expected: [/audienti operator next/, /--opportunity-kind prospect\|visibility/]
    },
    {
      args: ["operator", "next", "help"],
      expected: [/Usage:\n  audienti operator next/, /next_move\.next_action/]
    },
    {
      args: ["analytics", "help"],
      expected: [/audienti analytics prospects/, /audienti analytics dashboard/, /audienti analytics users/, /audienti analytics visops/, /--start <YYYY-MM-DD> --end <YYYY-MM-DD>/, /--window <24h\|7d\|1w\|day\|week>/, /--play-tag <tag>/, /--user <account_user_id\|email\|name\|me>/]
    },
    {
      args: ["analytics", "prospects", "help"],
      expected: [/Usage:\n  audienti analytics prospects/, /GET \/api\/v1\/accounts\/:account_id\/analytics\/prospects\.json/]
    },
    {
      args: ["analytics", "users", "help"],
      expected: [/Usage:\n  audienti analytics users/, /performed-by-others comparison/, /--platform <linkedin\|email\|gmail>/, /GET \/api\/v1\/accounts\/:account_id\/analytics\/users\.json/]
    },
    {
      args: ["analytics", "user", "help"],
      expected: [/Alias for `audienti analytics users`/]
    },
    {
      args: ["analytics", "visibility", "help"],
      expected: [/Usage:\n  audienti analytics visibility/, /unique_people_engaged_count/, /GET \/api\/v1\/accounts\/:account_id\/analytics\/visibility\.json/]
    },
    {
      args: ["analytics", "visops", "help"],
      expected: [/Alias for `audienti analytics visibility`/]
    },
    {
      args: ["analytics", "content", "help"],
      expected: [/Usage:\n  audienti analytics content/, /published_posts_count/, /GET \/api\/v1\/accounts\/:account_id\/analytics\/content\.json/]
    },
    {
      args: ["analytics", "dashboard", "help"],
      expected: [/Usage:\n  audienti analytics dashboard/, /cohort_company_target_count/, /GET \/api\/v1\/accounts\/:account_id\/analytics\/dashboard\.json/]
    },
    {
      args: ["prospects", "import", "help"],
      expected: [/Usage:\n  audienti prospects import <linkedin_url>/, /linkedin_url: url/]
    },
    {
      args: ["prospects", "import-batch", "help"],
      expected: [/Usage:\n  audienti prospects import-batch --file <csv\|jsonl\|json>/, /POST \/api\/v1\/accounts\/:account_id\/prospect_imports\.json/]
    },
    {
      args: ["prospects", "import-status", "help"],
      expected: [/Usage:\n  audienti prospects import-status <primp_id>/, /GET \/api\/v1\/accounts\/:account_id\/prospect_imports\/:id\.json/]
    },
    {
      args: ["prospects", "assign", "help"],
      expected: [/Usage:\n  audienti prospects assign <prsp_id>/, /POST \/api\/v1\/accounts\/:account_id\/prospects\/assign\.json/]
    },
    {
      args: ["prospects", "set-status", "help"],
      expected: [/Usage:\n  audienti prospects set-status <prsp_id>/, /active restores the prospect/, /POST \/api\/v1\/accounts\/:account_id\/prospects\/:id\/nurture\.json/]
    },
    {
      args: ["prospects", "reject", "help"],
      expected: [/Usage:\n  audienti prospects reject <prsp_id>/, /POST \/api\/v1\/accounts\/:account_id\/prospects\/:id\/reject\.json/]
    },
    {
      args: ["prospects", "nurture", "help"],
      expected: [/Usage:\n  audienti prospects nurture <prsp_id>/, /POST \/api\/v1\/accounts\/:account_id\/prospects\/:id\/nurture\.json/]
    },
    {
      args: ["prospects", "restore", "help"],
      expected: [/Usage:\n  audienti prospects restore <prsp_id>/, /POST \/api\/v1\/accounts\/:account_id\/prospects\/:id\/restore\.json/]
    },
    {
      args: ["prospects", "lock", "help"],
      expected: [/Usage:\n  audienti prospects lock <prsp_id>/, /protected_relationship/, /POST \/api\/v1\/accounts\/:account_id\/prospects\/:id\/lock\.json/]
    },
    {
      args: ["prospects", "unlock", "help"],
      expected: [/Usage:\n  audienti prospects unlock <prsp_id>/, /POST \/api\/v1\/accounts\/:account_id\/prospects\/:id\/unlock\.json/]
    },
    {
      args: ["prospects", "message-types", "help"],
      expected: [/Usage:\n  audienti prospects message-types <prsp_id>/, /message_surfaces\[\]\.key/]
    },
    {
      args: ["prospects", "timeline", "help"],
      expected: [/Usage:\n  audienti prospects timeline <prsp_id>/, /timeline\[\]\.occurred_at/, /GET \/api\/v1\/accounts\/:account_id\/prospects\/:id\/timeline\.json/]
    },
    {
      args: ["prospects", "write", "help"],
      expected: [/Usage:\n  audienti prospects write <prsp_id> --type <surface_key>/, /POST \/api\/v1\/accounts\/:account_id\/prospects\/:id\/write_message\.json/]
    },
    {
      args: ["prospects", "add-note", "help"],
      expected: [/Usage:\n  audienti prospects add-note <prsp_id>/, /action\.meeting\.canceled/, /POST \/api\/v1\/accounts\/:account_id\/prospects\/:id\/add_note\.json/]
    },
    {
      args: ["prospects", "add-steer", "help"],
      expected: [/Usage:\n  audienti prospects add-steer <prsp_id>/, /Always submits note_type=steer/, /POST \/api\/v1\/accounts\/:account_id\/prospects\/:id\/add_note\.json/]
    },
    {
      args: ["prospects", "add-profile", "help"],
      expected: [/Usage:\n  audienti prospects add-profile <prsp_id> --url <profile_url\|email\|phone>/, /same add-profile path used by the prospect show page/, /POST \/api\/v1\/accounts\/:account_id\/prospects\/:id\/profiles\.json/]
    },
    {
      args: ["prospects", "report-bad-profile", "help"],
      expected: [/Usage:\n  audienti prospects report-bad-profile <prsp_id> <prof_id\|citation_id>/, /same report action used by the prospect show page/, /POST \/api\/v1\/accounts\/:account_id\/prospects\/:id\/report_bad_profile\.json/]
    },
    {
      args: ["prospects", "sequence-preview", "help"],
      expected: [/Usage:\n  audienti prospects sequence-preview <prsp_id>/, /report\.steps\[\]/]
    },
    {
      args: ["analytics", "prospects", "cohort-analysis", "help"],
      expected: [/Usage:\n  audienti analytics prospects cohort-analysis/, /weekly AccountProspect\.created_at cohort/, /--weeks <n>/]
    },
    {
      args: ["writer", "help"],
      expected: [/Usage:\n  audienti writer test-run <prsp_id>/, /Run a writer campaign test/]
    },
    {
      args: ["writers", "test-run", "help"],
      expected: [/Usage:\n  audienti writer test-run <prsp_id>/, /draft copy for message steps/, /POST \/api\/v1\/accounts\/:account_id\/prospects\/:id\/sequence_export\.json/]
    },
    {
      args: ["prospects", "sequence-export", "help"],
      expected: [/Usage:\n  audienti prospects sequence-export <prsp_id>/, /rows\[\]\.branch/, /POST \/api\/v1\/accounts\/:account_id\/prospects\/:id\/sequence_export\.json/]
    },
    {
      args: ["lists", "add-prospects", "help"],
      expected: [/Usage:\n  audienti lists add-prospects <list_id> <prsp_id>/, /POST \/api\/v1\/accounts\/:account_id\/lists\/:list_id\/prospects\.json/]
    },
    {
      args: ["motions", "analytics", "help"],
      expected: [/Usage:\n  audienti motions analytics <motn_id>/, /prospects_by_day\[\]/, /GET \/api\/v1\/accounts\/:account_id\/analytics\/prospects\.json\?motion_id=:motion_id/]
    },
    {
      args: ["motions", "run-discovery", "help"],
      expected: [/Usage:\n  audienti motions run-discovery <motn_id>/, /Motions::DiscoverJob/, /POST \/api\/v1\/accounts\/:account_id\/motions\/:id\/run_discovery\.json/]
    },
    {
      args: ["motions", "prospects", "help"],
      expected: [/Usage:\n  audienti motions prospects <motn_id>/, /GET \/api\/v1\/accounts\/:account_id\/motions\/:motion_id\/prospects\.json/]
    },
    {
      args: ["motions", "add-prospects", "help"],
      expected: [/Usage:\n  audienti motions add-prospects <motn_id> <prsp_id>/, /POST \/api\/v1\/accounts\/:account_id\/motions\/:motion_id\/prospects\.json/]
    },
    {
      args: ["plays", "clone", "help"],
      expected: [/Usage:\n  audienti motions clone <motn_id> --name <text>/, /POST \/api\/v1\/accounts\/:account_id\/motions\/:id\/clone\.json/]
    },
    {
      args: ["plays", "move-prospects", "help"],
      expected: [/Usage:\n  audienti motions move-prospects <source_motn_id>/, /Move removes each selected prospect/]
    },
    {
      args: ["plays", "create", "help"],
      expected: [/Usage:\n  audienti motions create --payload <file\.json>/, /Status: implemented/]
    },
    {
      args: ["plays", "update", "help"],
      expected: [/Usage:\n  audienti motions update <motn_id> \[--status <draft\|preparing\|active\|paused\|archived>\] \[--tags <tag\[,tag\.\.\.\]>\] \[--own-post-engagement <true\|false>\]/, /PATCH \/api\/v1\/accounts\/:account_id\/motions\/:id\.json/]
    },
    {
      args: ["content", "help"],
      expected: [/audienti content programs/, /audienti content approve <cpwi_id>/, /GET\/POST \/api\/v1\/accounts\/:account_id\/content_ops\/\.\.\./]
    },
    {
      args: ["content", "comments", "help"],
      expected: [/Usage: audienti content comments/, /--unresolved/]
    },
    {
      args: ["motions", "add-tag", "help"],
      expected: [/Usage:\n  audienti motions add-tag <motn_id> <tag>/, /POST \/api\/v1\/accounts\/:account_id\/motions\/:id\/add_tag\.json/]
    },
    {
      args: ["plays", "remove-tag", "help"],
      expected: [/Usage:\n  audienti motions remove-tag <motn_id> <tag>/, /DELETE \/api\/v1\/accounts\/:account_id\/motions\/:id\/remove_tag\.json/]
    },
    {
      args: ["plays", "activate", "help"],
      expected: [/Usage:\n  audienti motions activate <motn_id>/, /--status active/]
    },
    {
      args: ["plays", "pause", "help"],
      expected: [/Usage:\n  audienti motions pause <motn_id>/, /--status paused/]
    },
    {
      args: ["plays", "archive", "help"],
      expected: [/Usage:\n  audienti motions archive <motn_id>/, /--status archived/]
    },
    {
      args: ["plays", "delete", "help"],
      expected: [/Usage:\n  audienti motions delete <motn_id> --confirm <yes\|true\|Y\|y>/, /DELETE \/api\/v1\/accounts\/:account_id\/motions\/:id\.json/]
    }
  ];

  for (const { args, expected } of cases) {
    const stdout = captureStream();
    const stderr = captureStream();
    const exitCode = await run(args, { stdout, stderr });

    assert.equal(exitCode, 0);
    assert.equal(stderr.output, "");
    for (const pattern of expected) assert.match(stdout.output, pattern);
  }
});

test("config list shows saved local config without calling the api", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One",
      accountUserId: "42",
      accountUserName: "User One",
      accountUserEmail: "one@example.com"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => {
      throw new Error("config list must not call the API");
    });

    const exitCode = await run(["config", "list"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Path: /);
    assert.match(stdout.output, /Exists: yes/);
    assert.match(stdout.output, /Host: https:\/\/app\.audienti\.com/);
    assert.match(stdout.output, /Token: save\.\.\.oken/);
    assert.match(stdout.output, /Active account: One \(acct_one\)/);
    assert.match(stdout.output, /Default account user: User One \(42\)/);
  });
});

test("config list supports json output and empty config state", async () => {
  await withTempConfigHome(async ({ env }) => {
    const stdout = captureStream();

    const exitCode = await run(["config", "list", "--json"], { env, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), {
      path: join(env.AUDIENTI_CONFIG_HOME, "config.json"),
      exists: false,
      host: null,
      token: null,
      accountId: null,
      accountName: null,
      accountUserId: null,
      accountUserName: null,
      accountUserEmail: null
    });
  });
});

test("auth token validates token before saving config", async () => {
  await withTempConfigHome(async ({ env }) => {
    const stdout = captureStream();
    const stderr = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "http://localhost:3000/api/v1/me.json");
      assert.equal(options.headers.Accept, "application/json");
      assert.equal(options.headers.Authorization, "Bearer valid-token");
      return jsonResponse({ id: 1, name: "User One" });
    });

    const exitCode = await run([
      "auth",
      "token",
      "valid-token",
      "--host",
      "http://localhost:3000"
    ], { env, fetch, stdout, stderr });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Authenticated to http:\/\/localhost:3000 as User One\./);
    assert.equal(stderr.output, "");
    assert.deepEqual(await readConfig({ env }), {
      host: "http://localhost:3000",
      token: "valid-token"
    });
    assert.equal(fetch.calls.length, 1);
  });
});

test("auth token refuses invalid tokens without saving config", async () => {
  await withTempConfigHome(async ({ env }) => {
    const stdout = captureStream();
    const stderr = captureStream();
    const fetch = createFetch(() => jsonResponse({ error: "invalid" }, { status: 401 }));

    const exitCode = await run(["auth", "token", "bad-token"], { env, fetch, stdout, stderr });

    assert.equal(exitCode, 1);
    assert.match(stderr.output, /Authentication failed/);
    assert.deepEqual(await readConfig({ env }), {});
  });
});

test("accounts list sends bearer auth and supports json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts.json");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse([
        { id: 1, prefix_id: "acct_one", name: "One" },
        { id: 2, prefix_id: "acct_two", name: "Two" }
      ]);
    });

    const exitCode = await run(["accounts", "list", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), [
      { id: 1, prefix_id: "acct_one", name: "One" },
      { id: 2, prefix_id: "acct_two", name: "Two" }
    ]);
  });
});

test("accounts select persists only a visible prefixed account id", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One",
      accountUserId: "42",
      accountUserName: "User One",
      accountUserEmail: "one@example.com"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse([
      { id: 1, prefix_id: "acct_one", name: "One" },
      { id: 2, prefix_id: "acct_two", name: "Two" }
    ]));

    const exitCode = await run(["accounts", "select", "acct_two"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Selected account Two \(acct_two\)\./);
    assert.deepEqual(await readConfig({ env }), {
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_two",
      accountName: "Two"
    });
  });
});

test("users select persists a visible default account user", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/users.json");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse([
        { id: 42, user_id: 7, name: "User One", email: "one@example.com", roles: ["admin"], current: true },
        { id: 43, user_id: 8, name: "User Two", email: "two@example.com", roles: ["member"], current: false }
      ]);
    });

    const exitCode = await run(["users", "select", "two@example.com"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Selected account user User Two \(43\)\./);
    assert.deepEqual(await readConfig({ env }), {
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One",
      accountUserId: "43",
      accountUserName: "User Two",
      accountUserEmail: "two@example.com"
    });
  });
});

test("users select accepts me for the current account user", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse([
      { id: 42, user_id: 7, name: "User One", email: "one@example.com", current: true },
      { id: 43, user_id: 8, name: "User Two", email: "two@example.com", current: false }
    ]));

    const exitCode = await run(["users", "select", "me"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Selected account user User One \(42\)\./);
    assert.equal((await readConfig({ env })).accountUserId, "42");
  });
});

test("accounts select preserves default user when reselecting the same account", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One",
      accountUserId: "42",
      accountUserName: "User One",
      accountUserEmail: "one@example.com"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse([
      { id: 1, prefix_id: "acct_one", name: "One" },
      { id: 2, prefix_id: "acct_two", name: "Two" }
    ]));

    const exitCode = await run(["accounts", "select", "acct_one"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(await readConfig({ env }), {
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One",
      accountUserId: "42",
      accountUserName: "User One",
      accountUserEmail: "one@example.com"
    });
  });
});

test("accounts select accepts a unique name fragment", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse([
      { id: 1, prefix_id: "acct_knit", name: "Knit" },
      { id: 2, prefix_id: "acct_other", name: "Other Account" }
    ]));

    const exitCode = await run(["accounts", "select", "knit"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Selected account Knit \(acct_knit\)\./);
    assert.deepEqual(await readConfig({ env }), {
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_knit",
      accountName: "Knit"
    });
  });
});

test("accounts select rejects accounts not returned by the api", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stderr = captureStream();
    const fetch = createFetch(() => jsonResponse([
      { id: 1, prefix_id: "acct_one", name: "One" }
    ]));

    const exitCode = await run(["accounts", "select", "acct_missing"], { env, fetch, stderr });

    assert.equal(exitCode, 1);
    assert.match(stderr.output, /acct_missing does not exist/);
    assert.deepEqual(await readConfig({ env }), {
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    });
  });
});

test("accounts select rejects ambiguous name fragments", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token"
    }, { env });

    const stderr = captureStream();
    const fetch = createFetch(() => jsonResponse([
      { id: 1, prefix_id: "acct_knit_team", name: "Knit Team" },
      { id: 2, prefix_id: "acct_knit_ops", name: "Knit Ops" }
    ]));

    const exitCode = await run(["accounts", "select", "knit"], { env, fetch, stderr });

    assert.equal(exitCode, 1);
    assert.match(stderr.output, /matched multiple accounts/);
    assert.match(stderr.output, /Knit Team \(acct_knit_team\)/);
    assert.match(stderr.output, /Knit Ops \(acct_knit_ops\)/);
    assert.deepEqual(await readConfig({ env }), {
      host: "https://app.audienti.com",
      token: "saved-token"
    });
  });
});

test("users list sends bearer auth and supports json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/users.json");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse([
        { id: 42, user_id: 7, name: "User One", email: "one@example.com", roles: ["admin"], current: true },
        { id: 43, user_id: 8, name: "User Two", email: "two@example.com", roles: ["member"], current: false }
      ]);
    });

    const exitCode = await run(["users", "list", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), [
      { id: 42, user_id: 7, name: "User One", email: "one@example.com", roles: ["admin"], current: true },
      { id: 43, user_id: 8, name: "User Two", email: "two@example.com", roles: ["member"], current: false }
    ]);
  });
});

test("users list renders a readable principal table", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse([
      { id: 42, user_id: 7, name: "User One", email: "one@example.com", roles: ["admin"], current: true },
      { id: 43, user_id: 8, name: "User Two", email: "two@example.com", roles: ["member"], current: false }
    ]));

    const exitCode = await run(["principals", "list"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /ACCOUNT USER ID\tCURRENT\tROLES\tNAME\tEMAIL/);
    assert.match(stdout.output, /42\tyes\tadmin\tUser One\tone@example\.com/);
    assert.match(stdout.output, /43\tno\tmember\tUser Two\ttwo@example\.com/);
  });
});

test("users activity fetches a user activity feed", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/operations/users/me/activity.json?window=7d&platform=linkedin&limit=5&page=2");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse({
        account_user: { id: 42, name: "User One", email: "one@example.com" },
        filters: { mode: "actor", window: "7d", platform: "linkedin", limit: 5 },
        summary: {
          window_count: 2,
          by_platform: [{ key: "linkedin", label: "LinkedIn", count: 2 }],
          by_key: [{ key: "action.profile.follow", label: "Followed Profile", count: 2 }]
        },
        pagination: { page: 2, pages: 3, count: 12 },
        events: [{
          id: 99,
          occurred_at: "2026-03-27T15:00:00Z",
          action_label: "Followed Profile",
          platform: "linkedin",
          details: "Followed the profile.",
          prospect: { prefix_id: "prsp_one", name: "Pat Prospect", company: "ExampleCo" }
        }]
      });
    });

    const exitCode = await run([
      "users",
      "activity",
      "me",
      "--window",
      "7d",
      "--platform",
      "linkedin",
      "--limit",
      "5",
      "--page",
      "2"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /User: User One \(42\)/);
    assert.match(stdout.output, /Window actions: 2/);
    assert.match(stdout.output, /TIME\tACTION\tPLATFORM\tPROSPECT\tCOMPANY\tDETAILS/);
    assert.match(stdout.output, /Followed Profile\tlinkedin\tPat Prospect\tExampleCo\tFollowed the profile\./);
  });
});

test("users activity defaults to the saved account user", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One",
      accountUserId: "42",
      accountUserName: "User One",
      accountUserEmail: "one@example.com"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/operations/users/42/activity.json?window=7d");
      return jsonResponse({
        account_user: { id: 42, name: "User One", email: "one@example.com" },
        filters: { mode: "actor", window: "7d" },
        summary: { window_count: 0 },
        events: []
      });
    });

    const exitCode = await run(["users", "activity", "--window", "7d"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /User: User One \(42\)/);
  });
});

test("users activity supports json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const responseBody = { account_user: { id: 42 }, summary: { window_count: 0 }, events: [] };
    const fetch = createFetch((url) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/operations/users/42/activity.json");
      return jsonResponse(responseBody);
    });

    const exitCode = await run(["users", "activity", "42", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("offers and icps list render readable selection tables", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url) => {
      if (url.pathname === "/api/v1/accounts/acct_one/offers.json") {
        return jsonResponse([
          { id: 11, prefix_id: "offr_one", name: "Offer One", url: "https://example.com/offer-one" }
        ]);
      }

      if (url.pathname === "/api/v1/accounts/acct_one/icps.json") {
        return jsonResponse([
          { id: 21, prefix_id: "icpp_one", name: "ICP One", tags: ["enterprise"], discovery_keyword: "migration", agent: { id: 31, name: "Finder One" } }
        ]);
      }

      throw new Error(`unexpected path ${url.pathname}`);
    });

    let exitCode = await run(["offers", "list"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /OFFER ID\tNAME\tURL/);
    assert.match(stdout.output, /offr_one\tOffer One\thttps:\/\/example\.com\/offer-one/);

    stdout.output = "";
    exitCode = await run(["icps", "list"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /ICP ID\tNAME\tTAGS\tDISCOVERY KEYWORD\tAGENT/);
    assert.match(stdout.output, /icpp_one\tICP One\tenterprise\tmigration\tFinder One/);
  });
});

test("offers create and icps create post the expected payloads and support json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      if (url.pathname === "/api/v1/accounts/acct_one/offers.json") {
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), {
          offer: {
            name: "Offer One",
            description: "Offer description.",
            url: "https://example.com/offer-one"
          }
        });
        return jsonResponse({
          id: 11,
          prefix_id: "offr_one",
          name: "Offer One",
          description: "Offer description.",
          url: "https://example.com/offer-one"
        }, { status: 201 });
      }

      if (url.pathname === "/api/v1/accounts/acct_one/icps.json") {
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), {
          icp: {
            name: "ICP One",
            notes: "ICP notes.",
            discovery_keyword: "renewal",
            tags: ["enterprise", "renewal"]
          }
        });
        return jsonResponse({
          id: 21,
          prefix_id: "icpp_one",
          name: "ICP One",
          notes: "ICP notes.",
          tags: ["enterprise", "renewal"],
          discovery_keyword: "renewal",
          agent: null
        }, { status: 201 });
      }

      throw new Error(`unexpected path ${url.pathname}`);
    });

    let exitCode = await run([
      "offers",
      "create",
      "--name",
      "Offer One",
      "--description",
      "Offer description.",
      "--url",
      "https://example.com/offer-one",
      "--json"
    ], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(stdout.output).prefix_id, "offr_one");

    stdout.output = "";
    exitCode = await run([
      "icps",
      "create",
      "--name",
      "ICP One",
      "--notes",
      "ICP notes.",
      "--discovery-keyword",
      "renewal",
      "--tags",
      "enterprise, renewal",
      "--json"
    ], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(stdout.output).prefix_id, "icpp_one");
  });
});

test("offers show update and delete call the expected endpoints", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      id: 11,
      prefix_id: "offr_one",
      name: "Offer One",
      description: "Offer description.",
      url: "https://example.com/offer-one"
    };
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      if (url.pathname === "/api/v1/accounts/acct_one/offers/offr_one.json" && options.method === "GET") {
        return jsonResponse(responseBody);
      }

      if (url.pathname === "/api/v1/accounts/acct_one/offers/offr_one.json" && options.method === "PATCH") {
        assert.deepEqual(JSON.parse(options.body), {
          offer: {
            name: "Offer Updated",
            description: "Updated description."
          }
        });
        return jsonResponse({ ...responseBody, name: "Offer Updated", description: "Updated description." });
      }

      if (url.pathname === "/api/v1/accounts/acct_one/offers/offr_one.json" && options.method === "DELETE") {
        return jsonResponse({ ...responseBody, deleted: true });
      }

      throw new Error(`unexpected request ${options.method || "GET"} ${url.pathname}`);
    });

    let exitCode = await run(["offers", "show", "offr_one"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Offer: Offer One \(offr_one\)/);

    stdout.output = "";
    exitCode = await run(["offers", "update", "offr_one", "--name", "Offer Updated", "--description", "Updated description.", "--json"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(stdout.output).name, "Offer Updated");

    stdout.output = "";
    exitCode = await run(["offers", "delete", "offr_one", "--confirm", "yes"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Deleted offer Offer One \(offr_one\)\./);
  });
});

test("icps create accepts a payload file for rich ICP creation", async () => {
  await withTempConfigHome(async ({ env, root }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const payloadPath = join(root, "icp.json");
    await writeFile(payloadPath, JSON.stringify({
      name: "Vendor Management Office",
      notes: "Operators handling vendor governance and escalations.",
      discovery_keyword: "vendor governance",
      text_criteria: "Owns vendor governance, renewals, and escalations.",
      negative_title_exceptions: ["sales", "recruiting"],
      company_keywords: {
        include: ["vendor governance", "supplier performance"],
        exclude: ["staffing"]
      },
      job_titles_attributes: [
        { name: "Vendor Management Office" },
        { name: "Strategic Vendor Management" }
      ]
    }, null, 2));

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      if (url.pathname === "/api/v1/accounts/acct_one/icps.json") {
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), {
          icp: {
            name: "Vendor Management Office",
            notes: "Operators handling vendor governance and escalations.",
            discovery_keyword: "vendor governance",
            text_criteria: "Owns vendor governance, renewals, and escalations.",
            negative_title_exceptions: ["sales", "recruiting"],
            company_keywords: {
              include: ["vendor governance", "supplier performance"],
              exclude: ["staffing"]
            },
            job_titles_attributes: [
              { name: "Vendor Management Office" },
              { name: "Strategic Vendor Management" }
            ]
          }
        });
        return jsonResponse({
          id: 21,
          prefix_id: "icpp_one",
          name: "Vendor Management Office",
          notes: "Operators handling vendor governance and escalations.",
          discovery_keyword: "vendor governance",
          agent: null
        }, { status: 201 });
      }

      throw new Error(`unexpected path ${url.pathname}`);
    });

    const exitCode = await run([
      "icps",
      "create",
      "--payload",
      payloadPath,
      "--json"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(stdout.output).prefix_id, "icpp_one");
  });
});

test("icps show renders one icp", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/icps/icpp_source.json");
      assert.equal(options.method, "GET");
      return jsonResponse({
        prefix_id: "icpp_source",
        name: "Pipeline ICP",
        notes: "ICP notes.",
        tags: ["sarit"],
        discovery_keyword: "renewal",
        agent: { name: "Finder One" }
      });
    });

    const exitCode = await run(["icps", "show", "icpp_source"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /ICP: Pipeline ICP \(icpp_source\)/);
    assert.match(stdout.output, /Tags: sarit/);
    assert.match(stdout.output, /Agent: Finder One/);
  });
});

test("icps update patches tags", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      prefix_id: "icpp_source",
      name: "Pipeline ICP",
      notes: "ICP notes.",
      tags: ["sarit", "pj"],
      discovery_keyword: "renewal"
    };
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/icps/icpp_source.json");
      assert.equal(options.method, "PATCH");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), {
        icp: {
          tags: ["sarit", "pj"]
        }
      });
      return jsonResponse(responseBody);
    });

    const exitCode = await run(["icps", "update", "icpp_source", "--tags", "sarit, pj", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("icps add-tag posts the expected payload and supports json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      prefix_id: "icpp_source",
      name: "Pipeline ICP",
      tags: ["sarit"]
    };
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/icps/icpp_source/add_tag.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), { tag: "sarit" });
      return jsonResponse(responseBody);
    });

    const exitCode = await run(["icps", "add-tag", "icpp_source", "sarit", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("icps remove-tag sends DELETE and renders a readable confirmation", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/icps/icpp_source/remove_tag.json");
      assert.equal(options.method, "DELETE");
      assert.deepEqual(JSON.parse(options.body), { tag: "sarit" });
      return jsonResponse({
        prefix_id: "icpp_source",
        name: "Pipeline ICP",
        tags: []
      });
    });

    const exitCode = await run(["icps", "remove-tag", "icpp_source", "sarit"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Removed tag sarit from ICP Pipeline ICP \(icpp_source\)\./);
  });
});

test("offers create and icps create render readable confirmations", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url) => {
      if (url.pathname === "/api/v1/accounts/acct_one/offers.json") {
        return jsonResponse({
          prefix_id: "offr_one",
          name: "Offer One",
          description: "Offer description.",
          url: "https://example.com/offer-one"
        }, { status: 201 });
      }

      if (url.pathname === "/api/v1/accounts/acct_one/icps.json") {
        return jsonResponse({
          prefix_id: "icpp_one",
          name: "ICP One",
          notes: "ICP notes.",
          discovery_keyword: "renewal",
          agent: null
        }, { status: 201 });
      }

      throw new Error(`unexpected path ${url.pathname}`);
    });

    let exitCode = await run([
      "offers",
      "create",
      "--name",
      "Offer One",
      "--description",
      "Offer description."
    ], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Created offer Offer One \(offr_one\)\./);
    assert.match(stdout.output, /Description: Offer description\./);

    stdout.output = "";
    exitCode = await run([
      "icps",
      "create",
      "--name",
      "ICP One",
      "--notes",
      "ICP notes.",
      "--discovery-keyword",
      "renewal"
    ], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Created ICP ICP One \(icpp_one\)\./);
    assert.match(stdout.output, /Notes: ICP notes\./);
    assert.match(stdout.output, /Discovery keyword: renewal/);
  });
});

test("--account overrides saved account without mutating config", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse([
      { id: 1, prefix_id: "acct_one", name: "One" },
      { id: 2, prefix_id: "acct_two", name: "Two" }
    ]));

    const exitCode = await run(["--account", "acct_two", "accounts", "list"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /\* acct_two\tTwo/);
    assert.deepEqual(await readConfig({ env }), {
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    });
  });
});

test("account read commands call the expected api endpoints with json output", async () => {
  const cases = [
    {
      args: ["offers", "list", "--json"],
      path: "/api/v1/accounts/acct_one/offers.json",
      body: [{ prefix_id: "offr_one", name: "Offer One", description: "Offer description." }]
    },
    {
      args: ["offers", "show", "offr_one", "--json"],
      path: "/api/v1/accounts/acct_one/offers/offr_one.json",
      body: { prefix_id: "offr_one", name: "Offer One", description: "Offer description." }
    },
    {
      args: ["icps", "list", "--json"],
      path: "/api/v1/accounts/acct_one/icps.json",
      body: [{ prefix_id: "icpp_one", name: "ICP One", discovery_keyword: "migration" }]
    },
    {
      args: ["icps", "show", "icpp_one", "--json"],
      path: "/api/v1/accounts/acct_one/icps/icpp_one.json",
      body: { prefix_id: "icpp_one", name: "ICP One", discovery_keyword: "migration" }
    },
    {
      args: ["lists", "list", "--json"],
      path: "/api/v1/accounts/acct_one/lists.json",
      body: [{ prefix_id: "list_one", name: "Owned list", prospect_count: 3 }]
    },
    {
      args: ["lists", "show", "list_one", "--json"],
      path: "/api/v1/accounts/acct_one/lists/list_one.json",
      body: { prefix_id: "list_one", name: "Owned list", prospect_count: 3 }
    },
    {
      args: ["motions", "list", "--json"],
      path: "/api/v1/accounts/acct_one/motions.json",
      body: [{ prefix_id: "motn_one", name: "Motion One", kind: "outbound", status: "active" }]
    },
    {
      args: ["plays", "list", "--json"],
      path: "/api/v1/accounts/acct_one/motions.json",
      body: [{ prefix_id: "motn_one", name: "Motion One", kind: "outbound", status: "active" }]
    },
    {
      args: ["motions", "show", "motn_one", "--json"],
      path: "/api/v1/accounts/acct_one/motions/motn_one.json",
      body: { prefix_id: "motn_one", name: "Motion One", kind: "outbound", status: "active" }
    },
    {
      args: ["motions", "status", "motn_one", "--json"],
      path: "/api/v1/accounts/acct_one/motions/motn_one/status.json",
      body: { prefix_id: "motn_one", name: "Motion One", state: "healthy_idle", reason_label: "Healthy" }
    },
    {
      args: ["motions", "analytics", "motn_one", "--json"],
      path: "/api/v1/accounts/acct_one/analytics/prospects.json",
      query: { motion_id: "motn_one", window: "30d" },
      body: {
        kind: "prospects",
        motion: { prefix_id: "motn_one", name: "Motion One" },
        prospects_added_count: 1,
        prospects_by_day: [{ date: "2026-07-12", count: 1 }]
      }
    },
    {
      args: ["motions", "prospects", "motn_one", "--json"],
      path: "/api/v1/accounts/acct_one/motions/motn_one/prospects.json",
      body: {
        prospects: [{ prefix_id: "prsp_one", display_name: "Pat Prospect" }],
        meta: { total_count: 1, limit: 20, offset: 0, page: 1, returned_count: 1, has_more: false }
      }
    },
    {
      args: ["prospects", "show", "prsp_one", "--json"],
      path: "/api/v1/accounts/acct_one/prospects/prsp_one.json",
      body: { prefix_id: "prsp_one", display_name: "Pat Prospect", company: "ExampleCo" }
    },
    {
      args: ["prospects", "import-status", "primp_one", "--json"],
      path: "/api/v1/accounts/acct_one/prospect_imports/primp_one.json",
      body: {
        prefix_id: "primp_one",
        status: "completed",
        ready: true,
        prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" }
      }
    },
    {
      args: ["operator", "queue", "--json"],
      path: "/api/v1/accounts/acct_one/operator.json",
      body: { next_move: null, decision_queue: [], filters: {}, metrics: {} }
    }
  ];

  for (const { args, path, query, body } of cases) {
    await withTempConfigHome(async ({ env }) => {
      await writeConfig({
        host: "https://app.audienti.com",
        token: "saved-token",
        accountId: "acct_one",
        accountName: "One"
      }, { env });

      const stdout = captureStream();
      const fetch = createFetch((url, options) => {
        if (query) {
          assert.equal(url.origin, "https://app.audienti.com");
          assert.equal(url.pathname, path);
          assert.deepEqual(Object.fromEntries(url.searchParams.entries()), query);
        } else {
          assert.equal(url.toString(), `https://app.audienti.com${path}`);
        }
        assert.equal(options.headers.Authorization, "Bearer saved-token");
        return jsonResponse(body);
      });

      const exitCode = await run(args, { env, fetch, stdout });

      assert.equal(exitCode, 0);
      assert.deepEqual(JSON.parse(stdout.output), body);
      assert.equal(fetch.calls.length, 1);
    });
  }
});

test("tags list sends bearer auth and supports json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = [
      { name: "matt", icp_count: 0, list_count: 1, motion_count: 2, total_count: 3 },
      { name: "sarit", icp_count: 1, list_count: 2, motion_count: 1, total_count: 4 }
    ];
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/tags.json");
      assert.equal(options.method, "GET");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse(responseBody);
    });

    const exitCode = await run(["tags", "list", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("tags list renders a readable table", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse([
      { name: "matt", icp_count: 0, list_count: 1, motion_count: 2, total_count: 3 },
      { name: "sarit", icp_count: 1, list_count: 2, motion_count: 1, total_count: 4 }
    ]));

    const exitCode = await run(["tags", "list"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /TAG\tICPS\tLISTS\tMOTIONS\tTOTAL/);
    assert.match(stdout.output, /matt\t0\t1\t2\t3/);
    assert.match(stdout.output, /sarit\t1\t2\t1\t4/);
  });
});

test("tags show returns icps, lists, and motions using the tag", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      if (url.pathname.endsWith("/icps.json")) {
        return jsonResponse([
          { prefix_id: "icpp_one", name: "Sarit ICP", tags: ["sarit"], discovery_keyword: "renewal" },
          { prefix_id: "icpp_two", name: "Matt ICP", tags: ["matt"], discovery_keyword: "migration" }
        ]);
      }
      if (url.pathname.endsWith("/lists.json")) {
        return jsonResponse([
          { prefix_id: "list_one", name: "Sarit list", tags: ["sarit"], prospect_count: 2 },
          { prefix_id: "list_two", name: "Matt list", tags: ["matt"], prospect_count: 1 }
        ]);
      }
      if (url.pathname.endsWith("/motions.json")) {
        return jsonResponse([
          { prefix_id: "motn_one", name: "Sarit motion", kind: "outbound", status: "active", play_tags: ["sarit"] },
          { prefix_id: "motn_two", name: "PJ motion", kind: "outbound", status: "draft", play_tags: ["pj"] }
        ]);
      }
      throw new Error(`unexpected URL ${url}`);
    });

    const exitCode = await run(["tags", "show", "sarit", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), {
      tag: "sarit",
      icps: [
        { prefix_id: "icpp_one", name: "Sarit ICP", tags: ["sarit"], discovery_keyword: "renewal" }
      ],
      lists: [
        { prefix_id: "list_one", name: "Sarit list", tags: ["sarit"], prospect_count: 2 }
      ],
      motions: [
        { prefix_id: "motn_one", name: "Sarit motion", kind: "outbound", status: "active", play_tags: ["sarit"] }
      ]
    });
    assert.equal(fetch.calls.length, 3);
  });
});

test("icps list can filter by tag", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse([
      { prefix_id: "icpp_one", name: "Sarit ICP", tags: ["sarit"], discovery_keyword: "renewal" },
      { prefix_id: "icpp_two", name: "Matt ICP", tags: ["matt"], discovery_keyword: "migration" }
    ]));

    const exitCode = await run(["icps", "list", "--tag", "sarit", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), [
      { prefix_id: "icpp_one", name: "Sarit ICP", tags: ["sarit"], discovery_keyword: "renewal" }
    ]);
  });
});

test("lists list can filter by tag", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse([
      { prefix_id: "list_one", name: "Sarit list", tags: ["sarit"], prospect_count: 2 },
      { prefix_id: "list_two", name: "Matt list", tags: ["matt"], prospect_count: 1 }
    ]));

    const exitCode = await run(["lists", "list", "--tag", "sarit", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), [
      { prefix_id: "list_one", name: "Sarit list", tags: ["sarit"], prospect_count: 2 }
    ]);
  });
});

test("lists create posts the expected payload and supports json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      id: 12,
      prefix_id: "list_one",
      name: "CIO renewal targets",
      description: "Accounts to review before QBR outreach.",
      tags: ["sarit", "pj"],
      campaign_brief: {
        hook: "Vendor accountability before renewal",
        audience_note: "IT leaders running QBRs and renewals"
      }
    };
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/lists.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), {
        list: {
          name: "CIO renewal targets",
          description: "Accounts to review before QBR outreach.",
          tags: ["sarit", "pj"],
          campaign_brief: {
            hook: "Vendor accountability before renewal",
            audience_note: "IT leaders running QBRs and renewals"
          }
        }
      });
      return jsonResponse(responseBody, { status: 201 });
    });

    const exitCode = await run([
      "lists",
      "create",
      "--name",
      "CIO renewal targets",
      "--description",
      "Accounts to review before QBR outreach.",
      "--tags",
      "sarit, pj",
      "--campaign-hook",
      "Vendor accountability before renewal",
      "--audience-note",
      "IT leaders running QBRs and renewals",
      "--json"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("lists create renders a readable confirmation", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse({
      prefix_id: "list_one",
      name: "CIO renewal targets",
      description: "Accounts to review before QBR outreach."
    }, { status: 201 }));

    const exitCode = await run([
      "lists",
      "create",
      "--name",
      "CIO renewal targets",
      "--description",
      "Accounts to review before QBR outreach."
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Created list CIO renewal targets \(list_one\)\./);
    assert.match(stdout.output, /Description: Accounts to review before QBR outreach\./);
  });
});

test("motions list renders an aligned table with readable columns", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/motions.json");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse([
        { prefix_id: "motn_one", name: "Motion One", kind: "outbound", status: "active" },
        { prefix_id: "motn_two", name: "Longer Motion Name", kind: "inbound", status: "paused" }
      ]);
    });

    const exitCode = await run(["motions", "list"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.equal(fetch.calls.length, 1);
    assert.doesNotMatch(stdout.output, /\t/);
    assert.match(stdout.output, /MOTION ID\s+STATUS\s+KIND\s+NAME/);
    assert.match(stdout.output, /motn_one\s+active\s+outbound\s+Motion One/);
    assert.match(stdout.output, /motn_two\s+paused\s+inbound\s+Longer Motion Name/);
  });
});

test("motions list can filter by tag", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse([
      { prefix_id: "motn_one", name: "Motion One", kind: "outbound", status: "active", play_tags: ["sarit"] },
      { prefix_id: "motn_two", name: "Motion Two", kind: "inbound", status: "paused", play_tags: ["matt"] }
    ]));

    const exitCode = await run(["motions", "list", "--tag", "sarit", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), [
      { prefix_id: "motn_one", name: "Motion One", kind: "outbound", status: "active", play_tags: ["sarit"] }
    ]);
  });
});

test("motions analytics renders prospect output by day", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/analytics/prospects.json");
      assert.equal(url.searchParams.get("motion_id"), "motn_focus");
      assert.equal(url.searchParams.get("window"), "30d");
      assert.equal(options.headers.Authorization, "Bearer saved-token");

      return jsonResponse({
        kind: "prospects",
        window: {
          key: "30d",
          started_at: "2026-06-12T14:00:00Z",
          ended_at: "2026-07-12T14:00:00Z"
        },
        motion: {
          id: 123,
          prefix_id: "motn_focus",
          name: "Focused Motion",
          kind: "outbound",
          status: "active",
          created_at: "2026-06-01T10:00:00Z"
        },
        prospects_added_count: 3,
        prospects_by_day: [
          { date: "2026-07-10", count: 0, active_count: 0, active_percentage: null, inactive_count: 0, queue_stages: [] },
          {
            date: "2026-07-11",
            count: 1,
            active_count: 1,
            active_percentage: 100.0,
            inactive_count: 0,
            queue_stages: [{ key: "pre_connect", label: "Pre connect", count: 1 }]
          },
          {
            date: "2026-07-12",
            count: 2,
            active_count: 1,
            active_percentage: 50.0,
            inactive_count: 1,
            queue_stages: [
              { key: "connected", label: "Connected", count: 1 },
              { key: "non_responsive", label: "Non responsive", count: 1 }
            ]
          }
        ]
      });
    });

    const exitCode = await run(["motions", "analytics", "motn_focus"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.equal(fetch.calls.length, 1);
    assert.match(stdout.output, /Motion analytics \(30d: 2026-06-12T14:00:00Z to 2026-07-12T14:00:00Z\)/);
    assert.match(stdout.output, /Motion: Focused Motion \(motn_focus\)/);
    assert.match(stdout.output, /Created: 2026-06-01T10:00:00Z/);
    assert.match(stdout.output, /Prospects produced: 3/);
    assert.match(stdout.output, /Prospect cohorts by produced day/);
    assert.match(stdout.output, /DATE        PRODUCED  ACTIVE  ACTIVE %  INACTIVE  STAGES/);
    assert.match(stdout.output, /2026-07-10         -       -         -         -  -/);
    assert.match(stdout.output, /2026-07-11         1       1      100%         -  Pre connect 1/);
    assert.match(stdout.output, /2026-07-12         2       1       50%         1  Connected 1 \| Non responsive 1/);
  });
});

test("motions run-discovery posts launch request and renders queue result", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/motions/motn_focus/run_discovery.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), {});

      return jsonResponse({
        motion_id: "motn_focus",
        motion: { id: 123, prefix_id: "motn_focus", name: "Focused Motion", kind: "outbound", status: "active" },
        enqueued: true,
        reason: "launched",
        target_count: 25
      }, { status: 202 });
    });

    const exitCode = await run(["motions", "run-discovery", "motn_focus"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Discovery queued for Focused Motion \(motn_focus\)\./);
    assert.match(stdout.output, /Reason: launched/);
    assert.match(stdout.output, /Target count: 25/);
  });
});

test("motions run-discovery supports target count json output and account override", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      motion_id: "motn_focus",
      motion: { id: 123, prefix_id: "motn_focus", name: "Focused Motion" },
      enqueued: false,
      reason: "run_in_progress",
      target_count: 5
    };
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_two/motions/motn_focus/run_discovery.json");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { target_count: 5 });
      return jsonResponse(responseBody);
    });

    const exitCode = await run(["--account", "acct_two", "plays", "run-discovery", "motn_focus", "--target-count", "5", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("motions run-discovery rejects invalid target count without calling the api", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const stderr = captureStream();
    const fetch = createFetch(() => {
      throw new Error("invalid target count should not call the API");
    });

    const exitCode = await run(["motions", "run-discovery", "motn_focus", "--target-count", "0"], { env, fetch, stdout, stderr });

    assert.equal(exitCode, 1);
    assert.equal(stdout.output, "");
    assert.match(stderr.output, /--target-count must be a positive integer/);
  });
});

test("motions create posts the expected payload, supports plays alias, and honors account override", async () => {
  await withTempConfigHome(async ({ root, env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });
    const payloadPath = join(root, "motion-create.json");
    await writeFile(payloadPath, JSON.stringify({
      name: "Enterprise migration leaders",
      premise: "Find operators discussing stalled CRM migrations.",
      kind: "outbound",
      status: "draft",
      offer_id: "offr_abc123",
      principal_account_user_id: 42,
      list_id: "list_abc123",
      play_tags: ["sarit", "pj"]
    }));

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_two/motions.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), {
        motion: {
          name: "Enterprise migration leaders",
          premise: "Find operators discussing stalled CRM migrations.",
          kind: "outbound",
          status: "draft",
          offer_id: "offr_abc123",
          principal_account_user_id: 42,
          list_id: "list_abc123",
          play_tags: ["sarit", "pj"]
        }
      });
      return jsonResponse({
        id: 11,
        prefix_id: "motn_abc123",
        name: "Enterprise migration leaders",
        kind: "outbound",
        status: "draft",
        offer: { id: 21, prefix_id: "offr_abc123", name: "Offer One" },
        icp: { id: 31, prefix_id: "icpp_abc123", name: "ICP One" },
        list: { id: 41, prefix_id: "list_abc123", name: "List One" },
        principal_account_user: { id: 42, user_id: 7, name: "User One", email: "one@example.com" }
      }, { status: 201 });
    });

    const exitCode = await run(["--account", "acct_two", "plays", "create", "--json", "--payload", payloadPath], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(stdout.output).prefix_id, "motn_abc123");
    assert.deepEqual(await readConfig({ env }), {
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    });
  });
});

test("motions clone posts the expected payload, supports plays alias, and honors account override", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_two/motions/motn_source/clone.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), {
        motion: {
          name: "Restaurant operators"
        }
      });
      return jsonResponse({
        id: 12,
        prefix_id: "motn_clone",
        name: "Restaurant operators",
        kind: "transition",
        status: "draft",
        offer: { id: 21, prefix_id: "offr_abc123", name: "Offer One" },
        icp: { id: 31, prefix_id: "icpp_abc123", name: "ICP One" },
        list: { id: 42, prefix_id: "list_clone", name: "Restaurant operators List" },
        principal_account_user: { id: 42, user_id: 7, name: "User One", email: "one@example.com" }
      }, { status: 201 });
    });

    const exitCode = await run(["--account", "acct_two", "plays", "clone", "motn_source", "--name", "Restaurant operators", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(stdout.output).prefix_id, "motn_clone");
  });
});

test("motions delete sends DELETE, supports plays alias, and honors account override", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      deleted: true,
      prefix_id: "motn_source",
      name: "Old motion"
    };
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_two/motions/motn_source.json");
      assert.equal(options.method, "DELETE");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.equal(options.body, undefined);
      return jsonResponse(responseBody);
    });

    const exitCode = await run(["--account", "acct_two", "plays", "delete", "motn_source", "--confirm", "yes", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("motions update patches status, supports plays alias, and honors account override", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      prefix_id: "motn_source",
      name: "Pipeline motion",
      status: "paused",
      kind: "outbound"
    };
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_two/motions/motn_source.json");
      assert.equal(options.method, "PATCH");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), {
        motion: {
          status: "paused"
        }
      });
      return jsonResponse(responseBody);
    });

    const exitCode = await run(["--account", "acct_two", "plays", "update", "motn_source", "--status", "paused", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("motions update patches play tags", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      prefix_id: "motn_source",
      name: "Pipeline motion",
      status: "draft",
      kind: "outbound",
      play_tags: ["sarit", "pj"]
    };
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/motions/motn_source.json");
      assert.equal(options.method, "PATCH");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), {
        motion: {
          play_tags: ["sarit", "pj"]
        }
      });
      return jsonResponse(responseBody);
    });

    const exitCode = await run(["motions", "update", "motn_source", "--tags", "sarit, pj", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("motions update can clear play tags", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      prefix_id: "motn_source",
      name: "Pipeline motion",
      status: "draft",
      kind: "outbound",
      play_tags: []
    };
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/motions/motn_source.json");
      assert.equal(options.method, "PATCH");
      assert.deepEqual(JSON.parse(options.body), {
        motion: {
          play_tags: []
        }
      });
      return jsonResponse(responseBody);
    });

    const exitCode = await run(["motions", "update", "motn_source", "--tags", "", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("motions update patches own-post engagement setting", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      prefix_id: "motn_source",
      name: "Pipeline motion",
      status: "active",
      kind: "inbound",
      own_post_engagement: true
    };
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/motions/motn_source.json");
      assert.equal(options.method, "PATCH");
      assert.deepEqual(JSON.parse(options.body), {
        motion: {
          own_post_engagement: true
        }
      });
      return jsonResponse(responseBody);
    });

    const exitCode = await run(["motions", "update", "motn_source", "--own-post-engagement", "true", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("motions status shortcuts patch expected statuses", async () => {
  const cases = [
    { action: "activate", status: "active" },
    { action: "pause", status: "paused" },
    { action: "archive", status: "archived" }
  ];

  for (const { action, status } of cases) {
    await withTempConfigHome(async ({ env }) => {
      await writeConfig({
        host: "https://app.audienti.com",
        token: "saved-token",
        accountId: "acct_one",
        accountName: "One"
      }, { env });

      const stdout = captureStream();
      const fetch = createFetch((url, options) => {
        assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/motions/motn_source.json");
        assert.equal(options.method, "PATCH");
        assert.deepEqual(JSON.parse(options.body), {
          motion: {
            status
          }
        });
        return jsonResponse({
          prefix_id: "motn_source",
          name: "Pipeline motion",
          status,
          kind: "outbound"
        });
      });

      const exitCode = await run(["motions", action, "motn_source"], { env, fetch, stdout });

      assert.equal(exitCode, 0);
      assert.match(stdout.output, new RegExp(`Updated motion Pipeline motion \\(motn_source\\) to ${status}\\.`));
      assert.match(stdout.output, new RegExp(`Status: ${status}`));
    });
  }
});

test("motions update rejects invalid status without calling the api", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const stderr = captureStream();
    const fetch = createFetch(() => {
      throw new Error("invalid status should not call the API");
    });

    const exitCode = await run(["motions", "update", "motn_source", "--status", "running"], { env, fetch, stdout, stderr });

    assert.equal(exitCode, 1);
    assert.equal(stdout.output, "");
    assert.match(stderr.output, /Error: Usage: audienti motions update <motn_id> \[--status <draft\|preparing\|active\|paused\|archived>\] \[--tags <tag\[,tag\.\.\.\]>\] \[--own-post-engagement <true\|false>\]/);
  });
});

test("motions add-tag posts the expected payload, supports plays alias, and honors account override", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      prefix_id: "motn_source",
      name: "Pipeline motion",
      status: "active",
      kind: "outbound",
      play_tags: ["sarit"]
    };
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_two/motions/motn_source/add_tag.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), { tag: "sarit" });
      return jsonResponse(responseBody);
    });

    const exitCode = await run(["--account", "acct_two", "plays", "add-tag", "motn_source", "sarit", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("motions remove-tag sends DELETE and renders a readable confirmation", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/motions/motn_source/remove_tag.json");
      assert.equal(options.method, "DELETE");
      assert.deepEqual(JSON.parse(options.body), { tag: "sarit" });
      return jsonResponse({
        prefix_id: "motn_source",
        name: "Pipeline motion",
        status: "active",
        kind: "outbound",
        play_tags: []
      });
    });

    const exitCode = await run(["motions", "remove-tag", "motn_source", "sarit"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Removed tag sarit from motion Pipeline motion \(motn_source\)\./);
  });
});

test("motions delete renders a readable confirmation", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse({
      deleted: true,
      prefix_id: "motn_source",
      name: "Old motion"
    }));

    const exitCode = await run(["motions", "delete", "motn_source", "--confirm", "Y"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Deleted motion Old motion \(motn_source\)\./);
  });
});

test("motions delete requires explicit confirmation", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const stderr = captureStream();
    const fetch = createFetch(() => {
      throw new Error("delete should not call the API without confirmation");
    });

    const exitCode = await run(["motions", "delete", "motn_source"], { env, fetch, stdout, stderr });

    assert.equal(exitCode, 1);
    assert.equal(stdout.output, "");
    assert.match(stderr.output, /Error: Usage: audienti motions delete <motn_id> --confirm <yes\|true\|Y\|y>/);
  });
});

test("motions move-prospects posts the expected payload, supports plays alias, and honors account override", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_two/motions/motn_source/move_prospects.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), {
        target_motion_id: "motn_target",
        prospect_ids: ["prsp_one", "prsp_two"]
      });
      return jsonResponse({
        moved: 2,
        failed: [],
        source_motion_id: "motn_source",
        target_motion_id: "motn_target"
      });
    });

    const exitCode = await run(["--account", "acct_two", "plays", "move-prospects", "motn_source", "--target", "motn_target", "prsp_one", "prsp_two", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(stdout.output).moved, 2);
  });
});

test("lists update patches the expected payload and supports json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      id: 12,
      prefix_id: "list_one",
      name: "Updated target list",
      description: "Re-ranked operator list.",
      tags: ["matt", "pj"],
      campaign_brief: {
        hook: "Renewal leverage before QBRs",
        audience_note: "Vendor-management operators"
      }
    };
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/lists/list_one.json");
      assert.equal(options.method, "PATCH");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), {
        list: {
          name: "Updated target list",
          description: "Re-ranked operator list.",
          tags: ["matt", "pj"],
          campaign_brief: {
            hook: "Renewal leverage before QBRs",
            audience_note: "Vendor-management operators"
          }
        }
      });
      return jsonResponse(responseBody);
    });

    const exitCode = await run([
      "lists",
      "update",
      "list_one",
      "--name",
      "Updated target list",
      "--description",
      "Re-ranked operator list.",
      "--tags",
      "matt, pj",
      "--campaign-hook",
      "Renewal leverage before QBRs",
      "--audience-note",
      "Vendor-management operators",
      "--json"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("lists update renders a readable confirmation", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse({
      prefix_id: "list_one",
      name: "Updated target list",
      description: "Re-ranked operator list."
    }));

    const exitCode = await run([
      "lists",
      "update",
      "list_one",
      "--name",
      "Updated target list",
      "--description",
      "Re-ranked operator list."
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Updated list Updated target list \(list_one\)\./);
    assert.match(stdout.output, /Description: Re-ranked operator list\./);
  });
});

test("lists add-tag posts the expected payload and supports json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      prefix_id: "list_one",
      name: "Target list",
      tags: ["sarit"]
    };
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/lists/list_one/add_tag.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), { tag: "sarit" });
      return jsonResponse(responseBody);
    });

    const exitCode = await run(["lists", "add-tag", "list_one", "sarit", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("lists remove-tag sends DELETE and renders a readable confirmation", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/lists/list_one/remove_tag.json");
      assert.equal(options.method, "DELETE");
      assert.deepEqual(JSON.parse(options.body), { tag: "sarit" });
      return jsonResponse({
        prefix_id: "list_one",
        name: "Target list",
        tags: []
      });
    });

    const exitCode = await run(["lists", "remove-tag", "list_one", "sarit"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Removed tag sarit from list Target list \(list_one\)\./);
  });
});

test("lists delete calls the expected api endpoint and supports json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      deleted: true,
      prefix_id: "list_one",
      name: "Old target list",
      reassigned_agent_count: 2
    };
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/lists/list_one.json");
      assert.equal(options.method, "DELETE");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.equal(options.body, undefined);
      return jsonResponse(responseBody);
    });

    const exitCode = await run(["lists", "delete", "list_one", "--confirm", "true", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("lists delete renders a readable confirmation", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse({
      deleted: true,
      prefix_id: "list_one",
      name: "Old target list",
      reassigned_agent_count: 2
    }));

    const exitCode = await run(["lists", "delete", "list_one", "--confirm", "Y"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Deleted list Old target list \(list_one\)\./);
    assert.match(stdout.output, /Reassigned agents: 2/);
  });
});

test("lists delete requires explicit confirmation", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const stderr = captureStream();
    const fetch = createFetch(() => {
      throw new Error("delete should not call the API without confirmation");
    });

    const exitCode = await run(["lists", "delete", "list_one"], { env, fetch, stdout, stderr });

    assert.equal(exitCode, 1);
    assert.equal(stdout.output, "");
    assert.match(stderr.output, /Error: Usage: audienti lists delete <list_id> --confirm <yes\|true\|Y\|y>/);
  });
});

test("list and motion mutation commands call the expected api endpoints with json output", async () => {
  const cases = [
    {
      args: ["lists", "add-prospects", "list_one", "prsp_one", "42", "--json"],
      url: "https://app.audienti.com/api/v1/accounts/acct_one/lists/list_one/prospects.json",
      method: "POST",
      requestBody: { prospect_ids: ["prsp_one", "42"] },
      responseBody: { added: ["prsp_one", "42"], failed: [] }
    },
    {
      args: ["lists", "remove-prospects", "list_one", "prsp_one", "--json"],
      url: "https://app.audienti.com/api/v1/accounts/acct_one/lists/list_one/prospects.json",
      method: "DELETE",
      requestBody: { prospect_ids: ["prsp_one"] },
      responseBody: { removed: ["prsp_one"], failed: [] }
    },
    {
      args: ["motions", "add-prospects", "motn_one", "prsp_one", "prsp_two", "--assigned-user", "me", "--json"],
      url: "https://app.audienti.com/api/v1/accounts/acct_one/motions/motn_one/prospects.json",
      method: "POST",
      requestBody: { prospect_ids: ["prsp_one", "prsp_two"], assigned_user_id: "me" },
      responseBody: { assigned: ["prsp_one", "prsp_two"], failed: [] }
    }
  ];

  for (const { args, url: expectedUrl, method, requestBody, responseBody } of cases) {
    await withTempConfigHome(async ({ env }) => {
      await writeConfig({
        host: "https://app.audienti.com",
        token: "saved-token",
        accountId: "acct_one",
        accountName: "One"
      }, { env });

      const stdout = captureStream();
      const fetch = createFetch((url, options) => {
        assert.equal(url.toString(), expectedUrl);
        assert.equal(options.method, method);
        assert.equal(options.headers.Authorization, "Bearer saved-token");
        assert.deepEqual(JSON.parse(options.body), requestBody);
        return jsonResponse(responseBody);
      });

      const exitCode = await run(args, { env, fetch, stdout });

      assert.equal(exitCode, 0);
      assert.deepEqual(JSON.parse(stdout.output), responseBody);
    });
  }
});

test("list and motion mutation commands render readable summaries", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const responses = [
      jsonResponse({ added: ["prsp_one"], failed: [] }),
      jsonResponse({ assigned: ["prsp_one"], failed: [{ id: "prsp_missing", reason: "not_found" }] })
    ];
    const fetch = createFetch(() => responses.shift());

    let exitCode = await run(["lists", "add-prospects", "list_one", "prsp_one"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Added 1 prospects to list list_one\./);
    assert.match(stdout.output, /Failures: 0/);

    stdout.output = "";

    exitCode = await run(["motions", "add-prospects", "motn_one", "prsp_one", "prsp_missing"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Assigned 1 prospects to motion motn_one\./);
    assert.match(stdout.output, /Failures: 1/);
    assert.match(stdout.output, /- prsp_missing: not_found/);
  });
});

test("bulk mutation commands render per-prospect failures when every prospect is rejected", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const rejectedBody = { added: [], failed: [{ id: "prsp_missing", reason: "not_found" }] };
    const responses = [
      jsonResponse(rejectedBody, { status: 422 }),
      jsonResponse(rejectedBody, { status: 422 })
    ];
    const fetch = createFetch(() => responses.shift());

    let exitCode = await run(["lists", "add-prospects", "list_one", "prsp_missing"], { env, fetch, stdout });
    assert.equal(exitCode, 1);
    assert.match(stdout.output, /No prospects were added to list list_one\./);
    assert.match(stdout.output, /Failures: 1/);
    assert.match(stdout.output, /- prsp_missing: not_found/);

    stdout.output = "";

    exitCode = await run(["lists", "add-prospects", "list_one", "prsp_missing", "--json"], { env, fetch, stdout });
    assert.equal(exitCode, 1);
    assert.deepEqual(JSON.parse(stdout.output), rejectedBody);
  });
});

test("validation errors surface the server's errors array", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const stderr = captureStream();
    const fetch = createFetch(() =>
      jsonResponse({ errors: ["System lists cannot be renamed."] }, { status: 422 }));

    const exitCode = await run(["lists", "update", "list_one", "--name", "Renamed"], { env, fetch, stdout, stderr });

    assert.equal(exitCode, 1);
    assert.match(stderr.output, /Audienti rejected the request: System lists cannot be renamed\./);
  });
});

test("prospects import posts a LinkedIn URL and renders a poll command", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospect_imports.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), {
        linkedin_url: "https://www.linkedin.com/in/pat-prospect",
        list_id: "list_one",
        assigned_user_id: "me"
      });
      return jsonResponse({
        prefix_id: "primp_one",
        status: "running",
        ready: false,
        prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
        profile: { status: "queued" }
      }, { status: 201 });
    });

    const exitCode = await run([
      "prospects",
      "import",
      "https://www.linkedin.com/in/pat-prospect",
      "--list",
      "list_one",
      "--assigned-user",
      "me"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Started prospect import primp_one\./);
    assert.match(stdout.output, /Status: running/);
    assert.match(stdout.output, /Prospect: Pat Prospect \(prsp_one\)/);
    assert.match(stdout.output, /Run `audienti prospects import-status primp_one`/);
  });
});

test("prospects import sends motion and list ids when both are provided", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospect_imports.json");
      assert.deepEqual(JSON.parse(options.body), {
        linkedin_url: "https://www.linkedin.com/in/pat-prospect",
        list_id: "list_one",
        motion_id: "motn_one",
        assigned_user_id: "me"
      });
      return jsonResponse({
        prefix_id: "primp_one",
        status: "running",
        ready: false,
        prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
        profile: { status: "queued" }
      }, { status: 201 });
    });

    const exitCode = await run([
      "prospects",
      "import",
      "https://www.linkedin.com/in/pat-prospect",
      "--list",
      "list_one",
      "--motion",
      "motn_one",
      "--assigned-user",
      "me"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Started prospect import primp_one\./);
  });
});

test("prospects assign posts prospect ids and assignee", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospects/assign.json");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), {
        prospect_ids: ["prsp_one", "prsp_two"],
        assigned_user_id: "me"
      });
      return jsonResponse({
        assigned: ["prsp_one", "prsp_two"],
        failed: []
      });
    });

    const exitCode = await run([
      "prospects",
      "assign",
      "prsp_one",
      "prsp_two",
      "--assigned-user",
      "me"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Assigned 2 prospects to me\./);
    assert.match(stdout.output, /Failures: 0/);
  });
});

test("prospects assign resolves me to the saved account user", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One",
      accountUserId: "42",
      accountUserName: "User One",
      accountUserEmail: "one@example.com"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospects/assign.json");
      assert.deepEqual(JSON.parse(options.body), {
        prospect_ids: ["prsp_one"],
        assigned_user_id: "42"
      });
      return jsonResponse({ assigned: ["prsp_one"], failed: [] });
    });

    const exitCode = await run(["prospects", "assign", "prsp_one", "--assigned-user", "me"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Assigned 1 prospects to 42\./);
  });
});

test("prospects assign supports unassign", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospects/assign.json");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), {
        prospect_ids: ["prsp_one"],
        assigned_user_id: "unassign"
      });
      return jsonResponse({
        assigned: ["prsp_one"],
        failed: []
      });
    });

    const exitCode = await run([
      "prospects",
      "assign",
      "prsp_one",
      "--assigned-user",
      "unassign"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Unassigned 1 prospects\./);
  });
});

test("prospects disposition commands call shared account endpoints", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      if (url.pathname === "/api/v1/accounts/acct_one/prospects/prsp_one/reject.json") {
        assert.equal(options.method, "POST");
        assert.equal(options.body, undefined);
        return jsonResponse({
          status: "rejected",
          prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
          account_prospect: { status: "rejected" },
          system_list: { prefix_id: "list_rejected", name: "Rejected" }
        });
      }

      if (url.pathname === "/api/v1/accounts/acct_one/prospects/prsp_one/nurture.json") {
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), { inactive_reason: "non_responsive" });
        return jsonResponse({
          status: "nurtured",
          prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
          account_prospect: { status: "inactive", inactive_reason: "non_responsive" },
          system_list: { prefix_id: "list_inactive", name: "Inactive" }
        });
      }

      if (url.pathname === "/api/v1/accounts/acct_one/prospects/prsp_one/restore.json") {
        assert.equal(options.method, "POST");
        assert.equal(options.body, undefined);
        return jsonResponse({
          status: "restored",
          prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
          account_prospect: { status: "active" }
        });
      }

      throw new Error(`unexpected request ${options.method || "GET"} ${url.pathname}`);
    });

    let exitCode = await run(["prospects", "reject", "prsp_one"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Rejected prospect Pat Prospect \(prsp_one\)\./);
    assert.match(stdout.output, /List: Rejected \(list_rejected\)/);

    stdout.output = "";
    exitCode = await run(["prospects", "nurture", "prsp_one", "--reason", "non_responsive"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Moved to nurture prospect Pat Prospect \(prsp_one\)\./);
    assert.match(stdout.output, /Inactive reason: non_responsive/);

    stdout.output = "";
    exitCode = await run(["prospects", "restore", "prsp_one"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Restored prospect Pat Prospect \(prsp_one\)\./);
  });
});

test("prospects disposition commands support json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      status: "restored",
      prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
      account_prospect: { status: "active" }
    };
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospects/prsp_one/restore.json");
      assert.equal(options.method, "POST");
      return jsonResponse(responseBody);
    });

    const exitCode = await run(["prospects", "restore", "prsp_one", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("prospects set-status maps cleanup statuses to shared disposition endpoints", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const requests = [];
    const fetch = createFetch((url, options) => {
      requests.push({ path: url.pathname, method: options.method, body: options.body ? JSON.parse(options.body) : undefined });

      if (url.pathname.endsWith("/nurture.json")) {
        return jsonResponse({
          status: "nurtured",
          prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
          account_prospect: { status: "inactive", inactive_reason: "not_fit" },
          system_list: { prefix_id: "list_inactive", name: "Inactive" }
        });
      }

      if (url.pathname.endsWith("/reject.json")) {
        return jsonResponse({
          status: "rejected",
          prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
          account_prospect: { status: "rejected" }
        });
      }

      if (url.pathname.endsWith("/restore.json")) {
        return jsonResponse({
          status: "restored",
          prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
          account_prospect: { status: "active" }
        });
      }

      throw new Error(`unexpected request ${options.method || "GET"} ${url.pathname}`);
    });

    let exitCode = await run(["prospects", "set-status", "prsp_one", "--status", "not_fit"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Set status for prospect Pat Prospect \(prsp_one\)\./);
    assert.match(stdout.output, /Inactive reason: not_fit/);

    stdout.output = "";
    exitCode = await run(["prospects", "set-status", "prsp_one", "--status", "rejected"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Set status for prospect Pat Prospect \(prsp_one\)\./);

    stdout.output = "";
    exitCode = await run(["prospects", "set-status", "prsp_one", "--status", "active"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Set status for prospect Pat Prospect \(prsp_one\)\./);

    assert.deepEqual(requests, [
      {
        path: "/api/v1/accounts/acct_one/prospects/prsp_one/nurture.json",
        method: "POST",
        body: { inactive_reason: "not_fit" }
      },
      {
        path: "/api/v1/accounts/acct_one/prospects/prsp_one/reject.json",
        method: "POST",
        body: undefined
      },
      {
        path: "/api/v1/accounts/acct_one/prospects/prsp_one/restore.json",
        method: "POST",
        body: undefined
      }
    ]);
  });
});

test("prospects set-status rejects unsupported statuses without calling the api", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stderr = captureStream();
    const fetch = createFetch(() => {
      throw new Error("status validation must happen before API calls");
    });

    const exitCode = await run(["prospects", "set-status", "prsp_one", "--status", "paused"], { env, fetch, stderr });

    assert.equal(exitCode, 1);
    assert.match(stderr.output, /Usage: audienti prospects set-status <prsp_id>/);
  });
});

test("prospects lock and unlock call shared account endpoints", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      if (url.pathname === "/api/v1/accounts/acct_one/prospects/prsp_one/lock.json") {
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), {
          lock_kind: "protected_relationship",
          lock_note: "Emergency hold"
        });
        return jsonResponse({
          status: "locked",
          prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
          account_prospect: {
            status: "active",
            locked_at: "2026-07-17T12:00:00.000Z",
            lock_kind: "protected_relationship",
            lock_note: "Emergency hold"
          }
        });
      }

      if (url.pathname === "/api/v1/accounts/acct_one/prospects/prsp_one/unlock.json") {
        assert.equal(options.method, "POST");
        assert.equal(options.body, undefined);
        return jsonResponse({
          status: "unlocked",
          prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
          account_prospect: { status: "active" }
        });
      }

      throw new Error(`unexpected request ${options.method || "GET"} ${url.pathname}`);
    });

    let exitCode = await run(["prospects", "lock", "prsp_one", "--kind", "protected_relationship", "--note", "Emergency hold"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Locked prospect Pat Prospect \(prsp_one\)\./);
    assert.match(stdout.output, /Lock kind: protected_relationship/);
    assert.match(stdout.output, /Lock note: Emergency hold/);

    stdout.output = "";
    exitCode = await run(["prospects", "unlock", "prsp_one"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Unlocked prospect Pat Prospect \(prsp_one\)\./);
  });
});

test("prospects import-batch imports jsonl rows with command defaults", async () => {
  await withTempConfigHome(async ({ root, env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });
    const importPath = join(root, "prospects.jsonl");
    await writeFile(importPath, [
      JSON.stringify({ linkedin_url: "https://www.linkedin.com/in/pat-prospect" }),
      JSON.stringify({ url: "https://www.linkedin.com/in/sam-prospect", assigned_user_id: "42" })
    ].join("\n"), "utf8");

    const stdout = captureStream();
    const fetch = createFetch((url, options, calls) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospect_imports.json");
      assert.equal(options.method, "POST");
      const bodies = [
        {
          linkedin_url: "https://www.linkedin.com/in/pat-prospect",
          list_id: "list_one",
          motion_id: "motn_one",
          assigned_user_id: "me"
        },
        {
          linkedin_url: "https://www.linkedin.com/in/sam-prospect",
          list_id: "list_one",
          motion_id: "motn_one",
          assigned_user_id: "42"
        }
      ];
      assert.deepEqual(JSON.parse(options.body), bodies[calls.length - 1]);
      return jsonResponse({
        prefix_id: `primp_${calls.length}`,
        status: "running",
        prospect: { prefix_id: `prsp_${calls.length}`, display_name: `Prospect ${calls.length}` }
      }, { status: 201 });
    });

    const exitCode = await run([
      "prospects",
      "import-batch",
      "--file",
      importPath,
      "--list",
      "list_one",
      "--motion",
      "motn_one",
      "--assigned-user",
      "me"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Started 2 prospect imports\./);
    assert.match(stdout.output, /primp_1\tProspect 1\tprsp_1\trunning/);
    assert.match(stdout.output, /Failures: 0/);
  });
});

test("prospects import-batch supports json output and keeps failed rows visible", async () => {
  await withTempConfigHome(async ({ root, env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });
    const importPath = join(root, "prospects.csv");
    await writeFile(importPath, "linkedin_url,assigned_user_id\nhttps://www.linkedin.com/in/pat-prospect,me\nhttps://www.linkedin.com/in/bad-prospect,me\n", "utf8");

    const stdout = captureStream();
    const fetch = createFetch((url, options, calls) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospect_imports.json");
      if (calls.length === 2) {
        return jsonResponse({ error: "LinkedIn profile not found." }, { status: 422 });
      }

      return jsonResponse({
        prefix_id: "primp_one",
        status: "running",
        prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" }
      }, { status: 201 });
    });

    const exitCode = await run([
      "prospects",
      "import-batch",
      "--file",
      importPath,
      "--json"
    ], { env, fetch, stdout });

    const payload = JSON.parse(stdout.output);
    assert.equal(exitCode, 1);
    assert.equal(payload.summary.total, 2);
    assert.equal(payload.summary.started, 1);
    assert.equal(payload.summary.failed, 1);
    assert.equal(payload.imports[0].prefix_id, "primp_one");
    assert.equal(payload.failed[0].row, 2);
    assert.equal(payload.failed[0].linkedin_url, "https://www.linkedin.com/in/bad-prospect");
    assert.equal(payload.failed[0].error, "LinkedIn profile not found.");
  });
});

test("prospects import supports json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      prefix_id: "primp_one",
      status: "running",
      ready: false,
      prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" }
    };
    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse(responseBody, { status: 201 }));

    const exitCode = await run([
      "prospects",
      "import",
      "https://www.linkedin.com/in/pat-prospect",
      "--json"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("prospects import-status renders current import data", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospect_imports/primp_one.json");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse({
        prefix_id: "primp_one",
        status: "completed",
        ready: true,
        pipeline: {
          enrichment_status: "enriched",
          expansion_status: "completed"
        },
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect",
          company: "ExampleCo"
        },
        data: {
          emails: [{ value: "pat@example.com" }],
          phones: [{ value: "+15551234567" }],
          social_profiles: [{ identifier: "linkedin/profile", url: "https://www.linkedin.com/in/pat-prospect" }]
        }
      });
    });

    const exitCode = await run(["prospects", "import-status", "primp_one"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Import: primp_one/);
    assert.match(stdout.output, /Status: completed/);
    assert.match(stdout.output, /Ready: yes/);
    assert.match(stdout.output, /Prospect: Pat Prospect \(prsp_one\)/);
    assert.match(stdout.output, /Email: pat@example.com/);
    assert.match(stdout.output, /Phone: \+15551234567/);
    assert.match(stdout.output, /Social profiles: 1/);
  });
});

test("tools get help documents email and phone lookup by LinkedIn URL", async () => {
  const stdout = captureStream();

  const exitCode = await run(["tools", "get", "help"], { stdout });

  assert.equal(exitCode, 0);
  assert.match(stdout.output, /Usage:\n  audienti tools get <email\|phone> --url <linkedin_url>/);
  assert.match(stdout.output, /Uses the existing prospect import enrichment pipeline/);
  assert.match(stdout.output, /phone lookup still depends on the email waterfall selecting an email first/);
});

test("tools get email imports a LinkedIn URL, polls import status, and prints the selected email", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options, calls) => {
      if (calls.length === 1) {
        assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospect_imports.json");
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), {
          linkedin_url: "https://www.linkedin.com/in/pat-prospect"
        });

        return jsonResponse({
          prefix_id: "primp_one",
          status: "running",
          ready: false,
          prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" }
        }, { status: 201 });
      }

      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospect_imports/primp_one.json");
      assert.equal(options.method, "GET");

      return jsonResponse({
        prefix_id: "primp_one",
        status: "completed",
        ready: true,
        pipeline: {
          enrichment_status: "enriched",
          expansion_status: "completed"
        },
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        data: {
          emails: [{ value: "pat@example.com" }],
          phones: []
        }
      });
    });

    const exitCode = await run([
      "tools",
      "get",
      "email",
      "--url",
      "https://www.linkedin.com/in/pat-prospect"
    ], {
      env,
      fetch,
      stdout,
      sleep: async () => {}
    });

    assert.equal(exitCode, 0);
    assert.equal(fetch.calls.length, 2);
    assert.match(stdout.output, /^pat@example\.com\n$/);
  });
});

test("tools get phone returns a readable not-found result after the import pipeline completes", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options, calls) => {
      if (calls.length === 1) {
        assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospect_imports.json");
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), {
          linkedin_url: "https://www.linkedin.com/in/no-phone"
        });

        return jsonResponse({
          prefix_id: "primp_two",
          status: "running",
          ready: false,
          prospect: { prefix_id: "prsp_two", display_name: "No Phone" }
        }, { status: 201 });
      }

      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospect_imports/primp_two.json");
      assert.equal(options.method, "GET");

      return jsonResponse({
        prefix_id: "primp_two",
        status: "completed",
        ready: true,
        pipeline: {
          enrichment_status: "enriched",
          expansion_status: "completed"
        },
        prospect: {
          prefix_id: "prsp_two",
          display_name: "No Phone"
        },
        data: {
          emails: [{ value: "nophone@example.com" }],
          phones: []
        }
      });
    });

    const exitCode = await run([
      "tools",
      "get",
      "phone",
      "--url",
      "https://www.linkedin.com/in/no-phone"
    ], {
      env,
      fetch,
      stdout,
      sleep: async () => {}
    });

    assert.equal(exitCode, 0);
    assert.equal(fetch.calls.length, 2);
    assert.match(stdout.output, /No phone found for https:\/\/www\.linkedin\.com\/in\/no-phone\./);
    assert.match(stdout.output, /Import: primp_two/);
  });
});

test("prospects list sends filters and renders a readable table", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects.json");
      assert.equal(url.searchParams.get("query"), "risk");
      assert.equal(url.searchParams.get("motion_id"), "motn_one");
      assert.equal(url.searchParams.get("list_id"), "list_one");
      assert.equal(url.searchParams.get("stage"), "new");
      assert.equal(url.searchParams.get("assigned_user_id"), "me");
      assert.equal(url.searchParams.get("limit"), "5");
      assert.equal(url.searchParams.get("page"), null);
      assert.equal(url.searchParams.get("offset"), null);
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse({
        prospects: [{
          prefix_id: "prsp_one",
          display_name: "Pat Prospect",
          company: "ExampleCo",
          account_prospect: { pipeline_stage: "new" },
          queue: { recommended_action_label: "Send connection request" }
        }],
        meta: { total_count: 1, limit: 5 }
      });
    });

    const exitCode = await run([
      "prospects",
      "list",
      "--query",
      "risk",
      "--motion",
      "motn_one",
      "--list",
      "list_one",
      "--stage",
      "new",
      "--assigned-user",
      "me",
      "--limit",
      "5"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /PROSPECT ID\tSTAGE\tNAME\tCOMPANY\tNEXT ACTION/);
    assert.match(stdout.output, /prsp_one\tnew\tPat Prospect\tExampleCo\tSend connection request/);
  });
});

test("prospects list can filter unassigned prospects", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url) => {
      assert.equal(url.searchParams.get("assigned_user_id"), "unassigned");
      return jsonResponse({
        prospects: [],
        meta: { total_count: 0, limit: 20, offset: 0, page: 1, returned_count: 0 }
      });
    });

    const exitCode = await run(["prospects", "list", "--assigned-user", "unassigned"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /No prospects found\./);
  });
});

test("prospects list supports a dedicated company filter", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects.json");
      assert.equal(url.searchParams.get("company"), "Honeywell");
      assert.equal(url.searchParams.get("query"), null);
      assert.equal(options.headers.Authorization, "Bearer saved-token");

      return jsonResponse({
        prospects: [{
          prefix_id: "prsp_one",
          display_name: "Pat Prospect",
          company: "Honeywell",
          account_prospect: { pipeline_stage: "new" },
          queue: { recommended_action_label: "Send connection request" }
        }],
        meta: { total_count: 1, limit: 20 }
      });
    });

    const exitCode = await run([
      "prospects",
      "list",
      "--company",
      "Honeywell"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /prsp_one\tnew\tPat Prospect\tHoneywell\tSend connection request/);
  });
});

test("companies search sends the query and renders persisted company profiles", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/companies.json");
      assert.equal(url.searchParams.get("query"), "Honeywell");
      assert.equal(options.headers.Authorization, "Bearer saved-token");

      return jsonResponse({
        companies: [{
          id: 42,
          prefix_id: "prof_honeywell",
          citation_id: "linkedin/company:honeywell/12345",
          identifier: "linkedin/company",
          username: "honeywell",
          display_name: "Honeywell",
          url: "https://www.linkedin.com/company/honeywell",
          industry: "Industrial Automation",
          location: "Charlotte, North Carolina, United States"
        }],
        meta: {returned_count: 1}
      });
    });

    const exitCode = await run([
      "companies",
      "search",
      "--query",
      "Honeywell"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /PROFILE ID\tCITATION ID\tNAME\tLINKEDIN\tINDUSTRY\tLOCATION/);
    assert.match(stdout.output, /prof_honeywell\tlinkedin\/company:honeywell\/12345\tHoneywell\thttps:\/\/www\.linkedin\.com\/company\/honeywell\tIndustrial Automation\tCharlotte, North Carolina, United States/);
  });
});

test("dnc add and import call account dnc endpoints", async () => {
  await withTempConfigHome(async ({ env, root }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const importPath = join(root, "dnc.txt");
    await writeFile(importPath, "import-one@example.com\nimport-two@example.com\n");

    const stdout = captureStream();
    const fetch = createFetch((url, options, calls) => {
      if (calls.length === 1) {
        assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/dnc.json");
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), { value: "person@example.com" });
        return jsonResponse({
          status: "created",
          dnc_entry: {
            id: 123,
            canonical_value: "person@example.com",
            citation_id: "email/profile:person@example.com"
          }
        }, { status: 201 });
      }

      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/dnc/import.json");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), {
        values: ["import-one@example.com", "import-two@example.com"],
        filename: "dnc.txt"
      });
      return jsonResponse({
        accepted_count: 2,
        skipped_count: 0,
        invalid_count: 0,
        matched_prospect_count: 1
      });
    });

    let exitCode = await run(["dnc", "add", "person@example.com"], { env, fetch, stdout });
    assert.equal(exitCode, 0);

    exitCode = await run(["dnc", "import", "--file", importPath], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /DNC entry created: person@example.com/);
    assert.match(stdout.output, /Imported DNC entries\. Accepted 2, skipped 0, invalid 0, matched 1\./);
  });
});

test("company-rules create and apply call account rule endpoints", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options, calls) => {
      if (calls.length === 1) {
        assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/company_rules.json");
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), {
          company_rule: {
            name: "Competitor",
            linkedin_company_url: "https://www.linkedin.com/company/competitor",
            disposition: "monitor",
            scope_kind: "account_user",
            account_user_id: "me"
          }
        });
        return jsonResponse({
          company_rule: {
            id: 7,
            name: "Competitor",
            disposition: "monitor",
            scope_kind: "account_user",
            account_user_id: 42,
            account_user_email: "owner@example.com",
            active: true
          }
        }, { status: 201 });
      }

      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/company_rules/7/apply.json");
      assert.equal(options.method, "POST");
      return jsonResponse({
        policy_id: 7,
        matched_count: 3,
        applied_count: 2,
        no_match_count: 10
      });
    });

    let exitCode = await run([
      "company-rules",
      "create",
      "--name",
      "Competitor",
      "--linkedin-url",
      "https://www.linkedin.com/company/competitor",
      "--disposition",
      "monitor",
      "--user",
      "me"
    ], { env, fetch, stdout });
    assert.equal(exitCode, 0);

    exitCode = await run(["company-rules", "apply", "7"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Created company rule Competitor \(7\)\./);
    assert.match(stdout.output, /Applied company rule\. Matched 3, changed 2\./);
  });
});

test("company-rules update accepts re-key-only domain and linkedin url updates", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options, calls) => {
      assert.equal(url.toString(), `https://app.audienti.com/api/v1/accounts/acct_one/company_rules/7.json`);
      assert.equal(options.method, "PATCH");
      if (calls.length === 1) {
        assert.deepEqual(JSON.parse(options.body), {
          company_rule: {
            domain: "new.example"
          }
        });
      } else {
        assert.deepEqual(JSON.parse(options.body), {
          company_rule: {
            linkedin_company_url: "https://www.linkedin.com/company/new-co"
          }
        });
      }
      return jsonResponse({
        company_rule: {
          id: 7,
          domain: "new.example",
          disposition: "monitor",
          scope_kind: "account",
          active: true
        }
      });
    });

    let exitCode = await run(["company-rules", "update", "7", "--domain", "new.example"], { env, fetch, stdout });
    assert.equal(exitCode, 0);

    exitCode = await run(["company-rules", "update", "7", "--linkedin-url", "https://www.linkedin.com/company/new-co"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Updated company rule/);
  });
});

test("prospects list supports filtering by company profile id", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects.json");
      assert.equal(url.searchParams.get("company_profile_id"), "prof_honeywell");
      assert.equal(options.headers.Authorization, "Bearer saved-token");

      return jsonResponse({
        prospects: [{
          prefix_id: "prsp_one",
          display_name: "Pat Prospect",
          company: "Honeywell",
          account_prospect: { pipeline_stage: "new" },
          queue: { recommended_action_label: "Send connection request" }
        }],
        meta: { total_count: 1, limit: 20 }
      });
    });

    const exitCode = await run([
      "prospects",
      "list",
      "--company-profile",
      "prof_honeywell"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /prsp_one\tnew\tPat Prospect\tHoneywell\tSend connection request/);
  });
});

test("prospects check lists suspect prospects with operator URLs", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One",
      accountUserId: "42"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects.json");
      assert.equal(url.searchParams.get("data_quality"), "missing_certified_company");
      assert.equal(url.searchParams.get("motion_id"), "motn_one");
      assert.equal(url.searchParams.get("assigned_user_id"), "42");
      assert.equal(url.searchParams.get("limit"), "5");
      assert.equal(options.headers.Authorization, "Bearer saved-token");

      return jsonResponse({
        prospects: [{
          prefix_id: "prsp_missing",
          display_name: "Missing Employer",
          company: "ImportedCo",
          company_certification: {
            status: "missing",
            reason: "missing_employment_citation",
            reported_company: "ImportedCo"
          },
          account_prospect: {
            pipeline_stage: "identified",
            motion: { prefix_id: "motn_one", name: "Wine Campaign" }
          }
        }],
        meta: { total_count: 1, limit: 5, returned_count: 1 }
      });
    });

    const exitCode = await run([
      "prospects",
      "check",
      "--motion",
      "motn_one",
      "--assigned-user",
      "me",
      "--limit",
      "5"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Suspect prospects: 1/);
    assert.match(stdout.output, /PROSPECT ID\tSTAGE\tNAME\tREPORTED COMPANY\tCERTIFIED\tREASON\tURL/);
    assert.match(stdout.output, /prsp_missing\tidentified\tMissing Employer\tImportedCo\tno\tmissing_employment_citation\thttps:\/\/app\.audienti\.com\/prospects\/prsp_missing/);
  });
});

test("prospects check adds operator URLs to json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url) => {
      assert.equal(url.searchParams.get("data_quality"), "missing_certified_company");
      return jsonResponse({
        prospects: [{
          prefix_id: "prsp_missing",
          display_name: "Missing Employer",
          company_certification: { status: "missing", reason: "missing_employment_citation" }
        }],
        meta: { total_count: 1 }
      });
    });

    const exitCode = await run(["prospects", "check", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(stdout.output).prospects[0].app_url, "https://app.audienti.com/prospects/prsp_missing");
  });
});

test("prospects check rejects company filters", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const stderr = captureStream();
    const fetch = createFetch(() => {
      throw new Error("fetch should not be called");
    });

    const exitCode = await run(["prospects", "check", "--company", "Honeywell"], { env, fetch, stdout, stderr });

    assert.equal(exitCode, 1);
    assert.match(stderr.output, /Company filters are not supported for `prospects check`/);
  });
});

test("prospects list accepts play as a motion filter alias", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects.json");
      assert.equal(url.searchParams.get("play_id"), "motn_one");
      assert.equal(url.searchParams.get("motion_id"), null);
      return jsonResponse({
        prospects: [],
        meta: { total_count: 0, limit: 20, offset: 0, page: 1, returned_count: 0, has_more: false }
      });
    });

    const exitCode = await run(["prospects", "list", "--play", "motn_one"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /No prospects found/);
  });
});

test("prospects list can include all profiles in json and table output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const tableStdout = captureStream();
    const jsonStdout = captureStream();
    const responseBody = {
      prospects: [{
        prefix_id: "prsp_one",
        display_name: "Pat Prospect",
        company: "ExampleCo",
        account_prospect: { pipeline_stage: "new" },
        profiles: [
          { type: "linkedin", identifier: "linkedin/profile", citation_id: "linkedin/profile:pat-prospect", username: "pat-prospect", url: "https://www.linkedin.com/in/pat-prospect" },
          { type: "email", identifier: "email/profile", citation_id: "email/profile:pat@example.com", username: "pat@example.com", url: "mailto:pat@example.com" }
        ],
        profile_identifiers: {
          columns: ["linkedin/profile", "linkedin/company", "twitter/profile", "phone/profile", "email/profile"],
          values: {
            "linkedin/profile": [{ citation_id: "linkedin/profile:pat-prospect", identifier: "linkedin/profile", username: "pat-prospect", url: "https://www.linkedin.com/in/pat-prospect" }],
            "linkedin/company": [],
            "twitter/profile": [],
            "phone/profile": [],
            "email/profile": [{ citation_id: "email/profile:pat@example.com", identifier: "email/profile", username: "pat@example.com", url: "mailto:pat@example.com" }]
          }
        },
        queue: { recommended_action_label: "Send connection request" }
      }],
      meta: {
        total_count: 1,
        limit: 20,
        offset: 0,
        page: 1,
        returned_count: 1,
        has_more: false,
        profile_identifier_columns: ["linkedin/profile", "linkedin/company", "twitter/profile", "phone/profile", "email/profile"]
      }
    };

    const fetch = createFetch((url) => {
      assert.equal(url.searchParams.get("include_profiles"), "true");
      return jsonResponse(responseBody);
    });

    let exitCode = await run(["prospects", "list", "--profiles"], { env, fetch, stdout: tableStdout });

    assert.equal(exitCode, 0);
    assert.match(tableStdout.output, /PROSPECT ID\tSTAGE\tNAME\tCOMPANY\tlinkedin\/profile\tlinkedin\/company\ttwitter\/profile\tphone\/profile\temail\/profile\tNEXT ACTION/);
    assert.match(tableStdout.output, /linkedin\/profile:pat-prospect\t\t\t\temail\/profile:pat@example\.com\tSend connection request/);

    exitCode = await run(["prospects", "list", "--profiles", "--json"], { env, fetch, stdout: jsonStdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(jsonStdout.output), responseBody);
  });
});

test("prospects list supports explicit page pagination", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url) => {
      assert.equal(url.searchParams.get("limit"), "25");
      assert.equal(url.searchParams.get("page"), "3");
      assert.equal(url.searchParams.get("offset"), null);
      return jsonResponse({
        prospects: [],
        meta: { total_count: 0, limit: 25, offset: 50, page: 3, returned_count: 0, has_more: false }
      });
    });

    const exitCode = await run(["prospects", "list", "--page", "3", "--limit", "25"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /No prospects found/);
  });
});

test("prospects list can fetch all matching rows up to a total cap", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url) => {
      const offset = url.searchParams.get("offset");
      const limit = url.searchParams.get("limit");

      if (offset === "0") {
        assert.equal(limit, "3");
        return jsonResponse({
          prospects: [
            { prefix_id: "prsp_one", display_name: "Pat Prospect", company: "ExampleCo", account_prospect: { pipeline_stage: "new", status: "active", fit_score: 88 }, lists: [], queue: { recommended_action_label: "Wait" } },
            { prefix_id: "prsp_two", display_name: "Sam Seller", company: "ExampleCo", account_prospect: { pipeline_stage: "identified", status: "active", fit_score: 71 }, lists: [], queue: { recommended_action_label: "Write" } }
          ],
          meta: { total_count: 3, limit: 2, offset: 0, page: 1, returned_count: 2, has_more: true }
        });
      }

      assert.equal(offset, "2");
      assert.equal(limit, "1");
      return jsonResponse({
        prospects: [
          { prefix_id: "prsp_three", display_name: "Alex Analyst", company: "OtherCo", account_prospect: { pipeline_stage: "pre_connect", status: "active", fit_score: 64 }, lists: [], queue: { recommended_action_label: "Wait" } }
        ],
        meta: { total_count: 3, limit: 1, offset: 2, page: 3, returned_count: 1, has_more: false }
      });
    });

    const exitCode = await run(["prospects", "list", "--all", "--limit", "3", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.equal(fetch.calls.length, 2);
    const payload = JSON.parse(stdout.output);
    assert.equal(payload.meta.total_count, 3);
    assert.equal(payload.meta.returned_count, 3);
    assert.equal(payload.meta.truncated, false);
    assert.deepEqual(payload.prospects.map((prospect) => prospect.prefix_id), ["prsp_one", "prsp_two", "prsp_three"]);
  });
});

test("prospects list can export a rich csv", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse({
      prospects: [{
        prefix_id: "prsp_one",
        display_name: "Pat Prospect",
        name: "Pat Prospect",
        title: "VP Growth",
        company: "ExampleCo",
        email: "pat@example.com",
        linkedin_url: "https://www.linkedin.com/in/pat-prospect",
        website: "https://example.com",
        updated_at: "2026-07-09T10:00:00Z",
        primary_profile: {
          prefix_id: "prof_one",
          identifier: "linkedin/profile",
          username: "pat-prospect",
          display_name: "Pat Prospect"
        },
        account_prospect: {
          id: 42,
          status: "active",
          fit_score: 88,
          pipeline_stage: "new",
          motion: { prefix_id: "motn_one", name: "Motion One", kind: "outbound", status: "active" }
        },
        lists: [{ prefix_id: "list_one", name: "Owned list" }],
        queue: { recommended_action_label: "Send connection request", rationale: "Good fit" }
      }],
      meta: { total_count: 1, limit: 20, offset: 0, page: 1, returned_count: 1, has_more: false }
    }));

    const exitCode = await run(["prospects", "list", "--csv"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /^prefix_id,display_name,name,kind,title,company,email,linkedin_url,website,/);
    assert.match(stdout.output, /prsp_one,Pat Prospect,Pat Prospect,,VP Growth,ExampleCo,pat@example.com,https:\/\/www\.linkedin\.com\/in\/pat-prospect,https:\/\/example\.com/);
    assert.match(stdout.output, /Owned list/);
    assert.match(stdout.output, /Send connection request/);
  });
});

test("lists prospects supports pagination and profiles", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/lists/list_one/prospects.json");
      assert.equal(url.searchParams.get("page"), "2");
      assert.equal(url.searchParams.get("limit"), "25");
      assert.equal(url.searchParams.get("include_profiles"), "true");
      assert.equal(options.headers.Authorization, "Bearer saved-token");

      return jsonResponse({
        prospects: [{
          prefix_id: "prsp_one",
          display_name: "Pat Prospect",
          company: "ExampleCo",
          account_prospect: { pipeline_stage: "new" },
          profiles: [
            { type: "linkedin", identifier: "linkedin/profile", citation_id: "linkedin/profile:pat-prospect", username: "pat-prospect", url: "https://www.linkedin.com/in/pat-prospect" }
          ],
          profile_identifiers: {
            columns: ["linkedin/profile", "linkedin/company", "twitter/profile", "phone/profile", "email/profile"],
            values: {
              "linkedin/profile": [{ citation_id: "linkedin/profile:pat-prospect", identifier: "linkedin/profile", username: "pat-prospect", url: "https://www.linkedin.com/in/pat-prospect" }],
              "linkedin/company": [],
              "twitter/profile": [],
              "phone/profile": [],
              "email/profile": []
            }
          },
          queue: { recommended_action_label: "Send connection request" }
        }],
        meta: {
          total_count: 26,
          limit: 25,
          offset: 25,
          page: 2,
          returned_count: 1,
          has_more: false,
          profile_identifier_columns: ["linkedin/profile", "linkedin/company", "twitter/profile", "phone/profile", "email/profile"]
        }
      });
    });

    const exitCode = await run(["lists", "prospects", "list_one", "--page", "2", "--limit", "25", "--profiles"], {
      env, fetch, stdout
    });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /PROSPECT ID\tSTAGE\tNAME\tCOMPANY\tlinkedin\/profile\tlinkedin\/company\ttwitter\/profile\tphone\/profile\temail\/profile\tNEXT ACTION/);
    assert.match(stdout.output, /linkedin\/profile:pat-prospect\t\t\t\t\tSend connection request/);
  });
});

test("motions and plays prospects share the same read command path", async () => {
  for (const args of [["motions", "prospects", "motn_one"], ["plays", "prospects", "motn_one"]]) {
    await withTempConfigHome(async ({ env }) => {
      await writeConfig({
        host: "https://app.audienti.com",
        token: "saved-token",
        accountId: "acct_one",
        accountName: "One"
      }, { env });

      const stdout = captureStream();
      const fetch = createFetch((url, options) => {
        assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/motions/motn_one/prospects.json");
        assert.equal(options.headers.Authorization, "Bearer saved-token");
        return jsonResponse({
          prospects: [{
            prefix_id: "prsp_one",
            display_name: "Pat Prospect",
            company: "ExampleCo",
            account_prospect: { pipeline_stage: "new" },
            queue: { recommended_action_label: "Wait" }
          }],
          meta: { total_count: 1, limit: 20, offset: 0, page: 1, returned_count: 1, has_more: false }
        });
      });

      const exitCode = await run(args, { env, fetch, stdout });

      assert.equal(exitCode, 0);
      assert.match(stdout.output, /PROSPECT ID\tSTAGE\tNAME\tCOMPANY\tNEXT ACTION/);
      assert.match(stdout.output, /prsp_one\tnew\tPat Prospect\tExampleCo\tWait/);
    });
  }
});

test("prospects message-types lists per-prospect surface keys", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/message_types.json");
      assert.equal(options.method, "GET");
      assert.equal(options.headers.Authorization, "Bearer saved-token");

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        message_surfaces: [
          {
            key: "post_accept_message",
            available: true,
            canonical_message_type: "direct_message",
            stage: "First direct message",
            channel: "LinkedIn"
          },
          {
            key: "email",
            available: false,
            canonical_message_type: "email",
            stage: "Email",
            channel: "Email",
            missing_reason: "No Email profile is available for this prospect."
          }
        ]
      });
    });

    const exitCode = await run(["prospects", "message-types", "prsp_one"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Prospect: Pat Prospect \(prsp_one\)/);
    assert.match(stdout.output, /TYPE\tAVAILABLE\tMESSAGE TYPE\tSTAGE\tCHANNEL/);
    assert.match(stdout.output, /post_accept_message\tyes\tdirect_message\tFirst direct message\tLinkedIn/);
    assert.match(stdout.output, /reason: No Email profile is available for this prospect\./);
  });
});

test("prospects timeline requests filtered timeline items and renders readable rows", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/timeline.json");
      assert.equal(url.searchParams.get("types"), "post,comment,reaction");
      assert.equal(url.searchParams.get("limit"), "25");
      assert.equal(options.method, "GET");
      assert.equal(options.headers.Authorization, "Bearer saved-token");

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        timeline: [
          {
            prefix_id: "post_one",
            type: "post",
            occurred_at: "2026-07-09T14:20:00Z",
            url: "https://www.linkedin.com/feed/update/one",
            text: "A recent post",
            profile: {
              url: "https://www.linkedin.com/in/pat-prospect"
            }
          }
        ],
        meta: {
          limit: 25,
          returned_count: 1,
          types: ["post", "comment", "reaction"],
          sort: "occurred_at_desc"
        }
      });
    });

    const exitCode = await run([
      "prospects",
      "timeline",
      "prsp_one",
      "--types",
      "post,comment,reaction",
      "--limit",
      "25"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Prospect: Pat Prospect \(prsp_one\)/);
    assert.match(stdout.output, /OCCURRED AT\tTYPE\tTEXT\tURL/);
    assert.match(stdout.output, /2026-07-09T14:20:00Z\tpost\tA recent post\thttps:\/\/www\.linkedin\.com\/feed\/update\/one/);
  });
});

test("prospects timeline supports json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      prospect: {
        prefix_id: "prsp_one",
        display_name: "Pat Prospect"
      },
      timeline: [],
      meta: {
        limit: 50,
        returned_count: 0,
        types: ["post"],
        sort: "occurred_at_desc"
      }
    };
    const stdout = captureStream();
    const fetch = createFetch((url) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospects/prsp_one/timeline.json?types=post");
      return jsonResponse(responseBody);
    });

    const exitCode = await run(["prospects", "timeline", "prsp_one", "--type", "post", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("prospects write requests one surface-specific draft", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(async (url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/write_message.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), { surface_key: "post_accept_message" });

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        message_surface: {
          key: "post_accept_message",
          canonical_message_type: "direct_message",
          stage: "First direct message",
          channel: "LinkedIn",
          available: true,
          status: "success",
          body: "Helpful draft body"
        }
      });
    });

    const exitCode = await run(["prospects", "write", "prsp_one", "--type", "post_accept_message"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Type: post_accept_message/);
    assert.match(stdout.output, /Message type: direct_message/);
    assert.match(stdout.output, /Body:\nHelpful draft body/);
  });
});

test("prospects add-note records steer notes and tracked meeting-canceled notes", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(async (url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/add_note.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), {
        note_type: "steer",
        message: "Meeting will not happen after procurement pushed it out.",
        track_as_engagement: true,
        engagement_key: "action.meeting.canceled"
      });

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        note: {
          note_type: "steer",
          message: "Meeting will not happen after procurement pushed it out.",
          tracked_as_engagement: true,
          engagement_key: "action.meeting.canceled",
          engagement_label: "Meeting Canceled / No-show"
        },
        event: {
          prefix_id: "evnt_one",
          key: "action.meeting.canceled"
        }
      });
    });

    const exitCode = await run([
      "prospects",
      "add-note",
      "prsp_one",
      "--type",
      "steer",
      "--message",
      "Meeting will not happen after procurement pushed it out.",
      "--engagement-type",
      "action.meeting.canceled"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Type: steer/);
    assert.match(stdout.output, /Tracked as engagement: yes/);
    assert.match(stdout.output, /Engagement: Meeting Canceled \/ No-show \(action\.meeting\.canceled\)/);
    assert.match(stdout.output, /Event: evnt_one \(action\.meeting\.canceled\)/);
  });
});

test("prospects add-steer records steer notes without requiring --type", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(async (url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/add_note.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), {
        note_type: "steer",
        message: "Meeting is off after procurement pushed it out.",
        track_as_engagement: true,
        engagement_key: "action.meeting.canceled"
      });

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        note: {
          note_type: "steer",
          message: "Meeting is off after procurement pushed it out.",
          tracked_as_engagement: true,
          engagement_key: "action.meeting.canceled",
          engagement_label: "Meeting Canceled / No-show"
        },
        event: {
          prefix_id: "evnt_one",
          key: "action.meeting.canceled"
        }
      });
    });

    const exitCode = await run([
      "prospects",
      "add-steer",
      "prsp_one",
      "--message",
      "Meeting is off after procurement pushed it out.",
      "--engagement-type",
      "action.meeting.canceled"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Type: steer/);
    assert.match(stdout.output, /Tracked as engagement: yes/);
    assert.match(stdout.output, /Engagement: Meeting Canceled \/ No-show \(action\.meeting\.canceled\)/);
    assert.match(stdout.output, /Event: evnt_one \(action\.meeting\.canceled\)/);
  });
});

test("prospects add-steer rejects conflicting note types", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stderr = captureStream();
    const fetch = createFetch(() => {
      throw new Error("conflicting add-steer input must not call the API");
    });

    const exitCode = await run([
      "prospects",
      "add-steer",
      "prsp_one",
      "--type",
      "note",
      "--message",
      "Wrong type"
    ], { env, fetch, stderr });

    assert.equal(exitCode, 1);
    assert.match(stderr.output, /This command only supports --type steer/);
  });
});

test("prospects add-profile attaches a contact profile to the prospect", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(async (url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/profiles.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), {
        url: "pat@example.com"
      });

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        profile: {
          prefix_id: "prof_email",
          citation_id: "email/profile:pat@example.com",
          identifier: "email/profile",
          username: "pat@example.com",
          url: "mailto:pat@example.com",
          status: "queued"
        },
        status: "attached"
      }, { status: 201 });
    });

    const exitCode = await run([
      "prospects",
      "add-profile",
      "prsp_one",
      "--url",
      "pat@example.com"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Added profile \(attached\)\./);
    assert.match(stdout.output, /Prospect: Pat Prospect \(prsp_one\)/);
    assert.match(stdout.output, /Profile: email\/profile:pat@example.com/);
    assert.match(stdout.output, /Type: email\/profile/);
    assert.match(stdout.output, /URL: mailto:pat@example.com/);
  });
});

test("prospects report-bad-profile reports a specific attached profile", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(async (url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/report_bad_profile.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), {
        profile_id: "prof_bad"
      });

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        profile: {
          prefix_id: "prof_bad",
          citation_id: "linkedin/profile:wrong-person",
          identifier: "linkedin/profile",
          username: "wrong-person",
          url: "https://www.linkedin.com/in/wrong-person",
          status: "enriched"
        },
        status: "reported"
      });
    });

    const exitCode = await run([
      "prospects",
      "report-bad-profile",
      "prsp_one",
      "prof_bad"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Reported profile \(reported\)\./);
    assert.match(stdout.output, /Prospect: Pat Prospect \(prsp_one\)/);
    assert.match(stdout.output, /Profile: linkedin\/profile:wrong-person/);
    assert.match(stdout.output, /Type: linkedin\/profile/);
  });
});

test("prospects sequence-preview runs the report workflow and renders ordered steps", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(async (url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/sequence_preview.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), { connection_state: "accepted" });

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        context: {
          source: "linked_agent",
          message: "Using this prospect's linked agent context and default sequence path."
        },
        report: {
          status: "completed",
          selected: {
            prospect_name: "Pat Prospect",
            motion_name: "Motion One",
            agent_name: "Agent One",
            offer_name: "Offer One"
          },
          summary: {
            channel_sequence: ["LinkedIn", "Email"],
            total_duration_days: 7
          },
          preview_history_count: 1,
          last_preview: {
            generated_at: "2026-07-09T14:20:00Z"
          },
          steps: [
            {
              kind: "message",
              stage: "Connection request",
              channel: "LinkedIn",
              body: "Connect request body"
            },
            {
              kind: "wait",
              stage: "Wait 7 calendar days",
              channel: "Timeline",
              timing: {
                mode: "scheduled",
                scheduled_for: "2026-07-16"
              }
            }
          ]
        }
      });
    });

    const exitCode = await run(["prospects", "sequence-preview", "prsp_one", "--connection-state", "accepted"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Prospect: Pat Prospect \(prsp_one\)/);
    assert.match(stdout.output, /Context: linked_agent/);
    assert.match(stdout.output, /Channels: LinkedIn -> Email/);
    assert.match(stdout.output, /1\. MESSAGE \| Connection request \| LinkedIn/);
    assert.match(stdout.output, /Body: Connect request body/);
    assert.match(stdout.output, /2\. WAIT \| Wait 7 calendar days \| Timeline \[scheduled 2026-07-16\]/);
  });
});

test("writer test-run aliases the prospect sequence preview campaign runner", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(async (url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/sequence_export.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), { branches: "both", draft_mode: "all" });

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        context: {
          source: "linked_agent",
          message: "Using this prospect's linked agent context and default sequence path."
        },
        branches: [{
          key: "no_accept",
          label: "No accept / no reply",
          summary: {
            channel_sequence: ["LinkedIn", "Email"],
            total_duration_days: 28,
            terminal_disposition: "non_responsive"
          },
          steps: [
            {
              kind: "action",
              stage: "Follow profile",
              channel: "LinkedIn",
              guidance: "Follow now, then give the touch two business days to settle before escalating."
            },
            {
              kind: "message",
              stage: "Connection request",
              channel: "LinkedIn",
              transition_label: "If no reply after 7 calendar days, hold the request open.",
              body: "Connection request body"
            },
            {
              kind: "message",
              stage: "Email follow-up (context)",
              channel: "Email",
              subject: "Quick question",
              body: "Email follow-up body"
            },
            {
              kind: "terminal",
              stage: "Mark non-responsive",
              channel: "Disposition",
              disposition: "non_responsive"
            }
          ]
        }],
        meta: {
          draft_mode: "all"
        }
      });
    });

    const exitCode = await run(["writer", "test-run", "prsp_one"], {
      env,
      fetch,
      stdout,
      now: () => new Date("2026-07-12T12:00:00Z")
    });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Writer campaign simulator/);
    assert.match(stdout.output, /Prospect: Pat Prospect \(prsp_one\)/);
    assert.match(stdout.output, /Mode: all/);
    assert.match(stdout.output, /Start: \d{4}-\d{2}-\d{2}/);
    assert.match(stdout.output, /Scenario: simulate the full path if the prospect does not reply\./);
    assert.match(stdout.output, /No accept \/ no reply \(no_accept\)/);
    assert.match(stdout.output, /Channels: LinkedIn -> Email/);
    assert.match(stdout.output, /Duration days: 28/);
    assert.match(stdout.output, /Terminal disposition: non_responsive/);
    assert.match(stdout.output, /#\s+DATE\s+DOW\s+TYPE\s+ACTION\s+CH\s+STATUS/);
    assert.match(stdout.output, /1\s+2026-07-12\s+Sun\s+ACT\s+Follow profile\s+LI/);
    assert.match(stdout.output, /2\s+2026-07-12\s+Sun\s+MSG\s+Connection request\s+LI/);
    assert.match(stdout.output, /3\s+2026-07-12\s+Sun\s+MSG\s+Email follow-up \(context\)\s+Email/);
    assert.match(stdout.output, /4\s+after\s+END\s+Mark non-responsive\s+Done/);
    assert.doesNotMatch(stdout.output, /note:/);
    assert.doesNotMatch(stdout.output, /id:/);
  });
});

test("writer test-run plan mode skips drafts and renders planned statuses", async () => {
  await withTempConfigHome(async ({ root, env }) => {
    const cacheDir = join(root, "writer-cache");
    env.AUDIENTI_WRITER_TEST_RUN_CACHE_DIR = cacheDir;
    await mkdir(cacheDir, { recursive: true });
    await writeFile(join(cacheDir, "acct_one-prsp_one.json"), `${JSON.stringify({
      version: 1,
      account_id: "acct_one",
      prospect_id: "prsp_one",
      entries: {
        "no_accept:public_comment": {
          branch: "no_accept",
          key: "public_comment",
          stage: "Public comment",
          channel: "LinkedIn",
          platform: "linkedin",
          body: "Cached public comment body",
          text: "Cached public comment body",
          status: "success",
          generated_at: "2026-07-12T12:00:00Z",
          writer_engine: "local_cache",
          target: {
            url: "https://www.linkedin.com/feed/update/urn:li:activity:cached",
            post_url: "https://www.linkedin.com/feed/update/urn:li:activity:cached"
          }
        }
      }
    }, null, 2)}\n`);

    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(async (url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/sequence_export.json");
      assert.deepEqual(JSON.parse(options.body), {
        branches: "both",
        draft_mode: "plan",
        cached_drafts: [{
          branch: "no_accept",
          key: "public_comment",
          stage: "Public comment",
          channel: "LinkedIn",
          platform: "linkedin",
          body: "Cached public comment body",
          text: "Cached public comment body",
          status: "success",
          generated_at: "2026-07-12T12:00:00Z",
          writer_engine: "local_cache",
          target: {
            url: "https://www.linkedin.com/feed/update/urn:li:activity:cached",
            post_url: "https://www.linkedin.com/feed/update/urn:li:activity:cached"
          }
        }]
      });

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        branches: [{
          key: "no_accept",
          label: "No accept / no reply",
          summary: {
            channel_sequence: ["LinkedIn", "Email"],
            total_duration_days: 28
          },
          steps: [
            {
              kind: "message",
              key: "public_comment",
              stage: "Public comment",
              channel: "LinkedIn",
              status: "cached",
              body: "Cached public comment body"
            },
            {
              kind: "message",
              key: "connection_request",
              stage: "Connection request",
              channel: "LinkedIn",
              status: "planned"
            }
          ]
        }],
        meta: {
          draft_mode: "plan"
        }
      });
    });

    const exitCode = await run(["writer", "test-run", "prsp_one", "--mode", "plan"], {
      env,
      fetch,
      stdout,
      now: () => new Date("2026-07-12T12:00:00Z")
    });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Mode: plan/);
    assert.match(stdout.output, /Cached drafts sent: 1/);
    assert.match(stdout.output, /Drafts are skipped; this run only plans the path and context\./);
    assert.match(stdout.output, /Start: \d{4}-\d{2}-\d{2}/);
    assert.match(stdout.output, /#\s+DATE\s+DOW\s+TYPE\s+ACTION\s+CH\s+STATUS/);
    assert.match(stdout.output, /2026-07-12\s+Sun\s+MSG\s+Public comment\s+LI\s+cached/);
    assert.match(stdout.output, /2026-07-12\s+Sun\s+MSG\s+Connection request\s+LI\s+planned/);
    assert.doesNotMatch(stdout.output, /This can take a while/);
  });
});

test("writer test-run step mode posts one branch and target step", async () => {
  await withTempConfigHome(async ({ root, env }) => {
    env.AUDIENTI_WRITER_TEST_RUN_CACHE_DIR = join(root, "writer-cache");
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(async (url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/sequence_export.json");
      assert.deepEqual(JSON.parse(options.body), {
        branches: "no-accept",
        draft_mode: "target",
        target_step: "public_comment"
      });

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        branches: [{
          key: "no_accept",
          label: "No accept / no reply",
          resolved_target_step: "public_comment",
          summary: {
            channel_sequence: ["LinkedIn", "Email"]
          },
          steps: [
            {
              kind: "message",
              key: "public_comment",
              stage: "Public comment",
              channel: "LinkedIn",
              status: "success",
              body: "Target public comment body",
              target: {
                type: "post",
                post_url: "https://www.linkedin.com/feed/update/urn:li:activity:123"
              }
            }
          ]
        }],
        meta: {
          draft_mode: "target",
          target_step: "public_comment"
        }
      });
    });

    const exitCode = await run([
      "writer",
      "test-run",
      "prsp_one",
      "--mode",
      "step",
      "--branch",
      "no-accept",
      "--step",
      "public_comment"
    ], {
      env,
      fetch,
      stdout,
      now: () => new Date("2026-07-12T12:00:00Z")
    });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Mode: target/);
    assert.match(stdout.output, /Target step: public_comment/);
    assert.match(stdout.output, /Only the target step is drafted; later steps are omitted\./);
    assert.match(stdout.output, /Public comment\s+LI\s+success/);
    assert.match(stdout.output, /Drafted copy: Public comment \(public_comment\)/);
    assert.match(stdout.output, /Replying to: https:\/\/www\.linkedin\.com\/feed\/update\/urn:li:activity:123/);
    assert.match(stdout.output, /Target public comment body/);
  });
});

test("writer test-run step mode renders the resolved target draft", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(async (url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/sequence_export.json");
      assert.deepEqual(JSON.parse(options.body), {
        branches: "no-accept",
        draft_mode: "target",
        target_step: "connection_request"
      });

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        branches: [{
          key: "no_accept",
          label: "No accept / no reply",
          resolved_target_step: "connection_request",
          summary: {
            channel_sequence: ["LinkedIn"]
          },
          steps: [
            {
              kind: "message",
              key: "public_comment",
              stage: "Public comment",
              channel: "LinkedIn",
              status: "cached",
              body: "Cached public comment body",
              metadata: { cached_draft: true }
            },
            {
              kind: "message",
              key: "connection_request",
              stage: "Connection request",
              channel: "LinkedIn",
              status: "success",
              body: "",
              empty_body_reason: "Blank invite by design"
            }
          ]
        }],
        meta: {
          draft_mode: "target",
          target_step: "connection_request"
        }
      });
    });

    const exitCode = await run([
      "writer",
      "test-run",
      "prsp_one",
      "--mode",
      "step",
      "--branch",
      "no-accept",
      "--step",
      "connection_request",
      "--no-cache"
    ], {
      env,
      fetch,
      stdout,
      now: () => new Date("2026-07-12T12:00:00Z")
    });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Drafted copy: Connection request \(connection_request\)/);
    assert.match(stdout.output, /Blank invite by design/);
    assert.doesNotMatch(stdout.output, /Drafted copy: Public comment/);
  });
});

test("writer test-run step mode renders target draft errors with warnings", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(async (url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/sequence_export.json");
      assert.deepEqual(JSON.parse(options.body), {
        branches: "no-accept",
        draft_mode: "target",
        target_step: "connection_request"
      });

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        branches: [{
          key: "no_accept",
          label: "No accept / no reply",
          resolved_target_step: "connection_request",
          summary: {
            channel_sequence: ["LinkedIn"]
          },
          steps: [
            {
              kind: "message",
              key: "connection_request",
              stage: "Connection request",
              channel: "LinkedIn",
              status: "error",
              body: "",
              warnings: ["Incorrect API key provided."]
            }
          ]
        }],
        meta: {
          draft_mode: "target",
          target_step: "connection_request"
        }
      });
    });

    const exitCode = await run([
      "writer",
      "test-run",
      "prsp_one",
      "--mode",
      "step",
      "--branch",
      "no-accept",
      "--step",
      "connection_request",
      "--no-cache"
    ], {
      env,
      fetch,
      stdout,
      now: () => new Date("2026-07-12T12:00:00Z")
    });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Connection request\s+LI\s+error/);
    assert.match(stdout.output, /Drafted copy: Connection request \(connection_request\)/);
    assert.match(stdout.output, /Status: error/);
    assert.match(stdout.output, /Warning: Incorrect API key provided\./);
    assert.match(stdout.output, /No draft body returned\./);
  });
});

test("writer test-run step mode renders target quality failure reasons", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(async (url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/sequence_export.json");
      assert.deepEqual(JSON.parse(options.body), {
        branches: "no-accept",
        draft_mode: "target",
        target_step: "connection_request"
      });

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        branches: [{
          key: "no_accept",
          label: "No accept / no reply",
          resolved_target_step: "connection_request",
          summary: {
            channel_sequence: ["LinkedIn"]
          },
          steps: [
            {
              kind: "message",
              key: "connection_request",
              stage: "Connection request",
              channel: "LinkedIn",
              status: "quality_failure",
              body: "Draft that failed quality",
              text: "Draft that failed quality",
              quality_codes: ["connection_request_too_many_sentences"],
              blank_reason: "Connection request had too many sentences.",
              writer_path: "connect_request.specialized",
              writer_engine: "connection_request_llm_v1"
            }
          ]
        }],
        meta: {
          draft_mode: "target",
          target_step: "connection_request"
        }
      });
    });

    const exitCode = await run([
      "writer",
      "test-run",
      "prsp_one",
      "--mode",
      "step",
      "--branch",
      "no-accept",
      "--step",
      "connection_request",
      "--no-cache"
    ], {
      env,
      fetch,
      stdout,
      now: () => new Date("2026-07-12T12:00:00Z")
    });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Connection request\s+LI\s+quality/);
    assert.match(stdout.output, /Status: quality_failure/);
    assert.match(stdout.output, /Quality failure: connection_request_too_many_sentences/);
    assert.match(stdout.output, /Blank reason: Connection request had too many sentences\./);
    assert.match(stdout.output, /Writer path: connect_request\.specialized/);
    assert.match(stdout.output, /Writer engine: connection_request_llm_v1/);
    assert.match(stdout.output, /Draft that failed quality/);
  });
});

test("writer test-run step mode sends cached prior drafts for simulator context", async () => {
  await withTempConfigHome(async ({ root, env }) => {
    const cacheDir = join(root, "writer-cache");
    env.AUDIENTI_WRITER_TEST_RUN_CACHE_DIR = cacheDir;
    await mkdir(cacheDir, { recursive: true });
    await writeFile(join(cacheDir, "acct_one-prsp_one.json"), `${JSON.stringify({
      version: 1,
      account_id: "acct_one",
      prospect_id: "prsp_one",
      entries: {
        "no_accept:connection_request": {
          branch: "no_accept",
          key: "connection_request",
          stage: "Connection request",
          channel: "LinkedIn",
          platform: "linkedin",
          body: "Cached connection request body",
          text: "Cached connection request body",
          status: "success",
          generated_at: "2026-07-12T12:00:00Z",
          writer_engine: "local_cache"
        }
      }
    }, null, 2)}\n`);

    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(async (url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/sequence_export.json");
      assert.deepEqual(JSON.parse(options.body), {
        branches: "no-accept",
        draft_mode: "target",
        target_step: "pending_request_inmail_voicemail",
        cached_drafts: [{
          branch: "no_accept",
          key: "connection_request",
          stage: "Connection request",
          channel: "LinkedIn",
          platform: "linkedin",
          body: "Cached connection request body",
          text: "Cached connection request body",
          status: "success",
          generated_at: "2026-07-12T12:00:00Z",
          writer_engine: "local_cache"
        }]
      });

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        branches: [{
          key: "no_accept",
          label: "No accept / no reply",
          resolved_target_step: "pending_request_inmail_voicemail",
          summary: {
            channel_sequence: ["LinkedIn", "Phone"]
          },
          steps: [
            {
              kind: "message",
              key: "connection_request",
              stage: "Connection request",
              channel: "LinkedIn",
              status: "cached",
              body: "Cached connection request body",
              metadata: { cached_draft: true }
            },
            {
              kind: "message",
              key: "pending_request_inmail_voicemail",
              stage: "Voicemail",
              channel: "Phone",
              status: "success",
              body: "Voicemail script based on prior messages"
            }
          ]
        }],
        meta: {
          draft_mode: "target",
          target_step: "pending_request_inmail_voicemail"
        }
      });
    });

    const exitCode = await run([
      "writer",
      "test-run",
      "prsp_one",
      "--mode",
      "step",
      "--branch",
      "no-accept",
      "--step",
      "pending_request_inmail_voicemail"
    ], {
      env,
      fetch,
      stdout,
      now: () => new Date("2026-07-12T12:00:00Z"),
      cwd: root
    });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Cache: .*writer-cache.*acct_one-prsp_one\.json/);
    assert.match(stdout.output, /Cached drafts sent: 1/);
    assert.match(stdout.output, /Connection request\s+LI\s+cached/);
    assert.match(stdout.output, /Drafted copy: Voicemail \(pending_request_inmail_voicemail\)/);
    assert.match(stdout.output, /Voicemail script based on prior messages/);
  });
});

test("writer test-run step mode sends cached quality failures so the target can retry", async () => {
  await withTempConfigHome(async ({ root, env }) => {
    const cacheDir = join(root, "writer-cache");
    env.AUDIENTI_WRITER_TEST_RUN_CACHE_DIR = cacheDir;
    await mkdir(cacheDir, { recursive: true });
    await writeFile(join(cacheDir, "acct_one-prsp_one.json"), `${JSON.stringify({
      version: 1,
      account_id: "acct_one",
      prospect_id: "prsp_one",
      entries: {
        "no_accept:connection_request": {
          branch: "no_accept",
          key: "connection_request",
          stage: "Connection request",
          channel: "LinkedIn",
          platform: "linkedin",
          status: "quality_failure",
          quality_codes: ["connection_request_too_many_sentences"],
          blank_reason: "Connection request had too many sentences.",
          writer_path: "connect_request.specialized",
          writer_engine: "connection_request_llm_v1",
          generated_at: "2026-07-12T12:00:00Z"
        }
      }
    }, null, 2)}\n`);

    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(async (url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/sequence_export.json");
      assert.deepEqual(JSON.parse(options.body), {
        branches: "no-accept",
        draft_mode: "target",
        target_step: "connection_request",
        cached_drafts: [{
          branch: "no_accept",
          key: "connection_request",
          stage: "Connection request",
          channel: "LinkedIn",
          platform: "linkedin",
          status: "quality_failure",
          quality_codes: ["connection_request_too_many_sentences"],
          blank_reason: "Connection request had too many sentences.",
          writer_path: "connect_request.specialized",
          generated_at: "2026-07-12T12:00:00Z",
          writer_engine: "connection_request_llm_v1"
        }]
      });

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        branches: [{
          key: "no_accept",
          label: "No accept / no reply",
          resolved_target_step: "connection_request",
          summary: {
            channel_sequence: ["LinkedIn"]
          },
          steps: [
            {
              kind: "message",
              key: "connection_request",
              stage: "Connection request",
              channel: "LinkedIn",
              status: "success",
              body: "Recovered connection request"
            }
          ]
        }],
        meta: {
          draft_mode: "target",
          target_step: "connection_request"
        }
      });
    });

    const exitCode = await run([
      "writer",
      "test-run",
      "prsp_one",
      "--mode",
      "step",
      "--branch",
      "no-accept",
      "--step",
      "connection_request"
    ], {
      env,
      fetch,
      stdout,
      now: () => new Date("2026-07-12T12:00:00Z"),
      cwd: root
    });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Cached drafts sent: 1/);
    assert.match(stdout.output, /Recovered connection request/);
  });
});

test("prospects sequence-export posts branch selection and renders spreadsheet rows", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(async (url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/sequence_export.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), {
        branches: "accepted",
        angle_index: "2"
      });

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        context: {
          source: "motion"
        },
        branches: [{
          key: "accepted",
          label: "Connection accepted / no reply",
          rows: [{
            prospect_id: "prsp_one",
            prospect_name: "Pat Prospect",
            branch: "accepted",
            branch_label: "Connection accepted / no reply",
            step_number: 1,
            kind: "message",
            key: "post_accept_message",
            stage: "First direct message",
            channel: "LinkedIn",
            scheduled_for: "2026-07-13T14:00:00Z",
            available: true,
            body: "Accepted branch draft"
          }]
        }],
        rows: [{
          prospect_id: "prsp_one",
          prospect_name: "Pat Prospect",
          branch: "accepted",
          branch_label: "Connection accepted / no reply",
          step_number: 1,
          kind: "message",
          key: "post_accept_message",
          stage: "First direct message",
          channel: "LinkedIn",
          scheduled_for: "2026-07-13T14:00:00Z",
          available: true,
          body: "Accepted branch draft"
        }],
        meta: {
          branch_keys: ["accepted"],
          row_count: 1
        }
      });
    });

    const exitCode = await run([
      "prospects",
      "sequence-export",
      "prsp_one",
      "--branch",
      "accepted",
      "--angle-index",
      "2"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Prospect: Pat Prospect \(prsp_one\)/);
    assert.match(stdout.output, /Context: motion/);
    assert.match(stdout.output, /Connection accepted \/ no reply \(accepted\)/);
    assert.match(stdout.output, /STEP\tKIND\tSTAGE\tCHANNEL\tSCHEDULED FOR\tBODY/);
    assert.match(stdout.output, /1\tmessage\tFirst direct message\tLinkedIn\t2026-07-13T14:00:00Z\tAccepted branch draft/);
  });
});

test("prospects sequence-export supports csv output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospects/prsp_one/sequence_export.json");
      assert.deepEqual(JSON.parse(options.body), {});
      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        rows: [{
          prospect_id: "prsp_one",
          prospect_name: "Pat Prospect",
          branch: "no_accept",
          branch_label: "No accept / no reply",
          step_number: 1,
          kind: "message",
          key: "connection_request",
          stage: "Connection request",
          channel: "LinkedIn",
          available: true,
          status: "success",
          warnings: ["sample_warning"],
          writer_engine: "sequence_preview_test",
          body: "Line one, with comma\nLine two"
        }]
      });
    });

    const exitCode = await run(["prospects", "sequence-export", "prsp_one", "--csv"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /^prospect_id,prospect_name,branch,branch_label,step_number,kind,key,stage,channel,scheduled_for,available,status,subject,body,warnings,writer_engine,/);
    assert.match(stdout.output, /prsp_one,Pat Prospect,no_accept,No accept \/ no reply,1,message,connection_request,Connection request,LinkedIn,,true,success,,"Line one, with comma\nLine two",sample_warning,sequence_preview_test/);
  });
});

test("prospects sequence-export supports json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      prospect: {
        prefix_id: "prsp_one",
        display_name: "Pat Prospect"
      },
      branches: [],
      rows: [],
      meta: {
        branch_keys: [],
        row_count: 0
      }
    };
    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse(responseBody));

    const exitCode = await run(["prospects", "sequence-export", "prsp_one", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("operator next sends filters and supports account override without mutating config", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_two/operator/next.json");
      assert.equal(url.searchParams.get("principal_account_user_id"), "42");
      assert.equal(url.searchParams.get("motion_id"), "motn_one");
      assert.equal(url.searchParams.get("list_id"), "list_one");
      assert.equal(url.searchParams.get("stage"), "new");
      assert.equal(url.searchParams.get("opportunity_kind"), "prospect");
      assert.equal(url.searchParams.get("writing_status"), "ready");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse({
        next_move: {
          id: 123,
          opportunity_kind: "prospect",
          prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
          motion: { prefix_id: "motn_one", name: "Motion One" },
          recommended_action_label: "Send connection request"
        },
        filters: {},
        metrics: {}
      });
    });

    const exitCode = await run([
      "--account",
      "acct_two",
      "operator",
      "next",
      "--json",
      "--principal",
      "42",
      "--motion",
      "motn_one",
      "--list",
      "list_one",
      "--stage",
      "new",
      "--opportunity-kind",
      "prospect",
      "--writing-status",
      "ready"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(stdout.output).next_move.prospect.prefix_id, "prsp_one");
    assert.deepEqual(await readConfig({ env }), {
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    });
  });
});

test("operator queue renders a clean aligned table with motion names", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/operator.json");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse({
        next_move: null,
        decision_queue: [{
          id: "motion_visibility_123",
          opportunity_kind: "visibility",
          profile: { prefix_id: "prof_one", display_name: "Visibility Author" },
          motion: { prefix_id: "motn_inbound", name: "Inbound Queue", kind: "inbound", status: "active" },
          next_action: { label: "Review comment" }
        }],
        filters: {},
        metrics: {}
      });
    });

    const exitCode = await run(["operator", "queue"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.equal(fetch.calls.length, 1);
    assert.doesNotMatch(stdout.output, /\t/);
    assert.match(stdout.output, /MOVE ID\s+WORK TYPE\s+SUBJECT\s+MOTION\s+NEXT ACTION/);
    assert.match(stdout.output, /motion_visibility_123\s+Visibility\s+Visibility Author\s+Inbound Queue\s+Review comment/);
    assert.doesNotMatch(stdout.output, /Inbound Queue \(motn_inbound\)/);
  });
});

test("operator next renders a static plan with coach guidance and draft state", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/operator/next.json");
      assert.equal(url.searchParams.get("writing_status"), "ready");
      assert.equal(options.headers.Authorization, "Bearer saved-token");

      return jsonResponse({
        next_move: {
          id: "operator-row-123",
          opportunity_kind: "prospect",
          prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
          motion: { prefix_id: "motn_one", name: "Motion One" },
          pipeline_stage: "identified",
          plan_state: "ready",
          status_label: "Ready",
          due_label: "Now",
          recommended_action_label: "Send connection request",
          rationale: "The prospect matches the play and has a relevant LinkedIn profile.",
          guidance: "Keep the note specific and do not ask for a meeting yet.",
          next_action: {
            type: "connection_request",
            label: "Send connection request",
            request_mode: "signal_note",
            timing: {
              mode: "now",
              scheduled_for: "2026-07-11T14:00:00Z"
            },
            target: {
              platform: "linkedin",
              profile_url: "https://www.linkedin.com/in/pat-prospect"
            }
          },
          cta: {
            label: "Send connection request",
            action: "connect_request",
            platform: "linkedin",
            disabled: false
          },
          operator_draft: {
            required: true,
            ready: true,
            state: "ready",
            subject: "",
            body: "Pat, noticed your team is tightening vendor governance before renewals.",
            writer_path: "outreach/linkedin_connection_request"
          }
        },
        filters: {},
        metrics: {}
      });
    });

    const exitCode = await run(["operator", "next", "--plan", "--writing-status", "ready"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Static operator plan/);
    assert.match(stdout.output, /Move: operator-row-123/);
    assert.match(stdout.output, /Prospect: Pat Prospect \(prsp_one\)/);
    assert.match(stdout.output, /Motion: Motion One \(motn_one\)/);
    assert.match(stdout.output, /Next action: Send connection request \(connection_request\)/);
    assert.match(stdout.output, /Timing: now, scheduled for 2026-07-11T14:00:00Z/);
    assert.match(stdout.output, /CTA: Send connection request \(connect_request on linkedin\)/);
    assert.match(stdout.output, /Draft: ready, ready/);
    assert.match(stdout.output, /Writer: outreach\/linkedin_connection_request/);
    assert.match(stdout.output, /Body:\nPat, noticed your team is tightening vendor governance before renewals\./);
    assert.match(stdout.output, /Rationale:\nThe prospect matches the play and has a relevant LinkedIn profile\./);
    assert.match(stdout.output, /Guidance:\nKeep the note specific and do not ask for a meeting yet\./);
  });
});

test("operator next rejects conflicting output format flags", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const stderr = captureStream();
    const fetch = createFetch(() => {
      throw new Error("conflicting output flags must not call the API");
    });

    const exitCode = await run(["operator", "next", "--json", "--plan"], { env, fetch, stdout, stderr });

    assert.equal(exitCode, 1);
    assert.equal(stdout.output, "");
    assert.match(stderr.output, /Choose one output format/);
  });
});

test("operator next rejects outcome detail flags without an outcome flag", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const stderr = captureStream();
    const fetch = createFetch(() => {
      throw new Error("outcome detail flags without an outcome must not call the API");
    });

    const exitCode = await run(["operator", "next", "--note", "left voicemail"], { env, fetch, stdout, stderr });

    assert.equal(exitCode, 1);
    assert.equal(stdout.output, "");
    assert.match(stderr.output, /--note and --occurred-at require an outcome flag/);
  });
});

test("operator next can mark the current prospect move done", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options, calls) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(options.headers.Authorization, "Bearer saved-token");

      if (calls.length === 1) {
        assert.equal(url.pathname, "/api/v1/accounts/acct_one/operator/next.json");
        assert.equal(url.searchParams.get("writing_status"), "ready");
        return jsonResponse({
          next_move: {
            id: 123,
            fingerprint: "oprow_v1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            opportunity_kind: "prospect",
            prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
            recommended_action_label: "Send connection request",
            next_action: {
              type: "connection_request",
              message_mode: "linkedin_connection_request"
            }
          },
          filters: {
            principal_account_user_id: 42,
            writing_status: "ready"
          },
          metrics: {}
        });
      }

      assert.equal(url.pathname, "/api/v1/accounts/acct_one/operator/outcome.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), {
        row_id: 123,
        status: "done",
        fingerprint: "oprow_v1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        queue_filters: {
          principal_account_user_id: 42,
          writing_status: "ready"
        },
        note: "Sent the request.",
        occurred_at: "2026-07-11T14:00:00Z"
      });
      return jsonResponse({
        status: "ok",
        row_id: "123",
        operator_outcome: { status: "done", action_type: "connection_request" },
        prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
        event: { prefix_id: "evnt_one", key: "action.profile.connect_request_sent" }
      });
    });

    const exitCode = await run([
      "operator",
      "next",
      "--done",
      "--writing-status",
      "ready",
      "--note",
      "Sent the request.",
      "--occurred-at",
      "2026-07-11T14:00:00Z"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.equal(fetch.calls.length, 2);
    assert.match(stdout.output, /Recorded done outcome for row 123/);
    assert.match(stdout.output, /Prospect: Pat Prospect \(prsp_one\)/);
    assert.match(stdout.output, /Event: evnt_one/);
  });
});

test("operator next lets the server reject visibility outcome shortcuts", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const stderr = captureStream();
    const fetch = createFetch((url, options, calls) => {
      if (calls.length === 1) {
        assert.equal(url.pathname, "/api/v1/accounts/acct_one/operator/next.json");
        return jsonResponse({
          next_move: {
            id: "motion_visibility_123",
            fingerprint: "oprow_v1_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            opportunity_kind: "visibility",
            recommended_action_label: "Comment on post",
            next_action: { type: "create_post_comment" }
          },
          filters: { opportunity_kind: "visibility" },
          metrics: {}
        });
      }

      assert.equal(url.pathname, "/api/v1/accounts/acct_one/operator/outcome.json");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), {
        row_id: "motion_visibility_123",
        status: "done",
        fingerprint: "oprow_v1_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        queue_filters: { opportunity_kind: "visibility" }
      });
      return jsonResponse({ error: "Visibility operator outcomes are not supported by the API yet." }, { status: 422 });
    });

    const exitCode = await run(["operator", "next", "--done"], { env, fetch, stdout, stderr });

    assert.equal(exitCode, 1);
    assert.equal(fetch.calls.length, 2);
    assert.equal(stdout.output, "");
    assert.match(stderr.output, /Visibility operator outcomes are not supported/);
  });
});

test("analytics prospects sends window and renders account-scoped summary", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/analytics/prospects.json");
      assert.equal(url.searchParams.get("window"), "24h");
      assert.equal(url.searchParams.get("account_user_id"), null);
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse({
        kind: "prospects",
        account_user: null,
        window: {
          key: "24h",
          started_at: "2026-07-10T14:00:00Z",
          ended_at: "2026-07-11T14:00:00Z"
        },
        prospects_added_count: 12,
        actions: {
          total_count: 8,
          automated_count: 6,
          automated_percentage: 75.0,
          breakdown: [
            { key: "action.profile.connect_request_sent", label: "Profile connect request sent", count: 5, automated_count: 5, automated_percentage: 100.0 },
            { key: "action.profile.follow", label: "Profile follow", count: 3, automated_count: 1, automated_percentage: 33.3 }
          ]
        },
        queue_stages: [
          { key: "pre_connect", label: "Pre connect", count: 9 },
          { key: "connected", label: "Connected", count: 3 }
        ]
      });
    });

    const exitCode = await run(["analytics", "prospects", "--window", "24h"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Prospect analytics \(24h: 2026-07-10T14:00:00Z to 2026-07-11T14:00:00Z\)/);
    assert.match(stdout.output, /User: all account users/);
    assert.match(stdout.output, /Prospects added: 12/);
    assert.match(stdout.output, /Actions: 8 \(automated 6, 75%\)/);
    assert.match(stdout.output, /ACTION                        COUNT  AUTOMATED  AUTO %/);
    assert.match(stdout.output, /Profile connect request sent      5          5    100%/);
    assert.match(stdout.output, /STAGE        COUNT/);
    assert.match(stdout.output, /Pre connect      9/);
  });
});

test("analytics prospects sends user filter for assigned prospect analytics", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/analytics/prospects.json");
      assert.equal(url.searchParams.get("window"), "30d");
      assert.equal(url.searchParams.get("account_user_id"), "me");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse({
        kind: "prospects",
        account_user: { id: 42, name: "User One", email: "one@example.com" },
        window: { key: "30d" },
        prospects_added_count: 7,
        actions: { total_count: 3, automated_count: 0, automated_percentage: 0.0, breakdown: [] },
        queue_stages: [{ key: "pre_connect", label: "Pre connect", count: 7 }]
      });
    });

    const exitCode = await run(["analytics", "prospects", "--user", "me", "--window", "30d"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /User: User One \(42\)/);
    assert.match(stdout.output, /Prospects added: 7/);
  });
});

test("analytics prospects sends cohort dates and renders cohort-scoped summary", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/analytics/prospects.json");
      assert.equal(url.searchParams.get("window"), "7d");
      assert.equal(url.searchParams.get("cohort_start"), "2026-07-01");
      assert.equal(url.searchParams.get("cohort_end"), "2026-07-07");
      assert.equal(url.searchParams.get("motion_id"), "motn_focus");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse({
        kind: "prospects",
        window: {
          key: "7d",
          started_at: "2026-07-05T14:00:00Z",
          ended_at: "2026-07-12T14:00:00Z"
        },
        cohort: {
          start_date: "2026-07-01",
          end_date: "2026-07-07",
          field: "account_prospects.created_at"
        },
        motion: {
          id: 123,
          prefix_id: "motn_focus",
          name: "Focused Motion",
          kind: "outbound",
          status: "active"
        },
        account_user: null,
        prospects_added_count: 42,
        cohort_prospects_count: 42,
        actions: {
          total_count: 9,
          automated_count: 3,
          automated_percentage: 33.3,
          breakdown: [
            { key: "action.profile.follow", label: "Profile follow", count: 9, automated_count: 3, automated_percentage: 33.3 }
          ]
        },
        queue_stages: [
          { key: "pre_connect", label: "Pre connect", count: 20 },
          { key: "connected", label: "Connected", count: 8 }
        ]
      });
    });

    const exitCode = await run([
      "analytics",
      "prospects",
      "--window",
      "7d",
      "--cohort-start",
      "2026-07-01",
      "--cohort-end",
      "2026-07-07",
      "--motion",
      "motn_focus"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Prospect analytics \(7d: 2026-07-05T14:00:00Z to 2026-07-12T14:00:00Z\)/);
    assert.match(stdout.output, /Cohort: 2026-07-01 to 2026-07-07 \(account_prospects\.created_at\)/);
    assert.match(stdout.output, /Motion: Focused Motion \(motn_focus\)/);
    assert.match(stdout.output, /Cohort prospects: 42/);
    assert.match(stdout.output, /Actions: 9 \(automated 3, 33\.3%\)/);
    assert.match(stdout.output, /Current cohort stages/);
    assert.match(stdout.output, /Pre connect     20/);
  });
});

test("analytics prospects cohort-analysis loops recent weekly cohorts and renders stage comparison", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const expectedCohorts = [
      ["2026-06-15", "2026-06-21", 25, { identified: 1, pre_connect: 2, connected: 12, meeting_requested: 10 }],
      ["2026-06-22", "2026-06-28", 30, { identified: 3, pre_connect: 6, connected: 15, meeting_requested: 6 }],
      ["2026-06-29", "2026-07-05", 35, { identified: 10, pre_connect: 13, connected: 10, meeting_requested: 2 }],
      ["2026-07-06", "2026-07-12", 40, { identified: 24, pre_connect: 14, connected: 2, meeting_requested: 0 }]
    ];
    const stdout = captureStream();
    const fetch = createFetch((url, options, calls) => {
      const index = calls.length - 1;
      const [start, end, total, stages] = expectedCohorts[index];
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/analytics/prospects.json");
      assert.equal(url.searchParams.get("window"), "7d");
      assert.equal(url.searchParams.get("account_user_id"), "me");
      assert.equal(url.searchParams.get("motion_id"), "motn_focus");
      assert.equal(url.searchParams.get("cohort_start"), start);
      assert.equal(url.searchParams.get("cohort_end"), end);
      assert.equal(options.headers.Authorization, "Bearer saved-token");

      return jsonResponse({
        kind: "prospects",
        window: { key: "7d" },
        cohort: {
          start_date: start,
          end_date: end,
          field: "account_prospects.created_at"
        },
        account_user: { id: 42, name: "User One" },
        motion: {
          id: 123,
          prefix_id: "motn_focus",
          name: "Focused Motion",
          kind: "outbound",
          status: "active"
        },
        prospects_added_count: total,
        cohort_prospects_count: total,
        actions: { total_count: 0, automated_count: 0, automated_percentage: null, breakdown: [] },
        queue_stages: Object.entries(stages).map(([key, count]) => ({
          key,
          label: key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()),
          count
        }))
      });
    });

    const exitCode = await run([
      "analytics",
      "prospects",
      "cohort-analysis",
      "--weeks",
      "4",
      "--window",
      "7d",
      "--motion",
      "motn_focus",
      "--user",
      "me"
    ], {
      env,
      fetch,
      stdout,
      now: () => new Date("2026-07-12T12:00:00Z")
    });

    assert.equal(exitCode, 0);
    assert.equal(fetch.calls.length, 4);
    assert.match(stdout.output, /Prospect cohort analysis \(4 weeks\)/);
    assert.match(stdout.output, /Activity window: 7d/);
    assert.match(stdout.output, /Motion: Focused Motion \(motn_focus\)/);
    assert.match(stdout.output, /User: User One \(42\)/);
    assert.match(stdout.output, /COHORT                    TOTAL  Identified  Pre Connect  Connected  Meeting Requested/);
    assert.match(stdout.output, /2026-06-15 to 2026-06-21     25           1            2         12                 10/);
    assert.match(stdout.output, /2026-07-06 to 2026-07-12     40          24           14          2                  0/);
  });
});

test("analytics dashboard sends tag cohort filters and renders company target counts", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One",
      accountUserId: "42",
      accountUserName: "User One",
      accountUserEmail: "one@example.com"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/analytics/dashboard.json");
      assert.equal(url.searchParams.get("cohort_start_date"), "2026-07-01");
      assert.equal(url.searchParams.get("cohort_end_date"), "2026-07-07");
      assert.equal(url.searchParams.get("play_tag"), "wine_campaign");
      assert.equal(url.searchParams.get("motion_id"), "motn_focus");
      assert.equal(url.searchParams.get("offer_id"), "offr_one");
      assert.equal(url.searchParams.get("icp_id"), "icpp_one");
      assert.equal(url.searchParams.get("account_user_id"), "42");
      assert.equal(options.headers.Authorization, "Bearer saved-token");

      return jsonResponse({
        kind: "dashboard",
        cohort: {
          start_date: "2026-07-01",
          end_date: "2026-07-07",
          label: "Jul 1, 2026 - Jul 7, 2026",
          field: "account_prospects.created_at"
        },
        activity: {
          start_date: "2026-07-01",
          end_date: "2026-07-12",
          label: "Jul 1, 2026 - Jul 12, 2026",
          field: "events.created_at"
        },
        filters: {
          play_tag: "wine_campaign",
          motion: { id: 123, prefix_id: "motn_focus", name: "Focused Motion" },
          offer: { id: 4, prefix_id: "offr_one", name: "Wine Offer" },
          icp: { id: 5, prefix_id: "icpp_one", name: "Wine ICP" },
          account_user: { id: 42, name: "User One", email: "one@example.com" }
        },
        cohort_size: 47,
        cohort_company_target_count: 28,
        cohort_people_per_company_average: 1.7,
        active_cohort_count: 31,
        active_cohort_company_target_count: 20,
        active_cohort_percentage: 66.0,
        inactive_cohort_count: 16,
        pipeline_stage_counts: [
          { key: "connected", label: "Connected", count: 10 },
          { key: "meeting_requested", label: "Meeting requested", count: 3 }
        ],
        breakdown_rows: [],
        conversion_metrics: [],
        connection_request_breakdown: [],
        disposition_breakdown: [],
        workflow_hold_breakdown: []
      });
    });

    const exitCode = await run([
      "analytics",
      "dashboard",
      "--cohort-start",
      "2026-07-01",
      "--cohort-end",
      "2026-07-07",
      "--play-tag",
      "wine_campaign",
      "--motion",
      "motn_focus",
      "--offer",
      "offr_one",
      "--icp",
      "icpp_one",
      "--user",
      "me"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Dashboard analytics \(Jul 1, 2026 - Jul 7, 2026\)/);
    assert.match(stdout.output, /Tag: wine_campaign/);
    assert.match(stdout.output, /Motion: Focused Motion \(motn_focus\)/);
    assert.match(stdout.output, /Prospects: 47/);
    assert.match(stdout.output, /Companies: 28/);
    assert.match(stdout.output, /People\/company: 1\.7/);
    assert.match(stdout.output, /Active: 31 \(20 companies, 66%\)/);
    assert.match(stdout.output, /Meeting requested\s+3/);
  });
});

test("analytics dashboard supports campaigns alias and json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      kind: "dashboard",
      filters: { play_tag: "wine_campaign" },
      cohort_size: 10,
      cohort_company_target_count: 6
    };
    const stdout = captureStream();
    const fetch = createFetch((url) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/analytics/dashboard.json");
      assert.equal(url.searchParams.get("play_tag"), "wine_campaign");
      return jsonResponse(responseBody);
    });

    const exitCode = await run(["analytics", "campaigns", "--tag", "wine_campaign", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("analytics users sends date cohort and motion filters and renders activity tables", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/analytics/users.json");
      assert.equal(url.searchParams.get("account_user_id"), "me");
      assert.equal(url.searchParams.get("start_date"), "2026-07-01");
      assert.equal(url.searchParams.get("end_date"), "2026-07-07");
      assert.equal(url.searchParams.get("window"), null);
      assert.equal(url.searchParams.get("cohort_start"), "2026-06-01");
      assert.equal(url.searchParams.get("cohort_end"), "2026-06-30");
      assert.equal(url.searchParams.get("motion_id"), "motn_focus");
      assert.equal(url.searchParams.get("provenance"), "motion");
      assert.equal(url.searchParams.get("platform"), "linkedin");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse({
        kind: "users",
        account_user: { id: 42, user_id: 7, name: "User One", email: "one@example.com" },
        date_range: {
          start_date: "2026-07-01",
          end_date: "2026-07-07",
          field: "events.created_at"
        },
        cohort: {
          start_date: "2026-06-01",
          end_date: "2026-06-30",
          field: "account_prospects.created_at"
        },
        motion: {
          id: 123,
          prefix_id: "motn_focus",
          name: "Focused Motion",
          kind: "outbound",
          status: "active"
        },
        provenance: {
          key: "motion",
          label: "Motion",
          field: "account_prospects.intake_source"
        },
        platform: {
          key: "linkedin",
          label: "LinkedIn",
          values: ["linkedin"],
          field: "events.platform"
        },
		        summary: {
	          total_count: 3,
	          actor_activity_count: 1,
	          attribution_total_count: 3,
	          performed_by_user_count: 1,
	          performed_by_user_percentage: 33.3,
	          performed_by_others_count: 1,
	          performed_by_others_percentage: 33.3,
	          agentic_count: 1,
	          agentic_percentage: 33.3
	        },
        daily_actions: [
          {
            date: "2026-07-01",
            total_count: 2,
            actions: {
              "action.profile.follow": 1,
              "action.post.comment": 1
            }
          },
          {
            date: "2026-07-02",
            total_count: 1,
            actions: {
              "messaging.message_sent": 1
            }
          }
        ],
        action_mix: [
          { key: "action.profile.follow", label: "Profile follow", count: 1, percentage: 33.3 },
          { key: "action.post.comment", label: "Post comment", count: 1, percentage: 33.3 },
          { key: "messaging.message_sent", label: "Message sent", count: 1, percentage: 33.3 }
        ],
        platform_mix: [
          { key: "linkedin", label: "LinkedIn", count: 3, percentage: 100.0 }
        ]
      });
    });

    const exitCode = await run([
      "analytics",
      "users",
      "--user",
      "me",
      "--start",
      "2026-07-01",
      "--end",
      "2026-07-07",
      "--cohort-start",
      "2026-06-01",
      "--cohort-end",
      "2026-06-30",
      "--motion",
      "motn_focus",
      "--provenance",
      "motion",
      "--platform",
      "linkedin"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /User analytics \(2026-07-01 to 2026-07-07\)/);
    assert.match(stdout.output, /Cohort: 2026-06-01 to 2026-06-30 \(account_prospects\.created_at\)/);
    assert.match(stdout.output, /Motion: Focused Motion \(motn_focus\)/);
    assert.match(stdout.output, /Provenance: Motion \(account_prospects\.intake_source\)/);
    assert.match(stdout.output, /Platform: LinkedIn \(events\.platform: linkedin\)/);
	    assert.match(stdout.output, /User: User One \(42\)/);
	    assert.match(stdout.output, /Actions: 3/);
	    assert.match(stdout.output, /Performed by you: 1 \(33\.3%\)/);
	    assert.match(stdout.output, /Other humans: 1 \(33\.3%\)/);
	    assert.match(stdout.output, /Agent: 1 \(33\.3%\)/);
    assert.match(stdout.output, /Actions by day/);
    assert.match(stdout.output, /DATE        TOTAL  Follow  Comment  Message/);
    assert.match(stdout.output, /2026-07-01      2       1        1        0/);
    assert.match(stdout.output, /2026-07-02      1       0        0        1/);
    assert.match(stdout.output, /Action mix/);
    assert.match(stdout.output, /Profile follow      1  33\.3%/);
    assert.match(stdout.output, /Platform mix/);
    assert.match(stdout.output, /LinkedIn\s+3\s+100%/);
  });
});

test("analytics users accepts channel as a platform filter alias", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const fetch = createFetch((url) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/analytics/users.json");
      assert.equal(url.searchParams.get("account_user_id"), "me");
      assert.equal(url.searchParams.get("window"), "30d");
      assert.equal(url.searchParams.get("platform"), "email");
      return jsonResponse({
        kind: "users",
        account_user: { id: 42, name: "User One" },
        window: { key: "30d" },
        platform: {
          key: "email",
          label: "Email",
          values: ["email", "gmail"],
          field: "events.platform"
        },
        summary: {
          total_count: 2,
          performed_by_user_count: 1,
          performed_by_user_percentage: 50.0,
          performed_by_others_count: 1,
          performed_by_others_percentage: 50.0,
          agentic_count: 0,
          agentic_percentage: 0.0
        },
        daily_actions: [],
        action_mix: [],
        platform_mix: [
          { key: "email", label: "Email", count: 1, percentage: 50.0 },
          { key: "gmail", label: "Gmail", count: 1, percentage: 50.0 }
        ]
      });
    });
    const stdout = captureStream();

    const exitCode = await run(["analytics", "users", "--channel", "email"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Platform: Email \(events\.platform: email, gmail\)/);
    assert.match(stdout.output, /Email\s+1\s+50%/);
    assert.match(stdout.output, /Gmail\s+1\s+50%/);
  });
});

test("analytics users defaults to me and a 30 day activity window", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const fetch = createFetch((url) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/analytics/users.json");
      assert.equal(url.searchParams.get("account_user_id"), "me");
      assert.equal(url.searchParams.get("window"), "30d");
      return jsonResponse({
        kind: "users",
        account_user: { id: 42, name: "User One" },
        window: { key: "30d" },
        summary: { total_count: 0, performed_by_others_count: 0, performed_by_others_percentage: null },
        daily_actions: [],
        action_mix: [],
        platform_mix: []
      });
    });
    const stdout = captureStream();

    const exitCode = await run(["analytics", "user"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /User analytics \(30d\)/);
    assert.match(stdout.output, /User: User One \(42\)/);
  });
});

test("analytics users defaults to the saved account user when selected", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One",
      accountUserId: "42",
      accountUserName: "User One",
      accountUserEmail: "one@example.com"
    }, { env });

    const fetch = createFetch((url) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/analytics/users.json");
      assert.equal(url.searchParams.get("account_user_id"), "42");
      assert.equal(url.searchParams.get("window"), "30d");
      return jsonResponse({
        kind: "users",
        account_user: { id: 42, name: "User One" },
        window: { key: "30d" },
        summary: { total_count: 0, performed_by_others_count: 0, performed_by_others_percentage: null },
        daily_actions: [],
        action_mix: [],
        platform_mix: []
      });
    });
    const stdout = captureStream();

    const exitCode = await run(["analytics", "user"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /User: User One \(42\)/);
  });
});

test("analytics visibility supports visops alias and json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      kind: "visibility",
      account_user: { id: 42, name: "User One", email: "one@example.com" },
      window: { key: "7d" },
      unique_people_engaged_count: 4,
      engagements: {
        total_count: 5,
        automated_count: 2,
        automated_percentage: 40.0,
        breakdown: []
      }
    };
    const fetch = createFetch((url) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/analytics/visibility.json");
      assert.equal(url.searchParams.get("window"), "7d");
      assert.equal(url.searchParams.get("account_user_id"), "one@example.com");
      return jsonResponse(responseBody);
    });
    const stdout = captureStream();

    const exitCode = await run(["analytics", "visops", "--window", "7d", "--user", "one@example.com", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("analytics content sends week window and renders publishing summary", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const fetch = createFetch((url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/analytics/content.json");
      assert.equal(url.searchParams.get("window"), "week");
      assert.equal(url.searchParams.get("account_user_id"), "42");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse({
        kind: "content",
        account_user: { id: 42, name: "User One", email: "one@example.com" },
        window: { key: "7d" },
        published_posts_count: 3,
        stage_breakdown: [
          { key: "posted", label: "Posted", count: 3 },
          { key: "scheduled", label: "Scheduled", count: 2 }
        ],
        execution_status_breakdown: [
          { key: "completed", label: "Completed", count: 3 },
          { key: "waiting", label: "Waiting", count: 2 }
        ]
      });
    });
    const stdout = captureStream();

    const exitCode = await run(["analytics", "content", "--window", "week", "--user", "42"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Content analytics \(7d\)/);
    assert.match(stdout.output, /User: User One \(42\)/);
    assert.match(stdout.output, /Published posts: 3/);
    assert.match(stdout.output, /Posted         3/);
    assert.match(stdout.output, /Waiting        2/);
  });
});

test("operator outcome posts a payload with the command row id", async () => {
  await withTempConfigHome(async ({ root, env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });
    const payloadPath = join(root, "operator-outcome.json");
    await writeFile(payloadPath, JSON.stringify({
      row_id: "from-file",
      status: "done",
      action_type: "connection_request",
      prospect_id: "prsp_one",
      note: "Connection request sent."
    }));

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/operator/outcome.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), {
        row_id: "123",
        status: "done",
        action_type: "connection_request",
        prospect_id: "prsp_one",
        note: "Connection request sent."
      });
      return jsonResponse({
        status: "ok",
        row_id: "123",
        operator_outcome: { status: "done", action_type: "connection_request" },
        prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
        event: { prefix_id: "evnt_one", key: "action.profile.connect_request_sent" }
      });
    });

    const exitCode = await run(["operator", "outcome", "123", "--payload", payloadPath], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Recorded done outcome for row 123/);
    assert.match(stdout.output, /Event: evnt_one/);
  });
});

test("operator outcome supports json output", async () => {
  await withTempConfigHome(async ({ root, env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });
    const payloadPath = join(root, "operator-outcome.json");
    const responseBody = {
      status: "ok",
      row_id: "123",
      operator_outcome: { status: "skipped", action_type: "connection_request" },
      prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
      event: { prefix_id: "evnt_note", key: "note.internal" }
    };
    await writeFile(payloadPath, JSON.stringify({
      status: "skipped",
      action_type: "connection_request",
      note: "No safe opening."
    }));

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse(responseBody));

    const exitCode = await run(["operator", "outcome", "123", "--payload", payloadPath, "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("account read commands require a selected account or account override", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token"
    }, { env });

    const stderr = captureStream();
    const fetch = createFetch(() => {
      throw new Error("account-less command must not call the API");
    });

    const exitCode = await run(["motions", "list"], { env, fetch, stderr });

    assert.equal(exitCode, 1);
    assert.match(stderr.output, /No active account/);
  });
});

test("auth status checks live auth and masks token", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "abcd1234wxyz",
      accountId: "acct_one",
      accountName: "One",
      accountUserId: "42",
      accountUserName: "User One",
      accountUserEmail: "one@example.com"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/me.json");
      assert.equal(options.headers.Authorization, "Bearer abcd1234wxyz");
      return jsonResponse({ id: 1, name: "User One" });
    });

    const exitCode = await run(["auth", "status"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Token: abcd...wxyz/);
    assert.match(stdout.output, /User: User One/);
    assert.match(stdout.output, /Active account: One \(acct_one\)/);
    assert.match(stdout.output, /Default account user: User One \(42\)/);
  });
});
