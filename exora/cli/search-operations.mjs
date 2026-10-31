import {z} from 'zod';
const reference=z.object({kind:z.enum(['audience','campaign','person','company']),id:z.string().uuid()}).strict();
export const searchOperations={
 workspace_search:{
  schema:z.object({workspaceId:z.string().uuid().optional(),query:z.string().trim().max(120).default(''),peopleOnly:z.boolean().default(false),recent:z.array(reference).max(5).default([])}).strict(),
  method:'POST',path:a=>`/workspaces/${a.workspaceId}/search`,body:({workspaceId,...body})=>body,scoped:true,
  description:'Search the same private records as the workspace command palette. Returns at most five current audiences, campaigns, people or companies and their authorized UI targets. Use peopleOnly for people; an empty query resolves supplied recent references in order. Company targets open the filtered Companies list; people targets open the canonical person. Human tokens require workspace:access. Requires current membership; member agent policy applies. This is a read and changes no records.',
 },
};
