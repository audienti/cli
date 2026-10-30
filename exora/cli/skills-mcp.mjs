import { z } from 'zod';
import { helperContracts, SKILL_VERSION } from '../skills/audienti/scripts/contracts.mjs';
import { runHelper } from '../skills/audienti/scripts/profile-helpers.mjs';
import { skillArtifact, skillCatalog, skillDetails } from './skills.mjs';

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });

export function registerSkills(server) {
  server.registerTool('skills_list', { description: 'List bundled agent skills and deterministic helpers. Local, no authentication or provider calls.', inputSchema: z.object({}).strict(), annotations }, async () => result(skillCatalog()));
  server.registerTool('skills_show', { description: 'Read bundled skill instructions, references, version, digest and helper schemas.', inputSchema: z.object({ id: z.literal('audienti') }).strict(), annotations }, async ({ id }) => result(skillDetails(id)));
  for (const [name, contract] of Object.entries(helperContracts)) {
    server.registerTool(`skills_${name.replaceAll('-', '_')}`, {
      description: contract.description,
      inputSchema: z.fromJSONSchema(contract.inputSchema), outputSchema: z.fromJSONSchema(contract.outputSchema), annotations,
    }, async input => {
      try { return result(runHelper(name, input)); }
      catch { return { isError: true, content: [{ type: 'text', text: 'Invalid helper input; inspect its bundled schema and the 1 MiB limit.' }] }; }
    });
  }
  server.registerResource('audienti-skill', `audienti://skills/audienti/${SKILL_VERSION}`, {
    description: 'Versioned public skill artifact: instructions, references, scripts and schemas. Reading it does not install or execute anything.', mimeType: 'application/json',
  }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(skillArtifact()) }] }));
}
