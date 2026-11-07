import { z } from 'zod';
const uuid = z.string().uuid(), workspace = { workspaceId: uuid.optional() };
const root = a => `/workspaces/${a.workspaceId}/tools`;
const toolId = z.string().regex(/^[a-z][a-z0-9._]{0,63}$/);
const key = z.string().regex(/^[a-z][a-z0-9_]{0,47}$/).refine(v => !['constructor','prototype'].includes(v));
const instruction = z.string().trim().min(1).max(4000);
const question = z.discriminatedUnion('type', [
 z.object({type:z.literal('boolean'),instructions:instruction,criteria:z.object({true:instruction.optional(),false:instruction.optional()}).strict().optional()}).strict(),
 z.object({type:z.literal('choice'),instructions:instruction,criteria:z.record(key,z.string().max(2000)).refine(v=>Object.keys(v).length>=1&&Object.keys(v).length<=32)}).strict(),
 z.object({type:z.literal('score'),instructions:instruction,criteria:z.array(instruction).min(1).max(10)}).strict(),
]);
const page = { page:z.number().int().min(1).max(10000).optional(), paginationToken:z.string().min(1).max(4096).optional() };
const postedLimit = z.enum(['24h','week','month']).optional();
const contentInputs = {
 'posts.fetch':z.object({url:z.string().min(1).max(2048),topicId:uuid}).strict(),
 'posts.search':z.object({query:z.string().trim().min(1).max(500),topicId:uuid,postedLimit,...page,sortBy:z.enum(['relevance','date']).optional()}).strict(),
 'posts.comments':z.object({postId:uuid,...page}).strict(),
 'posts.reactions':z.object({postId:uuid,page:page.page}).strict(),
 'profiles.search':z.object({kind:z.enum(['person','company']).optional(),query:z.string().trim().min(1).max(500).optional(),title:z.string().trim().min(1).max(200).optional(),location:z.string().trim().min(1).max(200).optional(),geoId:z.string().regex(/^\d{1,20}$/).optional(),industryIds:z.array(z.string().regex(/^\d{1,20}$/)).max(20).optional(),keywordsCompany:z.string().trim().min(1).max(200).optional(),currentCompany:z.string().trim().min(1).max(1024).optional(),companySizes:z.array(z.enum(['1-10','11-50','51-200','201-500','501-1000','1001-5000','5001-10000','10001+'])).max(8).optional(),page:page.page,saveProfiles:z.boolean().optional()}).strict(),
 'profiles.posts':z.object({profileId:uuid,topicId:uuid,postedLimit,...page}).strict(),
};
const contentOperations = Object.fromEntries(Object.entries(contentInputs).map(([tool,input])=>[`tools_${tool.replaceAll('.','_')}`,{tool,paid:true,schema:z.object({...workspace,requestId:uuid,input}).strict(),method:'POST',path:a=>root(a)+'/'+tool,body:a=>({requestId:a.requestId,input:a.input}),scoped:true,timeoutMs:30000}]));
const recordsRoot = (a,kind) => `/workspaces/${a.workspaceId}/${kind}`;
const contactInputs = {
 'email.find':z.object({profileId:uuid,domain:z.string().trim().min(1).max(253),refresh:z.boolean().optional(),cached:z.boolean().optional()}).strict(),
 'mobile.find':z.object({profileId:uuid,email:z.string().min(1).max(320).optional(),refresh:z.boolean().optional(),cached:z.boolean().optional()}).strict(),
};
export const hostedToolOperations = {
 ...Object.fromEntries(Object.entries(contactInputs).map(([tool,input])=>[`tools_${tool.replaceAll('.','_')}`,{tool,paid:true,limits:{cacheDays:7,maximumAttempts:tool==='email.find'?130:3},schema:z.object({...workspace,requestId:uuid,input}).strict(),method:'POST',path:a=>root(a)+'/'+tool,body:a=>({requestId:a.requestId,input:a.input}),scoped:true,timeoutMs:60000}])),
 tools_email_verify:{tool:'email.verify',paid:true,limits:{providerCalls:1,cacheDays:7},schema:z.object({...workspace,requestId:uuid,input:z.object({email:z.string().max(320),refresh:z.boolean().optional(),cached:z.boolean().optional()}).strict()}).strict(),method:'POST',path:a=>root(a)+'/email.verify',body:a=>({requestId:a.requestId,input:a.input}),scoped:true,timeoutMs:30000},
 ...contentOperations,
 topics_create:{traced:true,schema:z.object({...workspace,requestId:uuid,name:z.string().trim().min(1).max(200),slug:z.string().max(200).optional(),description:z.string().max(4000).optional()}).strict(),method:'POST',path:a=>recordsRoot(a,'topics'),body:({workspaceId,...a})=>a,scoped:true},
 ...Object.fromEntries(['topics','posts'].flatMap(kind=>[
  [`${kind}_list`,{traced:true,schema:z.object({...workspace,cursor:uuid.optional(),...(kind==='posts'?{topicId:uuid.optional()}:{})}).strict(),method:'GET',path:a=>recordsRoot(a,kind)+'?'+new URLSearchParams(Object.fromEntries(Object.entries({cursor:a.cursor,topicId:a.topicId}).filter(([,v])=>v))),scoped:true}],
  [`${kind}_get`,{traced:true,schema:z.object({...workspace,id:uuid}).strict(),method:'GET',path:a=>recordsRoot(a,kind)+'/'+a.id,scoped:true}],
 ])),
 tools_list:{schema:z.object(workspace).strict(),method:'GET',path:root,scoped:true},
 tools_search:{schema:z.object({...workspace,query:z.string().trim().min(1).max(200),limit:z.number().int().min(1).max(50).optional()}).strict(),method:'GET',path:a=>root(a)+'/search?'+new URLSearchParams({q:a.query,...a.limit!==undefined?{limit:String(a.limit)}:{}}),scoped:true,description:'One search across hosted tools, Audienti CLI commands and skills. Product words work (ICP finds audience tools, commands and skills; enrich finds profile tools) and so do provider names. Returns compact rows only: id, kind (tool, command or skill), one-line description and, for paid tools, the price per call or the metered unit. Then tools_get for a tool\'s inputs and tools_call to run it.'},
 tools_get:{schema:z.object({...workspace,tool:toolId}).strict(),method:'GET',path:a=>root(a)+'/'+encodeURIComponent(a.tool),scoped:true,description:'One catalog tool: input JSON schema, limits, price per call, whether it is configured and available now, and this workspace\'s own 30-day call count, success rate and median speed.'},
 tools_call:{paid:true,generic:true,schema:z.object({...workspace,tool:toolId,requestId:uuid,input:z.record(z.string(),z.unknown())}).strict(),method:'POST',path:a=>root(a)+'/call',body:a=>({tool:a.tool,requestId:a.requestId,input:a.input}),scoped:true,timeoutMs:90000,description:'Run any catalog tool by id (audienti.<object>.<verb>) or old name (find ids with tools_search, inputs with tools_get). Record tools accept input cached:false to skip the saved record and make a fresh paid call. Charged through workspace credits like the per-tool operations. Generate requestId once and reuse it with the same input after any interruption or error: a replay is free and returns the saved result, a new ID is a new purchase. A timeout may have consumed paid work; inspect tools_runs_get rather than redispatching with a new ID. Positive credit balance is required for paid dispatch; completion may overdraw. Rejected means no provider dispatch.'},
 tools_web_search:{tool:'web.search',paid:true,limits:{providerCalls:1,cacheHours:24},schema:z.object({...workspace,requestId:uuid,input:z.object({query:z.string().trim().min(1).max(1000),country:z.string().regex(/^[A-Za-z]{2}$/).optional(),language:z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).optional(),page:z.number().int().min(1).max(100).optional(),limit:z.number().int().min(1).max(10).optional(),timeRange:z.enum(['day','week','month','year']).optional(),refresh:z.boolean().optional(),cached:z.boolean().optional()}).strict()}).strict(),method:'POST',path:a=>root(a)+'/web.search',body:a=>({requestId:a.requestId,input:a.input}),scoped:true,timeoutMs:30000},
 tools_web_fetch:{tool:'web.fetch',paid:true,limits:{providerCalls:3,resultCache:false},schema:z.object({...workspace,requestId:uuid,input:z.object({url:z.string().min(1).max(2048)}).strict()}).strict(),method:'POST',path:a=>root(a)+'/web.fetch',body:a=>({requestId:a.requestId,input:a.input}),scoped:true,timeoutMs:90000},
 tools_proxy_sessions_create:{tool:'proxy.sessions.create',paid:true,limits:{maxSeconds:3600,concurrentWorkspaceConnections:32,meter:'upstream_tcp_payload_bytes'},schema:z.object({...workspace,requestId:uuid,input:z.object({ttlSeconds:z.number().int().min(60).max(3600).optional(),parentOperationId:uuid.optional()}).strict()}).strict(),method:'POST',path:a=>root(a)+'/proxy.sessions.create',body:a=>({requestId:a.requestId,input:a.input}),scoped:true,timeoutMs:30000},
 tools_proxy_sessions_close:{tool:'proxy.sessions.close',schema:z.object({...workspace,operationId:uuid}).strict(),method:'POST',path:a=>root(a)+'/proxy.sessions.close',body:a=>({operationId:a.operationId}),scoped:true},
 tools_decide:{tool:'decide',paid:true,schema:z.object({...workspace,requestId:uuid,input:z.object({state:z.union([z.string(),z.record(z.string(),z.unknown()),z.array(z.unknown())]),questions:z.record(key,question).refine(v=>Object.keys(v).length>=1&&Object.keys(v).length<=16)}).strict()}).strict(),method:'POST',path:a=>root(a)+'/decide',body:a=>({requestId:a.requestId,input:a.input}),scoped:true,timeoutMs:30000},
 tools_intent_label:{tool:'intent.label',paid:true,limits:{textCharacters:4000,contextCharacters:2000,suggestions:2},description:'Suggest what a message means. Paid: built on decide, billed on the input tokens the provider measures at the decide price (read it first with tools_get audienti.intent.label: tokenPrice). Give the message text, direction (inbound or outbound) and channel, and optionally context. Returns up to two suggestions from the intent label list (one reading, one meeting label), each with a quote that is words of the message, a plain reason, a confidence and any typed detail still to add (needs). Records nothing and sends nothing: record a suggestion you keep with intent_record, which runs every check again. Reuse requestId after any interruption; a replay is free.',schema:z.object({...workspace,requestId:uuid,input:z.object({text:z.string().min(1).max(4000),direction:z.enum(['inbound','outbound']),channel:z.enum(['email','linkedin']),context:z.string().trim().min(1).max(2000).optional()}).strict()}).strict(),method:'POST',path:a=>root(a)+'/intent.label',body:a=>({requestId:a.requestId,input:a.input}),scoped:true,timeoutMs:30000},
 tools_profiles_fetch:{tool:'profiles.fetch',paid:true,schema:z.object({...workspace,requestId:uuid,input:z.object({url:z.string().min(1).max(1024),refresh:z.boolean().optional(),cached:z.boolean().optional(),fields:z.array(z.enum(['name','headline','about','location','experience','currentPositions','education','skills','websites','photo','connections','followers','certifications','languages','industries','employeeCount','employeeCountRange','founded','specialities','locations','companyType'])).min(1).max(20).optional()}).strict()}).strict(),method:'POST',path:a=>root(a)+'/profiles.fetch',body:a=>({requestId:a.requestId,input:a.input}),scoped:true,timeoutMs:30000},
 tools_runs_get:{schema:z.object({...workspace,operationId:uuid,attemptAfter:z.number().int().min(0).max(2147483647).optional(),entryAfter:uuid.optional()}).strict(),method:'GET',path:a=>root(a)+`/runs/${a.operationId}`+((a.attemptAfter!==undefined||a.entryAfter)?`?${new URLSearchParams({...a.attemptAfter!==undefined?{attemptAfter:String(a.attemptAfter)}:{},...a.entryAfter?{entryAfter:a.entryAfter}:{}})}`:''),scoped:true},
 tools_runs_list:{schema:z.object({...workspace,cursor:uuid.optional()}).strict(),method:'GET',path:a=>root(a)+'/runs'+(a.cursor?`?cursor=${encodeURIComponent(a.cursor)}`:''),scoped:true},
 tools_balance:{schema:z.object(workspace).strict(),method:'GET',path:a=>root(a)+'/balance',scoped:true},
};

hostedToolOperations.tools_profiles_search.description = 'Legacy external paid Profile search, not saved database search. Retrieves one fresh provider page. Reuse requestId after interruptions; a timeout may have consumed paid work. Inspect tools_runs_get rather than redispatching with a new ID.';
// Compatibility aliases share server admission identity; response shape is explicit.
const fetchDescriptor = hostedToolOperations.tools_profiles_fetch;
const fetchInput = fetchDescriptor.schema.shape.input;
hostedToolOperations.tools_profiles_enrich = {
 ...fetchDescriptor, tool: 'profiles.enrich', description: 'Explicit paid Profile enrichment by URL or authorized saved Profile ID; eligible 30-day cache reuse is free and refresh forces paid admission. Returns operation plus current workspace Prospect/profile projection. Shares admission identity with profiles.fetch. Reuse requestId after interruptions; a timeout may have consumed paid work. Inspect tools_runs_get rather than redispatching with a new ID.', limits: { providerCalls: 1, normalizedBytes: 65536, cacheDays: 30 }, resultKey: 'operation', canonicalTool: 'profiles.fetch',
 schema: fetchDescriptor.schema.extend({ input: z.union([fetchInput, fetchInput.omit({url:true}).extend({profileId:uuid}).strict()]) }),
 path: a => root(a) + '/profiles.enrich',
};
hostedToolOperations.tools_profiles_discover = {
 ...hostedToolOperations.tools_profiles_search, tool: 'profiles.discover', description: 'Explicit paid external Profile discovery. Same admission identity and result as legacy profiles.search. For saved workspace profiles use profile_list. Reuse requestId after interruptions; a timeout may have consumed paid work. Inspect tools_runs_get rather than redispatching with a new ID.', canonicalTool: 'profiles.search',
 path: a => root(a) + '/profiles.discover',
};
export const paidToolOperations = Object.fromEntries(Object.entries(hostedToolOperations).filter(([,operation])=>operation.paid));
export const paidToolByName = Object.fromEntries(Object.entries(paidToolOperations).filter(([,operation])=>operation.tool).map(([name,operation])=>[operation.tool,{name,...operation}]));
// tools_call is paid except for the free proxy.sessions.close control call, which has no requestId or fee.
export const isPaidToolOperation = (name, args) => name === 'tools_call' ? !['proxy.sessions.close', 'audienti.proxy.session.close'].includes(args?.tool) : Object.hasOwn(paidToolOperations, name);

// Only known descriptor shape decides where a paid operation lives. Never infer
// a nested operation for unrelated responses or let projection state mask billing.
// Through tools_call the shape follows the resolved tool: profiles.enrich nests its operation.
export const paidToolResult = (name, data, args) => {
 if (name === 'tools_call') return ['profiles.enrich', 'audienti.people.profile.enrich'].includes(args?.tool) ? data?.operation : data;
 const descriptor = paidToolOperations[name];
 return descriptor?.resultKey ? data?.[descriptor.resultKey] : data;
};

