import { z } from 'zod';
const query = a => new URLSearchParams(Object.entries(a).filter(([k, v]) => k !== 'workspaceId' && v !== undefined).map(([k, v]) => [k, String(v)]));
export const auditOperations = {
 workspace_audit_log_list: {
  schema: z.object({
   workspaceId: z.string().uuid().optional(),
   actor: z.enum(['person', 'agent']).optional(),
   category: z.enum(['guardrails', 'budgets', 'approvals', 'suppression', 'members', 'agents', 'replies', 'billing', 'playbooks']).optional(),
   since: z.string().datetime().optional(),
   until: z.string().datetime().optional(),
   cursor: z.string().max(500).optional(),
   limit: z.number().int().min(1).max(200).optional(),
  }).strict(),
  method: 'GET', path: a => `/workspaces/${a.workspaceId}/audit-events?${query(a)}`, scoped: true,
  description: 'List the read-only workspace audit log: who changed guardrails, budgets, approvals, suppression, members, agent access and playbooks (who saved which version), newest first. Admin only. Page with cursor.',
 },
};
