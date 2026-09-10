import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { writeConfig } from "../src/config.js";
import { run } from "../src/cli.js";
import { captureStream, createFetch, jsonResponse, withTempConfigHome } from "./helpers.js";

function inboxRow(id, sender, subject = `Subject ${id}`) {
  const domain = sender.split("@")[1];
  return {
    id: `inbox_ops_message_${id}`,
    opportunity_kind: "inbox",
    display_name: sender,
    inbox_ops: { sender, domain, subject, channel: "Gmail", connected_account: "owner@example.com", state: "needs_action" }
  };
}

const PAGE_ONE = [inboxRow(1, "news@alerts.example.com"), inboxRow(2, "promo@alerts.example.com"), inboxRow(3, "ceo@target.io", "Re: intro")];
const PAGE_TWO = [inboxRow(4, "deals@mail.alerts.example.com"), inboxRow(3, "ceo@target.io", "Re: intro")];

async function withInboxConfig(callback) {
  await withTempConfigHome(async ({ env, root }) => {
    await writeConfig({ host: "https://app.audienti.com", token: "saved-token", accountId: "acct_one", accountName: "One" }, { env });
    await callback({ env, root });
  });
}

function pagedFetch({ onAction } = {}) {
  return createFetch((url, options) => {
    if (url.pathname === "/api/v1/accounts/acct_one/operator.json") {
      assert.equal(url.searchParams.get("opportunity_kind"), "inbox");
      if (url.searchParams.get("operator_page") === "2") {
        assert.equal(url.searchParams.get("operator_cursor"), "cursor-two");
        return jsonResponse({ decision_queue: PAGE_TWO, has_more: false, operator_page: 2 });
      }
      return jsonResponse({ decision_queue: PAGE_ONE, has_more: true, next_page: 2, metrics: { next_cursor: "cursor-two", next_offset: 3 } });
    }
    if (url.pathname === "/api/v1/accounts/acct_one/inbox_ops/actions.json") {
      const body = JSON.parse(options.body);
      onAction?.(body);
      return jsonResponse({
        kind: "owner_personal_inbox_ops_actions",
        operation: body.operation,
        dry_run: body.dry_run === true,
        counts: { applied: body.dry_run ? 0 : body.row_ids.length, planned: body.dry_run ? body.row_ids.length : 0, skipped: 0, rejected: 0 },
        results: body.row_ids.map((rowId) => ({ row_id: rowId, status: body.dry_run ? "planned" : "applied" }))
      });
    }
    if (url.pathname === "/api/v1/accounts/acct_one/inbox_ops/rules.json") {
      const body = JSON.parse(options.body);
      return jsonResponse({ kind: "owner_personal_inbox_ops_rule", rule: { action: "set", scope: body.scope, disposition: body.disposition, normalized_key: body.key } });
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  });
}

async function listQueue(env, fetch, args = []) {
  const stdout = captureStream();
  const exitCode = await run(["inbox-ops", "queue", ...args], { env, fetch, stdout });
  assert.equal(exitCode, 0, stdout.output);
  return stdout.output;
}

test("inbox-ops queue follows every page, numbers rows, dedupes, and saves a per-account snapshot", async () => {
  await withInboxConfig(async ({ env, root }) => {
    const fetch = pagedFetch();
    const output = await listQueue(env, fetch);

    assert.equal(fetch.calls.length, 2);
    assert.match(output, /#\s+ROW ID\s+SENDER\s+DOMAIN\s+SUBJECT\s+CONNECTED INBOX/);
    assert.match(output, /^1\s+inbox_ops_message_1\s+news@alerts\.example\.com/m);
    assert.match(output, /^3\s+inbox_ops_message_3\s+ceo@target\.io\s+target\.io\s+Re: intro/m);
    assert.match(output, /^4\s+inbox_ops_message_4\s+deals@mail\.alerts\.example\.com/m);
    assert.doesNotMatch(output, /^5\s/m);
    assert.match(output, /4 rows\. Numbers stay valid/);
    assert.match(output, /audienti inbox-ops ignore 1-25/);

    const snapshot = JSON.parse(await readFile(join(root, "inbox-ops-snapshot.json"), "utf8"));
    assert.equal(snapshot.account_id, "acct_one");
    assert.deepEqual(snapshot.rows.map((row) => [row.number, row.id]), [[1, "inbox_ops_message_1"], [2, "inbox_ops_message_2"], [3, "inbox_ops_message_3"], [4, "inbox_ops_message_4"]]);
  });
});

test("inbox-ops queue --json returns the numbered combined list", async () => {
  await withInboxConfig(async ({ env }) => {
    const stdout = captureStream();
    assert.equal(await run(["inbox-ops", "queue", "--json"], { env, fetch: pagedFetch(), stdout }), 0);
    const payload = JSON.parse(stdout.output);
    assert.equal(payload.row_count, 4);
    assert.equal(payload.pages_fetched, 2);
    assert.equal(payload.truncated, false);
    assert.deepEqual(payload.decision_queue.map((row) => row.number), [1, 2, 3, 4]);
    assert.equal(payload.decision_queue[0].domain, "alerts.example.com");
  });
});

test("inbox-ops queue --group-by domain summarizes rows with their numbers", async () => {
  await withInboxConfig(async ({ env }) => {
    const output = await listQueue(env, pagedFetch(), ["--group-by", "domain"]);
    assert.match(output, /DOMAIN\s+COUNT\s+ROWS/);
    assert.match(output, /^alerts\.example\.com\s+2\s+1-2/m);
    assert.match(output, /^mail\.alerts\.example\.com\s+1\s+4/m);
    assert.match(output, /^target\.io\s+1\s+3/m);
    assert.match(output, /4 rows across 3 domains/);
    assert.match(output, /filter-domain --domain <domain> --yes/);
  });
});

test("inbox-ops ignore resolves numbers, ranges, and --domain from the snapshot and applies only with --yes", async () => {
  await withInboxConfig(async ({ env }) => {
    const actions = [];
    const fetch = pagedFetch({ onAction: (body) => actions.push(body) });
    await listQueue(env, fetch);

    let stdout = captureStream();
    assert.equal(await run(["inbox-ops", "ignore", "1-2,3"], { env, fetch, stdout }), 0);
    assert.equal(actions.length, 0);
    assert.match(stdout.output, /Ignore 3 messages:/);
    assert.match(stdout.output, /^1\s+inbox_ops_message_1\s+news@alerts\.example\.com/m);
    assert.match(stdout.output, /Nothing applied\. Re-run with --yes/);

    stdout = captureStream();
    assert.equal(await run(["inbox-ops", "ignore", "--domain", "alerts.example.com", "--dry-run"], { env, fetch, stdout }), 0);
    assert.equal(actions.length, 1);
    assert.deepEqual(actions[0], { operation: "ignore", row_ids: ["inbox_ops_message_1", "inbox_ops_message_2", "inbox_ops_message_4"], dry_run: true });
    assert.match(stdout.output, /Dry run: Planned 3\. No changes were made\./);

    stdout = captureStream();
    assert.equal(await run(["inbox-ops", "ignore", "3", "inbox_ops_message_99", "--yes"], { env, fetch, stdout }), 0);
    assert.equal(actions.length, 2);
    assert.deepEqual(actions[1], { operation: "ignore", row_ids: ["inbox_ops_message_3", "inbox_ops_message_99"] });
    assert.match(stdout.output, /^3\s+inbox_ops_message_3\s+Applied/m);
    assert.match(stdout.output, /^-\s+inbox_ops_message_99\s+Applied/m);
    assert.match(stdout.output, /Applied 2\./);
    assert.match(stdout.output, /Row numbers stay valid/);
  });
});

test("inbox-ops bulk verbs chunk large selections and merge per-row results", async () => {
  await withInboxConfig(async ({ env, root }) => {
    const rows = Array.from({ length: 120 }, (_, index) => ({ number: index + 1, id: `inbox_ops_message_${index + 1}`, sender: `s${index}@x.io`, domain: "x.io", subject: "S" }));
    await writeFile(join(root, "inbox-ops-snapshot.json"), JSON.stringify({ version: 1, account_id: "acct_one", rows }));
    const actions = [];
    const fetch = pagedFetch({ onAction: (body) => actions.push(body) });
    const stdout = captureStream();

    assert.equal(await run(["inbox-ops", "filter-sender", "1-120", "--yes", "--json"], { env, fetch, stdout }), 0);
    assert.deepEqual(actions.map((body) => body.row_ids.length), [50, 50, 20]);
    assert.ok(actions.every((body) => body.operation === "filter_sender"));
    const payload = JSON.parse(stdout.output);
    assert.equal(payload.results.length, 120);
    assert.equal(payload.counts.applied, 120);
  });
});

test("inbox-ops filter-domain with only --domain writes the keyed rule directly", async () => {
  await withInboxConfig(async ({ env }) => {
    const fetch = pagedFetch();
    await listQueue(env, fetch);
    const stdout = captureStream();

    assert.equal(await run(["inbox-ops", "filter-domain", "--domain", "alerts.example.com", "--yes"], { env, fetch, stdout }), 0);
    const ruleCall = fetch.calls.find((call) => call.url.includes("/inbox_ops/rules.json"));
    assert.equal(ruleCall.options.method, "PATCH");
    assert.deepEqual(JSON.parse(ruleCall.options.body), { scope: "domain", key: "alerts.example.com", disposition: "filter" });
    assert.match(stdout.output, /Always filter domain alerts\.example\.com\. Listed rows affected: 1-2,4\./);
    assert.match(stdout.output, /Always filtering domain alerts\.example\.com\./);
    assert.ok(!fetch.calls.some((call) => call.url.includes("/inbox_ops/actions.json")));
  });
});

test("inbox-ops bulk verbs fail closed without a snapshot, across accounts, and on bad selectors", async () => {
  await withInboxConfig(async ({ env }) => {
    const fetch = pagedFetch();
    let stderr = captureStream();
    assert.equal(await run(["inbox-ops", "ignore", "1-3", "--yes"], { env, fetch, stdout: captureStream(), stderr }), 1);
    assert.match(stderr.output, /Run `audienti inbox-ops queue` first/);

    await listQueue(env, fetch);
    stderr = captureStream();
    assert.equal(await run(["inbox-ops", "ignore", "1", "--yes", "--account", "acct_two"], { env, fetch, stdout: captureStream(), stderr }), 1);
    assert.match(stderr.output, /belongs to account acct_one/);

    stderr = captureStream();
    assert.equal(await run(["inbox-ops", "ignore", "9", "--yes"], { env, fetch, stdout: captureStream(), stderr }), 1);
    assert.match(stderr.output, /Row 9 is not in the current Inbox Ops list \(1-4\)/);

    stderr = captureStream();
    assert.equal(await run(["inbox-ops", "ignore", "evnt_12", "--yes"], { env, fetch, stdout: captureStream(), stderr }), 1);
    assert.match(stderr.output, /Unrecognized selector "evnt_12"/);

    stderr = captureStream();
    assert.equal(await run(["inbox-ops", "ignore", "1", "--yes", "--dry-run"], { env, fetch, stdout: captureStream(), stderr }), 1);
    assert.match(stderr.output, /either --dry-run or --yes/);

    assert.ok(!fetch.calls.some((call) => call.url.includes("/inbox_ops/actions.json")));
  });
});
