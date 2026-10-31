import {z} from 'zod';
const uuid=z.string().uuid(),workspaceId=uuid.optional();
const base=a=>`/workspaces/${a.workspaceId}/agent-queue`;
const note=z.string().trim().max(2000).optional();
const description='Agent work queue: what Audienti says is due in this workspace. Claim one task at a time; a claim stops other agents in your fleet from doing the same work. Tasks never grant send authority.';
export const queueOperations={
 agent_queue_list:{schema:z.object({workspaceId}).strict(),method:'GET',path:a=>base(a),scoped:true,description:`${description} Read this first after you connect and every time you finish a task. Returns orientation (what Audienti is and how to work), your status, next (the task to do now), holding (tasks you claimed), available (tasks you can take), fleet (tasks other agents hold) and pollAfterSeconds.`},
 agent_queue_claim:{schema:z.object({workspaceId,taskId:uuid,leaseMinutes:z.number().int().min(5).max(240).optional()}).strict(),method:'POST',path:a=>`${base(a)}/${a.taskId}/claim`,body:a=>a.leaseMinutes===undefined?{}:{leaseMinutes:a.leaseMinutes},scoped:true,description:`${description} Claim a task before you start it. The lease lasts 30 minutes unless you ask for more; claim again to extend it. Error task_taken means another agent holds it: pick another task.`},
 agent_queue_complete:{schema:z.object({workspaceId,taskId:uuid,outcome:z.enum(['done','skipped']).optional(),note}).strict(),method:'POST',path:a=>`${base(a)}/${a.taskId}/complete`,body:a=>({outcome:a.outcome??'done',...(a.note?{note:a.note}:{})}),scoped:true,description:`${description} Report a task you hold as done, or as skipped with a note that says why. Say what you did in note (for example how many prospects you admitted).`},
 agent_queue_release:{schema:z.object({workspaceId,taskId:uuid,note}).strict(),method:'POST',path:a=>`${base(a)}/${a.taskId}/release`,body:a=>a.note?{note:a.note}:{},scoped:true,description:`${description} Give a task back so another agent can take it. Say why in note.`},
};
