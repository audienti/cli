import { z } from 'zod';
export const usageOperations = {
 workspace_runs_list: {
  schema: z.object({ workspaceId: z.string().uuid().optional(), agent: z.string().uuid().optional(), status: z.enum(['all', 'running', 'done', 'failed']).optional(), cursorAt: z.string().datetime().optional(), cursorId: z.string().uuid().optional() }).strict(),
  method: 'GET', path: a => `/workspaces/${a.workspaceId}/runs?${new URLSearchParams(Object.entries(a).filter(([key, value]) => key !== 'workspaceId' && value !== undefined))}`, scoped: true,
  description: 'Task runs and standalone tool calls, newest first. Same records as Runs. Skipped rows carry skipReason in plain words and skipReasonCode. Pass nextCursor.at as cursorAt and nextCursor.id as cursorId to continue. Agents need Manage workspace data.',
 },
 workspace_usage_breakdown: {
  schema: z.object({ workspaceId: z.string().uuid().optional(), period: z.enum(['month', '7d', '30d', '90d']).optional() }).strict(),
  method: 'GET', path: a => `/workspaces/${a.workspaceId}/usage/breakdown${a.period ? `?period=${a.period}` : ''}`, scoped: true,
  description: 'Credit cost for a period (default this month) by tool, provider, model and caller, with a zero-filled daily series and share of total. Amounts are pico USD (1 credit = 10,000,000,000). Model is recorded only for AI decision calls. Same figures as Settings > Usage.',
 },
};
