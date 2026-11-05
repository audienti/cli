# The mailbox test email (`mailbox.confirm`)

Audienti never signs in to your user's mailbox. You send from it through your own email
connector (Gmail or Outlook, through Composio, a Claude connector or similar), so you also
prove it works. A mailbox counts for campaigns only once you sent a test email from it to
itself, read it back and reported the code. Your user does nothing in this check: never ask
them for the code, and never send them to Settings to confirm a mailbox.

When your user connects a mailbox you reported, or asks for another test email in Settings →
Sending, you get one `mailbox.confirm` task for it. Its `detail.test` gives the mailbox as
you reported it (`mailbox`), its address as Audienti has it (`address`, or `null` when the
mailbox was reported under a name or an account id that is no address), the code (`code`) and
the subject to use (`subject`, `Audienti mailbox check` and the code).

1. Claim the task: `audienti queue claim TASK_ID`.
2. Send one email from that mailbox to its own address, and to nobody else. Use the address
   your connector reports for the mailbox; `address` is only a hint, and if your connector
   reports another, use that one. Use the subject the task gives and put the code in the body
   too. Send nothing else.
3. Read that mailbox's inbox with your connector until the email arrives: about once a
   minute, for up to 15 minutes. Read only the test email. Note its message id and the time
   it arrived.
4. Report what you read, with the address you sent it to (`sentTo`):

```json
{ "results": [{ "kind": "mailbox.received", "code": "CODE", "sentTo": "ADDRESS_YOU_SENT_TO", "message": "MESSAGE_ID", "receivedAt": "2026-11-04T12:01:00Z" }] }
```

```sh
audienti outcomes report TASK_ID --file RESULTS.json
```

5. Delete both copies of the test email, the sent one and the received one, then report it:
   `{ "results": [{ "kind": "mailbox.deleted", "message": "MESSAGE_ID" }] }`.
6. Report the task done: `audienti queue done TASK_ID --note "test email confirmed"`.

Use the code exactly as you read it back from the email; the dash and case do not matter.
Only the task's own code confirms the mailbox. A code of an older test email is refused
(`stale_code`), any other code too (`wrong_code`), and so is an email that arrived before
the task asked for it (`received_before_asked`), and so is an email sent to another of your
user's mailboxes (`other_mailbox`). Reporting the same email again returns
`already_recorded`.

You can do this check even if you can only read the workspace: your own test email is the
one result a read-only agent may report.

## When you cannot send or read

Report which step failed, with a short reason, then report the task done:

```json
{ "results": [{ "kind": "mailbox.failed", "step": "send", "reason": "No Gmail connector" }] }
```

- `send`: you have no connector that can send from the mailbox, or the send failed. Tell
  your user exactly: "I need a Gmail or Outlook connector to send from your mailbox."
- `read`: the email went out but you cannot read the mailbox's inbox, or it did not arrive
  in 15 minutes. Tell your user exactly: "I need a Gmail or Outlook connector that can read
  your mailbox's inbox."

Settings → Sending and Capabilities then show your user which step failed. No new task comes
until they fix your connector and choose Send another test email. The task cannot be
reported done until you reported `mailbox.received` or `mailbox.failed`
(`mailbox_not_reported`).
