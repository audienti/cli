import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { readConfig, writeConfig } from "../src/config.js";
import { run } from "../src/cli.js";
import { captureStream, createFetch, jsonResponse, withTempConfigHome } from "./helpers.js";

test("global help lists commands and points agents at command-specific shapes", async () => {
  const stdout = captureStream();
  const stderr = captureStream();

  const exitCode = await run(["--help"], { stdout, stderr });

  assert.equal(exitCode, 0);
  assert.match(stdout.output, /Usage:/);
  assert.match(stdout.output, /audienti auth token <token>/);
  assert.match(stdout.output, /audienti help agent-workflows/);
  assert.match(stdout.output, /audienti operator next/);
  assert.match(stdout.output, /Run `audienti <command> help`/);
  assert.equal(stderr.output, "");
});

test("bare command prints global help without an error prefix", async () => {
  const stdout = captureStream();
  const stderr = captureStream();

  const exitCode = await run([], { stdout, stderr });

  assert.equal(exitCode, 0);
  assert.match(stdout.output, /Usage:/);
  assert.match(stdout.output, /audienti <command> \[options\]/);
  assert.equal(stderr.output, "");
});

test("command help documents accepted options without calling the api", async () => {
  const stdout = captureStream();
  const fetch = createFetch(() => {
    throw new Error("help must not call the API");
  });

  const exitCode = await run(["auth", "token", "help"], { stdout, fetch });

  assert.equal(exitCode, 0);
  assert.match(stdout.output, /Usage:\n  audienti auth token <token>/);
  assert.match(stdout.output, /--host <url>/);
  assert.match(stdout.output, /Input shape:/);
});

test("help topics describe submit payload shapes for implemented mutations", async () => {
  const stdout = captureStream();

  const exitCode = await run(["motions", "create", "help"], { stdout });

  assert.equal(exitCode, 0);
  assert.match(stdout.output, /Status: implemented/);
  assert.match(stdout.output, /Input shape:/);
  assert.match(stdout.output, /name: string/);
  assert.match(stdout.output, /premise: string/);
  assert.match(stdout.output, /offer_id: offr_/);
  assert.match(stdout.output, /principal_account_user_id: integer/);
});

test("agent workflow help gives local agents common production paths", async () => {
  const stdout = captureStream();

  const exitCode = await run(["help", "agent-workflows"], { stdout });

  assert.equal(exitCode, 0);
  assert.match(stdout.output, /Authenticate and select an account/);
  assert.match(stdout.output, /audienti users list/);
  assert.match(stdout.output, /audienti offers list/);
  assert.match(stdout.output, /audienti icps list/);
  assert.match(stdout.output, /audienti motions create --payload <file\.json>/);
  assert.match(stdout.output, /audienti prospects import https:\/\/www\.linkedin\.com\/in\/example/);
  assert.match(stdout.output, /audienti motions add-prospects <motn_id> <prsp_id>/);
  assert.match(stdout.output, /Current gaps to plan around:/);
  assert.doesNotMatch(stdout.output, /Motion creation still lacks a live CLI mutation/);
});

test("resource help lists child commands", async () => {
  const stdout = captureStream();

  const exitCode = await run(["prospects", "--help"], { stdout });

  assert.equal(exitCode, 0);
  assert.match(stdout.output, /audienti prospects list/);
  assert.match(stdout.output, /audienti prospects show <prsp_id>/);
  assert.match(stdout.output, /audienti prospects message-types <prsp_id>/);
  assert.match(stdout.output, /audienti prospects write <prsp_id> --type <surface_key>/);
  assert.match(stdout.output, /audienti prospects sequence-preview <prsp_id>/);
  assert.match(stdout.output, /audienti prospects import <linkedin_url>/);
  assert.match(stdout.output, /Filters:/);
});

test("help works as the final word at resource and nested command levels", async () => {
  const cases = [
    {
      args: ["config", "help"],
      expected: [/audienti config list \[--json\]/, /local CLI config path/]
    },
    {
      args: ["users", "help"],
      expected: [/Usage:\n  audienti users list \[--json\]/, /motion principals or assignees/]
    },
    {
      args: ["users", "list", "help"],
      expected: [/Usage:\n  audienti users list \[--json\]/, /GET \/api\/v1\/accounts\/:account_id\/users\.json/]
    },
    {
      args: ["offers", "help"],
      expected: [/Usage:\n  audienti offers list \[--json\]/, /choose offer_id for motion creation/]
    },
    {
      args: ["offers", "list", "help"],
      expected: [/Usage:\n  audienti offers list \[--json\]/, /GET \/api\/v1\/accounts\/:account_id\/offers\.json/]
    },
    {
      args: ["offers", "create", "help"],
      expected: [/Usage:\n  audienti offers create --name <text>/, /POST \/api\/v1\/accounts\/:account_id\/offers\.json/]
    },
    {
      args: ["icps", "help"],
      expected: [/Usage:\n  audienti icps list \[--json\]/, /choose icp_id for motion creation/]
    },
    {
      args: ["icps", "list", "help"],
      expected: [/Usage:\n  audienti icps list \[--json\]/, /GET \/api\/v1\/accounts\/:account_id\/icps\.json/]
    },
    {
      args: ["icps", "create", "help"],
      expected: [/Usage:\n  audienti icps create \(\--name <text> \[\--notes <text>\] \[\--discovery-keyword <text>\] \| \-\-payload <file\.json>\)/, /POST \/api\/v1\/accounts\/:account_id\/icps\.json/]
    },
    {
      args: ["companies", "help"],
      expected: [/Usage:\n  audienti companies search --query <text>/, /Returns persisted LinkedIn company profiles/]
    },
    {
      args: ["companies", "search", "help"],
      expected: [/Usage:\n  audienti companies search --query <text>/, /GET \/api\/v1\/accounts\/:account_id\/companies\.json/]
    },
    {
      args: ["lists", "create", "help"],
      expected: [/Usage:\n  audienti lists create --name <text>/, /POST \/api\/v1\/accounts\/:account_id\/lists\.json/]
    },
    {
      args: ["lists", "update", "help"],
      expected: [/Usage:\n  audienti lists update <list_id>/, /PATCH \/api\/v1\/accounts\/:account_id\/lists\/:id\.json/]
    },
    {
      args: ["lists", "delete", "help"],
      expected: [/Usage:\n  audienti lists delete <list_id> --confirm <yes\|true\|Y\|y>/, /DELETE \/api\/v1\/accounts\/:account_id\/lists\/:id\.json/]
    },
    {
      args: ["help", "agent-workflows"],
      expected: [/audienti lists create --name "Target list"/, /audienti operator outcome <row_id> --payload <file\.json>/]
    },
    {
      args: ["config", "list", "help"],
      expected: [/Usage:\n  audienti config list \[--json\]/, /Token: masked string or none/]
    },
    {
      args: ["prospects", "help"],
      expected: [/audienti prospects list/, /Filters:/]
    },
    {
      args: ["lists", "prospects", "help"],
      expected: [/Usage:\n  audienti lists prospects <list_id>/, /same row shape as `audienti prospects list`/]
    },
    {
      args: ["motions", "help"],
      expected: [/audienti motions prospects <motn_id>/, /motn_ prefix id/]
    },
    {
      args: ["plays", "help"],
      expected: [/audienti motions prospects <motn_id>/, /motn_ prefix id/]
    },
    {
      args: ["operator", "help"],
      expected: [/audienti operator next/, /--opportunity-kind prospect\|visibility/]
    },
    {
      args: ["operator", "next", "help"],
      expected: [/Usage:\n  audienti operator next/, /next_move\.next_action/]
    },
    {
      args: ["prospects", "import", "help"],
      expected: [/Usage:\n  audienti prospects import <linkedin_url>/, /linkedin_url: url/]
    },
    {
      args: ["prospects", "import-status", "help"],
      expected: [/Usage:\n  audienti prospects import-status <primp_id>/, /GET \/api\/v1\/accounts\/:account_id\/prospect_imports\/:id\.json/]
    },
    {
      args: ["prospects", "message-types", "help"],
      expected: [/Usage:\n  audienti prospects message-types <prsp_id>/, /message_surfaces\[\]\.key/]
    },
    {
      args: ["prospects", "write", "help"],
      expected: [/Usage:\n  audienti prospects write <prsp_id> --type <surface_key>/, /POST \/api\/v1\/accounts\/:account_id\/prospects\/:id\/write_message\.json/]
    },
    {
      args: ["prospects", "sequence-preview", "help"],
      expected: [/Usage:\n  audienti prospects sequence-preview <prsp_id>/, /report\.steps\[\]/]
    },
    {
      args: ["lists", "add-prospects", "help"],
      expected: [/Usage:\n  audienti lists add-prospects <list_id> <prsp_id>/, /POST \/api\/v1\/accounts\/:account_id\/lists\/:list_id\/prospects\.json/]
    },
    {
      args: ["motions", "prospects", "help"],
      expected: [/Usage:\n  audienti motions prospects <motn_id>/, /GET \/api\/v1\/accounts\/:account_id\/motions\/:motion_id\/prospects\.json/]
    },
    {
      args: ["motions", "add-prospects", "help"],
      expected: [/Usage:\n  audienti motions add-prospects <motn_id> <prsp_id>/, /POST \/api\/v1\/accounts\/:account_id\/motions\/:motion_id\/prospects\.json/]
    },
    {
      args: ["plays", "create", "help"],
      expected: [/Usage:\n  audienti motions create --payload <file\.json>/, /Status: implemented/]
    }
  ];

  for (const { args, expected } of cases) {
    const stdout = captureStream();
    const stderr = captureStream();
    const exitCode = await run(args, { stdout, stderr });

    assert.equal(exitCode, 0);
    assert.equal(stderr.output, "");
    for (const pattern of expected) assert.match(stdout.output, pattern);
  }
});

test("config list shows saved local config without calling the api", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => {
      throw new Error("config list must not call the API");
    });

    const exitCode = await run(["config", "list"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Path: /);
    assert.match(stdout.output, /Exists: yes/);
    assert.match(stdout.output, /Host: https:\/\/app\.audienti\.com/);
    assert.match(stdout.output, /Token: save\.\.\.oken/);
    assert.match(stdout.output, /Active account: One \(acct_one\)/);
  });
});

test("config list supports json output and empty config state", async () => {
  await withTempConfigHome(async ({ env }) => {
    const stdout = captureStream();

    const exitCode = await run(["config", "list", "--json"], { env, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), {
      path: join(env.AUDIENTI_CONFIG_HOME, "config.json"),
      exists: false,
      host: null,
      token: null,
      accountId: null,
      accountName: null
    });
  });
});

test("auth token validates token before saving config", async () => {
  await withTempConfigHome(async ({ env }) => {
    const stdout = captureStream();
    const stderr = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "http://localhost:3000/api/v1/me.json");
      assert.equal(options.headers.Accept, "application/json");
      assert.equal(options.headers.Authorization, "Bearer valid-token");
      return jsonResponse({ id: 1, name: "User One" });
    });

    const exitCode = await run([
      "auth",
      "token",
      "valid-token",
      "--host",
      "http://localhost:3000"
    ], { env, fetch, stdout, stderr });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Authenticated to http:\/\/localhost:3000 as User One\./);
    assert.equal(stderr.output, "");
    assert.deepEqual(await readConfig({ env }), {
      host: "http://localhost:3000",
      token: "valid-token"
    });
    assert.equal(fetch.calls.length, 1);
  });
});

test("auth token refuses invalid tokens without saving config", async () => {
  await withTempConfigHome(async ({ env }) => {
    const stdout = captureStream();
    const stderr = captureStream();
    const fetch = createFetch(() => jsonResponse({ error: "invalid" }, { status: 401 }));

    const exitCode = await run(["auth", "token", "bad-token"], { env, fetch, stdout, stderr });

    assert.equal(exitCode, 1);
    assert.match(stderr.output, /Authentication failed/);
    assert.deepEqual(await readConfig({ env }), {});
  });
});

test("accounts list sends bearer auth and supports json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts.json");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse([
        { id: 1, prefix_id: "acct_one", name: "One" },
        { id: 2, prefix_id: "acct_two", name: "Two" }
      ]);
    });

    const exitCode = await run(["accounts", "list", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), [
      { id: 1, prefix_id: "acct_one", name: "One" },
      { id: 2, prefix_id: "acct_two", name: "Two" }
    ]);
  });
});

test("accounts select persists only a visible prefixed account id", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse([
      { id: 1, prefix_id: "acct_one", name: "One" },
      { id: 2, prefix_id: "acct_two", name: "Two" }
    ]));

    const exitCode = await run(["accounts", "select", "acct_two"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Selected account Two \(acct_two\)\./);
    assert.deepEqual(await readConfig({ env }), {
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_two",
      accountName: "Two"
    });
  });
});

test("accounts select accepts a unique name fragment", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse([
      { id: 1, prefix_id: "acct_knit", name: "Knit" },
      { id: 2, prefix_id: "acct_other", name: "Other Account" }
    ]));

    const exitCode = await run(["accounts", "select", "knit"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Selected account Knit \(acct_knit\)\./);
    assert.deepEqual(await readConfig({ env }), {
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_knit",
      accountName: "Knit"
    });
  });
});

test("accounts select rejects accounts not returned by the api", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stderr = captureStream();
    const fetch = createFetch(() => jsonResponse([
      { id: 1, prefix_id: "acct_one", name: "One" }
    ]));

    const exitCode = await run(["accounts", "select", "acct_missing"], { env, fetch, stderr });

    assert.equal(exitCode, 1);
    assert.match(stderr.output, /acct_missing does not exist/);
    assert.deepEqual(await readConfig({ env }), {
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    });
  });
});

test("accounts select rejects ambiguous name fragments", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token"
    }, { env });

    const stderr = captureStream();
    const fetch = createFetch(() => jsonResponse([
      { id: 1, prefix_id: "acct_knit_team", name: "Knit Team" },
      { id: 2, prefix_id: "acct_knit_ops", name: "Knit Ops" }
    ]));

    const exitCode = await run(["accounts", "select", "knit"], { env, fetch, stderr });

    assert.equal(exitCode, 1);
    assert.match(stderr.output, /matched multiple accounts/);
    assert.match(stderr.output, /Knit Team \(acct_knit_team\)/);
    assert.match(stderr.output, /Knit Ops \(acct_knit_ops\)/);
    assert.deepEqual(await readConfig({ env }), {
      host: "https://app.audienti.com",
      token: "saved-token"
    });
  });
});

test("users list sends bearer auth and supports json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/users.json");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse([
        { id: 42, user_id: 7, name: "User One", email: "one@example.com", roles: ["admin"], current: true },
        { id: 43, user_id: 8, name: "User Two", email: "two@example.com", roles: ["member"], current: false }
      ]);
    });

    const exitCode = await run(["users", "list", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), [
      { id: 42, user_id: 7, name: "User One", email: "one@example.com", roles: ["admin"], current: true },
      { id: 43, user_id: 8, name: "User Two", email: "two@example.com", roles: ["member"], current: false }
    ]);
  });
});

test("users list renders a readable principal table", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse([
      { id: 42, user_id: 7, name: "User One", email: "one@example.com", roles: ["admin"], current: true },
      { id: 43, user_id: 8, name: "User Two", email: "two@example.com", roles: ["member"], current: false }
    ]));

    const exitCode = await run(["principals", "list"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /ACCOUNT USER ID\tCURRENT\tROLES\tNAME\tEMAIL/);
    assert.match(stdout.output, /42\tyes\tadmin\tUser One\tone@example\.com/);
    assert.match(stdout.output, /43\tno\tmember\tUser Two\ttwo@example\.com/);
  });
});

test("offers and icps list render readable selection tables", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url) => {
      if (url.pathname === "/api/v1/accounts/acct_one/offers.json") {
        return jsonResponse([
          { id: 11, prefix_id: "offr_one", name: "Offer One", url: "https://example.com/offer-one" }
        ]);
      }

      if (url.pathname === "/api/v1/accounts/acct_one/icps.json") {
        return jsonResponse([
          { id: 21, prefix_id: "icpp_one", name: "ICP One", discovery_keyword: "migration", agent: { id: 31, name: "Finder One" } }
        ]);
      }

      throw new Error(`unexpected path ${url.pathname}`);
    });

    let exitCode = await run(["offers", "list"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /OFFER ID\tNAME\tURL/);
    assert.match(stdout.output, /offr_one\tOffer One\thttps:\/\/example\.com\/offer-one/);

    stdout.output = "";
    exitCode = await run(["icps", "list"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /ICP ID\tNAME\tDISCOVERY KEYWORD\tAGENT/);
    assert.match(stdout.output, /icpp_one\tICP One\tmigration\tFinder One/);
  });
});

test("offers create and icps create post the expected payloads and support json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      if (url.pathname === "/api/v1/accounts/acct_one/offers.json") {
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), {
          offer: {
            name: "Offer One",
            description: "Offer description.",
            url: "https://example.com/offer-one"
          }
        });
        return jsonResponse({
          id: 11,
          prefix_id: "offr_one",
          name: "Offer One",
          description: "Offer description.",
          url: "https://example.com/offer-one"
        }, { status: 201 });
      }

      if (url.pathname === "/api/v1/accounts/acct_one/icps.json") {
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), {
          icp: {
            name: "ICP One",
            notes: "ICP notes.",
            discovery_keyword: "renewal"
          }
        });
        return jsonResponse({
          id: 21,
          prefix_id: "icpp_one",
          name: "ICP One",
          notes: "ICP notes.",
          discovery_keyword: "renewal",
          agent: null
        }, { status: 201 });
      }

      throw new Error(`unexpected path ${url.pathname}`);
    });

    let exitCode = await run([
      "offers",
      "create",
      "--name",
      "Offer One",
      "--description",
      "Offer description.",
      "--url",
      "https://example.com/offer-one",
      "--json"
    ], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(stdout.output).prefix_id, "offr_one");

    stdout.output = "";
    exitCode = await run([
      "icps",
      "create",
      "--name",
      "ICP One",
      "--notes",
      "ICP notes.",
      "--discovery-keyword",
      "renewal",
      "--json"
    ], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(stdout.output).prefix_id, "icpp_one");
  });
});

test("icps create accepts a payload file for rich ICP creation", async () => {
  await withTempConfigHome(async ({ env, root }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const payloadPath = join(root, "icp.json");
    await writeFile(payloadPath, JSON.stringify({
      name: "Vendor Management Office",
      notes: "Operators handling vendor governance and escalations.",
      discovery_keyword: "vendor governance",
      text_criteria: "Owns vendor governance, renewals, and escalations.",
      negative_title_exceptions: ["sales", "recruiting"],
      company_keywords: {
        include: ["vendor governance", "supplier performance"],
        exclude: ["staffing"]
      },
      job_titles_attributes: [
        { name: "Vendor Management Office" },
        { name: "Strategic Vendor Management" }
      ]
    }, null, 2));

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      if (url.pathname === "/api/v1/accounts/acct_one/icps.json") {
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), {
          icp: {
            name: "Vendor Management Office",
            notes: "Operators handling vendor governance and escalations.",
            discovery_keyword: "vendor governance",
            text_criteria: "Owns vendor governance, renewals, and escalations.",
            negative_title_exceptions: ["sales", "recruiting"],
            company_keywords: {
              include: ["vendor governance", "supplier performance"],
              exclude: ["staffing"]
            },
            job_titles_attributes: [
              { name: "Vendor Management Office" },
              { name: "Strategic Vendor Management" }
            ]
          }
        });
        return jsonResponse({
          id: 21,
          prefix_id: "icpp_one",
          name: "Vendor Management Office",
          notes: "Operators handling vendor governance and escalations.",
          discovery_keyword: "vendor governance",
          agent: null
        }, { status: 201 });
      }

      throw new Error(`unexpected path ${url.pathname}`);
    });

    const exitCode = await run([
      "icps",
      "create",
      "--payload",
      payloadPath,
      "--json"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(stdout.output).prefix_id, "icpp_one");
  });
});

test("offers create and icps create render readable confirmations", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url) => {
      if (url.pathname === "/api/v1/accounts/acct_one/offers.json") {
        return jsonResponse({
          prefix_id: "offr_one",
          name: "Offer One",
          description: "Offer description.",
          url: "https://example.com/offer-one"
        }, { status: 201 });
      }

      if (url.pathname === "/api/v1/accounts/acct_one/icps.json") {
        return jsonResponse({
          prefix_id: "icpp_one",
          name: "ICP One",
          notes: "ICP notes.",
          discovery_keyword: "renewal",
          agent: null
        }, { status: 201 });
      }

      throw new Error(`unexpected path ${url.pathname}`);
    });

    let exitCode = await run([
      "offers",
      "create",
      "--name",
      "Offer One",
      "--description",
      "Offer description."
    ], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Created offer Offer One \(offr_one\)\./);
    assert.match(stdout.output, /Description: Offer description\./);

    stdout.output = "";
    exitCode = await run([
      "icps",
      "create",
      "--name",
      "ICP One",
      "--notes",
      "ICP notes.",
      "--discovery-keyword",
      "renewal"
    ], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Created ICP ICP One \(icpp_one\)\./);
    assert.match(stdout.output, /Notes: ICP notes\./);
    assert.match(stdout.output, /Discovery keyword: renewal/);
  });
});

test("--account overrides saved account without mutating config", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse([
      { id: 1, prefix_id: "acct_one", name: "One" },
      { id: 2, prefix_id: "acct_two", name: "Two" }
    ]));

    const exitCode = await run(["--account", "acct_two", "accounts", "list"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /\* acct_two\tTwo/);
    assert.deepEqual(await readConfig({ env }), {
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    });
  });
});

test("account read commands call the expected api endpoints with json output", async () => {
  const cases = [
    {
      args: ["offers", "list", "--json"],
      path: "/api/v1/accounts/acct_one/offers.json",
      body: [{ prefix_id: "offr_one", name: "Offer One", description: "Offer description." }]
    },
    {
      args: ["icps", "list", "--json"],
      path: "/api/v1/accounts/acct_one/icps.json",
      body: [{ prefix_id: "icpp_one", name: "ICP One", discovery_keyword: "migration" }]
    },
    {
      args: ["lists", "list", "--json"],
      path: "/api/v1/accounts/acct_one/lists.json",
      body: [{ prefix_id: "list_one", name: "Owned list", prospect_count: 3 }]
    },
    {
      args: ["lists", "show", "list_one", "--json"],
      path: "/api/v1/accounts/acct_one/lists/list_one.json",
      body: { prefix_id: "list_one", name: "Owned list", prospect_count: 3 }
    },
    {
      args: ["motions", "list", "--json"],
      path: "/api/v1/accounts/acct_one/motions.json",
      body: [{ prefix_id: "motn_one", name: "Motion One", kind: "outbound", status: "active" }]
    },
    {
      args: ["plays", "list", "--json"],
      path: "/api/v1/accounts/acct_one/motions.json",
      body: [{ prefix_id: "motn_one", name: "Motion One", kind: "outbound", status: "active" }]
    },
    {
      args: ["motions", "show", "motn_one", "--json"],
      path: "/api/v1/accounts/acct_one/motions/motn_one.json",
      body: { prefix_id: "motn_one", name: "Motion One", kind: "outbound", status: "active" }
    },
    {
      args: ["motions", "status", "motn_one", "--json"],
      path: "/api/v1/accounts/acct_one/motions/motn_one/status.json",
      body: { prefix_id: "motn_one", name: "Motion One", state: "healthy_idle", reason_label: "Healthy" }
    },
    {
      args: ["motions", "prospects", "motn_one", "--json"],
      path: "/api/v1/accounts/acct_one/motions/motn_one/prospects.json",
      body: {
        prospects: [{ prefix_id: "prsp_one", display_name: "Pat Prospect" }],
        meta: { total_count: 1, limit: 20, offset: 0, page: 1, returned_count: 1, has_more: false }
      }
    },
    {
      args: ["prospects", "show", "prsp_one", "--json"],
      path: "/api/v1/accounts/acct_one/prospects/prsp_one.json",
      body: { prefix_id: "prsp_one", display_name: "Pat Prospect", company: "ExampleCo" }
    },
    {
      args: ["prospects", "import-status", "primp_one", "--json"],
      path: "/api/v1/accounts/acct_one/prospect_imports/primp_one.json",
      body: {
        prefix_id: "primp_one",
        status: "completed",
        ready: true,
        prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" }
      }
    },
    {
      args: ["operator", "queue", "--json"],
      path: "/api/v1/accounts/acct_one/operator.json",
      body: { next_move: null, decision_queue: [], filters: {}, metrics: {} }
    }
  ];

  for (const { args, path, body } of cases) {
    await withTempConfigHome(async ({ env }) => {
      await writeConfig({
        host: "https://app.audienti.com",
        token: "saved-token",
        accountId: "acct_one",
        accountName: "One"
      }, { env });

      const stdout = captureStream();
      const fetch = createFetch((url, options) => {
        assert.equal(url.toString(), `https://app.audienti.com${path}`);
        assert.equal(options.headers.Authorization, "Bearer saved-token");
        return jsonResponse(body);
      });

      const exitCode = await run(args, { env, fetch, stdout });

      assert.equal(exitCode, 0);
      assert.deepEqual(JSON.parse(stdout.output), body);
      assert.equal(fetch.calls.length, 1);
    });
  }
});

test("lists create posts the expected payload and supports json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      id: 12,
      prefix_id: "list_one",
      name: "CIO renewal targets",
      description: "Accounts to review before QBR outreach.",
      campaign_brief: {
        hook: "Vendor accountability before renewal",
        audience_note: "IT leaders running QBRs and renewals"
      }
    };
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/lists.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), {
        list: {
          name: "CIO renewal targets",
          description: "Accounts to review before QBR outreach.",
          campaign_brief: {
            hook: "Vendor accountability before renewal",
            audience_note: "IT leaders running QBRs and renewals"
          }
        }
      });
      return jsonResponse(responseBody, { status: 201 });
    });

    const exitCode = await run([
      "lists",
      "create",
      "--name",
      "CIO renewal targets",
      "--description",
      "Accounts to review before QBR outreach.",
      "--campaign-hook",
      "Vendor accountability before renewal",
      "--audience-note",
      "IT leaders running QBRs and renewals",
      "--json"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("lists create renders a readable confirmation", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse({
      prefix_id: "list_one",
      name: "CIO renewal targets",
      description: "Accounts to review before QBR outreach."
    }, { status: 201 }));

    const exitCode = await run([
      "lists",
      "create",
      "--name",
      "CIO renewal targets",
      "--description",
      "Accounts to review before QBR outreach."
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Created list CIO renewal targets \(list_one\)\./);
    assert.match(stdout.output, /Description: Accounts to review before QBR outreach\./);
  });
});

test("motions create posts the expected payload, supports plays alias, and honors account override", async () => {
  await withTempConfigHome(async ({ root, env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });
    const payloadPath = join(root, "motion-create.json");
    await writeFile(payloadPath, JSON.stringify({
      name: "Enterprise migration leaders",
      premise: "Find operators discussing stalled CRM migrations.",
      kind: "outbound",
      status: "draft",
      offer_id: "offr_abc123",
      principal_account_user_id: 42,
      list_id: "list_abc123"
    }));

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_two/motions.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), {
        motion: {
          name: "Enterprise migration leaders",
          premise: "Find operators discussing stalled CRM migrations.",
          kind: "outbound",
          status: "draft",
          offer_id: "offr_abc123",
          principal_account_user_id: 42,
          list_id: "list_abc123"
        }
      });
      return jsonResponse({
        id: 11,
        prefix_id: "motn_abc123",
        name: "Enterprise migration leaders",
        kind: "outbound",
        status: "draft",
        offer: { id: 21, prefix_id: "offr_abc123", name: "Offer One" },
        icp: { id: 31, prefix_id: "icpp_abc123", name: "ICP One" },
        list: { id: 41, prefix_id: "list_abc123", name: "List One" },
        principal_account_user: { id: 42, user_id: 7, name: "User One", email: "one@example.com" }
      }, { status: 201 });
    });

    const exitCode = await run(["--account", "acct_two", "plays", "create", "--json", "--payload", payloadPath], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(stdout.output).prefix_id, "motn_abc123");
    assert.deepEqual(await readConfig({ env }), {
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    });
  });
});

test("lists update patches the expected payload and supports json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      id: 12,
      prefix_id: "list_one",
      name: "Updated target list",
      description: "Re-ranked operator list.",
      campaign_brief: {
        hook: "Renewal leverage before QBRs",
        audience_note: "Vendor-management operators"
      }
    };
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/lists/list_one.json");
      assert.equal(options.method, "PATCH");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), {
        list: {
          name: "Updated target list",
          description: "Re-ranked operator list.",
          campaign_brief: {
            hook: "Renewal leverage before QBRs",
            audience_note: "Vendor-management operators"
          }
        }
      });
      return jsonResponse(responseBody);
    });

    const exitCode = await run([
      "lists",
      "update",
      "list_one",
      "--name",
      "Updated target list",
      "--description",
      "Re-ranked operator list.",
      "--campaign-hook",
      "Renewal leverage before QBRs",
      "--audience-note",
      "Vendor-management operators",
      "--json"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("lists update renders a readable confirmation", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse({
      prefix_id: "list_one",
      name: "Updated target list",
      description: "Re-ranked operator list."
    }));

    const exitCode = await run([
      "lists",
      "update",
      "list_one",
      "--name",
      "Updated target list",
      "--description",
      "Re-ranked operator list."
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Updated list Updated target list \(list_one\)\./);
    assert.match(stdout.output, /Description: Re-ranked operator list\./);
  });
});

test("lists delete calls the expected api endpoint and supports json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      deleted: true,
      prefix_id: "list_one",
      name: "Old target list",
      reassigned_agent_count: 2
    };
    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/lists/list_one.json");
      assert.equal(options.method, "DELETE");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.equal(options.body, undefined);
      return jsonResponse(responseBody);
    });

    const exitCode = await run(["lists", "delete", "list_one", "--confirm", "true", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("lists delete renders a readable confirmation", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse({
      deleted: true,
      prefix_id: "list_one",
      name: "Old target list",
      reassigned_agent_count: 2
    }));

    const exitCode = await run(["lists", "delete", "list_one", "--confirm", "Y"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Deleted list Old target list \(list_one\)\./);
    assert.match(stdout.output, /Reassigned agents: 2/);
  });
});

test("lists delete requires explicit confirmation", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const stderr = captureStream();
    const fetch = createFetch(() => {
      throw new Error("delete should not call the API without confirmation");
    });

    const exitCode = await run(["lists", "delete", "list_one"], { env, fetch, stdout, stderr });

    assert.equal(exitCode, 1);
    assert.equal(stdout.output, "");
    assert.match(stderr.output, /Error: Usage: audienti lists delete <list_id> --confirm <yes\|true\|Y\|y>/);
  });
});

test("list and motion mutation commands call the expected api endpoints with json output", async () => {
  const cases = [
    {
      args: ["lists", "add-prospects", "list_one", "prsp_one", "42", "--json"],
      url: "https://app.audienti.com/api/v1/accounts/acct_one/lists/list_one/prospects.json",
      method: "POST",
      requestBody: { prospect_ids: ["prsp_one", "42"] },
      responseBody: { added: ["prsp_one", "42"], failed: [] }
    },
    {
      args: ["lists", "remove-prospects", "list_one", "prsp_one", "--json"],
      url: "https://app.audienti.com/api/v1/accounts/acct_one/lists/list_one/prospects.json",
      method: "DELETE",
      requestBody: { prospect_ids: ["prsp_one"] },
      responseBody: { removed: ["prsp_one"], failed: [] }
    },
    {
      args: ["motions", "add-prospects", "motn_one", "prsp_one", "prsp_two", "--assigned-user", "me", "--json"],
      url: "https://app.audienti.com/api/v1/accounts/acct_one/motions/motn_one/prospects.json",
      method: "POST",
      requestBody: { prospect_ids: ["prsp_one", "prsp_two"], assigned_user_id: "me" },
      responseBody: { assigned: ["prsp_one", "prsp_two"], failed: [] }
    }
  ];

  for (const { args, url: expectedUrl, method, requestBody, responseBody } of cases) {
    await withTempConfigHome(async ({ env }) => {
      await writeConfig({
        host: "https://app.audienti.com",
        token: "saved-token",
        accountId: "acct_one",
        accountName: "One"
      }, { env });

      const stdout = captureStream();
      const fetch = createFetch((url, options) => {
        assert.equal(url.toString(), expectedUrl);
        assert.equal(options.method, method);
        assert.equal(options.headers.Authorization, "Bearer saved-token");
        assert.deepEqual(JSON.parse(options.body), requestBody);
        return jsonResponse(responseBody);
      });

      const exitCode = await run(args, { env, fetch, stdout });

      assert.equal(exitCode, 0);
      assert.deepEqual(JSON.parse(stdout.output), responseBody);
    });
  }
});

test("list and motion mutation commands render readable summaries", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const responses = [
      jsonResponse({ added: ["prsp_one"], failed: [] }),
      jsonResponse({ assigned: ["prsp_one"], failed: [{ id: "prsp_missing", reason: "not_found" }] })
    ];
    const fetch = createFetch(() => responses.shift());

    let exitCode = await run(["lists", "add-prospects", "list_one", "prsp_one"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Added 1 prospects to list list_one\./);
    assert.match(stdout.output, /Failures: 0/);

    stdout.output = "";

    exitCode = await run(["motions", "add-prospects", "motn_one", "prsp_one", "prsp_missing"], { env, fetch, stdout });
    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Assigned 1 prospects to motion motn_one\./);
    assert.match(stdout.output, /Failures: 1/);
    assert.match(stdout.output, /- prsp_missing: not_found/);
  });
});

test("bulk mutation commands render per-prospect failures when every prospect is rejected", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const rejectedBody = { added: [], failed: [{ id: "prsp_missing", reason: "not_found" }] };
    const responses = [
      jsonResponse(rejectedBody, { status: 422 }),
      jsonResponse(rejectedBody, { status: 422 })
    ];
    const fetch = createFetch(() => responses.shift());

    let exitCode = await run(["lists", "add-prospects", "list_one", "prsp_missing"], { env, fetch, stdout });
    assert.equal(exitCode, 1);
    assert.match(stdout.output, /No prospects were added to list list_one\./);
    assert.match(stdout.output, /Failures: 1/);
    assert.match(stdout.output, /- prsp_missing: not_found/);

    stdout.output = "";

    exitCode = await run(["lists", "add-prospects", "list_one", "prsp_missing", "--json"], { env, fetch, stdout });
    assert.equal(exitCode, 1);
    assert.deepEqual(JSON.parse(stdout.output), rejectedBody);
  });
});

test("validation errors surface the server's errors array", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const stderr = captureStream();
    const fetch = createFetch(() =>
      jsonResponse({ errors: ["System lists cannot be renamed."] }, { status: 422 }));

    const exitCode = await run(["lists", "update", "list_one", "--name", "Renamed"], { env, fetch, stdout, stderr });

    assert.equal(exitCode, 1);
    assert.match(stderr.output, /Audienti rejected the request: System lists cannot be renamed\./);
  });
});

test("prospects import posts a LinkedIn URL and renders a poll command", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospect_imports.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), {
        linkedin_url: "https://www.linkedin.com/in/pat-prospect",
        list_id: "list_one",
        assigned_user_id: "me"
      });
      return jsonResponse({
        prefix_id: "primp_one",
        status: "running",
        ready: false,
        prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
        profile: { status: "queued" }
      }, { status: 201 });
    });

    const exitCode = await run([
      "prospects",
      "import",
      "https://www.linkedin.com/in/pat-prospect",
      "--list",
      "list_one",
      "--assigned-user",
      "me"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Started prospect import primp_one\./);
    assert.match(stdout.output, /Status: running/);
    assert.match(stdout.output, /Prospect: Pat Prospect \(prsp_one\)/);
    assert.match(stdout.output, /Run `audienti prospects import-status primp_one`/);
  });
});

test("prospects import sends motion and list ids when both are provided", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospect_imports.json");
      assert.deepEqual(JSON.parse(options.body), {
        linkedin_url: "https://www.linkedin.com/in/pat-prospect",
        list_id: "list_one",
        motion_id: "motn_one",
        assigned_user_id: "me"
      });
      return jsonResponse({
        prefix_id: "primp_one",
        status: "running",
        ready: false,
        prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
        profile: { status: "queued" }
      }, { status: 201 });
    });

    const exitCode = await run([
      "prospects",
      "import",
      "https://www.linkedin.com/in/pat-prospect",
      "--list",
      "list_one",
      "--motion",
      "motn_one",
      "--assigned-user",
      "me"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Started prospect import primp_one\./);
  });
});

test("prospects import supports json output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const responseBody = {
      prefix_id: "primp_one",
      status: "running",
      ready: false,
      prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" }
    };
    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse(responseBody, { status: 201 }));

    const exitCode = await run([
      "prospects",
      "import",
      "https://www.linkedin.com/in/pat-prospect",
      "--json"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("prospects import-status renders current import data", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospect_imports/primp_one.json");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse({
        prefix_id: "primp_one",
        status: "completed",
        ready: true,
        pipeline: {
          enrichment_status: "enriched",
          expansion_status: "completed"
        },
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect",
          company: "ExampleCo"
        },
        data: {
          emails: [{ value: "pat@example.com" }],
          phones: [{ value: "+15551234567" }],
          social_profiles: [{ identifier: "linkedin/profile", url: "https://www.linkedin.com/in/pat-prospect" }]
        }
      });
    });

    const exitCode = await run(["prospects", "import-status", "primp_one"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Import: primp_one/);
    assert.match(stdout.output, /Status: completed/);
    assert.match(stdout.output, /Ready: yes/);
    assert.match(stdout.output, /Prospect: Pat Prospect \(prsp_one\)/);
    assert.match(stdout.output, /Email: pat@example.com/);
    assert.match(stdout.output, /Phone: \+15551234567/);
    assert.match(stdout.output, /Social profiles: 1/);
  });
});

test("tools get help documents email and phone lookup by LinkedIn URL", async () => {
  const stdout = captureStream();

  const exitCode = await run(["tools", "get", "help"], { stdout });

  assert.equal(exitCode, 0);
  assert.match(stdout.output, /Usage:\n  audienti tools get <email\|phone> --url <linkedin_url>/);
  assert.match(stdout.output, /Uses the existing prospect import enrichment pipeline/);
  assert.match(stdout.output, /phone lookup still depends on the email waterfall selecting an email first/);
});

test("tools get email imports a LinkedIn URL, polls import status, and prints the selected email", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options, calls) => {
      if (calls.length === 1) {
        assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospect_imports.json");
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), {
          linkedin_url: "https://www.linkedin.com/in/pat-prospect"
        });

        return jsonResponse({
          prefix_id: "primp_one",
          status: "running",
          ready: false,
          prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" }
        }, { status: 201 });
      }

      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospect_imports/primp_one.json");
      assert.equal(options.method, "GET");

      return jsonResponse({
        prefix_id: "primp_one",
        status: "completed",
        ready: true,
        pipeline: {
          enrichment_status: "enriched",
          expansion_status: "completed"
        },
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        data: {
          emails: [{ value: "pat@example.com" }],
          phones: []
        }
      });
    });

    const exitCode = await run([
      "tools",
      "get",
      "email",
      "--url",
      "https://www.linkedin.com/in/pat-prospect"
    ], {
      env,
      fetch,
      stdout,
      sleep: async () => {}
    });

    assert.equal(exitCode, 0);
    assert.equal(fetch.calls.length, 2);
    assert.match(stdout.output, /^pat@example\.com\n$/);
  });
});

test("tools get phone returns a readable not-found result after the import pipeline completes", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options, calls) => {
      if (calls.length === 1) {
        assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospect_imports.json");
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), {
          linkedin_url: "https://www.linkedin.com/in/no-phone"
        });

        return jsonResponse({
          prefix_id: "primp_two",
          status: "running",
          ready: false,
          prospect: { prefix_id: "prsp_two", display_name: "No Phone" }
        }, { status: 201 });
      }

      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/prospect_imports/primp_two.json");
      assert.equal(options.method, "GET");

      return jsonResponse({
        prefix_id: "primp_two",
        status: "completed",
        ready: true,
        pipeline: {
          enrichment_status: "enriched",
          expansion_status: "completed"
        },
        prospect: {
          prefix_id: "prsp_two",
          display_name: "No Phone"
        },
        data: {
          emails: [{ value: "nophone@example.com" }],
          phones: []
        }
      });
    });

    const exitCode = await run([
      "tools",
      "get",
      "phone",
      "--url",
      "https://www.linkedin.com/in/no-phone"
    ], {
      env,
      fetch,
      stdout,
      sleep: async () => {}
    });

    assert.equal(exitCode, 0);
    assert.equal(fetch.calls.length, 2);
    assert.match(stdout.output, /No phone found for https:\/\/www\.linkedin\.com\/in\/no-phone\./);
    assert.match(stdout.output, /Import: primp_two/);
  });
});

test("prospects list sends filters and renders a readable table", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects.json");
      assert.equal(url.searchParams.get("query"), "risk");
      assert.equal(url.searchParams.get("motion_id"), "motn_one");
      assert.equal(url.searchParams.get("list_id"), "list_one");
      assert.equal(url.searchParams.get("stage"), "new");
      assert.equal(url.searchParams.get("assigned_user_id"), "me");
      assert.equal(url.searchParams.get("limit"), "5");
      assert.equal(url.searchParams.get("page"), null);
      assert.equal(url.searchParams.get("offset"), null);
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse({
        prospects: [{
          prefix_id: "prsp_one",
          display_name: "Pat Prospect",
          company: "ExampleCo",
          account_prospect: { pipeline_stage: "new" },
          queue: { recommended_action_label: "Send connection request" }
        }],
        meta: { total_count: 1, limit: 5 }
      });
    });

    const exitCode = await run([
      "prospects",
      "list",
      "--query",
      "risk",
      "--motion",
      "motn_one",
      "--list",
      "list_one",
      "--stage",
      "new",
      "--assigned-user",
      "me",
      "--limit",
      "5"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /PROSPECT ID\tSTAGE\tNAME\tCOMPANY\tNEXT ACTION/);
    assert.match(stdout.output, /prsp_one\tnew\tPat Prospect\tExampleCo\tSend connection request/);
  });
});

test("prospects list supports a dedicated company filter", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects.json");
      assert.equal(url.searchParams.get("company"), "Honeywell");
      assert.equal(url.searchParams.get("query"), null);
      assert.equal(options.headers.Authorization, "Bearer saved-token");

      return jsonResponse({
        prospects: [{
          prefix_id: "prsp_one",
          display_name: "Pat Prospect",
          company: "Honeywell",
          account_prospect: { pipeline_stage: "new" },
          queue: { recommended_action_label: "Send connection request" }
        }],
        meta: { total_count: 1, limit: 20 }
      });
    });

    const exitCode = await run([
      "prospects",
      "list",
      "--company",
      "Honeywell"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /prsp_one\tnew\tPat Prospect\tHoneywell\tSend connection request/);
  });
});

test("companies search sends the query and renders persisted company profiles", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/companies.json");
      assert.equal(url.searchParams.get("query"), "Honeywell");
      assert.equal(options.headers.Authorization, "Bearer saved-token");

      return jsonResponse({
        companies: [{
          id: 42,
          prefix_id: "prof_honeywell",
          citation_id: "linkedin/company:honeywell/12345",
          identifier: "linkedin/company",
          username: "honeywell",
          display_name: "Honeywell",
          url: "https://www.linkedin.com/company/honeywell",
          industry: "Industrial Automation",
          location: "Charlotte, North Carolina, United States"
        }],
        meta: {returned_count: 1}
      });
    });

    const exitCode = await run([
      "companies",
      "search",
      "--query",
      "Honeywell"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /PROFILE ID\tCITATION ID\tNAME\tLINKEDIN\tINDUSTRY\tLOCATION/);
    assert.match(stdout.output, /prof_honeywell\tlinkedin\/company:honeywell\/12345\tHoneywell\thttps:\/\/www\.linkedin\.com\/company\/honeywell\tIndustrial Automation\tCharlotte, North Carolina, United States/);
  });
});

test("prospects list supports filtering by company profile id", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects.json");
      assert.equal(url.searchParams.get("company_profile_id"), "prof_honeywell");
      assert.equal(options.headers.Authorization, "Bearer saved-token");

      return jsonResponse({
        prospects: [{
          prefix_id: "prsp_one",
          display_name: "Pat Prospect",
          company: "Honeywell",
          account_prospect: { pipeline_stage: "new" },
          queue: { recommended_action_label: "Send connection request" }
        }],
        meta: { total_count: 1, limit: 20 }
      });
    });

    const exitCode = await run([
      "prospects",
      "list",
      "--company-profile",
      "prof_honeywell"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /prsp_one\tnew\tPat Prospect\tHoneywell\tSend connection request/);
  });
});

test("prospects list accepts play as a motion filter alias", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url) => {
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects.json");
      assert.equal(url.searchParams.get("play_id"), "motn_one");
      assert.equal(url.searchParams.get("motion_id"), null);
      return jsonResponse({
        prospects: [],
        meta: { total_count: 0, limit: 20, offset: 0, page: 1, returned_count: 0, has_more: false }
      });
    });

    const exitCode = await run(["prospects", "list", "--play", "motn_one"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /No prospects found/);
  });
});

test("prospects list can include all profiles in json and table output", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const tableStdout = captureStream();
    const jsonStdout = captureStream();
    const responseBody = {
      prospects: [{
        prefix_id: "prsp_one",
        display_name: "Pat Prospect",
        company: "ExampleCo",
        account_prospect: { pipeline_stage: "new" },
        profiles: [
          { type: "linkedin", identifier: "linkedin/profile", citation_id: "linkedin/profile:pat-prospect", username: "pat-prospect", url: "https://www.linkedin.com/in/pat-prospect" },
          { type: "email", identifier: "email/profile", citation_id: "email/profile:pat@example.com", username: "pat@example.com", url: "mailto:pat@example.com" }
        ],
        profile_identifiers: {
          columns: ["linkedin/profile", "linkedin/company", "twitter/profile", "phone/profile", "email/profile"],
          values: {
            "linkedin/profile": [{ citation_id: "linkedin/profile:pat-prospect", identifier: "linkedin/profile", username: "pat-prospect", url: "https://www.linkedin.com/in/pat-prospect" }],
            "linkedin/company": [],
            "twitter/profile": [],
            "phone/profile": [],
            "email/profile": [{ citation_id: "email/profile:pat@example.com", identifier: "email/profile", username: "pat@example.com", url: "mailto:pat@example.com" }]
          }
        },
        queue: { recommended_action_label: "Send connection request" }
      }],
      meta: {
        total_count: 1,
        limit: 20,
        offset: 0,
        page: 1,
        returned_count: 1,
        has_more: false,
        profile_identifier_columns: ["linkedin/profile", "linkedin/company", "twitter/profile", "phone/profile", "email/profile"]
      }
    };

    const fetch = createFetch((url) => {
      assert.equal(url.searchParams.get("include_profiles"), "true");
      return jsonResponse(responseBody);
    });

    let exitCode = await run(["prospects", "list", "--profiles"], { env, fetch, stdout: tableStdout });

    assert.equal(exitCode, 0);
    assert.match(tableStdout.output, /PROSPECT ID\tSTAGE\tNAME\tCOMPANY\tlinkedin\/profile\tlinkedin\/company\ttwitter\/profile\tphone\/profile\temail\/profile\tNEXT ACTION/);
    assert.match(tableStdout.output, /linkedin\/profile:pat-prospect\t\t\t\temail\/profile:pat@example\.com\tSend connection request/);

    exitCode = await run(["prospects", "list", "--profiles", "--json"], { env, fetch, stdout: jsonStdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(jsonStdout.output), responseBody);
  });
});

test("prospects list supports explicit page pagination", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url) => {
      assert.equal(url.searchParams.get("limit"), "25");
      assert.equal(url.searchParams.get("page"), "3");
      assert.equal(url.searchParams.get("offset"), null);
      return jsonResponse({
        prospects: [],
        meta: { total_count: 0, limit: 25, offset: 50, page: 3, returned_count: 0, has_more: false }
      });
    });

    const exitCode = await run(["prospects", "list", "--page", "3", "--limit", "25"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /No prospects found/);
  });
});

test("prospects list can fetch all matching rows up to a total cap", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url) => {
      const offset = url.searchParams.get("offset");
      const limit = url.searchParams.get("limit");

      if (offset === "0") {
        assert.equal(limit, "3");
        return jsonResponse({
          prospects: [
            { prefix_id: "prsp_one", display_name: "Pat Prospect", company: "ExampleCo", account_prospect: { pipeline_stage: "new", status: "active", fit_score: 88 }, lists: [], queue: { recommended_action_label: "Wait" } },
            { prefix_id: "prsp_two", display_name: "Sam Seller", company: "ExampleCo", account_prospect: { pipeline_stage: "identified", status: "active", fit_score: 71 }, lists: [], queue: { recommended_action_label: "Write" } }
          ],
          meta: { total_count: 3, limit: 2, offset: 0, page: 1, returned_count: 2, has_more: true }
        });
      }

      assert.equal(offset, "2");
      assert.equal(limit, "1");
      return jsonResponse({
        prospects: [
          { prefix_id: "prsp_three", display_name: "Alex Analyst", company: "OtherCo", account_prospect: { pipeline_stage: "pre_connect", status: "active", fit_score: 64 }, lists: [], queue: { recommended_action_label: "Wait" } }
        ],
        meta: { total_count: 3, limit: 1, offset: 2, page: 3, returned_count: 1, has_more: false }
      });
    });

    const exitCode = await run(["prospects", "list", "--all", "--limit", "3", "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.equal(fetch.calls.length, 2);
    const payload = JSON.parse(stdout.output);
    assert.equal(payload.meta.total_count, 3);
    assert.equal(payload.meta.returned_count, 3);
    assert.equal(payload.meta.truncated, false);
    assert.deepEqual(payload.prospects.map((prospect) => prospect.prefix_id), ["prsp_one", "prsp_two", "prsp_three"]);
  });
});

test("prospects list can export a rich csv", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse({
      prospects: [{
        prefix_id: "prsp_one",
        display_name: "Pat Prospect",
        name: "Pat Prospect",
        title: "VP Growth",
        company: "ExampleCo",
        email: "pat@example.com",
        linkedin_url: "https://www.linkedin.com/in/pat-prospect",
        website: "https://example.com",
        updated_at: "2026-07-09T10:00:00Z",
        primary_profile: {
          prefix_id: "prof_one",
          identifier: "linkedin/profile",
          username: "pat-prospect",
          display_name: "Pat Prospect"
        },
        account_prospect: {
          id: 42,
          status: "active",
          fit_score: 88,
          pipeline_stage: "new",
          motion: { prefix_id: "motn_one", name: "Motion One", kind: "outbound", status: "active" }
        },
        lists: [{ prefix_id: "list_one", name: "Owned list" }],
        queue: { recommended_action_label: "Send connection request", rationale: "Good fit" }
      }],
      meta: { total_count: 1, limit: 20, offset: 0, page: 1, returned_count: 1, has_more: false }
    }));

    const exitCode = await run(["prospects", "list", "--csv"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /^prefix_id,display_name,name,kind,title,company,email,linkedin_url,website,/);
    assert.match(stdout.output, /prsp_one,Pat Prospect,Pat Prospect,,VP Growth,ExampleCo,pat@example.com,https:\/\/www\.linkedin\.com\/in\/pat-prospect,https:\/\/example\.com/);
    assert.match(stdout.output, /Owned list/);
    assert.match(stdout.output, /Send connection request/);
  });
});

test("lists prospects supports pagination and profiles", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/lists/list_one/prospects.json");
      assert.equal(url.searchParams.get("page"), "2");
      assert.equal(url.searchParams.get("limit"), "25");
      assert.equal(url.searchParams.get("include_profiles"), "true");
      assert.equal(options.headers.Authorization, "Bearer saved-token");

      return jsonResponse({
        prospects: [{
          prefix_id: "prsp_one",
          display_name: "Pat Prospect",
          company: "ExampleCo",
          account_prospect: { pipeline_stage: "new" },
          profiles: [
            { type: "linkedin", identifier: "linkedin/profile", citation_id: "linkedin/profile:pat-prospect", username: "pat-prospect", url: "https://www.linkedin.com/in/pat-prospect" }
          ],
          profile_identifiers: {
            columns: ["linkedin/profile", "linkedin/company", "twitter/profile", "phone/profile", "email/profile"],
            values: {
              "linkedin/profile": [{ citation_id: "linkedin/profile:pat-prospect", identifier: "linkedin/profile", username: "pat-prospect", url: "https://www.linkedin.com/in/pat-prospect" }],
              "linkedin/company": [],
              "twitter/profile": [],
              "phone/profile": [],
              "email/profile": []
            }
          },
          queue: { recommended_action_label: "Send connection request" }
        }],
        meta: {
          total_count: 26,
          limit: 25,
          offset: 25,
          page: 2,
          returned_count: 1,
          has_more: false,
          profile_identifier_columns: ["linkedin/profile", "linkedin/company", "twitter/profile", "phone/profile", "email/profile"]
        }
      });
    });

    const exitCode = await run(["lists", "prospects", "list_one", "--page", "2", "--limit", "25", "--profiles"], {
      env, fetch, stdout
    });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /PROSPECT ID\tSTAGE\tNAME\tCOMPANY\tlinkedin\/profile\tlinkedin\/company\ttwitter\/profile\tphone\/profile\temail\/profile\tNEXT ACTION/);
    assert.match(stdout.output, /linkedin\/profile:pat-prospect\t\t\t\t\tSend connection request/);
  });
});

test("motions and plays prospects share the same read command path", async () => {
  for (const args of [["motions", "prospects", "motn_one"], ["plays", "prospects", "motn_one"]]) {
    await withTempConfigHome(async ({ env }) => {
      await writeConfig({
        host: "https://app.audienti.com",
        token: "saved-token",
        accountId: "acct_one",
        accountName: "One"
      }, { env });

      const stdout = captureStream();
      const fetch = createFetch((url, options) => {
        assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/motions/motn_one/prospects.json");
        assert.equal(options.headers.Authorization, "Bearer saved-token");
        return jsonResponse({
          prospects: [{
            prefix_id: "prsp_one",
            display_name: "Pat Prospect",
            company: "ExampleCo",
            account_prospect: { pipeline_stage: "new" },
            queue: { recommended_action_label: "Wait" }
          }],
          meta: { total_count: 1, limit: 20, offset: 0, page: 1, returned_count: 1, has_more: false }
        });
      });

      const exitCode = await run(args, { env, fetch, stdout });

      assert.equal(exitCode, 0);
      assert.match(stdout.output, /PROSPECT ID\tSTAGE\tNAME\tCOMPANY\tNEXT ACTION/);
      assert.match(stdout.output, /prsp_one\tnew\tPat Prospect\tExampleCo\tWait/);
    });
  }
});

test("prospects message-types lists per-prospect surface keys", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/message_types.json");
      assert.equal(options.method, "GET");
      assert.equal(options.headers.Authorization, "Bearer saved-token");

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        message_surfaces: [
          {
            key: "post_accept_message",
            available: true,
            canonical_message_type: "direct_message",
            stage: "First direct message",
            channel: "LinkedIn"
          },
          {
            key: "email",
            available: false,
            canonical_message_type: "email",
            stage: "Email",
            channel: "Email",
            missing_reason: "No Email profile is available for this prospect."
          }
        ]
      });
    });

    const exitCode = await run(["prospects", "message-types", "prsp_one"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Prospect: Pat Prospect \(prsp_one\)/);
    assert.match(stdout.output, /TYPE\tAVAILABLE\tMESSAGE TYPE\tSTAGE\tCHANNEL/);
    assert.match(stdout.output, /post_accept_message\tyes\tdirect_message\tFirst direct message\tLinkedIn/);
    assert.match(stdout.output, /reason: No Email profile is available for this prospect\./);
  });
});

test("prospects write requests one surface-specific draft", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(async (url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/write_message.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), { surface_key: "post_accept_message" });

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        message_surface: {
          key: "post_accept_message",
          canonical_message_type: "direct_message",
          stage: "First direct message",
          channel: "LinkedIn",
          available: true,
          status: "success",
          body: "Helpful draft body"
        }
      });
    });

    const exitCode = await run(["prospects", "write", "prsp_one", "--type", "post_accept_message"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Type: post_accept_message/);
    assert.match(stdout.output, /Message type: direct_message/);
    assert.match(stdout.output, /Body:\nHelpful draft body/);
  });
});

test("prospects sequence-preview runs the report workflow and renders ordered steps", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch(async (url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_one/prospects/prsp_one/sequence_preview.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), { connection_state: "accepted" });

      return jsonResponse({
        prospect: {
          prefix_id: "prsp_one",
          display_name: "Pat Prospect"
        },
        context: {
          source: "linked_agent",
          message: "Using this prospect's linked agent context and default sequence path."
        },
        report: {
          status: "completed",
          selected: {
            prospect_name: "Pat Prospect",
            motion_name: "Motion One",
            agent_name: "Agent One",
            offer_name: "Offer One"
          },
          summary: {
            channel_sequence: ["LinkedIn", "Email"],
            total_duration_days: 7
          },
          preview_history_count: 1,
          last_preview: {
            generated_at: "2026-07-09T14:20:00Z"
          },
          steps: [
            {
              kind: "message",
              stage: "Connection request",
              channel: "LinkedIn",
              body: "Connect request body"
            },
            {
              kind: "wait",
              stage: "Wait 7 calendar days",
              channel: "Timeline",
              timing: {
                mode: "scheduled",
                scheduled_for: "2026-07-16"
              }
            }
          ]
        }
      });
    });

    const exitCode = await run(["prospects", "sequence-preview", "prsp_one", "--connection-state", "accepted"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Prospect: Pat Prospect \(prsp_one\)/);
    assert.match(stdout.output, /Context: linked_agent/);
    assert.match(stdout.output, /Channels: LinkedIn -> Email/);
    assert.match(stdout.output, /1\. MESSAGE \| Connection request \| LinkedIn/);
    assert.match(stdout.output, /Body: Connect request body/);
    assert.match(stdout.output, /2\. WAIT \| Wait 7 calendar days \| Timeline \[scheduled 2026-07-16\]/);
  });
});

test("operator next sends filters and supports account override without mutating config", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.origin, "https://app.audienti.com");
      assert.equal(url.pathname, "/api/v1/accounts/acct_two/operator/next.json");
      assert.equal(url.searchParams.get("principal_account_user_id"), "42");
      assert.equal(url.searchParams.get("motion_id"), "motn_one");
      assert.equal(url.searchParams.get("list_id"), "list_one");
      assert.equal(url.searchParams.get("stage"), "new");
      assert.equal(url.searchParams.get("opportunity_kind"), "prospect");
      assert.equal(url.searchParams.get("writing_status"), "ready");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      return jsonResponse({
        next_move: {
          id: 123,
          opportunity_kind: "prospect",
          prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
          motion: { prefix_id: "motn_one", name: "Motion One" },
          recommended_action_label: "Send connection request"
        },
        filters: {},
        metrics: {}
      });
    });

    const exitCode = await run([
      "--account",
      "acct_two",
      "operator",
      "next",
      "--json",
      "--principal",
      "42",
      "--motion",
      "motn_one",
      "--list",
      "list_one",
      "--stage",
      "new",
      "--opportunity-kind",
      "prospect",
      "--writing-status",
      "ready"
    ], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(stdout.output).next_move.prospect.prefix_id, "prsp_one");
    assert.deepEqual(await readConfig({ env }), {
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    });
  });
});

test("operator outcome posts a payload with the command row id", async () => {
  await withTempConfigHome(async ({ root, env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });
    const payloadPath = join(root, "operator-outcome.json");
    await writeFile(payloadPath, JSON.stringify({
      row_id: "from-file",
      status: "done",
      action_type: "connection_request",
      prospect_id: "prsp_one",
      note: "Connection request sent."
    }));

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/accounts/acct_one/operator/outcome.json");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), {
        row_id: "123",
        status: "done",
        action_type: "connection_request",
        prospect_id: "prsp_one",
        note: "Connection request sent."
      });
      return jsonResponse({
        status: "ok",
        row_id: "123",
        operator_outcome: { status: "done", action_type: "connection_request" },
        prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
        event: { prefix_id: "evnt_one", key: "action.profile.connect_request_sent" }
      });
    });

    const exitCode = await run(["operator", "outcome", "123", "--payload", payloadPath], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Recorded done outcome for row 123/);
    assert.match(stdout.output, /Event: evnt_one/);
  });
});

test("operator outcome supports json output", async () => {
  await withTempConfigHome(async ({ root, env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token",
      accountId: "acct_one",
      accountName: "One"
    }, { env });
    const payloadPath = join(root, "operator-outcome.json");
    const responseBody = {
      status: "ok",
      row_id: "123",
      operator_outcome: { status: "skipped", action_type: "connection_request" },
      prospect: { prefix_id: "prsp_one", display_name: "Pat Prospect" },
      event: { prefix_id: "evnt_note", key: "note.internal" }
    };
    await writeFile(payloadPath, JSON.stringify({
      status: "skipped",
      action_type: "connection_request",
      note: "No safe opening."
    }));

    const stdout = captureStream();
    const fetch = createFetch(() => jsonResponse(responseBody));

    const exitCode = await run(["operator", "outcome", "123", "--payload", payloadPath, "--json"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.output), responseBody);
  });
});

test("account read commands require a selected account or account override", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "saved-token"
    }, { env });

    const stderr = captureStream();
    const fetch = createFetch(() => {
      throw new Error("account-less command must not call the API");
    });

    const exitCode = await run(["motions", "list"], { env, fetch, stderr });

    assert.equal(exitCode, 1);
    assert.match(stderr.output, /No active account/);
  });
});

test("auth status checks live auth and masks token", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "abcd1234wxyz",
      accountId: "acct_one",
      accountName: "One"
    }, { env });

    const stdout = captureStream();
    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.audienti.com/api/v1/me.json");
      assert.equal(options.headers.Authorization, "Bearer abcd1234wxyz");
      return jsonResponse({ id: 1, name: "User One" });
    });

    const exitCode = await run(["auth", "status"], { env, fetch, stdout });

    assert.equal(exitCode, 0);
    assert.match(stdout.output, /Token: abcd...wxyz/);
    assert.match(stdout.output, /User: User One/);
    assert.match(stdout.output, /Active account: One \(acct_one\)/);
  });
});
