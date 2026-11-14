import { z } from 'zod';

const uuid = z.string().uuid();
const workspace = { workspaceId: uuid.optional() };
const locator = { ...workspace, artifactId: uuid };
const recordType = z.enum(['audience', 'campaign', 'company', 'person', 'offer']);
const record = { recordType, recordId: uuid };
const fields = {
  name: z.string().trim().min(1),
  summary: z.string().optional(),
  type: z.string().trim().min(1),
  body: z.string(),
  data: z.unknown().optional(),
  expiresAt: z.union([z.string(), z.null()]).optional(),
};
const writeFields = {
  name: fields.name.optional(),
  summary: fields.summary,
  type: fields.type.optional(),
  body: fields.body.optional(),
  data: fields.data,
  expiresAt: fields.expiresAt,
};
const path = a => `/workspaces/${a.workspaceId}/artifacts`;
const query = (a, extras = {}) => new URLSearchParams(Object.entries({ includeArchived: a.includeArchived, limit: a.limit, after: a.after, ...extras }).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString();

export const artifactOperations = {
  artifact_list: { schema: z.object({ ...workspace, includeArchived: z.boolean().optional(), limit: z.number().int().optional(), after: uuid.optional(), type: z.string().optional() }).strict(), method: 'GET', path: a => `${path(a)}?${query(a, { type: a.type })}`, scoped: true },
  artifact_list_by_record: { schema: z.object({ ...workspace, ...record, includeArchived: z.boolean().optional(), limit: z.number().int().optional(), after: uuid.optional() }).strict(), method: 'GET', path: a => `${path(a)}/record/${a.recordType}/${a.recordId}?${query(a)}`, scoped: true },
  artifact_list_by_type: { schema: z.object({ ...workspace, type: z.string().trim().min(1), includeArchived: z.boolean().optional(), limit: z.number().int().optional(), after: uuid.optional() }).strict(), method: 'GET', path: a => `${path(a)}/type/${encodeURIComponent(a.type)}?${query(a)}`, scoped: true },
  artifact_context: { schema: z.object({ ...workspace, ...record, limit: z.number().int().optional(), after: uuid.optional() }).strict(), method: 'GET', path: a => `${path(a)}/context/${a.recordType}/${a.recordId}?${new URLSearchParams(Object.entries({ limit: a.limit, after: a.after }).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString()}`, scoped: true, description: 'Read drafting context for one workspace-owned record. Only attached artifacts that are unarchived and unexpired at request time are returned. Person and company recordId values are public Prospect IDs.' },
  artifact_get: { schema: z.object(locator).strict(), method: 'GET', path: a => `${path(a)}/${a.artifactId}`, scoped: true },
  artifact_create: { schema: z.object({ ...workspace, ...fields }).strict(), method: 'POST', path, body: ({ workspaceId: _workspaceId, ...a }) => a, scoped: true },
  artifact_update: { schema: z.object({ ...locator, ...fields }).partial({ name: true, summary: true, type: true, body: true, data: true, expiresAt: true }).strict().refine(value => ['name', 'summary', 'type', 'body', 'data', 'expiresAt'].some(key => Object.hasOwn(value, key)), 'Supply at least one artifact field.'), method: 'POST', path: a => `${path(a)}/${a.artifactId}`, body: ({ workspaceId: _workspaceId, artifactId: _artifactId, ...a }) => a, scoped: true },
  artifact_attach: { schema: z.object({ ...locator, ...record }).strict(), method: 'POST', path: a => `${path(a)}/${a.artifactId}/attachments`, body: ({ workspaceId: _workspaceId, artifactId: _artifactId, ...a }) => a, scoped: true },
  artifact_detach: { schema: z.object({ ...locator, ...record }).strict(), method: 'POST', path: a => `${path(a)}/${a.artifactId}/detach`, body: ({ workspaceId: _workspaceId, artifactId: _artifactId, ...a }) => a, scoped: true },
  artifact_archive: { schema: z.object(locator).strict(), method: 'POST', path: a => `${path(a)}/${a.artifactId}/archive`, scoped: true },
  artifact_write: { schema: z.object({ ...workspace, action: z.enum(['create', 'update', 'attach', 'detach', 'archive']), artifactId: uuid.optional(), recordType: recordType.optional(), recordId: uuid.optional(), ...writeFields }).strict(), method: 'POST', path: a => `${path(a)}/write`, body: ({ workspaceId: _workspaceId, ...a }) => a, scoped: true, description: 'Use one authenticated write tool for create, update, attach, detach, or archive. Create requires name, type and body; update requires artifactId plus at least one field; attach/detach require artifactId, recordType and recordId; archive requires artifactId. Producer log entries are server-attributed. Person and company recordId values are public Prospect IDs.' },
};
