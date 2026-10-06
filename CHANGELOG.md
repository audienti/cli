# Changelog

All notable changes to the Audienti CLI are documented here.

## [Unreleased]

## [0.1.102] - 2026-10-06

### Removed

- The `unsupported_plan_version` planner status. Every prospect plan now uses the current planner version, so the API no longer returns that status and the CLI no longer labels it.

## [0.1.101] - 2026-10-05

### Changed

- `POST quick_starts` accepts `page_url` to read one page, such as a product or landing page, for a new experiment. Each read makes a fresh result and leaves the account's company website unchanged. Only the person asking can read a page; nobody reads one for someone else.
- Card edits on the API keep the same fields as before; the list now lives in one place shared with the web.

## [0.1.100] - 2026-10-05

### Changed

- The setup state returned by the API now includes `linkedin_sign_in` (not_started, signing_in, code_needed, approval_needed, connected, failed or needs_attention) and `linkedin_account_id`.
- A LinkedIn social account can be created with only its sign-in email and password; the profile handle is read after sign-in.

## [0.1.99] - 2026-10-05

- List user-owned content plans and read scripts with `content plans` and `content plan --report`.
- Edit, approve, research, draft and generate visuals for a plan piece through the existing production services.
- Approve an explicit comment reply through the tracked post endpoint with `content post-reply`.

## [0.1.98] - 2026-10-04

### Added

- `content track <url>` submits an owned LinkedIn post for tracking. `content posts` lists tracked posts, and `content engagement <cpwi_id>` reads collected comments and reactions.

## [0.1.97] - 2026-10-04

### Added

- `tools email-find`, `tools linkedin-enrich`, `tools signals-find` and `tools write` run standalone account tools without creating prospects or experiments (#2554). Each returns a run id at once; `--wait` polls until the run finishes and prints the results, and `--request-key` makes a retry return the same run.
- `tools runs list|show|results|export` read tool runs after the CLI exits. Details expire after 90 days; the summary stays.
- `tools humanize --async` submits the humanizer as a tool run. Plain `tools humanize` is unchanged.
- `network list|export --cookie <scok_id>` reads the saved connections, followers and following of your own connected account, with coverage. It never visits LinkedIn or X.
- Requests now send `X-Audienti-Client: cli`, so runs show where they came from.

### Changed

- API errors with HTTP 429 or 503 show the server's message.

## [0.1.96] - 2026-10-03

### Added

- `PATCH /api/v1/accounts/:account_id/quick_start/:id` changes one card of a ready setup draft (`section` is `icp`, `offer` or `signals`) and returns the same JSON as the draft read. New job titles bring new example people in the response (#2551).
- The draft preview now includes `icp.company_sizes`, `icp.company_types` and `signals`.
- Reading a ready draft whose job titles were changed on the setup page makes its example people first, so `example_people` is never left empty by an edit.

## [0.1.95] - 2026-10-03

### Changed

- API error messages and MCP tool titles say "experiment" instead of "motion". Command names, API paths and JSON keys are unchanged (#2551).

## [0.1.94] - 2026-10-03

### Added

- `motions quick-start` takes `--city`, `--state` and `--country`. Setup needs them once, before the first draft; the place also sets your time zone. Without them a person with no saved place gets "Pick your country." (#2551).
- `motions setup-state` shows which setup step you are on, what is needed next, and how many people your setup experiment has found (#2551).

## [0.1.93] - 2026-10-03

### Added

- `social-cookies show <scok_id> --json` includes `computer_usage`: separate measured Computer and browser-container bandwidth, running time, measurement coverage and timestamps. Missing usage stays unknown; the earlier browser estimate remains separate (#2578).

## [0.1.92] - 2026-10-03

### Added

- `audienti payment show` tells whether an account still needs the $5 card step or a signup code, and prints the pay page address. `audienti payment code <signup_code>` uses a code (#2551).
- A command against an account that has not paid or used a code now says so and points to `audienti payment show`.

## [0.1.91] - 2026-10-03

### Added

- Social account details include a `browser_bandwidth` summary of recorded browser estimates for the last 30 calendar days. Missing measurements stay unknown; existing commands and proxy setup are unchanged.

## [0.1.90] - 2026-10-02

### Changed

- The server reads the Operator queue only from its maintained cards; the unused parity-proof path is gone (#2527). Commands and output are unchanged.

## [0.1.89] - 2026-10-01

### Added

- `offers show` lists the offer's gifts and insights. A gift is a free, useful thing the offer already has; it is ready once it has a send link or a file.
- `offers add-gift`, `offers update-gift`, `offers turn-off-gift`, and `offers turn-on-gift` manage an offer's gifts. `offers update-gift --remove-file` takes the attached file off a gift.
- `offers update-insight`, `offers turn-off-insight`, and `offers turn-on-insight` edit an offer's insights.
- `motions create` and `motions update` accept `--gift <gift_id|none>` to choose a ready gift from the motion's own offer. Motion output shows the gift.

## [0.1.88] - 2026-10-01

### Changed

- Company lookups by LinkedIn username return faster on the server. Commands and output are unchanged.

## [0.1.87] - 2026-09-30

### Removed

- `social-cookies update --secrets-stdin` no longer accepts `cookie_bundle`; the server no longer stores saved cookie text. The CLI still refuses cookie secrets passed as flags or JSON attributes.

## [0.1.86] - 2026-09-28

### Added

- `audienti motions profile-signals <motn_id> list|add|remove` manages the social profiles a motion tracks, including your own LinkedIn profile with `--owned --social-cookie <id>`.

### Changed

- `motions show` no longer lists agent provenance for discovery signals, because signals now belong to the motion (#1811).

## [0.1.85] - 2026-09-28

### Changed

- Social account lists and lookups skip accounts an admin has offboarded. Opening an offboarded account through the API returns 403 with code `offboarded`.

## [0.1.84] - 2026-09-28

### Added

- `motions status` shows how many prospects' profile enrichment failed after every retry (`enrichment_failed_prospect_count`).

## [0.1.83] - 2026-09-28

### Changed

- `social-cookies show` returns fixed status text for paused and failed accounts, matching the web page, and never raw provider diagnostics.

## [0.1.82] - 2026-09-28

### Added

- Run LinkedIn strategy reviews from the CLI: `tools linkedin-strategy-review list [--limit]`, `create --url <linkedin_profile_url>`, and `show <rprt_id>` (`--json` includes the report content), next to the existing `delete`.

## [0.1.81] - 2026-09-28

### Added

- Manage social accounts from the CLI: `social-cookies show`, `pause`, `resume`, `resume-autopilot`, `recheck-account-type`, `reconnect`, `delete`, `submit-otp`, `create`, `update`, `rights` (`--workspace --grant|--revoke` or `--workspaces`), and `settings --scope`.
- Secrets never go on the command line. Passwords, one-time codes, cookies, TOTP secrets, and messaging PINs come from stdin (`--password-stdin`, `--secrets-stdin`, `--otp-stdin`), an environment variable (`--password-env` reads `AUDIENTI_SOCIAL_PASSWORD`, `--otp-env` reads `AUDIENTI_OTP_CODE`), or a hidden terminal prompt. Flags such as `--password` or `--otp` are refused before any request is sent, and the CLI never prints a secret.

## [0.1.80] - 2026-09-28

### Added

- Run the motion list and motion health actions from the CLI: `motions bulk-add-tag --tag`, `bulk-remove-tag --tag`, `bulk-update-principal --principal`, `bulk-update-status --status` (prints any motion the lifecycle rules blocked), `retire-strategy --strategy`, `refresh-launch-check`, `refresh-launch-checks`, and `update-premise --premise`.

## [0.1.79] - 2026-09-28

### Added

- Run the remaining prospect page actions from the CLI: `prospects defer`, `delay --for`, `monitor`, `unmonitor`, `rename --name`, `import-post --url`, `sync --social-cookie`, `cancel-event --event`, `queue-draft` (optional `--context` JSON object), `rewrite`, `engage --type` (with `--post`, `--comment`, `--reply-to`, `--request-event`, `--queue-action` and `--principal` targets), `reject-selected`, and `intake --url`.
- Add `events retry`, `profiles delete`, `companies stop-pursuing`, `content defer --for`, `network-ops adopt --target-account --motion`, `network-ops ignore`, `reconciliations add-to-motion --motion`, and `reconciliations ignore`.
- Add `inbox-ops update-filters`, `inbox-ops draft-reply`, `inbox-ops reply --message`, and `inbox-ops adopt`. Each reply sends a fresh reply token so a retried command cannot send twice.

## [0.1.78] - 2026-09-27

### Fixed

- Fix `audienti setup` and `audienti motions quick-start --confirm` failing with HTTP 400 when creating the drafted motion.
- When drafting fails because the drafting service is down, `audienti setup` now says to try again in a few minutes instead of only suggesting a different website.

## [0.1.77] - 2026-09-27

### Added

- Add `audienti start`, a friendly first run: it opens the browser so you can sign in or create an account, picks your account and account user (automatically when there is only one), and offers to run setup. Running `audienti` with no saved login now starts it; `audienti --help` is unchanged.
- Add `audienti setup`, a guided wizard that asks for your company website, who you sell to, and what you want prospects to say yes to, drafts your first motion, shows the draft, and asks before creating it. Scripts and agents can pass `--url`, `--sell-to`, `--ask`, `--yes`, and `--json`; without a terminal it never prompts. `setup play preflight` is unchanged.
- The install script now runs `audienti start` for new users at a terminal, only reports the new version when you are already signed in, and prints next steps when there is no terminal.
- `motions quick-start --json` includes a `preview` summary of a ready draft.

## [0.1.76] - 2026-09-27

### Added

- Add `lists bulk-add-tag|merge|export`, `lists routing-rules <list> toggle`, `icps bulk-add-tag|clone|delete|prospects`, `offers regenerate-research|update-writeup|add-artifacts|remove-artifact`, `tasks update|bulk-update`, and `tools linkedin-strategy-review delete` so list, ICP, offer, task, and strategy review catalog actions are reachable from the CLI. `offers show` now lists attached artifacts.

## [0.1.75] - 2026-09-27

### Added

- Add `hubspot show|connect|disconnect|sync|retry` (`connect --token-stdin` keeps the token out of shell history), `hubspot list-syncs create|update|remove|sync`, `webhooks list|create|update|rotate|remove`, `reply-alerts show|update`, and `brand-profile show|update` so HubSpot, prospect webhook, reply alert, and brand profile settings are reachable from the CLI.

## [0.1.74] - 2026-09-27

### Added

- Add `accounts show`, `company-rules show`, and `linkedin-lookups <kind>` so account details, single company rules, and LinkedIn targeting values are reachable from the CLI.
- Add Motion-owned discovery signal tracking to `motions show` and the `motions signals` command, including attribution holds, source counts, and retained Agent provenance.

### Fixed

- LinkedIn lookups accept API tokens and prefixed ICP ids, so CLI lookups no longer fail with an authentication error.

## [0.1.73] - 2026-09-26

### Added

- Add the account-scoped `motions signals` command for inspecting Motion-owned Topic and profile signals.

## [0.1.72] - 2026-09-26

### Added

- Add `social-cookies sync-messages` to request account-scoped email syncs with folder and explicit-retry controls, while printing the server's durable sync-slot status.

## [0.1.71] - 2026-09-24

### Changed

- Motion updates now honor the server's durable first-discovery Approach lock: edits remain available before the first accepted discovery launch and are rejected after the lock is set.

- Prospect replan API responses now use the canonical Planner contract for admitted memberships.

## [0.1.70] - 2026-09-18

### Added

- Automation-controls payloads now report `follow_autopilot_enabled` and `withdraw_connection_autopilot_enabled`, and `network-ops automation-controls` renders both as `follow` and `withdraw invitations` rows. Both default to enabled; set either to `false` to disable that action.

## [0.1.69] - 2026-09-17

### Added

- Prospect profile payloads now include a `plan` block for planner-controlled prospects, reporting plan versions, refresh status and reason, not-before/next-recheck timestamps, evaluated-at time, and the current plan payload; plus an `effective_action` block carrying the next action and its assigned account user. Both are omitted when the prospect is not planner-controlled.

## [0.1.68] - 2026-09-17

### Changed

- Prospect `company_certification` now returns `status: "missing"` with `reason: "reported_company_mismatch"` when the reported company disagrees with the cited company profile, and never certifies generic LinkedIn company pages such as Stealth Startup.

## [0.1.67] - 2026-09-17

### Added

- List routing-rules API response now reports whether rules were force re-applied.

## [0.1.66] - 2026-09-13

### Added

- `network-ops queue` now shows the already-synced LinkedIn profile headline as a distinct column, leaving job title, company, and the invitation message unchanged and omitting a blank headline as `-`.

## [0.1.65] - 2026-09-13

### Changed

- Prospect profile reporting through the account API now resolves citation identifiers through canonical identity evidence while preserving prospect ownership and malformed-email rejection.

## [0.1.64] - 2026-09-10

### Changed

- List routing-rule create and update resolve `locations` and `company_locations` labels to a known LinkedIn geography at save time. Unknown labels return 422. Read responses include `geo_key` on those entries.

## [0.1.63] - 2026-09-10

### Fixed

- `inbox-ops queue` retries a page read that returns HTTP 502, 503, or 504 up to three times with backoff before failing, since one Inbox Ops page can take the server most of the proxy timeout.

## [0.1.62] - 2026-09-10

### Added

- `inbox-ops queue` now follows every page, numbers each row, saves the numbered list locally per account, and offers `--group-by domain`.
- Add bulk `inbox-ops ignore`, `filter-sender`, `filter-domain`, `allow-sender`, and `allow-domain` verbs that select rows by number, range, row id, `--domain`, or `--sender`, print a manifest, validate with `--dry-run`, and apply with `--yes` through the new `POST inbox_ops/actions` API with per-row results.
- Add `inbox_ops.queue`, `inbox_ops.filters`, `inbox_ops.actions`, `inbox_ops.rules.set`, and `inbox_ops.rules.remove` MCP tools.

## [0.1.61] - 2026-09-08

### Added

- Add owner-scoped `network-ops queue`, `accept`, and `decline` commands for pending inbound LinkedIn connection requests, with `reject` as a decline alias and explicit queued-versus-provider-confirmed output.

### Fixed

- Preserve exact invitation-to-message binding in Network Ops output instead of assigning unrelated neighboring payload text.

## [0.1.60] - 2026-09-08

### Changed

- Motion responses no longer include `post_accept_actions_enabled`; a Motion with an Approach always plans and executes post-accept outreach, so the per-Motion enabled/disabled line is gone from `motions show`.

## [0.1.59] - 2026-09-06

### Changed

- Read eligible Operator queues from their latest published state while changes process, retaining current ownership checks and twenty-row API pagination.

### Fixed

- Restore ordinary Prospect, Content, Visibility, Network, and Inbox priority order while preserving urgent reply and planner precedence.

## [0.1.58] - 2026-09-06

### Fixed

- Continue Operator and Inbox queue reads with the exact returned offset or cursor, preserving account and filters even after an empty page. Report incomplete scans without claiming the queue is empty, and keep pagination separate from outcome and requeue operations.

## [0.1.57] - 2026-09-05

### Added

- Show the selected LinkedIn account's stored Premium and Sales Navigator status and last detection timestamp in setup preflight, preserving unknown values and the unchanged JSON response.

## [0.1.56] - 2026-09-05

### Added

- Configure Motion Approach-guided adaptive post-accept planning with Approach alone; explicit clearing restores the existing sequence, without a separate mode selector.
- Answer current planner or writer questions with `operator answer`, exact-row refetching and stale-context protection; show prompts and candidate options in queue and next output.

## [0.1.55] - 2026-09-05

### Changed

- Preserve the actual viewer's private-owner authorization through Operator API reads, failed-draft retries, and outcome refreshes, including guarded default, Inbox, and Network projection reads.

## [0.1.54] - 2026-09-04

### Changed

- Make `audienti motions run-discovery` expose the durable discovery-run receipt, exact rejection reason, retry time, scope outcome, and distinct submitted and promoted counts; rejected launches now exit nonzero while preserving structured `--json` output.

## [0.1.53] - 2026-09-04

### Changed

- Reject cross-account or conflicting Operator principal parameters through the account API, and preserve true-user privacy semantics for projected Operator reads.

## [0.1.52] - 2026-09-03

### Added

- Add direct, server-normalized `inbox-ops rule set` and `inbox-ops rule remove` commands for sender and domain rules while retaining authorized row-derived updates.

## [0.1.51] - 2026-09-03

### Added

- Add first-class `audienti inbox-ops queue`, `filters`, and `rule` commands backed by owner-scoped account APIs, authoritative row-derived sender/domain identities, all four allow/filter rule combinations, and unchanged JSON output.

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
