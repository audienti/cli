import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { configDirectory, configPath, deleteConfig, maskToken, readConfig, writeConfig } from "../src/config.js";
import { withTempConfigHome } from "./helpers.js";

test("writes, reads, and deletes config with strict permissions", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "secret-token"
    }, { env });

    assert.deepEqual(await readConfig({ env }), {
      host: "https://app.audienti.com",
      token: "secret-token"
    });

    assert.equal((await stat(configDirectory(env))).mode & 0o777, 0o700);
    assert.equal((await stat(configPath(env))).mode & 0o777, 0o600);

    await deleteConfig({ env });
    assert.deepEqual(await readConfig({ env }), {});
  });
});

test("fills missing local account selection from fallback config", async () => {
  await withTempConfigHome(async ({ env }) => {
    const fallbackRoot = await mkdtemp(join(tmpdir(), "audienti-cli-fallback-"));
    const fallbackEnv = { AUDIENTI_CONFIG_HOME: fallbackRoot };

    try {
      await writeConfig({
        host: "http://localhost:55050",
        token: "local-token"
      }, { env });
      await writeConfig({
        host: "https://app.audienti.com",
        token: "global-token",
        accountId: "acct_knit",
        accountName: "KNIT",
        accountUserId: "42",
        accountUserName: "User One",
        accountUserEmail: "one@example.com"
      }, { env: fallbackEnv });

      assert.deepEqual(await readConfig({ env: { ...env, AUDIENTI_CONFIG_FALLBACK_HOME: fallbackRoot } }), {
        host: "http://localhost:55050",
        token: "local-token",
        accountId: "acct_knit",
        accountName: "KNIT",
        accountUserId: "42",
        accountUserName: "User One",
        accountUserEmail: "one@example.com"
      });
    } finally {
      await rm(fallbackRoot, { recursive: true, force: true });
    }
  });
});

test("uses the fallback host and token together when local config is empty", async () => {
  await withTempConfigHome(async ({ env }) => {
    const fallbackRoot = await mkdtemp(join(tmpdir(), "audienti-cli-fallback-"));
    const fallbackEnv = { AUDIENTI_CONFIG_HOME: fallbackRoot };

    try {
      await writeConfig({
        host: "https://app.audienti.com",
        token: "global-token",
        accountId: "acct_knit",
        accountName: "KNIT"
      }, { env: fallbackEnv });

      assert.deepEqual(await readConfig({ env: { ...env, AUDIENTI_CONFIG_FALLBACK_HOME: fallbackRoot } }), {
        host: "https://app.audienti.com",
        token: "global-token",
        accountId: "acct_knit",
        accountName: "KNIT"
      });
    } finally {
      await rm(fallbackRoot, { recursive: true, force: true });
    }
  });
});

test("host override does not carry a fallback token across hosts", async () => {
  await withTempConfigHome(async ({ env }) => {
    const fallbackRoot = await mkdtemp(join(tmpdir(), "audienti-cli-fallback-"));
    const fallbackEnv = { AUDIENTI_CONFIG_HOME: fallbackRoot };

    try {
      await writeConfig({
        host: "http://localhost:55050"
      }, { env });
      await writeConfig({
        host: "https://app.audienti.com",
        token: "global-token",
        accountId: "acct_knit",
        accountName: "KNIT"
      }, { env: fallbackEnv });

      assert.deepEqual(await readConfig({
        env: {
          ...env,
          AUDIENTI_CONFIG_FALLBACK_HOME: fallbackRoot,
          AUDIENTI_CONFIG_HOST_OVERRIDE: "http://localhost:55050"
        }
      }), {
        host: "http://localhost:55050",
        accountId: "acct_knit",
        accountName: "KNIT"
      });
    } finally {
      await rm(fallbackRoot, { recursive: true, force: true });
    }
  });
});

test("host override drops a configured token when the host changes", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "https://app.audienti.com",
      token: "local-token"
    }, { env });

    assert.deepEqual(await readConfig({
      env: {
        ...env,
        AUDIENTI_CONFIG_HOST_OVERRIDE: "http://localhost:55050"
      }
    }), {
      host: "http://localhost:55050"
    });
  });
});

test("host override preserves a configured token for the same host", async () => {
  await withTempConfigHome(async ({ env }) => {
    await writeConfig({
      host: "http://localhost:55050",
      token: "local-token"
    }, { env });

    assert.deepEqual(await readConfig({
      env: {
        ...env,
        AUDIENTI_CONFIG_HOST_OVERRIDE: "http://localhost:55050"
      }
    }), {
      host: "http://localhost:55050",
      token: "local-token"
    });
  });
});

test("masks stored tokens for status output", () => {
  assert.equal(maskToken("abcd1234wxyz"), "abcd...wxyz");
  assert.equal(maskToken("short"), "********");
});
