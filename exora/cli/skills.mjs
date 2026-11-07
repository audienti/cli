import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SKILL_VERSION, helperContracts } from '../skills/audienti/scripts/contracts.mjs';
import { executeHelperFile } from '../skills/audienti/scripts/run.mjs';

const bundles = {
  audienti: {
    version: SKILL_VERSION,
    files: ['SKILL.md', 'references/profile-workflows.md', 'references/helpers.md', 'references/workflow-receipt.md', 'scripts/contracts.mjs', 'scripts/profile-helpers.mjs', 'scripts/run.mjs'],
    helpers: true,
  },
  'getting-started': {
    version: '1.5.2',
    files: ['SKILL.md', 'references/capabilities.md', 'references/campaign-draft.md', 'references/audience.md', 'references/outcome-checks.md', 'references/replies.md', 'references/reply-checks.md', 'references/mailbox-check.md'],
    helpers: false,
  },
  'playbook-design': {
    version: '1.2.0',
    files: ['SKILL.md', 'references/fields.md'],
    helpers: false,
  },
  'agent-rooms': {
    version: '1.0.0',
    description: "Talk with your user's other registered agents in rooms: check your inbox each run, ask and answer, reply unable, and leave a turnover note.",
    files: ['SKILL.md', 'references/commands.md'],
    helpers: false,
  },
};
export const SKILL_IDS = Object.keys(bundles);

function readSkill(id = 'audienti') {
  const bundle = Object.hasOwn(bundles, id) ? bundles[id] : null;
  if (!bundle) throw new Error('Unknown bundled skill. Use skills list.');
  const root = new URL(`../skills/${id}/`, import.meta.url);
  const contents = bundle.files.map(path => ({ path, text: readFileSync(new URL(path, root), 'utf8') }));
  const front = contents[0].text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const name = front.match(/^name: (.+)$/m)?.[1].trim(), description = front.match(/^description: (.+)$/m)?.[1].trim();
  if (name !== id || !description) throw new Error('Bundled skill requires a matching name and description in SKILL.md frontmatter.');
  const hash = createHash('sha256');
  for (const file of contents) hash.update(`${file.path}\0${Buffer.byteLength(file.text)}\0`).update(file.text);
  return { contents, details: {
    id, version: bundle.version, digest: hash.digest('hex'),
    description,
    instructions: contents[0].text,
    references: contents.filter(file => file.path.startsWith('references/')),
    helpers: bundle.helpers ? Object.entries(helperContracts).map(([name, contract]) => ({ name, ...contract })) : [],
  } };
}

export function skillDetails(id = 'audienti') { return readSkill(id).details; }

const helperPath = name => `helpers/${name}.json`;

// Compact discovery omits instructions and schemas so an agent can pick a skill,
// then read only the files it needs with skillResource.
export function skillCatalog({ compact = false } = {}) {
  if (!compact) return { skills: SKILL_IDS.map(id => { const { instructions, references, ...entry } = skillDetails(id); return entry; }) };
  return { skills: SKILL_IDS.map(id => {
    const { version, digest, description, helpers } = skillDetails(id);
    return {
      id, version, digest, description,
      resources: [...bundles[id].files, ...helpers.map(({ name }) => helperPath(name))],
      helpers: helpers.map(({ name, description: about }) => ({ name, description: about, resource: helperPath(name) })),
    };
  }) };
}

export function skillResource(id, path) {
  const artifact = skillArtifact(id);
  // Match shipped resource names exactly; never turn input into a disk path.
  const file = artifact.files.find(entry => entry.path === path);
  const helper = artifact.helpers.find(entry => helperPath(entry.name) === path);
  if (!file && !helper) throw new Error('Unknown bundled skill resource. Use skills list --compact.');
  return { id: artifact.id, version: artifact.version, digest: artifact.digest, path, content: file ? file.content : JSON.stringify(helper) };
}

const usage = `Usage: audienti skills list [--compact] | show ${SKILL_IDS.join('|')} | read SKILL RESOURCE | helper NAME --file INPUT.json|- [--json]`;

export function skillArtifact(id = 'audienti') {
  const { details, contents } = readSkill(id);
  return { ...details, files: contents.map(({ path, text }) => ({ path, content: text })) };
}

export async function skillsCli(argv) {
  // Skills are public; ignore --profile and --workspace so agents can pass them everywhere.
  const raw = argv.slice(1), drop = new Set();
  raw.forEach((value, i) => { if (value === '--profile' || value === '--workspace') { drop.add(i); drop.add(i + 1); } });
  const args = raw.filter((_, i) => !drop.has(i)), json = args.includes('--json');
  const filtered = args.filter(value => value !== '--json');
  if (args.filter(value => value === '--json').length > 1) throw new Error('Invalid skills options.');
  if (filtered.length === 1 && ['--help', 'help'].includes(filtered[0])) {
    process.stdout.write(`${usage}\nLocal skill instructions/helpers; no login, installation or provider calls.\n`); return;
  }
  if (filtered[0] === 'list' && (filtered.length === 1 || (filtered.length === 2 && filtered[1] === '--compact'))) {
    const compact = filtered.length === 2, catalog = skillCatalog({ compact });
    if (compact && !json) { process.stdout.write(catalog.skills.map(skill => `${skill.id}@${skill.version} — ${skill.description}\n${skill.resources.map(path => `  ${path}\n`).join('')}`).join('')); return; }
    process.stdout.write(json ? `${JSON.stringify(catalog)}\n` : catalog.skills.map(skill => `${skill.id}@${skill.version} — ${skill.description}\n`).join('')); return;
  }
  if (filtered[0] === 'show' && filtered.length === 2) {
    const details = skillDetails(filtered[1]);
    process.stdout.write(json ? `${JSON.stringify(details)}\n` : `${details.instructions}\n${details.references.map(file => `\n--- ${file.path} ---\n${file.text}\n`).join('')}`); return;
  }
  if (filtered[0] === 'read' && filtered.length === 3) {
    const resource = skillResource(filtered[1], filtered[2]);
    process.stdout.write(json ? `${JSON.stringify(resource)}\n` : `${resource.content}\n`); return;
  }
  if (filtered[0] === 'helper' && filtered.length === 4 && filtered[2] === '--file') {
    try { process.stdout.write(`${JSON.stringify(executeHelperFile(filtered[1], filtered[3]))}\n`); }
    catch { throw new Error('Skill helper failed. Inspect its schema and provide valid JSON of at most 1 MiB.'); }
    return;
  }
  throw new Error(usage);
}
