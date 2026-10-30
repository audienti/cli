import {z} from 'zod';
const uuid=z.string().uuid(),workspace={workspaceId:uuid.optional()},locator={...workspace,offerId:uuid};
const fields=z.object({name:z.string(),description:z.string().optional(),url:z.string().optional(),avoidClaims:z.array(z.string()).optional(),pricing:z.object({currency:z.string().optional(),oneTimeAmountCents:z.number().optional(),recurringAmountCents:z.number().optional(),recurringInterval:z.enum(['monthly','annual']).optional(),notes:z.string().optional()}).strict().optional()}).strict();
const path=a=>`/workspaces/${a.workspaceId}/offers`;
export const offerOperations={
 offer_list:{schema:z.object({...workspace,archived:z.boolean().optional(),limit:z.number().int().optional(),after:uuid.optional(),q:z.string().optional()}).strict(),method:'GET',path:a=>path(a)+'?'+new URLSearchParams(Object.fromEntries(Object.entries({archived:a.archived,limit:a.limit,after:a.after,q:a.q}).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)]))),scoped:true},
 offer_get:{schema:z.object({...locator,revision:z.number().int().optional()}).strict(),method:'GET',path:a=>path(a)+`/${a.offerId}`+(a.revision===undefined?'':`?revision=${a.revision}`),scoped:true},
 offer_create:{schema:z.object({...workspace,requestId:uuid,fields}).strict(),method:'POST',path,body:a=>({requestId:a.requestId,fields:a.fields}),scoped:true},
 offer_update:{schema:z.object({...locator,expectedRevision:z.number().int(),fields}).strict(),method:'POST',path:a=>path(a)+`/${a.offerId}/revisions`,body:a=>({expectedRevision:a.expectedRevision,fields:a.fields}),scoped:true},
 offer_archive:{schema:z.object(locator).strict(),method:'POST',path:a=>path(a)+`/${a.offerId}/archive`,scoped:true},
 offer_restore:{schema:z.object(locator).strict(),method:'POST',path:a=>path(a)+`/${a.offerId}/restore`,scoped:true},
};
