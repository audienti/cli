import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { readConfig, writeConfig } from "../src/config.js";
import { run } from "../src/cli.js";
import { captureStream, createFetch, jsonResponse, withTempConfigHome } from "./helpers.js";

const HOST = "https://app.audienti.com";

function terminalInput(lines = []) {
  const stream = Readable.from([Buffer.from(lines.map((line) => `${line}\n`).join(""))]);
  stream.isTTY = true;
  return stream;
}

function pipedInput() {
  const stream = Readable.from([]);
  stream.isTTY = undefined;
  return stream;
}

function recordingFetch(routes) {
  const requests = [];
  const fetch = createFetch((url, options) => {
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ method, url: url.toString(), body });
    const handler = routes[`${method} ${url.toString()}`];
    if (!handler) throw new Error(`unexpected request ${method} ${url.toString()}`);
    return typeof handler === "function" ? handler({ body, requests }) : handler;
  });
  return { fetch, requests };
}

// Answers the browser login by calling the loopback callback once the CLI prints the auth URL.
function browserCallbackStdout({ token, accountId, accountName }) {
  return {
    output: "",
    called: false,
    write(chunk) {
      this.output += chunk;
      const match = this.output.match(/https:\/\/app\.audienti\.com\/cli\/auth\?[^\s]+/);
      if (!match || this.called) return;

      this.called = true;
      const authUrl = new URL(match[0]);
      const redirectUri = new URL(authUrl.searchParams.get("redirect_uri"));
      redirectUri.searchParams.set("state", authUrl.searchParams.get("state"));
      redirectUri.searchParams.set("token", token);
      redirectUri.searchParams.set("host", HOST);
      redirectUri.searchParams.set("user_name", "New Person");
      if (accountId) redirectUri.searchParams.set("account_id", accountId);
      if (accountName) redirectUri.searchParams.set("account_name", accountName);
      setImmediate(() => globalThis.fetch(redirectUri));
    }
  };
}

async function signedIn(env, extra = {}) {
  await writeConfig({ host: HOST, token: "saved-token", ...extra }, { env });
}

const READY_DRAFT = {
  id: 42,
  status: "ready",
  ready: true,
  normalized_url: "https://acme.com",
  preview: {
    company_name: "Acme",
    product_or_service: "Close automation",
    icp: { name: "Finance leaders", job_titles: ["VP Finance", "Controller"] },
    offer: { title: "Close audit", description: "Find the slow steps in month-end close." },
    premise: "Companies hiring controllers are feeling close pressure."
  }
};

const CONFIRMED = {
  reused: false,
  motion: { id: 7, prefix_id: "motn_first", name: "Acme first motion", kind: "outbound", status: "preparing" },
  reservation: { id: 9, status: "reserved", launch_status: "pending", launch_reason: "sender_missing" }
};

test("start signs a new person in through the browser, picks the only account and user, and stops when setup is declined", async () => {
  await withTempConfigHome(async ({ env }) => {
    const { fetch, requests } = recordingFetch({
      [`GET ${HOST}/api/v1/me.json`]: jsonResponse({ name: "New Person", email: "new@example.test" }),
      [`GET ${HOST}/api/v1/accounts.json`]: jsonResponse([{ prefix_id: "acct_new", name: "New Co" }]),
      [`GET ${HOST}/api/v1/accounts/acct_new/users.json`]: jsonResponse([{ id: 11, name: "New Person", email: "new@example.test", current: true }])
    });
    const stdout = browserCallbackStdout({ token: "browser-token", accountId: "acct_new", accountName: "New Co" });
    const stderr = captureStream();

    const exitCode = await run(["start", "--no-open"], { env, fetch, stdout, stderr, stdin: terminalInput(["n"]) });

    assert.equal(exitCode, 0, stderr.output);
    assert.match(stdout.output, /Welcome to Audienti\./);
    assert.match(stdout.output, /Nothing sends without your approval\./);
    assert.match(stdout.output, /First, sign in or create an account\./);
    assert.match(stdout.output, /New here\? Choose "sign up for an account"/);
    assert.match(stdout.output, /Signed in as New Person\./);
    assert.match(stdout.output, /Using account New Co \(acct_new\)\./);
    assert.match(stdout.output, /Working as New Person \(11\)\./);
    assert.match(stdout.output, /Set up your first motion now\? \[Y\/n\]/);
    assert.match(stdout.output, /When you're ready, run: audienti setup/);
    assert.deepEqual(requests.map((request) => `${request.method} ${request.url}`), [
      `GET ${HOST}/api/v1/me.json`,
      `GET ${HOST}/api/v1/accounts.json`,
      `GET ${HOST}/api/v1/accounts/acct_new/users.json`
    ]);

    const config = await readConfig({ env });
    assert.equal(config.token, "browser-token");
    assert.equal(config.accountId, "acct_new");
    assert.equal(config.accountName, "New Co");
    assert.equal(config.accountUserId, "11");
  });
});

test("start with a saved login skips sign-in and asks which account when there are several", async () => {
  await withTempConfigHome(async ({ env }) => {
    await signedIn(env, { accountId: "acct_two", accountName: "Two" });
    const { fetch, requests } = recordingFetch({
      [`GET ${HOST}/api/v1/me.json`]: jsonResponse({ name: "Saved Person" }),
      [`GET ${HOST}/api/v1/accounts.json`]: jsonResponse([
        { prefix_id: "acct_one", name: "One" },
        { prefix_id: "acct_two", name: "Two" }
      ]),
      [`GET ${HOST}/api/v1/accounts/acct_one/users.json`]: jsonResponse([
        { id: 21, name: "Teammate", email: "mate@example.test", current: false },
        { id: 22, name: "Saved Person", email: "saved@example.test", current: true }
      ])
    });
    const stdout = captureStream();

    const exitCode = await run(["start"], { env, fetch, stdout, stdin: terminalInput(["7", "1", "n"]) });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /You're signed in as Saved Person\./);
    assert.doesNotMatch(stdout.output, /sign in or create an account/);
    assert.match(stdout.output, /Which account should the CLI use\?/);
    assert.match(stdout.output, /2\. Two \(acct_two\) - current/);
    assert.match(stdout.output, /Type a number from 1 to 2\./);
    assert.match(stdout.output, /Using account One \(acct_one\)\./);
    assert.match(stdout.output, /Working as Saved Person \(22\)\./);
    assert.equal(requests.length, 3);

    const config = await readConfig({ env });
    assert.equal(config.accountId, "acct_one");
    assert.equal(config.accountUserId, "22");
    assert.equal(config.accountUserEmail, "saved@example.test");
  });
});

test("start without a terminal never prompts and prints how to sign in", async () => {
  await withTempConfigHome(async ({ env }) => {
    const fetch = createFetch(() => {
      throw new Error("signed-out start must not call the API");
    });
    const stdout = captureStream();

    const exitCode = await run(["start"], { env, fetch, stdout, stdin: pipedInput() });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Sign in or create an account to continue\./);
    assert.match(stdout.output, /Create an account at https:\/\/app\.audienti\.com\/users\/sign_up/);
    assert.match(stdout.output, /`audienti auth login`/);
    assert.match(stdout.output, /Next: run `audienti start` again\./);
    assert.doesNotMatch(stdout.output, /\[Y\/n\]/);
  });
});

test("start --json signed out returns the sign-in steps as JSON", async () => {
  await withTempConfigHome(async ({ env }) => {
    const stdout = captureStream();

    const exitCode = await run(["start", "--json"], { env, stdout, stdin: terminalInput([]) });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), {
      kind: "start",
      status: "sign_in_required",
      signed_in: false,
      host: HOST,
      sign_up_url: `${HOST}/users/sign_up`,
      sign_in_command: "audienti auth login",
      next_command: "audienti start"
    });
  });
});

test("start --json signed in with several accounts and none saved asks the agent to select one", async () => {
  await withTempConfigHome(async ({ env }) => {
    await signedIn(env);
    const { fetch } = recordingFetch({
      [`GET ${HOST}/api/v1/me.json`]: jsonResponse({ name: "Agent Owner" }),
      [`GET ${HOST}/api/v1/accounts.json`]: jsonResponse([
        { prefix_id: "acct_one", name: "One" },
        { prefix_id: "acct_two", name: "Two" }
      ])
    });
    const stdout = captureStream();

    const exitCode = await run(["start", "--json"], { env, fetch, stdout, stdin: pipedInput() });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), {
      kind: "start",
      status: "account_selection_required",
      signed_in: true,
      host: HOST,
      user: "Agent Owner",
      account: null,
      account_user: null,
      next_command: "audienti accounts select <acct_id>"
    });
  });
});

test("start without a terminal picks the only account and prints the flag-driven setup command", async () => {
  await withTempConfigHome(async ({ env }) => {
    await signedIn(env);
    const { fetch } = recordingFetch({
      [`GET ${HOST}/api/v1/me.json`]: jsonResponse({ name: "Solo" }),
      [`GET ${HOST}/api/v1/accounts.json`]: jsonResponse([{ prefix_id: "acct_solo", name: "Solo Co" }]),
      [`GET ${HOST}/api/v1/accounts/acct_solo/users.json`]: jsonResponse([{ id: 5, name: "Solo", current: true }])
    });
    const stdout = captureStream();

    const exitCode = await run(["start"], { env, fetch, stdout, stdin: pipedInput() });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Using account Solo Co \(acct_solo\)\./);
    assert.match(stdout.output, /Next: audienti setup --url https:\/\/acme\.com --sell-to "<who you sell to>" --ask "<what they say yes to>" --yes/);
    assert.equal((await readConfig({ env })).accountUserId, "5");
  });
});

test("bare audienti with no saved login routes to start", async () => {
  await withTempConfigHome(async ({ env }) => {
    const stdout = captureStream();

    const exitCode = await run([], { env, stdout, stdin: pipedInput() });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Welcome to Audienti\./);
    assert.match(stdout.output, /Sign in or create an account to continue\./);
  });
});

test("bare audienti with a saved login and --help still print global help", async () => {
  await withTempConfigHome(async ({ env }) => {
    await signedIn(env);
    for (const args of [[], ["--help"]]) {
      const stdout = captureStream();
      const exitCode = await run(args, { env, stdout, stdin: pipedInput() });
      assert.equal(exitCode, 0);
      assert.match(stdout.output, /Usage:\n {2}audienti <command> \[options\]/);
      assert.match(stdout.output, /audienti start {22}Guided first run/);
    }
  });

  await withTempConfigHome(async ({ env }) => {
    const stdout = captureStream();
    assert.equal(await run(["--help"], { env, stdout }), 0);
    assert.match(stdout.output, /Usage:\n {2}audienti <command> \[options\]/);
  });
});

test("setup asks three questions, reads the draft back, and creates it on yes", async () => {
  await withTempConfigHome(async ({ env }) => {
    await signedIn(env, { accountId: "acct_one", accountName: "One" });
    let polls = 0;
    const { fetch, requests } = recordingFetch({
      [`POST ${HOST}/api/v1/accounts/acct_one/quick_start.json`]: jsonResponse({ id: 42, status: "generating", ready: false }, { status: 202 }),
      [`GET ${HOST}/api/v1/accounts/acct_one/quick_start/42.json`]: () => {
        polls += 1;
        return jsonResponse(polls < 2 ? { id: 42, status: "generating", ready: false } : READY_DRAFT);
      },
      [`POST ${HOST}/api/v1/accounts/acct_one/quick_start/42/confirm.json`]: jsonResponse(CONFIRMED, { status: 201 })
    });
    const stdout = captureStream();

    const exitCode = await run(["setup"], {
      env,
      fetch,
      stdout,
      stdin: terminalInput([
        "https://acme.com",
        "Heads of finance at US software companies.",
        "A 20-minute call about their close",
        "y"
      ]),
      sleep: async () => {}
    });

    assert.equal(exitCode, 0, stdout.output);
    assert.match(stdout.output, /1\/3 {2}What's your company website\?\n {5}Good: https:\/\/acme\.com\n {5}Bad: {2}acme/);
    assert.match(stdout.output, /2\/3 {2}Who do you sell to\? One sentence\./);
    assert.match(stdout.output, /3\/3 {2}What do you want the prospect to say yes to\?/);
    assert.match(stdout.output, /Reading your website and drafting your first motion\./);
    assert.match(stdout.output, /Reading your website\.\.\./);
    assert.match(stdout.output, /Who you'll reach: Finance leaders \(VP Finance, Controller\)/);
    assert.match(stdout.output, /Your offer: Close audit - Find the slow steps in month-end close\./);
    assert.match(stdout.output, /The ask: A 20-minute call about their close/);
    assert.match(stdout.output, /Create this\? \[y\/N\]/);
    assert.match(stdout.output, /Created your first motion: Acme first motion \(motn_first\)\./);
    assert.match(stdout.output, /Connect it here: https:\/\/app\.audienti\.com\/user\/social_cookies/);
    assert.match(stdout.output, /Nothing is sent until LinkedIn is connected, and nothing sends without your approval\./);

    assert.deepEqual(requests.map((request) => `${request.method} ${request.url}`), [
      `POST ${HOST}/api/v1/accounts/acct_one/quick_start.json`,
      `GET ${HOST}/api/v1/accounts/acct_one/quick_start/42.json`,
      `GET ${HOST}/api/v1/accounts/acct_one/quick_start/42.json`,
      `POST ${HOST}/api/v1/accounts/acct_one/quick_start/42/confirm.json`
    ]);
    assert.deepEqual(requests[0].body, {
      quick_start: {
        company_url: "https://acme.com",
        feedback: "We sell to: Heads of finance at US software companies. What we want the prospect to say yes to: A 20-minute call about their close."
      }
    });
    assert.deepEqual(requests[3].body, {});
  });
});

test("setup with a blank website uses the saved one, and answering no creates nothing", async () => {
  await withTempConfigHome(async ({ env }) => {
    await signedIn(env, { accountId: "acct_one" });
    const { fetch, requests } = recordingFetch({
      [`POST ${HOST}/api/v1/accounts/acct_one/quick_start.json`]: jsonResponse(READY_DRAFT)
    });
    const stdout = captureStream();

    const exitCode = await run(["setup"], { env, fetch, stdout, stdin: terminalInput(["", "", "", "n"]) });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /The ask: not set; the writer will suggest one/);
    assert.match(stdout.output, /Nothing was created\./);
    assert.match(stdout.output, /Run `audienti setup` again whenever you're ready\./);
    assert.deepEqual(requests.map((request) => `${request.method} ${request.url}`), [
      `POST ${HOST}/api/v1/accounts/acct_one/quick_start.json`
    ]);
    assert.deepEqual(requests[0].body, { quick_start: {} });
  });
});

test("setup explains a failed draft in plain words", async () => {
  await withTempConfigHome(async ({ env }) => {
    await signedIn(env, { accountId: "acct_one" });
    const { fetch } = recordingFetch({
      [`POST ${HOST}/api/v1/accounts/acct_one/quick_start.json`]: jsonResponse({ id: 42, status: "generating" }, { status: 202 }),
      [`GET ${HOST}/api/v1/accounts/acct_one/quick_start/42.json`]: jsonResponse({ id: 42, status: "failed", error: "Website returned no readable text" })
    });
    const stdout = captureStream();
    const stderr = captureStream();

    const exitCode = await run(["setup", "--url", "https://acme.com"], { env, fetch, stdout, stderr, stdin: pipedInput(), sleep: async () => {} });

    assert.equal(exitCode, 1);
    assert.equal(
      stderr.output,
      "Error: We couldn't draft a motion from that website (Website returned no readable text). Nothing was created. Check the address or add a sentence about who you sell to, then run `audienti setup` again.\n"
    );
  });
});

test("setup explains a rejected company URL in plain words", async () => {
  await withTempConfigHome(async ({ env }) => {
    await signedIn(env, { accountId: "acct_one" });
    const { fetch, requests } = recordingFetch({
      [`POST ${HOST}/api/v1/accounts/acct_one/quick_start.json`]: jsonResponse({ error: "Company URL must be a public HTTP or HTTPS URL." }, { status: 422 })
    });
    const stderr = captureStream();

    const exitCode = await run(["setup", "--url", "localhost"], { env, fetch, stdout: captureStream(), stderr, stdin: pipedInput() });

    assert.equal(exitCode, 1);
    assert.equal(
      stderr.output,
      "Error: That website didn't work: Company URL must be a public HTTP or HTTPS URL. Use a full public address like https://acme.com, then run `audienti setup` again.\n"
    );
    assert.deepEqual(requests[0].body, { quick_start: { company_url: "localhost" } });
  });
});

test("setup runs from flags without a terminal and returns JSON", async () => {
  await withTempConfigHome(async ({ env }) => {
    await signedIn(env, { accountId: "acct_one" });
    const { fetch, requests } = recordingFetch({
      [`POST ${HOST}/api/v1/accounts/acct_one/quick_start.json`]: jsonResponse(READY_DRAFT),
      [`POST ${HOST}/api/v1/accounts/acct_one/quick_start/42/confirm.json`]: jsonResponse(CONFIRMED, { status: 201 })
    });
    const stdout = captureStream();

    const exitCode = await run([
      "setup", "--url", "https://acme.com", "--sell-to", "Controllers", "--ask", "A demo", "--yes", "--json"
    ], { env, fetch, stdout, stdin: pipedInput() });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), {
      kind: "setup",
      status: "created",
      created: true,
      draft: READY_DRAFT,
      motion: CONFIRMED.motion,
      reservation: CONFIRMED.reservation,
      next_step: {
        connect_linkedin_url: `${HOST}/user/social_cookies`,
        check_command: "audienti setup play preflight"
      }
    });
    assert.deepEqual(requests[0].body, {
      quick_start: {
        company_url: "https://acme.com",
        feedback: "We sell to: Controllers. What we want the prospect to say yes to: A demo."
      }
    });
  });
});

test("setup without a terminal and without --yes shows the draft and creates nothing", async () => {
  await withTempConfigHome(async ({ env }) => {
    await signedIn(env, { accountId: "acct_one" });
    const { fetch, requests } = recordingFetch({
      [`POST ${HOST}/api/v1/accounts/acct_one/quick_start.json`]: jsonResponse(READY_DRAFT)
    });
    const stdout = captureStream();

    const exitCode = await run(["setup", "--url", "https://acme.com"], { env, fetch, stdout, stdin: pipedInput() });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Here's the draft:/);
    assert.match(stdout.output, /Nothing was created\.\nRe-run the same command with --yes to create it\./);
    assert.equal(requests.length, 1);
  });
});

test("setup without a terminal and without answers fails with usage instead of waiting", async () => {
  await withTempConfigHome(async ({ env }) => {
    await signedIn(env, { accountId: "acct_one" });
    const fetch = createFetch(() => {
      throw new Error("setup without answers must not call the API");
    });
    const stderr = captureStream();

    const exitCode = await run(["setup"], { env, fetch, stdout: captureStream(), stderr, stdin: pipedInput() });

    assert.equal(exitCode, 1);
    assert.match(stderr.output, /No terminal is attached, so `audienti setup` can't ask questions\./);
    assert.match(stderr.output, /Usage: audienti setup \[--url <company_url>\]/);
  });
});

test("setup when signed out points to audienti start", async () => {
  await withTempConfigHome(async ({ env }) => {
    const stderr = captureStream();

    const exitCode = await run(["setup", "--url", "https://acme.com"], { env, stdout: captureStream(), stderr, stdin: pipedInput() });

    assert.equal(exitCode, 1);
    assert.equal(stderr.output, "Error: You're not signed in yet. Run `audienti start` to sign in or create an account, then run `audienti setup`.\n");
  });
});

test("start continues straight into setup when the person says yes", async () => {
  await withTempConfigHome(async ({ env }) => {
    await signedIn(env, { accountId: "acct_one", accountName: "One" });
    const { fetch, requests } = recordingFetch({
      [`GET ${HOST}/api/v1/me.json`]: jsonResponse({ name: "Ready Person" }),
      [`GET ${HOST}/api/v1/accounts.json`]: jsonResponse([{ prefix_id: "acct_one", name: "One" }]),
      [`GET ${HOST}/api/v1/accounts/acct_one/users.json`]: jsonResponse([{ id: 3, name: "Ready Person", current: true }]),
      [`POST ${HOST}/api/v1/accounts/acct_one/quick_start.json`]: jsonResponse(READY_DRAFT)
    });
    const stdout = captureStream();

    const exitCode = await run(["start"], { env, fetch, stdout, stdin: terminalInput(["", "https://acme.com", "", "", "n"]) });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Let's set up your first motion\. Three quick questions\./);
    assert.match(stdout.output, /Nothing was created\./);
    assert.deepEqual(requests.at(-1).body, { quick_start: { company_url: "https://acme.com" } });
  });
});

test("setup play preflight is still its own command", async () => {
  await withTempConfigHome(async ({ env }) => {
    await signedIn(env, { accountId: "acct_one" });
    const { fetch, requests } = recordingFetch({
      [`GET ${HOST}/api/v1/accounts/acct_one/social_cookies.json?account_user_id=me&platform=linkedin`]: jsonResponse({ ready: false })
    });

    const exitCode = await run(["setup", "play", "preflight", "--json"], { env, fetch, stdout: captureStream(), stdin: pipedInput() });

    assert.equal(exitCode, 0);
    assert.equal(requests.length, 1);
  });
});
