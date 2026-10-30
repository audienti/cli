import { readFileSync } from 'node:fs';
import { callWorkspace, configuration } from './workspaces.mjs';
export async function accountRepliesCli(args) {
  const flags = {}, positions = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') continue;
    if (!arg.startsWith('--')) { positions.push(arg); continue; }
    const key = arg.slice(2);
    if (!['workspace', 'profile', 'file', 'evidence', 'cursor', 'limit', 'history-cursor', 'history-limit', 'status'].includes(key) || Object.hasOwn(flags, key) || !args[i+1] || args[i+1].startsWith('--')) throw Error('Unknown, repeated or incomplete reply option.');
    flags[key] = args[++i];
  }
  const command = positions[2];
  if (positions[0] !== 'prospects' || positions[1] !== 'replies' || !['set', 'get', 'list'].includes(command) || positions.length !== 4) throw Error('Use prospects replies set|get|list PERSON --workspace ID.');
  const allowed = ['workspace', 'profile', ...(command === 'set' ? ['file', 'evidence'] : command === 'get' ? ['evidence', 'history-cursor', 'history-limit'] : ['cursor', 'limit', 'status'])];
  if (Object.keys(flags).some(k => !allowed.includes(k))) throw Error('Option does not apply to this reply command.');
  if (command !== 'list' && !flags.evidence) throw Error('--evidence EVIDENCE is required.');
  let input = {};
  if (command === 'set') {
    if (!flags.file) throw Error('--file INPUT.json is required.');
    let raw; try { raw = readFileSync(flags.file); } catch { throw Error('Could not read the reply input file.'); }
    if (raw.length > 65536) throw Error('payload_too_large');
    try { input = JSON.parse(raw.toString('utf8')); } catch { throw Error('validation_error'); }
    if (!input || typeof input !== 'object' || Array.isArray(input) || ['workspaceId', 'prospectId', 'evidenceId'].some(k => Object.hasOwn(input, k))) throw Error('invalid_fields');
  }
  input.workspaceId = flags.workspace;
  input.prospectId = positions[3];
  if (flags.evidence !== undefined) input.evidenceId = flags.evidence;
  for (const [flag, key] of [['cursor', 'cursor'], ['history-cursor', 'historyCursor'], ['status', 'status']]) if (flags[flag] !== undefined) input[key] = flags[flag];
  for (const [flag, key] of [['limit', 'limit'], ['history-limit', 'historyLimit']]) if (flags[flag] !== undefined) {
    if (!/^\d+$/.test(flags[flag])) throw Error('invalid_fields');
    input[key] = Number(flags[flag]);
  }
  console.log(JSON.stringify(await callWorkspace(`workspace_reply_${command}`, input, configuration(flags.profile))));
}
