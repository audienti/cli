import {z} from 'zod';
// Agent state store (ADR 017). One map feeds the CLI, the MCP server and the HTTP client alike.
const uuid=z.string().uuid(),workspaceId=uuid.optional();
const key=z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/,'A key is 1 to 200 letters, digits, dots, colons, @, slashes, underscores or hyphens, and starts with a letter or digit.');
const text=z.string().min(1).max(200);
const paging={after:key.optional(),limit:z.number().int().min(1).max(50).optional()};
const base=a=>`/workspaces/${a.workspaceId}/agent-kv`;
const query=(a,keys)=>{const q=new URLSearchParams(keys.filter(k=>a[k]!==undefined).map(k=>[k,String(a[k])])).toString();return q?`?${q}`:''};
const body=keys=>a=>Object.fromEntries(keys.filter(k=>a[k]!==undefined).map(k=>[k,a[k]]));
const description="Agent state store: small values your user's agents share in this workspace between runs (cursors, change tokens, hashes, ids, timestamps). Every entry expires, by default 30 days after its last write. Never store credentials here; the Vault holds secrets and you store the Vault key name.";
export const kvOperations={
 agent_kv_get:{schema:z.object({workspaceId,key}).strict(),method:'GET',path:a=>`${base(a)}/get${query(a,['key'])}`,scoped:true,description:`Read one entry: value, version, expiresAt and which agent wrote it. 404 not_found when missing or expired. ${description}`},
 agent_kv_set:{schema:z.object({workspaceId,key,value:z.any(),ifVersion:z.number().int().min(1).optional(),nx:z.boolean().optional(),ttlSeconds:z.number().int().min(60).max(31536000).optional(),expiresAt:z.string().datetime({offset:true}).optional(),requestId:uuid.optional()}).strict(),method:'POST',path:a=>`${base(a)}/set`,body:body(['key','value','ifVersion','nx','ttlSeconds','expiresAt','requestId']),scoped:true,description:`Write one entry (a string, number, boolean, array or object up to 8 KB). A write refreshes expiry; ttlSeconds or expiresAt sets it, at most 365 days. ifVersion is compare-and-set: 409 version_conflict when the live version differs. nx writes only when no live entry exists. Reuse requestId on a retry: the same body replays for 30 days and answers replayed: true with the current entry; a different body under the same requestId is 409 request_conflict. Limits: 60 writes per 10 minutes per agent, 2,000 keys and 4 MB per user per workspace (429 with retryAt). Values shaped like credentials are refused (400 secret_rejected). ${description}`},
 agent_kv_list:{schema:z.object({workspaceId,prefix:z.string().max(200).optional(),...paging}).strict(),method:'GET',path:a=>`${base(a)}/list${query(a,['prefix','after','limit'])}`,scoped:true,description:`List live entries in key order, 50 at a time, optionally under a key prefix; follow nextAfter for more. ${description}`},
 agent_kv_search:{schema:z.object({workspaceId,key:text.optional(),value:text.optional(),...paging}).strict(),method:'GET',path:a=>`${base(a)}/search${query(a,['key','value','after','limit'])}`,scoped:true,description:`Find live entries whose key contains key text or whose value contains value text, case-insensitive, 50 at a time. Give at least one. ${description}`},
 agent_kv_delete:{schema:z.object({workspaceId,key}).strict(),method:'POST',path:a=>`${base(a)}/delete`,body:body(['key']),scoped:true,description:'Delete one entry of the store. A missing key is not an error.'},
};
