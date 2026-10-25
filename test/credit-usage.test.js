import assert from "node:assert/strict";
import test from "node:test";
import { writeConfig } from "../src/config.js";
import { run } from "../src/cli.js";
import { captureStream, createFetch, jsonResponse, withTempConfigHome } from "./helpers.js";

const CONFIG = { host: "https://app.audienti.com", token: "saved-token", accountId: "acct_one" };

async function withConfig(fn) {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig(CONFIG, { env });
    await fn({ env });
  });
}

test("credits history and show read only projected decimal receipts", async () => {
  await withConfig(async ({ env }) => {
    const fetch = createFetch((url, options) => {
      assert.equal(options.method, "GET");
      if (url.pathname.endsWith("/credit_usages.json")) {
        assert.deepEqual(Object.fromEntries(url.searchParams), { limit: "5", cursor: "20" });
        return jsonResponse({
          balance: "8.7500",
          usages: [{ id: "42", key: "signals_find", label: "Signal search", credits: "1.2500", returned_credits: "0.2500",
            origin_account_id: "acct_child", created_at: "2026-10-22T12:00:00Z", result_available: false,
            result_message: "Workspace access is required to open this result.", supplier_amount_cents: "99.00", currency: "USD",
            private_result: "secret" }],
          next_cursor: "19", supplier_cost_cents: "500.00"
        });
      }
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/credit_usages/42.json");
      return jsonResponse({ id: "42", label: "Signal search", credits: "1.2500", returned_credits: "0.2500",
        result_available: true, result_url: "https://app.audienti.com/tools/runs/trun_1", supplier_cost_cents: "99.00" });
    });

    const stdout = captureStream();
    assert.equal(await run(["credits", "history", "--limit", "5", "--cursor", "20", "--json"], { env, fetch, stdout }), 0);
    assert.deepEqual(JSON.parse(stdout.output), {
      balance: "8.7500",
      usages: [{ id: "42", key: "signals_find", label: "Signal search", credits: "1.2500", returned_credits: "0.2500",
        origin_account_id: "acct_child", created_at: "2026-10-22T12:00:00Z", result_available: false,
        result_message: "Workspace access is required to open this result." }],
      next_cursor: "19"
    });

    const receipt = captureStream();
    assert.equal(await run(["credits", "show", "42"], { env, fetch, stdout: receipt }), 0);
    assert.match(receipt.output, /Credits charged: 1\.2500/);
    assert.match(receipt.output, /Credits returned: 0\.2500/);
    assert.match(receipt.output, /Saved result: https:\/\/app\.audienti\.com\/tools\/runs\/trun_1/);
    assert.doesNotMatch(receipt.output, /supplier|USD|99\.00/);
    assert.equal(fetch.calls.length, 2);
  });
});

test("credit approvals are explicit, use exact financial revisions, and never submit or proceed work", async () => {
  await withConfig(async ({ env }) => {
    const requests = [];
    const fetch = createFetch((url, options) => {
      requests.push({ path: url.pathname, method: options.method, body: options.body ? JSON.parse(options.body) : undefined });
      if (url.pathname.endsWith("/credit_approvals.json")) {
        return jsonResponse({ payer_account_id: "acct_one", prices: [{ id: "7", version: "v3", prices: {"tool.signals_find": "2.5000"}, accepted: false, test_price: false, supplier_amount: "99.00" }],
          payer_approvals: [{ operation_id: "11", origin_account_id: "acct_child", revision: "revision_original", maximum_credits: "2.5000", criteria: "private" }], supplier_cost_cents: "99.00" });
      }
      if (url.pathname.endsWith("/credit_approvals/prices/7.json")) return jsonResponse({ payer_account_id: "acct_one", prices: [{ id: "7", version: "v3", prices: {"tool.signals_find": "2.5000"}, accepted: true }], payer_approvals: [] });
      if (url.pathname.endsWith("/credit_approvals/payers/11.json")) {
        return jsonResponse({ payer_account_id: "acct_one", prices: [], payer_approvals: [{ operation_id: "11", origin_account_id: "acct_child", revision: "revision_original", maximum_credits: "2.5000" }] });
      }
      throw new Error(`Unexpected request ${url.pathname}`);
    });

    const noQuoteError = captureStream();
    assert.equal(await run(["credits", "approve-payer", "11"], { env, fetch, stdout: captureStream(), stderr: noQuoteError }), 1);
    assert.match(noQuoteError.output, /--revision/);
    assert.equal(requests.length, 0);

    const read = captureStream();
    assert.equal(await run(["credits", "approvals", "--json"], { env, fetch, stdout: read }), 0);
    assert.deepEqual(JSON.parse(read.output), { payer_account_id: "acct_one", prices: [{ id: "7", version: "v3", prices: {"tool.signals_find": "2.5000"}, accepted: false, test_price: false }],
      payer_approvals: [{ operation_id: "11", origin_account_id: "acct_child", revision: "revision_original", maximum_credits: "2.5000" }] });
    assert.equal(requests.length, 1);

    const accepted = captureStream();
    assert.equal(await run(["credits", "accept-price", "7", "--json"], { env, fetch, stdout: accepted }), 0);
    assert.equal(JSON.parse(accepted.output).prices[0].accepted, true);

    const payer = captureStream();
    assert.equal(await run(["credits", "approve-payer", "11", "--revision", "revision_original", "--request-key", "approval-command-1", "--json"], { env, fetch, stdout: payer }), 0);
    assert.equal(JSON.parse(payer.output).payer_approvals[0].revision, "revision_original");
    assert.deepEqual(requests, [
      { path: "/api/v1/accounts/acct_one/credit_approvals.json", method: "GET", body: undefined },
      { path: "/api/v1/accounts/acct_one/credit_approvals/prices/7.json", method: "POST", body: {} },
      { path: "/api/v1/accounts/acct_one/credit_approvals/payers/11.json", method: "POST", body: { revision: "revision_original", idempotency_key: "approval-command-1" } }
    ]);
    assert.equal(requests.some((request) => request.path.includes("tools/runs") || request.path.endsWith("/proceed.json")), false);
    assert.doesNotMatch(read.output, /supplier|99\.00|private/);
  });
});

test("credit reads reject generic yes and numeric credit quantities are not exposed", async () => {
  await withConfig(async ({ env }) => {
    const fetch = createFetch(() => jsonResponse({ balance: 3.25, usages: [{ id: "x", credits: 1.25, returned_credits: "0.00" }], supplier_cost: "private" }));
    const stderr = captureStream();
    assert.equal(await run(["credits", "history", "--yes"], { env, fetch, stdout: captureStream(), stderr }), 1);
    assert.match(stderr.output, /unknown option.*yes/i);
    assert.equal(fetch.calls.length, 0);

    const stdout = captureStream();
    assert.equal(await run(["credits", "history", "--json"], { env, fetch, stdout }), 0);
    assert.deepEqual(JSON.parse(stdout.output), { usages: [{ id: "x", returned_credits: "0.00" }] });
    assert.equal(fetch.calls.length, 1);
  });
});

test("Signal quotes count one search and explicit acceptance keeps the original reference", async () => {
  await withConfig(async ({ env }) => {
    const fetch = createFetch((url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.tool, "signals_find");
      assert.deepEqual(body.input, { icp_description: "Logistics", question: "Warehouse expansion", count: 5 });
      if (url.pathname.endsWith("/tools/run_quotes.json")) return jsonResponse({ maximum_credits: "2.5", max_units: 1, available_credits: "10.0", quote_reference: "quote_original" });
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/tools/runs.json");
      assert.equal(body.quote_reference, "quote_original");
      assert.equal(body.accept_quote, true);
      return jsonResponse({ id: "trun_signal", item_count: 1 });
    });
    const args = ["tools", "signals-find", "--icp", "Logistics", "--question", "Warehouse expansion", "--count", "5"];
    const stdout = captureStream();
    assert.equal(await run([...args, "--quote"], { env, fetch, stdout }), 0);
    assert.match(stdout.output, /2\.5 credits for one search/);
    assert.equal(fetch.calls.length, 1);
    assert.equal(await run([...args, "--accept-quote", "quote_original"], { env, fetch, stdout: captureStream() }), 0);
    assert.equal(fetch.calls.length, 2);
  });
});

test("staff refund command requires exact evidence and sends decimal principal unchanged", async () => {
  await withConfig(async ({ env }) => {
    const fetch = createFetch((url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/credit_usages/42/refund.json");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { cumulative_principal: "0.500001", evidence_token: "evidence-uuid", reason: "Confirmed defect", evidence: "Exact result evidence" });
      return jsonResponse({ entry_id: "7", credits_returned: "1.0" });
    });
    assert.equal(await run(["credits", "refund", "42"], { env, fetch, stdout: captureStream(), stderr: captureStream() }), 1);
    assert.equal(fetch.calls.length, 0);
    const stdout = captureStream();
    assert.equal(await run(["credits", "refund", "42", "--cumulative-principal", "0.500001", "--evidence-token", "evidence-uuid", "--reason", "Confirmed defect", "--evidence", "Exact result evidence", "--json"], { env, fetch, stdout }), 0);
    assert.equal(JSON.parse(stdout.output).credits_returned, "1.0");
  });
});
