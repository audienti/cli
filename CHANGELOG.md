# Changelog

All notable changes to the Audienti CLI are documented here.

## [Unreleased]

### Added

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
