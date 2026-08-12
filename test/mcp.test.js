import assert from "node:assert/strict";
import test from "node:test";
import { writeConfig } from "../src/config.js";
import { handleMcpRequest } from "../src/mcp.js";
import { createFetch, jsonResponse, withTempConfigHome } from "./helpers.js";

test("tools list is forwarded to the app-hosted MCP endpoint", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.example.test",
      token: "saved-token",
      accountId: "acct_saved"
    }, { env });

    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.example.test/mcp");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {}
      });
      return jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          resultType: "complete",
          tools: [
            { name: "setup.play_preflight" },
            { name: "analytics.stages" },
            { name: "analytics.cohort_lists.create" }
          ]
        }
      });
    });

    const response = await handleMcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {}
    }, { env, fetchImpl: fetch });

    assert.equal(response.jsonrpc, "2.0");
    assert.equal(response.id, 1);
    const toolNames = response.result.tools.map((tool) => tool.name);
    assert.ok(toolNames.includes("setup.play_preflight"));
    assert.ok(toolNames.includes("analytics.stages"));
    assert.ok(toolNames.includes("analytics.cohort_lists.create"));
  });
});

test("tool call injects the saved account before forwarding to hosted MCP", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.example.test",
      token: "saved-token",
      accountId: "acct_saved"
    }, { env });

    const fetch = createFetch((url, options) => {
      assert.equal(url.toString(), "https://app.example.test/mcp");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer saved-token");
      assert.deepEqual(JSON.parse(options.body), {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "analytics.stages",
          arguments: {
            query: {
              interval: "weekly"
            },
            account_id: "acct_saved"
          }
        }
      });
      return jsonResponse({
        jsonrpc: "2.0",
        id: 2,
        result: {
          resultType: "complete",
          structuredContent: { kind: "stages", interval: "weekly" },
          isError: false
        }
      });
    });

    const response = await handleMcpRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "analytics.stages",
        arguments: {
          query: {
            interval: "weekly"
          }
        }
      }
    }, { env, fetchImpl: fetch });

    assert.equal(response.result.isError, false);
    assert.deepEqual(response.result.structuredContent, { kind: "stages", interval: "weekly" });
  });
});

test("tool call returns actionable auth error when cli config is missing", async () => {
  await withTempConfigHome(async ({ env }) => {
    const response = await handleMcpRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "accounts.list",
        arguments: {}
      }
    }, { env });

    assert.equal(response.error.code, -32603);
    assert.match(response.error.message, /audienti auth login/);
  });
});
