import { z } from 'zod';
const uuid = z.string().uuid();
// JSON Schema counts Unicode code points. Domain validation and normalization stay
// server-owned; z.string().max() would instead reject valid astral text by UTF-16 length.
const bounded = maxLength => z.string().meta({ maxLength });
const dateTime = () => z.string().meta({ format: 'date-time' });
const identity = z.union([
  z.object({ kind: z.literal('person'), provider: bounded(64), providerId: bounded(256) }).strict(),
  z.object({ kind: z.literal('person'), provider: bounded(64), url: bounded(2048) }).strict(),
]);
const target = z.union([
  z.object({ kind: z.literal('existing'), prospectId: uuid }).strict(),
  z.object({ kind: z.literal('create'), identity, displayName: bounded(200).optional(), profileObservedAt: dateTime().nullable().optional() }).strict(),
]);
const payload = z.object({
  direction: z.enum(['inbound', 'outbound']), conversationType: z.enum(['direct', 'public_thread']), occurredAt: dateTime(),
  subject: bounded(512).nullable(), body: bounded(32000).nullable(),
  participants: z.array(z.object({ role: z.enum(['sender', 'recipient', 'cc', 'bcc']), value: bounded(320) }).strict()).max(20).nullable(),
}).strict();
const item = z.object({ source: z.object({ provider: bounded(64), accountRef: bounded(200), itemId: bounded(256), threadId: bounded(256).nullable().optional() }).strict(), payload }).strict();
const body = ({ workspaceId, prospectId, ...rest }) => rest;
const root = a => `/workspaces/${a.workspaceId}/prospects/${a.prospectId}/conversation-evidence`;
export const accountIntakeOperations = {
  workspace_prospect_intake: { schema: z.object({ workspaceId: uuid.optional(), requestId: uuid, target, item }).strict(), method: 'POST', scoped: true, path: a => `/workspaces/${a.workspaceId}/prospects/intake`, body },
  workspace_conversation_append: { schema: z.object({ workspaceId: uuid.optional(), prospectId: uuid, requestId: uuid, item }).strict(), method: 'POST', scoped: true, path: root, body },
  workspace_conversation_list: { schema: z.object({ workspaceId: uuid.optional(), prospectId: uuid, cursor: uuid.optional(), limit: z.number().int().min(1).max(100).optional() }).strict(), method: 'GET', scoped: true,
    path: a => { const q = new URLSearchParams(); for (const k of ['cursor', 'limit']) if (a[k] !== undefined) q.set(k, String(a[k])); return root(a) + (q.size ? '?' + q : ''); } },
};
