import { parseArgs } from 'node:util';
import { callWorkspace, configuration } from './workspaces.mjs';
import { readJsonFile } from './json-file.mjs';
const help = `Usage:
  audienti topics create --input FILE --request-id UUID [--workspace UUID]
  audienti topics list [--cursor UUID]
  audienti topics get UUID
  audienti posts list [--topic-id UUID] [--cursor UUID]
  audienti posts get UUID

Topic input: {"name":"Topic name","slug":"optional-slug","description":"optional"}.
These commands read saved records or create a topic; they do not call a paid provider.
Retrieve fresh data with audienti tools posts.fetch|posts.search|posts.comments|posts.reactions|profiles.posts.
Use audienti tools describe NAME --json for the exact contract.
All commands accept --profile PATH, --workspace UUID and --json.`;
export async function contentCli(argv) {
  const [kind] = argv;
  const { positionals, values } = parseArgs({ args: argv.slice(1), allowPositionals: true, strict: true, options: { help: { type: 'boolean', short: 'h' }, json: { type: 'boolean' }, input: { type: 'string' }, 'request-id': { type: 'string' }, workspace: { type: 'string' }, profile: { type: 'string' }, cursor: { type: 'string' }, 'topic-id': { type: 'string' } } });
  if (values.help || !positionals.length) { console.log(help); return; }
  const [verb, id] = positionals;
  let args = values.workspace ? { workspaceId: values.workspace } : {};
  if (verb === 'list' && positionals.length === 1) args = { ...args, cursor: values.cursor, ...(kind === 'posts' ? { topicId: values['topic-id'] } : {}) };
  else if (verb === 'get' && positionals.length === 2) args.id = id;
  else if (kind === 'topics' && verb === 'create' && positionals.length === 1) {
    if (!values.input || !values['request-id']) throw new Error('Topic create requires --input FILE and --request-id UUID.');
    args = { ...readJsonFile(values.input, 32768, 'Topic input'), ...args, requestId: values['request-id'] };
  } else throw new Error('Unknown content command. Use --help.');
  console.log(JSON.stringify(await callWorkspace(`${kind}_${verb}`, args, configuration(values.profile))));
}
