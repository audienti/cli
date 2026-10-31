import { z } from 'zod';
const window = { workspaceId: z.string().uuid().optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional() };
const path = name => a => {
 const query = new URLSearchParams(Object.entries({ from: a.from, to: a.to }).filter(([, v]) => v !== undefined));
 return `/workspaces/${a.workspaceId}/analytics/${name}${query.size ? `?${query}` : ''}`;
};
export const outboundOperations = {
 workspace_outbound_metrics: {
  schema: z.object(window).strict(), method: 'GET', path: path('outbound'), scoped: true,
  description: 'Outbound outcome metrics for a period (default last 30 days; from inclusive, to exclusive, ISO times, at most one year): execution attempts with succeeded, failed, uncertain and awaiting-outcome counts and a success rate, by sender, by action and by UTC day. Retries are not recorded, so there is no retried count. Same figures as Analytics > Outbound.',
 },
 workspace_activity_metrics: {
  schema: z.object(window).strict(), method: 'GET', path: path('activity'), scoped: true,
  description: 'What each workspace member and agent did in a period (default last 30 days): plans proposed, actions approved, approvals withdrawn, execution attempts started and outcomes reported. Agent actions count for the agent only. Same figures as Analytics > Activity.',
 },
};
