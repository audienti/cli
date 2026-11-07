# Playbook fields

Save with `audienti playbook save --file REQUEST.json` or MCP `playbook_save`.
Send `{ "expectedRevision": 0, "requestId": "UUID", "fields": { ... } }` for a new playbook.
For a change, also send `id` and the current revision number. Keep the same request ID when retrying the same save.

## Playbook

| Field | Meaning |
| --- | --- |
| `name` | 1 to 120 characters. Name the strategy. |
| `stages` | 2 to 30 stages, in order. Omit for the default four-stage playbook. |
| `goalKey` | The goal stage's key. It must follow the first stage. Entering it ends participation. |
| `offRamps` | Exits, each `{key,name,reason}`. Reasons: `rejected`, `not_fit`, `unresponsive`, `nurture`, `other`. |
| `voice` | Instructions for how the agent writes content. |
| `rules.allowBackward` | Whether a person or the playbook-wide list may move a person backward. Default false. |
| `eventRules` | The playbook-wide list, up to 30 items. Omit to use the starting list. |
| `customLabels` | Up to 20 `{name,direction:"inbound",meaning}` labels. A label without an item in the playbook-wide list holds for a person. |

## Stage

Each stage has a UUID `key`, unique `name`, `owner` (`Agent` or `Assignee`), `goalDays` (0 to 365),
`enabled` (default true), `steps`, `outcomes` and `completion`. The first and goal stages cannot be skipped.
`goalDays` means overdue after this many days; zero means never overdue.

An outcome says what the stage is trying to get, and where the person goes. Each kind appears at most once.
A stage can have any set of outcome kinds, each once. Check the current stage first. If it does not list that kind,
use the first later stage that does. Never look at an earlier stage. For one observation, use meeting_booked,
then replied, then connected, then task_done. Connected and meeting booked last and count on entry.
Replied and task_done count only after entry; a reply that moved someone cannot fire again in the new stage.
A stage with no outcomes runs only its steps.

A complete save request:

```json
{
  "requestId": "<uuid>",
  "expectedRevision": 0,
  "fields": {
    "name": "Email with a reply outcome",
    "stages": [
      {
        "key": "<READY>",
        "name": "Ready",
        "outcomes": [],
        "completion": {
          "kind": "next"
        }
      },
      {
        "key": "<OUTREACH>",
        "name": "Outreach",
        "steps": [
          {
            "key": "<EMAIL>",
            "channel": "Email",
            "actionId": "email.send",
            "action": "Email 1",
            "condition": "Always",
            "instructions": "Ask one useful question.",
            "wait": {
              "until": "timeout",
              "days": 3
            }
          }
        ],
        "outcomes": [
          {
            "kind": "replied",
            "targets": {
              "positive": {
                "kind": "stage",
                "stageKey": "<ENGAGED>"
              },
              "no": {
                "kind": "off_ramp",
                "offRampKey": "<NO>"
              }
            }
          },
          {
            "kind": "meeting_booked",
            "target": {
              "kind": "stage",
              "stageKey": "<GOAL>"
            }
          }
        ],
        "completion": {
          "kind": "off_ramp",
          "offRampKey": "<QUIET>"
        }
      },
      {
        "key": "<ENGAGED>",
        "name": "Engaged",
        "outcomes": [
          {
            "kind": "meeting_booked",
            "target": {
              "kind": "stage",
              "stageKey": "<GOAL>"
            }
          }
        ],
        "completion": {
          "kind": "stay"
        }
      },
      {
        "key": "<GOAL>",
        "name": "Meeting booked",
        "outcomes": []
      }
    ],
    "goalKey": "<GOAL>",
    "offRamps": [
      {
        "key": "<QUIET>",
        "name": "Unresponsive",
        "reason": "unresponsive"
      },
      {
        "key": "<NO>",
        "name": "Not interested",
        "reason": "rejected"
      }
    ]
  }
}
```

A stage may list these outcomes together:

```json
{
  "outcomes": [
    {"kind":"connected","target":{"kind":"stage","stageKey":"CONNECTED_UUID"}},
    {"kind":"meeting_booked","target":{"kind":"stage","stageKey":"GOAL_UUID"}},
    {"kind":"replied","targets":{
      "positive":{"kind":"stage","stageKey":"ENGAGED_UUID"},
      "no":{"kind":"off_ramp","offRampKey":"REJECTED_UUID"}
    }}
  ],
  "completion":{"kind":"off_ramp","offRampKey":"UNRESPONSIVE_UUID"}
}
```

`connected`, `meeting_booked` and `task_done` each take one `target`: a later stage or an exit.
`replied` takes `targets`. Positive means interested, or any reply that is not a no and that the playbook-wide list does not handle.
No means not interested or not a fit. Positive is a later stage. No is an exit. Meeting booked has its own outcome and target.

`completion` applies when the steps run out without an outcome. Choose `next`, `stay`, or
`off_ramp` with `offRampKey`. Only the goal stage may have no outcomes and stay. Entry there ends participation. The last enabled stage cannot use `next`.

The save refuses missing targets, backward outcome targets, duplicate outcome kinds and stages nobody can reach.
The map derives its arrows from these same fields.

## Step

A step has one exit: the next step. It never chooses a stage.

| Field | Meaning |
| --- | --- |
| `key` | A UUID. Keep it when revising the same step. |
| `channel` | `LinkedIn`, `Email` or `Custom`. |
| `actionId` | One action from `audienti playbook actions`. Custom uses `custom.task`. |
| `action` | The short name a person reads. |
| `condition` | `Always`, `Only if connected`, or `Only if viable`. |
| `viability` | Explain the guard when using `Only if viable`. |
| `instructions` | What the agent prepares or writes. Never put a move here. The planner does not read these words. |
| `wait` | `{days: N, until:"timeout"}`, 1 to 60 whole days. A custom task uses the same days wait. Its done or failed disposition ends the step. `null` chooses no wait on other actions. A custom task always waits for done or failed; missing or null days use a two-day reminder. |
| `humanize` | Email only. False turns off humanizing. Omit for on. |

A new send step starts at three days, or seven for a connection request. A saved step keeps its chosen wait.
A guard that is false skips the step and records why. A step whose work cannot apply is also skipped.
A missing account can hold a step marked Always until the account is ready.

For a custom step, the agent prepares the call script, text, gift note or other material. A person does the task.
Complete it with a `disposition` (`done` or `failed`), the note in `outcome`, optional `notes`, and optional `result`
(`replied` or `meeting_booked`). Done and failed end the step. Only done reaches a `task_done` outcome.
A missing disposition keeps the task open after its wait and reminds the person.

A meeting wait can retain `until:"meeting"` and `followUps` (0 to 10, default 3).
The agent writes each follow-up while the meeting request is open. This changes the wait, never the target.

## Playbook-wide list

Ordinary replies, connections and meetings have their targets only in stage `outcomes`. The playbook-wide list refuses a second target for them. It handles special replies and custom labels.

Each item is `{key,when,do,goto}` with optional `snoozeDays`. `key` is a UUID.
`goto` is `stay`, `stage` with `stageKey`, or `off_ramp` with `offRampKey`.
A custom label uses `when:"custom.NAME"` and must be declared in `customLabels`.
Use `audienti playbook actions` to read available events and actions.

The order is locked safety first, the playbook-wide list, stage outcomes, then completion.
The starting list pauses out of office until the return date (else seven days), pauses later for 30 days,
handles wrong person and hands questions to a person. Unclear or low-confidence replies hold for a person to pick.
An inbound request creates an accept task only for a person in an active campaign, under the account's mode and daily limit.
Only a successful accept makes the person connected.

Read the list with `playbook rules show ID`. Change it with `playbook rules save ID --file REQUEST.json`:
`{"place":{"kind":"playbook"},"rules":[...],"expectedUpdatedAt":"TIME_FROM_READ"}`.
This changes the draft. Publish the draft to make a version. Use the regular draft or version save for outcomes.

A request with step `routes`, step or stage `eventRules`, stage `on`, or step `onTimeout` is refused.
Use stage `outcomes`, playbook `eventRules` and stage `completion`.
