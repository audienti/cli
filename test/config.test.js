import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
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

test("masks stored tokens for status output", () => {
  assert.equal(maskToken("abcd1234wxyz"), "abcd...wxyz");
  assert.equal(maskToken("short"), "********");
});
