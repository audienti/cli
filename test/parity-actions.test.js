import assert from "node:assert/strict";
import test from "node:test";
import { writeConfig } from "../src/config.js";
import { run } from "../src/cli.js";
import { captureStream, createFetch, jsonResponse, withTempConfigHome } from "./helpers.js";

const ACCOUNT = "/api/v1/accounts/acct_one";

const CASES = [
  { args: ["prospects", "defer", "prsp_one"], method: "POST", path: "/prospects/prsp_one/defer.json", body: undefined, output: /Deferred prospect prsp_one/ },
  { args: ["prospects", "delay", "prsp_one", "--for", "1_week"], method: "POST", path: "/prospects/prsp_one/delay.json", body: { delay_duration: "1_week" }, response: { undelay_at: "2026-10-05" }, output: /until 2026-10-05/ },
  { args: ["prospects", "monitor", "prsp_one", "--note", "Watch"], method: "POST", path: "/prospects/prsp_one/monitor.json", body: { monitor_note: "Watch" } },
  { args: ["prospects", "unmonitor", "prsp_one"], method: "POST", path: "/prospects/prsp_one/unmonitor.json", body: undefined },
  { args: ["prospects", "rename", "prsp_one", "--name", "Pat P"], method: "PATCH", path: "/prospects/prsp_one/display_name.json", body: { display_name: "Pat P" } },
  { args: ["prospects", "import-post", "prsp_one", "--url", "https://www.linkedin.com/posts/x"], method: "POST", path: "/prospects/prsp_one/import_post.json", body: { url: "https://www.linkedin.com/posts/x" } },
  { args: ["prospects", "sync", "prsp_one", "--social-cookie", "7"], method: "POST", path: "/prospects/prsp_one/sync.json", body: { social_cookie_id: "7" } },
  { args: ["prospects", "cancel-event", "prsp_one", "--event", "42"], method: "POST", path: "/prospects/prsp_one/cancel_scheduled_event.json", body: { event_id: "42" } },
  { args: ["prospects", "queue-draft", "prsp_one", "--context", '{"selected_action":{"key":"send_email"},"message_mode":"email"}'], method: "POST", path: "/prospects/prsp_one/write.json", body: { context: { selected_action: { key: "send_email" }, message_mode: "email" } } },
  { args: ["prospects", "queue-draft", "prsp_one"], method: "POST", path: "/prospects/prsp_one/write.json", body: {} },
  { args: ["prospects", "rewrite", "prsp_one", "--angle", "2"], method: "POST", path: "/prospects/prsp_one/rewrite.json", body: { angle_index: "2" } },
  { args: ["prospects", "engage", "prsp_one", "--type", "send_direct_message", "--message", "Hi", "--social-cookie", "7"], method: "POST", path: "/prospects/prsp_one/engage.json", body: { action_type: "send_direct_message", message: "Hi", engage_point_id: "7" }, response: { status: "created", message: "Message sent successfully" }, output: /Message sent successfully/ },
  { args: ["prospects", "engage", "prsp_one", "--type", "create_post_comment", "--message", "Nice", "--post", "55", "--comment", "66", "--social-cookie", "7"], method: "POST", path: "/prospects/prsp_one/engage.json", body: { action_type: "create_post_comment", message: "Nice", engage_point_id: "7", mention_id: "55", comment_id: "66" } },
  { args: ["prospects", "engage", "prsp_one", "--type", "send_direct_message", "--message", "Hi", "--reply-to", "88"], method: "POST", path: "/prospects/prsp_one/engage.json", body: { action_type: "send_direct_message", message: "Hi", message_id: "88" } },
  { args: ["prospects", "engage", "prsp_one", "--type", "connect_request", "--social-cookie", "7", "--queue-action", "--principal", "12", "--request-mode", "blank"], method: "POST", path: "/prospects/prsp_one/engage.json", body: { action_type: "connect_request", engage_point_id: "7", queue_action: true, principal_account_user_id: "12", request_mode: "blank" } },
  { args: ["prospects", "reject-selected", "prsp_one", "prsp_two"], method: "POST", path: "/prospects/reject_selected.json", body: { prospect_ids: ["prsp_one", "prsp_two"] }, response: { rejected: ["prsp_one"], failed: [{ id: "prsp_two" }] }, output: /Rejected 1; failed 1/ },
  { args: ["prospects", "intake", "--url", "https://www.linkedin.com/in/pat", "--list", "lst_one"], method: "POST", path: "/prospects/intake.json", body: { url: "https://www.linkedin.com/in/pat", list_id: "lst_one" } },
  { args: ["events", "retry", "42"], method: "POST", path: "/events/42/retry.json", body: undefined },
  { args: ["profiles", "delete", "prof_one"], method: "DELETE", path: "/profiles/prof_one.json", body: undefined },
  { args: ["companies", "stop-pursuing", "prof_co"], method: "POST", path: "/companies/prof_co/stop_pursuing.json", body: undefined },
  { args: ["content", "defer", "cwi_one", "--for", "1_day"], method: "POST", path: "/content_ops/work_items/cwi_one/defer.json", body: { delay_duration: "1_day" } },
  { args: ["inbox-ops", "update-filters", "--subscriptions", "false", "--sender-allow", "a@x.com", "--sender-allow", "b@x.com"], method: "PATCH", path: "/inbox_ops/filters.json", body: { subscriptions: "false", sender_allow_rules: ["a@x.com", "b@x.com"] } },
  { args: ["inbox-ops", "draft-reply", "inbox_ops_message_1"], method: "POST", path: "/inbox_ops/inbox_ops_message_1/reply/write.json", body: undefined },
  { args: ["inbox-ops", "adopt", "inbox_ops_message_1", "--motion", "mot_one"], method: "POST", path: "/inbox_ops/inbox_ops_message_1/adopt.json", body: { motion_id: "mot_one" } },
  { args: ["network-ops", "adopt", "network_ops_event_1", "--target-account", "acct_two", "--motion", "motn_one"], method: "POST", path: "/network_ops/network_ops_event_1/adopt.json", body: { target_account_id: "acct_two", motion_id: "motn_one" } },
  { args: ["network-ops", "ignore", "network_ops_event_1"], method: "POST", path: "/network_ops/network_ops_event_1/ignore.json", body: undefined },
  { args: ["reconciliations", "add-to-motion", "src_1", "--motion", "mot_one"], method: "POST", path: "/reconciliations/src_1/add_to_motion.json", body: { motion_id: "mot_one" } },
  { args: ["reconciliations", "ignore", "src_1"], method: "POST", path: "/reconciliations/src_1/ignore.json", body: undefined },
  { args: ["motions", "bulk-add-tag", "motn_one", "motn_two", "--tag", "q3"], method: "POST", path: "/motions/bulk_add_tag.json", body: { motion_ids: ["motn_one", "motn_two"], tag: "q3" }, response: [{ id: 1 }, { id: 2 }], output: /Tagged 2 motions/ },
  { args: ["motions", "bulk-remove-tag", "motn_one", "--tag", "q3"], method: "POST", path: "/motions/bulk_remove_tag.json", body: { motion_ids: ["motn_one"], tag: "q3" }, response: [{ id: 1 }], output: /Removed the tag from 1 motions/ },
  { args: ["motions", "bulk-update-principal", "motn_one", "--principal", "12"], method: "POST", path: "/motions/bulk_update_principal.json", body: { motion_ids: ["motn_one"], principal_account_user_id: "12" }, response: [{ id: 1 }], output: /Assigned 1 motions/ },
  { args: ["motions", "bulk-update-status", "motn_one", "motn_two", "--status", "active"], method: "POST", path: "/motions/bulk_update_status.json", body: { motion_ids: ["motn_one", "motn_two"], status: "active" }, response: { status: "active", applied_count: 1, blocked_count: 1, blocked: [{ motion_id: "motn_two", reason: "awaiting_sender" }], motions: [] }, output: /Set 1 motions to active; 1 blocked\.\n  motn_two: awaiting_sender/ },
  { args: ["motions", "retire-strategy", "motn_one", "--strategy", "44"], method: "POST", path: "/motions/motn_one/strategies/44/retire.json", body: undefined, response: { already_retired: false, strategy: { id: 44, state: "retired" } }, output: /Retired strategy 44/ },
  { args: ["motions", "retire-strategy", "motn_one", "--strategy", "44"], method: "POST", path: "/motions/motn_one/strategies/44/retire.json", body: undefined, response: { already_retired: true, strategy: { id: 44, state: "retired" } }, output: /already retired/ },
  { args: ["motions", "refresh-launch-check", "motn_one"], method: "POST", path: "/motions/motn_one/refresh_launch_check.json", body: undefined, response: { name: "Q3", demand_status: "demand", producer_status: "runnable", reason: "launch" }, output: /Q3: demand demand, producer runnable/ },
  { args: ["motions", "refresh-launch-checks"], method: "POST", path: "/motions/refresh_launch_checks.json", body: undefined, response: { summary: "2 checked, 1 launchable" }, output: /Launch checks refreshed: 2 checked/ },
  { args: ["motions", "update-premise", "motn_one", "--premise", "Buyers under audit pressure."], method: "PATCH", path: "/motions/motn_one/update_premise.json", body: { motion: { premise: "Buyers under audit pressure." } }, output: /Updated the premise for motn_one/ }
];

async function withConfig(fn) {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({ host: "https://app.audienti.com", token: "saved-token", accountId: "acct_one", accountName: "One" }, { env });
    await fn(env);
  });
}

for (const testCase of CASES) {
  test(`${testCase.args.slice(0, 2).join(" ")} calls ${testCase.method} ${testCase.path}`, async () => {
    await withConfig(async (env) => {
      const stdout = captureStream();
      const fetch = createFetch((url, options) => {
        assert.equal(url.pathname, `${ACCOUNT}${testCase.path}`);
        assert.equal(options.method, testCase.method);
        if (testCase.body === undefined) {
          assert.equal(options.body, undefined);
        } else {
          assert.deepEqual(JSON.parse(options.body), testCase.body);
        }
        return jsonResponse(testCase.response || { status: "ok" });
      });

      const exitCode = await run(testCase.args, { env, fetch, stdout });
      assert.equal(exitCode, 0);
      assert.equal(fetch.calls.length, 1);
      if (testCase.output) assert.match(stdout.output, testCase.output);
    });
  });
}

test("inbox-ops reply sends a fresh reply token each run", async () => {
  await withConfig(async (env) => {
    const tokens = [];
    const fetch = createFetch((url, options) => {
      assert.equal(url.pathname, `${ACCOUNT}/inbox_ops/inbox_ops_message_1/reply.json`);
      const body = JSON.parse(options.body);
      assert.equal(body.message, "Thanks");
      assert.match(body.reply_token, /^[0-9a-f-]{36}$/);
      tokens.push(body.reply_token);
      return jsonResponse({ status: "queued", row_id: "inbox_ops_message_1" }, { status: 202 });
    });

    const stdout = captureStream();
    assert.equal(await run(["inbox-ops", "reply", "inbox_ops_message_1", "--message", "Thanks"], { env, fetch, stdout }), 0);
    assert.equal(await run(["inbox-ops", "reply", "inbox_ops_message_1", "--message", "Thanks"], { env, fetch, stdout }), 0);
    assert.match(stdout.output, /Reply queued for inbox_ops_message_1/);
    assert.notEqual(tokens[0], tokens[1]);
  });
});

test("--json prints the API payload", async () => {
  await withConfig(async (env) => {
    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse({ status: "deferred", prospect_id: "prsp_one" }));
    assert.equal(await run(["prospects", "defer", "prsp_one", "--json"], { env, fetch, stdout }), 0);
    assert.deepEqual(JSON.parse(stdout.output), { status: "deferred", prospect_id: "prsp_one" });
  });
});

test("missing required flags fail with usage and make no request", async () => {
  await withConfig(async (env) => {
    for (const args of [
      ["prospects", "delay", "prsp_one"],
      ["prospects", "rename", "prsp_one"],
      ["prospects", "engage", "prsp_one"],
      ["inbox-ops", "reply", "inbox_ops_message_1"],
      ["reconciliations", "add-to-motion", "src_1"],
      ["prospects", "reject-selected", "--json"],
      ["network-ops", "adopt", "network_ops_event_1"],
      ["network-ops", "adopt", "network_ops_event_1", "--motion", "motn_one"]
    ]) {
      const stdout = captureStream();
      const stderr = captureStream();
      const fetch = createFetch(() => {
        throw new Error("no request expected");
      });
      const exitCode = await run(args, { env, fetch, stdout, stderr });
      assert.notEqual(exitCode, 0, args.join(" "));
      assert.match(stderr.output, /Usage: audienti /, args.join(" "));
      assert.equal(fetch.calls.length, 0);
    }
  });
});

test("queue-draft rejects a --context that is not a JSON object without calling the API", async () => {
  await withConfig(async (env) => {
    for (const context of ["operator", "[1,2]", "{bad json"]) {
      const stdout = captureStream();
      const stderr = captureStream();
      const fetch = createFetch(() => {
        throw new Error("no request expected");
      });
      const exitCode = await run(["prospects", "queue-draft", "prsp_one", "--context", context], { env, fetch, stdout, stderr });
      assert.notEqual(exitCode, 0, context);
      assert.match(stderr.output, /--context must be a JSON object/, context);
      assert.equal(fetch.calls.length, 0);
    }
  });
});

test("API errors surface without printing success text", async () => {
  await withConfig(async (env) => {
    const stdout = captureStream();
    const stderr = captureStream();
    const fetch = createFetch(() => jsonResponse({ error: "Prospect is locked", reason: "prospect_locked" }, { status: 409 }));
    const exitCode = await run(["prospects", "engage", "prsp_one", "--type", "like"], { env, fetch, stdout, stderr });
    assert.notEqual(exitCode, 0);
    assert.match(stderr.output, /Prospect is locked/);
    assert.equal(stdout.output, "");
  });
});

test("a bare command that needs flags prints its help instead of calling the API", async () => {
  await withConfig(async (env) => {
    const stdout = captureStream();
    const fetch = createFetch(() => {
      throw new Error("no request expected");
    });
    assert.equal(await run(["prospects", "intake"], { env, fetch, stdout }), 0);
    assert.match(stdout.output, /Usage:\n  audienti prospects intake --url <linkedin_url>/);
    assert.equal(fetch.calls.length, 0);
  });
});

test("help topics document each new action and its API route", async () => {
  for (const [args, route] of [
    [["prospects", "defer", "help"], /POST \/api\/v1\/accounts\/:account_id\/prospects\/:id\/defer\.json/],
    [["events", "retry", "help"], /POST \/api\/v1\/accounts\/:account_id\/events\/:id\/retry\.json/],
    [["inbox-ops", "update-filters", "help"], /PATCH \/api\/v1\/accounts\/:account_id\/inbox_ops\/filters\.json/],
    [["reconciliations", "ignore", "help"], /POST \/api\/v1\/accounts\/:account_id\/reconciliations\/:id\/ignore\.json/],
    [["motions", "bulk-update-status", "help"], /POST \/api\/v1\/accounts\/:account_id\/motions\/bulk_update_status\.json/],
    [["motions", "retire-strategy", "help"], /POST \/api\/v1\/accounts\/:account_id\/motions\/:id\/strategies\/:motion_search_scope_id\/retire\.json/]
  ]) {
    const stdout = captureStream();
    assert.equal(await run(args, { stdout }), 0);
    assert.match(stdout.output, /Usage:\n  audienti /);
    assert.match(stdout.output, route);
  }
});

test("group help lists the single-purpose actions", async () => {
  for (const [args, usage] of [
    [["help", "prospects"], /audienti prospects defer <prsp_id>/],
    [["help", "events"], /audienti events retry <event_id>/],
    [["help", "network-ops"], /audienti network-ops adopt <row_id>/],
    [["help", "motions"], /audienti motions bulk-add-tag <motn_id>/],
    [["help", "motions"], /audienti motions refresh-launch-checks/],
    [["help", "motions"], /audienti motions update-premise <motn_id> --premise <text>/]
  ]) {
    const stdout = captureStream();
    assert.equal(await run(args, { stdout }), 0);
    assert.match(stdout.output, usage);
  }
});

test("motions update exits non-zero and prints the reason when the status change is blocked", async () => {
  await withConfig(async (env) => {
    const stdout = captureStream();
    const stderr = captureStream();
    const fetch = createFetch(() =>
      jsonResponse(
        {
          error: "Status not changed: awaiting_sender.",
          motion_id: "motn_one",
          status: "preparing",
          requested_status: "active",
          status_blocked: true,
          reason: "awaiting_sender"
        },
        { status: 422 }
      )
    );
    const exitCode = await run(["motions", "update", "motn_one", "--status", "active"], { env, fetch, stdout, stderr });
    assert.notEqual(exitCode, 0);
    assert.match(stderr.output, /Status not changed: awaiting_sender\./);
    assert.equal(stdout.output, "");
    assert.equal(fetch.calls[0].options.method, "PATCH");
  });
});

const MIXED_BLOCKED_MOTION = {
  name: "Mixed",
  prefix_id: "motn_one",
  status: "paused",
  play_tags: ["kept"],
  status_change: { status: "blocked", requested_status: "active", reason: "awaiting_sender" }
};

test("motions update prints saved changes and the blocked status reason, then exits non-zero", async () => {
  await withConfig(async (env) => {
    const stdout = captureStream();
    const stderr = captureStream();
    const fetch = createFetch(() => jsonResponse(MIXED_BLOCKED_MOTION));
    const exitCode = await run(["motions", "update", "motn_one", "--status", "active", "--tags", "kept"], { env, fetch, stdout, stderr });
    assert.equal(exitCode, 1);
    assert.match(stdout.output, /Updated motion Mixed \(motn_one\)\./);
    assert.match(stderr.output, /Status not changed to active: awaiting_sender\. Other changes were saved\./);
  });
});

test("motions update --json prints the full body and exits non-zero when the status change is blocked", async () => {
  await withConfig(async (env) => {
    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse(MIXED_BLOCKED_MOTION));
    const exitCode = await run(["motions", "update", "motn_one", "--status", "active", "--tags", "kept", "--json"], { env, fetch, stdout });
    assert.equal(exitCode, 1);
    assert.deepEqual(JSON.parse(stdout.output), MIXED_BLOCKED_MOTION);
  });
});

test("motions update exits zero when no status change is blocked", async () => {
  await withConfig(async (env) => {
    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse({ name: "Mixed", prefix_id: "motn_one", status: "active" }));
    assert.equal(await run(["motions", "update", "motn_one", "--status", "active", "--json"], { env, fetch, stdout }), 0);
  });
});
