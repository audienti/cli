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
```

The CLI writes its local configuration to `~/.config/audienti/config.json` with
owner-only permissions. Do not place a production token in an agent prompt,
repository file, issue, or CI secret.

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
audienti operator next --plan
audienti writer test-run <prsp_id>
audienti motions analytics <motn_id>
audienti prospects show <prsp_id> --json
audienti prospects list --profiles
audienti analytics prospects --window 24h
audienti analytics users --user me --window 30d
audienti analytics visibility --window 24h --user me
audienti analytics content --window week
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
