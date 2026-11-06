import { callWorkspace, configuration } from './workspaces.mjs';

export async function intentCli(args) {
 const flags = {}, positions = [];
 for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--json') continue;
  if (!arg.startsWith('--')) { positions.push(arg); continue; }
  const key = arg.slice(2);
  if (!['workspace', 'profile'].includes(key) || Object.hasOwn(flags, key) || i + 1 >= args.length) throw Error(`Invalid flag --${key}.`);
  flags[key] = args[++i];
 }
 if (positions.length !== 2 || positions[1] !== 'list') throw Error('Use intent list [--workspace ID].');
 console.log(JSON.stringify(await callWorkspace('intent_labels_list', { workspaceId: flags.workspace }, configuration(flags.profile))));
}
