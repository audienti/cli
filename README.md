# Audienti CLI

Audienti CLI is the agent-first command-line client for the Audienti production
API. It lets local coding agents and operators inspect accounts, create and
manage plays, import prospects, build lists, manage task reminders, and work
supported operator flows.

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
audienti tasks list
audienti tasks add --title "Review Cristina" --due 2026-07-24T11:00 --prospect <prsp_id> --notes "Check the renewal note before replying."
audienti tasks complete <ptsk_id>
audienti dnc list
audienti company-rules list
audienti users activity --window 7d
audienti analytics prospects --window 24h
audienti analytics dashboard --play-tag wine_campaign
audienti analytics cohorts create-list --name "Blank note test" --start 2026-07-20 --end 2026-07-20 --note-mode blank
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

To manage simple reminders for yourself:

```bash
audienti tasks list
audienti tasks list --status completed
audienti tasks add --title "Review target account" --due 2026-07-24T11:00 --list <list_id> --notes "Check the latest notes."
audienti tasks complete <ptsk_id>
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

To materialize a connection-request activity cohort as a reusable list selector,
then reuse it in analytics:

```bash
audienti analytics cohorts create-list --name "Connection requests 2026-07-01 to 2026-07-07" --event connection_request_sent --start 2026-07-01 --end 2026-07-07
audienti analytics dashboard --list <list_id>
audienti analytics prospects --list <list_id> --window 30d
audienti analytics users --user me --list <list_id> --start 2026-07-01 --end 2026-07-31
```

Use `--cohort-start` and `--cohort-end` when the cohort is based on when people
entered Audienti, a motion, or a receiving segment. Use `analytics cohorts
create-list` followed by `--list` when the cohort is based on an event that
happened later, such as connection requests sent in a date range. Rebuild the
list when the event definition or date window changes so the analytics question
stays auditable.

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

To start a report-backed writer session for one prospect, including the no-reply
path, planned actions, channel changes, and planned message rows:

```bash
audienti writer test-run <prsp_id>
```

The output includes a `Report: rprt_...` id. Treat that report id as the writing
session handle while the generated report is retained.

To draft every message into that report-backed session, opt into full report
mode:

```bash
audienti writer test-run <prsp_id> --mode report --report <rprt_id>
```

For writer debugging, draft only one selected timeline row on one branch into
the same report:

```bash
audienti writer test-run <prsp_id> --mode step --branch no-accept --step 3 --report <rprt_id>
```

The CLI queues the report job on the API and polls until the report finishes, so
slower writer calls do not depend on a single long HTTP request. Use
`--timeout-seconds <n>` to adjust the CLI wait budget.

To queue work into the report and come back later:

```bash
audienti writer test-run <prsp_id> --mode step --branch no-accept --step 3 --report <rprt_id> --no-wait
```

If the CLI stops waiting before the server job finishes, fetch the completed
report later with:

```bash
audienti writer test-run show <prsp_id> <rprt_id>
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
