# Helpers and installation

Read the installed package version with `skills show audienti --json`. Node 24.22.1 is the repository's supported runtime. The helper
scripts use only Node built-ins and need no network, login or provider credentials.
The CLI/MCP adapter uses the dependencies shipped with the CLI distribution.

Use the complete versioned skills/audienti directory included in the CLI archive. For Codex, place this
directory under your configured `.agents/skills/audienti` directory. For Claude
Code, use its `.claude/skills/audienti` location. Installation is an explicit local
action; no command here installs a plugin, grants access or modifies credentials.
For another Node-capable agent, retain the directory structure and invoke
`scripts/run.mjs`. To use local MCP, run `node cli/audienti.mjs mcp` from the extracted CLI directory
through the host's stdio configuration. The server exposes `skills_list`,
`skills_show`, `skills_profile_queries`, `skills_profile_candidates`,
`skills_profile_completeness` and `skills_profile_evidence` without
account authentication; existing CRM/tools still check their own credentials.

`skills show audienti --json` publishes each helper's input/output JSON schema and
a digest of this package. Inputs have a 1 MiB cap. Unknown fields and helper names
are rejected. Use `--file -` to read bounded JSON from standard input. JSON errors
never echo supplied values. Outputs go to stdout; choose private output storage
if retaining personal data. No automatic transcript or credential store is created.

## profile-queries

Input: `{ "kind": "social", "profile": { "displayName": "Avery Example",
"companyName": "Example Studio", "companyDomain": "example.org",
"title": "Founder", "handles": ["avery.example"] } }`.

`kind` is `social`, `email` or `website`; optional `mode` is `broad` (default) or
`attachable`, reflecting V10's query network gates, not a promise that every
network has a supported enrichment adapter. Facts are supplied by the agent;
the helper never fetches a company or canonicalizes an identity.

Output has `version`, `queries` and `missing`. An empty query list means there is
not enough usable context; it is not a research result. Optional name fallback
uses `prospectName` for social queries only. Email/website queries and candidate
name scoring require `displayName`. Social handle permutations are search terms, not profile IDs.

## profile-candidates

Input: `{ "profile": { "displayName": "Avery Example" }, "candidates": [
{ "url": "https://example.org/team", "title": "Avery Example", "snippet": "Founder",
"domain": "example.org" } ], "limit": 12 }`.

At most 80 results, at most 12 returned candidates. Supply optional `profileId`
only from an actual CRM response for that exact candidate URL; never reuse the
anchor Profile ID for unconfirmed candidates. Canonical-reference dedup uses that ID; otherwise
dedup is exact URL string equality. The helper does not infer identity from URLs.
`saved_reference` means the input supplied an ID, not independently verified access.

V10 advisory weights are name .4, company-domain .3, known-source .2, social-domain
.1, text overlap .15. Its legacy substring domain feature is preserved for ranking;
it is not a trust or matching check. Scores below .4 suggest skipping, above .7
suggest inspecting the page; otherwise inspect available snippets. You choose and
invoke any subsequent tool yourself. Dedup keeps the first supplied item, ranking
ties preserve input order. `duplicatesRemoved` and `omitted` explain truncation.

Port reference: V10 commit 915cae248a4e8698e5ef773f9624249481f1a0ce,
`profiles/expansion/query_builder.rb`, `result_scorer.rb`,
`profiles/social_query_planner.rb` and `config/web_search_queries.yml`.
Database selections in V10 are supplied input facts here. No V10 production data,
Rails callbacks, paid-provider orchestration or final identity matcher is bundled.

## Supplying facts

Map the saved Prospect's projection name to displayName, title to title, and bio
or description to the matching helper field. Profiles expose canonicalUrl and
providerId; a known LinkedIn URL can be supplied as linkedinReference, its known
vanity segment as linkedinSlug. Supply handles only when observed; do not derive
identity from guessed handles. Choose companyName/companyDomain from the CRM's
selected employment relationship and its company projection. companyDomain must
be a bare hostname such as example.org, not a URL. Missing facts stay omitted.

The ranking helper uses each candidate's supplied domain for all domain signals;
it does not extract a hostname from url. Supply the observed hostname explicitly
when available. These signals only prioritize inspection and confer no trust.

HTTP clients can read the public catalog at GET /api/v1/skills and the complete
artifact at GET /api/v1/skills/audienti. Check the version and digest before saving
the returned files locally. Reading the artifact does not execute a helper.
Agents need a local Node environment or the local stdio MCP server to execute
these helpers; an HTTP-only client cannot execute them through this API.

To check the file digest, iterate artifact.files in its supplied order. Feed SHA-256
UTF-8 bytes for path, a NUL byte, the decimal UTF-8 content byte length, another
NUL byte, then the content, for each file. Compare the lowercase hex result with
digest. This detects changed contents; it is not an authenticity signature. Get
artifacts from your trusted installation or the expected HTTPS API origin.

## profile-completeness

Input: `{ "requiredFields": ["name", "websites"], "fields": [
{ "name": "name", "state": "available" },
{ "name": "websites", "state": "absent" } ] }`.

`fields` is required; use `[]` when the saved read did not report states.
Map `profiles.enrich.operation.result.fieldStates` (or the legacy
`profiles.fetch.result.fieldStates`) to the helper's `fields` array of
`{name,state}` entries using the actual provider field names (`about`,
`websites`, not projection names `bio` or a made-up `website`); do not manufacture an
`available` state because a name or URL seems plausible. Required field names are
selected by the agent for the task. The output preserves `available` and known
`absent` separately. `needsEvidence` reports unavailable, truncated, unreported
or conflicting supplied states, in requested order with duplicate names removed.
Contradictory reports never get resolved by input order.

`allFieldsKnown` means every required field has one supplied available/absent
state. It does not establish freshness, fit, identity, cache eligibility or cost.
An absent field is not a reason to automatically purchase another lookup. The
server alone owns the 30-day cache and paid admission. A truncated requested field
can cause `profile_fields_truncated`: omit that requirement or explicitly choose
a paid refresh; never refresh automatically. Saved Profile list/get results do
not report these states. Missing reports remain `not_reported`. This helper applies the
accepted Exora field-state contract to V10's required-field planning pattern; it
does not port CompanyCitationEnricher's hidden company calls or employer selection.

## profile-evidence

Input: `{ "profileId": "<optional saved Profile UUID>",
"observationId": "<optional observation UUID>", "platform": "twitter",
"bio": "Founder. See https://example.org and @colleague",
"websiteUrl": "https://example.org" }`.

Returns exact observed URL candidates and lowercase mention handles with their
input fields. Exact duplicate URLs combine their field references. The source IDs
are merely supplied references: they do not prove access or trusted provenance.
The explicit website link is considered first so a long bio cannot crowd it out.
Every output is `caller_supplied`, even when the caller claims a verified source.
A mention is not a resolved Profile URL. No links are fetched or canonicalized,
no provider IDs guessed, and no citations or identity attachments are written.

V10 source: `profiles/writer.rb#extract_citations_from_bio` and
`#extract_citations_from_website_url`, and `utils/text_scanner.rb` at the pinned
commit above. Portable tests reuse its URL and Twitter/Reddit/Instagram fixtures.
This package stops before V10's URL parser/citation writer: use explicit CRM
normalization and evidence operations after inspecting the actual target. It
accepts absolute HTTP(S) links only; other website values remain unresolved.
Email addresses and URL text are excluded from mention extraction so they do not
become invented social identities. URLs with userinfo or recognized credential parameter names (including OAuth
fragments and signed-URL keys) are omitted, with `rejectedLinks` reported. This
is not a guarantee that arbitrary secrets hidden in URLs can be detected; never
put secrets in any helper input.

Each result caps links and mentions at 50, with omitted counts. Bio input is at
most 10,000 characters; URLs at most 2,048. Oversize mention handles are counted
as omitted. Empty text returns empty candidates, not a research success. Relevant
source text and its observation time stay in the original evidence record; these
candidates are preparation for the agent's next explicit step.
