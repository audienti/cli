import { callWorkspace, configuration } from './workspaces.mjs';

/** secret get NAME prints the value alone (so $(audienti secret get NAME) works); secret list prints names. --json prints the API answer. */
export async function secretsCli(args) {
 const flags = {}, positions = [];
 let json = false;
 for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--json') { json = true; continue; }
  if (!arg.startsWith('--')) { positions.push(arg); continue; }
  const key = arg.slice(2);
  if (!['workspace', 'profile'].includes(key) || Object.hasOwn(flags, key) || i + 1 >= args.length) throw Error(`Invalid flag --${key}.`);
  flags[key] = args[++i];
 }
 const usage = 'Use secret list [--workspace ID] or secret get NAME [--workspace ID] [--json].';
 if (positions[0] !== 'secret' && positions[0] !== 'secrets') throw Error(usage);
 const input = { workspaceId: flags.workspace }, config = configuration(flags.profile);
 if (positions[1] === 'list' && positions.length === 2) {
  const result = await callWorkspace('workspace_secret_list', input, config);
  if (json) { console.log(JSON.stringify(result)); return; }
  for (const secret of result.data.secrets) console.log(secret.name);
  return;
 }
 if (positions[1] === 'get' && positions.length === 3) {
  const result = await callWorkspace('workspace_secret_get', { ...input, name: positions[2] }, config);
  if (json) console.log(JSON.stringify(result)); else console.log(result.data.value);
  return;
 }
 throw Error(usage);
}
