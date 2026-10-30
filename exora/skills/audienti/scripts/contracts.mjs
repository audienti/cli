export const SKILL_VERSION = '1.3.0';
export const MAX_INPUT_BYTES = 1024 * 1024;
const text = maxLength => ({ type: 'string', maxLength });
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const array = (items, maxItems) => ({ type: 'array', items, maxItems });
const uuid = { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' };
const profile = object({
  displayName: text(300), prospectName: text(300), companyName: text(300),
  companyDomain: text(253), title: text(500), bio: text(10000), headline: text(1000),
  description: text(10000), linkedinReference: text(1024), linkedinSlug: text(200),
  handles: array(text(200), 12),
});
const candidate = object({
  url: { ...text(2048), minLength: 1 }, title: text(1000), snippet: text(10000),
  domain: text(253), profileId: uuid, prospectId: uuid,
}, ['url']);
const query = object({ query: text(16000), kind: { enum: ['email', 'website', 'social'] } }, ['query', 'kind']);
const ranked = object({
  ...candidate.properties, score: { type: 'number' }, signals: array(text(40), 5),
  identityStatus: { enum: ['saved_reference', 'unresolved'] },
  suggestedAction: { enum: ['inspect_page', 'inspect_snippet', 'skip_low_score'] },
}, ['url', 'score', 'signals', 'identityStatus', 'suggestedAction']);
export const helperContracts = {
  'profile-completeness': {
    description: 'Summarize supplied field states for research planning. Known absence stays distinct from missing evidence. Does not determine cache eligibility, billing or authority.',
    inputSchema: object({ requiredFields: array({ ...text(80), minLength: 1 }, 40), fields: array(object({ name: { ...text(80), minLength: 1 }, state: { enum: ['available', 'absent', 'unavailable', 'truncated'] } }, ['name', 'state']), 80) }, ['requiredFields', 'fields']),
    outputSchema: object({ version: { const: SKILL_VERSION }, authority: { const: 'planning_only' }, allFieldsKnown: { type: 'boolean' }, available: array(text(80), 40), absent: array(text(80), 40), needsEvidence: array(object({ field: text(80), state: { enum: ['unavailable', 'truncated', 'not_reported', 'conflicting'] } }, ['field', 'state']), 40) }, ['version', 'authority', 'allFieldsKnown', 'available', 'absent', 'needsEvidence']),
  },
  'profile-evidence': {
    description: 'Extract bounded observed URL and mention candidates from supplied profile text using V10 text rules. Caller-attributed evidence only; no fetch, canonicalization, attachment or identity decision.',
    inputSchema: object({ profileId: uuid, observationId: uuid, platform: { enum: ['twitter', 'x', 'reddit', 'instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'threads', 'github', 'medium'] }, bio: text(10000), websiteUrl: text(2048) }),
    outputSchema: object({ version: { const: SKILL_VERSION }, authority: { const: 'caller_supplied' }, profileId: uuid, observationId: uuid, links: array(object({ url: text(2048), fields: array({ enum: ['bio', 'websiteUrl'] }, 2) }, ['url', 'fields']), 50), mentions: array(object({ platform: text(40), handle: text(200), field: { const: 'bio' } }, ['platform', 'handle', 'field']), 50), rejectedLinks: { type: 'integer', minimum: 0 }, omittedLinks: { type: 'integer', minimum: 0 }, omittedMentions: { type: 'integer', minimum: 0 } }, ['version', 'authority', 'links', 'mentions', 'rejectedLinks', 'omittedLinks', 'omittedMentions']),
  },
  'profile-queries': {
    description: 'Prepare bounded V10-derived profile search queries from supplied facts. Does not search or call the CRM.',
    inputSchema: object({ profile, kind: { enum: ['social', 'email', 'website'] }, mode: { enum: ['broad', 'attachable'] } }, ['profile', 'kind']),
    outputSchema: object({ version: { const: SKILL_VERSION }, queries: array(query, 5), missing: array(text(80), 2) }, ['version', 'queries', 'missing']),
  },
  'profile-candidates': {
    description: 'Rank at most 80 supplied results using V10 advisory weights; deduplicate references without claiming an identity match.',
    inputSchema: object({ profile, candidates: array(candidate, 80), limit: { type: 'integer', minimum: 1, maximum: 12 } }, ['profile', 'candidates']),
    outputSchema: object({ version: { const: SKILL_VERSION }, candidates: array(ranked, 12), duplicatesRemoved: { type: 'integer', minimum: 0 }, omitted: { type: 'integer', minimum: 0 } }, ['version', 'candidates', 'duplicatesRemoved', 'omitted']),
  },
};

// This validator serves only the closed, bundled schemas above. It accepts no
// caller-provided schema, references, regular expressions or executable code.
export function validateInput(name, value) {
  const contract = Object.hasOwn(helperContracts, name) && helperContracts[name];
  if (!contract) throw new Error('Unknown bundled helper.');
  function visit(schema, item) {
    const invalid = () => { throw new Error('Invalid helper input; inspect the bundled input schema.'); };
    if (schema.enum && !schema.enum.includes(item)) invalid();
    if (schema.type === 'object') {
      if (!item || typeof item !== 'object' || Array.isArray(item)) invalid();
      if (Object.keys(item).some(key => !Object.hasOwn(schema.properties, key))) invalid();
      if (schema.required.some(key => !Object.hasOwn(item, key))) invalid();
      for (const [key, child] of Object.entries(item)) visit(schema.properties[key], child);
    } else if (schema.type === 'array') {
      if (!Array.isArray(item) || item.length > schema.maxItems) invalid();
      for (const child of item) visit(schema.items, child);
    } else if (schema.type === 'string') {
      if (typeof item !== 'string' || item.length > (schema.maxLength ?? Infinity) || item.length < (schema.minLength ?? 0)) invalid();
      if (schema.pattern && !new RegExp(schema.pattern).test(item)) invalid();
    } else if (schema.type === 'integer') {
      if (!Number.isInteger(item) || item < schema.minimum || item > schema.maximum) invalid();
    }
  }
  visit(contract.inputSchema, value);
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_INPUT_BYTES) throw new Error('Helper input exceeds 1 MiB.');
  return value;
}
