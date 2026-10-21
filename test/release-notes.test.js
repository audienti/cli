import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { releaseNotesFor } from "../scripts/release-notes.mjs";

test("rejects a release heading without changelog content", () => {
  const changelog = "# Changelog\n\n## [0.2.0] - 2026-07-10\n";

  assert.throws(
    () => releaseNotesFor(changelog, "0.2.0"),
    /CHANGELOG\.md section for v0\.2\.0 is empty\./
  );
});

test("publish workflow extracts the package version without escaping JavaScript quotes", async () => {
  const workflow = await readFile(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");

  assert.match(workflow, /node -p 'require\("\.\/package\.json"\)\.version'/);
  assert.doesNotMatch(workflow, /require\\\("\.\/package\.json/);
});

test("npm publishing uses the temporary token only in the guarded publish step", async () => {
  const workflow = await readFile(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");
  const publishStep = workflow.match(/      - name: Publish to npm\n([\s\S]*?)(?=\n      - name: |$)/);

  assert.ok(publishStep, "npm publish step exists");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /if: github\.repository == 'audienti\/cli' && github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(workflow, /^  id-token: write$/m);
  assert.doesNotMatch(workflow, /Require npm version for trusted publishing|npm --version|11\.5\.1/);
  assert.match(publishStep[1], /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_PUBLISH_TOKEN \}\}/);
  assert.match(publishStep[1], /if \[ -z "\$\{NODE_AUTH_TOKEN:-\}" \]/);
  assert.match(publishStep[1], /npm publish --access public/);
  assert.doesNotMatch(publishStep[1], /--loglevel verbose|--verbose/);
  assert.equal((workflow.match(/\$\{\{ secrets\.NPM_PUBLISH_TOKEN \}\}/g) ?? []).length, 1);

  const script = publishStep[1].match(/run: \|\n((?:          .*\n)+)/)?.[1]
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(10))
    .join("\n");
  assert.ok(script, "publish shell exists");

  const directory = await mkdtemp(join(tmpdir(), "audienti-npm-publish-"));
  try {
    const npmPath = join(directory, "npm");
    const marker = join(directory, "npm-called");
    await writeFile(npmPath, `#!/bin/sh
if [ "\${NODE_AUTH_TOKEN:-}" != "synthetic-token-sentinel" ] ||
   [ "$#" -ne 3 ] || [ "$1" != "publish" ] ||
   [ "$2" != "--access" ] || [ "$3" != "public" ]; then
  exit 91
fi
printf '%s\\n' called > '${marker}'
exit "\${FAKE_NPM_STATUS}"
`, { mode: 0o755 });

    const run = (token, fakeStatus = "0") => {
      const env = { ...process.env, PATH: `${directory}:${process.env.PATH}`, FAKE_NPM_STATUS: fakeStatus };
      if (token === undefined) delete env.NODE_AUTH_TOKEN;
      else env.NODE_AUTH_TOKEN = token;
      return spawnSync("bash", ["-c", script], { encoding: "utf8", env });
    };

    const present = run("synthetic-token-sentinel");
    assert.equal(present.status, 0);
    assert.equal(await readFile(marker, "utf8"), "called\n");
    assert.doesNotMatch(present.stdout + present.stderr, /synthetic-token-sentinel/);

    await rm(marker);
    for (const token of [undefined, ""]) {
      const missing = run(token);
      assert.notEqual(missing.status, 0);
      assert.match(missing.stderr, /NPM_PUBLISH_TOKEN is required/);
      await assert.rejects(readFile(marker), { code: "ENOENT" });
    }

    const failedNpm = run("synthetic-token-sentinel", "23");
    assert.equal(failedNpm.status, 23);
    assert.doesNotMatch(failedNpm.stdout + failedNpm.stderr, /synthetic-token-sentinel/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
