# Handling a reply

A reply task (`replies.handle`) means a prospect answered. The inbound itself is never
approved: inbound wins, and you record it. What the user approves is your answer.

## What to do

1. Read the conversation: `audienti prospects conversation list PERSON --workspace ID`.
2. Classify the reply as one of `interested`, `question`, `later`, `not_interested` (a clear no thanks),
   `out_of_office`, `stop`, `bounce`, `referral`, `wrong_person` (the prospect is the wrong person and
   names no one else) or `unclear` (you cannot tell what they mean; it holds the person for a decision, see below). A stop, a bounce or a referral must carry its typed
   `result`, or the report is refused; see [Stop, bounce and referral](#stop-bounce-and-referral).
3. Draft the answer from the mailbox or LinkedIn account the reply came to (the assignee's).
   - Bind the recipient and the sender, or the answer waits in Blocked: the recipient's
     `contactId` comes from `audienti prospects contacts list PERSON`, and the
     `senderAccountId` is the user's confirmed sender account for that mailbox or LinkedIn account
     (`audienti sender accounts list`).
   - If you report `calendar.freebusy.read`, read the user's free times and offer up
     to six slots in the answer. Put the same times in `slots`, so the user sees them on
     the card: "Slots from your calendar · Thu 10:00, 14:30 ET". A scheduling tool that
     reports only `calendar.read` is not the user's calendar and offers no slots.
   - Without a calendar, ask the prospect for a time that suits them, and leave `slots`
     out. The user's card says no agent has a calendar and links to the Capabilities
     screen.
4. Record the classification and the draft in one result, keeping the reply open:

   ```sh
   audienti prospects replies set PERSON --workspace ID --evidence EVIDENCE --file RESULT.json
   ```

   ```json
   {
     "requestId": "a new UUID for each result",
     "expectedVersion": 0,
     "status": "needs_handling",
     "outcome": null,
     "reason": "Interested and asked for a time on Thursday.",
     "responseEvidenceId": null,
     "classification": "interested",
     "draft": {
       "type": "email.send",
       "content": { "subject": "Re: Late invoices", "body": "Thursday works. I have 10:00 or 14:30 ET. Which suits you?" },
       "recipient": { "prospectId": "PERSON", "email": "jane@example.com", "contactId": "CONTACT" },
       "sender": { "provider": "email", "accountRef": "owner@example.com", "senderAccountId": "SENDER" },
       "reason": "Offers the two free slots on Thursday the prospect asked for.",
       "slots": [
         { "start": "2026-11-05T15:00:00Z", "end": "2026-11-05T15:30:00Z", "timeZone": "America/New_York" },
         { "start": "2026-11-05T19:30:00Z", "end": "2026-11-05T20:00:00Z", "timeZone": "America/New_York" }
       ]
     }
   }
   ```

   `expectedVersion` is the reply's current version (`audienti prospects replies get`).
   The draft becomes a revision the user reviews in Operator. Nothing is sent until the
   user approves it. A second result for the same reply replaces a draft the user has
   not decided yet.
5. Report the task done.

The owner can also close a reply in Operator with "Mark handled" or "Not a reply". That records the same
state as `replies set` with status `handled` or `not_reply`, and withdraws any answer you drafted for it
that no agent has claimed to send. Read `replies get` before you set a reply again.

To close a reply for the owner by CLI, pass the version you read as `expectedVersion`. Handled with no
answer is `{"requestId":"<uuid>","expectedVersion":1,"status":"handled","outcome":"closed_without_response","reason":"The owner answered by phone."}`.
Not a reply is `{"requestId":"<uuid>","expectedVersion":1,"status":"not_reply","reason":"An automatic message."}`;
it has no outcome. Give `--file` an absolute path.

The classification records a `replied` event on the person's active campaigns, except
for `bounce` and `out_of_office`, which are not replies from the person.
An `out_of_office` reply records an auto-reply instead. The playbook's out-of-office rule
snoozes the person: the wait and the next step hold for 7 days, or until the return date
when you pass `returnsOn`. Nothing is sent meanwhile and the person does not move. A
`wrong_person` reply that names no one stops the sends and leaves the reply for the user to
settle: ask who the right person is. When the reply names the right person, classify it as a
`referral` with its typed `result`.

## Label a message with its words

A label says what a message means. Read the names with `audienti intent list`. A label goes on a message
that is stored as evidence. Get its `EVIDENCE` ID from `audienti prospects conversation append` (when you
store the message yourself) or `audienti prospects conversation list PERSON` (for one already stored); intake
returns it too. Record one to three labels, each with the `quote` that supports it (at most 300 characters,
copied from the message) and a plain `reason` (at most 200 characters, no IDs or error codes):

```
audienti intent record --person PERSON --evidence EVIDENCE \
  --label interested --quote "we are interested in a demo" --reason "They ask for a demo next week."
```

Flags carry one label. Use `--file LABELS.json` for several labels or a typed detail (the `result` of a
stop, bounce or referral; `meeting` for `meeting_booked`; `returnsOn` for `out_of_office`). A stop that
asks for everything to end looks like this:

```
[{"label": "stop", "quote": "please stop writing to me", "reason": "They ask us to stop.",
  "result": {"type": "reply.stop", "scope": "person"}}]
```

`audienti intent record --help` prints this example. Give the same `--request-id` to repeat a call safely. Add
`confidence` (`high`, `medium` or `low`) when you are unsure. A low-confidence label does not fire its rule:
the person is held and a decision opens for your user to pick from (see below). `stop` and `bounce` always
act, whatever the confidence. A message keeps the labels it has: a second request that repeats
one is refused with `already_recorded`, and one that would give the message a second reading is refused.

Audienti checks every label and writes nothing if one fails. A refusal names the `field`, the `allowed`
values and the `next` step. The checks:

- The message is stored with its text. A message stored without a body cannot carry a label: submit the text as evidence.
- The name is on the list, and fits the message direction and channel (`bounce` is email only).
- The quote is in the message (subject and body), ignoring case and spacing.
- The reason is plain words a person can read.
- The labels fit together: `stop`, `bounce` and `out_of_office` stand alone; a message has one reading of the
  reply and at most one meeting label.
- The typed detail is present: a `stop`, `bounce` or `referral` needs its `result`; `meeting_booked` needs `meeting`.

A recorded label shows to the user as a chip with the quote, the reason, how sure you were and who recorded it, on the
reply card in Operator, the person's page and the Pipeline card. Write the `quote` and `reason` for a person to read. The same
labels come back as `labels` on `audienti prospects timeline PERSON`, `audienti prospects replies get PERSON` (the latest reply, or one message with `--evidence`) and `audienti pipeline show`. A label event on the timeline carries the label once, under `event.label`. Mark a guess with `confidence: low`: the chip says so.

To get a second reading before you record, `audienti intent suggest --channel email --text "..."` asks a model
to suggest labels. It costs credits: the call prints the price per million input tokens first, and a message
uses a small part of that. It returns up to two suggestions, each with a `quote`, a `reason`, a `confidence` and
`needs` (the typed detail to add, for example the `scope` of a stop). It records nothing. Keep, change or drop
a suggestion, then record it with `intent record`, which runs every check above again.

`replies set` records the same labels. Add `"intent": {"quote": "...", "reason": "..."}` next to `classification`
or `meetingState` and it runs the same checks and stores the words on the event. Without `intent` it works as before.

## A label your playbook defines

A playbook may declare labels of its own, such as "asked about pricing". See them with `audienti intent list --playbook PLAYBOOK_ID`: each shows its name
(`custom.asked_pricing`), what it means and whether a rule uses it. Record one like any other label:
`audienti intent record --person PERSON --evidence EVIDENCE --label custom.asked_pricing --quote "..." --reason "..."`. The same checks run, and
the label fits only the people whose running playbook declares it. If a rule names the label, the rule acts. If none does, the person is held and a
decision opens for your user, with the trigger `custom_label_no_rule`. A custom label is never a stop or a bounce, and `replies set` takes core labels only.

## A label is wrong

A person corrects a label; an agent cannot. If you see a wrong label, tell your user and say which one. They change it
with the "Change label" menu on the reply card or the person's page, or with `audienti intent correct --person PERSON
--event EVENT --label NAME --quote "..." --reason "..."`. `--retract` withdraws it. The `EVENT` is the `id` the label
shows. Nothing is edited: the old label stays in the history, and the labels in force are the ones no correction replaced.
The new label passes the same checks as a first recording. If it would send the person somewhere else, nothing moves:
Operator asks "Move back to ..." and the person picks. A change away from a stop never lifts the stop. A decision
asks "Lift the stop on this person?", and the stop stays until a person picks to lift it. An agent token gets `human_only`.

## Label a message you sent

A message you sent can carry a label too. Today one fits: `meeting_requested`, for a message that asks for a
meeting or offers a time ("could we find 20 minutes next week?"). Without it Audienti does not know a meeting
was asked for, so the playbook's meeting wait cannot follow it up. With it the timeline shows the request, the
wait sends up to 3 follow-ups, and a request nobody answers is marked No answer. No reply is needed.

Do it after the send, in two calls. Store what you sent, then label it:

```
audienti prospects conversation append PERSON --workspace ID --file ITEM.json
audienti intent record --person PERSON --evidence EVIDENCE \
  --label meeting_requested --quote "find 20 minutes next week" --reason "We ask for a call next week."
```

`ITEM.json` holds a new `requestId` and the sent message. Give it the text exactly as you sent it:

```
{ "requestId": "<uuid>",
  "item": {
    "source": { "provider": "email", "accountRef": "you@yourcompany.com", "itemId": "<the provider's message ID>", "threadId": null },
    "payload": { "direction": "outbound", "conversationType": "direct", "occurredAt": "2026-11-06T14:00:00Z",
                 "subject": "Ten minutes on late invoices?", "body": "Hi Jordan, could we find 20 minutes next week?", "participants": null } } }
```

The call returns `EVIDENCE`. If you stored the message already, to report the send (`account_evidence`) or as
the `responseEvidenceId` of an answer, use that same ID. The `quote` must be words from what you sent.
The same checks apply: a message with no stored text, a quote that is not in it, or a label that does not fit a sent message (`interested` fits a reply, not an ask) is refused and writes nothing.

- Label only a message that asks for or offers a meeting. A message that does not is not labeled.
- A follow-up that asks again needs no label: the request is already on the timeline, so a repeat writes nothing.
  The same message cannot take the label twice (`already_recorded`).
- The label goes on the person's running campaign. A person runs in one campaign per workspace, so you need no option; `--participation ID` names the run if you want it explicit. The answer to `work execution send` or `report` carries that `participationId` when the send started a playbook step and the person still runs in the campaign run the send started, also when you repeat the call. A person who left and rejoined has a new run: a repeat of the old send names none. The label works without it.
- An answer to a reply that offers times is labeled the same way, with the evidence of the answer you sent.

## When the rules do not decide: decisions

A reply the rules cannot act on holds the person, and a decision asks your user to pick. It opens when a
label is `unclear`, when a label has low confidence (not `stop` or `bounce`), when a reply has had no label
for 24 hours, or when you ask for one with `audienti decision ask`. While it is open nothing is sent to the
person. A `decisions.prepare` task tells you to add your view:

1. Read the options the playbook allows: `audienti decision options DECISION_ID`. Only these ids are valid.
   A stage option names its stage (`stageName`), a snooze option reads "Snooze 30 days, then continue", and each
   trigger says who recorded the event behind it (`recordedBy`: kind and name). The clock raises a trigger with none.
2. Choose two to five. Write one plain line for each (at most 140 characters, no IDs or error codes) and
   recommend one: `audienti decision prepare DECISION_ID --recommended ID --option ID=ANALYSIS ...`.
   Audienti refuses an option outside the list and names the allowed ids.
3. Report the task done. Only your user picks, in Operator or with `audienti decision answer` under their own
   sign-in. Audienti never applies your recommendation. After 24 hours without your view the user sees the
   options without analyses. An open decision turns stale after 7 days; the person stays held.

A reply you can label clearly needs no decision: record the label with `audienti intent record` and the rules
act. A label recorded later ends the hold.

## Stop, bounce and referral

These three need no decision from the user. Classify the reply, report the typed
`result` next to the classification it matches, and Audienti records it against the
person. The classification without its result is refused with 400 naming the result it
needs (`reply.stop`, `email.bounce` or `reply.referral`). Use the prospect's words,
verbatim, for `quote`.

- **Stop** (`stop`): the prospect asked not to be contacted. Report status `handled`,
  outcome `suppressed` and no draft:

  ```json
  { "classification": "stop", "status": "handled", "outcome": "suppressed",
    "result": { "type": "reply.stop", "scope": "person", "quote": "Please remove me from your list." } }
  ```

  The person is suppressed for good on every channel, their pending sends and open
  tasks are withdrawn, and they leave their campaigns. The user cannot override it.
  Use `"scope": "company"` only when they asked to stop for their whole company:
  everyone at the company's domain is suppressed, and so is anyone added later. The
  domain goes on the do-not-contact list marked "Asked to stop", and no one can remove it.
  Never contact a person who asked to stop again, on any channel.
- **Bounce** (`bounce`): a delivery failure came back instead of a reply. Report
  status `not_reply` and no draft:

  ```json
  { "classification": "bounce", "status": "not_reply", "outcome": null,
    "result": { "type": "email.bounce", "address": "priya@example.com", "kind": "hard", "evidence": "550 5.1.1 User unknown" } }
  ```

  `address` is the address that bounced: the person's own address, or one nobody in the
  workspace holds. An address another person holds is refused with 409
  `address_belongs_to_another_person`; report the bounce on the reply that came back
  about that person instead.
  `hard` means the address does not exist or refuses mail: it is marked bounced and
  blocked in every campaign, and the person leaves the campaign as Bounced. `soft`
  means a full mailbox or a temporary failure: the address is held for 24 hours, then
  a retry task asks you to send the message once more. Retried once means exactly one
  send: after the 24 hours the address takes one send, and every other send to it is
  refused with `recipient_contact_bounced` until that send's outcome is known. A second
  bounce within 14 days of the retry counts as hard; with no bounce in that time the
  address opens again. Put the bounce message and its status code in `evidence`.
- **Referral** (`referral`): the prospect is the wrong person and named someone else.
  Report status `needs_handling` with a thank-you as the draft, and name the person:

  ```json
  { "classification": "referral", "status": "needs_handling", "outcome": null,
    "result": { "type": "reply.referral", "name": "Sam Lee", "title": "Finance lead",
      "email": "sam@example.com", "quote": "Wrong person, try Sam Lee in finance." },
    "draft": { "type": "email.send", "content": { "subject": "Re: Late invoices", "body": "Thank you, Jane. I will reach out to Sam." }, "...": "recipient, sender and reason as above" } }
  ```

  Give `linkedinUrl` or `email` when the prospect gave them. Audienti finds or adds the
  named person (an email someone in the workspace already holds names that person), links
  the two records, and leaves the referrer as Not a fit with the note "referred to Sam
  Lee". When the email and the LinkedIn profile belong to different people, the referral
  is refused with 409 `identity_conflict`. Reporting the same referral again, from
  another reply, changes nothing. The named person is not in the queue yet: a
  `prospects.verify` task asks you to check them against the campaign's audience
  first. The thank-you is an answer like any other: the user approves it in Operator
  before it is sent.

Every first email you draft ends with one plain sentence that lets the prospect opt
out, such as "If this is not for you, reply and I will not write again." When they do,
report it as a stop.

## After the user approves

A `work.execute` task with `action: send_reply` follows. Claim it, send the answer in
the thread the prospect wrote in, report the result, then close the reply with status
`handled`, outcome `response_recorded` and the sent message's evidence as
`responseEvidenceId`. If your answer offers times for a meeting, label that sent message
`meeting_requested` with the same evidence ("Label a message you sent").

## When a meeting is booked

- The prospect picks a slot: send the invite from the user's calendar
  (`calendar.event.create`), then record `"meeting": { "at": "…Z", "source": "sent_invite" }`
  in a `replies set` result.
- The prospect sent an invite: set `"invite": true` with the classification. A
  `meetings.confirm` task follows, assigned to one agent of the person's assignee that
  is allowed to make workspace changes and reports `calendar.event.create` or
  `meeting.book`. It accepts the invite on the
  assignee's calendar and records `"source": "received_invite"`. If the assignee has no
  such agent, no task appears.
- The meeting moves the person to the playbook's goal stage. Record it once.

## Before a meeting is booked

Record where an unbooked meeting stands. When the prospect writes about it, use `"meetingState"` in a
`replies set` result. When you ask for the meeting in a message you sent, label that message
`meeting_requested` (see "Label a message you sent"):

- `requested`: a time was asked for or offered, by them or by you.
- `accepted`: they agreed, and no time is fixed yet.
- `declined`: they said no to the meeting. A plain no is not a request to stop; classify the
  reply on its own.

Each state is written once, and only when it differs from the last one. Nothing is written after
a booking. If a playbook step waits for a meeting and the wait runs out while the request is
`requested` or `accepted`, Audienti first asks you for a follow-up, up to 3 times (the playbook
can change the count and the wait; the default wait is 5 days). Write each follow-up yourself
after you read the whole conversation, and send it on the thread's channel. Do not use a fixed
template unless the user put one in your instructions. Save it as a plan action with the
`playbookStepKey` the task names. After the last wait runs out, Audienti records
`meeting_no_answer` itself and tells the owner. Do not record it.

## Taken over

When the user takes a person over, every open task and draft for them is withdrawn
and no new task about them appears, in any campaign. There is no hand back. Do not
contact them again. A draft for them is refused with `taken_over`.
