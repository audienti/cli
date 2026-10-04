// #2554: standalone account tools, tool runs and saved network commands are
// thin clients of the tools/runs and network APIs.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { writeConfig } from "../src/config.js";
import { run } from "../src/cli.js";
import { captureStream, createFetch, jsonResponse, withTempConfigHome } from "./helpers.js";

const CONFIG = { host: "https://app.audienti.com", token: "saved-token", accountId: "acct_one" };

function queuedRun(overrides = {}) {
  return { id: "trun_1", tool: "email_find", status: "queued", item_count: 1, summary: {}, ...overrides };
}

function textResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, async text() { return body; } };
}

async function withConfig(fn) {
  await withTempConfigHome(async ({ env, root }) => {
    await writeConfig(CONFIG, { env });
    await fn({ env, root });
  });
}

test("tools email-find submits one item and prints the run id without waiting", async () => {
  await withConfig(async ({ env }) => {
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/tools/runs.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["X-Audienti-Client"], "cli");
      assert.deepEqual(JSON.parse(options.body), {
        tool: "email_find",
        input: { items: [{ first_name: "Ada", last_name: "Lovelace", company_domain: "example.com" }] },
        request_key: "k1"
      });
      return jsonResponse(queuedRun(), { status: 201 });
    });

    const exitCode = await run(["tools", "email-find", "--first-name", "Ada", "--last-name", "Lovelace",
      "--company-domain", "example.com", "--request-key", "k1"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Queued run trun_1 \(email_find, 1 item\(s\)\)/);
    assert.match(stdout.output, /audienti tools runs show trun_1/);
    assert.equal(fetch.calls.length, 1);
  });
});

test("tools email-find --file reads CSV rows and --wait polls until the run finishes", async () => {
  await withConfig(async ({ env, root }) => {
    const filePath = join(root, "people.csv");
    await writeFile(filePath, "client_item_id,first_name,last_name,company_domain\na,Ada,Lovelace,example.com\nb,\"Bob, Jr\",Stone,example.org\n");
    const stdout = captureStream();
    const sleeps = [];
    let polls = 0;
    const fetch = createFetch((url, options) => {
      if (options.method === "POST") {
        const body = JSON.parse(options.body);
        assert.deepEqual(body.input.items.map((item) => item.client_item_id), ["a", "b"]);
        assert.equal(body.input.items[1].first_name, "Bob, Jr");
        return jsonResponse(queuedRun({ item_count: 2 }), { status: 201 });
      }
      if (url.pathname.endsWith("/tools/runs/trun_1.json")) {
        polls += 1;
        return jsonResponse(queuedRun({ status: polls < 2 ? "running" : "completed", summary: { outcomes: { success: 1, no_match: 1 } } }));
      }
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/tools/runs/trun_1/results.json");
      return jsonResponse({ items: [
        { position: 0, client_item_id: "a", outcome: "success", result: { email: "ada@example.com" } },
        { position: 1, client_item_id: "b", outcome: "no_match", result: {} }
      ], next_cursor: null });
    });

    const exitCode = await run(["tools", "email-find", "--file", filePath, "--wait", "--poll-interval-seconds", "1"],
      { env, fetch, stdout, sleep: async (ms) => sleeps.push(ms) });

    assert.equal(exitCode, 0);
    assert.equal(polls, 2);
    assert.deepEqual(sleeps, [1000, 1000]);
    assert.match(stdout.output, /Outcomes: success 1, no_match 1/);
    assert.match(stdout.output, /ada@example\.com/);
    // A no_match item does not change the exit code.
    assert.match(stdout.output, /no_match/);
  });
});

test("a pretty-printed JSON items file is read whole", async () => {
  await withConfig(async ({ env, root }) => {
    const filePath = join(root, "items.json");
    await writeFile(filePath, JSON.stringify({ items: [
      { client_item_id: "a", first_name: "Ada", last_name: "Lovelace", company_domain: "example.com" },
      { "client-item-id": "b", linkedin_url: "https://www.linkedin.com/in/bob" }
    ] }, null, 2));
    const fetch = createFetch((url, options) => {
      assert.deepEqual(JSON.parse(options.body).input.items, [
        { client_item_id: "a", first_name: "Ada", last_name: "Lovelace", company_domain: "example.com" },
        { client_item_id: "b", linkedin_url: "https://www.linkedin.com/in/bob" }
      ]);
      return jsonResponse(queuedRun({ item_count: 2 }), { status: 201 });
    });

    assert.equal(await run(["tools", "email-find", "--file", filePath], { env, fetch, stdout: captureStream() }), 0);
    assert.equal(fetch.calls.length, 1);
  });
});

test("--wait exits nonzero when the run fails and --json prints run and items", async () => {
  await withConfig(async ({ env }) => {
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      if (options.method === "POST") return jsonResponse(queuedRun({ tool: "signals_find", status: "failed", error_code: "account_processing_blocked" }), { status: 201 });
      return jsonResponse({ items: [], next_cursor: null });
    });

    const exitCode = await run(["tools", "signals-find", "--icp", "Logistics", "--question", "Who automated?", "--count", "3", "--wait", "--json"],
      { env, fetch, stdout, sleep: async () => {} });

    assert.equal(exitCode, 1);
    const payload = JSON.parse(stdout.output);
    assert.equal(payload.run.status, "failed");
    assert.deepEqual(JSON.parse(fetch.calls[0].options.body).input, { icp_description: "Logistics", question: "Who automated?", count: 3 });
  });
});

test("tools write sends repeatable facts and the subject choice", async () => {
  await withConfig(async ({ env }) => {
    const fetch = createFetch((url, options) => {
      assert.deepEqual(JSON.parse(options.body), {
        tool: "write",
        input: { purpose: "Book a call", audience: "Finance leads", facts: ["Fact one", "Fact two"], channel: "email", prospect_id: "prsp_1", subject: false }
      });
      return jsonResponse(queuedRun({ tool: "write" }), { status: 201 });
    });

    const exitCode = await run(["tools", "write", "--purpose", "Book a call", "--audience", "Finance leads", "--fact", "Fact one",
      "--fact", "Fact two", "--channel", "email", "--no-subject", "--prospect", "prsp_1", "--json"], { env, fetch, stdout: captureStream() });

    assert.equal(exitCode, 0);
  });
});

test("tools linkedin-enrich and humanize --async submit runs; plain humanize stays synchronous", async () => {
  await withConfig(async ({ env, root }) => {
    const filePath = join(root, "draft.txt");
    await writeFile(filePath, "This draft needs to sound like a person wrote it, not a template.");
    const bodies = [];
    const fetch = createFetch((url, options) => {
      bodies.push([url.pathname, JSON.parse(options.body)]);
      return jsonResponse(queuedRun(), { status: 201 });
    });

    assert.equal(await run(["tools", "linkedin-enrich", "--url", "https://www.linkedin.com/in/ada", "--kind", "person"], { env, fetch, stdout: captureStream() }), 0);
    assert.equal(await run(["tools", "humanize", "--file", filePath, "--async", "--tone", "casual"], { env, fetch, stdout: captureStream() }), 0);

    assert.deepEqual(bodies[0][1], { tool: "linkedin_enrich", input: { items: [{ linkedin_url: "https://www.linkedin.com/in/ada", kind: "person" }] } });
    assert.equal(bodies[1][0], "/api/v1/accounts/acct_one/tools/runs.json");
    assert.equal(bodies[1][1].tool, "humanize");
    assert.equal(bodies[1][1].input.tone, "casual");
  });
});

test("tools runs list, show, results and export call their routes", async () => {
  await withConfig(async ({ env, root }) => {
    const fetch = createFetch((url) => {
      if (url.pathname.endsWith("/tools/runs.json")) {
        assert.equal(url.searchParams.get("tool"), "email_find");
        return jsonResponse({ runs: [queuedRun({ status: "completed", created_at: "2026-10-03T00:00:00Z" })], next_cursor: "42" });
      }
      if (url.pathname.endsWith("/tools/runs/trun_1.json")) return jsonResponse(queuedRun({ status: "completed", details_expired: true }));
      if (url.pathname.endsWith("/results.json")) return jsonResponse({ details_expired: true, items: [] });
      assert.ok(url.pathname.endsWith("/tools/runs/trun_1/export.json"));
      return url.searchParams.get("export_format") === "json" ? jsonResponse({ items: [{ id: "titm_1" }] }) : textResponse("position,outcome\n0,success\n");
    });

    const list = captureStream();
    assert.equal(await run(["tools", "runs", "list", "--tool", "email-find"], { env, fetch, stdout: list }), 0);
    assert.match(list.output, /trun_1\s+email_find\s+completed/);
    assert.match(list.output, /--cursor 42/);

    const show = captureStream();
    await run(["tools", "runs", "show", "trun_1"], { env, fetch, stdout: show });
    assert.match(show.output, /Details expired after 90 days/);

    const results = captureStream();
    await run(["tools", "runs", "results", "trun_1"], { env, fetch, stdout: results });
    assert.match(results.output, /details expired/);

    const csv = captureStream();
    await run(["tools", "runs", "export", "trun_1"], { env, fetch, stdout: csv });
    assert.equal(csv.output, "position,outcome\n0,success\n");

    const outputPath = join(root, "out.json");
    await run(["tools", "runs", "export", "trun_1", "--format", "json", "--output", outputPath], { env, fetch, stdout: captureStream(), stderr: captureStream() });
    assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), { items: [{ id: "titm_1" }] });
  });
});

test("network list shows coverage and rows; export writes CSV", async () => {
  await withConfig(async ({ env }) => {
    const fetch = createFetch((url) => {
      if (url.pathname.endsWith("/network.json")) {
        assert.equal(url.pathname, "/api/v1/accounts/acct_one/social_cookies/scok_1/network.json");
        assert.deepEqual(Object.fromEntries(url.searchParams), { platform: "linkedin", kind: "follow", direction: "incoming", network_query: "ada" });
        return jsonResponse({ coverage: { platform: "linkedin", kind: "follow", direction: "incoming", state: "unsupported_capture" }, rows: [], total_count: 0 });
      }
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/social_cookies/scok_1/network/export.json");
      return textResponse("display_name\nAda\n");
    });

    const list = captureStream();
    assert.equal(await run(["network", "list", "--cookie", "scok_1", "--kind", "follow", "--direction", "incoming", "--query", "ada"], { env, fetch, stdout: list }), 0);
    assert.match(list.output, /capture not supported yet \(not zero\)/);

    const exported = captureStream();
    assert.equal(await run(["network", "export", "--cookie", "scok_1"], { env, fetch, stdout: exported }), 0);
    assert.equal(exported.output, "display_name\nAda\n");
  });
});

test("API errors exit nonzero with the server message", async () => {
  await withConfig(async ({ env }) => {
    const stderr = captureStream();
    const fetch = createFetch(() => jsonResponse({ error: "Too many active tool runs. Wait for one to finish.", code: "too_many_active_runs" }, { status: 429 }));

    const exitCode = await run(["tools", "email-find", "--linkedin-url", "https://www.linkedin.com/in/ada"], { env, fetch, stdout: captureStream(), stderr });

    assert.equal(exitCode, 1);
    assert.match(stderr.output, /Too many active tool runs/);
  });
});

test("usage errors and help never call the API", async () => {
  await withConfig(async ({ env }) => {
    const fetch = createFetch(() => { throw new Error("must not call the API"); });
    const stderr = captureStream();
    assert.equal(await run(["tools", "email-find", "--first-name", "Ada"], { env, fetch, stdout: captureStream(), stderr }), 1);
    assert.match(stderr.output, /Usage: audienti tools email-find/);
    assert.equal(await run(["tools", "write", "--purpose", "x"], { env, fetch, stdout: captureStream(), stderr: captureStream() }), 1);
    assert.equal(await run(["network", "list"], { env, fetch, stdout: captureStream(), stderr: captureStream() }), 1);

    const emailHelp = captureStream();
    await run(["tools", "email-find", "help"], { env, fetch, stdout: emailHelp });
    assert.match(emailHelp.output, /quoted commas are allowed, line breaks inside fields are not/);
    assert.match(emailHelp.output, /do not change the exit code/);

    for (const topic of [["tools", "signals-find"], ["tools", "runs"], ["network"]]) {
      const stdout = captureStream();
      assert.equal(await run([...topic, "help"], { env, fetch, stdout }), 0);
      assert.match(stdout.output, /Usage:/);
    }
    assert.equal(fetch.calls.length, 0);
  });
});
