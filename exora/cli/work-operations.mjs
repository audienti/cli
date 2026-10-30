import { z } from 'zod';
const uuid = z.string().uuid(), version = z.number().int().nonnegative();
const workspace = { workspaceId: uuid.optional() };
const page = z.object({cursor: uuid.optional(), limit: z.number().int().min(1).max(100).optional()}).strict();
const clientId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const accountRef = z.string().min(1).max(200).regex(/^[A-Za-z0-9@._:+\/-]+$/);
const evidence = z.array(uuid).max(100);
const commonAction = {clientActionId: clientId, reason: z.string().min(1), evidenceIds: evidence, replyToEvidenceId: uuid.optional()};
const email = z.object({...commonAction, type:z.literal('email.send'), content:z.object({subject:z.string(),body:z.string()}).strict(),recipient:z.object({prospectId:uuid,email:z.string(),contactId:uuid.optional()}).strict(),sender:z.object({provider:z.literal('email'),accountRef,senderAccountId:uuid.optional()}).strict()}).strict();
const linkedin = z.object({...commonAction,type:z.literal('linkedin.send'),content:z.object({body:z.string()}).strict(),recipient:z.object({prospectId:uuid,profileUrl:z.string(),contactId:uuid.optional()}).strict(),sender:z.object({provider:z.literal('linkedin'),accountRef,senderAccountId:uuid.optional()}).strict()}).strict();
const cadence = z.object({clientActionId:clientId,afterClientActionId:clientId.nullable(),trigger:z.literal('reported_success').nullable(),at:z.string().nullable(),waitSeconds:z.number().int().min(0).max(7776000).nullable(),condition:z.literal('no_pending_reply').nullable()}).strict();
const located = {...workspace,planId:uuid,clientActionId:clientId};
const mutation = {...located,expectedRevision:z.number().int().positive(),requestId:uuid};
const root = a => `/workspaces/${a.workspaceId}`;
const plan = a => `${root(a)}/work/${a.planId}`;
const action = a => `${plan(a)}/actions/${encodeURIComponent(a.clientActionId)}`;
const omit = (a, keys) => Object.fromEntries(Object.entries(a).filter(([k])=>!keys.includes(k)));
const body = a => omit(a,['workspaceId','planId','clientActionId']);
const qs = values => { const p=new URLSearchParams(); for(const [k,v] of Object.entries(values)) if(v!==undefined)p.set(k,String(v));return p.toString(); };
export const workOperations = {
 workspace_work_action_plan_save: {schema:z.object({...workspace,planId:uuid.nullable(),prospectId:uuid,experimentId:uuid.nullable(),experimentRevision:z.number().int().positive().nullable(),expectedRevision:version,requestId:uuid,origin:z.discriminatedUnion('kind',[z.object({kind:z.literal('agent'),skill:z.object({id:z.string(),version:z.string()}).strict()}).strict(),z.object({kind:z.literal('human'),editReason:z.string()}).strict()]),rationale:z.string(),evidenceIds:evidence,actions:z.array(z.discriminatedUnion('type',[email,linkedin])).min(1).max(50),cadence:z.array(cadence).max(50)}).strict(), method:'POST',path:a=>`${root(a)}/action-plans`,body:a=>omit(a,['workspaceId']),scoped:true},
 workspace_work_operator_list: {schema:z.object({...workspace,page:page.optional(),filter:z.object({state:z.enum(['open','cancelled','terminal','invalidated']).optional(),reviewStatus:z.enum(['awaiting_revision','invalidated','pending_review','approved','in_progress','reconciliation_required','completed','cancelled']).optional(),search:z.string().optional(),queue:z.enum(['review','blocked','activity']).optional()}).strict().optional()}).strict(),method:'GET',path:a=>`${root(a)}/operator/work?${qs({...a.page,...a.filter})}`,scoped:true},
 workspace_work_operator_get: {schema:z.object({...workspace,planId:uuid,revision:z.number().int().positive().optional(),history:page.optional()}).strict(),method:'GET',path:a=>`${plan(a)}?${qs({revision:a.revision,historyCursor:a.history?.cursor,historyLimit:a.history?.limit})}`,scoped:true},
 workspace_work_action_approve: {schema:z.object({...mutation,expectedApprovalVersion:version}).strict(),method:'POST',path:a=>`${action(a)}/approve`,body,scoped:true},
 workspace_work_action_withdraw: {schema:z.object({...mutation,expectedApprovalVersion:z.number().int().positive(),reason:z.string().min(1)}).strict(),method:'POST',path:a=>`${action(a)}/withdraw`,body,scoped:true},
 workspace_work_action_cancel: {schema:z.object({...mutation,reason:z.string().min(1)}).strict(),method:'POST',path:a=>`${action(a)}/cancel`,body,scoped:true},
 workspace_work_eligibility_get: {schema:z.object(located).strict(),method:'GET',path:a=>`${action(a)}/eligibility`,scoped:true},
};
