import { z } from 'zod';
const uuid = z.string().uuid();
const located = { workspaceId: uuid.optional(), prospectId: uuid };
const page = { cursor: uuid.optional(), limit: z.number().int().min(1).max(100).optional() };
const root = a => `/workspaces/${a.workspaceId}/prospects/${a.prospectId}/contacts`;
const query = (path, fields) => { const q = new URLSearchParams(); for (const [k,v] of Object.entries(fields)) if (v !== undefined) q.set(k,String(v)); return path+(q.size?'?'+q:''); };
const body = ({workspaceId,prospectId,contactId,...rest}) => rest;
export const recipientOperations = {
  workspace_prospect_contact_whatsapp_check: { schema:z.object({...located,contactId:uuid,managedAccountId:uuid.optional(),requestId:uuid,approved:z.boolean().optional()}).strict(), method:'POST', path:a=>`${root(a)}/${a.contactId}/whatsapp-check`, body, scoped:true, description:'Read WhatsApp registration and compare the complete saved person name for an active saved mobile. Never sends a message. Zero credits. Off by default; Ask me first requires a human approval; agents cannot set approved. Not checked includes its reason. Reuse requestId for replay.' },
  workspace_prospect_contacts_list: { schema: z.object({...located,status:z.enum(['active','retired','all']).optional(),...page}).strict(), method:'GET', path:a=>query(root(a),{status:a.status,cursor:a.cursor,limit:a.limit}), scoped:true },
  workspace_prospect_contact_read: { schema:z.object({...located,contactId:uuid,history:z.object(page).strict().optional()}).strict(), method:'GET', path:a=>query(`${root(a)}/${a.contactId}`,{historyCursor:a.history?.cursor,historyLimit:a.history?.limit}), scoped:true },
  workspace_prospect_contact_record: { schema:z.object({...located,kind:z.enum(['email','linkedin','mobile','phone']),value:z.string(),reason:z.string(),provenance:z.object({observationId:uuid}).strict().optional(),requestId:uuid}).strict(), method:'POST', path:root, body, scoped:true },
  workspace_prospect_contact_retire: { schema:z.object({...located,contactId:uuid,expectedVersion:z.number().int().nonnegative(),reason:z.string(),requestId:uuid}).strict(), method:'POST', path:a=>`${root(a)}/${a.contactId}/retire`, body, scoped:true },
};
