import {z} from 'zod';
// #413: a file is uploaded first and named by id in a LinkedIn message (content.attachments). An image is at most 5 MB;
// a voice note is at most 2 minutes and 5 MB.
const uuid=z.string().uuid(),maxBytes=5*1024*1024;
const base64=z.string().min(4).max(4*Math.ceil(maxBytes/3)+8).refine(value=>value.length%4===0&&/^[A-Za-z0-9+/]+={0,2}$/.test(value));
export const attachmentOperations={
 attachment_upload:{schema:z.object({workspaceId:uuid.optional(),name:z.string().trim().min(1).max(255),contentType:z.string().max(127),contentBase64:base64,durationSeconds:z.number().int().positive().max(120).optional()}).strict(),method:'POST',path:a=>`${a.workspaceId?`/workspaces/${a.workspaceId}`:''}/attachments`,body:a=>({name:a.name,contentType:a.contentType,contentBase64:a.contentBase64,...(a.durationSeconds?{durationSeconds:a.durationSeconds}:{})}),scoped:true,description:'Store an image (jpeg, png, gif, webp), PDF document or MP4 video (each at most 5 MB), or a voice note (mpeg, mp4, ogg, wav, webm; at most 5 MB and 2 minutes) and return its id. For posts, pass attachmentId to workspace_managed_post_create (image, document or video). Only images and voice notes go in messages. Name the id in content.attachments of a linkedin.send action tagged profile.message.send. A voice note needs durationSeconds and goes only to a connection. Needs workspace:access.'},
 attachment_get:{schema:z.object({workspaceId:uuid.optional(),attachmentId:uuid}).strict(),method:'GET',path:a=>`${a.workspaceId?`/workspaces/${a.workspaceId}`:''}/attachments/${a.attachmentId}`,scoped:true,description:'One uploaded file with its content as base64. An agent that sends from its own LinkedIn account fetches the file here, then attaches it in LinkedIn.'},
};
