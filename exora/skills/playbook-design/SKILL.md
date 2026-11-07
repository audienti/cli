---
name: playbook-design
description: Create, reuse or revise an Audienti playbook, the stages and steps a prospect moves through from first touch to the goal. Use during getting started, when a campaign has no playbook, and whenever you or the user have a new outreach idea.
---

Work only from this workspace's data and your own tools. Never reuse or mention another workspace's offers, audiences, campaigns, playbooks or people. Never copy or clone across workspaces, or offer to.

Use the task's workspace ID as WORKSPACE_ID and its task ID as TASK_ID. When a queue task needs an answer, always include `--task TASK_ID` on `audienti ask`. Pass `--workspace WORKSPACE_ID` on every Audienti data command, including lists; never rely on a profile's previously selected workspace.


# Playbook design

A playbook is what a campaign follows: the stages a prospect moves
through, the steps in each stage (channel, action, wait), the stage outcomes, the goal stage, the exits and the voice. Audienti stores every playbook with revisions, so a good one
is written once and reused by many campaigns. Planning tasks (`prospects.plan`) read the
campaign's playbook to decide each prospect's next step, so a campaign without one
cannot be worked.

Use this skill when:

- You are getting started and the workspace has no playbook yet.
- A queue task says a campaign needs a playbook (**Draft a playbook**, or a
  **Get campaign ready** task that says "pick a playbook").
- You or the user have a new idea for how to reach people: a new channel order, a
  different first touch, a new voice, a new goal.

## Rules

- Reuse before you create. Most new campaigns fit a playbook that already exists.
- Use only channels you can cover with accounts you reported (LinkedIn, Email). For anything you cannot do yourself, such as a call, a voicemail, a handwritten note, a video or a gift, use a `Custom` step: you prepare it and a person does it. The person records done or failed, with a note. That ends the step. A reply or booked meeting counts toward a stage outcome. A missing disposition keeps the task open and reminds the person when its wait runs out.
  Do not draft a phone step if no one can call.
- One playbook is one strategy. A correction to the same strategy (a wait, a step's
  wording, a missing exit) is a new revision. A different strategy is a new
  playbook, so the two can be compared in Analytics.
- Saving a playbook never changes campaigns already pinned to it. Pin the new
  revision on purpose.
- Give the playbook an exit with reason `rejected` and one with reason `not_fit`. Use the first for each reply outcome's no target. The playbook-wide list sends a `not_a_fit` event to the second. The guide
  `docs/guides/playbook-agent-guide.md` (Outcomes and the playbook-wide list) lists every event.
- Never invent results or proof points for the voice. Use the user's words.
- Every first email ends with one plain sentence that lets the prospect opt out, such
  as "If this is not for you, reply and I will not write again." Say so in the first
  email step's `instructions`. A prospect who opts out is suppressed for good.
- Ask the user before a new playbook is used for outreach. Nothing is sent without
  their approval.

A step never routes. Every move comes from a stage outcome, completion, the playbook-wide list, or a person moving them by hand.
Keep instructions for content. Never hide a move in instructions.
A stage can list any set of connected, replied, meeting_booked and task_done, each once.
Check the current stage first, then the first later stage that lists a missing kind. Never look backward.
For one observation, use meeting_booked, then replied, then connected, then task_done.
Connected and meeting_booked count on entry. Replied and task_done count after entry and cannot fire again after their move.
A reply outcome has positive and no targets. Meeting booked has its own outcome. Only the goal may have no outcomes and stay. Read [the fields](references/fields.md).

## 1. Reuse first

1. `audienti playbook list --workspace WORKSPACE_ID` shows one page of summaries: name, latest revision and stage and step
   counts. Follow `nextCursor` for more; `--limit N` sets the page size.
   Every workspace has three starter playbooks (`system: true`): Email first, LinkedIn
   first and Email only. When your reported channels point to one, the list marks it
   `recommended: true` and returns a `recommendation` with its `reason`. A confirmed
   LinkedIn account gives LinkedIn first: the user registered it as a sender account and
   authorized you on it, and your report for it is healthy and includes `send_message`.
   Email with LinkedIn not yet confirmed gives Email first; email alone gives Email only.
2. `audienti playbook show --workspace WORKSPACE_ID ID` shows the stages, steps, goal and voice.
3. If one fits the campaign's offer, audience and your channels, use it. Say in one
   line why it fits, then go to step 4 (pin it). A starter playbook can be pinned as it
   is, but it is read-only: to change it, save its fields as a new playbook (no `id`,
   `expectedRevision` 0) with a new name, and revise that copy. Saving a starter
   playbook with its `id` fails with 409 `starter_playbook`.

## 2. Draft a new playbook

Start from the user's offer, the audience and the channels you have. A good default
for founder-led or agent-led outbound has five to six stages:

1. **Ready** (Agent): the prospect is in the campaign. No steps.
2. **Warming** (Agent, optional): view the profile, like a recent post. Skip it when
   LinkedIn is not available.
3. **Outreach underway** (Agent): the touches, in order, with waits. For example a
   connection request (wait 21 days), a message "Only if connected" (wait 5), a first
   email (wait 4). Completes to the **Unresponsive** exit when every step is done
   and nobody replied.
4. **In conversation** (Assignee): the prospect replied. A person drafts or approves
   the reply. Completion `stay`.
5. **Meeting requested** (Assignee).
6. **Meeting booked** (Assignee, goal, `goalDays` 0).

Write `instructions` on each step as coaching for whoever does it: what to say, what
evidence to lead with, what to avoid. Write `voice` as two or three sentences in the
user's style. See [fields and an example request](references/fields.md) for every
field and the rules Audienti checks.

## 3. Save it

1. Write the request to a file: `expectedRevision` 0 and no `id` for a new playbook;
   the playbook's `id` and its current revision number to revise one. Use a fresh
   `requestId` (a UUID) and fresh UUIDs for every stage, step and exit `key`.
   Keep the same keys when you revise, so progress already recorded stays on its stage.
2. `audienti playbook save --file REQUEST.json`. Over MCP use `playbook_save`.
3. If the save fails, read the error: `field` is the path of the wrong value, `allowed` the
   values that work and `next` what to do. Fix that field and retry with the same
   `requestId`. Run `audienti playbook actions` for the step action ids, channels and event
   names. If `next` says to ask your user (for example to turn on Allow workspace changes),
   ask with `audienti ask` and carry on with what you can. If it reports a revision conflict, the error gives `currentRevision`: run
   `playbook show ID`, apply your change to that revision and save with that `expectedRevision`.

## 4. Ask the user and pin it

1. Ask in Audienti, not in chat: `audienti ask "Use this playbook for CAMPAIGN?"
   --workspace WORKSPACE_ID --task TASK_ID --context "SUMMARY" --option "Use it" --option "Change it"`. Put the stages, the
   touches with their waits, the goal and the voice in the context as a short list.
2. When they answer, apply their changes as a new revision.
3. Pin it to the campaign with `playbookPin` `{ "id": PLAYBOOK_ID, "revision": N }`:
   in `audienti campaign create` for a new campaign, or in the campaign's draft update
   for a draft. An active campaign keeps its pin; to try a new playbook, make a
   successor (below).

## New ideas

When you or the user have a new idea for how to reach people:

1. Write the idea as one change: "Lead with email instead of a connection request",
   "Add a phone step after the second email", "Offer a teardown, not a demo".
2. If it is a correction, save a new revision of the same playbook.
3. If it is a different strategy, save a new playbook named for the idea.
4. Test it with `audienti campaign successor ID` that changes only the playbook, so
   the old and new campaigns can be compared. Name what changed in the campaign notes.
5. Ask the user before the successor starts.

## Record progress and ask when the rules cannot decide

Read the playbook before doing work for a campaign pinned to it: `audienti playbook
show PLAYBOOK_ID`. Stage plays are instructions for you, the external agent; they are
not a hosted sequence that runs by itself.

- Progress: `audienti playbook record --file PATH` with exactly one of `stageKey`,
  `offRampKey` or `finishStage: true`, the participation's pinned playbook version and
  its current expected progress version, and stored evidence. Do not invent outcomes.
  `audienti playbook` prints the command usage; the API schema has the required fields.
- When you see something that moves a person (a reply, an accept, a booked meeting), record
  that event; the playbook's rules decide the move. If the rules cannot decide, ask the
  user with `audienti ask "QUESTION"`. The question appears in Operator.
- None of these commands sends a message to a provider.

## Done

Close your queue task with a note that names the playbook, its revision and the
campaign it is pinned to: `audienti queue done TASK --note "Saved Founder-led outbound
r1, pinned to Logistics UK test"`.

After finishing a queue task or posting an ask with `--task TASK_ID`, run `audienti queue next` without `--workspace` and carry on across approved workspaces until nothing actionable remains. An open ask holds only its task; keep working on the rest and never ask it again while it is open.
