import { z } from 'zod';
const workspace = { workspaceId: z.string().uuid().optional() };
export const secretName = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/, 'A secret name uses capital letters, digits and underscores, for example HUBSPOT_TOKEN.');
export const secretOperations = {
 workspace_secret_list: { schema: z.object(workspace).strict(), method: 'GET', path: a => `/workspaces/${a.workspaceId}/secrets`, scoped: true, description: 'List the names of the secrets in the workspace Vault. Names only, never values. Use workspace_secret_get for one value.' },
 workspace_secret_get: { schema: z.object({ ...workspace, name: secretName }).strict(), method: 'GET', path: a => `/workspaces/${a.workspaceId}/secrets/${encodeURIComponent(a.name)}`, scoped: true, description: 'Get one secret by name from the workspace Vault (for example HUBSPOT_TOKEN). Every agent in the workspace can read every secret and reading is free. Each read records who read it last and when. Use the value for the task only: never print it, paste it into a message or save it to a file.' },
};
