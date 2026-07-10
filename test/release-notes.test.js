import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
