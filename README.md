# Audienti CLI

Audienti CLI is the agent-first command-line client for the Audienti production
API. It lets local coding agents and operators inspect accounts, create and
manage plays, import prospects, build lists, and work supported operator flows.

## Install

Requires Node.js 20 or newer.

```bash
curl -fsSL https://cli.audienti.com/install | bash
audienti --help
```

Or install directly through npm:

```bash
npm install --global @audienti/cli
audienti --help
```

For one-off use, run `npx @audienti/cli --help`.

## Authenticate

Create an Audienti API token through the product, then configure this machine:

```bash
audienti auth token <token>
audienti accounts list --json
audienti accounts select <acct_id>
audienti users list
audienti users select <account_user_id|email|name|me>
```

The CLI writes its local configuration to `~/.config/audienti/config.json` with
owner-only permissions. Do not place a production token in an agent prompt,
repository file, issue, or CI secret.

The selected account user is used when commands accept `me` or default to the
current operator, such as `audienti users activity`, `audienti analytics users`,
and `audienti prospects assign --assigned-user me`.

## Agent Workflows

Start with the built-in, production-safe workflow guide:

```bash
audienti help agent-workflows
```

Use `--json` whenever another program or agent will consume the result. Inspect
the target state before mutations, and use the command-specific help before
creating, changing, or deleting data.

Common inspection commands:

```bash
audienti update check
audienti operator next --plan
audienti writer test-run <prsp_id>
audienti motions analytics <motn_id>
audienti motions run-discovery <motn_id>
audienti motions update <motn_id> --status paused
audienti motions update <motn_id> --own-post-engagement true
audienti motions activate <motn_id>
audienti motions delete <motn_id> --confirm yes
audienti content programs
audienti content plan <cprg_id>
audienti content approve <cpwi_id>
audienti content comments
audienti prospects show <prsp_id> --json
audienti prospects list --profiles
audienti prospects list --assigned-user unassigned
audienti prospects check --all --csv
audienti prospects assign <prsp_id> --assigned-user me
audienti prospects set-status <prsp_id> --status not_fit
audienti prospects lock <prsp_id> --note "Emergency hold"
audienti dnc list
audienti company-rules list
audienti users activity --window 7d
audienti analytics prospects --window 24h
audienti analytics dashboard --play-tag wine_campaign
audienti analytics users --user me --window 30d
audienti analytics visibility --window 24h --user me
audienti analytics content --window week
audienti tools list
audienti tools linkedin-review --url https://www.linkedin.com/in/example --icp <icp_id>
audienti tools linkedin-review reports
audienti tools linkedin-review show <rprt_id>
audienti tools linkedin-review status <rprt_id>
```

To let an agent or operator check whether the local CLI is behind the latest
published package:

```bash
audienti update check --json
```

To work the supported prospect operator queue from the CLI, inspect the next move
and record the outcome against that same row:

```bash
audienti operator next --plan
audienti operator next --done --note "Connection request sent."
```

To inspect activity for prospects that entered the account during a specific
cohort while keeping a separate activity window:

```bash
audienti analytics prospects --cohort-start 2026-07-01 --cohort-end 2026-07-07 --window 7d
```

To compare recent weekly prospect cohorts by their current pipeline stages:

```bash
audienti analytics prospects cohort-analysis --weeks 4 --motion <motn_id>
```

To see whether one motion is producing prospects by day, and where each
produced-day cohort currently sits in the funnel:

```bash
audienti motions analytics <motn_id>
```

To count the people and distinct companies currently targeted by one campaign
tag without waiting on the web dashboard filter:

```bash
audienti analytics dashboard --play-tag wine_campaign --cohort-start 2026-07-01 --cohort-end 2026-07-07
```

To queue an immediate discovery run for a motion through the same launch gate
used by the operator surface:

```bash
audienti motions run-discovery <motn_id>
```

To audit one account user's outbound actions, optionally narrowed to one motion
and one AccountProspect.created_at cohort:

```bash
audienti analytics users --user me --start 2026-07-01 --end 2026-07-07 --cohort-start 2026-06-01 --cohort-end 2026-06-30 --motion <motn_id>
```

To run a writer campaign test for one prospect, including the no-reply path,
planned actions, channel changes, and drafted messages:

```bash
audienti writer test-run <prsp_id>
```

For fast simulator work, plan the branches without drafting every message:

```bash
audienti writer test-run <prsp_id> --mode plan
```

For writer debugging, draft only one selected timeline row on one branch:

```bash
audienti writer test-run <prsp_id> --mode step --branch no-accept --step 3
```

To update a prospect's attached profile channels through the same paths used by
the prospect show page:

```bash
audienti prospects add-profile <prsp_id> --url prospect@example.com
audienti prospects add-profile <prsp_id> --url +12025550123
audienti prospects add-profile <prsp_id> --url https://www.linkedin.com/in/example
audienti prospects report-bad-profile <prsp_id> <prof_id>
```

To queue a personal LinkedIn profile authority review and ICP-fit positioning
blueprint, then check whether it is waiting on enrichment, running, completed,
or failed:

```bash
audienti tools list
audienti tools linkedin-review --url https://www.linkedin.com/in/example --icp <icp_id>
audienti tools linkedin-review reports
audienti tools linkedin-review show <rprt_id>
audienti tools linkedin-review status <rprt_id>
```

To reassign or clear ownership for existing prospects:

```bash
audienti prospects assign <prsp_id> --assigned-user <account_user_id|me>
audienti prospects assign <prsp_id> --assigned-user unassign
```

To make emergency prospect state changes without going through a motion:

```bash
audienti prospects set-status <prsp_id> --status nurture
audienti prospects set-status <prsp_id> --status not_fit
audienti prospects lock <prsp_id> --note "Emergency hold"
audienti prospects unlock <prsp_id>
```

To manage account DNC and company disposition rules from the CLI:

```bash
audienti dnc add prospect@example.com
audienti dnc import --file dnc.txt
audienti company-rules create --linkedin-url https://www.linkedin.com/company/example --disposition monitor
audienti company-rules create --domain example.com --disposition not_fit --user me
audienti company-rules apply --all
```

To import multiple LinkedIn people through the same per-prospect import path:

```bash
audienti prospects import-batch --file prospects.csv --motion <motn_id> --assigned-user me
```

CSV files should include a `linkedin_url` or `url` header. Optional row columns
`list_id`, `motion_id`, and `assigned_user_id` override command defaults.

## Compatibility

The CLI talks to the versioned Audienti `/api/v1` contract at
`https://app.audienti.com` by default. A release occurs only after the matching
server deploy succeeds.

The canonical source lives with the Audienti application under
`packages/audienti-cli`. This public repository is a CI-managed mirror; direct
changes are unsupported and cause the next source release to fail safely.

## Plugins

This repository includes Codex and Claude Code plugin manifests plus an
`audienti` skill. The plugin provides workflow instructions; it does not grant
credentials or silently authenticate an agent.

## License

Copyright (c) 2026 OMALab, Inc. All rights reserved. See [LICENSE](LICENSE).
