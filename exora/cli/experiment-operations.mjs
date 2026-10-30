import {z} from 'zod';
const uuid=z.string().uuid(),workspace={workspaceId:uuid.optional()},locator={...workspace,experimentId:uuid};
const state=z.enum(['Preparing','Active','Paused','Closing','Archived']);
const signalBase={id:uuid,scope:z.enum(['company','person']),details:z.string().optional()};
const signal=z.discriminatedUnion('kind',[
 z.object({...signalBase,kind:z.literal('research'),question:z.string(),expected:z.boolean().optional()}).strict(),
 z.object({...signalBase,kind:z.literal('topic'),topic:z.string()}).strict(),
 z.object({...signalBase,kind:z.literal('profile'),url:z.string(),track:z.enum(['audience','activity']).optional(),interactions:z.array(z.enum(['comments','reactions'])).optional()}).strict(),
]);
const fields=z.object({name:z.string(),audienceId:uuid,audienceRevision:z.number().int(),offerId:uuid,offerRevision:z.number().int(),premise:z.string(),approach:z.string().optional(),approachPin:z.object({id:uuid,revision:z.number().int().positive()}).strict().optional(),notes:z.string().optional(),ownerUserId:uuid.nullable().optional(),tags:z.array(z.string()).optional(),signalMatch:z.enum(['any','all']).optional(),signals:z.array(signal).optional(),targets:z.discriminatedUnion('kind',[
 z.object({kind:z.literal('none'),values:z.array(z.never())}).strict(),
 z.object({kind:z.literal('companies'),values:z.array(z.object({type:z.enum(['domain','linkedin-company']),value:z.string()}).strict())}).strict(),
 z.object({kind:z.literal('people'),values:z.array(z.object({type:z.literal('linkedin-person'),value:z.string()}).strict())}).strict(),
]).optional(),channels:z.array(z.enum(['email','linkedin'])).optional(),approvalMode:z.literal('manual').optional(),contentOpsEnabled:z.boolean().optional(),schedule:z.object({startAt:z.string().nullable().optional(),endAt:z.string().nullable().optional(),maxCompanies:z.number().int().nullable().optional()}).strict().optional()}).strict();
const path=a=>`/workspaces/${a.workspaceId}/experiments`,detail=a=>path(a)+`/${a.experimentId}`;
const qs=a=>new URLSearchParams(Object.fromEntries(Object.entries(a).filter(([k,v])=>!['workspaceId','experimentId'].includes(k)&&v!==undefined).map(([k,v])=>[k,String(v)])));
export const experimentOperations={
 experiment_list:{schema:z.object({...workspace,state:state.optional(),archived:z.boolean().optional(),q:z.string().optional(),limit:z.number().int().optional(),after:uuid.optional()}).strict(),method:'GET',path:a=>path(a)+'?'+qs(a),scoped:true},
 experiment_get:{schema:z.object({...locator,revision:z.number().int().optional()}).strict(),method:'GET',path:a=>detail(a)+'?'+qs(a),scoped:true},
 experiment_events:{schema:z.object({...locator,limit:z.number().int().optional(),after:uuid.optional()}).strict(),method:'GET',path:a=>detail(a)+'/events?'+qs(a),scoped:true},
 experiment_create:{schema:z.object({...workspace,requestId:uuid,fields}).strict(),method:'POST',path,body:a=>({requestId:a.requestId,fields:a.fields}),scoped:true},
 experiment_update:{schema:z.object({...locator,expectedRevision:z.number().int(),fields}).strict(),method:'POST',path:a=>detail(a)+'/revisions',body:a=>({expectedRevision:a.expectedRevision,fields:a.fields}),scoped:true},
 experiment_transition:{schema:z.object({...locator,expectedState:state,operation:z.enum(['activate','pause','resume','close','archive','restore']),reason:z.string().optional()}).strict(),method:'POST',path:a=>detail(a)+'/transitions',body:a=>({expectedState:a.expectedState,operation:a.operation,...(a.reason===undefined?{}:{reason:a.reason})}),scoped:true},
 experiment_successor:{schema:z.object({...locator,requestId:uuid,expectedRevision:z.number().int(),fields}).strict(),method:'POST',path:a=>detail(a)+'/successors',body:a=>({requestId:a.requestId,expectedRevision:a.expectedRevision,fields:a.fields}),scoped:true},
};
