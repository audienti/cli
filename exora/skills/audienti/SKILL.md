---
name: audienti
description: Find, enrich, and expand CRM profile research using Audienti's account-scoped records, explicit paid tools, and executable deterministic helpers. Use for saved Prospect/Profile lookup, known profile URLs, relevant posts and their participants, or discovering additional profiles for the same identity.
---

# Audienti profile research

You own the research workflow. Audienti keeps canonical Prospect/Profile records,
citations, authorization and paid-tool accounting. A Prospect is a person or company;
it can have many source Profiles. Employment links a person and company through
citations; it does not make them one identity.

First inspect the selected workspace, current permissions and available tools. Use
the account the user selected; never search another workspace or global cache as a
substitute. Discover current contracts with `audienti tools list`, `tools describe`
and resource help. Read [the workflow recipes](references/profile-workflows.md)
and [helper contracts and installation](references/helpers.md). Keep an
[agent research receipt](references/workflow-receipt.md) as you work.

## Executable helpers

The skill includes four deterministic helpers. They consume supplied JSON; none
performs research, calls a model, reads the CRM, writes records or charges credits.

```sh
audienti skills helper profile-queries --file context.json --json
audienti skills helper profile-candidates --file results.json --json
audienti skills helper profile-completeness --file field-states.json --json
audienti skills helper profile-evidence --file supplied-text.json --json
```

Without the CLI, run the same bundled code with Node:

```sh
node scripts/run.mjs profile-queries --file context.json
```

Use `audienti skills show audienti --json` for the exact version, digest and JSON
schemas. The local MCP tools expose the same helpers. An HTTP-only agent without
local execution cannot run these helpers: report that capability gap rather than
claiming to have executed them. Compatible research tools already available to you
can supply inputs; using Audienti's paid tools is optional.

## Preserve the boundary

- Search saved Prospects and Profiles before purchasing fresh data.
  `profiles.enrich` accepts a known LinkedIn URL or authorized saved Profile ID,
  saves the result and returns its current canonical Prospect and profile page.
  Complete eligible cached data is reused; request `refresh` only deliberately.
- Execute each search, retrieval, contact lookup or optional AI decision explicitly.
  Helpers return inputs for you to use; they never continue a research chain.
- A candidate rank is not an identity match, qualification, contact permission or
  assurance that a source is trustworthy. `trusted_source` is a legacy V10 ranking
  feature only. Submit attributed facts and citations to the CRM's shared owners.
- Reuse the returned Prospect/Profile IDs. Do not manufacture merge authority,
  provider verification, or image-match evidence. The CRM owns final identity
  reconciliation. If the installed API lacks the required guarded operation, keep
  the evidence and report the missing capability; do not set foreign keys yourself.
- Recover an unknown paid outcome using the existing request/operation ID and run
  history before retrying. A new request ID is new work, not a recovery mechanism.
  Do not bypass a zero-credit refusal with another alias or credential.
- Persist requested relevant evidence even when a candidate fails an experiment's
  fit criteria. Separate source facts from your interpretation and cite both.
  Include this skill's identity/version on supported evidence and assessment writes.
- Profile research does not authorize a message, follow, contact purchase or change
  to an approval. Use the customer's instructions and current server permissions.

Return canonical records read back from the selected workspace, evidence collected,
profiles matched or still unresolved, operation IDs for interrupted work, and the
specific remaining evidence/capability gap. Do not claim a complete enrichment or
expansion when only search results or advisory rankings are available.

For field coverage use `profile-completeness` with supplied field states. For observed
bio/website links and mentions use `profile-evidence`. Both run locally; neither
chooses a paid call or asserts an identity. See [helper contracts](references/helpers.md).
