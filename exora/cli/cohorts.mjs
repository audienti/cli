import { callWorkspace, configuration } from './workspaces.mjs';

const cell = value => { const text = String(value ?? ''); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
const csv = rows => rows.map(row => row.map(cell).join(',')).join('\n') + '\n';
const share = value => value === null || value === undefined ? '' : `${(value * 100).toFixed(1)}%`;

/** One row per entry week: cohort size, then the share that reached the stage by each week since entry. */
export function cohortsCsv(data) {
 const weeks = Array.from({ length: (data.horizon ?? 0) + 1 }, (_, i) => `week_${i}`);
 return csv([['cohort_week', 'people', ...weeks], ...(data.weeks ?? []).map(row => [row.weekStart, row.size, ...row.share.map(share)])]);
}
export function agingCsv(data) {
 return csv([['stage', 'people', 'median_days', 'p90_days', 'oldest_days', `over_${data.thresholdDays}_days`], ...(data.stages ?? []).map(row => [row.name, row.count, row.medianDays ?? '', row.p90Days ?? '', row.oldestDays ?? '', row.overThreshold])]);
}

const FLAGS = { workspace: null, profile: null, format: null, campaign: 'campaignId', owner: 'ownerUserId', offer: 'offerId', audience: 'audienceId', tag: 'tag', stage: 'stage', cohorts: 'cohorts', horizon: 'horizon', 'threshold-days': 'thresholdDays' };
const NUMBERS = new Set(['cohorts', 'horizon', 'threshold-days']);
const ALLOWED = { cohorts: ['campaign', 'owner', 'offer', 'audience', 'tag', 'stage', 'cohorts', 'horizon'], aging: ['campaign', 'owner', 'offer', 'audience', 'tag', 'threshold-days'], filters: [] };
const TOOLS = { cohorts: 'workspace_analytics_cohorts', aging: 'workspace_stage_aging', filters: 'workspace_analytics_filters' };
const USAGE = 'Use analytics cohorts|aging|filters [--workspace ID] [--campaign ID] [--owner ID] [--offer ID] [--audience ID] [--tag TAG] [cohorts: --stage goal|KEY --cohorts N --horizon N] [aging: --threshold-days N] [--format json|csv].';

export async function cohortCli(args) {
 const flags = {}, positions = [];
 for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--json') continue;
  if (!arg.startsWith('--')) { positions.push(arg); continue; }
  const key = arg.slice(2);
  if (!Object.hasOwn(FLAGS, key) || Object.hasOwn(flags, key) || i + 1 >= args.length) throw Error(`Invalid flag --${key}.`);
  flags[key] = args[++i];
 }
 const kind = positions[1];
 if (positions.length !== 2 || !TOOLS[kind]) throw Error(USAGE);
 const input = { workspaceId: flags.workspace };
 for (const [key, value] of Object.entries(flags)) {
  if (['workspace', 'profile', 'format'].includes(key)) continue;
  if (!ALLOWED[kind].includes(key)) throw Error(`--${key} does not apply to analytics ${kind}.`);
  if (NUMBERS.has(key)) { if (!/^\d+$/.test(value)) throw Error(`--${key} must be a whole number.`); input[FLAGS[key]] = Number(value); } else input[FLAGS[key]] = value;
 }
 if (flags.format && !['json', 'csv'].includes(flags.format)) throw Error('--format must be json or csv.');
 if (flags.format === 'csv' && kind === 'filters') throw Error('--format csv applies to analytics cohorts and aging.');
 const result = await callWorkspace(TOOLS[kind], input, configuration(flags.profile));
 if (flags.format === 'csv') { const data = result?.data ?? result; process.stdout.write(kind === 'cohorts' ? cohortsCsv(data) : agingCsv(data)); return; }
 console.log(JSON.stringify(result));
}
