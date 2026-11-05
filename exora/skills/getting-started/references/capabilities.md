# Capability report format

Report what you can do for the user right now, as rows. One row per capability,
provider, source and account. The capability ids come from Audienti's catalog
([ADR 015](https://github.com/omalab/exora/blob/main/docs/decisions/015-capability-taxonomy.md));
the full list is below.

```json
{
  "runtime": { "name": "Claude Code", "model": "claude-opus-5-5" },
  "capabilities": [
    { "capability": "web.search", "provider": "web", "via": "native", "access": "read", "status": "connected" },
    { "capability": "web.page.read", "provider": "web", "via": "native", "access": "read", "status": "connected" },
    { "capability": "profile.message.send", "provider": "email", "via": "composio:gmail", "account": "owner@example.com", "access": "send", "status": "connected" },
    { "capability": "profile.inbox.read", "provider": "email", "via": "composio:gmail", "account": "owner@example.com", "access": "read", "status": "connected" },
    { "capability": "profile.read", "provider": "linkedin", "via": "composio:linkedin", "access": "read", "status": "connected" },
    { "capability": "profile.message.send", "provider": "linkedin", "via": "composio:linkedin", "account": "linkedin.com/in/owner", "access": "send", "status": "connected", "limits": { "daily": 20 } },
    { "capability": "crm.records.search", "provider": "salesforce", "via": "mcp:salesforce", "access": "read", "status": "needs_sign_in" }
  ]
}
```

```sh
audienti agent capabilities report --file CAPABILITIES.json --profile AGENT_PROFILE
audienti agent capabilities --profile AGENT_PROFILE
```

The first command replaces your previous report. The second prints what Audienti now
counts for you: the rows that work now, and the rows that work with Audienti's hosted
tools in the selected workspace. Over MCP, use `agent_capabilities_report` and
`agent_capabilities_list`. Over HTTP, `PUT` and `GET /api/v1/agent-capabilities`.

## Fields

- `runtime.name`: your product or runtime as the user knows it. `runtime.model` is
  optional.
- `capability`: an id from the list below. An unknown id is refused.
- `provider`: which kind of profile the work touches. Required where the list names
  providers; leave it out where it says "none". Where it says "any", leave it out or
  name the one you use.
- `via`: where you reach it. `native` for a connector built into your runtime;
  `composio:<app>` (for example `composio:gmail`), `treg:<tool>` or `mcp:<server>` for
  a hub or MCP server. Check your hubs first: list each app connected there as its own
  row.
- `account`: the user's own mailbox, LinkedIn account or handle you act through, such as
  `owner@example.com` or `linkedin.com/in/owner`. Required for every verb that acts as
  the user (marked "as the user" below).
- `access`: `read`, `write` or `send`, as listed for the capability. `send` reaches
  another person; drafting is `write`.
- `status`: `connected` when you can call it now, `needs_sign_in` when it is installed
  but signed out, `unavailable` when it exists but fails.
- `cost`: leave it out. Your own tools are `owner`.
- `limits`: optional `daily` and `hourly` caps you respect.
- `identity`: optional, on an email or LinkedIn row that names an `account`. The
  account's own stable id, as `{ "namespace": "...", "accountId": "..." }`, so Audienti
  can match the LinkedIn account or mailbox to the one the user set up. Use the same identity on
  every row for that account. Examples: `{ "namespace": "linkedin", "accountId":
  "ACoAAB1234" }` for a LinkedIn account, `{ "namespace": "gmail", "accountId":
  "108234567890" }` for a Gmail mailbox.

At most 64 rows and 32 KiB.

## LinkedIn accounts

For each LinkedIn account you send as, add an entry to `seats` with what you know about
it. Audienti shows it to the user on the LinkedIn account's page and plans around it.

```json
{
  "seats": [
    {
      "provider": "linkedin",
      "account": "linkedin.com/in/owner",
      "checkEverySeconds": 21600,
      "inmail": { "available": true, "quotaPerMonth": 15 },
      "limits": { "connectionRequestsPerDay": 20, "connectionRequestsPerWeek": 100, "messagesPerDay": 50, "inmailPerMonth": 15 }
    }
  ]
}
```

- `account`: the same LinkedIn account you name in your LinkedIn rows.
- `checkEverySeconds`: how often you can check this LinkedIn account's sent invitations, at least
  3600 (one hour). Audienti schedules outcome checks at this cadence; every 6 hours
  when you leave it out. The user never changes it.
- `inmail`: whether the LinkedIn account can send InMail, and its monthly quota. Report
  `profile.inmail.send` as well; a LinkedIn account counts as InMail-capable only with both.
- `limits`: the safe limits for this LinkedIn account. Audienti never plans more LinkedIn sends on
  it than its per-day and per-week limits. The user can lower a limit, never
  raise it above the one you report.

Report `profile.invitations.read` on the LinkedIn account too, so outcome checks can be assigned to
you.

## Rules

- **Report, never connect.** List only what you can call now. Do not install or sign in
  to anything to fill the list.
- **Never invent.** Leave out anything you cannot call. A wrong row sends tasks to you
  that you cannot do.
- **Never report `via: audienti`.** Audienti adds rows for its own hosted tools itself
  when the workspace has credits; a report that sends `audienti` is refused. Leave out
  Audienti's hosted tools unless you reach them through another connector.
- **Never include secrets** (tokens, cookies, keys) or personal data about the user's
  contacts.
- Report again when your tools change, and at least every seven days. The user sees
  older rows as stale.

## The catalog

Launch rows can be required by queue tasks. Later rows are accepted and shown to the
user, but no task requires them yet.

### People and companies

| Capability | Providers | Access | What it does | Launch |
| --- | --- | --- | --- | --- |
| `people.search` | any | read | Find people from audience filters or a question | yes |
| `people.discover` | any | read | Find look-alikes from a seed person or company | yes |
| `person.profiles.discover` | any | read | Expand one person into their other profiles | yes |
| `companies.search` | any | read | Find companies from filters | yes |
| `company.enrich` | any | read | Fill size, industry, location, site | yes |
| `company.posts.list` | linkedin, x, instagram, tiktok | read | What a company page has posted | yes |

### Profile: research

| Capability | Providers | Access | What it does | Launch |
| --- | --- | --- | --- | --- |
| `profile.read` | linkedin, x, instagram, tiktok, github, web | read | Fetch one profile by URL or handle | yes |
| `profile.enrich` | linkedin, email | read | Fill title, company, location, history from one handle | yes |
| `profile.find` | email, phone | read | Find a person's handle on this provider | yes |
| `profile.verify` | email | read | Check the handle is live and deliverable | yes |
| `profile.posts.list` | linkedin, x, instagram, tiktok | read | What this profile has posted | yes |
| `profile.comments.list` | linkedin, x, instagram, tiktok | read | Comments this profile wrote on others' posts | yes |
| `profile.reactions.list` | linkedin, x, instagram, tiktok | read | Reactions this profile gave | yes |

### Profile: as the user (needs `account`)

| Capability | Providers | Access | What it does | Launch |
| --- | --- | --- | --- | --- |
| `profile.message.send` | email, linkedin, whatsapp, phone, x, instagram | send | Send an approved message | email, linkedin |
| `profile.inbox.read` | email, linkedin, whatsapp | read | Watch the user's inbox for replies | email, linkedin |
| `profile.invitations.read` | linkedin | read | Read the user's sent invitations, to see which were accepted or closed | yes |
| `profile.inmail.send` | linkedin | send | Send an approved InMail | yes |
| `profile.connection.request` | linkedin | send | Send an approved connection request | yes |
| `profile.connection.withdraw` | linkedin | send | Withdraw a pending request | yes |
| `profile.connection.remove` | linkedin | send | Remove a connection | later |
| `profile.follow` | linkedin, x, instagram, tiktok | send | Follow a person or company | linkedin |
| `profile.unfollow` | linkedin, x, instagram, tiktok | send | Unfollow | linkedin |
| `profile.mute` | x, instagram | send | Mute | later |
| `profile.block` | x, instagram, linkedin | send | Block | later |
| `profile.call` | phone | send | Call a prospect | later |

### Posts and topics

| Capability | Providers | Access | What it does | Launch |
| --- | --- | --- | --- | --- |
| `topic.track` | any | read | Track a topic for signals | yes |
| `posts.search` | linkedin, x, instagram, tiktok, web | read | Find posts about a topic | yes |
| `post.read` | linkedin, x, instagram, tiktok | read | Fetch one post with its type | yes |
| `post.comments.list` | linkedin, x, instagram, tiktok | read | Who commented, and what they said | yes |
| `post.reactions.list` | linkedin, x, instagram, tiktok | read | Who reacted | yes |
| `post.comment` | linkedin, x, instagram, tiktok | send | Comment as the user (as the user) | later |
| `post.react` | linkedin, x, instagram, tiktok | send | React as the user (as the user) | later |
| `post.publish` | linkedin, x, instagram, tiktok | send | Publish a post as the user (as the user) | later |

### Web, calendar, records, owner, integration

| Capability | Providers | Access | What it does | Launch |
| --- | --- | --- | --- | --- |
| `web.search` | web | read | Search the web | yes |
| `web.page.read` | web | read | Read one page | yes |
| `calendar.read` | google, microsoft | read | Free and busy time | later |
| `calendar.freebusy.read` | google, microsoft | read | Read the user's free and busy times to offer slots in a reply | later |
| `calendar.event.create` | google, microsoft | write | Create an event and send the invite from the user's calendar | later |
| `meeting.book` | google, microsoft | write | Book or propose a meeting | later |
| `meeting.reschedule` | google, microsoft | write | Move a booked meeting | later |
| `meeting.cancel` | google, microsoft | write | Cancel a booked meeting | later |
| `crm.records.search` | hubspot, salesforce, pipedrive, other | read | Find records in the user's CRM | yes |
| `crm.record.read` | hubspot, salesforce, pipedrive, other | read | Read one CRM record | yes |
| `crm.record.write` | hubspot, salesforce, pipedrive, other | write | Write back to one CRM record | later |
| `owner.notify` | push, slack, sms, email | send | Reach the user on their own channel | yes |
| `webhook.receive` | none | read | Take a push instead of polling | later |
| `webhook.send` | none | send | Post events to the user's URL | later |

### Tools you use for yourself

| Capability | Providers | Access | What it does | Launch |
| --- | --- | --- | --- | --- |
| `tool.media.transcribe` | none | read | Video or audio to text | later |
| `tool.image.read` | none | read | Read text and content out of an image | later |
| `tool.proxy.session.start` | none | write | Sticky residential session for your own browser, metered by bandwidth | yes |
| `tool.proxy.session.rotate` | none | write | New IP on the current session | yes |
| `tool.proxy.config.read` | none | read | Read region, stickiness and bandwidth cap | yes |
| `tool.proxy.config.write` | none | write | Set region, stickiness and bandwidth cap | yes |

Your runtime's documents, spreadsheets, files, code, memory, tasks and chat are not
capabilities. Leave them out.

## Older reports

`audienti agent inventory report` (categories such as `web_search` or `crm`) and the
per-account `audienti agent capabilities report` with `provider` and `accountRef` are
still accepted for one release. Audienti translates both into rows. Send the format above
instead.

Translated inventory reports match fewer queue tasks than before:

- `company_data` alone matches none of the find, verify or enrich tasks.
- `linkedin` alone no longer matches find or enrich tasks.
- `web_search` alone no longer matches enrich tasks.
- `people_data` alone no longer matches verify tasks.
- `email` and `linkedin` match send tasks only for their own provider and only with
  `send` access; `social` matches no send task.
