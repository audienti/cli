import { z } from 'zod';
const uuid = z.string().uuid();
const located = { workspaceId: uuid.optional(), prospectId: uuid };
const path = a => `/workspaces/${a.workspaceId}/prospects/${a.prospectId}/duplicate`;
export const duplicateOperations = {
  workspace_possible_duplicates: {
    description: 'List the people in a workspace that look like the same real person as another record (same name and the same profile photo, or the same name, company and title). The newer record is held: no outreach until a decision. Open flags only.',
    schema: z.object({ workspaceId: uuid.optional() }).strict(), method: 'GET', path: a => `/workspaces/${a.workspaceId}/possible-duplicates`, scoped: true,
  },
  workspace_prospect_duplicate: {
    description: 'Read the possible-duplicate flag of one person: the other record, why they match, and whether this person is held. duplicate is null when there is no open flag.',
    schema: z.object(located).strict(), method: 'GET', path, scoped: true,
  },
  workspace_prospect_duplicate_merge: {
    description: 'Merge a possible duplicate into one person. The older record survives and keeps both LinkedIn profiles, the email, the observations and the timelines. The LinkedIn profile that outreach uses is the main channel and the other LinkedIn channel is retired. Set primaryProfileId to choose it; without a choice the suggestedPrimary of the flag applies (the profile of the person who has an email, else the newest). Set keepBoth to true to leave both channels active; outreach then uses only the newest active LinkedIn contact. The result lists the retired channels in retiredChannels.',
    schema: z.object({ ...located, primaryProfileId: uuid.optional(), keepBoth: z.boolean().optional() }).strict(), method: 'POST', path: a => `${path(a)}/merge`, body: ({ workspaceId, prospectId, ...body }) => body, scoped: true,
  },
  workspace_prospect_duplicate_dismiss: {
    description: 'Say these two records are not the same person. The hold lifts and the pair is never flagged again.',
    schema: z.object(located).strict(), method: 'POST', path: a => `${path(a)}/dismiss`, body: () => ({}), scoped: true,
  },
};
