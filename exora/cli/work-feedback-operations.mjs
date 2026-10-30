import { z } from 'zod';
const uuid = z.string().uuid(), version = z.number().int().positive();
const actionId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const reason = z.string().meta({ minLength: 1, maxLength: 2000, description: 'Trimmed NFC reason, 1–2000 Unicode code points; interior controls (including tabs/newlines) and unpaired surrogates are rejected. Visible to workspace members.' });
const location = { workspaceId: uuid.optional(), planId: uuid };
const item = { ...location, reviewRequestId: uuid };
const mutation = { ...item, expectedVersion: version, requestId: uuid, reason };
const root = a => `/workspaces/${a.workspaceId}/work/${a.planId}/change-requests`;
const detail = a => `${root(a)}/${a.reviewRequestId}`;
const body = ({ workspaceId, planId, clientActionId, reviewRequestId, ...input }) => input;
export const workFeedbackOperations = {
 workspace_work_change_request: { schema: z.object({ ...location, clientActionId: actionId, expectedRevision: version, expectedApprovalVersion: z.number().int().nonnegative(), kind: z.enum(['revise','alternative']), reason, requestId: uuid }).strict(), method: 'POST', scoped: true, path: a => `/workspaces/${a.workspaceId}/work/${a.planId}/actions/${a.clientActionId}/change-requests`, body },
 workspace_work_change_respond: { schema: z.object({ ...mutation, responseRevision: version, responseClientActionId: actionId }).strict().describe('Respond with the changed original for Revise, or a new replacement after removing the original. Skip always requires a new action ID. A response never approves the proposal.'), method: 'POST', scoped: true, path: a => `${detail(a)}/respond`, body },
 workspace_work_change_withdraw: { schema: z.object(mutation).strict(), method: 'POST', scoped: true, path: a => `${detail(a)}/withdraw`, body },
 workspace_work_change_get: { schema: z.object(item).strict(), method: 'GET', scoped: true, path: detail },
 workspace_work_change_list: { schema: z.object({ ...location, page: z.object({ cursor: uuid.optional(), limit: z.number().int().min(1).max(100).optional() }).strict().optional(), status: z.enum(['open','responded','withdrawn','cancelled']).optional() }).strict(), method: 'GET', scoped: true, path: a => { const q = new URLSearchParams(); for (const [key,value] of Object.entries({ ...a.page, status:a.status })) if(value!==undefined)q.set(key,String(value)); return `${root(a)}?${q}`; } },
};
