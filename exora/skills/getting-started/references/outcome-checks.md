# Outcome checks

An outcome check is a queue task (`outcomes.check`) that asks you whether the people
you invited on one of the user's LinkedIn accounts have accepted. Audienti schedules it
for you at the cadence you reported for that LinkedIn account (`checkEverySeconds`, every 6 hours
when you report none), and only while someone on that LinkedIn account waits for an accept. Each
task lists at most 100 people, so a LinkedIn account with more people waiting gets several tasks
in the same interval, and every waiting person is on one of them. You never decide when to check, and you never check
anyone the task does not list.

## What the task gives you

The task's `detail` holds:

- `seat`: the LinkedIn account to check (`account` is the LinkedIn account you reported, for example
  `linkedin.com/in/owner`).
- `waiting`: the people to check, at most 100. The list stays as it is while you hold
  the task, so you can report on everyone it lists; no other check lists them meanwhile,
  even one for the next interval. Each has `person` (the Audienti person
  id you report against), `name`, `profileUrl` and `invitedAt` (when the invitation was
  sent).

The task requires `profile.invitations.read` on that LinkedIn account. If you hold it, the task is
assigned to you.

## The procedure

1. Claim the task: `audienti queue claim TASK_ID`.
2. Read the LinkedIn account's own sent invitations with your tool, or read each listed person's
   profile to see the connection degree. Look up only the people in `waiting`. Do not
   list, search or open anyone else, and do not page through the user's whole network.
3. Keep to the limits you reported for this LinkedIn account. Spread reads out if your tool asks
   you to. If you cannot check now (signed out, rate limited), release the task with a
   note: `audienti queue release TASK_ID --note "why"`.
4. Write what you found to a file and report it:

```json
{
  "results": [
    { "kind": "linkedin.accept", "person": "PERSON_ID", "at": "2026-11-01T09:30:00Z" },
    { "kind": "linkedin.invite_closed", "person": "PERSON_ID", "reason": "withdrawn" },
    { "kind": "linkedin.profile_degree", "person": "PERSON_ID", "degree": 2 }
  ]
}
```

```sh
audienti outcomes report TASK_ID --file RESULTS.json
```

5. Report the task done: `audienti queue done TASK_ID --note "3 checked, 1 accepted"`.

## Result kinds

- `linkedin.accept {person, at}`: the person accepted. `at` is when they accepted, as
  close as your tool tells you. Audienti ends the person's wait and plans the next step
  of the playbook, which appears in your queue.
- `linkedin.invite_closed {person, reason}`: the invitation is no longer pending.
  `reason` is `withdrawn` (the user or you withdrew it) or `expired` (LinkedIn closed
  it). Audienti records the fact; the wait still ends at its timeout.
- `linkedin.profile_degree {person, degree}`: optional evidence, the connection degree
  you read on the profile (1, 2 or 3). A 1 means connected; report it as an accept as
  well when you know the time.

Leave out anyone still pending. They stay on the next check until they accept or the
wait times out.

## What the report returns

`results` has one entry per result you sent, in the same order. Each person is recorded
on their own, so one person who cannot be recorded does not hold back the others.

- `status`: `recorded` (written now), `already_recorded` (an earlier report wrote it;
  `eventId` is that earlier event) or `not_recorded` (nothing was written).
- `reason`: why, when there is one. `participation_ended` or
  `participation_unavailable` means the fact was recorded but nobody moves, because
  the person's campaign participation ended or its playbook cannot be read.
  `not_found` with `not_recorded` means the person is no longer in the workspace.
- `next`: the person's next step after the report, when there is one.
- `failed`: the accept was recorded, but planning the next step failed. Audienti shows
  the failure on the person's timeline; `reason` holds its code. Sending the same
  accept again returns the same failure until it is resolved.

## Errors

- `not_claimed`: claim the task first, or your lease expired. Read the queue again.
- `not_on_list`: you reported a person the task does not list. Report only the listed
  people.
- `validation_error`: a result has a wrong kind, person id or time.
