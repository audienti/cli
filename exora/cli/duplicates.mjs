import { callWorkspace, configuration } from './workspaces.mjs';
// audienti prospects duplicates list | get ID | merge ID [--primary PROFILE_ID | --keep-both] | dismiss ID   (all with --workspace ID)
export async function duplicatesCli(args) {
  const flags = {}, positions = [], allowed = ['workspace', 'profile', 'primary'];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') continue;
    if (arg === '--keep-both') { if (Object.hasOwn(flags, 'keepBoth')) throw Error('Unknown, repeated or incomplete duplicates option.'); flags.keepBoth = true; continue; }
    if (!arg.startsWith('--')) { positions.push(arg); continue; }
    const key = arg.slice(2);
    if (!allowed.includes(key) || Object.hasOwn(flags, key) || args[i + 1] === undefined || args[i + 1].startsWith('--')) throw Error('Unknown, repeated or incomplete duplicates option.');
    flags[key] = args[++i];
  }
  const verb = positions[2];
  const usage = 'Use prospects duplicates list --workspace ID, or prospects duplicates get|merge|dismiss PERSON --workspace ID [--primary PROFILE_ID | --keep-both].';
  if (positions[0] !== 'prospects' || positions[1] !== 'duplicates' || !['list', 'get', 'merge', 'dismiss'].includes(verb) || positions.length !== (verb === 'list' ? 3 : 4)) throw Error(usage);
  if ((flags.primary !== undefined || flags.keepBoth) && verb !== 'merge') throw Error('--primary and --keep-both apply to merge only.');
  if (flags.primary !== undefined && flags.keepBoth) throw Error('Use --primary or --keep-both, not both.');
  const tool = { list: 'workspace_possible_duplicates', get: 'workspace_prospect_duplicate', merge: 'workspace_prospect_duplicate_merge', dismiss: 'workspace_prospect_duplicate_dismiss' }[verb];
  const input = { workspaceId: flags.workspace, ...(verb === 'list' ? {} : { prospectId: positions[3] }), ...(flags.primary === undefined ? {} : { primaryProfileId: flags.primary }), ...(flags.keepBoth ? { keepBoth: true } : {}) };
  console.log(JSON.stringify(await callWorkspace(tool, input, configuration(flags.profile))));
}
