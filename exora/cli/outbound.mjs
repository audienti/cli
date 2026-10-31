import { callWorkspace, configuration } from './workspaces.mjs';

const DAY = 86_400_000;
const cell = value => { const text = String(value ?? ''); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
const csv = rows => rows.map(row => row.map(cell).join(',')).join('\n') + '\n';
const rate = value => value === null || value === undefined ? '' : `${(value * 100).toFixed(1)}%`;
const OUTCOME_HEAD = ['attempts', 'succeeded', 'failed', 'uncertain', 'awaiting_outcome', 'success_rate'];
const outcomeCells = row => [row.total, row.succeeded, row.failed, row.unknown, row.started, rate(row.successRate)];
const ACTIVITY_HEAD = ['plans_proposed', 'actions_approved', 'approvals_withdrawn', 'actions_started', 'outcomes_reported'];

/** CSV rows for one grouping of the outbound metrics. */
export function outboundCsv(data, by) {
 if (by === 'day') return csv([['day', ...OUTCOME_HEAD], ...(data.daily ?? []).map(row => [row.day, ...outcomeCells(row)])]);
 if (by === 'action') return csv([['action', ...OUTCOME_HEAD], ...(data.byAction ?? []).map(row => [row.actionType, ...outcomeCells(row)])]);
 return csv([['sender', 'provider', 'owner', ...OUTCOME_HEAD], ...(data.bySender ?? []).map(row => [row.account, row.provider, row.owner, ...outcomeCells(row)])]);
}
/** CSV rows for people and agents, one table with a kind column. */
export function activityCsv(data) {
 const line = (kind, row, owner) => [kind, row.name, owner ?? '', ...ACTIVITY_HEAD.map(key => row[key]), row.total];
 return csv([['kind', 'name', 'owner', ...ACTIVITY_HEAD, 'total'], ...(data.people ?? []).map(row => line('person', row)), ...(data.agents ?? []).map(row => line('agent', row, row.owner))]);
}

function window(flags, now = new Date()) {
 if (flags.days && (flags.from || flags.to)) throw Error('Use --days or --from and --to, not both.');
 const out = {};
 if (flags.days) {
  if (!/^\d+$/.test(flags.days) || Number(flags.days) < 1 || Number(flags.days) > 365) throw Error('--days must be a whole number from 1 to 365.');
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  out.from = new Date(today - (Number(flags.days) - 1) * DAY).toISOString(); out.to = now.toISOString();
 }
 for (const key of ['from', 'to']) if (flags[key]) { if (Number.isNaN(Date.parse(flags[key]))) throw Error(`--${key} must be an ISO date or time.`); out[key] = new Date(flags[key]).toISOString(); }
 return out;
}

const USAGE = 'Use analytics outbound|activity [--workspace ID] [--days N | --from ISO --to ISO] [--by sender|action|day] [--format json|csv].';
export async function outboundCli(args) {
 const flags = {}, positions = [];
 for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--json') continue;
  if (!arg.startsWith('--')) { positions.push(arg); continue; }
  const key = arg.slice(2);
  if (!['workspace', 'profile', 'days', 'from', 'to', 'by', 'format'].includes(key) || Object.hasOwn(flags, key) || i + 1 >= args.length) throw Error(`Invalid flag --${key}.`);
  flags[key] = args[++i];
 }
 const kind = positions[1];
 if (positions.length !== 2 || !['outbound', 'activity'].includes(kind)) throw Error(USAGE);
 if (flags.by && (kind === 'activity' || !['sender', 'action', 'day'].includes(flags.by))) throw Error('--by sender, action or day applies to analytics outbound only.');
 if (flags.format && !['json', 'csv'].includes(flags.format)) throw Error('--format must be json or csv.');
 const input = { workspaceId: flags.workspace, ...window(flags) };
 const result = await callWorkspace(kind === 'outbound' ? 'workspace_outbound_metrics' : 'workspace_activity_metrics', input, configuration(flags.profile));
 if (flags.format === 'csv') { const data = result?.data ?? result; process.stdout.write(kind === 'outbound' ? outboundCsv(data, flags.by ?? 'sender') : activityCsv(data)); return; }
 console.log(JSON.stringify(result));
}
