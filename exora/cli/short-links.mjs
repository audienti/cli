import { callWorkspace, configuration } from './workspaces.mjs';

export async function shortLinksCli(args) {
  const flags = {}, positions = [];
  const allowed = ['workspace', 'profile', 'cursor', 'limit', 'search', 'type', 'link', 'destination', 'sharing', 'recipient-prospect', 'campaign', 'campaign-revision', 'message-reference'];
  const repeatable = new Set(['type']);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--json') continue;
    if (!arg.startsWith('--')) { positions.push(arg); continue; }
    const key = arg.slice(2);
    if (!allowed.includes(key) || (!repeatable.has(key) && Object.hasOwn(flags, key)) || args[i + 1] === undefined || args[i + 1].startsWith('--')) throw Error('Unknown, repeated or incomplete short-links option.');
    const value = args[++i];
    flags[key] = repeatable.has(key) ? [...(flags[key] ?? []), value] : value;
  }
  if (positions.length !== 2 || positions[0] !== 'short-links' || !['list', 'create', 'clicks'].includes(positions[1])) throw Error('Use audienti short-links list|create|clicks --workspace ID.');
  const command = positions[1];
  if (command === 'create' && flags.type?.length > 1) throw Error('Short-link creation accepts one --type; repeat --type only for list filters.');
  const input = { workspaceId: flags.workspace };
  if (command === 'list') Object.assign(input, { ...(flags.search ? { search: flags.search } : {}), ...(flags.type ? { targetKinds: flags.type } : {}), ...(flags.cursor ? { cursor: flags.cursor } : {}), ...(flags.limit === undefined ? {} : { limit: Number(flags.limit) }) });
  else if (command === 'clicks') Object.assign(input, { shortLinkId: flags.link, ...(flags.cursor ? { cursor: flags.cursor } : {}), ...(flags.limit === undefined ? {} : { limit: Number(flags.limit) }) });
  else Object.assign(input, { destinationUrl: flags.destination, ...(flags.type?.[0] ? { targetKind: flags.type[0] } : {}), ...(flags.sharing ? { sharingMode: flags.sharing } : {}), ...(flags['recipient-prospect'] ? { recipientProspectId: flags['recipient-prospect'] } : {}), ...(flags.campaign ? { campaignId: flags.campaign } : {}), ...(flags['campaign-revision'] === undefined ? {} : { campaignRevision: Number(flags['campaign-revision']) }), ...(flags['message-reference'] ? { messageReference: flags['message-reference'] } : {}) });
  const operation = command === 'list' ? 'short_link_list' : command === 'clicks' ? 'short_link_requests' : 'short_link_create';
  console.log(JSON.stringify(await callWorkspace(operation, input, configuration(flags.profile))));
}
