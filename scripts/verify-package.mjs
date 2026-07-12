import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = await readJson("package.json");
const codexManifest = await readJson(".codex-plugin/plugin.json");
const claudeManifest = await readJson(".claude-plugin/plugin.json");
const changelog = await readText("CHANGELOG.md");
const errors = [];

if (packageJson.name !== "@audienti/cli") {
  errors.push('package name must be "@audienti/cli"');
}

if (packageJson.private === true) {
  errors.push("package must be publishable, not private");
}

if (packageJson.version !== codexManifest.version || packageJson.version !== claudeManifest.version) {
  errors.push("package and plugin manifest versions must match");
}

if (codexManifest.name !== "audienti-cli" || claudeManifest.name !== "audienti-cli") {
  errors.push('plugin manifest names must be "audienti-cli"');
}

if (codexManifest.license !== "UNLICENSED" || claudeManifest.license !== "UNLICENSED") {
  errors.push('plugin manifests must declare the proprietary license as "UNLICENSED"');
}

if (packageJson.repository?.url !== "git+https://github.com/audienti/cli.git") {
  errors.push("package repository must point to audienti/cli");
}

if (packageJson.publishConfig?.access !== "public") {
  errors.push("package must declare public npm access");
}

if (packageJson.bin?.audienti !== "./bin/audienti.js") {
  errors.push("package must expose the audienti binary");
}

if (!Array.isArray(packageJson.files) || !packageJson.files.includes("skills/")) {
  errors.push('package files must include "skills/" so the agent-facing CLI contract ships');
}

if (!Array.isArray(packageJson.files) || !packageJson.files.includes("install")) {
  errors.push('package files must include "install" so the curl installer ships');
}

if (!changelog.includes(`## [${packageJson.version}]`)) {
  errors.push(`CHANGELOG.md must contain a release section for v${packageJson.version}`);
}

await requireFile("bin/audienti.js");
await requireExecutableFile("install");
await requireTextFile("CNAME", "cli.audienti.com");
await requireFile(".nojekyll");
await requireFile("LICENSE");
await requireFile("README.md");
await requireFile("skills/audienti/SKILL.md");

if (errors.length > 0) {
  for (const error of errors) console.error(`Error: ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Audienti CLI package metadata is valid for v${packageJson.version}.`);
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(packageRoot, relativePath), "utf8"));
}

async function readText(relativePath) {
  return readFile(join(packageRoot, relativePath), "utf8");
}

async function requireFile(relativePath) {
  try {
    await access(join(packageRoot, relativePath));
  } catch {
    errors.push(`missing required file: ${relativePath}`);
  }
}

async function requireExecutableFile(relativePath) {
  try {
    await access(join(packageRoot, relativePath), constants.X_OK);
  } catch {
    errors.push(`missing executable file: ${relativePath}`);
  }
}

async function requireTextFile(relativePath, expectedText) {
  try {
    const text = (await readText(relativePath)).trim();
    if (text !== expectedText) {
      errors.push(`${relativePath} must contain ${expectedText}`);
    }
  } catch {
    errors.push(`missing required file: ${relativePath}`);
  }
}
