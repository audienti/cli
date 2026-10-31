import {z} from 'zod';
const workspaceId=z.string().uuid().optional(),key=z.string().min(1).max(160);
const cursor=z.object({eventAt:z.string().datetime(),sourceKey:key}).strict();
const description='Private to the authenticated recipient. Human tokens require workspace:access; current membership and agent workspace policy apply. Agent reads accept workspace:read; read-state changes require workspace:access. Never approves or decides work.';
export const notificationOperations={
 workspace_notifications_list:{schema:z.object({workspaceId,unreadOnly:z.boolean().default(false),cursor:cursor.optional()}).strict(),method:'POST',path:a=>`/workspaces/${a.workspaceId}/notifications/list`,body:({workspaceId,...body})=>body,scoped:true,description:`List at most 30 recorded notifications and the total unread count. Pass nextCursor for older items. Keep observedAt from the head page for mark-all. Listing retains opaque event identities for later privacy redaction. ${description}`},
 workspace_notifications_mark:{schema:z.object({workspaceId,sourceKey:key,isRead:z.boolean(),through:z.string().datetime().optional()}).strict(),method:'POST',path:a=>`/workspaces/${a.workspaceId}/notifications/read`,body:({workspaceId,...body})=>body,scoped:true,description:`Set a notification read/unread. To mark all read, use sourceKey "*", isRead true and through equal to observedAt from a head-page list; later events remain unread. Resolved items cannot be made unread. ${description}`},
};
