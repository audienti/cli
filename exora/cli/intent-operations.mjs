import { z } from 'zod';
export const intentOperations = {
 intent_labels_list: {
  schema: z.object({ workspaceId: z.string().uuid().optional() }).strict(),
  method: 'GET', path: a => `/workspaces/${a.workspaceId}/intent-labels`, scoped: true,
  description: 'List the closed set of message labels: each name with its direction (inbound or outbound), the event it starts, the channels it fits, the typed detail it needs, whether it is locked or must stand alone, and whether it is only planned. Read it to learn which names exist. Recording a label is not available yet; the next release adds it.',
 },
};
