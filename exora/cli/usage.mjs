import { callWorkspace, configuration } from './workspaces.mjs';

const PERIODS = { month: 'month', '7d': '7d', '30d': '30d', '90d': '90d' };
const DIMENSIONS = ['tool', 'provider', 'model', 'caller', 'day'];
const PICO_PER_CREDIT = 10_000_000_000n;
const cell = value => { const text = String(value); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
export function credits(amount) {
 const value = BigInt(amount), whole = value / PICO_PER_CREDIT, fraction = (value % PICO_PER_CREDIT).toString().padStart(10, '0').replace(/0+$/, '');
 return fraction ? `${whole}.${fraction}` : String(whole);
}
const percent = share => `${(share * 100).toFixed(1)}%`;
/** Rows for one dimension: a label, calls, credits and share of the period total. */
export function breakdownRows(data, by) {
 if (by === 'day') return (data.daily ?? []).map(row => [row.day, row.calls, credits(row.charged), '']);
 const items = { tool: data.byTool, provider: data.byProvider, model: data.byModel, caller: data.byCaller }[by] ?? [];
 const name = row => by === 'tool' ? row.tool : by === 'provider' ? row.provider : by === 'model' ? row.model ?? 'Not recorded' : [row.owner, row.keyName, row.agentName].filter(Boolean).join(' / ');
 return items.map(row => [name(row), row.calls, credits(row.charged), percent(row.share)]);
}
export function breakdownCsv(data, by) {
 return [[by, 'calls', 'credits', 'share'], ...breakdownRows(data, by)].map(row => row.map(cell).join(',')).join('\n') + '\n';
}
export async function usageCli(args) {
 const flags = {}, positions = [];
 for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--json') continue;
  if (!arg.startsWith('--')) { positions.push(arg); continue; }
  const key = arg.slice(2);
  if (!['workspace', 'profile', 'since', 'by', 'format'].includes(key) || Object.hasOwn(flags, key) || i + 1 >= args.length) throw Error(`Invalid flag --${key}.`);
  flags[key] = args[++i];
 }
 if (positions.length !== 2 || positions[1] !== 'breakdown') throw Error('Use usage breakdown [--workspace ID] [--since month|7d|30d|90d] [--by tool|provider|model|caller|day] [--format json|csv].');
 if (flags.since && !PERIODS[flags.since]) throw Error('--since must be month, 7d, 30d or 90d.');
 if (flags.by && !DIMENSIONS.includes(flags.by)) throw Error('--by must be tool, provider, model, caller or day.');
 if (flags.format && !['json', 'csv'].includes(flags.format)) throw Error('--format must be json or csv.');
 const input = { workspaceId: flags.workspace };
 if (flags.since) input.period = PERIODS[flags.since];
 const result = await callWorkspace('workspace_usage_breakdown', input, configuration(flags.profile));
 if (flags.format === 'csv') { process.stdout.write(breakdownCsv(result?.data ?? result, flags.by ?? 'tool')); return; }
 console.log(JSON.stringify(result));
}
