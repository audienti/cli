import assert from "node:assert/strict";
import test from "node:test";
import { writeConfig } from "../src/config.js";
import { run } from "../src/cli.js";
import { captureStream, createFetch, jsonResponse, withTempConfigHome } from "./helpers.js";

test("social-cookies sync-messages uses the account override and prints durable state", async () => {
  await withTempConfigHome(async ({env}) => {
    await writeConfig({
      host: "https://app.example.test",
      token: "saved-token",
      accountId: "acct_saved"
    }, {env});

    const responseBody = {
      social_cookie_id: "scok_mail",
      requested: true,
      coalesced: false,
      reason: null,
      sync_states: [{
        id: 7,
        canonical_folder: "sent",
        generation: 4,
        status: "pending",
        due_at: "2026-09-26T13:00:00Z",
        lease_expires_at: "2026-09-26T13:10:00Z",
        attempts: 0,
        last_success_at: "2026-09-26T12:00:00Z",
        last_error_code: null,
        last_synced_through_at: "2026-09-26T11:45:00Z"
      }]
    };
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.example.test/api/v1/accounts/acct_override/social_cookies/scok_mail/sync_messages.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), {folder: "Sent Items", retry: true});
      return jsonResponse(responseBody, {status: 202});
    });
    const stdout = captureStream();

    const exitCode = await run([
      "social-cookies", "sync-messages", "scok_mail", "--folder", "Sent Items", "--retry", "--account", "acct_override"
    ], {env, fetch, stdout});

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Email sync: accepted for scok_mail/);
    assert.match(stdout.output, /sent\tpending\t4\t0/);
    assert.match(stdout.output, /2026-09-26T11:45:00Z/);
    assert.equal(fetch.calls.length, 1);
  });
});

test("social-cookies sync-messages --json preserves the server status payload", async () => {
  await withTempConfigHome(async ({env}) => {
    await writeConfig({
      host: "https://app.example.test",
      token: "saved-token",
      accountId: "acct_saved"
    }, {env});
    const responseBody = {
      social_cookie_id: "scok_mail",
      requested: false,
      coalesced: true,
      reason: "credential_required",
      sync_states: [{canonical_folder: "inbox", status: "blocked", attempts: 3, last_error_code: "credential_required"}]
    };
    const fetch = createFetch(() => jsonResponse(responseBody, {status: 202}));
    const stdout = captureStream();

    const exitCode = await run(["social-cookies", "sync-messages", "scok_mail", "--json"], {env, fetch, stdout});

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("social-cookies sync-messages reports API errors without claiming a request", async () => {
  await withTempConfigHome(async ({env}) => {
    await writeConfig({
      host: "https://app.example.test",
      token: "saved-token",
      accountId: "acct_saved"
    }, {env});
    const fetch = createFetch(() => jsonResponse({error: "email sync is not supported for this social cookie"}, {status: 422}));
    const stderr = captureStream();

    const exitCode = await run(["social-cookies", "sync-messages", "scok_linkedin"], {env, fetch, stderr});

    assert.equal(exitCode, 1);
    assert.match(stderr.output, /Error: Audienti rejected the request: email sync is not supported/);
  });
});
