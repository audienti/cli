import { randomUUID } from 'node:crypto';
import { callWorkspace, configuration } from './workspaces.mjs';
import { readJsonFile } from './json-file.mjs';

const FLAGS = ['workspace', 'profile', 'state', 'person', 'participation', 'limit', 'reason', 'request-id', 'recommended', 'option', 'file'];
const USAGE = 'Use decision list [--state open|decided|all] [--person ID] [--participation ID] [--limit N], decision options ID, decision ask --participation ID [--reason TEXT] [--request-id UUID], decision prepare ID (--recommended OPTION_ID --option OPTION_ID=ANALYSIS ... | --file PREPARE.json) [--request-id UUID], or decision answer ID --option OPTION_ID. Add --workspace ID to any of them.';

export async function decisionCli(args) {
 const flags = {}, many = [], positions = [];
 for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--json') continue;
  if (!arg.startsWith('--')) { positions.push(arg); continue; }
  const key = arg.slice(2);
  if (!FLAGS.includes(key) || (key !== 'option' && Object.hasOwn(flags, key)) || i + 1 >= args.length) throw Error(`Invalid flag --${key}. ${USAGE}`);
  if (key === 'option') many.push(args[++i]); else flags[key] = args[++i];
 }
 const [, command, id] = positions;
 const call = async (name, input) => console.log(JSON.stringify(await callWorkspace(name, { workspaceId: flags.workspace, ...input }, configuration(flags.profile))));
 const only = (...allowed) => { const bad = Object.keys(flags).find(key => !['workspace', 'profile', ...allowed].includes(key)); if (bad || (many.length && !allowed.includes('option'))) throw Error(`Option does not apply to decision ${command}. ${USAGE}`); };
 if (positions[0] !== 'decision' || !['list', 'options', 'ask', 'prepare', 'answer'].includes(command)) throw Error(USAGE);
 if (command === 'list') {
  only('state', 'person', 'participation', 'limit');
  if (positions.length !== 2) throw Error(USAGE);
  return call('decision_list', { ...(flags.state ? { state: flags.state } : {}), ...(flags.person ? { prospectId: flags.person } : {}), ...(flags.participation ? { participationId: flags.participation } : {}), ...(flags.limit ? { limit: Number(flags.limit) } : {}) });
 }
 if (command === 'ask') {
  only('participation', 'reason', 'request-id');
  if (positions.length !== 2 || !flags.participation) throw Error(`--participation ID is required. ${USAGE}`);
  return call('decision_ask', { participationId: flags.participation, requestId: flags['request-id'] ?? randomUUID(), ...(flags.reason ? { reason: flags.reason } : {}) });
 }
 if (positions.length !== 3 || !id) throw Error(`Give the decision ID. ${USAGE}`);
 if (command === 'options') { only(); return call('decision_get', { decisionId: id }); }
 if (command === 'answer') {
  only('option');
  if (many.length !== 1) throw Error(`Give the option once: --option OPTION_ID. ${USAGE}`);
  return call('decision_answer', { decisionId: id, option: many[0] });
 }
 only('recommended', 'option', 'file', 'request-id');
 let body;
 if (flags.file) {
  if (many.length || flags.recommended) throw Error('Give the options in --file, or with --recommended and --option. Not both.');
  body = readJsonFile(flags.file, 65536, 'Prepare file');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('The prepare file is { "recommended": "OPTION_ID", "options": [{ "id": "OPTION_ID", "analysis": "One plain line." }] }.');
 } else {
  if (!flags.recommended || !many.length) throw Error(`--recommended OPTION_ID and at least two --option OPTION_ID=ANALYSIS are required without --file. ${USAGE}`);
  body = { recommended: flags.recommended, options: many.map(item => { const at = item.indexOf('='); if (at < 1) throw Error(`--option takes OPTION_ID=ANALYSIS, and "${item}" has no "=".`); return { id: item.slice(0, at), analysis: item.slice(at + 1) }; }) };
 }
 const { requestId, ...rest } = body;
 return call('decision_prepare', { decisionId: id, requestId: flags['request-id'] ?? requestId ?? randomUUID(), ...rest });
}
