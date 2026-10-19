import assert from "node:assert/strict";
import test from "node:test";
import { run } from "../src/cli.js";
import { readConfig, writeConfig } from "../src/config.js";
import { captureStream, createFetch, jsonResponse, withTempConfigHome } from "./helpers.js";

const parent = { id: 42, prefix_id: "acct_parent", name: "OMALab" };
const child = { id: 43, prefix_id: "acct_child", name: "Doppel" };
const saved = { host: "https://app.audienti.com", token: "saved-token", accountId: "acct_existing" };

for (const term of ["OMALab", "omalab", "OMAL", "acct_parent", "42"]) {
  test(`accounts create resolves parent ${term} and preserves selected account`, async () => {
    await withTempConfigHome(async ({ env }) => {
      await writeConfig(saved, { env });
      const stdout = captureStream();
      const fetch = createFetch((url, options) => {
        assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts.json");
        assert.equal(options.headers.Authorization, "Bearer saved-token");
        if (options.method === "POST") {
          assert.deepEqual(JSON.parse(options.body), { account: { name: "Doppel", parent_account_id: parent.prefix_id } });
          return jsonResponse(child, { status: 201 });
        }
        return jsonResponse([parent]);
      });
      assert.equal(await run(["accounts", "create", "--name", "Doppel", "--parent", term, "--json"], { env, fetch, stdout }), 0);
      assert.deepEqual(JSON.parse(stdout.output), child);
      assert.equal(fetch.calls.length, 2);
      assert.deepEqual(await readConfig({ env }), saved);
    });
  });
}

for (const accounts of [[parent, { ...parent, id: 99, prefix_id: "acct_other" }], [
  { ...parent, name: "OMALab One" }, { id: 99, prefix_id: "acct_other", name: "OMALab Two" }
]]) {
  test(`ambiguous ${accounts[0].name} fails without creating a child`, async () => {
    await withTempConfigHome(async ({ env }) => {
      await writeConfig(saved, { env });
      const stderr = captureStream();
      const fetch = createFetch(() => jsonResponse(accounts));
      assert.equal(await run(["accounts", "create", "--name", "Doppel", "--parent", "OMALab"], { env, fetch, stderr }), 1);
      assert.match(stderr.output, /matched multiple accounts/);
      assert.match(stderr.output, /acct_parent/);
      assert.match(stderr.output, /acct_other/);
      assert.equal(fetch.calls.length, 1);
      assert.notEqual(fetch.calls[0].options.method, "POST");
    });
  });
}

test("unknown parent fails before POST", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig(saved, { env });
    const stderr = captureStream();
    const fetch = createFetch(() => jsonResponse([parent]));
    assert.equal(await run(["accounts", "create", "--name", "Doppel", "--parent", "Unknown"], { env, fetch, stderr }), 1);
    assert.match(stderr.output, /not accessible/);
    assert.equal(fetch.calls.length, 1);
  });
});

for (const args of [["--name", "Doppel"], ["--parent", "OMALab"], ["--name", " ", "--parent", "OMALab"], ["--name", "Doppel", "--parent", " "], ["extra", "--name", "Doppel", "--parent", "OMALab"]]) {
  test(`invalid create arguments ${JSON.stringify(args)} make no requests`, async () => {
    const stderr = captureStream();
    const fetch = createFetch(() => { throw new Error("Unexpected request"); });
    assert.equal(await run(["accounts", "create", ...args], { fetch, stderr }), 1);
    assert.match(stderr.output, /Usage: audienti accounts create/);
    assert.equal(fetch.calls.length, 0);
  });
}

test("text output returns the child ID and API failures are surfaced", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig(saved, { env });
    const stdout = captureStream();
    const stderr = captureStream();
    let fail = false;
    const fetch = createFetch((_url, options) => options.method === "POST"
      ? fail ? jsonResponse({ error: "A child account with that name already exists under this parent." }, { status: 422 }) : jsonResponse(child, { status: 201 })
      : jsonResponse([parent]));
    const args = ["accounts", "create", "--name", "Doppel", "--parent", "OMALab"];
    assert.equal(await run(args, { env, fetch, stdout, stderr }), 0);
    assert.match(stdout.output, /Created account: Doppel \(acct_child\)/);
    fail = true;
    assert.equal(await run(args, { env, fetch, stdout, stderr }), 1);
    assert.match(stderr.output, /already exists/);
  });
});

test("accounts create help describes parent lookup and selection", async () => {
  const stdout = captureStream();
  assert.equal(await run(["accounts", "create", "--help"], { stdout }), 0);
  assert.match(stdout.output, /--parent <name-or-id>/);
  assert.match(stdout.output, /POST \/api\/v1\/accounts.json/);
  assert.match(stdout.output, /selected account does not change/);
});
