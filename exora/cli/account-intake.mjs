import { readFileSync } from 'node:fs';
import { callWorkspace, configuration } from './workspaces.mjs';
export async function accountIntakeCli(args) {
  const flags = {}, positions = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]; if (arg === '--json') continue;
    if (!arg.startsWith('--')) { positions.push(arg); continue; }
    const key = arg.slice(2);
    if (!['workspace', 'profile', 'file', 'cursor', 'limit'].includes(key) || Object.hasOwn(flags, key) || !args[i+1] || args[i+1].startsWith('--')) throw Error('Unknown, repeated or incomplete intake option.');
    flags[key] = args[++i];
  }
  const intake = positions[1] === 'intake';
  const command = intake ? 'intake' : positions[2];
  if (positions[0] !== 'prospects' || (!intake && positions[1] !== 'conversation') || !['intake', 'append', 'list'].includes(command) || positions.length !== (intake ? 2 : 4)) throw Error('Use prospects intake or prospects conversation append|list PERSON --workspace ID.');
  const allowed = ['workspace', 'profile', ...(command === 'list' ? ['cursor', 'limit'] : ['file'])];
  if (Object.keys(flags).some(k => !allowed.includes(k))) throw Error('Option does not apply to this intake command.');
  let input = {};
  if (command !== 'list') {
    if (!flags.file) throw Error('--file INPUT.json is required.');
    let raw; try { raw = readFileSync(flags.file); } catch { throw Error('Could not read the intake input file.'); }
    if (raw.length > 65536) throw Error('payload_too_large');
    try { input = JSON.parse(raw.toString('utf8')); } catch { throw Error('validation_error'); }
    if (!input || typeof input !== 'object' || Array.isArray(input) || ['workspaceId', 'prospectId'].some(k => Object.hasOwn(input, k))) throw Error('invalid_fields');
  }
  input.workspaceId = flags.workspace;
  if (!intake) input.prospectId = positions[3];
  if (flags.cursor !== undefined) input.cursor = flags.cursor;
  if (flags.limit !== undefined) {
    if (!/^\d+$/.test(flags.limit)) throw Error('invalid_fields');
    input.limit = Number(flags.limit);
  }
  console.log(JSON.stringify(await callWorkspace({ intake: 'workspace_prospect_intake', append: 'workspace_conversation_append', list: 'workspace_conversation_list' }[command], input, configuration(flags.profile))));
}
