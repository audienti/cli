import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { callWorkspace, configuration } from './workspaces.mjs';
export async function guardrailsCli(args) {
 const flags = {}, positions = [];
 for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--json') continue;
  if (!arg.startsWith('--')) { positions.push(arg); continue; }
  const key = arg.slice(2);
  if (!['workspace', 'profile', 'file', 'output'].includes(key) || Object.hasOwn(flags, key) || i + 1 >= args.length) throw Error(`Invalid flag --${key}.`);
  flags[key] = args[++i];
 }
 const [group, verb, value] = positions;
 const input = { workspaceId: flags.workspace };
 let name, expected = 2;
 if (group === 'guardrails' && verb === 'show') name = 'workspace_guardrails_get';
 else if (group === 'guardrails' && verb === 'pause') name = 'workspace_guardrails_pause';
 else if (group === 'guardrails' && verb === 'resume') name = 'workspace_guardrails_resume';
 else if (group === 'dnc' && verb === 'list') name = 'workspace_guardrails_get';
 else if (group === 'dnc' && (verb === 'add' || verb === 'remove')) { name = 'workspace_do_not_contact_update'; expected = 3; input[verb] = [value]; }
 else if (group === 'dnc' && verb === 'import') {
  name = 'workspace_do_not_contact_import'; expected = 2;
  if (!flags.file) throw Error('dnc import needs --file LIST.csv.');
  if (statSync(flags.file).size > 400000) throw Error('The CSV is larger than 400,000 characters. Split it into files of at most 5,000 rows.');
  input.csv = readFileSync(flags.file, 'utf8');
 }
 else if (group === 'dnc' && verb === 'export') name = 'workspace_do_not_contact_export';
 else throw Error('Use guardrails show|pause|resume or dnc list|add|remove VALUE|import --file LIST.csv|export [--output FILE.csv] --workspace ID.');
 if (positions.length !== expected) throw Error('Wrong number of arguments. Use audienti help.');
 const result = await callWorkspace(name, input, configuration(flags.profile));
 if (group === 'dnc' && verb === 'export') {
  const csv = (result?.data ?? result)?.csv ?? '';
  if (flags.output) { writeFileSync(flags.output, csv); console.log(JSON.stringify({ data: { file: flags.output, count: (result?.data ?? result)?.count ?? 0 } })); } else process.stdout.write(csv);
  return;
 }
 console.log(JSON.stringify(group === 'dnc' && verb === 'list' ? { data: result.data?.doNotContact ?? result.doNotContact ?? result } : result));
}
