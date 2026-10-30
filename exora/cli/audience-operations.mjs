import {z} from 'zod';
const uuid=z.string().uuid(),workspace={workspaceId:uuid.optional()},locator={...workspace,audienceId:uuid};
const criterion=z.object({name:z.string(),providerId:z.string().nullable().optional(),negative:z.boolean().optional()}).strict();
const location=criterion.extend({key:z.string().nullable().optional()}).strict();
const strings=z.array(z.string()).optional(),criteria=z.array(criterion).optional(),locations=z.array(location).optional();
const fields=z.object({name:z.string(),tags:strings,textCriteria:z.string().optional(),notes:z.string().optional(),discoveryKeyword:z.string().optional(),seniorityMatchMode:z.enum(['at_least','exact']).optional(),company:z.object({industries:criteria,industryGroups:strings,sizes:criteria,types:criteria,locations,keywords:z.object({include:strings,exclude:strings}).strict().optional()}).strict(),person:z.object({locations,currentTitles:criteria,pastTitles:criteria,seniorities:criteria,functions:criteria,bioPhrases:z.array(z.object({phrase:z.string(),negative:z.boolean().optional()}).strict()).optional(),allowedTitleExceptions:strings}).strict()}).strict();
const path=a=>`/workspaces/${a.workspaceId}/audiences`;
export const audienceOperations={
 audience_options:{schema:z.object({...workspace,kind:z.enum(['industries','industry_groups','sizes','types','seniorities','titles','locations','functions']),q:z.string().max(200).optional()}).strict(),method:'GET',path:a=>`/workspaces/${a.workspaceId}/audience-options?`+new URLSearchParams({kind:a.kind,...(a.q!==undefined?{q:a.q}:{})}),scoped:true},
 audience_list:{schema:z.object({...workspace,archived:z.boolean().optional(),limit:z.number().int().optional(),after:uuid.optional(),q:z.string().optional()}).strict(),method:'GET',path:a=>path(a)+'?'+new URLSearchParams(Object.fromEntries(Object.entries({archived:a.archived,limit:a.limit,after:a.after,q:a.q}).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)]))),scoped:true},
 audience_get:{schema:z.object({...locator,revision:z.number().int().optional()}).strict(),method:'GET',path:a=>path(a)+`/${a.audienceId}`+(a.revision===undefined?'':`?revision=${a.revision}`),scoped:true},
 audience_create:{schema:z.object({...workspace,requestId:uuid,fields}).strict(),method:'POST',path,body:a=>({requestId:a.requestId,fields:a.fields}),scoped:true},
 audience_update:{schema:z.object({...locator,expectedRevision:z.number().int(),fields}).strict(),method:'POST',path:a=>path(a)+`/${a.audienceId}/revisions`,body:a=>({expectedRevision:a.expectedRevision,fields:a.fields}),scoped:true},
 audience_archive:{schema:z.object(locator).strict(),method:'POST',path:a=>path(a)+`/${a.audienceId}/archive`,scoped:true},
 audience_restore:{schema:z.object(locator).strict(),method:'POST',path:a=>path(a)+`/${a.audienceId}/restore`,scoped:true},
};
