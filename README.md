# Audienti CLI

Audienti CLI is the agent-first command-line client for the Audienti production
API. It lets local coding agents and operators inspect accounts, create and
manage plays, import prospects, build lists, and work supported operator flows.

## Install

Requires Node.js 20 or newer.

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
audienti analytics prospects --window 24h
audienti analytics visibility --window 24h --user me
audienti analytics content --window week
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
