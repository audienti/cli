# Approach fields

`audienti approach save --file REQUEST.json` accepts one object:

| Field | Rule |
| --- | --- |
| `id` | Omit for a new approach. The approach ID to revise one. |
| `expectedRevision` | 0 for a new approach, otherwise the latest revision number. |
| `requestId` | A fresh UUID. Reuse it only when you retry the same save. |
| `fields` | The approach itself, below. |

## fields

| Field | Rule |
| --- | --- |
| `name` | 1 to 120 characters. Name the strategy, not the campaign. |
| `stages` | 2 to 30 stages, in order. |
| `goalKey` | The `key` of the goal stage. Not the first stage. |
| `offRamps` | Up to 30 ways out: `{ key, name, reason }`. `reason` is `rejected`, `not_fit`, `nurture`, `unresponsive` or `other`. "Bad data" and "repair" are not off-ramps. |
| `voice` | How messages should sound, in the owner's style. |
| `rules` | Optional: `autoMove`, `flagOverdue`, `allowBackward` (booleans), `emailWindow` (`weekdays_morning`, `weekdays`, `any_day`), `nurtureDays` (60, 90, 180 or null). |

## Stage

| Field | Rule |
| --- | --- |
| `key` | A UUID, unique in the approach. Keep it across revisions. |
| `name` | Unique in the approach. |
| `movesInWhen` | What moves a prospect into this stage, for example "They replied". |
| `owner` | `Agent` or `Assignee` (the person assigned to the prospect). |
| `goalDays` | 0 to 365. How long a prospect should stay before it is overdue. |
| `optional` | Only an optional stage can be disabled. |
| `enabled` | Defaults to true. |
| `steps` | Up to 20 steps. |
| `completion` | `{ "kind": "next" }`, `{ "kind": "stay" }` or `{ "kind": "off_ramp", "offRampKey": KEY }`. The last enabled stage cannot use `next`. |

## Step

| Field | Rule |
| --- | --- |
| `key` | A UUID, unique in the approach. |
| `channel` | `LinkedIn`, `Email` or `Phone`. |
| `action` | A short label, for example "Send connection request". |
| `condition` | `Always`, `Only if viable` or `Only if connected`. |
| `viability` | Required with `Only if viable`: when the step makes sense. |
| `instructions` | Coaching for whoever does the step. |
| `waitDays` | 1 to 60 days to wait after the step. |

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
        { "key": "<uuid>", "channel": "LinkedIn", "action": "View profile", "condition": "Always", "instructions": "Read their recent activity for a signal to mention.", "waitDays": 2 },
        { "key": "<uuid>", "channel": "LinkedIn", "action": "Like a recent post", "condition": "Always", "instructions": "Only a post about their work.", "waitDays": 3 }
      ], "completion": { "kind": "next" } },
      { "key": "<C>", "name": "Outreach underway", "owner": "Agent", "goalDays": 35, "steps": [
        { "key": "<uuid>", "channel": "LinkedIn", "action": "Send connection request", "condition": "Always", "instructions": "No note, or one line on their signal.", "waitDays": 21 },
        { "key": "<uuid>", "channel": "LinkedIn", "action": "Send message", "condition": "Only if connected", "instructions": "Lead with their signal and offer something useful.", "waitDays": 5 },
        { "key": "<uuid>", "channel": "Email", "action": "Email 1", "condition": "Always", "instructions": "Three sentences: signal, offer, one short question.", "waitDays": 4 }
      ], "completion": { "kind": "off_ramp", "offRampKey": "<R>" } },
      { "key": "<D>", "name": "In conversation", "movesInWhen": "They replied", "owner": "Assignee", "goalDays": 3, "steps": [
        { "key": "<uuid>", "channel": "Email", "action": "Draft a reply", "condition": "Always", "instructions": "Answer their question first. Propose a time only if they asked.", "waitDays": 2 }
      ], "completion": { "kind": "stay" } },
      { "key": "<E>", "name": "Meeting requested", "owner": "Assignee", "goalDays": 3, "steps": [], "completion": { "kind": "next" } },
      { "key": "<F>", "name": "Meeting booked", "owner": "Assignee", "goalDays": 0, "steps": [], "completion": { "kind": "stay" } }
    ],
    "goalKey": "<F>",
    "offRamps": [{ "key": "<R>", "name": "Unresponsive", "reason": "unresponsive" }],
    "voice": "Write like a founder. Lead with their signal, offer something useful, and ask one short question.",
    "rules": { "autoMove": true, "flagOverdue": true, "allowBackward": false, "emailWindow": "weekdays_morning", "nurtureDays": 90 }
  }
}
```
