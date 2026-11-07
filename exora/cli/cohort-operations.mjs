import { z } from 'zod';
const uuid = z.string().uuid();
const filters = { workspaceId: uuid.optional(), campaignId: uuid.optional(), ownerUserId: uuid.optional(), offerId: uuid.optional(), audienceId: uuid.optional(), tag: z.string().min(1).max(64).optional() };
const FILTER_TEXT = 'Filters (all optional, combined with AND): campaignId, ownerUserId (the campaign owner), offerId and audienceId (as pinned by the campaign), tag (a campaign tag). List the values with workspace_analytics_filters.';
const path = name => a => {
 const query = new URLSearchParams(Object.entries(a).filter(([key, value]) => key !== 'workspaceId' && value !== undefined).map(([key, value]) => [key, String(value)]));
 return `/workspaces/${a.workspaceId}/analytics/${name}${query.size ? `?${query}` : ''}`;
};
export const cohortOperations = {
 workspace_analytics_cohorts: {
  schema: z.object({ ...filters, stage: z.string().min(1).max(100).optional(), cohorts: z.number().int().min(1).max(52).optional(), horizon: z.number().int().min(1).max(26).optional() }).strict(), method: 'GET', path: path('cohorts'), scoped: true,
  description: `Weekly entry cohorts: people grouped by the UTC week (Monday start) they were admitted to a campaign, and for each week since admission the share that reached a stage. stage is "goal" (default, each playbook's goal) or a stage key from the stages list in the response. cohorts is the number of weeks (default 12, at most 52); horizon is the number of weeks since entry shown after week 0 (default 8, at most 26). A cell is empty (null) until every member of the cohort has had that long. ${FILTER_TEXT} A playbook version that cannot be read is left out, its people count in excluded, and it is named in unreadablePlaybooks. Same figures as Analytics > Cohorts.`,
 },
 workspace_stage_aging: {
  schema: z.object({ ...filters, thresholdDays: z.number().int().min(1).max(365).optional() }).strict(), method: 'GET', path: path('stage-aging'), scoped: true,
  description: `Stage aging: how long people still active in a campaign have been in their current stage, by stage: count, median days, 90th percentile days, oldest, and how many are over thresholdDays (default 7). ${FILTER_TEXT} A playbook version that cannot be read is left out and named in unreadablePlaybooks. Same figures as Analytics > Stage aging.`,
 },
 workspace_analytics_filters: {
  schema: z.object({ workspaceId: uuid.optional() }).strict(), method: 'GET', path: path('filters'), scoped: true,
  description: 'List the values the analytics filters can take in this workspace: campaigns, campaign owners, offers, audiences and campaign tags, with ids and names. Use the ids with workspace_analytics_get, workspace_analytics_cohorts and workspace_stage_aging.',
 },
};
