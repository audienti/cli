import { z } from 'zod';
const workspace = { workspaceId: z.string().uuid().optional() };
const base = a => `/workspaces/${a.workspaceId}/guardrails`;
const values = z.array(z.string().trim().min(1).max(500)).max(200);
export const guardrailsOperations = {
 workspace_guardrails_get: { schema: z.object(workspace).strict(), method: 'GET', path: base, scoped: true, description: 'Read workspace guardrails: whether automation is paused, who paused it, and the do-not-contact list.' },
 workspace_guardrails_pause: { schema: z.object(workspace).strict(), method: 'POST', path: a => `${base(a)}/pause`, body: () => ({}), scoped: true, description: 'Pause all automation in the workspace. Sends, connects and hosted tools are refused with workspace_paused until a person resumes. Admin only.' },
 workspace_guardrails_resume: { schema: z.object(workspace).strict(), method: 'POST', path: a => `${base(a)}/resume`, body: () => ({}), scoped: true, description: 'Resume automation. Only a person can resume; agent credentials are refused.' },
 workspace_do_not_contact_update: { schema: z.object({ ...workspace, add: values.optional(), remove: values.optional() }).strict(), method: 'POST', path: a => `${base(a)}/do-not-contact`, body: a => ({ ...(a.add ? { add: a.add } : {}), ...(a.remove ? { remove: a.remove } : {}) }), scoped: true, description: 'Add or remove domains, email addresses and LinkedIn URLs on the do-not-contact list. Agents may add but not remove.' },
 workspace_do_not_contact_import: { schema: z.object({ ...workspace, csv: z.string().min(1).max(400000) }).strict(), method: 'POST', path: a => `${base(a)}/do-not-contact/import`, body: a => ({ csv: a.csv }), scoped: true, description: 'Import do-not-contact entries from CSV text (domains, emails, LinkedIn URLs; at most 5,000 rows; header optional, value column named value/domain/email/linkedin/url or the first). Duplicates are skipped and invalid rows reported with row numbers. Matching people are blocked retroactively. Agents may import.' },
 workspace_do_not_contact_export: { schema: z.object(workspace).strict(), method: 'GET', path: a => `${base(a)}/do-not-contact/export`, scoped: true, description: 'Export the do-not-contact list as CSV text (type, value, added_at, added_by, added_via).' },
};
