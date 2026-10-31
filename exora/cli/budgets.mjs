import { callWorkspace, configuration } from './workspaces.mjs';
const cap = (name, value) => {
 if (value === 'none' || value === 'unlimited') return null;
 if (!/^\d+$/.test(value ?? '')) throw Error(`--${name} needs a whole number of credits, or "none" for no cap.`);
 return Number(value);
};
export async function budgetsCli(args) {
 const flags = {}, positions = [];
 for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--json') continue;
  if (!arg.startsWith('--')) { positions.push(arg); continue; }
  const key = arg.slice(2);
  if (!['workspace', 'profile', 'agent', 'cap', 'new-agent-cap', 'at-limit', 'alert80', 'limit'].includes(key) || Object.hasOwn(flags, key) || i + 1 >= args.length) throw Error(`Invalid flag --${key}.`);
  flags[key] = args[++i];
 }
 if (positions.length !== 2 || positions[0] !== 'budgets' || !['show', 'set', 'alerts'].includes(positions[1])) throw Error('Use budgets show|set|alerts --workspace ID. See audienti help.');
 const input = { workspaceId: flags.workspace };
 let name = 'workspace_budgets_get';
 if (positions[1] === 'alerts') {
  name = 'workspace_budget_alerts';
  if (flags.limit !== undefined) { if (!/^\d+$/.test(flags.limit) || Number(flags.limit) < 1 || Number(flags.limit) > 200) throw Error('--limit is a whole number from 1 to 200.'); input.limit = Number(flags.limit); }
 }
 if (positions[1] === 'set') {
  name = 'workspace_budgets_set';
  if ((flags.agent === undefined) !== (flags.cap === undefined)) throw Error('--agent and --cap go together.');
  if (flags.agent) input.agentCaps = [{ agentId: flags.agent, monthlyCap: cap('cap', flags.cap) }];
  if (flags['new-agent-cap'] !== undefined) input.newAgentCap = cap('new-agent-cap', flags['new-agent-cap']);
  if (flags['at-limit'] !== undefined) { if (!['pause', 'ask'].includes(flags['at-limit'])) throw Error('--at-limit is pause or ask.'); input.atLimit = flags['at-limit']; }
  if (flags.alert80 !== undefined) { if (!['on', 'off'].includes(flags.alert80)) throw Error('--alert80 is on or off.'); input.alert80 = flags.alert80 === 'on'; }
  if (Object.keys(input).length < 2) throw Error('Nothing to change. Use --agent ID --cap N, --new-agent-cap N, --at-limit pause|ask or --alert80 on|off.');
 }
 console.log(JSON.stringify(await callWorkspace(name, input, configuration(flags.profile))));
}
