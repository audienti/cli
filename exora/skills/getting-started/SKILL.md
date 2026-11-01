---
name: getting-started
description: Run once, right after your Audienti connection is approved. Report the tools and connectors you already have, introduce yourself to the owner, and propose a first campaign test (offer, audience, approach, length) drafted from what you can already read, so the owner only corrects it. Use again when your tools change or the owner asks for a new test.
---

# Getting started with Audienti

You are an agent that has just been connected to a person's Audienti account. Audienti
is an agentic CRM and the system of record for this work: audiences, offers, campaigns,
people, companies and the work you do for them. The person who approved you is the
owner.

The owner wants to learn which approach books meetings. Your job is to turn their ideas
into campaign tests quickly and to do as much of the work as you can. Ask only for what
you cannot find yourself.

Start every run with the work queue. Audienti keeps a queue of what is due for you:

```sh
audienti queue next --json
```

The reply starts with `orientation`: what Audienti is, who you are in this workspace and
how to work. Read it. Your first task is usually **Report your tools and connectors**,
which is part 1 below. Claim a task before you start it (`audienti queue claim TASK`),
and report it when you finish (`audienti queue done TASK --note "what you did"`). If
you cannot finish, release it (`audienti queue release TASK --note "why"`) so another
agent can take it. Over MCP, use `agent_queue_list`, `agent_queue_claim`,
`agent_queue_complete` and `agent_queue_release`.

There are three parts, in order:

1. **Triage your tools** and report them to Audienti. Ask nothing.
2. **Introduce yourself and propose a first campaign** as one question in Operator
   (`audienti ask`), not in chat.
3. **Save the campaign as a draft** once the owner answers, and show five fits.

Keep messages plain and short. Address the owner as "you". No emoji, no marketing tone.

## Rules that always apply

- **Report, never connect.** List only the tools and connectors your runtime already
  has. Do not install connectors, start OAuth or ask the owner to sign in to anything
  during this skill. If something is missing, say it is missing.
- **Never invent.** Draft only from what you read. Do not make up customers, results,
  numbers or claims. Mark anything you inferred as inferred.
- **Draft, never send.** Everything you create is a draft. Nothing goes to a prospect.
  The owner activates a campaign in Audienti.
- **Never include secrets.** No passwords, API keys, tokens or session cookies in any
  report, message or field.
- **Audienti is the record.** Save decisions from your conversations with the owner in
  Audienti records (offer text, audience filters, campaign premise and notes), not only
  in chat or your own memory.

## 1. Triage your tools

1. Confirm your connection: `audienti workspace list --profile AGENT_PROFILE`, then select
   the workspace the owner approved (`audienti workspace use ID --profile AGENT_PROFILE`;
   over MCP, `workspace_select`).
2. List every tool, connector, plugin and integration you can call now. Use your
   runtime's own listing (tool list, connector settings, MCP servers, installed plugins)
   and every integration hub you use. Check aggregators first: if you reach tools
   through Composio, Treg or another hub, list each app connected there and put the hub
   name in `via`. Then list your native connectors (built into your runtime, no hub) and
   leave `via` out for those. Check each category in turn: CRM, email, LinkedIn,
   other social, people data, company data, web search and browsing, spreadsheets and
   documents, chat, calendar, tasks, scheduling, memory. Leave out Audienti's own hosted
   tools unless you reach them through another connector.
3. Record each tool's category, name, access (`read`, `write`, `send`) and status
   (`connected`, `needs_sign_in`, `unavailable`). See [the inventory format](references/inventory.md).
4. Report it. The report replaces the previous one, and the owner sees it in
   **Settings → Agents**:

```sh
audienti agent inventory report --file inventory.json --profile AGENT_PROFILE
```

   Over MCP, call `agent_inventory_report` with the same JSON. Over HTTP, send
   `PUT /api/v1/agent-inventory`.
5. Also report each mailbox or LinkedIn seat you act through with
   `audienti agent capabilities report` (see the `audienti` skill). The inventory says
   what you have; the capability report says which accounts you can act as.
6. Install the skills you will use for the work: `audienti skills list --compact`,
   then `audienti skills read ID SKILL.md` and only the references the task needs
   (over MCP, `skills_list` with `compact: true` and `skills_read`). Prospect
   finding, planning, writing and cadence skills are published in the `audienti/plugins`
   marketplace; install the ones your tools can run, using your runtime's plugin
   installer. Use the `audienti` skill for prospect finding and profile research.

## 2. Introduce yourself and propose a first campaign

First check what already exists: `audienti campaign list`, `audienti offer list`,
`audienti audience list`. If the workspace already has an active campaign, introduce
yourself, list your tools and ask what the owner wants to test next. Skip the rest of
this section.

Otherwise draft a complete first campaign before you ask anything. Read what your
tools reach: the owner's website, their documents, recent sent email, CRM records and
LinkedIn profile. Then fill the [campaign draft](references/campaign-draft.md):

- **Offer first.** What they sell, the problem it solves and one proof point, in the
  owner's own words where you found them. If you cannot find an offer, your one
  question is what they sell and to whom.
- **Audience.** One buyer lane as structured filters: company industry, size and
  location; person function, seniority and current title. Resolve every value with
  `audienti audience options --kind KIND --q TEXT` and copy its `providerId`. Add one
  smart rule (`textCriteria`) only for what the filters cannot express: a single
  criterion a reviewer can answer true or false. See [audience definition](references/audience.md).
- **Premise.** Why these people, why now, in one sentence.
- **Approach.** One approach template and why it fits. Reuse one from
  `audienti approach list`, or draft one with the approach-design skill
  (`audienti skills show approach-design`).
- **Channels.** Only channels you can cover with accounts you reported.
- **Test length.** 30 days or a company cap, whichever comes first.
- **Success measure.** Meetings booked, the approach's goal stage.

Ask the owner in Audienti, not in chat: `audienti ask "QUESTION" --context "PROPOSAL"
--option "Go" --option "Change it"`. It shows as a card in Operator, and the answer
comes back to you as a task. Put this in the question and its context, in this order:

1. Who you are and what you will do (find and research the right people, draft
   outreach for review, keep Audienti current).
2. Your tools in one line, and what is missing as a fact ("No CRM is connected, so I
   will keep records only in Audienti").
3. The proposed campaign as a short card, marking what you inferred.
4. What you still need, at most two questions, which the owner can answer on the same card.
5. That nothing is sent without their approval.

Example shape, not fixed copy:

> I'm Arthur, your prospecting agent in Audienti. I find people who fit, research them
> and draft first messages for you to review. I can use Gmail (read, draft), LinkedIn
> through Composio, and web search. No CRM is connected, so records stay in Audienti.
>
> Proposed first test, 30 days:
> - Offer: Late-invoice recovery for logistics firms (from your website)
> - Audience: Finance function, Director and above, logistics companies, 51 to 500 staff, UK (region inferred from your last 20 sent emails)
> - Smart rule: The company runs its own truck or freight fleet
> - Premise: Freight rates fell, so cash collection is a board topic this quarter
> - Approach: Problem-led email, then LinkedIn follow-up
> - Success: meetings booked
>
> Two questions: is the UK the right first region, and is there a customer result I
> may cite? Answer "Go" to save it as a draft, or write your changes. Nothing is sent
> until you approve it.

## 3. Save the drafts and show five fits

When the owner answers (a **Read your owner’s answer** task in your queue):

1. Apply their changes. Save their words as they wrote them.
2. Create the records with fresh request IDs, reusing each ID if you retry:
   `audienti offer create`, `audienti audience create`, then `audienti campaign create`
   with the premise, approach, channels and `schedule.endAt`. The campaign starts in
   `Draft`. Nothing runs until the owner starts it. Over MCP, use `offer_create`, `audience_create` and
   `campaign_create`.
3. Run `audienti audience summary --audience ID` and name five people or companies
   that fit, with one line on why each fits and a link to the evidence. If you have no
   people-data tool, say so and show the audience filters instead.
4. Ask the owner with `audienti ask --campaign ID` to review it on the campaign page
   and start it. Starting moves it to `Preparing`, where signal tracking and prospect
   finding run; activating moves it to `Active`, where engagement runs too.
5. Offer the next step: draft first messages for the five fits once the campaign is
   active.

If a create call fails, say what happened in one sentence and what you will do next.
Do not retry with a new request ID.

## New ideas

When you or the owner have a new idea later, draft a new campaign, or a successor
(`audienti campaign successor ID`) that changes one thing: the approach, the offer or
the audience. Name what changed so the two tests can be compared. For a new approach,
follow the approach-design skill: save it as a new approach template so it can be
reused, then pin it to the successor.

## After getting started: work the queue

Once your tools are reported and a campaign exists, Audienti puts the daily work in
your queue: get a draft campaign ready to start, find new prospects (25 a day per campaign by default),
plan each prospect's next step, handle replies and send messages the owner approved.
On every run:

1. `audienti queue next --json`. `next` is the task to take now. If you already hold
   tasks, they are in `holding`; finish those first.
2. Claim it, do it with your own tools, following the task's steps and skill, and
   report it done or released.
3. `fleet` shows what other agents hold. Do not do their work. To hand off or ask for
   help, message them in a room (`audienti rooms send`).
4. `needsOtherTools` lists tasks no agent can take because no one reported the tools.
   Tell the owner which connector would unlock them.
5. When the queue is empty, poll again after `pollAfterSeconds`.

Never send anything to a prospect that the owner has not approved.

## When to run again

Run part 1 again whenever your tools change, and at least every seven days; the owner
sees the report as stale after that.
