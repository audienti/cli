import { z } from 'zod';
const uuid = z.string().uuid();
const scope = { workspaceId: uuid.optional(), prospectId: uuid };
const item = { ...scope, evidenceId: uuid };
const status = z.enum(['needs_handling', 'handled', 'not_reply']);
const outcome = z.enum(['response_recorded', 'closed_without_response', 'suppressed']);
const limit = z.number().int().min(1).max(100);
const classification = z.enum(['interested', 'question', 'later', 'out_of_office', 'stop', 'bounce', 'referral', 'wrong_person']);
const slot = z.object({ start: z.string().describe('UTC start, ending in Z.'), end: z.string().describe('UTC end, ending in Z.'), timeZone: z.string().describe("The user's IANA time zone, for display.") }).strict();
const draft = z.object({
  type: z.enum(['email.send', 'linkedin.send']),
  content: z.record(z.string(), z.unknown()).describe('Email: { subject, body }. LinkedIn: { body }.'),
  recipient: z.record(z.string(), z.unknown()).describe('Email: { prospectId, email, contactId? }. LinkedIn: { prospectId, profileUrl, contactId? }. Bind contactId and senderAccountId, or the answer waits in Blocked.'),
  sender: z.record(z.string(), z.unknown()).describe("{ provider, accountRef, senderAccountId? }: the assignee's mailbox or LinkedIn account the inbound came to."),
  reason: z.string().describe('Why this answer, in one or two sentences.'),
  slots: z.array(slot).min(1).max(6).optional().describe('Free times from your calendar tool that the answer offers. Leave out without a calendar; the answer then asks for a time.'),
  skill: z.object({ id: z.string(), version: z.string() }).strict().optional(),
}).strict();
// Brief 12: what a stop, bounce or referral means, as a typed detail next to the classification it matches.
const quote = z.string().meta({ minLength: 1, maxLength: 500 }).describe("The prospect's words, verbatim.");
export const replyResultInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('email.bounce'), address: z.string().meta({ minLength: 3, maxLength: 320 }).describe('The address that bounced.'), kind: z.enum(['hard', 'soft']).describe('hard: the address does not exist or refuses mail. soft: a full mailbox or a temporary failure.'), evidence: z.string().meta({ minLength: 1, maxLength: 2000 }).describe('The bounce message, its status code and diagnostic.') }).strict().describe('Classification bounce. A hard bounce, or a second bounce, marks the address bounced and blocks it in every campaign.'),
  z.object({ type: z.literal('reply.stop'), scope: z.enum(['person', 'company']).describe('company only when the prospect asked to stop for their whole company.'), quote }).strict().describe('Classification stop, with status handled and outcome suppressed. The person, or everyone at the company, is suppressed for good.'),
  z.object({ type: z.literal('reply.referral'), name: z.string().meta({ minLength: 1, maxLength: 200 }).describe('The person the prospect named.'), title: z.string().meta({ maxLength: 200 }).optional(), email: z.string().meta({ maxLength: 320 }).optional(), linkedinUrl: z.string().meta({ maxLength: 500 }).optional(), quote }).strict().describe('Classification referral, with status needs_handling and the thank-you as the draft. The named person is checked against the audience before any contact.'),
]);
const root = a => `/workspaces/${a.workspaceId}/prospects/${a.prospectId}`;
const detail = a => `${root(a)}/conversation-evidence/${a.evidenceId}/reply`;
const query = (path, a, keys) => {
  const q = new URLSearchParams();
  for (const key of keys) if (a[key] !== undefined) q.set(key, String(a[key]));
  return path + (q.size ? `?${q}` : '');
};
export const accountReplyOperations = {
  workspace_reply_set: {
    schema: z.object({ ...item, requestId: uuid, expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), status,
      outcome: outcome.nullable().describe("Null for needs_handling/not_reply; a handling outcome is required for handled."), reason: z.string().meta({ minLength: 1, maxLength: 2000 }).describe("Required trimmed NFC reason, 1–2000 codepoints. Interior control characters including newline and tab are rejected."), responseEvidenceId: uuid.nullable().describe("Required for response_recorded; null otherwise. Must identify matching outbound account evidence."),
      classification: classification.optional().describe("What the reply is. Records a replied event on the person's active campaigns, except for bounce and out_of_office. An out_of_office reply snoozes the person instead; a wrong_person reply with no name given stops the sends and asks who the right person is. Someone who names the right person is a referral."),
      returnsOn: z.string().datetime().optional().describe("Only with out_of_office: the date the person is back (UTC, ending in Z). The snooze lasts until then; with no date it follows the playbook's out-of-office rule, 7 days by default."),
      invite: z.literal(true).optional().describe("The prospect sent a calendar invite you have not processed yet. Requires a classification; a meetings.confirm task follows."),
      draft: draft.optional().describe("Your drafted answer. Saved as a reply plan revision the user reviews in Operator; requires status needs_handling. Never sent until approved."),
      result: replyResultInput.optional().describe("Brief 12: the typed detail for a bounce, stop or referral. Its type must match the classification."),
      meeting: z.object({ at: z.string().datetime(), source: z.enum(['sent_invite', 'received_invite']) }).strict().optional().describe("A booked meeting: when, and whether the user's calendar sent the invite or the prospect did. Records meeting_booked."),
      intent: z.object({ quote: z.string().meta({ minLength: 1, maxLength: 300 }).describe('The words in the reply that support the classification or meeting. Copy them; case and spacing do not matter.'), reason: z.string().meta({ minLength: 1, maxLength: 200 }).describe('One plain sentence: why. A person reads it, so no IDs or error codes.'), confidence: z.enum(['high', 'medium', 'low']).optional().describe('How sure you are. Default high.') }).strict().optional().describe("The words behind your reading. With it, the label is checked like intent_record checks it (the quote is in the reply, the reason is plain) and the quote and reason are stored on the event. Requires a classification or a meeting."),
      meetingState: z.enum(['requested', 'accepted', 'declined']).optional().describe("Where a meeting that is not booked yet stands after this reply: requested (a time was asked for), accepted (they agreed, no time yet) or declined. Records the matching meeting event once. Ignored once a meeting is booked.") }).strict().describe("Explicit inbound classification. needs_handling/not_reply require null outcome and responseEvidenceId. handled requires an outcome; response_recorded requires matching outbound evidence, closed_without_response an explicit closure reason, and suppressed active DNC or Reject."),
    method: 'POST', scoped: true, path: detail,
    body: ({ workspaceId, prospectId, evidenceId, ...rest }) => rest,
  },
  workspace_reply_get: {
    schema: z.object({ ...item, historyCursor: uuid.optional(), historyLimit: limit.optional() }).strict(),
    method: 'GET', scoped: true, path: a => query(detail(a), a, ['historyCursor', 'historyLimit']),
  },
  workspace_reply_list: {
    schema: z.object({ ...scope, cursor: uuid.optional(), limit: limit.optional(), status: status.optional() }).strict(),
    method: 'GET', scoped: true, path: a => query(`${root(a)}/replies`, a, ['cursor', 'limit', 'status']),
  },
};
