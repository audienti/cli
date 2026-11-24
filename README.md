# Audienti CLI (`@audienti/cli`)

Official command-line client for [Audienti](https://app.audienti.com). Both `audienti` and `tofu` invoke the same binary.

Built for autonomous AI agents and operators to connect to a workspace, poll and claim queued work with zero-LLM exponential backoff, and manage audiences, offers, playbooks, campaigns, buying signals, prospects, and tools.

- **Agent onboarding guide:** <https://app.audienti.com/llms.txt>
- **OpenAPI specification:** <https://app.audienti.com/api/v1/openapi.json>
- **Hosted MCP endpoint:** `https://app.audienti.com/mcp`

## Install

Requires **Node.js 20+**.

```bash
npm install -g @audienti/cli
audienti --version
```

If you need to keep an existing global `audienti` binary untouched, install side-by-side into a local prefix:

```bash
npm install --prefix "$HOME/.local/audienti" @audienti/cli
"$HOME/.local/audienti/node_modules/.bin/audienti" --version
```

## Quick Start (Connect an Agent)

```bash
audienti connect --name "My Agent"
```

This prints a short approval link for the workspace owner. Once approved in the browser, the CLI saves your agent-bound token to `~/.audienti/exo-agent.json` (`0600` permissions) and automatically loads it on future commands.

Verify your connection:

```bash
audienti status --json
audienti whoami --json
```

You can also pass credentials per invocation with `EXO_API_TOKEN` (or `--token <exo_tok_...>`) and override the server with `EXO_API_URL` (or `--api-url <url>`). Defaults to `https://app.audienti.com`.

## Zero-LLM Work Watcher (`wake`)

Keep an agent responsive without burning LLM tokens on idle polls:

```bash
audienti wake \
  --heartbeat \
  --work-start 08:00 \
  --work-end 19:45 \
  --cmd 'your-agent "Claim and finish queued Audienti work."'
```

Run `audienti wake` from `cron`, `launchd`, or a systemd timer every minute:

- **Zero LLM cost when idle:** Calls `GET /api/v1/outbox/peek` only when the backoff window expires.
- **Automatic exponential backoff:** `1m → 2m → 4m → 16m` during weekday operating hours (`Mon–Fri`, `--work-start` to `--work-end`, accepting whole hours like `8` or `HH:MM` like `19:45`).
- **Off-hours & weekends:** Extends backoff to `60m` outside operating hours and on Saturdays/Sundays (pass `--include-weekends` to treat weekends as active days).
- **Instant reset:** Resets back to `1m` as soon as work is found.
- **Flags:**
  - `--heartbeat` — sends `POST /api/v1/agents/:id/heartbeat` on each real check so the workspace shows the agent online.
  - `--force` — bypasses the backoff timer and checks immediately.
  - `--webhook-url <url>` & `--webhook-secret-file <path>` — POSTs `work.available`, `wake.failed`, and `wake.recovered` JSON events directly to your wake webhook (with `Authorization: Bearer <secret>` and `X-Audienti-Webhook-Secret: <secret>`).
  - `--state-file <path>` — custom path for backoff state (default `~/.audienti/exo-peek-state.json`).
  - `--json` — machine-readable output.
- **Environment variables passed to `--cmd`:** `AUDIENTI_WORK_COUNT`, `AUDIENTI_ITEM_ID`, `AUDIENTI_ITEM_KIND`, `AUDIENTI_ITEM_TITLE`, `AUDIENTI_ITEM_CAPABILITY`, and `AUDIENTI_ITEM_TOUCHES_PEOPLE` (`"true"` or `"false"`, computed server-side).

## Work Loop Commands

```bash
# Check if work is waiting (zero side effects; includes nextItem.touchesPeople)
audienti work peek --json

# Claim the next work item (includes touchesPeople and resultSchema)
audienti outbox claim --json

# Dry-run validate a result payload before completing (never drops your claim)
audienti outbox validate <outbox-id> --result '{"summary":"Done"}' --json

# Extend lease while working on a long task
audienti outbox heartbeat <outbox-id> --attempt <n> --json

# Mark work complete with structured JSON result
audienti outbox complete <outbox-id> --attempt <n> --result '{"summary":"Done"}' --json

# Report failure (rate_limited | transient | permanent)
audienti outbox fail <outbox-id> --attempt <n> --class transient --message "Timeout" --json

# Ask the workspace owner a question (Operator inbox)
audienti inbox create --kind agent_question --title "Confirm targeting" --summary "..." --json
```

## Workspace & Campaign Commands

Every command supports `--json` for structured output.

```bash
# Workspace & agents
audienti workspaces list --json
audienti agent list --json
audienti agent heartbeat <agent-id> --json

# Audiences
audienti audiences list --json
audienti audiences show <audience-id> --json
audienti audiences create --file audience.json --json
audienti audiences edit <audience-id> --file audience.json --json
audienti audiences options industries "software" --json

# Offers & artifacts
audienti offers list --json
audienti offers show <offer-id> --json
audienti offers create --name "Pipeline Audit" --url https://example.com --json
audienti offers update <offer-id> --description "..." --json
audienti offers attach <offer-id> --kind brief --title "One-pager" --url https://example.com/brief --json

# Playbooks & campaigns
audienti playbook list --json
audienti playbook show <playbook-id> --json
audienti campaign list --json
audienti campaign show <campaign-id> --json
audienti campaign status <campaign-id> --json
audienti campaign create --playbook <id> --name "Q4 Signal Sprint" --automation finding_only --audience <audience-id> --participants empty.json --json
audienti campaign edit <campaign-id> --offer "Pipeline Audit" --json
audienti campaign audience <campaign-id> <audience-id> --json
audienti campaign prepare <campaign-id> --json   # agents may prepare finding_only campaigns

# Buying signals & discovery
audienti signals list <campaign-id> --json
audienti signals create <campaign-id> --kind topic --name "RevOps hiring" --file signal.json --json
audienti signals run <campaign-id> --json
audienti signals intake <campaign-id> --file candidates.json --json
audienti signals observations <campaign-id> --json
audienti signals qualifications <campaign-id> --json

# Prospects & tools
audienti prospects contactable --json
audienti prospects enrich <prospect-id> --json
audienti tools list --json
audienti call web.search '{"query":"..."}' --json
```

Run `audienti --help` for the full command reference.

## Hosted MCP

MCP clients can connect directly over HTTP using a workspace or agent token:

```bash
curl https://app.audienti.com/mcp \
  -H "Authorization: Bearer $EXO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Legacy Versions

- **Exora CLI (`exora.audienti.com`):** `npm install -g @audienti/cli@exora`

## License

MIT
