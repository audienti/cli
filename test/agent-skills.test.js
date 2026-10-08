import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { run } from "../src/cli.js";
import { writeConfig } from "../src/config.js";
import { captureStream, createFetch, jsonResponse, withTempConfigHome } from "./helpers.js";

async function localRun(args, env) {
  const stdout = captureStream();
  const stderr = captureStream();
  let requests = 0;
  const code = await run(args, { env, stdout, stderr, fetch: () => { requests++; throw new Error("Unexpected network request"); } });
  assert.equal(requests, 0);
  return { code, stdout: stdout.output, stderr: stderr.output };
}

test("M1: methodology is readable without login or transport", async () => {
  await withTempConfigHome(async ({ env }) => {
    const result = await localRun(["help", "methodology"], env);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /scheduled review date/);
    assert.match(result.stdout, /insufficient evidence/);
    assert.match(result.stdout, /selected proprietary gift may replace the vendor-landscape rung/);
    assert.match(result.stdout, /never on first contact/);
    for (const [stage, rate] of [["Prospect coverage", 78], ["Signal", 10], ["Connect", 30], ["Engage", 20], ["Meeting", 21], ["Show", 75], ["Accepted opportunity", 60]]) {
      assert.ok(result.stdout.includes(`| ${stage} | ${rate}% |`), `Approved ${stage} baseline`);
    }
    for (const rule of [
      /20 qualified connection requests.*per weekday/,
      /Withdraw requests after 21 days/,
      /0 replies after 25 qualified executions/,
      /more than 10% negative/,
      /wait at least 10 executions/,
      /both soldiers.*and generals/,
      /Informant is a role you discover in conversation/,
      /accepted agenda, and the meeting is held/,
      /sales team accepts it as an opportunity/,
      /ask the account owner/,
      /Use the account's own rates if set/,
      /human reviews messages before they go out/
    ]) assert.match(result.stdout, rule);
  });
});

test("G1: gift research supplies the complete bundled skill and URL in text and JSON, without login or transport", async () => {
  await withTempConfigHome(async ({ env }) => {
    const shown = await localRun(["skills", "show", "audienti-gift-research", "--json"], env);
    assert.equal(shown.code, 0);
    const skill = JSON.parse(shown.stdout);
    const result = await localRun(["tools", "gift-research", "--url", "https://example.com/resources", "--json"], env);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    const brief = JSON.parse(result.stdout);
    assert.equal(brief.website, "https://example.com/resources");
    assert.equal(brief.execution, "agent");
    assert.equal(brief.kind, "agent_research_brief");
    assert.equal(brief.instructions, skill.instructions);
    assert.equal(brief.skill, skill.name);
    const plain = await localRun(["tools", "gift-research", "--url", "https://example.com"], env);
    assert.equal(plain.code, 0);
    assert.ok(plain.stdout.includes(skill.instructions));
    assert.match(plain.stdout, /Website: https:\/\/example.com\//);
    assert.match(plain.stdout, /research has not run/);
  });
});

test("G2: invalid gift research inputs fail without network or authentication", async () => {
  await withTempConfigHome(async ({ env }) => {
    const help = await localRun(["tools", "gift-research"], env);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /Usage:/);
    for (const args of [["--json"], ["--url", "not-a-url"], ["--url", "file:///tmp/site"], ["--url", "javascript:alert(1)"], ["--url", "https://user:secret@example.com"], ["--url", "https://example.com", "extra"]]) {
      const result = await localRun(["tools", "gift-research", ...args], env);
      assert.equal(result.code, 1);
      assert.equal(result.stdout, "");
      assert.doesNotMatch(result.stderr, /secret|sign in|auth token/);
    }
  });
});

test("A1: experiment aliases and plays resolve all motion help forms, including parity actions", async () => {
  await withTempConfigHome(async ({ env }) => {
    for (const action of [[], ["create"], ["update"], ["update-premise"]]) {
      const original = await localRun(["help", "motions", ...action], env);
      assert.equal(original.code, 0);
      assert.match(original.stdout, /audienti help methodology/);
      for (const alias of ["experiment", "experiments", "plays"]) {
        for (const args of [["help", alias, ...action], [alias, ...action, "help"], [alias, ...action, "--help"]]) {
          const result = await localRun(args, env);
          assert.equal(result.code, 0);
          assert.equal(result.stdout, original.stdout);
          assert.equal(result.stderr, "");
        }
      }
    }
  });
});

test("M2/A1: create and alias updates preserve API payloads and JSON while reminding before the mutation", async () => {
  await withTempConfigHome(async ({ root, env }) => {
    await writeConfig({ token: "test-token", accountId: "acct_one" }, { env });
    const payload = { name: "Experiment", kind: "outbound", premise: "Test premise", offer_id: "offr_one" };
    const payloadFile = join(root, "motion.json");
    await writeFile(payloadFile, JSON.stringify(payload));
    const cases = [
      { args: ["motions", "create", "--payload", payloadFile], path: "/motions.json", method: "POST", body: { motion: payload } },
      { args: ["experiments", "update", "motn_one", "--approach", ""], path: "/motions/motn_one.json", method: "PATCH", body: { motion: { approach: "" } } },
      { args: ["experiment", "update-premise", "motn_one", "--premise", "New premise"], path: "/motions/motn_one/update_premise.json", method: "PATCH", body: { motion: { premise: "New premise" } } },
      { args: ["plays", "activate", "motn_one"], path: "/motions/motn_one.json", method: "PATCH", body: { motion: { status: "active" } } }
    ];
    for (const item of cases) {
      const stdout = captureStream();
      const stderr = captureStream();
      const response = { prefix_id: "motn_one", name: "Experiment", status: "active" };
      const fetch = createFetch((url, options) => {
        assert.match(stderr.output, /audienti help methodology/);
        assert.equal(url.pathname, `/api/v1/accounts/acct_one${item.path}`);
        assert.equal(options.method, item.method);
        assert.deepEqual(JSON.parse(options.body), item.body);
        return jsonResponse(response);
      });
      assert.equal(await run([...item.args, "--json"], { env, fetch, stdout, stderr }), 0);
      assert.deepEqual(JSON.parse(stdout.output), response);
      assert.equal(fetch.calls.length, 1);
      assert.equal(stderr.output.split("\n").filter(Boolean).length, 1);
    }
  });
});

test("M2/A1: alias reads and unrelated mutations remain quiet; blocked status retains its exit code", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({ token: "test-token", accountId: "acct_one" }, { env });
    for (const args of [
      ["experiments", "list"], ["experiment", "show", "motn_one"],
      ["experiments", "run-discovery", "motn_one"],
      ["experiments", "move-prospects", "motn_one", "--target", "motn_two", "prsp_one"],
      ["experiments", "delete", "motn_one", "--confirm", "yes"],
      ["offers", "update", "offr_one", "--name", "Offer"]
    ]) {
      const stdout = captureStream();
      const stderr = captureStream();
      const response = args[1] === "list" ? [] : { prefix_id: "motn_one", enqueued: true };
      const fetch = createFetch(() => jsonResponse(response));
      assert.equal(await run([...args, "--json"], { env, fetch, stdout, stderr }), 0);
      assert.deepEqual(JSON.parse(stdout.output), response);
      assert.equal(stderr.output, "");
      assert.equal(fetch.calls.length, 1);
    }
    const stdout = captureStream();
    const stderr = captureStream();
    const response = { prefix_id: "motn_one", status_change: { status: "blocked", requested_status: "active", reason: "not ready" } };
    assert.equal(await run(["experiments", "update", "motn_one", "--status", "active", "--json"], { env, stdout, stderr, fetch: createFetch(() => jsonResponse(response)) }), 1);
    assert.deepEqual(JSON.parse(stdout.output), response);
    assert.match(stderr.output, /audienti help methodology/);
  });
});

test("M2: targeting changes remind, reads remain quiet, and setup reminds only when confirming creation", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({ token: "test-token", accountId: "acct_one" }, { env });
    for (const operation of ["list", "add"]) {
      const stdout = captureStream();
      const stderr = captureStream();
      const args = ["experiments", "abm-companies", "motn_one", operation];
      if (operation === "add") args.push("example.com");
      const fetch = createFetch(() => {
        if (operation === "add") assert.match(stderr.output, /audienti help methodology/);
        else assert.equal(stderr.output, "");
        return jsonResponse([]);
      });
      assert.equal(await run([...args, "--json"], { env, fetch, stdout, stderr }), 0);
      assert.deepEqual(JSON.parse(stdout.output), []);
    }
    for (const confirm of [false, true]) {
      const stdout = captureStream();
      const stderr = captureStream();
      const draft = { id: "draft_one", status: "ready" };
      const confirmed = { motion: { prefix_id: "motn_one" } };
      const fetch = createFetch((url) => {
        if (url.pathname.endsWith("/quick_start.json")) {
          assert.equal(stderr.output, "");
          return jsonResponse(draft);
        }
        assert.equal(url.pathname, "/api/v1/accounts/acct_one/quick_start/draft_one/confirm.json");
        assert.match(stderr.output, /audienti help methodology/);
        return jsonResponse(confirmed);
      });
      const args = ["experiments", "quick-start", "--url", "https://example.com", "--json"];
      if (confirm) args.push("--confirm");
      assert.equal(await run(args, { env, fetch, stdout, stderr }), 0);
      assert.deepEqual(JSON.parse(stdout.output), confirm ? confirmed : draft);
      assert.equal(fetch.calls.length, confirm ? 2 : 1);
    }
  });
});

test("S1: skill discovery is local, links upstream sources, and preserves host availability", async () => {
  await withTempConfigHome(async ({ env }) => {
    const list = await localRun(["skills", "list", "--json"], env);
    assert.equal(list.code, 0);
    const catalog = JSON.parse(list.stdout);
    assert.equal(catalog.marketplace.url, "https://github.com/audienti/plugins");
    assert.match(catalog.marketplace.commit, /^[a-f0-9]{40}$/);
    const upstream = JSON.parse(await readFile(new URL("fixtures/audienti-marketplace.json", import.meta.url), "utf8"));
    assert.equal(catalog.marketplace.commit, upstream.commit);
    assert.equal(catalog.marketplace.scope, upstream.selection);
    assert.deepEqual(catalog.skills.filter((skill) => skill.source === "marketplace").map((skill) => skill.name).sort(), Object.keys(upstream.codex_plugins).sort());
    assert.equal(new Set(catalog.skills.map((skill) => skill.name)).size, catalog.skills.length);
    for (const listed of catalog.skills) {
      const result = await localRun(["skills", "show", listed.name, "--json"], env);
      assert.equal(result.code, 0);
      const skill = JSON.parse(result.stdout);
      assert.equal(skill.name, listed.name);
      if (skill.source === "marketplace") {
        assert.match(skill.repository_url, /^https:\/\/github.com\/audienti\//);
        assert.equal(`${skill.repository_url}.git`, upstream.codex_plugins[skill.name]);
        assert.ok(skill.install.codex.includes(`codex plugin add ${skill.name}@audienti`));
        assert.equal(Boolean(skill.install.claude), Object.hasOwn(upstream.claude_plugins, skill.name));
        if (skill.install.claude) {
          assert.equal(`${skill.repository_url}.git`, upstream.claude_plugins[skill.name]);
          assert.ok(skill.install.claude.includes(`claude plugin install ${skill.name}@audienti`));
        }
      } else {
        assert.match(skill.instructions, /^---\nname:/);
      }
    }
    for (const excluded of ["exo", "plan-loop-executor"]) {
      assert.ok(!catalog.skills.some((skill) => skill.name === excluded));
      assert.equal((await localRun(["skills", "show", excluded], env)).code, 1);
    }
    assert.equal((await localRun(["skills", "show", "nonexistent"], env)).code, 1);
  });
});

test("S2: each social finder supplies the local environment check before upstream research in text and JSON", async () => {
  await withTempConfigHome(async ({ env }) => {
    const catalog = JSON.parse((await localRun(["skills", "list", "--json"], env)).stdout);
    const expected = {
      "reddit-pain-finder": "reddit", "linkedin-pain-finder": "linkedin",
      "twitter-signal-finder": "x", "instagram-comment-finder": "instagram",
      "facebook-comment-finder": "facebook", "tiktok-comment-finder": "tiktok"
    };
    assert.deepEqual(catalog.skills.filter((skill) => skill.network).map((skill) => skill.name).sort(), Object.keys(expected).sort());
    for (const [name, network] of Object.entries(expected)) {
      const listed = catalog.skills.find((skill) => skill.name === name);
      assert.equal(listed.network, network);
      assert.match(listed.environment_check, /tools actually available in the local agent environment/);
      const json = await localRun(["skills", "show", name, "--json"], env);
      assert.equal(json.code, 0);
      const shown = JSON.parse(json.stdout);
      assert.ok(shown.instructions.startsWith(listed.environment_check));
      assert.match(shown.instructions, /If no suitable access is available, report the missing capability/);
      assert.match(shown.instructions, /Do not assume Apify/);
      const text = await localRun(["skills", "show", name], env);
      assert.equal(text.code, 0);
      assert.ok(text.stdout.indexOf(listed.environment_check) < text.stdout.indexOf("Read the upstream README"));
      assert.ok(text.stdout.indexOf(listed.environment_check) < text.stdout.indexOf("Source:"));
    }
    assert.match((await localRun(["skills", "list"], env)).stdout, /Before using a social finder, check the local tools/);
    const bundled = await localRun(["skills", "show", "audienti"], env);
    assert.equal(bundled.code, 0);
    assert.match(bundled.stdout, /Before using a social-network finder/);
    assert.match(bundled.stdout, /audienti skills show <finder>/);
    assert.match(bundled.stdout, /The full returned check applies/);
    assert.match(bundled.stdout, /does not authorize granting access, sending\nmessages or posting comments to test access/);
  });
});
