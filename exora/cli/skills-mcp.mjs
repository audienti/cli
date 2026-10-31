import { z } from 'zod';
import { helperContracts, SKILL_VERSION } from '../skills/audienti/scripts/contracts.mjs';
import { runHelper } from '../skills/audienti/scripts/profile-helpers.mjs';
import { skillArtifact, skillCatalog, skillDetails, SKILL_IDS } from './skills.mjs';

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });

export function registerSkills(server) {
  server.registerTool('skills_list', { description: 'List bundled agent skills and deterministic helpers. Local, no authentication or provider calls.', inputSchema: z.object({}).strict(), annotations }, async () => result(skillCatalog()));
  server.registerTool('skills_show', { description: 'Read bundled skill instructions, references, version, digest and helper schemas. Run getting-started once right after connecting.', inputSchema: z.object({ id: z.enum(SKILL_IDS) }).strict(), annotations }, async ({ id }) => result(skillDetails(id)));
  for (const [name, contract] of Object.entries(helperContracts)) {
    server.registerTool(`skills_${name.replaceAll('-', '_')}`, {
      description: contract.description,
      inputSchema: z.fromJSONSchema(contract.inputSchema), outputSchema: z.fromJSONSchema(contract.outputSchema), annotations,
    }, async input => {
      try { return result(runHelper(name, input)); }
      catch { return { isError: true, content: [{ type: 'text', text: 'Invalid helper input; inspect its bundled schema and the 1 MiB limit.' }] }; }
    });
  }
  for (const id of SKILL_IDS) {
    const { version } = skillDetails(id);
    server.registerResource(id === 'audienti' ? 'audienti-skill' : `${id}-skill`, `audienti://skills/${id}/${version}`, {
      description: 'Versioned public skill artifact: instructions, references, scripts and schemas. Reading it does not install or execute anything.', mimeType: 'application/json',
    }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(skillArtifact(id)) }] }));
  }
}
