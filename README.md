# Audienti CLI

Audienti CLI is the agent-first command-line client for the Audienti production
API and the local bridge for Audienti's app-hosted MCP endpoint. It lets local
coding agents and operators inspect accounts,
create and manage plays, import prospects, build lists, manage task reminders,
configure list routing rules and account-user automation safety, and work
supported operator flows.

The Motion Approach guides post-accept planning and writing. Set it with `audienti motions update motn_123 --approach "Test the premise before asking for a meeting"` or the `approach` field in a create/update payload. A nonblank Approach automatically chooses adaptive planning; blank, nil, or whitespace uses the existing sequence. `--approach ""` explicitly clears it and restores the existing sequence. There is no separate planning-mode selector. Existing sending controls still apply.

`audienti operator queue` and `operator next` show planner and writer questions with candidate options. Answer one with `audienti operator answer <row_id> --choice <id>` or `--answer "Your guidance"`. The command fetches that exact row even when it is not the next move, then submits its current fingerprints. Stale or double answers return 409; an accepted answer returns 202 planning. Answers guide only the current decision. Planning and preview never authorize sending.

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

Authenticate through the browser, then configure the default account context:

```bash
audienti auth login
audienti accounts list --json
audienti accounts select <acct_id>
audienti users list
audienti users select <account_user_id|email|name|me>
```

`audienti auth login` opens Audienti in your browser, creates an API token from
your signed-in web session, sends it back to a temporary `127.0.0.1` callback,
and stores it in the local CLI config after validating it.

If you already have a token, you can still configure it directly:

```bash
audienti auth token <token>
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

## MCP

Audienti serves MCP from the app at `/mcp`. The package ships a small stdio
bridge for MCP hosts that need a local command:

```bash
audienti-mcp
```

Use it this way:

1. Install the package.
2. Run `audienti auth login`.
3. Run `audienti accounts select <acct_id>`.
4. Configure your MCP host with the packaged `.mcp.json`, or point it at the
   `audienti-mcp` command.
5. In the MCP host, list tools and call the account-scoped tool you need.

The bridge reads the same `~/.config/audienti/config.json` as the CLI, forwards
MCP JSON-RPC messages to the app, and injects the selected account when a tool
call does not include `account_id`. If you want a tool to run against a
different account, pass `account_id` in that tool call.

MCP clients that can call HTTP directly may use the hosted endpoint instead of
the stdio bridge:

```bash
curl https://app.audienti.com/mcp \
  -H "Authorization: Bearer $AUDIENTI_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Example tool call:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "analytics.stages",
    "arguments": {
      "account_id": "acct_...",
      "query": {
        "interval": "weekly",
        "cohort_start_date": "2026-07-01",
        "cohort_end_date": "2026-07-31"
      }
    }
  }
}
```

Useful MCP tools to start with:

- `auth.me` confirms the token identity.
- `accounts.list` shows accessible accounts.
- `setup.play_preflight` returns LinkedIn connected-account readiness and setup
  or mapping URLs.
- `offers.create`, `icps.create`, and `motions.create` set up the offer, ICP,
  and play.
- `analytics.stages` returns stage conversion cohorts and stage aging.
- `analytics.cohort_lists.create` materializes event cohorts as reusable lists.

Common inspection commands:

```bash
audienti update check
audienti operator next --plan
audienti writer test-run <prsp_id>
audienti analytics motions --json
audienti analytics icps --json
audienti motions analytics <motn_id>
audienti motions run-discovery <motn_id>
audienti motions quick-start --url https://example.com --wait --confirm
audienti motions abm-companies <motn_id> add --file abm-domains.txt
audienti motions abm-companies <motn_id> list
audienti motions update <motn_id> --status closing
audienti motions update <motn_id> --status paused
audienti motions update <motn_id> --start-date 2026-09-01 --end-date 2026-09-30 --maximum-company-count 25
audienti motions update <motn_id> --own-post-engagement true
audienti motions update <motn_id> --payload motion-principal-list.json
audienti motions update <motn_id> --payload motion-signals.json
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
audienti lists routing-rules <list_id> list
audienti lists routing-rules <list_id> apply
audienti users activity --window 7d
audienti users automation show 136 --platform linkedin --json --account <acct_id>
audienti users automation update 136 --payload automation-controls.json --json --account <acct_id>
audienti users automation update 136 --payload automation-controls.json --apply --json --account <acct_id>
audienti analytics prospects --window 24h
audienti analytics dashboard --play-tag wine_campaign
audienti analytics metrics --cohort-preset week-to-date
audienti analytics cohorts create-list --name "Blank note test" --start 2026-07-20 --end 2026-07-20 --note-mode blank
audienti analytics users --user me --window 30d
audienti analytics visibility --window 24h --user me
audienti analytics content --window week
audienti tools list
audienti tools humanize --file draft.txt --tone professional --language English
audienti tools linkedin-review --url https://www.linkedin.com/in/example --icp <icp_id>
audienti tools linkedin-review reports
audienti tools linkedin-review show <rprt_id>
audienti tools linkedin-review status <rprt_id>
```

To humanize arbitrary text without exposing the underlying provider key, pass a
UTF-8 file. Plain output contains only the transformed text, so it can be
redirected directly to another file:

```bash
audienti tools humanize --file draft.txt --tone professional > revised.txt
audienti tools humanize --file draft.txt --language English --json
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

Inbox Ops has its own owner-scoped CLI surface. Queue rows expose the stable row
id used by the row-based rule command. Rules can also be set or removed directly
by sender or domain; the server normalizes and validates every supplied key:

```bash
audienti inbox-ops queue [--page <n>]
audienti inbox-ops filters
audienti inbox-ops rule <row_id> --scope sender --disposition filter
audienti inbox-ops rule <row_id> --scope domain --disposition allow
audienti inbox-ops rule set --scope sender --key news@example.com --disposition filter
audienti inbox-ops rule remove --scope domain --key example.com
```

The rule commands mirror the Operator card actions. They update only
the authenticated owner's personal/global Inbox Ops preferences and do not
archive mail, call the provider, or add a DNC entry.

To manage simple reminders for yourself:

```bash
audienti tasks list
audienti tasks list --status completed
audienti tasks add --title "Review target account" --due 2026-07-24T11:00 --list <list_id> --notes "Check the latest notes."
audienti tasks complete <ptsk_id>
```

To manage the same ordered rules shown in a list's Routing Rules UI, use a JSON
payload for create and update operations:

```bash
audienti lists routing-rules <list_id> list
audienti lists routing-rules <list_id> create --payload routing-rule.json
audienti lists routing-rules <list_id> update <rule_id> --payload routing-rule.json
audienti lists routing-rules <list_id> move <rule_id> up
audienti lists routing-rules <list_id> remove <rule_id>
audienti lists routing-rules <list_id> apply
```

```json
{
  "name": "VP prospects to Alice",
  "enabled": true,
  "action_kind": "assign_user",
  "target_account_user_id": "alice@example.com",
  "conditions": {
    "seniorities": [
      {"id": "5", "name": "Vice President", "negative": false}
    ],
    "seniority_match_mode": "at_least"
  }
}
```

Use `action_kind: "route_to_list"` with `target_list_id` to route to another
working list. `apply` queues the existing list-routing background job, just like
the UI; it reports that work was enqueued, not that every prospect has finished
routing. Run `audienti lists routing-rules help` for the full condition contract.

To inspect activity for prospects that entered the account during a specific
cohort while keeping a separate activity window:

```bash
audienti analytics prospects --cohort-start 2026-07-01 --cohort-end 2026-07-07 --window 7d
```

To compare recent weekly prospect cohorts by their current pipeline stages:

```bash
audienti analytics prospects cohort-analysis --weeks 4 --motion <motn_id>
```

To inspect the current outcomes of outbound operations created in a date range,
use the account-scoped metrics report:

```bash
audienti analytics metrics --cohort-start 2026-08-24 --cohort-end 2026-08-30 --interval daily
audienti analytics metrics --cohort-start 2026-08-24 --cohort-end 2026-08-30 --interval weekly
audienti analytics metrics --cohort-preset week-to-date --user me --motion <motn_id> --play-tag <tag> --list <list_id> --offer <offr_id> --icp <icp_id> --social-cookie <scok_id> --platform linkedin --action messaging.message_sent --outcome succeeded_after_retry
audienti analytics metrics --cohort-preset week-to-date --json
```

This is an `events.created_at` root-operation cohort, and each operation is
classified by its current outcome across all of its attempts. It is distinct
from the `AccountProspect.created_at` entry cohorts used by dashboard, stages,
and prospect cohort analysis. The command
makes one authenticated request to the account Metrics API. Plain text formats
only the returned cohort ranges, Operations, First-try success, Recovered, Final
failures, In progress, Attempts, selected daily or weekly grid rows, action rows,
and account-wide Social Cookie rows. `--json` prints the API response deeply
unchanged; the CLI does not recalculate cohorts, outcomes, counts, or rates.

The six leaf outcomes are `first_attempt_success`, `succeeded_after_retry`,
`failed_without_retry`, `failed_after_retry`, `in_progress`, and `unresolved`.
The `success` and `failure` values are umbrella filters over their corresponding
two terminal leaf outcomes.

For example, the human output uses the server-provided values directly:

```text
Outbound metrics
Cohort: 2026-08-24 to 2026-08-30 (events.created_at)
Current: 2026-08-24T00:00:00-05:00 to 2026-08-31T00:00:00-05:00
Previous: 2026-08-17T00:00:00-05:00 to 2026-08-24T00:00:00-05:00
Operations: 1347
First-try success: 1275 (94.7%)
Recovered: 40 (3%)
Final failures: 16 (1.2%)
In progress: 16 (1.2%)
Attempts: 1400
```

To materialize a connection-request activity cohort as a reusable list selector,
then reuse it in analytics:

```bash
audienti analytics cohorts create-list --name "Connection requests 2026-07-01 to 2026-07-07" --event connection_request_sent --start 2026-07-01 --end 2026-07-07
audienti analytics dashboard --list <list_id>
audienti analytics prospects --list <list_id> --window 30d
audienti analytics users --user me --list <list_id> --start 2026-07-01 --end 2026-07-31
```

For prospect, dashboard, and stages analytics, use `--cohort-start` and
`--cohort-end` when the cohort is based on when people entered Audienti, a
motion, or a receiving segment. Use `analytics cohorts
create-list` followed by `--list` when the cohort is based on an event that
happened later, such as connection requests sent in a date range. Rebuild the
list when the event definition or date window changes so the analytics question
stays auditable.

`audienti setup play preflight` includes the selected sender's server-derived
working schedule under `social_cookie.automation`, including `active_days`,
normalized `working_hours`, effective `time_zone`, and current
`in_working_hours` state. The human-readable output reports the same timezone,
today's window, and whether provider execution is currently inside the window.
It also reports the configured user fallback location, the connected account's
configured and last-verified effective proxy geography, and the proxy source
without exposing proxy URLs, credentials, egress IPs, or browser session data.
For LinkedIn, `social_cookie.automation.pacing` includes effective weekly
quotas, daily targets, motion active days, the outstanding-invitation cap, ramp
configuration, current outstanding inventory, any inventory blocker, and current
invitation capacity calculated by the server. A `null` weekly quota means
unlimited.

Use `users automation` to inspect or change one account user's LinkedIn safety
policy without changing the saved account selection:

```bash
audienti users automation show 136 --platform linkedin --json --account acct_example
audienti users automation update 136 --payload automation-controls.json --json --account acct_example
audienti users automation update 136 --payload automation-controls.json --apply --json --account acct_example
```

`update` is preview-only unless `--apply` is present. The CLI always sends
`platform: "linkedin"` and an explicit `apply` boolean after the file fields,
so a payload file cannot silently opt into applying a change. The server scopes
the connected account through the selected account plus account user, preserves
omitted controls, returns the before and proposed/actual after states, and
records an audit event only for an applied update. `--json` prints the server
payload unchanged.

An `automation-controls.json` warm-up payload can use every automation gate,
independent action limits, an aggregate visibility limit, and a weekly ramp:

```json
{
  "automation_controls": {
    "automatic_sending_enabled": false,
    "visibility_operations_autopilot_enabled": true,
    "post_comment_autopilot_enabled": false,
    "connection_request_autopilot_enabled": false,
    "inmail_autopilot_enabled": false,
    "direct_message_autopilot_enabled": false,
    "email_sending_autopilot_enabled": false,
    "manual_action_handoff_enabled": false,
    "risk_cooldown_enabled": true
  },
  "action_limits": {
    "profile_view": { "hourly": 2, "daily": 4, "weekly": 20 },
    "follow": { "hourly": 2, "daily": 3, "weekly": 15 },
    "like": { "hourly": 1, "daily": 2, "weekly": 10 },
    "invite": { "hourly": 1, "daily": 2, "weekly": 10 },
    "message": { "hourly": 1, "daily": 2, "weekly": 10 },
    "comment": { "hourly": 1, "daily": 1, "weekly": 5 },
    "visibility": { "hourly": 3, "daily": 8, "weekly": 40 }
  },
  "visibility_ramp": {
    "enabled": true,
    "starting_daily_limit": 8,
    "weekly_increment": 2
  }
}
```

`follow` covers follows and unfollows; `like` covers likes and unlikes;
`message` covers messages and InMail. `visibility` is the aggregate cap across
profile views, follows/unfollows, and likes/unlikes. The show/preview readback
includes configured, default, effective, used, and remaining hourly, daily,
and weekly values plus the currently binding limits.

Motion update payload mode can replace the selected principal and backing list:

```json
{
  "principal_account_user_id": 136,
  "list_id": "list_abc123"
}
```

The principal and list are resolved inside the selected account. Use
`"list_id": null` to clear the backing list.

To inspect the account's current prospect mix by motion type and compare it
with the rolling seven-day recorded-source contribution:

```bash
audienti analytics motions
audienti analytics motions --json
```

Current Unattributed counts mean no current motion association. Rolling
seven-day Unattributed counts mean no attributable recorded source motion; the
server falls back to the current motion only when recorded source data is
blank.

To inspect the account's current prospect mix by source ICP and compare it
with the rolling seven-day source contribution:

```bash
audienti analytics icps
audienti analytics icps --json
```

Unattributed means no attributable account source ICP. The server falls back
to the current motion ICP only when recorded ICP source data is blank.

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

Outbound, inbound, and LOPA motions are accepted only when their current
configuration and discovery producer are executable. An accepted response
includes a durable `run` receipt that starts in `pending` before the discovery
job is queued. Rejected launches exit nonzero and report the authoritative
`reason`, optional `next_eligible_at`, and `suggested_action`; `--json` preserves
that structured response on stdout for automation. Completed receipts keep
candidate `submitted_count` separate from the current persisted
`promoted_count`, and expose completed, failed, and blocked scope counts.

To check whether a motion has executable configuration before preparing,
activating, or running discovery:

```bash
audienti motions status <motn_id>
audienti motions status <motn_id> --json
```

The JSON response includes `executable_configuration.valid` plus a reason when
the config is incomplete, such as missing outbound signals or missing LOPA
tracked profile URLs. Its latest discovery receipt uses the same submitted,
promoted, and scope outcome fields as `run-discovery`.

To create and launch a quick-start motion from a company URL:

```bash
audienti motions quick-start --url https://example.com --wait --confirm
```

To create or update an ICP from a rich JSON payload:

```bash
audienti icps create --payload icp.json
audienti icps update <icp_id> --payload icp-patch.json
audienti icps list --status all
audienti icps archive <icp_id>
audienti icps restore <icp_id>
```

`icps update --payload` accepts the same human-readable facet keys as create.
Supplied facet collections, such as `company_sizes_attributes`, replace that
collection in place; omitted fields and collections remain unchanged. Invalid
lookup values fail server-side without partially applying the patch.
Archive is reversible and is the normal cleanup action. It removes the ICP from
new selection, closes active primary motions so admitted work can drain,
archives inactive primary motions, and preserves secondary motion links.
Restoring the ICP does not reactivate motions.

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

To preview moving a prospect and its account-scoped history into another
account where you are also an administrator:

```bash
audienti prospects move-account <prsp_id> --account <source_acct_id> --target-account <target_acct_id>
audienti prospects move-account <prsp_id> --account <source_acct_id> --target-account <target_acct_id> --assigned-user me --target-motion <motn_id> --target-list <list_id> --apply
```

The command is preview-only unless `--apply` is present. Apply always requests
a fresh preview first and submits the returned `manifest_digest`, so a move is
rejected when the underlying state changes. `--json` prints the preview or final
apply response unchanged.

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
