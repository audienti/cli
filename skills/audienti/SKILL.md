---
name: audienti
description: Use when the user wants to operate Audienti through the production CLI or app-hosted MCP endpoint, including account selection, plays, prospect imports, lists and routing rules, message previews, analytics, or supported operator outcomes.
---

# Audienti CLI and MCP

Use the installed `audienti` command or Audienti's app-hosted MCP endpoint as
the production contract. The packaged `audienti-mcp` command is only a local
stdio bridge for MCP hosts. Do not build a parallel wrapper or call
undocumented API endpoints.

Set `approach` in a Motion create/update payload, or use `motions update <id> --approach "..."`. A nonblank Approach automatically guides adaptive planning and writing; blank, nil, or whitespace keeps the existing sequence. The simple `--approach ""` flag explicitly clears the guidance and restores that sequence. There is no separate planning-mode selector, and existing sending controls still apply.

When Operator exposes `answer_planner_question`, read its prompt and candidate options with `operator queue` or `operator next`. Use `operator answer <row_id> --choice <id>` or `--answer "..."`, exactly one input. This command refetches the exact row and submits the current row and decision fingerprints. Do not substitute a generic outcome, a reusable steer note, or a guessed send. A 409 means refresh the question; 202 means the answer was recorded and planning continues. Answers apply only to that decision.

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
  mapping URLs, including the selected sender's active days, working hours,
  effective timezone, current in-window status, configured user fallback
  location, effective proxy geography and source, and server-calculated
  LinkedIn pacing and outstanding-invitation inventory authority under
  `social_cookie.automation`. Treat `ready: true` as connection readiness, not
  approval to start automation.
- `offers.create`, `icps.create`, and `motions.create` set up the offer, ICP,
  and play.
- Use `audienti icps list --status all` to audit active and archived ICPs. Use
  `audienti icps archive <icp_id>` for reversible cleanup and `restore` to make
  the ICP selectable again; restore never reactivates motions.
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
- For account-user automation, run `users automation show`, then preview the
  exact payload without `--apply`. Apply only after explicit authorization and
  verify the applied response/readback.
- Treat the production API as the source of truth. Persist durable work in
  Audienti rather than leaving it only in agent prose.
- Keep current gaps explicit. Do not imply that unsupported actions execute.

## Common Entry Points

```bash
audienti help agent-workflows
audienti prospects list --query "name or company" --wide --json
audienti prospects list --assigned-user unassigned --json
audienti prospects assign <prsp_id> --assigned-user me --json
audienti prospects move-account <prsp_id> --account <source_acct_id> --target-account <target_acct_id> --json
audienti prospects move-account <prsp_id> --account <source_acct_id> --target-account <target_acct_id> --assigned-user me --apply --json
audienti prospects set-status <prsp_id> --status not_fit --json
audienti prospects lock <prsp_id> --note "Emergency hold" --json
audienti prospects unlock <prsp_id> --json
audienti users activity me --window 7d --json
audienti users automation show <account_user_id|me> --platform linkedin --json --account <acct_id>
audienti users automation update <account_user_id|me> --payload automation-controls.json --json --account <acct_id>
audienti users automation update <account_user_id|me> --payload automation-controls.json --apply --json --account <acct_id>
audienti prospects import-batch --file prospects.csv --motion <motn_id> --assigned-user me --json
audienti lists create --name "Target list" --json
audienti lists routing-rules <list_id> list --json
audienti lists routing-rules <list_id> create --payload routing-rule.json --json
audienti lists routing-rules <list_id> move <rule_id> up --json
audienti lists routing-rules <list_id> apply --json
audienti motions quick-start --url https://example.com --wait --confirm --json
audienti motions abm-companies <motn_id> add --file abm-domains.txt --json
audienti motions abm-companies <motn_id> list --json
audienti motions update <motn_id> --status paused --json
audienti motions update <motn_id> --start-date 2026-09-01 --end-date 2026-09-30 --maximum-company-count 25 --json
audienti motions update <motn_id> --payload motion-principal-list.json --json
audienti motions activate <motn_id> --json
audienti motions delete <motn_id> --confirm yes --json
audienti operator next --json
audienti operator next --plan
audienti inbox-ops queue --json
audienti inbox-ops filters --json
audienti inbox-ops rule <row_id> --scope <sender|domain> --disposition <allow|filter> --json
audienti analytics motions --json
audienti analytics icps --json
audienti analytics prospects --window 24h --json
audienti analytics stages --window 30d
audienti analytics visibility --window 24h --user me --json
audienti analytics content --window week --json
audienti tools list --json
audienti tools humanize --file draft.txt --tone professional --json
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

## Prospect Account Moves

Use `audienti prospects move-account` only to transfer one prospect and its
account-scoped history, not to copy it. `--account` is the source account and
`--target-account` is the destination. The authenticated user must administer
both accounts.

Start with a preview and inspect `eligible`, `blockers`, `mappings`,
`dispositions`, and `expected_state`:

```bash
audienti prospects move-account <prsp_id> \
  --account <source_acct_id> \
  --target-account <target_acct_id> \
  --assigned-user <target_account_user_id|me> \
  --target-motion <target_motn_id> \
  --target-list <target_list_id> \
  --json
```

Omit mappings that were not explicitly chosen; never infer a target motion,
list, agent, or research mapping by name. Apply only after the preview is
eligible and the user authorizes the move:

```bash
audienti prospects move-account <prsp_id> \
  --account <source_acct_id> \
  --target-account <target_acct_id> \
  --assigned-user <target_account_user_id|me> \
  --target-motion <target_motn_id> \
  --target-list <target_list_id> \
  --apply \
  --json
```

With `--apply`, the CLI performs a fresh preview and submits that response's
`manifest_digest`; it does not reuse an older preview. Treat a stale manifest,
any blocker, or any failed response as not applied, then inspect current source
and target state before retrying.

## Account-User Automation Safety

`audienti users automation show <account_user_id|me>` resolves one connected
account through the selected account, account user, and LinkedIn platform. Use
per-command `--account` for administrative inspection without changing the
saved default. Fail closed on API ambiguity or missing access; do not substitute
another connected account.

Automation updates are preview-first:

```bash
audienti users automation show 136 --platform linkedin --json --account acct_example
audienti users automation update 136 --payload automation-controls.json --json --account acct_example
audienti users automation update 136 --payload automation-controls.json --apply --json --account acct_example
audienti users automation show 136 --platform linkedin --json --account acct_example
```

The payload object accepts `automation_controls`, `action_limits`, and
`visibility_ramp`. Action-limit keys are `profile_view`, `follow`, `like`,
`invite`, `message`, `comment`, and aggregate `visibility`; each action limit
may provide `hourly`, `daily`, and `weekly`. `follow` covers follow/unfollow,
`like` covers like/unlike, and `message` covers messages/InMail. A ramp accepts
`enabled`, `starting_daily_limit`, `weekly_increment`, and optional
`started_at`.

The CLI wraps the file as `{ automation: { ...payload, platform: "linkedin",
apply: false|true } }`; file values cannot override the command's platform or
apply decision. Omitted settings are preserved by the server. Use unchanged
JSON output to compare current, before, and after snapshots, including policy
source, schedule/timezone, configured/default/effective limits, used and
remaining capacity, binding limits, preview/applied state, and applied audit id.

For a new account, keep contact and writing controls disabled, enable risk
cooldown, and bound `visibility` to the authorized active-day warm-up level.
Never infer that `ready: true`, paused motions, or prepared queue work authorizes
provider execution.

List routing-rule create and update commands accept the same normalized
condition and action data as the list UI. Inspect the ordered rules first, use
`audienti lists routing-rules help` for the payload contract, and treat `apply`
as an asynchronous relaunch: it queues the existing routing job and does not
mean every list member has finished routing.

Motion start and end dates are optional lifecycle controls. A due start can
activate a configured preparing or paused motion; an end date is the final
active day and pauses the motion afterward. `--maximum-company-count` caps
durable company admissions only: research and people discovery for admitted
companies, prospect intake, and automation continue. Use `none` to clear any
of these settings.

`audienti writer test-run <prsp_id>` starts a report-backed writing session and
builds the campaign timeline without drafting every message. The printed
`Report: rprt_...` id is the session handle. Pass `--report <rprt_id>` when
drafting every message with `--mode report` or one selected row with
`--mode step`; the server report supplies prior drafted rows as context. Use
`--timeout-seconds <n>` for longer waits, or `--no-wait` to launch and return
immediately. Use `writer test-run show` with the report id to fetch the
completed report later.
