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
| `stages` | 2 to 30 stages, in order. |
| `goalKey` | The `key` of the goal stage. Not the first stage. |
| `offRamps` | Up to 30 ways out: `{ key, name, reason }`. `reason` is `rejected`, `not_fit`, `nurture`, `unresponsive`, `taken_over`, `bounced`, `skipped` or `other`. "Bad data" and "repair" are not off-ramps. |
| `voice` | How messages should sound, in the user's style. |
| `rules` | Optional: `autoMove`, `flagOverdue`, `allowBackward` (booleans), `emailWindow` (`weekdays_morning`, `weekdays`, `any_day`), `nurtureDays` (60, 90, 180 or null). |

## Stage

| Field | Rule |
| --- | --- |
| `key` | A UUID, unique in the playbook. Keep it across revisions. |
| `name` | Unique in the playbook. |
| `movesInWhen` | What moves a prospect into this stage, for example "They replied". Shown to people; `on` decides. |
| `on` | The events that open this stage: `accept`, `reply`, `meeting` or `manual`. Defaults to `["manual"]`. An event moves the prospect to the furthest later stage that opens on it; the stages passed over are recorded as skipped, never as done. |
| `owner` | `Agent` or `Assignee` (the person assigned to the prospect). |
| `goalDays` | 0 to 365. How long a prospect should stay before it is overdue. |
| `optional` | Only an optional stage can be disabled. |
| `enabled` | Defaults to true. |
| `steps` | Up to 20 steps. |
| `completion` | `{ "kind": "next" }`, `{ "kind": "stay" }` or `{ "kind": "off_ramp", "offRampKey": KEY }`. The last enabled stage cannot use `next`. |

## Step

| Field | Rule |
| --- | --- |
| `key` | A UUID, unique in the playbook. A plan action that runs this step carries it as `playbookStepKey`; actions without it change no playbook progress. |
| `channel` | `LinkedIn`, `Email` or `Phone`. |
| `action` | A short label, for example "Send connection request". |
| `condition` | `Always`, `Only if viable` or `Only if connected`. Audienti does not check a connection itself: put an `Only if connected` step in a stage that opens on `accept`, so entering the stage on the accept is what gates it. |
| `viability` | Required with `Only if viable`: when the step makes sense. An Email step is skipped, without a card, for a person with no email on record, whatever its condition. |
| `instructions` | Coaching for whoever does the step. |
| `wait` | Optional: `{ "until": U, "days": N }`. `until` is `accept` (LinkedIn steps only), `reply`, `meeting` or `timeout`; `days` is 1 to 60. The wait starts when the agent reports the step's result with its step key: a plan action carries the step's `key` as `playbookStepKey`, and a succeeded result for that action starts the wait. A reply or a booked meeting ends every wait early; an accept ends only a wait until `accept`. Older playbooks used `waitDays: N`, which still reads as `{ "until": "timeout", "days": N }`. |
| `side` | Defaults to false. A side step runs while the main step before it waits, for example a profile view or a like. A stage with side steps needs a main step. |
| `onTimeout` | `next` (default) or `off_ramp`. With `off_ramp`, a main step whose wait runs out leaves the prospect through the `unresponsive` off-ramp. When nothing is left in the stage, its completion decides. |

A LinkedIn step whose action names InMail runs only when the LinkedIn account reports InMail available. Otherwise it is skipped without a card.

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
      { "key": "<B>", "name": "Warming", "owner": "Agent", "goalDays": 7, "optional": true, "steps": [
        { "key": "<uuid>", "channel": "LinkedIn", "action": "View profile", "condition": "Always", "instructions": "Read their recent activity for a signal to mention." },
        { "key": "<uuid>", "channel": "LinkedIn", "action": "Like a recent post", "condition": "Always", "instructions": "Only a post about their work.", "wait": { "until": "timeout", "days": 3 } }
      ], "completion": { "kind": "next" } },
      { "key": "<C>", "name": "Outreach underway", "owner": "Agent", "goalDays": 35, "steps": [
        { "key": "<uuid>", "channel": "LinkedIn", "action": "Send connection request", "condition": "Always", "instructions": "No note, or one line on their signal.", "wait": { "until": "accept", "days": 21 } },
        { "key": "<uuid>", "channel": "LinkedIn", "action": "View profile", "condition": "Always", "instructions": "A light touch while the request waits.", "side": true },
        { "key": "<uuid>", "channel": "LinkedIn", "action": "Send message", "condition": "Only if connected", "instructions": "Lead with their signal and offer something useful.", "wait": { "until": "reply", "days": 5 } },
        { "key": "<uuid>", "channel": "Email", "action": "Email 1", "condition": "Always", "instructions": "Three sentences: signal, offer, one short question.", "wait": { "until": "reply", "days": 4 }, "onTimeout": "off_ramp" }
      ], "completion": { "kind": "off_ramp", "offRampKey": "<R>" } },
      { "key": "<D>", "name": "In conversation", "movesInWhen": "They replied", "on": ["reply"], "owner": "Assignee", "goalDays": 3, "steps": [
        { "key": "<uuid>", "channel": "Email", "action": "Draft a reply", "condition": "Always", "instructions": "Answer their question first. Propose a time only if they asked.", "wait": { "until": "reply", "days": 2 } }
      ], "completion": { "kind": "stay" } },
      { "key": "<E>", "name": "Meeting requested", "owner": "Assignee", "goalDays": 3, "steps": [], "completion": { "kind": "next" } },
      { "key": "<F>", "name": "Meeting booked", "on": ["meeting"], "owner": "Assignee", "goalDays": 0, "steps": [], "completion": { "kind": "stay" } }
    ],
    "goalKey": "<F>",
    "offRamps": [{ "key": "<R>", "name": "Unresponsive", "reason": "unresponsive" }],
    "voice": "Write like a founder. Lead with their signal, offer something useful, and ask one short question.",
    "rules": { "autoMove": true, "flagOverdue": true, "allowBackward": false, "emailWindow": "weekdays_morning", "nurtureDays": 90 }
  }
}
```
