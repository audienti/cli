import { z } from 'zod';
export const usageOperations = {
 workspace_usage_breakdown: {
  schema: z.object({ workspaceId: z.string().uuid().optional(), period: z.enum(['month', '7d', '30d', '90d']).optional() }).strict(),
  method: 'GET', path: a => `/workspaces/${a.workspaceId}/usage/breakdown${a.period ? `?period=${a.period}` : ''}`, scoped: true,
  description: 'Credit cost for a period (default this month) by tool, provider, model and caller, with a zero-filled daily series and share of total. Amounts are pico USD (1 credit = 10,000,000,000). Model is recorded only for AI decision calls. Same figures as Settings > Usage.',
 },
};
