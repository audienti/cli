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
 workspace_work_send:{schema:z.object({...location,claimId:uuid,requestId:uuid}).strict(),scoped:true,method:'POST',path:a=>`${path(a)}/send`,body,description:'LinkedIn accounts connected through Audienti only. Starts the claimed, approved action and sends it once through the managed account, then records the result. Replaying the same claim returns the recorded send; it never sends again.'},
 workspace_work_attempt_get:{schema:z.object({...location,historyCursor:uuid.optional(),historyLimit:z.number().int().min(1).max(100).optional()}).strict(),scoped:true,method:'GET',path:a=>{const q=new URLSearchParams();for(const key of ['historyCursor','historyLimit'])if(a[key]!==undefined)q.set(key,String(a[key]));return `${path(a)}/attempt?${q}`;}},
};
// LinkedIn accounts connected through Audienti. Only the user connects one; agents list them and send through work send.
export const managedAccountOperations={
 workspace_managed_accounts_list:{schema:z.object({workspaceId:uuid.optional()}).strict(),scoped:true,method:'GET',path:a=>`/workspaces/${a.workspaceId}/managed-accounts`,description:'List the LinkedIn accounts connected through Audienti in this workspace, with their sending account IDs and status.'},
 workspace_managed_account_plan_set:{schema:z.object({workspaceId:uuid.optional(),managedAccountId:uuid,plan:z.enum(['free','premium_career','premium_business','premium_all_in_one','sales_navigator_core','sales_navigator_advanced','recruiter_lite']).nullable()}).strict(),scoped:true,method:'PUT',path:a=>`/workspaces/${a.workspaceId}/managed-accounts/${a.managedAccountId}/plan`,body:a=>({plan:a.plan}),description:'The user only, not agents. States the LinkedIn plan of a managed account, which sets how long a connection note may be. Pass plan null to clear it; the safer figures then apply. Returns the account.'},
 workspace_managed_post_create:{schema:z.object({workspaceId:uuid.optional(),managedAccountId:uuid,requestId:uuid,text:z.string().trim().min(1).max(3000),attachmentId:uuid.optional(),reason:z.string().trim().max(500).optional()}).strict(),scoped:true,method:'POST',path:a=>`/workspaces/${a.workspaceId}/managed-accounts/${a.managedAccountId}/posts`,body:({workspaceId,managedAccountId,...rest})=>rest,description:'Publish a post you wrote from a LinkedIn account connected through Audienti. Only the account owner or their agent may. Text up to 3000 characters; at most one image (upload it first with attachment_upload and pass its id as attachmentId). The account\'s Publish posts mode decides: Automatic publishes now (state published; 429 limit_reached at the day\'s limit), Draft for approval saves a draft for the owner (state draft), Off refuses with 409 mode_not_allowed (do not post). A repeated requestId returns the same post and never posts twice. There is no default template: write the post yourself.'},
 workspace_managed_posts_list:{schema:z.object({workspaceId:uuid.optional(),managedAccountId:uuid.optional(),state:z.enum(['draft','approved','posting','published','rejected','failed','unknown']).optional(),limit:z.number().int().min(1).max(100).optional()}).strict(),scoped:true,method:'GET',path:a=>`/workspaces/${a.workspaceId}/managed-posts?`+new URLSearchParams({...a.managedAccountId?{managedAccountId:a.managedAccountId}:{},...a.state?{state:a.state}:{},...a.limit!==undefined?{limit:String(a.limit)}:{}}),description:'The posts of managed LinkedIn accounts, newest first, with each account\'s Publish posts mode and how many posts it made today against its day limit.'},
 workspace_managed_post_get:{schema:z.object({workspaceId:uuid.optional(),postId:uuid}).strict(),scoped:true,method:'GET',path:a=>`/workspaces/${a.workspaceId}/managed-posts/${a.postId}`,description:'One post of a managed LinkedIn account and its state: draft, approved (queued for the day limit), posting, published, rejected, failed or unknown (never repeated).'},
 workspace_managed_post_approve:{schema:z.object({workspaceId:uuid.optional(),postId:uuid,text:z.string().trim().min(1).max(3000).optional()}).strict(),scoped:true,method:'POST',path:a=>`/workspaces/${a.workspaceId}/managed-posts/${a.postId}/approve`,body:({workspaceId,postId,...rest})=>rest,description:'The account owner only, a person, not agents. Approves a draft post, optionally with edited text. It is published now, or queued (state approved) when the day\'s limit is full.'},
 workspace_managed_post_reject:{schema:z.object({workspaceId:uuid.optional(),postId:uuid,reason:z.string().trim().max(500).optional()}).strict(),scoped:true,method:'POST',path:a=>`/workspaces/${a.workspaceId}/managed-posts/${a.postId}/reject`,body:({workspaceId,postId,...rest})=>rest,description:'The account owner only, a person, not agents. Rejects a draft or queued post. Nothing is posted.'},
 workspace_managed_account_connect:{schema:z.object({workspaceId:uuid.optional()}).strict(),scoped:true,method:'POST',path:a=>`/workspaces/${a.workspaceId}/managed-accounts/connect`,body:()=>({}),description:'The user only, not agents. Returns a sign-in link, valid 15 minutes, where the user connects a LinkedIn account through Audienti.'},
};
export const narrowExecutionOperations={
 work_claim_release:{schema:z.object({claimId:uuid,requestId:uuid,reason}).strict(),method:'POST',path:a=>`/work-execution/claims/${a.claimId}/release`,body:({claimId,...rest})=>rest},
 work_attempt_lookup:{schema:z.object({claimId:uuid}).strict(),method:'GET',path:a=>`/work-execution/claims/${a.claimId}/attempt`},
 work_result_report:{schema:z.object({attemptId:uuid,requestId:uuid,mode:z.enum(['report','correct']),expectedResultVersion:version,reason,result:workExecutionResultSchema}).strict(),method:'POST',path:a=>`/work-execution/attempts/${a.attemptId}/results`,body},
};
export const workExecutionOperations={...workspaceExecutionOperations,...narrowExecutionOperations};
