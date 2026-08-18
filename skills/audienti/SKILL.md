---
name: audienti
description: Use when the user wants to operate Audienti through the production CLI or app-hosted MCP endpoint, including account selection, plays, prospect imports, lists, message previews, analytics, or supported operator outcomes.
---

# Audienti CLI and MCP

Use the installed `audienti` command or Audienti's app-hosted MCP endpoint as
the production contract. The packaged `audienti-mcp` command is only a local
stdio bridge for MCP hosts. Do not build a parallel wrapper or call
undocumented API endpoints.

## Setup

1. Verify the command is installed:

```bash
audienti --help
```

2. If it is unavailable, install the public package:

```bash
curl -fsSL https://cli.audienti.com/install | bash
```

3. Authentication is explicit and per machine. Do not ask a user to paste a
production token into chat, a repository file, an issue, or a CI secret. Prefer
browser login:

```bash
audienti auth login
```

Use `audienti auth token` only after the user supplies a token through an
approved secure channel.

4. Start with discovery, not mutation:

```bash
audienti auth status
audienti accounts list --json
audienti help agent-workflows
```

For MCP hosts, configure the packaged `.mcp.json` or run:

```bash
audienti-mcp
```

The bridge reads the same local config as the CLI and forwards MCP JSON-RPC to
the app-hosted `/mcp` endpoint. Before starting the bridge, select account
context:

```bash
audienti auth login
audienti accounts list --json
audienti accounts select <acct_id>
audienti users select me
```

If the MCP host can call HTTP directly, use `POST /mcp` with the same bearer
token as the API. Call `tools/list` first, then call named tools with
`tools/call`. Account-scoped tools accept `account_id`; the local bridge injects
the selected CLI account when it is omitted.

Useful MCP tools:

- `auth.me` confirms the token identity.
- `accounts.list` shows accessible accounts.
- `setup.play_preflight` returns connected-account readiness and setup or
  mapping URLs.
- `offers.create`, `icps.create`, and `motions.create` set up the offer, ICP,
  and play.
- Use `audienti motions abm-companies <motn_id> add --file <txt|json>` to attach
  a positive company filter list for isolated ABM discovery runs.
- `analytics.stages` returns stage conversion cohorts and stage aging.
- `analytics.cohort_lists.create` materializes event cohorts as reusable lists.

## Operating Rules

- Use `--json` whenever another agent or tool will consume the response.
- Use `audienti <resource> <action> help` before a mutation when the accepted
  payload or behavior is unclear.
- Inspect the current resource before a create, update, attach, delete, or
  operator outcome writeback.
- Treat the production API as the source of truth. Persist durable work in
  Audienti rather than leaving it only in agent prose.
- Keep current gaps explicit. Do not imply that unsupported actions execute.

## Common Entry Points

```bash
audienti help agent-workflows
audienti prospects list --query "name or company" --wide --json
audienti prospects list --assigned-user unassigned --json
audienti prospects assign <prsp_id> --assigned-user me --json
audienti prospects set-status <prsp_id> --status not_fit --json
audienti prospects lock <prsp_id> --note "Emergency hold" --json
audienti prospects unlock <prsp_id> --json
audienti users activity me --window 7d --json
audienti prospects import-batch --file prospects.csv --motion <motn_id> --assigned-user me --json
audienti lists create --name "Target list" --json
audienti motions quick-start --url https://example.com --wait --confirm --json
audienti motions abm-companies <motn_id> add --file abm-domains.txt --json
audienti motions abm-companies <motn_id> list --json
audienti motions update <motn_id> --status paused --json
audienti motions activate <motn_id> --json
audienti motions delete <motn_id> --confirm yes --json
audienti operator next --json
audienti operator next --plan
audienti analytics prospects --window 24h --json
audienti analytics visibility --window 24h --user me --json
audienti analytics content --window week --json
audienti tools list --json
audienti tools linkedin-review --url https://www.linkedin.com/in/example --icp <icp_id> --json
audienti tools linkedin-review reports --json
audienti tools linkedin-review show <rprt_id> --json
audienti tools linkedin-review status <rprt_id> --json
audienti writer test-run <prsp_id>
audienti writer test-run <prsp_id> --mode report --report <rprt_id>
audienti writer test-run <prsp_id> --mode step --branch no-accept --step 3 --report <rprt_id>
audienti writer test-run <prsp_id> --mode step --branch no-accept --step 3 --report <rprt_id> --no-wait
audienti writer test-run show <prsp_id> <rprt_id>
```

`audienti writer test-run <prsp_id>` starts a report-backed writing session and
builds the campaign timeline without drafting every message. The printed
`Report: rprt_...` id is the session handle. Pass `--report <rprt_id>` when
drafting every message with `--mode report` or one selected row with
`--mode step`; the server report supplies prior drafted rows as context. Use
`--timeout-seconds <n>` for longer waits, or `--no-wait` to launch and return
immediately. Use `writer test-run show` with the report id to fetch the
completed report later.
