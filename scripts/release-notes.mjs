import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export function releaseNotesFor(changelog, version) {
  const heading = `## [${version}]`;
  const start = changelog.indexOf(heading);

  if (start === -1) {
    throw new Error(`No CHANGELOG.md section found for v${version}.`);
  }

  const followingHeading = changelog.indexOf("\n## [", start + heading.length);
  const notes = changelog.slice(start, followingHeading === -1 ? undefined : followingHeading).trim();
  const body = notes.split("\n").slice(1).join("\n").trim();

  if (!body) {
    throw new Error(`CHANGELOG.md section for v${version} is empty.`);
  }

  return notes;
}

async function main() {
  const version = process.argv[2];

  if (!version) {
    throw new Error("Usage: node scripts/release-notes.mjs <version>");
  }

  const changelog = await readFile(join(packageRoot, "CHANGELOG.md"), "utf8");
  process.stdout.write(`${releaseNotesFor(changelog, version)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
