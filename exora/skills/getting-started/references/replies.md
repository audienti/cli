# Handling a reply

A reply task (`replies.handle`) means a prospect answered. The inbound itself is never
approved: inbound wins, and you record it. What the user approves is your answer.

## What to do

1. Read the conversation: `audienti prospects conversation list PERSON --workspace ID`.
2. Classify the reply as one of `interested`, `question`, `later`, `out_of_office`,
   `stop`, `bounce`, `referral` or `wrong_person` (the prospect is the wrong person and
   names no one else). A stop, a bounce or a referral must carry its typed
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
`responseEvidenceId`.

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

Record where an unbooked meeting stands with `"meetingState"` in a `replies set` result:

- `requested`: a time was asked for or offered.
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
