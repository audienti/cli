---
name: audienti
description: Use when the user wants to operate Audienti through the production CLI, including account selection, plays, prospect imports, lists, message previews, or supported operator outcomes.
---

# Audienti CLI

Use the installed `audienti` command as the production contract. Do not build a
parallel wrapper or call undocumented API endpoints.

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
production token into chat, a repository file, an issue, or a CI secret. Use
the existing `audienti auth token` flow only after the user supplies a token
through an approved secure channel.

4. Start with discovery, not mutation:

```bash
audienti auth status
audienti accounts list --json
audienti help agent-workflows
```

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
