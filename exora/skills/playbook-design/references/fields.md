# Playbook fields

`audienti playbook save --file REQUEST.json` accepts one object:

| Field | Rule |
| --- | --- |
| `id` | Omit for a new playbook. The playbook ID to revise one. |
| `expectedRevision` | 0 for a new playbook, otherwise the latest revision number. |
| `requestId` | A fresh UUID. Reuse it only when you retry the same save. |
| `fields` | The playbook itself, below. |

## fields

| Field | Rule |
| --- | --- |
| `name` | 1 to 120 characters. Name the strategy, not the campaign. |
| `stages` | 2 to 30 stages, in order. Leave it out for the default skeleton (see Defaults). |
| `goalKey` | The `key` of the goal stage. Not the first stage. Left out, it is the last stage (with `stages` left out too, the skeleton's last stage). |
| `offRamps` | Up to 30 ways out: `{ key, name, reason }`. `reason` is `rejected`, `not_fit`, `nurture`, `unresponsive` or `other`. The system sets `taken_over`, `bounced` and `skipped` itself; do not choose them. "Bad data" and "repair" are not off-ramps. |
| `voice` | How messages should sound, in the user's style. |
| `eventRules` | Optional: what happens when an event reaches a person, for any stage and step. A new playbook starts with three (below); leave the field out to keep them, or send the whole list to replace it. See Event rules. |
| `rules` | Optional: `allowBackward` (boolean, default false): let a move go to an earlier stage. Approval of a move is a setting on the account, not a playbook rule. |

## Defaults

When you change a playbook you already have, a part you leave out (`stages`, `goalKey`, `offRamps`, `voice`) stays as it is. For a new playbook, leave a field out and the server fills the best-practice value, the same on the CLI, MCP, REST and in the editor. What you write is kept, even a weak choice; the Playbook check warns about those.

| Left out | Value |
| --- | --- |
| `stages` | Ready, Outreach underway (no steps; people who finish it leave as Unresponsive), In conversation (worked by a person) and Meeting booked as the goal. `playbook save` with only a `name` makes this. |
| `offRamps` | Unresponsive, Not interested and Not a fit. |
| an off-ramp `reason` | Guessed from the name (Not interested is `rejected`, Not a fit is `not_fit`, Unresponsive is `unresponsive`), else `other`. |
| `voice` | One plain, short sentence. A blank voice gets it too. |
| a stage `goalDays` | The waits of its main steps plus 2 days, at least 3. The goal stage gets 0. |
| a stage `completion` | A stage with steps that an agent works, other than the goal, closes people out as Unresponsive. Other stages stay. |
| a step `condition` | `Only if connected` for a LinkedIn message, else `Always`. |
| a step `instructions` | One coaching sentence for the kind of action. |
| a main step `wait` | Only for a step that is new in this save. A step that sends waits 3 days for a reply; a connection request waits 7 days for the accept; a step that sends nothing has no wait. A step the playbook already has keeps what it has, and `"wait": null` means no wait. |

## The Playbook check

Every read and save of a playbook returns `warnings`, a deterministic check that needs no agent. An item
is `{ id, level, message, stageKey, stepKey, fix }`. A save is refused with `playbook_cannot_work` (422,
the list in `errors`) when `offRamps` is empty or a stage has `on: []` and nothing sends people to it.
The other items are warnings; read them after each save and clear them:

| Item `id` | Meaning and default fix |
| --- | --- |
| `stage_never_ends` | A stage with steps and `completion` `stay`. Use `off_ramp` with the Unresponsive off-ramp. |
| `stage_by_hand_only` | Nothing opens a stage but a person or agent. Give it an `on` event ("Jump forward to here when") or finish the stage before it with `next`. The first stage after Ready is not flagged. |
| `send_without_wait` | A send step with no `wait`, followed by another send on the same channel. Add a wait. |
| `goal_shorter_than_waits` | `goalDays` is below the waits added up. Use the waits plus 2 days. |
| `send_in_person_stage` | A send step in the goal stage or an `Assignee` stage writes to someone who already answered. Remove it. |
| `steps_after_break_up` | A step after the break-up email. Put it before the break-up step. |
| `message_without_connection` | A LinkedIn message with condition `Always` and no connection request before it. Use `Only if connected`. |
| `stages_loop` | Routes or rules send people between stages in a circle. |

## Stage

| Field | Rule |
| --- | --- |
| `key` | A UUID, unique in the playbook. Keep it across revisions. |
| `name` | Unique in the playbook. |
| `on` | The events that jump a prospect forward to this stage: `accept` (they accept your LinkedIn connection request, not a meeting invite), `reply` or `meeting` (a booked meeting). Do not list `accept` or `reply` on the goal stage unless a reply or an accept should count as a win. An event moves the prospect to the furthest later stage that lists it; the stages passed over are recorded as skipped, never as done. Leave it out for a stage people reach when the stage before it finishes, or when a person moves them. Do not set it on the first stage. People and the pipeline read "Starts when they reply" from it. The older `movesInWhen` text and the value `manual` are accepted and ignored. |
| `owner` | `Agent` or `Assignee` (the person assigned to the prospect). |
| `goalDays` | 0 to 365. The days after which a prospect in this stage is overdue (the pipeline card turns orange). 0 means never overdue. |
| `enabled` | Defaults to true. `false` skips the stage: no one is moved into it. The first stage and the goal stage cannot be skipped. |
| `steps` | Up to 20 steps. |
| `completion` | `{ "kind": "next" }`, `{ "kind": "stay" }` or `{ "kind": "off_ramp", "offRampKey": KEY }`. The last enabled stage cannot use `next`. |

## Step

| Field | Rule |
| --- | --- |
| `key` | A UUID, unique in the playbook. A plan action that runs this step carries it as `playbookStepKey`; actions without it change no playbook progress. |
| `channel` | `LinkedIn`, `Email` or `Custom`. A `Custom` step is something you cannot do, for example a phone call, a voicemail, a handwritten note, a video or a gift. You prepare the script, note or choice, and a person does it by hand and records what happened on the Hand tasks page. A Custom step is never a side step and sends nothing. |
| `action` | A short label, for example "Send connection request". |
| `condition` | `Always`, `Only if viable` or `Only if connected`. `Only if connected` is checked: a person who was sent a connection request and has not accepted is skipped for the step; a person with no request on record is not blocked, because they may already be connected. A stage that opens on `accept` gates the same way. Left out, a LinkedIn message gets `Only if connected` and everything else `Always`. |
| `viability` | Required with `Only if viable`: when the step makes sense. An Email step is skipped, without a card, for a person with no email on record, whatever its condition. |
| `instructions` | Coaching for whoever does the step. |
| `wait` | Optional: `{ "until": U, "days": N }`. `until` is `accept` (LinkedIn steps only), `reply`, `meeting`, `timeout` or `event` (Custom steps only); `days` is 1 to 60. An `event` wait also needs `"event": "Gift delivered"` (the name of what the person records); the person records it on the Hand tasks page and that ends the wait, and so does a reply, a booked meeting or the days running out. The wait starts when the agent reports the step's result with its step key: a plan action carries the step's `key` as `playbookStepKey`, and a succeeded result for that action starts the wait. A reply or a booked meeting ends every wait early; an accept ends only a wait until `accept`. Older playbooks used `waitDays: N`, which still reads as `{ "until": "timeout", "days": N }`. |
| `side` | Defaults to false. A side step runs while the main step before it waits, for example a profile view or a like. A stage with side steps needs a main step. |
| `onTimeout` | `next` (default) or `off_ramp`. With `off_ramp`, a main step whose wait runs out leaves the prospect through the `unresponsive` off-ramp. When nothing is left in the stage, its completion decides. |
| `routes` | Optional: `{ "accept"?: T, "reply"?: T, "meeting"?: T }`, where `T` is `{ "kind": "stage", "stageKey": "<uuid>" }` or `{ "kind": "off_ramp", "offRampKey": "<uuid>" }`. Where an event that reaches the person after this step ran sends them. The step's route wins over the stage's `on` list; an event with no route follows the stage. A main step only; `accept` only on a LinkedIn step. A route to an earlier stage needs `rules.allowBackward`. |
| `actionId` | Optional: an action id from the outreach rulebook, for example `linkedin.message.send`. It must match the step's `channel`. List the valid ids with their channel and label: `audienti playbook actions` (MCP `playbook_actions_list`). The `action` text stays the label the person reads. |
| `eventRules` | Optional, up to 10: event rules for this step only. See Event rules. |

## Event rules

An event rule says what happens when an event reaches a person: do these things, then go here. It lives on the playbook (`fields.eventRules`, up to 30), on a stage (`eventRules`, up to 10) or on a step (up to 10). The nearest place wins, then the most specific event: a reply kind beats any reply. A step `routes` entry is the older form of the same thing.

| Field | Rule |
| --- | --- |
| `key` | A UUID, unique in the playbook. |
| `when` | The event: `accepted`, `replied`, `meeting_booked`, `wait_timeout`, `inbound_connection_request`, or a reply kind `reply.interested`, `reply.question`, `reply.later`, `reply.out_of_office`, `reply.wrong_person`, `reply.referral`. An unknown name is refused with the allowed names; `audienti playbook actions` lists them under `eventRules.when`. |
| `do` | Optional list of `stop_wait`, `snooze`, `redirect_to_named_person`, `ask_who_is_right`, `tell_me`, `hand_to_user`, `withdraw_pending_request`. Also under `eventRules.do`. |
| `snoozeDays` | 1 to 90. For `snooze`. |
| `goto` | Where the person goes after: `{ "kind": "stay" }`, `{ "kind": "gate" }` (the stage's own next step; the default), or `{ "kind": "stage", "stageKey": KEY }`, `{ "kind": "off_ramp", "offRampKey": KEY }` or `{ "kind": "step", "stepKey": KEY }`. |

Every new playbook starts with these three on the playbook, when you send no `eventRules`:

- `reply.interested`: `stop_wait`, then `gate`.
- `reply.out_of_office`: `snooze` for 7 days, then `stay`.
- `reply.wrong_person`: `stop_wait`, `redirect_to_named_person`, `ask_who_is_right`, then `stay`.

Taking someone off the list and a bounce always run first; no rule changes them.

A LinkedIn step whose `actionId` is `linkedin.inmail.send` runs only when the LinkedIn account reports InMail available. Otherwise it is skipped without a card.

## Example request

Replace every `<uuid>` with a fresh UUID (`uuidgen` or `node -e "console.log(crypto.randomUUID())"`).
Use the same UUID wherever the same placeholder letter appears.

```json
{
  "expectedRevision": 0,
  "requestId": "<uuid>",
  "fields": {
    "name": "Founder-led outbound",
    "stages": [
      { "key": "<A>", "name": "Ready", "owner": "Agent", "goalDays": 3, "steps": [], "completion": { "kind": "next" } },
      { "key": "<B>", "name": "Warming", "owner": "Agent", "goalDays": 7, "steps": [
        { "key": "<uuid>", "channel": "LinkedIn", "action": "View profile", "condition": "Always", "instructions": "Read their recent activity for a signal to mention." },
        { "key": "<uuid>", "channel": "LinkedIn", "action": "Like a recent post", "condition": "Always", "instructions": "Only a post about their work.", "wait": { "until": "timeout", "days": 3 } }
      ], "completion": { "kind": "next" } },
      { "key": "<C>", "name": "Outreach underway", "owner": "Agent", "goalDays": 35, "steps": [
        { "key": "<uuid>", "channel": "LinkedIn", "action": "Send connection request", "condition": "Always", "instructions": "No note, or one line on their signal.", "wait": { "until": "accept", "days": 21 } },
        { "key": "<uuid>", "channel": "LinkedIn", "action": "View profile", "condition": "Always", "instructions": "A light touch while the request waits.", "side": true },
        { "key": "<uuid>", "channel": "LinkedIn", "action": "Send message", "condition": "Only if connected", "instructions": "Lead with their signal and offer something useful.", "wait": { "until": "reply", "days": 5 } },
        { "key": "<uuid>", "channel": "Email", "action": "Email 1", "condition": "Always", "instructions": "Three sentences: signal, offer, one short question.", "wait": { "until": "reply", "days": 4 }, "onTimeout": "off_ramp" }
      ], "completion": { "kind": "off_ramp", "offRampKey": "<R>" } },
      { "key": "<D>", "name": "In conversation", "on": ["reply"], "owner": "Assignee", "goalDays": 3, "steps": [
        { "key": "<uuid>", "channel": "Email", "action": "Draft a reply", "condition": "Always", "instructions": "Answer their question first. Propose a time only if they asked.", "wait": { "until": "reply", "days": 2 } }
      ], "completion": { "kind": "stay" } },
      { "key": "<E>", "name": "Meeting requested", "owner": "Assignee", "goalDays": 3, "steps": [], "completion": { "kind": "next" } },
      { "key": "<F>", "name": "Meeting booked", "on": ["meeting"], "owner": "Assignee", "goalDays": 0, "steps": [], "completion": { "kind": "stay" } }
    ],
    "goalKey": "<F>",
    "offRamps": [{ "key": "<R>", "name": "Unresponsive", "reason": "unresponsive" }],
    "voice": "Write like a founder. Lead with their signal, offer something useful, and ask one short question.",
    "rules": { "allowBackward": false }
  }
}
```
