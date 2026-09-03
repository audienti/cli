# Changelog

All notable changes to the Audienti CLI are documented here.

## [Unreleased]

## [0.1.50] - 2026-09-02

### Added

- Add preview-first `audienti prospects move-account` with dual-account selection, optional destination assignment, motion and list mappings, manifest-bound apply, stable human-readable summaries, and unchanged final JSON output.

## [0.1.49] - 2026-09-02

### Added

- Expose configured user and social-cookie proxy geography, effective proxy source, and server-calculated LinkedIn quotas, warm-up ramp, outstanding-invitation inventory state, and current invitation capacity in `audienti setup play preflight` without exposing proxy or authentication secrets.

## [0.1.48] - 2026-09-02

### Added

- Add account-scoped `audienti users automation show` and preview-first `update` commands for principal-specific LinkedIn controls, category and aggregate visibility limits, warm-up ramping, unchanged JSON readback, and explicit `--apply` persistence.
- Add reversible `audienti icps archive` and `restore` commands, active/archived/all list filtering, lifecycle status in ICP analytics, and inspectable primary-motion and preserved-secondary-link effects.

## [0.1.47] - 2026-09-02

### Added

- Expose server-derived social-cookie active days, working hours, effective timezone, and current in-window status in `audienti setup play preflight`.

### Changed

- Allow `audienti motions update <motn_id> --payload <file.json>` to replace an account-scoped motion principal and backing list, including `list_id: null` clearing.

## [0.1.46] - 2026-09-02

### Added

- Add `audienti analytics icps` and the account-scoped ICP analytics API for current source-ICP prospect mix, rolling seven-day contribution, per-ICP counts, creation timestamps and human-readable ages, and explicit unattributed semantics.

### Changed

- Allow `audienti motions update <motn_id> --status closing` for motion wind-downs that stop discovery while admitted Operator work drains.

## [0.1.45] - 2026-09-02

### Added

- Add `audienti analytics motions` and the account-scoped motion analytics API for current prospect mix, rolling seven-day recorded-source contribution, per-motion counts, explicit attribution semantics, and unchanged machine-readable JSON output.

### Changed

- Keep Operator and analytics API responses within shared product visibility while preserving true-user authorization for Operator queues.

## [0.1.44] - 2026-09-01

### Added

- Add `audienti analytics metrics` for one-request account-scoped outbound operation cohorts, canonical operation and attempt counts, daily or weekly rows, six leaf outcome filters plus success/failure umbrellas, exact JSON output, and filters for account users, motions, tags, lists, offers, ICPs, Social Cookies, platforms, and actions.

## [0.1.42] - 2026-08-28

### Changed

- Track the account Operator API contract update for tenant-scoped projected queue reads, explicit count availability, legacy cursor fallback, and asynchronous outcome reconciliation.

## [0.1.41] - 2026-08-26

### Fixed

- Track the account Operator outcome API contract update that accepts legacy null active membership statuses when recording visible read-model queue rows.

## [0.1.40] - 2026-08-26

### Changed

- Expose effective workspace automation policy mode, source, and blocking reason for shared social cookies in account API readback.

## [0.1.39] - 2026-08-26

### Changed

- Preserve the account Operator API contract while serving bounded pages from the asynchronous queue read model and recording actions without rebuilding the full audience queue.

## [0.1.38] - 2026-08-24

### Added

- Add `audienti tools humanize --file <path>` with optional tone and language controls, plain-text output for shell redirection, and normalized JSON output through the authenticated Audienti API.

## [0.1.37] - 2026-08-23

### Added

- Add motion start/end scheduling and maximum-company discovery-cap configuration to motion API readback and CLI create/update/show workflows.

### Changed

- Show conversion totals, stage SLA, and oldest stage age in the default `audienti analytics stages` output so it matches the dashboard read model without requiring `--json`.

## [0.1.36] - 2026-08-22

### Added

- Add `audienti lists routing-rules` commands to inspect, create, update, remove, reorder, and apply the same account-scoped list routing rules available in the UI.

## [0.1.35] - 2026-08-18

### Added

- Add `audienti motions abm-companies` commands for listing, adding, and removing motion-scoped positive company filters through the account API.
- Surface ICP `seniority_match_mode`, motion inbound channels, LOPA profile rows, signal rows, and ABM company filters in CLI/API readbacks.

### Fixed

- Reject `posting_language` on non-hiring signal rows instead of accepting a field that cannot persist outside company-scope hiring signals.

## [0.1.34] - 2026-08-17

### Added

- Add `audienti icps update <icp_id> --payload <file.json>` for rich ICP facet patches using the same payload shape as ICP creation.
- Surface executable motion configuration validity in `audienti motions status`, including missing outbound signals and missing LOPA tracked profile URLs.
- Add outbound motion signal configuration to `audienti motions create --payload` and `audienti motions update <motn_id> --payload <file.json>`, including scoped company/person/both signal rows.

### Changed

- Default omitted inbound motion channels to LinkedIn-only when motions are created through the CLI/API contract; Reddit remains explicit opt-in.

## [0.1.33] - 2026-08-13

### Added

- Add `audienti motions quick-start --url <company_url>` for URL-generated quick-start drafts, with optional `--wait --confirm` motion setup and discovery launch.

## [0.1.32] - 2026-08-11

### Added

- Add `audienti auth login` for browser-based local authentication through a loopback callback.
- Add the `audienti-mcp` stdio bridge and Codex MCP manifest for Audienti's app-hosted MCP endpoint, including stage analytics and cohort list creation.

## [0.1.31] - 2026-08-10

### Added

- Add `audienti setup play preflight` for checking LinkedIn connected-account readiness and returning direct setup, mapping, or edit URLs before an agent activates a play.
- Add `audienti analytics stages` for weekly or monthly stage conversion cohorts and current stage aging/overdue metrics.

## [0.1.30] - 2026-08-04

### Changed

- Track the account API contract update that blocks provider-backed company search while account processing is stopped.

## [0.1.29] - 2026-07-23

### Added

- Add `audienti analytics cohorts create-list` to materialize event-date cohorts as reusable analytics list filters.
- Add `--list <list_id>` to prospects, dashboard, users, and prospect cohort-analysis analytics commands.
- Add `audienti tasks list`, `audienti tasks manage`, `audienti tasks add`, and `audienti tasks complete` for plain operator reminders.

## [0.1.28] - 2026-07-23

### Added

- Add `audienti prospects reenrich` for dry-running or queueing one forced LinkedIn person profile re-enrichment.
- Add `audienti prospects refresh-queue` for dry-running or applying account-scoped next-action and operator draft cache repair for one prospect.

## [0.1.27] - 2026-07-22

### Added

- Add `audienti operator failed-drafts` and `audienti operator failed-drafts requeue` for listing failed prospect operator drafts and queueing async rewrites.

### Fixed

- Show prospect replan coach errors as not persisted instead of displaying failed `--apply` runs as dry runs.

## [0.1.26] - 2026-07-22

### Added

- Add `audienti prospects replan <prsp_id> [--apply]` for dry-running or persisting refreshed next-action coach plans.

## [0.1.25] - 2026-07-22

### Added

- Add `bad_data_404` support to prospect disposition commands.

## [0.1.24] - 2026-07-22

### Changed

- Preserve operator outcome source metadata and return the authoritative disposition event for API nurture actions.

## [0.1.23] - 2026-07-21

### Changed

- Expose authoritative delivery state, blocking reason, provider error, and retry timing for ContentOps comment tasks.

## [0.1.22] - 2026-07-21

### Added

- Add `related` mode to `audienti users activity` for inspecting human work performed through the selected user's connected accounts.

## [0.1.21] - 2026-07-20

### Changed

- Show scoped help when a CLI command prefix is entered without the required remaining command or arguments, accept `account` as an alias for `accounts`, make `writer test-run` build the timeline without drafting every message by default, back writer test runs with a reusable report session instead of a CLI-local cache, run writer report work through a queued job that the CLI polls instead of holding one long HTTP request open, add `--report <rprt_id>` to continue a writer session, add `--no-wait` for launching queued writer work and coming back later, add `writer test-run show <prsp_id> <rprt_id>` to retrieve queued writer output after it finishes, let the workspace `bin/cli` reuse the global account selection without carrying bearer tokens across hosts, and explain API network failures with the configured host.

## [0.1.20] - 2026-07-19

### Changed

- Track the account API contract update that limits root account routes to supported actions and adds scoped account show responses.

## [0.1.19] - 2026-07-17

### Added

- Add `audienti tools linkedin-review --url <linkedin_url> [--icp <icp_id>]` to queue the LinkedIn Review / Blueprint report from the CLI.
- Add `audienti tools list` to show available CLI-backed tools and their report inspection commands.
- Add `audienti tools linkedin-review reports [--limit <n>]` to list recent LinkedIn Review reports and find report ids.
- Add `audienti tools linkedin-review show <rprt_id>` to print completed report content in the terminal.
- Add `audienti tools linkedin-review status <rprt_id>` to inspect report stage, run status, timestamps, and product URL while the profile review is building.

## [0.1.18] - 2026-07-17

### Added

- Add ContentOps CLI commands for inspecting programs, reviewing plan rows, approving/scheduling/publishing work items, and handling comment tasks.
- Add `audienti motions update <motn_id> --own-post-engagement <true|false>` to enable or disable owned-post engagement intake for inbound motions.

## [0.1.17] - 2026-07-17

### Added

- Add `audienti dnc list/add/import/remove` for account DNC settings.
- Add `audienti company-rules list/create/update/remove/apply` for account-wide and user-scoped company disposition policies.

## [0.1.16] - 2026-07-17

### Added

- Add direct prospect emergency state commands: `audienti prospects set-status`, `audienti prospects lock`, and `audienti prospects unlock`.

## [0.1.15] - 2026-07-16

### Added

- Add `audienti prospects check` for listing people missing certified company employment citations, with direct app URLs for operator review.
- Add `audienti motions run-discovery` for queuing immediate discovery through the API launch gate.
- Add `audienti analytics dashboard` for CLI access to campaign cohort counts, including distinct company targets filtered by play tag, motion, offer, ICP, or user.

## [0.1.14] - 2026-07-16

### Added

- Add `audienti update check` for comparing the local CLI version to the latest published `@audienti/cli` package.

## [0.1.13] - 2026-07-16

### Added

- Add ICP tags to `audienti icps list/create/update` and add `audienti icps add-tag/remove-tag`.
- Include ICP usage in `audienti tags list` and `audienti tags show <tag>`.
- Add `audienti icps show <icp_id>` for single ICP inspection.
- Add full offer CLI/API CRUD with `audienti offers show/update/delete`.
- Add `audienti prospects reject`, `audienti prospects nurture`, and `audienti prospects restore` through the shared prospect disposition paths.

## [0.1.12] - 2026-07-16

### Added

- Add `audienti motions add-tag/remove-tag` and `audienti lists add-tag/remove-tag` for managing play and list tags through the CLI/API contract.
- Allow tags to be sent during list create/update and motion create/update payloads.
- Add `audienti tags list` to show normalized list and motion tags currently in use.
- Add `audienti tags show <tag>` plus `--tag` filters for list and motion listing commands.

## [0.1.11] - 2026-07-15

### Added

- Add `audienti users select <account_user_id|email|name|me>` to save a default account user for CLI commands that accept `me` or default to the current operator.

### Changed

- Restrict inbound motion creation to the executable LinkedIn and Reddit channels and reject undeployed channel names.

## [0.1.10] - 2026-07-15

### Added

- Add `audienti motions update <motn_id> --status <draft|preparing|active|paused|archived>` plus `activate`, `pause`, and `archive` shortcuts for motion/play lifecycle status management.
- Add `audienti motions delete <motn_id> --confirm <yes|true|Y|y>` to delete a motion/play through the API cleanup path.

## [0.1.9] - 2026-07-15

### Added

- Add `audienti prospects assign <prsp_id> [prsp_id...] --assigned-user <id|me|unassign>` for reassigning existing prospects from the CLI.
- Add `audienti users activity <account_user_id|me>` for inspecting one account user's outbound activity feed.
- Add `audienti prospects import-batch --file <csv|jsonl|json>` for starting multiple normal prospect imports with shared list, motion, and assignee defaults.
- Add `audienti prospects list --assigned-user unassigned` for finding prospects without an owner.

## [0.1.8] - 2026-07-14

### Added

- Add `audienti motions clone <motn_id> --name <text>` to clone a motion/play config through the API without copying people.
- Add `audienti motions move-prospects <source_motn_id> --target <target_motn_id> <prsp_id> [prsp_id...]` to transfer prospects between motions/plays.

## [0.1.7] - 2026-07-12

### Fixed

- Show writer test-run target-step error status and warnings when a draft fails instead of rendering an empty drafted-copy block.

## [0.1.6] - 2026-07-12

### Added

- Add `audienti writer test-run <prsp_id>` for a single-prospect campaign preview with the no-reply path, planned actions, channel changes, and drafted messages, plus `--mode plan` and `--mode step --step <step_key|row_number>` for fast simulator and targeted writer-debug runs.
- Add `audienti analytics prospects --cohort-start YYYY-MM-DD --cohort-end YYYY-MM-DD` to inspect prospects by the `AccountProspect.created_at` cohort while keeping `--window` for activity counts.
- Add `audienti analytics prospects cohort-analysis --weeks <n>` to compare recent weekly prospect cohorts by current pipeline-stage counts.
- Add `--motion <motn_id>` to prospect analytics so cohorts can be narrowed to one motion/play.
- Add `--provenance <source>` to prospect analytics for lower-level intake source filters.
- Add `audienti analytics users --user me` for account-user action audit analytics with date-range, cohort, motion, and provenance filters.
- Add `audienti motions analytics <motn_id>` to inspect one motion's produced-day prospect cohorts, current active/inactive mix, and funnel stages from `AccountProspect.created_at`.

### Changed

- Group root help by work area and common workflow so `audienti help` is easier to scan.

## [0.1.5] - 2026-07-11

### Added

- Add the `https://cli.audienti.com/install` curl installer backed by the public CLI mirror and npm package.
- Add `audienti operator next --done|--skip|--fail|--return` shortcuts for recording the current prospect next-move outcome without hand-building a payload file.
- Add `audienti prospects add-profile` and `audienti prospects report-bad-profile` for updating prospect profile channels through the same server paths used by the prospect show page.

### Changed

- Send fingerprinted `operator next` outcome shortcuts through the server-derived row contract so queue-row semantics stay on the API side.

### Fixed

- Reject `audienti operator next --note` and `--occurred-at` unless an outcome flag is present.

## [0.1.4] - 2026-07-11

### Added

- Add `audienti operator next --plan` for deterministic next-action plan output.
- Add `audienti analytics prospects`, `audienti analytics visibility`, and `audienti analytics content` for account-scoped operational analytics.

## [0.1.3] - 2026-07-11

### Changed

- Track the admin-only announcement creation API contract.

## [0.1.2] - 2026-07-10

### Added

- Add `audienti prospects timeline` for filtered prospect timeline reads.
- Add `audienti prospects sequence-export` for spreadsheet-ready no-reply sequence previews.

## [0.1.1] - 2026-07-10

### Changed

- Support the queued prospect import API contract.

## [0.1.0] - 2026-07-10

### Added

- Initial public release of the agent-first Audienti CLI.
