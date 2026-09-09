import assert from "node:assert/strict";
import test from "node:test";
import { writeConfig } from "../src/config.js";
import { run } from "../src/cli.js";
import { captureStream, createFetch, jsonResponse, withTempConfigHome } from "./helpers.js";

const readCommands = [
  ["operator", "queue"],
  ["operator", "next"],
  ["operator", "failed-drafts"],
  ["inbox-ops", "queue"],
  ["network-ops", "queue"]
];

async function withOperatorConfig(callback) {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({ host: "https://app.audienti.com", token: "saved-token", accountId: "acct_one" }, { env });
    await callback(env);
  });
}

for (const command of readCommands) {
  test(`${command.join(" ")} preserves exact legacy and projected pagination in JSON reads`, async () => {
    await withOperatorConfig(async (env) => {
      for (const pagination of [["--page", "2", "--offset", "0"], ["--page", "3", "--cursor", "signed+cursor/token=="]]) {
        const stdout = captureStream();
        const payload = { decision_queue: [], next_move: null, operator_page: 2, next_page: 3, has_more: true, metrics: { next_offset: 0 } };
        const fetch = createFetch((url, options) => {
          assert.equal(options.method || "GET", "GET");
          assert.equal(url.searchParams.get("operator_page"), pagination[1]);
          assert.equal(url.searchParams.get(pagination[2] === "--offset" ? "operator_offset" : "operator_cursor"), pagination[3]);
          if (command[0] === "inbox-ops") assert.equal(url.searchParams.get("opportunity_kind"), "inbox");
          if (command[0] === "network-ops") assert.equal(url.searchParams.get("opportunity_kind"), "network");
          if (command[1] === "failed-drafts") assert.equal(url.searchParams.get("writing_status"), "draft_failed");
          return jsonResponse(payload);
        });
        const exitCode = await run([...command, ...pagination, "--json"], { env, fetch, stdout });
        assert.equal(exitCode, 0);
        assert.equal(fetch.calls.length, 1);
        assert.deepEqual(JSON.parse(stdout.output), payload);
      }
    });
  });

  test(`${command.join(" ")} continues an empty scanned page instead of declaring no work`, async () => {
    await withOperatorConfig(async (env) => {
      const stdout = captureStream();
      const fetch = createFetch(() => jsonResponse({
        decision_queue: [], next_move: null, operator_page: 1, next_page: 2, has_more: true,
        metrics: { next_offset: 0 }
      }));
      assert.equal(await run([...command, "--account", "acct_two"], { env, fetch, stdout }), 0);
      assert.doesNotMatch(stdout.output, /No (operator moves|failed operator drafts|Inbox Ops rows) found/);
      assert.match(stdout.output, /More rows: audienti /);
      assert.match(stdout.output, /--page 2 --offset 0/);
      assert.match(stdout.output, /--account acct_two/);
    });
  });
}

test("operator continuation reaches a later ready row with the same account and filters", async () => {
  await withOperatorConfig(async (env) => {
    const filters = ["--principal", "82", "--motion", "71", "--list", "12", "--stage", "pre_connect", "--opportunity-kind", "prospect", "--writing-status", "ready"];
    const fetch = createFetch((url, _options, calls) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_two/operator.json");
      for (const [key, value] of Object.entries({ principal_account_user_id: "82", motion_id: "71", list_id: "12", stage: "pre_connect", opportunity_kind: "prospect", writing_status: "ready" })) {
        assert.equal(url.searchParams.get(key), value);
      }
      if (calls.length === 1) return jsonResponse({ decision_queue: [], has_more: true, next_page: 2, metrics: { next_offset: 0 } });
      assert.equal(url.searchParams.get("operator_page"), "2");
      assert.equal(url.searchParams.get("operator_offset"), "0");
      return jsonResponse({ decision_queue: [{ id: "prospect_61", prospect: { display_name: "Later Ready Person" } }], has_more: false });
    });
    const first = captureStream();
    assert.equal(await run(["operator", "queue", ...filters, "--account", "acct_two"], { env, fetch, stdout: first }), 0);
    const continuation = first.output.split("\n").find((line) => line.startsWith("More rows: audienti "));
    assert.ok(continuation, first.output);
    const second = captureStream();
    assert.equal(await run(continuation.replace("More rows: audienti ", "").split(" "), { env, fetch, stdout: second }), 0);
    assert.match(second.output, /Later Ready Person/);
    assert.equal(fetch.calls.length, 2);
  });
});

test("projected continuation uses its opaque cursor and retains safely quoted filters", async () => {
  await withOperatorConfig(async (env) => {
    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse({ decision_queue: [], has_more: true, next_page: 2, metrics: { next_cursor: "signed+cursor/token==", next_offset: 20 } }));
    assert.equal(await run(["operator", "failed-drafts", "--query", "O'Reilly $(example)", "--account", "acct_two"], { env, fetch, stdout }), 0);
    assert.match(stdout.output, /--cursor 'signed\+cursor\/token=='/);
    assert.doesNotMatch(stdout.output, /--offset/);
    assert.ok(stdout.output.includes("--query 'O'\\''Reilly $(example)'"), stdout.output);
  });
});

test("printed continuation round trips dash-prefixed query and cursor values", async () => {
  await withOperatorConfig(async (env) => {
    const fetch = createFetch((url, _options, calls) => {
      assert.equal(url.searchParams.get("query"), "-foo");
      if (calls.length === 1) return jsonResponse({ decision_queue: [], has_more: true, next_page: 2, metrics: { next_cursor: "-signed-cursor" } });
      assert.equal(url.searchParams.get("operator_cursor"), "-signed-cursor");
      return jsonResponse({ decision_queue: [], has_more: false });
    });
    const stdout = captureStream();
    assert.equal(await run(["operator", "failed-drafts", "--query=-foo"], { env, fetch, stdout }), 0);
    const continuation = stdout.output.split("\n").find((line) => line.startsWith("More rows: audienti "));
    assert.ok(continuation, stdout.output);
    const stderr = captureStream();
    assert.equal(await run(continuation.replace("More rows: audienti ", "").split(" "), { env, fetch, stdout: captureStream(), stderr }), 0, stderr.output);
    assert.equal(fetch.calls.length, 2);
  });
});

test("operator next plan reports incomplete scans and reset state without inventing an empty queue", async () => {
  await withOperatorConfig(async (env) => {
    for (const cursorStatus of ["reset_to_legacy", "cursor_stale"]) {
      const stdout = captureStream();
      const fetch = createFetch(() => jsonResponse({ next_move: null, has_more: false, metrics: { scan_ceiling_reached: true, cursor_status: cursorStatus } }));
      assert.equal(await run(["operator", "next", "--plan"], { env, fetch, stdout }), 0);
      assert.doesNotMatch(stdout.output, /No operator moves found/);
      assert.match(stdout.output, /scan limit/i);
      assert.match(stdout.output, /narrow.*filters/i);
      assert.match(stdout.output, /restarted.*first page/i);
      assert.doesNotMatch(stdout.output, /More rows:/);
    }
  });
});

test("operator next does not skip unseen ready rows by printing a page continuation after its focal move", async () => {
  await withOperatorConfig(async (env) => {
    for (const options of [[], ["--plan"]]) {
      const stdout = captureStream();
      const fetch = createFetch(() => jsonResponse({
        next_move: { id: "prospect_1", prospect: { display_name: "Current Person" }, next_action: { type: "connection_request" } },
        has_more: true, next_page: 2, metrics: { next_offset: 20 }
      }));
      assert.equal(await run(["operator", "next", ...options], { env, fetch, stdout }), 0);
      assert.match(stdout.output, /Current Person/);
      assert.doesNotMatch(stdout.output, /More rows:|--page 2|--offset 20/);
    }
  });
});

test("operator pagination rejects invalid values and never scopes mutation commands", async () => {
  await withOperatorConfig(async (env) => {
    const invalidReads = [
      ["--page", "0"], ["--page", ""], ["--offset", "-1"], ["--offset", "1.5"], ["--offset", "9007199254740992"],
      ["--cursor", ""], ["--cursor", "token", "--offset", "0"]
    ];
    const commands = [
      ...invalidReads.map((options) => ["operator", "queue", ...options]),
      ["operator", "failed-drafts", "requeue", "--all", "--page", "2"],
      ["operator", "next", "--done", "--page", "2", "--offset", "0"],
      ["operator", "next", "--skip", "--cursor", "token"]
    ];
    for (const command of commands) {
      const fetch = createFetch(() => { throw new Error("invalid pagination must not issue a request"); });
      const stderr = captureStream();
      assert.notEqual(await run(command, { env, fetch, stdout: captureStream(), stderr }), 0, command.join(" "));
      assert.equal(fetch.calls.length, 0, command.join(" "));
    }
  });
});
