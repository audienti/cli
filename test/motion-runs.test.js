import assert from "node:assert/strict";
import test from "node:test";
import { writeConfig } from "../src/config.js";
import { run } from "../src/cli.js";
import { captureStream, createFetch, jsonResponse, withTempConfigHome } from "./helpers.js";

const CONFIG = { host: "https://app.audienti.com", token: "saved-token", accountId: "acct_one" };

test("motions runs supports account override, pagination, JSON, and GET only", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig(CONFIG, { env });
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_two/motions/motn_1/runs.json");
      assert.equal(url.searchParams.get("cursor"), "7");
      assert.equal(url.searchParams.get("limit"), "2");
      assert.equal(options.method, "GET");
      return jsonResponse({runs: [{id: "run_1", purpose: "intake", status: "completed", outcome: "saved", seen_count: 4, submitted_count: 3, promoted_count: 2}], has_more: true, next_cursor: "next_2"});
    });

    assert.equal(await run(["motions", "runs", "motn_1", "--account", "acct_two", "--cursor", "7", "--limit", "2", "--json"], {env, fetch, stdout}), 0);
    assert.deepEqual(JSON.parse(stdout.output), {runs: [{id: "run_1", purpose: "intake", status: "completed", outcome: "saved", seen_count: 4, submitted_count: 3, promoted_count: 2}], has_more: true, next_cursor: "next_2"});
  });
});

test("motions runs plain output shows purpose, submitted, saved, errors, and next cursor", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig(CONFIG, { env });
    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse({runs: [{id: "run_2", purpose: "replenishment", status: "failed", outcome: "blocked", seen_count: 0, submitted_count: 5, promoted_count: 1, error_message: "invalid query"}], has_more: true, next_cursor: "next_3"}));
    assert.equal(await run(["motions", "runs", "motn_1"], {env, fetch, stdout}), 0);
    assert.match(stdout.output, /replenishment: failed/);
    assert.match(stdout.output, /submitted 5/);
    assert.match(stdout.output, /saved 1/);
    assert.match(stdout.output, /invalid query/);
    assert.match(stdout.output, /--cursor next_3/);
  });
});

test("motions runs help documents the read-only paginated command", async () => {
  const stdout = captureStream();
  assert.equal(await run(["motions", "runs", "--help"], {stdout}), 0);
  assert.match(stdout.output, /--cursor <id>/);
  assert.match(stdout.output, /read-only/);
});
