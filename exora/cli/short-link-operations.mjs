import { z } from 'zod';

const uuid = z.string().uuid();
const located = { workspaceId: uuid.optional() };
const path = a => `/workspaces/${a.workspaceId}/short-links`;
const query = a => {
  const params = new URLSearchParams();
  if (a.cursor) params.set('cursor', a.cursor);
  if (a.limit !== undefined) params.set('limit', String(a.limit));
  if (a.search) params.set('search', a.search);
  if (Array.isArray(a.targetKinds) && a.targetKinds.length) params.set('targetKinds', a.targetKinds.join(','));
  return params.size ? `?${params}` : '';
};
const targetKind = z.enum(['guide', 'offer', 'demo', 'other']);
const sharingMode = z.enum(['personal', 'shared']);

export const shortLinkOperations = {
  short_link_list: {
    schema: z.object({ ...located, search: z.string().trim().max(120).optional(), targetKinds: z.array(targetKind).max(4).optional(), cursor: uuid.optional(), limit: z.number().int().min(1).max(100).optional() }).strict(),
    method: 'GET', path: a => path(a) + query(a), scoped: true,
  },
  short_link_create: {
    schema: z.object({ ...located, destinationUrl: z.string().trim().min(1).max(2048), targetKind: targetKind.optional(), sharingMode: sharingMode.optional(), recipientProspectId: uuid.optional(), campaignId: uuid.optional(), campaignRevision: z.number().int().positive().optional(), messageReference: z.string().trim().min(1).max(200).optional() }).strict(),
    method: 'POST', path, body: ({ workspaceId, ...body }) => body, scoped: true,
  },
  short_link_requests: {
    schema: z.object({ ...located, shortLinkId: uuid, cursor: uuid.optional(), limit: z.number().int().min(1).max(100).optional() }).strict(),
    method: 'GET', path: a => `${path(a)}/${a.shortLinkId}/requests` + query(a), scoped: true,
  },
};
