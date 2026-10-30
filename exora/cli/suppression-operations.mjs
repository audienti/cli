import { z } from 'zod';
const uuid=z.string().uuid();
const located={workspaceId:uuid.optional(),prospectId:uuid};
const path=a=>`/workspaces/${a.workspaceId}/prospects/${a.prospectId}/suppression`;
export const suppressionOperations={
 workspace_prospect_suppression:{schema:z.object({...located,history:z.object({cursor:uuid.optional(),limit:z.number().int().min(1).max(100).optional()}).strict().optional()}).strict(),method:'GET',path:a=>{const q=new URLSearchParams();if(a.history?.cursor)q.set('historyCursor',a.history.cursor);if(a.history?.limit!==undefined)q.set('historyLimit',String(a.history.limit));return path(a)+(q.size?'?'+q:'');},scoped:true},
 workspace_prospect_suppression_set:{schema:z.object({...located,kind:z.enum(['dnc','reject']),action:z.enum(['set','clear']),expectedVersion:z.number().int().nonnegative(),requestId:uuid,reason:z.string().optional()}).strict(),method:'POST',path,body:({workspaceId,prospectId,...body})=>body,scoped:true},
};
