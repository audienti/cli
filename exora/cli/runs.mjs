import { callWorkspace, configuration } from './workspaces.mjs';
export async function runsCli(args) {
 const flags = {}, positions = [];
 for (let i = 1; i < args.length; i++) {
  if (args[i] === '--json') continue;
  if (!args[i].startsWith('--')) { positions.push(args[i]); continue; }
  const key = args[i].slice(2);
  if (!['workspace', 'profile', 'agent', 'status', 'cursor-at', 'cursor-id'].includes(key) || Object.hasOwn(flags, key) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error(`Invalid Runs option --${key}.`);
  flags[key] = args[++i];
 }
 if (positions.length > 1 || positions.length === 1 && positions[0] !== 'list') throw Error('Use runs [list] [--workspace ID] [--agent ID] [--status all|running|done|failed].');
 if (Boolean(flags['cursor-at']) !== Boolean(flags['cursor-id'])) throw Error('Supply both --cursor-at and --cursor-id.');
 const input = { workspaceId: flags.workspace, ...(flags.agent ? { agent: flags.agent } : {}), ...(flags.status ? { status: flags.status } : {}), ...(flags['cursor-at'] ? { cursorAt: flags['cursor-at'], cursorId: flags['cursor-id'] } : {}) };
 console.log(JSON.stringify(await callWorkspace('workspace_runs_list', input, configuration(flags.profile))));
}
