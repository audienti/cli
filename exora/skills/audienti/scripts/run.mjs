#!/usr/bin/env node
import { openSync, closeSync, readSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { MAX_INPUT_BYTES } from './contracts.mjs';
import { runHelper } from './profile-helpers.mjs';

export function readHelperInput(path) {
  const fd = path === '-' ? 0 : openSync(path, 'r');
  try {
    const chunks = []; let size = 0;
    while (size <= MAX_INPUT_BYTES) {
      const chunk = Buffer.alloc(Math.min(65536, MAX_INPUT_BYTES + 1 - size));
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (!count) break;
      size += count; chunks.push(chunk.subarray(0, count));
    }
    if (size > MAX_INPUT_BYTES) throw new Error('Helper input exceeds 1 MiB.');
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new Error('Helper input must be valid JSON.'); }
  } finally { if (fd !== 0) closeSync(fd); }
}

export function executeHelperFile(name, path) {
  // Neither a filename nor a helper name is ever imported or executed.
  return runHelper(name, readHelperInput(path));
}

let isEntry = false;
try { isEntry = Boolean(process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href); }
catch { /* Imported from a synthetic runner without a file entry point. */ }
if (isEntry) {
  try {
    const [name, flag, path, ...rest] = process.argv.slice(2);
    if (!name || flag !== '--file' || !path || rest.length) throw new Error('Usage: node scripts/run.mjs HELPER --file INPUT.json|-');
    process.stdout.write(`${JSON.stringify(executeHelperFile(name, path))}\n`);
  } catch {
    process.stderr.write('Skill helper failed. Use a bundled helper name and valid JSON input of at most 1 MiB.\n');
    process.exitCode = 1;
  }
}
