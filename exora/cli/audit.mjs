import { callWorkspace, configuration } from './workspaces.mjs';

const UNITS = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
export function sinceToIso(value, now = Date.now()) {
 const match = /^(\d{1,4})([mhdw])$/.exec(value);
 if (match) return new Date(now - Number(match[1]) * UNITS[match[2]]).toISOString();
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) throw Error('--since must look like 7d, 12h or an ISO date.');
 return date.toISOString();
}
const cell = value => /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
export function auditCsv(items) {
 const rows = items.map(item => [item.at, item.actor?.kind ?? '', item.actor?.name ?? '', item.category, item.action, item.summary, item.object?.label ?? '', item.object?.href ?? '']);
 return [['when', 'actor_kind', 'actor', 'category', 'action', 'summary', 'object', 'link'], ...rows].map(row => row.map(cell).join(',')).join('\n') + '\n';
}
export async function auditCli(args) {
 const flags = {}, positions = [];
 for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--json') continue;
  if (!arg.startsWith('--')) { positions.push(arg); continue; }
  const key = arg.slice(2);
  if (!['workspace', 'profile', 'since', 'until', 'actor', 'category', 'limit', 'cursor', 'format'].includes(key) || Object.hasOwn(flags, key) || i + 1 >= args.length) throw Error(`Invalid flag --${key}.`);
  flags[key] = args[++i];
 }
 if (positions.length !== 2 || positions[1] !== 'list') throw Error('Use audit list [--workspace ID] [--since 7d] [--actor agent|person] [--format json|csv].');
 if (flags.actor && !['agent', 'person'].includes(flags.actor)) throw Error('--actor must be agent or person.');
 if (flags.format && !['json', 'csv'].includes(flags.format)) throw Error('--format must be json or csv.');
 const input = { workspaceId: flags.workspace };
 if (flags.actor) input.actor = flags.actor;
 if (flags.category) input.category = flags.category;
 if (flags.since) input.since = sinceToIso(flags.since);
 if (flags.until) input.until = sinceToIso(flags.until);
 if (flags.cursor) input.cursor = flags.cursor;
 if (flags.limit) { input.limit = Number(flags.limit); if (!Number.isInteger(input.limit)) throw Error('--limit must be a whole number.'); }
 const result = await callWorkspace('workspace_audit_log_list', input, configuration(flags.profile));
 if (flags.format === 'csv') { process.stdout.write(auditCsv((result?.data ?? result)?.items ?? [])); return; }
 console.log(JSON.stringify(result));
}
