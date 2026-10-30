import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SKILL_VERSION, helperContracts } from '../skills/audienti/scripts/contracts.mjs';
import { executeHelperFile } from '../skills/audienti/scripts/run.mjs';

const root = new URL('../skills/audienti/', import.meta.url);
const files = ['SKILL.md', 'references/profile-workflows.md', 'references/helpers.md', 'references/workflow-receipt.md', 'scripts/contracts.mjs', 'scripts/profile-helpers.mjs', 'scripts/run.mjs'];

function readSkill(id = 'audienti') {
  if (id !== 'audienti') throw new Error('Unknown bundled skill. Use skills list.');
  const contents = files.map(path => ({ path, text: readFileSync(new URL(path, root), 'utf8') }));
  const hash = createHash('sha256');
  for (const file of contents) hash.update(`${file.path}\0${Buffer.byteLength(file.text)}\0`).update(file.text);
  return { contents, details: {
    id, version: SKILL_VERSION, digest: hash.digest('hex'),
    description: 'Agent-owned profile research with deterministic local helpers and guarded CRM writes.',
    instructions: contents[0].text,
    references: contents.filter(file => file.path.startsWith('references/')),
    helpers: Object.entries(helperContracts).map(([name, contract]) => ({ name, ...contract })),
  } };
}

export function skillDetails(id = 'audienti') { return readSkill(id).details; }

export function skillCatalog() {
  const { instructions, references, ...entry } = skillDetails();
  return { skills: [entry] };
}

export function skillArtifact(id = 'audienti') {
  const { details, contents } = readSkill(id);
  return { ...details, files: contents.map(({ path, text }) => ({ path, content: text })) };
}

export async function skillsCli(argv) {
  const args = argv.slice(1), json = args.includes('--json');
  const filtered = args.filter(value => value !== '--json');
  if (args.filter(value => value === '--json').length > 1) throw new Error('Invalid skills options.');
  if (filtered.length === 1 && ['--help', 'help'].includes(filtered[0])) {
    process.stdout.write('Usage: audienti skills list | show audienti | helper NAME --file INPUT.json|- [--json]\nLocal skill instructions/helpers; no login, installation or provider calls.\n'); return;
  }
  if (filtered[0] === 'list' && filtered.length === 1) {
    const catalog = skillCatalog();
    process.stdout.write(json ? `${JSON.stringify(catalog)}\n` : catalog.skills.map(skill => `${skill.id}@${skill.version} — ${skill.description}\n`).join('')); return;
  }
  if (filtered[0] === 'show' && filtered.length === 2) {
    const details = skillDetails(filtered[1]);
    process.stdout.write(json ? `${JSON.stringify(details)}\n` : `${details.instructions}\n`); return;
  }
  if (filtered[0] === 'helper' && filtered.length === 4 && filtered[2] === '--file') {
    try { process.stdout.write(`${JSON.stringify(executeHelperFile(filtered[1], filtered[3]))}\n`); }
    catch { throw new Error('Skill helper failed. Inspect its schema and provide valid JSON of at most 1 MiB.'); }
    return;
  }
  throw new Error('Usage: audienti skills list | show audienti | helper NAME --file INPUT.json|- [--json]');
}
