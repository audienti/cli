import {z} from 'zod';
const text=(min,max)=>z.string().meta({minLength:min,maxLength:max});
const uuid=z.string().uuid(),version=z.number().int().min(0).max(2147483646);
const base={requestId:uuid,reason:text(1,2000).describe('Trimmed NFC; no controls including interior newlines or tabs. Does not authorize sending.')};
const alias={provider:z.enum(['email','linkedin']),accountRef:text(1,200).regex(/^[A-Za-z0-9@._:+\/-]+$/),expectedAliasVersion:version};
const identity=z.object({namespace:text(1,64).describe('Discovery namespace: trimmed and lowercased.'),accountId:text(1,256).describe('Trimmed printable ASCII provider identity; case-sensitive assertion, not verification.')}).strict();
const actionType=z.enum(['email.send','linkedin.send']);
const pageLimit=z.number().int().min(1).max(100).optional();
const query=a=>{const q=new URLSearchParams(Object.entries(a).map(([k,v])=>[k,String(v)]));return q.size?'?'+q:'';};
const path=a=>`/sender-accounts/${encodeURIComponent(a.senderAccountId)}`;
const body=a=>Object.fromEntries(Object.entries(a).filter(([key])=>!['senderAccountId','actionType'].includes(key)));
const opaque=z.string().trim().min(1).max(256).regex(/^[ -~]+$/);
export const senderAccountOperations={
 sender_activity_report:{schema:z.object({...base,senderAccountId:uuid,sourceEventId:opaque,namespace:identity.shape.namespace,occurredAt:z.iso.datetime({offset:true}),providerMessageId:opaque.nullable(),relatedAttemptId:uuid.nullable()}).strict(),method:'POST',path:a=>path(a)+'/activity',body},
 sender_alias_get:{schema:z.object({provider:alias.provider,accountRef:alias.accountRef}).strict(),method:'GET',path:a=>'/sender-accounts/alias'+query(a),ownerOnly:true},
 sender_accounts_list:{schema:z.object({cursor:uuid.optional(),limit:pageLimit}).strict(),method:'GET',path:a=>'/sender-accounts'+query(a)},
 sender_account_get:{schema:z.object({senderAccountId:uuid,aliasesCursor:text(1,1024).optional(),aliasesLimit:pageLimit,historyCursor:uuid.optional(),historyLimit:pageLimit}).strict(),method:'GET',path:a=>path(a)+query(body(a))},
 sender_account_register:{schema:z.object({...base,...alias,agentId:uuid,accountIdentity:identity}).strict(),method:'POST',path:()=>'/sender-accounts',ownerOnly:true},
 sender_alias_bind:{schema:z.object({...base,...alias,senderAccountId:uuid,agentId:uuid}).strict(),method:'POST',path:a=>path(a)+'/aliases',body,ownerOnly:true},
 sender_alias_unbind:{schema:z.object({...base,...alias,senderAccountId:uuid}).strict(),method:'POST',path:a=>path(a)+'/aliases/unbind',body,ownerOnly:true},
 sender_account_state_set:{schema:z.object({...base,senderAccountId:uuid,expectedVersion:version,state:z.enum(['active','retired'])}).strict(),method:'POST',path:a=>path(a)+'/lifecycle',body,ownerOnly:true},
 sender_automation_get:{schema:z.object({senderAccountId:uuid,actionType}).strict(),method:'GET',path:a=>path(a)+'/automation/'+encodeURIComponent(a.actionType)},
 sender_automation_set:{schema:z.object({...base,senderAccountId:uuid,actionType,expectedVersion:version,enabled:z.boolean()}).strict(),method:'POST',path:a=>path(a)+'/automation/'+encodeURIComponent(a.actionType),body,ownerOnly:true},
};
