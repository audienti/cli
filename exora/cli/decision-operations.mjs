import { z } from 'zod';
const uuid = z.string().uuid(), scope = { workspaceId: uuid.optional() };
const base = a => `/workspaces/${a.workspaceId}/decisions`;
const hold = 'An open decision holds its person: nothing is sent to them until the decision is answered.';
export const decisionOperations = {
 decision_list: {
  schema: z.object({ ...scope, state: z.enum(['open', 'decided', 'all']).optional(), prospectId: uuid.optional(), participationId: uuid.optional(), limit: z.number().int().min(1).max(100).optional() }).strict(),
  method: 'GET', path: a => { const q = new URLSearchParams(Object.entries({ state: a.state, prospectId: a.prospectId, participationId: a.participationId, limit: a.limit }).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString(); return `${base(a)}${q ? `?${q}` : ''}`; }, scoped: true,
  description: `List the decisions Operator asks the person when the rules do not decide: an unclear or low-confidence reply, a reply nobody labeled for 24 hours, or an agent that asked. Open ones come first. Each has the options the playbook allows, the agent's view when it added one, and a stale flag after 7 days. ${hold}`,
 },
 decision_get: {
  schema: z.object({ ...scope, decisionId: uuid }).strict(),
  method: 'GET', path: a => `${base(a)}/${a.decisionId}`, scoped: true,
  description: 'Read one decision with the options a person may pick from. Use these option ids with decision_prepare and decision_answer.',
 },
 decision_ask: {
  schema: z.object({ ...scope, participationId: uuid, requestId: uuid, reason: z.string().trim().max(200).optional().describe('Optional. One plain sentence on why the rules cannot decide.') }).strict(),
  method: 'POST', path: base, body: ({ workspaceId, ...rest }) => rest, scoped: true,
  description: `Ask the person to decide about one running participation. If a decision is already open for the person, the reason is added to it. ${hold} The same requestId with the same fields returns the first answer.`,
 },
 decision_prepare: {
  schema: z.object({
   ...scope, decisionId: uuid, requestId: uuid,
   recommended: z.string().min(1).max(80).describe('The id of the option you recommend. It must be one of the options you chose.'),
   options: z.array(z.object({ id: z.string().min(1).max(80).describe('An option id from decision_get.'), analysis: z.string().describe('One plain line, at most 140 characters: what happens and why it may fit. No IDs or error codes.') }).strict()).min(2).max(5),
  }).strict(),
  method: 'POST', path: a => `${base(a)}/${a.decisionId}/prepare`, body: ({ workspaceId, decisionId, ...rest }) => rest, scoped: true,
  description: 'Add your view to a decision: choose two to five of its options, write a one-line analysis for each and recommend one. Audienti refuses an option the playbook does not allow from the stage and lists the allowed ids. Take over and hold always stay open to the person. Your recommendation is never applied without the person\'s pick.',
 },
 decision_answer: {
  schema: z.object({ ...scope, decisionId: uuid, option: z.string().min(1).max(80).describe('An option id from decision_get.') }).strict(),
  method: 'POST', path: a => `${base(a)}/${a.decisionId}/answer`, body: ({ workspaceId, decisionId, ...rest }) => rest, scoped: true,
  description: 'People only: an agent cannot pick. Pick an option of a decision. The pick is recorded and the option\'s move runs once; sending it again returns the first answer. Picking hold changes nothing and the person stays held.',
 },
};
