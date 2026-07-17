# Changelog

All notable changes to the Audienti CLI are documented here.

## [Unreleased]

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
