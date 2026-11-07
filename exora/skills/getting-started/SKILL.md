---
name: getting-started
description: Run once, right after your Audienti connection is approved. Report the tools and connectors you already have, introduce yourself to the user, and propose a first campaign test (offer, audience, playbook, length) drafted from what you can already read, so the user only corrects it. Use again when your tools change or the user asks for a new test.
---

Work only from this workspace's data and your own tools. Never reuse or mention another workspace's offers, audiences, campaigns, playbooks or people. Never copy or clone across workspaces, or offer to.

Use the task's workspace ID as WORKSPACE_ID and its task ID as TASK_ID. When a queue task needs an answer, always include `--task TASK_ID` on `audienti ask`. Pass `--workspace WORKSPACE_ID` on every Audienti data command, including lists; never rely on a profile's previously selected workspace.


# Getting started with Audienti

You have just been connected to a person's Audienti account. Audienti is an agentic CRM
and the system of record for this work: audiences, offers, campaigns, people, companies
and the work you do for them. The person who approved you is the user. The user wants
to learn which playbook books meetings: turn their ideas into campaign tests quickly, do
as much of the work as you can, and ask only for what you cannot find yourself. Write
plainly and briefly, address the user as "you", no emoji, no marketing tone.

Start every run with the work queue: `audienti queue next --json`. The reply opens with
`orientation`: what Audienti is, who you are and how to work. Follow it. One read
covers every workspace your user approved you in (`workspaces` lists them), so one
schedule and one call are enough; `--workspace ID` narrows it to one. `next` is the task
to take now; tasks you already hold are in `holding`, finish those first. Each task names
its `workspace`: run every `audienti` command for it with `--workspace` and that ID, as
`workspaceStep` says. Claim a task before you start it (`audienti queue claim TASK`), report it
when you finish (`audienti queue done TASK --note "what you did"`) or release it
(`audienti queue release TASK --note "why"`). Over MCP, use `agent_queue_list`,
`agent_queue_claim`, `agent_queue_complete` and `agent_queue_release`. On a long task,
claim it again every 20 to 30 minutes with a note that says where you are: that extends
your lease and shows the user your progress; if your lease lapses, another agent may
take the task and continue from your last note. A refused claim says why: `task_taken`
(another agent holds it; pick another task), `task_closed` (done, skipped or no longer
due; read the queue again) or `task_not_for_you` (the message says which: assigned to
another agent; or it needs a capability you have not reported as connected, so report
your tools again if you have one; or its requirements are being refreshed, so read the
queue again and claim it from there). Your first task is usually
**Report your tools and connectors**, part 1 of three: triage your tools and report
them, asking nothing; introduce yourself and propose a first campaign as one question in
Operator (`audienti ask`), not in chat; save the campaign as a draft once the user
answers, and show five fits.

## Rules that always apply

- **Report, never connect.** List only the tools and connectors your runtime already
  has. Do not install connectors, start OAuth or ask the user to sign in to anything
  during this skill. If something is missing, say it is missing.
- **Never invent.** Draft only from what you read. Do not make up customers, results,
  numbers or claims. Mark anything you inferred as inferred.
- **Draft, never send.** Everything you create is a draft. Nothing goes to a prospect.
  The user activates a campaign in Audienti.
- **Never include secrets.** No passwords, API keys, tokens or session cookies in any
  report, message or field.
- **Read-only does not stop you.** Run this skill right after connecting, without
  waiting to be told. If the user left **Allow workspace changes** unticked, you can
  still read, work the queue, report your tools and ask in Operator (`audienti ask`).
  When a step has to save a record, ask the user there to turn it on in **Settings →
  Agents**, and carry on with the rest.
- **Audienti is the record.** Save what you and the user decide in Audienti records
  (offer text, audience filters, campaign premise and notes), not only in chat or memory.

## 1. Triage your tools

First, keep yourself awake. Audienti never calls you, so set a durable schedule in your
own host now that starts you and runs `audienti queue next` (no `--workspace`, so it
covers all your user's workspaces), then does the work it returns: every 15 minutes, including outside working hours
(`queue next` names the hours in `orientation`; `pollAfterSeconds` gives the next gap). A
timer inside your current session, such as a Claude Code `/loop` or a session cron, stops
when the session ends and does not count. Use a schedule your host keeps: a Paseo schedule
(`paseo schedule create`, then check it with `paseo schedule ls`), a Claude Code routine or
cloud schedule, a Codex automation, or cron. Tell your user the schedule is set, and name
it, when you introduce yourself. If your host cannot wake you, say plainly that it cannot
wake you, so you only check when they message you.

1. Confirm your connection: `audienti workspace list --workspace WORKSPACE_ID --profile AGENT_PROFILE`, then select
   the workspace the user approved (`audienti workspace use ID --profile AGENT_PROFILE`;
   over MCP, `workspace_select`).
2. List every tool, connector, plugin and integration you can call now: your runtime's
   own listing (tool list, connector settings, MCP servers, installed plugins) and every
   integration hub you use. Check aggregators first: if you reach tools through Composio,
   Treg or another hub, list each app connected there. Then list your native connectors.
   Leave out Audienti's own hosted tools unless you reach them through another connector.
3. Turn that list into capability rows (capability id, provider, `via`, the user's
   `account` for anything you send as the user, access, status) as
   [the capability report format](references/capabilities.md) describes; it has the
   full catalog. Never write `via: audienti`.
4. Report it: `audienti agent capabilities report --file CAPABILITIES.json --profile
   AGENT_PROFILE` (over MCP, `agent_capabilities_report` with the same JSON; over HTTP,
   `PUT /api/v1/agent-capabilities`). The report replaces the previous one, and the
   user sees it in **Settings → Agents**. It counts as stale after seven days: report
   again whenever your tools change, and at least weekly.
5. Check what Audienti counts for you: `audienti agent capabilities --profile
   AGENT_PROFILE` (over MCP, `agent_capabilities_list`): the rows that work now and the
   ones that work with Audienti's hosted tools in this workspace.
6. Install the skills you will use: `audienti skills list --compact`, then `audienti
   skills read ID SKILL.md` and only the references the task needs (over MCP,
   `skills_list` with `compact: true` and `skills_read`). The `audienti` skill covers
   prospect finding and profile research; planning, writing and cadence skills are in
   the `audienti/plugins` marketplace, installed with your runtime's plugin installer.

Email goes out from your user's own mailbox through your own email connector (Gmail or
Outlook, through Composio, a Claude connector or similar). If you have none, tell your user
exactly: “I need a Gmail or Outlook connector to send from your mailbox.” Never send your
user to Settings to connect a mailbox. If you have one, report the mailbox in your
capability report and ask your user to approve it in **Settings → Sending**; then
Audienti gives you a queue task to send one test email from the mailbox to itself, read it
back and report its code; the mailbox counts once you do
([the mailbox test email](references/mailbox-check.md)). Never ask your user for the code.
A campaign can run without a mailbox: its people with an email step wait at that step, and their
LinkedIn steps go on. Nothing is skipped. They go on once a mailbox is confirmed, so the fix is the
email connector.

## 2. Introduce yourself and propose a first campaign

First check what already exists: `audienti campaign list --workspace WORKSPACE_ID`, `audienti offer list --workspace WORKSPACE_ID`,
`audienti audience list --workspace WORKSPACE_ID`. If the workspace already has an active campaign, introduce
yourself, list your tools and ask what the user wants to test next; skip the rest of
this section.

Otherwise draft a complete first campaign before you ask anything. Start from the
user's own answers: `audienti workspace show --workspace WORKSPACE_ID` returns `startingAudience` (their website or
`noWebsite`, what they sell, `about` the business, the first `offer`, and their target buyer:
industries, company `sizes`, job functions, job `titles` and regions, with `providerId`s you
can reuse; ask only for what they left out) and
`approximateSize`, how many people Audienti can reach for that buyer (10000 means more
than 10,000); both are `null` if they did not answer on the setup page. Treat them as the
user's first audience, not a finished one. Under 1,000 people is too few to target: one
sending account reaches about 500 a month, so the campaign runs dry within a month. If
`approximateSize` is below 1,000, propose a wider buyer (more industries, job functions or
regions) in your draft. Then read what your tools reach: the user's
website, documents, recent sent email, CRM records and LinkedIn profile. Fill every
field of [the campaign draft](references/campaign-draft.md) in the user's own words,
offer first; if you cannot find an offer, your one question is what they sell and to
whom. Build one buyer lane as structured filters, every value resolved with `audienti
audience options --kind KIND --q TEXT`, always with the person function that owns the
problem, plus at most one smart rule (`textCriteria`) a reviewer can answer true or
false ([audience definition](references/audience.md)). The audience says who they are;
anything about why now (hiring, funding, a new leader, an intent to buy) is a campaign
signal, not a smart rule. Give the campaign at least one signal: prospect finding starts
from signals, which find the companies that need the offer today ([the through line](references/campaign-draft.md#signals-the-through-line)).

Ask the user in Audienti, not in chat: `audienti ask "QUESTION" --workspace WORKSPACE_ID --task TASK_ID --context "PROPOSAL"
--option "Go" --option "Change it" --topic first_campaign`. It shows as a card in
Operator, and the answer comes back to you as a task. The topic keeps one open card per
subject (`first_campaign`, `campaign:ID` or `tools`): a new question with the same topic
replaces the old one. Keep the question itself to one short sentence: the decision you
need. Put the rest in the context, one short line per fact, in this order: who you are
and what you will do; your tools in one line and what is missing, as a fact; the
proposed campaign as a short card, marking what you inferred; the first message as you
would send it, so the user can check the voice; every rule that cannot say exactly what
the user asked for, with what you used instead (company size bands cannot express 200 to
2,000 employees); a missing sending account for the playbook's first channel; at most two
questions the user can answer on the same card; and that nothing is sent without their
approval. Finding the five fits in section 3 costs credits, so ask for that OK on the
same card: `--option "Approve, find 5 people for up to 20 credits" --option "Change it"`.
A note the user types on the card comes with the option they pick. Give every cost in
credits, never dollars. Name
things the way the user sees them; never put IDs (campaign, signal, revision) in the
question or the context.
Whenever you propose something or ask the user to check your work, give the yes/no choice
as options (`--option "Approve" --option "Change it"`): each option is a button that sends
at once. Leave out error codes, status numbers and tool or provider names; say in plain
words what happened and what you need. Link people and records with their URLs.
[The campaign draft](references/campaign-draft.md) ends with an example of the shape.

## 3. Save the drafts and show five fits

When the user answers (a **Read your user's answer** task in your queue):

1. Apply their changes. Save their words as they wrote them.
2. Create the records with fresh request IDs, reusing each ID if you retry:
   `audienti offer create`, `audienti audience create`, then `audienti campaign create`
   with the premise, playbook, channels and `schedule.endAt` (over MCP, `offer_create`,
   `audience_create`, `campaign_create`). The campaign starts in `Draft`; nothing runs
   until the user starts it. Then save the pace: `audienti campaign pace ID --per-day N`
   with the user's number, or `--per-day derived` to use the default of 25 new people a day (over MCP,
   `campaign_pace_set`). Only `campaign pace` takes `--per-day`; `campaign create` and
   `update` refuse it. When the user approved a spend for finding, such as "find 5 people
   for up to 20 credits", save the cap too: `audienti campaign pace ID --max-credits 20`.
   Each day's find task carries it; pass it to `audienti campaign find` and never raise it.
3. Run `audienti audience summary --audience ID` and name five people or companies
   that fit, with one line on why each fits and a link to the evidence. If you have no
   people-data tool, say so and show the audience filters instead.
4. Ask the user with `audienti ask --campaign ID` to review it on the campaign page
   and start it. Quote the campaign's own Pace line from `audienti campaign pace ID`.
   Name the controls the page has: the status menu next to the campaign name offers
   **Find prospects only**, which moves it to `Preparing`, where signal tracking and
   prospect finding run, and **Activate campaign**, which moves it to `Active`, where
   engagement runs too. There is no Start button.
5. Then offer to draft first messages for the five fits once the campaign is active.

If a create call fails, say what happened in one sentence and what you will do next; do
not retry with a new request ID. For a later idea, draft a new campaign or a successor
(`audienti campaign successor ID`) that changes one thing (playbook, offer or audience)
and name what changed, so the two tests compare; save a new playbook as a template with
the playbook-design skill, then pin it to the successor.

If the user edits an audience that a campaign already uses, the campaign keeps the old
rules until you move it. Tell the user which revision it uses and what the newer one
changes, then run `audienti campaign use-audience ID` when they agree
(`references/campaign-draft.md`).

## After getting started: work the queue

After that, Audienti puts the daily work in your queue: get a draft campaign ready to
start, find prospects at the campaign's pace, plan each prospect's next step, handle
replies and send what the user approved. Every task carries its steps and names its
skill; outcome checks follow [the check procedure](references/outcome-checks.md),
replies [the reply procedure](references/replies.md), a mailbox's test email [the mailbox test email](references/mailbox-check.md), and the
reply check before each email follow-up [the mailbox checks](references/reply-checks.md). When the user skips a touch, do
not propose it again unless they ask for a rewrite; when they take a person over, leave
them alone. A **Rewrite** (`work.revise`) comes to the agent that wrote the draft; its
steps carry the commands. Answer the request with `audienti work changes respond`:
saving the revision alone does not answer it, and the answer finishes the task. A new
note from the user replaces the task, and the task closes when the user approves,
skips or withdraws the touch, even while you hold it: then stop and read the queue
again. Every first email ends with one plain sentence that lets the prospect opt out.
Do not do work another agent holds (`fleet`); hand off or ask for help in a room
(`audienti rooms send`). `needsOtherTools` lists tasks no agent can take: tell the
user which connector would unlock them. A task there with `waitingOn: credits` needs an
Audienti hosted tool and the workspace has no credits left: tell the user once that it
waits on credits and runs when they add credits in Billing, and do not ask again. When
credits are added or run out, or the user adds or removes one of their own provider keys
in the Vault, every agent gets a notice task: run `audienti agent capabilities` again,
then do what its steps say. If you reported an `owner.notify` capability, Audienti puts one
**Tell your user about an alert** task in your queue for each alert it records. Its steps
give the message and a link: tell your user that message on whatever channel you use with
them (chat, push, Slack, SMS or email), include the link, and mark the task done once it
is delivered. Done means delivered: a done task is not created again for the same alert.
An agent that did not report `owner.notify` gets no such task. When the queue is empty, your timer runs it
again after `pollAfterSeconds`; when `ask` or `queue next` returns an `announce` line,
say it in your chat and point to Operator. Keep machine state in Audienti, not in your
own memory: `audienti kv set KEY VALUE` stores cursors, change tokens, hashes, ids and
timestamps for every agent of your user in this workspace, `audienti kv get KEY` reads
them back on the next run, and `--if-version N` protects a key two agents may touch;
credentials never go there: the Vault holds them and you store the Vault key name. Never
send anything to a prospect that the user has not approved.

After finishing a queue task or posting an ask with `--task TASK_ID`, run `audienti queue next` without `--workspace` and carry on across approved workspaces until nothing actionable remains. An open ask holds only its task; keep working on the rest and never ask it again while it is open.
