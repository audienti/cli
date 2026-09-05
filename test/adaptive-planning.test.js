import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { writeConfig } from "../src/config.js";
import { run } from "../src/cli.js";
import { captureStream, createFetch, jsonResponse, withTempConfigHome } from "./helpers.js";

async function configured(callback) {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({ host: "https://app.audienti.com", token: "saved-token", accountId: "acct_one" }, { env });
    await callback(env);
  });
}

test("Motion update preserves explicit Approach clearing without a separate planning control", async () => {
  await configured(async (env) => {
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/motions/motn_one.json");
      assert.deepEqual(JSON.parse(options.body), { motion: { approach: "" } });
      return jsonResponse({ approach: "", post_accept_planning_mode: "legacy", post_accept_actions_enabled: false });
    });
    assert.equal(await run(["motions", "update", "motn_one", "--approach", ""], { env, fetch, stdout }), 0);
    assert.match(stdout.output, /Approach: not set/);
    assert.doesNotMatch(stdout.output, /Post-accept planning:/);
    assert.match(stdout.output, /Post-accept actions: disabled/);
  });
});

test("Adaptive preview renders one decision with current question options and eligible families", async () => {
  await configured(async (env) => {
    const stdout = captureStream();
    const fetch = createFetch((url) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/sequence_preview.json");
      return jsonResponse({ report: { persisted: false, cards: [], selected: { preview_mode: "adaptive" }, steps: [{
        kind: "decision", stage: "Your guidance", rationale: "Which premise?",
        next_action: { options: [{ id: "premise", label: "Test premise first" }] },
        eligible_action_families: ["premise_check", "meeting_ask"]
      }] } });
    });
    assert.equal(await run(["prospects", "sequence-preview", "prsp_one"], { env, fetch, stdout }), 0);
    assert.match(stdout.output, /Which premise/);
    assert.match(stdout.output, /premise: Test premise first/);
    assert.match(stdout.output, /Eligible next steps: Premise Check, Meeting Ask/);
  });
});

test("Motion portfolio analytics exposes immutable treatments and scoped unattributed observations", async () => {
  await configured(async (env) => {
    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse({ adaptive_treatments: {
      unattributed: { replies: 2, meetings_accepted: 1 },
      treatments: [{ source_motion_id: 42, approach_digest: "abc123", outbound_count: 3, replies: 1,
        meeting_asks: 2, meetings_accepted: 1, questions: 1, decision_count: 3, mean_answer_latency_seconds: 90 }]
    } }));
    assert.equal(await run(["analytics", "motions"], { env, fetch, stdout }), 0);
    assert.match(stdout.output, /Adaptive treatments \(all time; exact outbound-event outcome links\)/);
    assert.match(stdout.output, /abc123/);
    assert.match(stdout.output, /Adaptive prospects without an adaptive message link: 2 replies, 1 accepted meetings/);
  });
});

test("Motion update sends Approach alone and rejects the removed planning mode flag", async () => {
  await configured(async (env) => {
    const fetch = createFetch((_url, options) => {
      assert.deepEqual(JSON.parse(options.body), { motion: { approach: "Test the premise first" } });
      return jsonResponse({ post_accept_planning_mode: "adaptive" });
    });
    assert.equal(await run(["motions", "update", "motn_one", "--approach", "Test the premise first"], { env, fetch, stdout: captureStream() }), 0);
    let requests = 0;
    assert.equal(await run(["motions", "update", "motn_one", "--post-accept-planning-mode", "adaptive"], { env, fetch: createFetch(() => {
      requests += 1;
      return jsonResponse({});
    }), stderr: captureStream() }), 1);
    assert.equal(requests, 0);
    const stdout = captureStream();
    assert.equal(await run(["motions", "update", "--help"], { env, stdout }), 0);
    assert.doesNotMatch(stdout.output, /post-accept-planning-mode/);
    assert.match(stdout.output, /nonblank Approach/);
  });
});

test("Motion create and update payloads cannot write the derived planning mode", async () => {
  await configured(async (env) => {
    const path = join(env.AUDIENTI_CONFIG_HOME, "motion.json");
    await writeFile(path, JSON.stringify({ approach: "Test premise", post_accept_planning_mode: "legacy" }));
    for (const args of [["motions", "create"], ["motions", "update", "motn_one"]]) {
      const stderr = captureStream();
      const fetch = createFetch(() => jsonResponse({}));
      assert.equal(await run([...args, "--payload", path], { env, fetch, stderr, stdout: captureStream() }), 1);
      assert.equal(fetch.calls.length, 0);
      assert.match(stderr.output, /read-only/);
      assert.match(stderr.output, /clear Approach/);
    }
  });
});

for (const input of [{ flag: "--choice", value: "premise", field: "choice_id" }, { flag: "--answer", value: "Ask about the premise first", field: "answer" }]) {
  test(`Operator answer refetches exact row then submits ${input.field} with current fingerprints`, async () => {
    await configured(async (env) => {
      const row = { id: 42, fingerprint: "row-current", next_action: { type: "answer_planner_question", decision_id: 73, context_fingerprint: "context-current" } };
      const requests = [];
      const fetch = createFetch((url, options) => {
        requests.push(url.pathname);
        if (url.pathname.endsWith("/row.json")) {
          assert.equal(url.searchParams.get("row_id"), String(row.id));
          return jsonResponse({ row, next_move: { id: "other_row" } });
        }
        assert.equal(url.pathname, "/api/v1/accounts/acct_one/operator/answer.json");
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), {
          row_id: row.id, fingerprint: row.fingerprint, decision_id: 73, context_fingerprint: "context-current", [input.field]: input.value
        });
        return jsonResponse({ status: "planning" }, { status: 202 });
      });
      assert.equal(await run(["operator", "answer", String(row.id), input.flag, input.value], { env, fetch, stdout: captureStream() }), 0);
      assert.equal(requests.length, 2);
    });
  });
}

test("Operator answer rejects missing, double or blank input without requests", async () => {
  await configured(async (env) => {
    for (const flags of [[], ["--choice", "one", "--answer", "two"], ["--answer", " "]]) {
      assert.equal(await run(["operator", "answer", "prospect_42", ...flags], { env, fetch: () => assert.fail("invalid input must not call API"), stderr: captureStream() }), 1);
    }
  });
});

test("Operator answer refuses a replaced row", async () => {
  await configured(async (env) => {
    let calls = 0;
    const fetch = createFetch(() => {
      calls += 1;
      return jsonResponse({ row: { id: "prospect_other", fingerprint: "f", next_action: { type: "answer_planner_question", decision_id: 1, context_fingerprint: "d" } } });
    });
    assert.equal(await run(["operator", "answer", "prospect_42", "--choice", "one"], { env, fetch, stderr: captureStream() }), 1);
    assert.equal(calls, 1);
  });
});

test("Operator answer preserves selected principal and returns stale server errors without retrying", async () => {
  await configured(async (env) => {
    let calls = 0;
    const stderr = captureStream();
    const fetch = createFetch((url, options) => {
      calls += 1;
      if (url.pathname.endsWith("/row.json")) {
        assert.equal(url.searchParams.get("principal_account_user_id"), "42");
        return jsonResponse({ row: { id: "prospect_42", fingerprint: "f", next_action: { type: "answer_planner_question", decision_id: 1, context_fingerprint: "d" } } });
      }
      assert.equal(JSON.parse(options.body).principal_account_user_id, "42");
      return jsonResponse({ error: "stale_context_fingerprint" }, { status: 409 });
    });
    assert.equal(await run(["operator", "answer", "prospect_42", "--choice", "one", "--principal", "42"], { env, fetch, stderr }), 1);
    assert.match(stderr.output, /stale_context_fingerprint/);
    assert.equal(calls, 2);
  });
});

test("Operator next and queue render questions and answer help documents dedicated endpoint", async () => {
  await configured(async (env) => {
    const row = { id: "prospect_42", next_action: { type: "answer_planner_question", prompt: "Which premise should guide this message?", options: [{ id: "premise", label: "Test the premise" }] } };
    for (const command of ["next", "queue"]) {
      const stdout = captureStream();
      assert.equal(await run(["operator", command], { env, fetch: createFetch(() => jsonResponse({ next_move: row, decision_queue: [row] })), stdout }), 0);
      assert.match(stdout.output, /Which premise should guide this message/);
      assert.match(stdout.output, /premise: Test the premise/);
    }
    const stdout = captureStream();
    assert.equal(await run(["operator", "answer", "--help"], { env, stdout }), 0);
    assert.match(stdout.output, /operator\/answer.json/);
    assert.match(stdout.output, /409/);
  });
});
