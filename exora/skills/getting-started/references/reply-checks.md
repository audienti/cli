# Mailbox checks

Audienti never signs in to your user's mailbox. You send from it through your own email
connector (Gmail or Outlook, through Composio, a Claude connector or similar), so you also
prove it works and read it for replies. Two queue tasks ask for that. If you have no email
connector, tell your user exactly: "I need a Gmail or Outlook connector to send from your
mailbox." Never send them to Settings to connect a mailbox.

## The test email (`mailbox.confirm`)

A mailbox counts for campaigns only once you sent a test email from it to itself, read it
back and reported its code. [The mailbox test email](mailbox-check.md) gives the steps. Your
user does nothing in that check. It proves the mailbox sends and that you can read its
inbox, which the reply checks below need too.

## The reply check (`replies.check`)

Before any next step goes to someone you emailed, in a campaign or not, Audienti asks you to
check the mailbox the email went out from for their reply. Until you report each person, no
next step is planned or sent for them. Each task lists at most 100 people in `waiting`, each
with `person`, `name`, `participation` (null when the step is in no campaign), `attempt`
(the email) and `sentAt` (when it went out). A task for a mailbox you confirm is assigned to
you.
While you hold the task, its list stays as it was when you claimed it, even after a reply
you record. Report everyone on it.

1. Claim the task.
2. Search the mailbox with your connector for mail from the listed people since their
   `sentAt` only. Do not read anything else.
3. Record each reply you find the way you record any reply: `audienti prospects
   conversation append PERSON --workspace ID --file ITEM.json` with `direction: inbound`
   and `conversationType: direct`. It returns the evidence id. Audienti then ends the
   person's wait, holds their sends and gives you a reply task, as for any reply.
4. Report every listed person:

```json
{
  "results": [
    { "kind": "email.no_reply", "person": "PERSON_ID" },
    { "kind": "email.reply", "person": "PERSON_ID", "evidence": "EVIDENCE_ID" }
  ]
}
```

```sh
audienti outcomes report TASK_ID --file RESULTS.json
```

5. Report the task done. If you cannot read the mailbox now, release the task with a note.

An `email.reply` whose evidence is not an inbound message of that person is not recorded
(`reply_not_recorded`): record the reply first. A person you leave out comes back on the
next check, about an hour later. Reporting the same person again for the same email returns
`already_recorded`.
