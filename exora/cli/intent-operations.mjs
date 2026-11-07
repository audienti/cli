import { z } from 'zod';
const bounce = z.object({ type: z.literal('email.bounce'), address: z.string().meta({ minLength: 3, maxLength: 320 }).describe('The address that bounced.'), kind: z.enum(['hard', 'soft']).describe('hard: the address does not exist or refuses mail. soft: a full mailbox or a temporary failure.'), evidence: z.string().meta({ minLength: 1, maxLength: 2000 }).describe('The bounce message, its status code and diagnostic.') }).strict();
const own = z.string().meta({ minLength: 1, maxLength: 500 }).optional().describe("Optional. The label's own quote is used when this is left out.");
const resultInput = z.discriminatedUnion('type', [
 bounce,
 z.object({ type: z.literal('reply.stop'), scope: z.enum(['person', 'company']).describe('company only when the person asked to stop for their whole company.'), quote: own }).strict(),
 z.object({ type: z.literal('reply.referral'), name: z.string().meta({ minLength: 1, maxLength: 200 }).describe('The person named.'), title: z.string().meta({ maxLength: 200 }).optional(), email: z.string().meta({ maxLength: 320 }).optional(), linkedinUrl: z.string().meta({ maxLength: 500 }).optional(), quote: own }).strict(),
]);
const uuid = z.string().uuid();
const label = z.object({
 label: z.string().describe("A name from intent_labels_list that fits the message direction and channel, or custom.<name> for a label the person's running playbook declares (intent_labels_list with playbookId shows them)."),
 quote: z.string().meta({ minLength: 1, maxLength: 300 }).describe('The words in the message that support the label. Copy them from the message; case and spacing do not matter.'),
 reason: z.string().meta({ minLength: 1, maxLength: 200 }).describe('One plain sentence: why the quote means this label. A person reads it, so no IDs, error codes or status numbers.'),
 confidence: z.enum(['high', 'medium', 'low']).optional().describe('How sure you are. Optional. It is stored with the label when given. A low-confidence label does not fire its rule: it holds the person and opens a decision, except stop and bounce, which always act.'),
 result: resultInput.optional().describe('The typed detail a stop (reply.stop), bounce (email.bounce) or referral (reply.referral) needs. Same shape as replies set; a stop or referral takes the label quote as its own when it has none.'),
 meeting: z.object({ at: z.string().datetime(), source: z.enum(['sent_invite', 'received_invite']) }).strict().optional().describe('Only for meeting_booked: when the meeting is (UTC, ending in Z) and who sent the invite.'),
 returnsOn: z.string().datetime().optional().describe('Only for out_of_office: the day the person is back (UTC, ending in Z).'),
 invite: z.literal(true).optional().describe('The person sent a calendar invite that is not processed yet.'),
}).strict();
export const intentOperations = {
 intent_labels_list: {
  schema: z.object({ workspaceId: uuid.optional(), playbookId: uuid.optional().describe("Also list this playbook's own labels (customLabels), each with whether a rule of the playbook names it. Record one as custom.<name>.") }).strict(),
  method: 'GET', path: a => `/workspaces/${a.workspaceId}/intent-labels${a.playbookId ? `?playbookId=${a.playbookId}` : ''}`, scoped: true,
  description: 'List the closed set of message labels: each name with its direction (inbound or outbound), the event it starts, the channels it fits, the typed detail it needs, whether it is locked or must stand alone, and whether it is only planned. Read it to learn which names exist, then record one with intent_record.',
 },
 intent_record: {
  schema: z.object({
   workspaceId: uuid.optional(), prospectId: uuid, evidenceId: uuid, requestId: uuid,
   participationId: uuid.optional().describe('Record on this one campaign participation only. Leave out to record on every running campaign of the person.'),
   labels: z.array(label).min(1),
  }).strict(),
  method: 'POST', path: a => `/workspaces/${a.workspaceId}/intents`, scoped: true, body: ({ workspaceId, ...rest }) => rest,
  description: 'Record what a message means: one to three labels, each with the quote that supports it and a plain reason. The message must already be stored as conversation evidence with its text. Every label is checked first and nothing is written if one fails: the name is known and fits the direction and channel, the quote is in the message, the reason is plain words, the labels fit together (stop, bounce and out_of_office stand alone), and the typed detail a stop, bounce, referral or booked meeting needs is present. A refusal names the field, the allowed values and the next step. The same requestId with the same body returns the first answer. The matching events land on the person\'s running campaigns, so the playbook rules act on them. Replies set records the same labels when you give it an intent block. A message you sent can be labeled too: store it first as outbound conversation evidence, then record meeting_requested when it asks for or offers a meeting. That puts the request on the meeting timeline and starts the meeting follow-ups without a reply.',
 },
 intent_correct: {
  schema: z.object({
   workspaceId: uuid.optional(), prospectId: uuid, eventId: uuid.describe('The label event to change: the id the label shows in workspace_reply_get, prospect_timeline and workspace_pipeline_get.'), requestId: uuid,
   label: label.optional().describe('The label that replaces it, with its quote and reason. Send this or retract.'),
   retract: z.literal(true).optional().describe('Withdraw the label and put nothing in its place. Send this or label.'),
  }).strict(),
  method: 'POST', path: a => `/workspaces/${a.workspaceId}/intents/corrections`, scoped: true, body: ({ workspaceId, ...rest }) => rest,
  description: 'A person changes one label of a message, or withdraws it. Only a person can: an agent token is refused with human_only, so ask your user to change it in the app or with audienti intent correct. The new label passes the checks a first recording passes. Nothing is edited: the old label stays in the history, and the labels in force are the originals no correction replaced plus the replacements. A change that would route the person differently never moves them: it opens a decision (Move back to stage X?) and the person picks. A change away from a stop never lifts it: it opens a confirmation decision. A bounce and a company-wide stop cannot be corrected. The same requestId with the same body returns the first answer.',
 },
};
