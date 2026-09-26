import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, AudientiClient } from "../src/api-client.js";
import { createFetch, jsonResponse } from "./helpers.js";

test("syncSocialCookieMessages posts the account, cookie, folder, and retry intent", async () => {
  const responseBody = {
    social_cookie_id: "scok_mail",
    requested: true,
    coalesced: false,
    reason: null,
    sync_states: [{canonical_folder: "sent", status: "pending", generation: 4, attempts: 0}]
  };
  const fetch = createFetch((url, options) => {
    assert.equal(url.toString(), "https://app.example.test/api/v1/accounts/acct_one/social_cookies/scok_mail/sync_messages.json");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer saved-token");
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(options.body), {folder: "Sent Items", retry: true});
    return jsonResponse(responseBody, {status: 202});
  });

  const client = new AudientiClient({
    host: "https://app.example.test",
    token: "saved-token",
    fetchImpl: fetch
  });

  assert.deepEqual(
    await client.syncSocialCookieMessages("acct_one", "scok_mail", {folder: "Sent Items", retry: true}),
    responseBody
  );
  assert.equal(fetch.calls.length, 1);
});

test("syncSocialCookieMessages preserves API status and error body", async () => {
  const fetch = createFetch(() => jsonResponse({error: "email sync is not supported for this social cookie"}, {status: 422}));
  const client = new AudientiClient({host: "https://app.example.test", token: "saved-token", fetchImpl: fetch});

  await assert.rejects(
    client.syncSocialCookieMessages("acct_one", "scok_linkedin", {}),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 422);
      assert.deepEqual(error.body, {error: "email sync is not supported for this social cookie"});
      assert.match(error.message, /email sync is not supported/);
      return true;
    }
  );
});
