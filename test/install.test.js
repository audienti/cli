import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const installScript = join(dirname(fileURLToPath(import.meta.url)), "..", "install");

// Runs the real install script against stub `npm` and `audienti` binaries so
// no package is installed and no network is used.
async function runInstall({ loggedIn, tty }) {
  const root = await mkdtemp(join(tmpdir(), "audienti-install-"));
  try {
    const prefix = join(root, "prefix");
    const bin = join(prefix, "bin");
    const packageDir = join(prefix, "lib", "node_modules", "@audienti", "cli");
    await mkdir(bin, { recursive: true });
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, "package.json"), JSON.stringify({ version: "9.9.9" }));

    await writeExecutable(join(bin, "npm"), `#!/bin/sh
case "$1" in
  prefix) echo "${prefix}" ;;
  root) echo "${join(prefix, "lib", "node_modules")}" ;;
  *) exit 0 ;;
esac
`);
    await writeExecutable(join(bin, "audienti"), `#!/bin/sh
case "$1" in
  --help) exit 0 ;;
  config) ${loggedIn ? "echo '{\"token\":\"****abcd\"}'" : "echo '{\"token\":null}'"} ;;
  start) read -r line; echo "STUB start read: $line" ;;
  *) echo "unexpected audienti $*" >&2; exit 9 ;;
esac
`);

    let ttyDevice = join(root, "no-such-tty");
    if (tty) {
      ttyDevice = join(root, "tty");
      await writeFile(ttyDevice, "typed-at-keyboard\n");
    }

    const result = spawnSync("bash", [installScript], {
      input: "piped-script-body\n",
      encoding: "utf8",
      env: {
        PATH: [bin, dirname(process.execPath), "/usr/bin", "/bin"].join(":"),
        HOME: root,
        AUDIENTI_INSTALL_TTY: ttyDevice
      }
    });
    return result;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeExecutable(path, body) {
  await writeFile(path, body);
  await chmod(path, 0o755);
}

test("install on a new machine at a terminal runs audienti start reading the terminal", async () => {
  const result = await runInstall({ loggedIn: false, tty: true });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Audienti CLI 9\.9\.9 installed\./);
  assert.match(result.stdout, /STUB start read: typed-at-keyboard/);
  assert.doesNotMatch(result.stdout, /piped-script-body/);
  assert.doesNotMatch(result.stdout, /Next:/);
});

test("install over a saved login only reports the update", async () => {
  const result = await runInstall({ loggedIn: true, tty: true });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "Installing @audienti/cli...\nAudienti CLI updated to 9.9.9.\n");
});

test("install without a terminal prints next steps and never starts", async () => {
  const result = await runInstall({ loggedIn: false, tty: false });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /STUB start/);
  assert.match(result.stdout, /Audienti CLI installed\.\n\nNext:\n {2}audienti start/);
  assert.match(result.stdout, /audienti setup --url <company_url> --yes/);
});
