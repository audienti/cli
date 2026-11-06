import {z} from 'zod';
// Brief 09: results of an outcomes.check queue task. The agent holding the task reports what it found for the people
// the task lists: an accepted invitation, a withdrawn or expired one, or the profile degree it read.
const uuid=z.string().uuid(),time=z.string().datetime({offset:true});
const result=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('linkedin.accept'),person:uuid,at:time}).strict(),
 z.object({kind:z.literal('linkedin.invite_closed'),person:uuid,reason:z.enum(['withdrawn','expired']),at:time.optional()}).strict(),
 z.object({kind:z.literal('linkedin.profile_degree'),person:uuid,degree:z.number().int().min(1).max(3),at:time.optional()}).strict(),
 // #413: a steps.run task (a comment, react or withdraw step): the post engaged with, or why the step was skipped.
 z.object({kind:z.literal('linkedin.comment'),person:uuid,postUrl:z.string().url().max(500),at:time.optional()}).strict(),
 z.object({kind:z.literal('linkedin.reaction'),person:uuid,postUrl:z.string().url().max(500),reaction:z.enum(['like','celebrate','support','love','insightful','funny']).optional(),at:time.optional()}).strict(),
 z.object({kind:z.literal('linkedin.follow'),person:uuid,at:time.optional()}).strict(),
 z.object({kind:z.literal('linkedin.unfollow'),person:uuid,at:time.optional()}).strict(),
 z.object({kind:z.literal('linkedin.invitation_received'),ref:z.string().trim().min(1).max(300).optional(),profileUrl:z.string().trim().url().max(500).optional(),name:z.string().trim().min(1).max(200).optional(),sentAt:time.optional()}).strict().refine(value=>!!(value.ref??value.profileUrl),{message:'Give the request id (ref) or the profile address (profileUrl).'}),
 z.object({kind:z.literal('linkedin.step_skipped'),person:uuid,reason:z.string().min(1).max(500),at:time.optional()}).strict(),
 // #279: a replies.check task (was there a reply to the email).
 z.object({kind:z.literal('email.no_reply'),person:uuid}).strict(),
 z.object({kind:z.literal('email.reply'),person:uuid,evidence:uuid}).strict(),
 // #319: a mailbox.confirm task (the mailbox's test email to itself): the code read back with the address it went to, the deletion, or the step that failed.
 z.object({kind:z.literal('mailbox.received'),code:z.string().trim().min(1).max(32),sentTo:z.string().trim().max(320).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/),message:z.string().trim().min(1).max(998),receivedAt:time}).strict(),
 z.object({kind:z.literal('mailbox.deleted'),message:z.string().trim().min(1).max(998)}).strict(),
 z.object({kind:z.literal('mailbox.failed'),step:z.enum(['send','read']),reason:z.string().trim().max(500).optional()}).strict(),
]);
export const outcomeOperations={
 agent_queue_outcomes:{schema:z.object({workspaceId:uuid.optional(),taskId:uuid,results:z.array(result).min(1).max(100)}).strict(),method:'POST',path:a=>`${a.workspaceId?`/workspaces/${a.workspaceId}`:''}/agent-queue/${a.taskId}/outcomes`,body:a=>({results:a.results}),agentWide:true,description:'Report what an outcome check found, for the people the task lists only. Claim the outcomes.check, replies.check or mailbox.confirm task first. linkedin.accept {person, at} ends the person\'s wait for an accept and the next step is planned; linkedin.invite_closed {person, reason: withdrawn|expired} and linkedin.profile_degree {person, degree} are recorded as facts. A person who is not on the task\'s list is refused (not_on_list). Each person is recorded on their own: each entry has status recorded, already_recorded or not_recorded, and a reason (participation_ended, participation_unavailable, not_found) when there is one. For a replies.check task: email.no_reply {person} when nothing came back since the email, or email.reply {person, evidence} after you recorded the reply with prospects conversation append; the follow-up then goes on. For a mailbox.confirm task: mailbox.received {code, message, receivedAt} once the test email is in the mailbox\'s inbox, with the code from its subject, its message id and the time it arrived; then mailbox.deleted {message} once you deleted both copies; or mailbox.failed {step: send|read, reason} when you could not send it or read the inbox. A code that is not the task\'s is refused (wrong_code, stale_code); then report the task done.'},
};
