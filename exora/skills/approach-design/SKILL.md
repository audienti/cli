---
name: approach-design
description: Create, reuse or revise an Audienti approach template, the stages and steps a prospect moves through from first touch to the goal. Use during getting started, when a campaign has no approach, and whenever you or the owner have a new outreach idea.
---

# Approach design

An approach template is the playbook a campaign follows: the stages a prospect moves
through, the steps in each stage (channel, action, wait), the goal stage, the ways out
(off-ramps) and the voice. Audienti stores every approach with revisions, so a good one
is written once and reused by many campaigns. Planning tasks (`prospects.plan`) read the
campaign's approach to decide each prospect's next step, so a campaign without one
cannot be worked.

Use this skill when:

- You are getting started and the workspace has no approach yet.
- A queue task says a campaign needs an approach (**Draft an approach template**, or a
  **Get campaign ready** task that says "pick an approach template").
- You or the owner have a new idea for how to reach people: a new channel order, a
  different first touch, a new voice, a new goal.

## Rules

- Reuse before you create. Most new campaigns fit an approach that already exists.
- Use only channels you can cover with accounts you reported (LinkedIn, Email, Phone).
  Do not draft a phone step if no one can call.
- One approach is one strategy. A correction to the same strategy (a wait, a step's
  wording, a missing off-ramp) is a new revision. A different strategy is a new
  approach, so the two can be compared in Analytics.
- Saving an approach never changes campaigns already pinned to it. Pin the new
  revision on purpose.
- Never invent results or proof points for the voice. Use the owner's words.
- Ask the owner before a new approach is used for outreach. Nothing is sent without
  their approval.

## 1. Reuse first

1. `audienti approach list` shows the workspace's approaches and their latest revision.
2. `audienti approach show ID` shows the stages, steps, goal and voice.
3. If one fits the campaign's offer, audience and your channels, use it. Say in one
   line why it fits, then go to step 4 (pin it).

## 2. Draft a new approach

Start from the owner's offer, the audience and the channels you have. A good default
for founder-led or agent-led outbound has five to six stages:

1. **Ready** (Agent): the prospect is in the campaign. No steps.
2. **Warming** (Agent, optional): view the profile, like a recent post. Skip it when
   LinkedIn is not available.
3. **Outreach underway** (Agent): the touches, in order, with waits. For example a
   connection request (wait 21 days), a message "Only if connected" (wait 5), a first
   email (wait 4). Completes to the **Unresponsive** off-ramp when every step is done
   and nobody replied.
4. **In conversation** (Assignee): the prospect replied. A person drafts or approves
   the reply. Completion `stay`.
5. **Meeting requested** (Assignee).
6. **Meeting booked** (Assignee, goal, `goalDays` 0).

Write `instructions` on each step as coaching for whoever does it: what to say, what
evidence to lead with, what to avoid. Write `voice` as two or three sentences in the
owner's style. See [fields and an example request](references/fields.md) for every
field and the rules Audienti checks.

## 3. Save it

1. Write the request to a file: `expectedRevision` 0 and no `id` for a new approach;
   the approach's `id` and its current revision number to revise one. Use a fresh
   `requestId` (a UUID) and fresh UUIDs for every stage, step and off-ramp `key`.
   Keep the same keys when you revise, so progress already recorded stays on its stage.
2. `audienti approach save --file REQUEST.json`. Over MCP use `approach_save`.
3. If the save fails, read the error, fix that field and retry with the same
   `requestId`. If it reports a revision conflict, run `approach show ID` and apply your
   change to the newer revision.

## 4. Ask the owner and pin it

1. Ask in Audienti, not in chat: `audienti ask "Use this approach for CAMPAIGN?"
   --context "SUMMARY" --option "Use it" --option "Change it"`. Put the stages, the
   touches with their waits, the goal and the voice in the context as a short list.
2. When they answer, apply their changes as a new revision.
3. Pin it to the campaign with `approachPin` `{ "id": APPROACH_ID, "revision": N }`:
   in `audienti campaign create` for a new campaign, or in the campaign's draft update
   for a draft. An active campaign keeps its pin; to try a new approach, make a
   successor (below).

## New ideas

When you or the owner have a new idea for how to reach people:

1. Write the idea as one change: "Lead with email instead of a connection request",
   "Add a phone step after the second email", "Offer a teardown, not a demo".
2. If it is a correction, save a new revision of the same approach.
3. If it is a different strategy, save a new approach named for the idea.
4. Test it with `audienti campaign successor ID` that changes only the approach, so
   the old and new campaigns can be compared. Name what changed in the campaign notes.
5. Ask the owner before the successor starts.

## Done

Close your queue task with a note that names the approach, its revision and the
campaign it is pinned to: `audienti queue done TASK --note "Saved Founder-led outbound
r1, pinned to Logistics UK test"`.
