# Agent-owned profile workflows

The agent runs these recipes. Each search, retrieval, AI judgment and contact
purchase is an explicit agent action. The helper scripts do not chain tools and
the CRM does not run a hidden research job. Read the installed schemas and selected
workspace permissions; do not invent flags from prose. Keep an
[agent research receipt](workflow-receipt.md), including incomplete work.

First read saved records with `prospect_list`/`prospect_get` and
`profile_list`/`profile_get` (CLI `prospects list|get`, `profiles list|get`).
These search the selected workspace's saved records. External search is a separate
explicit call to `profiles.discover`; legacy `profiles.search` has those same paid
external semantics. Query builders and candidate scores are planning aids.

## Enrich a known Profile

1. Resolve a supplied URL or saved Profile ID against saved records. Use the
   current Prospect ID returned by the server; do not infer identity from a name.
2. Decide which fields the task needs. Pass prior supplier `fieldStates` to
   `profile-completeness`; saved list/get projections do not report them, so use
   `fields:[]` when no such report exists. Use actual field names such as `about`
   and `websites`. Known absence is not an automatic refresh request.
3. For supported LinkedIn person/company URLs or authorized saved Profile IDs,
   call `profiles.enrich` explicitly with stable request ID and required fields.
   This finds/creates the source Profile, saves its facts, resolves existing
   canonical identity and returns its Prospect and visible Profile page. The
   server reuses complete workspace data for 30 days; `refresh:true` deliberately
   buys a new lookup and is subject to current paid admission.
4. Inspect `operation` for status and billing. `prospect`, `profilesPage`,
   `projectionStatus` and `projectionReadAt` are a separate current authorized CRM
   read. The `prospect` value is a detail object: its canonical ID is
   `prospect.prospect.id`; `matchedProfileId` identifies the enriched source
   Profile. Page with `prospect_get` if more profiles are needed. Do not treat a
   historical paid result's Prospect ID as current ownership after correction.
5. On interrupted/running work, inspect the operation and retry with the exact
   original ID/input/principal. If projection is unavailable, retry free saved
   reads. Never buy another lookup to recover a response. Expired evidence,
   truncated fields and unsupported networks remain explicit gaps.

`profiles.fetch` remains the legacy flat paid-operation result. Its admission is
shared with `profiles.enrich`, which wraps that operation with the current CRM
read; changing names never buys a second attempt. Likewise `profiles.discover`
and legacy `profiles.search` share admission. A new completed-cache call and a
same-request replay are different events even when both are free.

## Find people through an audience or question

1. Read the caller's scope: selected workspace, audience/role criteria, company
   filters, questions, time window, requested count and tool/budget limits. Use
   saved audience definitions when supplied. Missing evidence remains unknown;
   do not pool different people or companies to satisfy a conjunction.
2. Search saved records first. Choose an available research mechanism explicitly:
   compatible agent search/browsing, `web.search`, or `profiles.discover` using its
   actual supported input schema. Unsupported audience filters must be evaluated
   separately from retained evidence, not invented as provider arguments.
3. Inspect primary sources and dates. A current official source may establish a
   present state; a retrieved historical event is not automatically current. A
   failed retrieval, search miss or JavaScript shell is not evidence of absence.
4. Select relevant identities, then use the enrichment recipe or submit attributed
   externally acquired Profile facts through `prospect_record_observation`.
   Preserve producing skill version, source URL/time and actual response IDs.
   Contact lookup, optional `decide`, classification and further retrieval require
   their own deliberate agent calls. No automatic email/mobile finding or send.
5. Compare sourced company/role/question judgments to the brief, preserving
   counterevidence. Record observations/interpretations with the shared evidence
   owner. The server's exact qualification operation, when requested, owns
   admission to an experiment; a helper score or this receipt is not admission.
6. Continue until requested scope/count, agreed budget/time limit or documented
   source exhaustion. Return supported findings plus pending/rejected/unknown
   records and next actions; one completed search batch is not completion.

This adapts the existing signal-prospect-research method's separation of scope,
primary-source evidence, current state, unknown answers and unfinished work. It
adds no parallel CRM rule engine or automatic research executor.

## Find people through a topic, post and its participants

1. Reuse a saved topic with `topics_list`/`topics_get`, or deliberately create one
   with `topics_create`. A topic is saved context, not proof of a person's intent.
2. Explicitly search/fetch a relevant post with `posts.search`/`posts.fetch`,
   supplying the selected topic ID when supported. Keep the returned topic/post
   IDs and immutable evidence references; local report references are not CRM IDs.
3. Explicitly retrieve `posts.comments` or `posts.reactions` and follow requested
   pages. These time-scoped pages retrieve fresh data; they do not use the
   30-day Profile cache. Same-request replay remains safe. A valid empty page is
   distinct from malformed data and can still have verified supplier expense and
   a customer charge. Report partial pages and unknown observation times.
4. Read the observed author/participant references and evidence. Choose whom to
   inspect as the agent; a reaction alone does not prove pain, fit, buying intent
   or consent. Incoming interactions do not establish outgoing engagement history.
5. Enrich the selected participant with an explicit call, or record compatible
   external research as attributed evidence. Preserve post/topic/interaction
   provenance using supported citation/evidence operations and actual stored IDs.
6. Read back the current Prospect and visible Profiles before reporting saved
   results. Keep observation and interpretation separate. Do not silently buy
   contacts, invoke AI, send outreach or install another research tool.

## Expand an identity into additional Profiles

1. Read the anchor and visible Profiles. Take selected employer/title from the
   CRM relationship projection; do not silently choose an employer from scraped
   text. Read required field states rather than assuming a saved name is complete.
2. Run `profile-queries` on supplied context, then explicitly execute selected
   searches within scope. `social` uses V10 network gates; `website` and `email`
   prepare query text only. The queries themselves do not buy contact data.
3. Pass supplied results to `profile-candidates` to prioritize inspection. Scores,
   inferred domains, handles and legacy `trusted_source` weights are advisory.
   Inspect promising sources explicitly. `profile-evidence` extracts supplied
   links/mentions without fetching, canonicalizing or certifying them.
4. Search saved workspace Profiles for a candidate's actual URL/ID. Keep an
   unconfirmed candidate separate from the anchor. Record an independently
   observed candidate only with its own actual source identity; omit the anchor
   `prospectId` from observation intake. That intake is not a speculative
   candidate inbox and must not be used to force an attachment.
5. Explicitly enrich if needed and supported. Hosted profile retrieval supports
   LinkedIn people and companies. Other networks can have attributed externally
   obtained facts; a query mentioning a network does not imply a hosted adapter.
6. If the server exposes `profile_match_evaluate`, evaluate the saved anchor and
   candidate IDs. CLI: `profiles match evaluate SOURCE_ID CANDIDATE_ID`. This is a
   free deterministic check, not a provider call. The first supported cross-network
   rule requires a forward link from SOURCE to CANDIDATE. SOURCE must be a
   supported LinkedIn Profile with a provider ID and a succeeded supplier
   snapshot in this workspace. Its payload must be unexpired, its retrieval
   under 30 days old, and its `websites` state `available` with the candidate's
   current canonical URL listed. The newest snapshot for that source identity
   controls the result; an older positive link cannot override newer evidence.
   Reversing the two arguments does not reverse the evidence. A GitHub-to-LinkedIn
   link or a caller-reported bio/image link cannot satisfy this release's rule.
   `insufficient_evidence` / `no_current_verified_direct_link` means the proof is
   missing, stale or unsupported; it does not mean different people. If current
   retrieval is justified, explicitly choose a supported paid enrichment/refresh
   within the user's budget, then reevaluate. Otherwise keep the candidate
   unconfirmed and record the missing evidence. Never refresh automatically.
   `identity_kind_conflict`, `contradictory_provider_id` and `staff_separation`
   are conflicts, not a reason to force an attachment or bypass the guard.
   Caller citations,
   text, images, scores and a shared name do not make that evidence trusted.
7. On `match`, explicitly call `profile_match_apply` with the exact evaluation
   digest and new stable request ID. CLI: `profiles match apply SOURCE_ID
   CANDIDATE_ID --evaluation-digest HASH --request-id UUID`. The server rechecks
   current evidence/authority, chooses the compatible canonical owner and records
   lineage. `already_associated` needs no new merge. Keep returned IDs.
8. On changed state, reread and reevaluate; a new reviewed input needs a new
   request ID. On uncertain apply completion, retry the exact original ID/input
   first, never silently change its digest. `insufficient_evidence` and `conflict`
   are not attachments. Decide whether further explicit research can resolve them.
   Active staff separation cannot be overridden by a workspace agent. Mistaken
   global associations require a verified global administrator's reviewed browser
   resolution; this skill grants no such authority and cannot call that path.
9. Read the Prospect and its visible Profiles. `profile_identity_history` (CLI
   `profiles history RESOLUTION_ID`) returns only this workspace's movement
   history, oldest first, at most 100 rows with an explicit truncation flag.
   When truncated, newer movements may be unavailable in that response. Use the
   apply response's `resolutionId`; `already_associated` may return null because
   no new movement was recorded. It does not reveal
   global staff notes or other workspaces. A historical apply receipt is distinct
   from current identity state after a later correction.

Inspect installed client descriptors and server capability before using match
operations. An older server/client may not implement them; report the capability
gap and retain the research rather than forcing an observation association.
A person and company remain separate typed Prospects linked by citations.

## Evidence, cost and safe resumption

Use shared observation/citation/evidence/qualification owners and their live
schemas. Other research tools are welcome; their submissions remain attributed
to the caller, never forged supplier receipts or verified identity flags.
Preserve unknown fields, contrary sources, producing version and coverage limits.
Every CRM identifier comes from a server result, not a URL or local helper ref.

For `prospect_record_evidence` with `kind:interpretation`, `data` accepts
`conclusion`, optional `reason`, and optional `evidenceIds` only. Use actual saved
observation IDs; a citation ID or local receipt reference is not an observation.
Keep topic/post context in the existing saved graph, the reason and the local
receipt, rather than inventing extra `data` keys. For example, replace every
bracketed value with the selected workspace or a returned server ID:

```json
{
  "workspaceId": "<selected workspace UUID>",
  "requestId": "<new stable request UUID>",
  "subject": { "kind": "person", "prospectId": "<current canonical Prospect UUID>" },
  "kind": "interpretation",
  "data": {
    "conclusion": "Investigate; engagement alone does not establish fit.",
    "reason": "State the retained source context and any missing page coverage.",
    "evidenceIds": ["<retained observation UUID>"]
  },
  "sourceUrl": "https://example.org/observed-source",
  "observedAt": null,
  "skill": { "id": "audienti", "version": "1.3.0" }
}
```

`observedAt:null` means unknown, not now. Signal evidence has its own live
`signalId`/`result`/`details` contract; an interpretation is not a qualification
or experiment admission.

For operation recovery, use CLI `tools runs get OPERATION_ID` / `tools runs list`
or MCP `tools_runs_get` / `tools_runs_list`. Paid primitive MCP names use `tools_`
plus dots replaced by underscores, for example `tools_profiles_enrich` and
`tools_posts_comments`; saved-record and identity operation names are the explicit
names shown above, not this prefix rule.

Keep exact paid request IDs, inputs, operation IDs, status, usage and reported
charge/retrieval provenance. Read current balance through the existing tools.
New paid tasks stop at zero or below; admitted small work can overdraw. The agent
must not recreate tariffs or reserve balances. Core reads/evidence remain free
under normal workspace authorization, even when using compatible external tools
at zero hosted credits. No request, credential or billing information belongs in
an unprotected public report. Never include bearer/proxy/provider secrets.
