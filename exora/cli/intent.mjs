import { randomUUID } from 'node:crypto';
import { callWorkspace, configuration } from './workspaces.mjs';
import { readJsonFile } from './json-file.mjs';

const RECORD_FLAGS = ['workspace', 'profile', 'person', 'evidence', 'label', 'quote', 'reason', 'confidence', 'request-id', 'participation', 'file'];
const USAGE = 'Use intent list [--workspace ID], or intent record --person ID --evidence ID (--label NAME --quote TEXT --reason TEXT [--confidence high|medium|low] | --file LABELS.json) [--request-id UUID] [--participation ID] [--workspace ID].';

export async function intentCli(args) {
 const flags = {}, positions = [];
 for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--json') continue;
  if (!arg.startsWith('--')) { positions.push(arg); continue; }
  const key = arg.slice(2);
  if (!RECORD_FLAGS.includes(key) || Object.hasOwn(flags, key) || i + 1 >= args.length) throw Error(`Invalid flag --${key}. ${USAGE}`);
  flags[key] = args[++i];
 }
 const command = positions[1];
 if (positions.length !== 2 || positions[0] !== 'intent' || !['list', 'record'].includes(command)) throw Error(USAGE);
 if (command === 'list') {
  if (Object.keys(flags).some(key => !['workspace', 'profile'].includes(key))) throw Error('Option does not apply to intent list.');
  console.log(JSON.stringify(await callWorkspace('intent_labels_list', { workspaceId: flags.workspace }, configuration(flags.profile))));
  return;
 }
 if (!flags.person || !flags.evidence) throw Error(`--person ID and --evidence ID are required. ${USAGE}`);
 const single = ['label', 'quote', 'reason', 'confidence'].filter(key => flags[key] !== undefined);
 if (flags.file && single.length) throw Error('Give the labels in --file, or one label with --label, --quote and --reason. Not both.');
 let labels, requestId = flags['request-id'];
 if (flags.file) {
  const body = readJsonFile(flags.file, 65536, 'Labels file');
  if (Array.isArray(body)) labels = body;
  else if (body && typeof body === 'object' && Array.isArray(body.labels) && Object.keys(body).every(key => ['labels', 'requestId'].includes(key))) { labels = body.labels; requestId ??= body.requestId; }
  else throw Error('The labels file is a JSON array of labels, or { "labels": [...] }.');
 } else {
  if (!flags.label || !flags.quote || !flags.reason) throw Error(`--label, --quote and --reason are required without --file. ${USAGE}`);
  labels = [{ label: flags.label, quote: flags.quote, reason: flags.reason, ...(flags.confidence ? { confidence: flags.confidence } : {}) }];
 }
 console.log(JSON.stringify(await callWorkspace('intent_record', {
  workspaceId: flags.workspace, prospectId: flags.person, evidenceId: flags.evidence, requestId: requestId ?? randomUUID(),
  ...(flags.participation ? { participationId: flags.participation } : {}), labels,
 }, configuration(flags.profile))));
}
