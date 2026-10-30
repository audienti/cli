import { z } from 'zod';
const uuid=z.string().uuid(), time=z.iso.datetime({offset:true}), version=z.number().int().min(0).max(2147483646);
const reason=z.string().meta({minLength:1,maxLength:2000,description:'Trimmed NFC reason, 1–2000 Unicode code points, no controls or unpaired surrogates.'});
const opaque=z.string().trim().min(1).max(256).regex(/^[ -~]+$/);
const unavailable=z.object({availability:z.literal('unavailable'),reason}).strict();
const evidence=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('provider_report'),reference:opaque,observedAt:time}).strict(),
 z.object({kind:z.literal('account_evidence'),evidenceId:uuid,observedAt:time}).strict(),
 z.object({kind:z.literal('owner_confirmation'),observedAt:time}).strict(),
 z.object({kind:z.literal('no_dispatch'),journalRef:opaque,sealed:z.literal(true)}).strict(),
 z.object({kind:z.literal('transport_uncertain'),reference:opaque,observedAt:time}).strict(),
]);
const content=z.union([
 z.object({subject:z.string().meta({minLength:1,maxLength:256}),body:z.string().meta({minLength:1,maxLength:20000})}).strict(),
 z.object({body:z.string().meta({minLength:1,maxLength:8000})}).strict(),
]);
export const workExecutionResultSchema=z.discriminatedUnion('outcome',[
 z.object({outcome:z.literal('succeeded'),actualContent:z.union([unavailable,z.object({availability:z.literal('available'),content}).strict()]),providerMessageId:z.union([unavailable,z.object({availability:z.literal('available'),value:opaque}).strict()]),effectAt:time.nullable(),evidence}).strict(),
 z.object({outcome:z.literal('failed'),effect:z.literal('none'),evidence}).strict(),
 z.object({outcome:z.literal('unknown'),effect:z.literal('possible'),evidence}).strict(),
]);
const location={workspaceId:uuid.optional(),planId:uuid,clientActionId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)};
const path=a=>`/workspaces/${a.workspaceId}/work/${a.planId}/actions/${encodeURIComponent(a.clientActionId)}`;
const body=({workspaceId,planId,clientActionId,attemptId,...rest})=>rest;
export const workspaceExecutionOperations={
 workspace_work_claim:{schema:z.object({...location,expectedRevision:z.number().int().positive(),requestId:uuid}).strict(),scoped:true,method:'POST',path:a=>`${path(a)}/claims`,body},
 workspace_work_start:{schema:z.object({...location,claimId:uuid,requestId:uuid}).strict(),scoped:true,method:'POST',path:a=>`${path(a)}/start`,body},
 workspace_work_attempt_get:{schema:z.object({...location,historyCursor:uuid.optional(),historyLimit:z.number().int().min(1).max(100).optional()}).strict(),scoped:true,method:'GET',path:a=>{const q=new URLSearchParams();for(const key of ['historyCursor','historyLimit'])if(a[key]!==undefined)q.set(key,String(a[key]));return `${path(a)}/attempt?${q}`;}},
};
export const narrowExecutionOperations={
 work_claim_release:{schema:z.object({claimId:uuid,requestId:uuid,reason}).strict(),method:'POST',path:a=>`/work-execution/claims/${a.claimId}/release`,body:({claimId,...rest})=>rest},
 work_attempt_lookup:{schema:z.object({claimId:uuid}).strict(),method:'GET',path:a=>`/work-execution/claims/${a.claimId}/attempt`},
 work_result_report:{schema:z.object({attemptId:uuid,requestId:uuid,mode:z.enum(['report','correct']),expectedResultVersion:version,reason,result:workExecutionResultSchema}).strict(),method:'POST',path:a=>`/work-execution/attempts/${a.attemptId}/results`,body},
};
export const workExecutionOperations={...workspaceExecutionOperations,...narrowExecutionOperations};
