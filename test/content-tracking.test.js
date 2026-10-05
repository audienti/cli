import assert from "node:assert/strict";
import test from "node:test";
import { AudientiClient } from "../src/api-client.js";
import { createFetch, jsonResponse } from "./helpers.js";
import { captureStream, withTempConfigHome } from "./helpers.js";
import { writeConfig } from "../src/config.js";
import { run } from "../src/cli.js";

test("post tracking saves an owned URL then reads persisted engagement without sending a reply", async () => {
  const post = {prefix_id: "cpwi_owned", status: "checking", url: "https://www.linkedin.com/feed/update/urn:li:activity:7512124639742169088/"};
  const fetch = createFetch((url, options) => {
    assert.equal(options.headers.Authorization, "Bearer saved-token");
    if (options.method === "POST") {
      assert.equal(url.toString(), "https://app.example.test/api/v1/accounts/acct_one/content_ops/tracked_posts.json");
      assert.deepEqual(JSON.parse(options.body), {url: post.url, user: "me"});
      return jsonResponse(post, {status: 202});
    }
    if (url.pathname.endsWith("cpwi_owned.json")) return jsonResponse({...post, status: "monitoring", comments: [], reactions: []});
    assert.equal(url.searchParams.get("user"), "me");
    return jsonResponse({posts: [post], next_page: null});
  });
  const client = new AudientiClient({host: "https://app.example.test", token: "saved-token", fetchImpl: fetch});
  assert.deepEqual(await client.contentTrackPost("acct_one", {url: post.url, user: "me"}), post);
  assert.deepEqual(await client.contentTrackedPosts("acct_one", {user: "me"}), {posts: [post], next_page: null});
  assert.equal((await client.contentTrackedPost("acct_one", "cpwi_owned")).status, "monitoring");
  assert.equal(fetch.calls.length, 3);
  assert.ok(fetch.calls.every(({url}) => !url.includes("send_reply")));
});

test("content CLI supports tracking and engagement commands with selected account context", async () => {
  await withTempConfigHome(async ({env}) => {
    await writeConfig({host: "https://app.example.test", token: "saved-token", accountId: "acct_one", accountName: "One"}, {env});
    const post = {prefix_id: "cpwi_owned", status: "checking", url: "https://www.linkedin.com/feed/update/urn:li:activity:7512124639742169088/", comments: [], reactions: []};
    const fetch = createFetch((url, options) => {
      assert.match(url.pathname, /^\/api\/v1\/accounts\/acct_one\/content_ops\/tracked_posts/);
      if (options.method === "POST") assert.deepEqual(JSON.parse(options.body), {url: post.url, user: "me"});
      return jsonResponse(url.pathname.endsWith("tracked_posts.json") && options.method !== "POST" ? {posts: [post], next_page: null} : post);
    });
    for (const args of [["content", "track", post.url, "--user", "me"], ["content", "posts"], ["content", "engagement", post.prefix_id]]) {
      const stdout = captureStream();
      const stderr = captureStream();
      assert.equal(await run([...args, "--json"], {env, fetch, stdout, stderr}), 0, stderr.output);
      assert.ok(JSON.parse(stdout.output));
    }
    assert.equal(fetch.calls.length, 3);
  });
});
