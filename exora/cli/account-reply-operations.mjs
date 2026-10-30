import { z } from 'zod';
const uuid = z.string().uuid();
const scope = { workspaceId: uuid.optional(), prospectId: uuid };
const item = { ...scope, evidenceId: uuid };
const status = z.enum(['needs_handling', 'handled', 'not_reply']);
const outcome = z.enum(['response_recorded', 'closed_without_response', 'suppressed']);
const limit = z.number().int().min(1).max(100);
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
      outcome: outcome.nullable().describe("Null for needs_handling/not_reply; a handling outcome is required for handled."), reason: z.string().meta({ minLength: 1, maxLength: 2000 }).describe("Required trimmed NFC reason, 1–2000 codepoints. Interior control characters including newline and tab are rejected."), responseEvidenceId: uuid.nullable().describe("Required for response_recorded; null otherwise. Must identify matching outbound account evidence.") }).strict().describe("Explicit inbound classification. needs_handling/not_reply require null outcome and responseEvidenceId. handled requires an outcome; response_recorded requires matching outbound evidence, closed_without_response an explicit closure reason, and suppressed active DNC or Reject."),
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
