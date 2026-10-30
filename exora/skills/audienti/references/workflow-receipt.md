# Agent research receipt

Keep a local research receipt as the agent performs explicit steps. This is a
reporting convention, not a new CRM object or permission. Never include bearer
tokens, proxy credentials or raw provider secrets. Use the installed tool schemas
for requests; this receipt does not define replacement API payloads.

Record the producing skill ID/version, selected workspace ID and requested scope.
For each finding keep:

- Its local reference, distinct from server-issued Prospect, Profile, observation,
  topic and post IDs. Do not manufacture a CRM ID from a URL or local reference.
- The observed fact, source URL and observation time (or explicitly unknown time).
  Keep the agent's interpretation separate. A reaction is not evidence of a buyer
  problem, intent or consent to contact.
- Acquisition provenance: which explicit tool returned it, its operation/request
  ID when available, and the evidence reference actually stored in the CRM.
  An alternative research tool's result remains caller-attributed evidence.
- Current identity status comes from a fresh authorized `profile_get` /
  `prospect_get`: saved independently, currently associated, or unconfirmed.
  Record that read's time and returned canonical ID. A match/apply receipt is a
  historical mutation event; replay can return it after a staff correction and
  cannot confirm present ownership. A helper score or mention never confirms
  identity. If the installed server lacks the guarded operations, preserve the
  candidate and report the capability gap.
- Coverage limits, missing fields, pagination not retrieved, truncated content and
  time uncertainty. Incoming comments/reactions on a post do not establish an
  author's outgoing engagement history.

For paid calls retain the exact request ID and normalized input you sent, plus the
returned operation ID, terminal status and billing result. If the response is lost,
read that operation or replay the same request; do not invent a new ID. Do not count
an alias or request replay as an additional purchase. A cached result is distinct
from replaying an operation. Current CRM projection is distinct from paid history.

When resuming with a new skill version, retain the original producing version on
existing evidence and assessments. New interpretations get new evidence and their
actual producing version. Report an unavailable tool or exhausted scope as a gap;
do not silently install software, buy contact data, invoke AI or send outreach.

Read back the selected workspace's Prospect, visible profiles and saved evidence
before reporting persistence. Unconfirmed candidate URLs remain in this report;
never use observation intake with the anchor Prospect ID to force an association.

This convention follows the distinction between local references, CRM identities,
interaction evidence and incomplete coverage in the separately maintained
Audienti profile-audience-targeting and profile-engagement-targeting marketplace
skills. Those packages have separate publication ownership and are not installed
or executed by this package.
