import { z } from 'zod';

export const dispositionPersonInput = z.object({ userId: z.string().uuid() }).strict();
export const dispositionCorrectionInput = dispositionPersonInput.extend({
  expectedRevision: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(2000),
}).strict();
export const dispositionOverrideInput = dispositionCorrectionInput.extend({
  value: z.enum(['likely $200+/month', 'not likely', 'unknown']),
  evidenceRefs: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
}).strict();
const base = a => `/admin/users/${a.userId}/signup-disposition`;
const body = ({ userId, ...input }) => input;
const staff = 'Staff only, using a verified staff user API token. No provider call or email. ';
const correction = 'Required reason and expectedRevision from the last read (0 if unevaluated). A stale revision returns 409 conflict; read again before deciding, never blindly retry.';
export const signupDispositionOperations = {
  signup_disposition_get: { schema: dispositionPersonInput, method: 'GET', path: base, description: staff + 'Read automatic assessment/evidence/history separately from staff correction. The latest actor has canonical overrideByUserId and current display name/email overrideByLabel (null if unavailable). An unevaluated person is unknown at revision 0.' },
  signup_disposition_recompute: { schema: dispositionPersonInput, method: 'POST', path: a => base(a) + '/recompute', body, description: staff + 'Recompute from stored own-company facts using rule v1. Preserves staff override and appends automatic history.' },
  signup_disposition_override_set: { schema: dispositionOverrideInput, method: 'POST', path: a => base(a) + '/override', body, description: staff + correction },
  signup_disposition_override_clear: { schema: dispositionCorrectionInput, method: 'POST', path: a => base(a) + '/override/clear', body, description: staff + 'Clear the override and record the clearing staff member, reason and time in place of the earlier correction metadata. ' + correction },
};

/** Local recovery copy only; never forward a server message or alter shared error policy. */
export function signupDispositionError(name, error) {
  if (['signup_disposition_override_set', 'signup_disposition_override_clear'].includes(name)
    && error instanceof Error && error.status === 409 && error.code === 'conflict') {
    error.message = 'This signup assessment changed. Read or reload the assessment, review the current revision, then retry only with the newly read expectedRevision.';
  }
  return error;
}
