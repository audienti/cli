import { randomUUID } from 'node:crypto';
import { callWorkspace, configuration } from './workspaces.mjs';
import { readFileSync, statSync } from 'node:fs';
import { readJsonFile } from './json-file.mjs';
import { printPaid } from './tools.mjs';

const RECORD_FLAGS = ['workspace', 'profile', 'person', 'evidence', 'label', 'quote', 'reason', 'confidence', 'request-id', 'participation', 'playbook', 'file', 'text', 'text-file', 'direction', 'channel', 'context', 'event', 'retract'];
const SUGGEST_FLAGS = ['workspace', 'profile', 'text', 'text-file', 'direction', 'channel', 'context', 'request-id'];
const TEXT_MAX_BYTES = 16384;
const TEXT_MAX_CHARACTERS = 4000;
const CONTEXT_MAX_CHARACTERS = 2000;
const CORRECT_OK = ['workspace', 'profile', 'person', 'event', 'label', 'quote', 'reason', 'confidence', 'request-id', 'file', 'retract'];
const RECORD_ONLY_OK = ['workspace', 'profile', 'person', 'evidence', 'label', 'quote', 'reason', 'confidence', 'request-id', 'participation', 'file'];

function readText(path) {
 let stat;
 try { stat = statSync(path); } catch { throw Error(`Cannot read the message file ${path}. Check the path and try again.`); }
 if (!stat.isFile() || stat.size > TEXT_MAX_BYTES) throw Error(`The message file must be a regular text file no larger than ${TEXT_MAX_BYTES / 1024} KiB: ${path}`);
 try { return new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path)); } catch { throw Error(`The message file must be UTF-8 text: ${path}`); }
}
/** What the person should do after a call that did not give suggestions, in plain words. The JSON above it is for programs. */
const explain = requestId => result => result?.status === 'rejected'
 ? 'Nothing was charged. The call was not accepted. If the reason above is insufficient_credits, add credits in the app under Settings, then Billing, and run the command again.'
 : `The model did not answer, so there are no suggestions. The charge is not settled yet. Run the same command again with --request-id ${requestId} to check or retry: the same request ID is never charged twice.`;
const money = value => value >= 1 ? value.toFixed(2) : value.toPrecision(2);

/** Suggest labels for a message. Paid: shows the price per million input tokens first, then makes the call. Records nothing. */
async function suggest(flags) {
 if (Object.keys(flags).some(key => !SUGGEST_FLAGS.includes(key))) throw Error('Option does not apply to intent suggest.');
 if ((flags.text === undefined) === (flags['text-file'] === undefined)) throw Error(`Give the message once: --text TEXT or --text-file PATH. ${SUGGEST_USAGE}`);
 if (!flags.channel) throw Error(`--channel is required (for example email or linkedin). ${SUGGEST_USAGE}`);
 const direction = flags.direction ?? 'inbound';
 if (!['inbound', 'outbound'].includes(direction)) throw Error(`--direction must be inbound (a message they sent) or outbound (one we sent). ${SUGGEST_USAGE}`);
 const text = flags.text ?? readText(flags['text-file']);
 if (!text.trim()) throw Error('The message has no words. Give the text of one message.');
 if (Array.from(text).length > TEXT_MAX_CHARACTERS) throw Error(`The message is ${Array.from(text).length} characters; the most is ${TEXT_MAX_CHARACTERS}. Send only the new message, without the quoted thread.`);
 if (flags.context !== undefined && Array.from(flags.context).length > CONTEXT_MAX_CHARACTERS) throw Error(`--context is too long; the most is ${CONTEXT_MAX_CHARACTERS} characters.`);
 const config = configuration(flags.profile);
 const entry = await callWorkspace('tools_get', { workspaceId: flags.workspace, tool: 'audienti.intent.label' }, config);
 const price = entry?.data?.tokenPrice;
 if (!price || typeof price.usd !== 'number') throw Error('Could not read the price of intent suggest. Nothing was charged.');
 process.stderr.write(`Price: ${money(price.credits)} credits (about $${money(price.usd)}) per 1M input tokens. You pay for the tokens measured, so one short message costs a small part of a credit (for example, about ${money(price.credits * 3000 / 1e6)} credits for a 1,000-character message). Output is free. Nothing is recorded.\n`);
 const requestId = flags['request-id'] ?? randomUUID();
 if (!flags['request-id']) process.stderr.write(`request-id: ${requestId}\n`);
 await printPaid('tools_intent_label', { workspaceId: flags.workspace, requestId, input: { text, direction, channel: flags.channel, ...(flags.context ? { context: flags.context } : {}) } }, { profile: flags.profile, explain: explain(requestId) });
}
const SUGGEST_USAGE = 'Use: intent suggest (--text TEXT | --text-file PATH) --channel email|linkedin [--direction inbound|outbound] [--context TEXT] [--request-id UUID] [--workspace ID].';
const USAGE = 'Use intent list [--playbook ID] [--workspace ID], intent suggest (--text TEXT | --text-file PATH) --channel email|linkedin [--direction inbound|outbound] [--context TEXT] [--request-id UUID] [--workspace ID], or intent record --person ID --evidence ID (--label NAME --quote TEXT --reason TEXT [--confidence high|medium|low] | --file LABELS.json) [--request-id UUID] [--participation ID] [--workspace ID], or intent correct --person ID --event ID (--label NAME --quote TEXT --reason TEXT [--confidence high|medium|low] | --file LABEL.json | --retract) [--request-id UUID] [--workspace ID].';

/** Change or withdraw one label of a message. A person only: the server refuses an agent credential with human_only. */
async function correct(flags) {
 if (Object.keys(flags).some(key => !CORRECT_OK.includes(key))) throw Error('Option does not apply to intent correct.');
 if (!flags.person || !flags.event) throw Error(`--person ID and --event ID are required. Read the event ID from replies list or the person history. ${USAGE}`);
 const single = ['label', 'quote', 'reason', 'confidence'].filter(key => flags[key] !== undefined);
 const ways = [flags.retract ? 'retract' : null, flags.file ? 'file' : null, single.length ? 'flags' : null].filter(Boolean);
 if (ways.length !== 1) throw Error(`Give one change: --retract, one label with --label, --quote and --reason, or a label in --file. ${USAGE}`);
 let label;
 if (flags.file) {
  const body = readJsonFile(flags.file, 65536, 'Label file');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('The label file is one JSON object: { "label": "...", "quote": "...", "reason": "...", "result": {...} }.');
  label = body;
 } else if (single.length) {
  if (!flags.label || !flags.quote || !flags.reason) throw Error(`--label, --quote and --reason are required together. ${USAGE}`);
  label = { label: flags.label, quote: flags.quote, reason: flags.reason, ...(flags.confidence ? { confidence: flags.confidence } : {}) };
 }
 console.log(JSON.stringify(await callWorkspace('intent_correct', {
  workspaceId: flags.workspace, prospectId: flags.person, eventId: flags.event, requestId: flags['request-id'] ?? randomUUID(), ...(label ? { label } : { retract: true }),
 }, configuration(flags.profile))));
}

export async function intentCli(args) {
 const flags = {}, positions = [];
 for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--json') continue;
  if (!arg.startsWith('--')) { positions.push(arg); continue; }
  const key = arg.slice(2);
  if (key === 'retract' && !Object.hasOwn(flags, key)) { flags.retract = true; continue; }
  if (!RECORD_FLAGS.includes(key) || key === 'retract' || Object.hasOwn(flags, key) || i + 1 >= args.length) throw Error(`Invalid flag --${key}. ${USAGE}`);
  flags[key] = args[++i];
 }
 const command = positions[1];
 if (positions.length !== 2 || positions[0] !== 'intent' || !['list', 'suggest', 'record', 'correct'].includes(command)) throw Error(USAGE);
 if (command === 'list') {
  if (Object.keys(flags).some(key => !['workspace', 'profile', 'playbook'].includes(key))) throw Error('Option does not apply to intent list.');
  console.log(JSON.stringify(await callWorkspace('intent_labels_list', { workspaceId: flags.workspace, ...(flags.playbook ? { playbookId: flags.playbook } : {}) }, configuration(flags.profile))));
  return;
 }
 if (command === 'suggest') { await suggest(flags); return; }
 if (command === 'correct') { await correct(flags); return; }
 if (Object.keys(flags).some(key => !RECORD_ONLY_OK.includes(key))) throw Error('Option does not apply to intent record.');
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
