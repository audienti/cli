# Campaign draft

Fill this before you ask the user anything. Mark each value with where it came from:
`found` (quote or link), `inferred` (say from what) or `needed` (ask the user).

| Field | Where it goes | How to fill it |
| --- | --- | --- |
| Offer: what you sell | Offer | Website, pitch deck, proposals, email signature. User's words. |
| Offer: problem it solves | Offer | Website, sent email, call notes. User's words. |
| Offer: proof point | Offer | Only a result or customer the user already states publicly or confirms. |
| Company type, size, region | Audience filters | Current customers in the CRM or sent email; check values with `audience options`. |
| Buyer function, seniority and title | Audience filters | The function that owns the problem the offer solves, then who replies to the user or signs deals. Always set a function. |
| Who to avoid | Do-not-contact list | Current customers, partners, competitors (`dnc add` or `dnc import`). |
| Signals | Campaign `signals` | At least one. Events that make a company worth contacting now: hiring for a role, funding, a new leader, a tool change. Each one is a yes/no `research` question ([audience definition](audience.md) section 5). Never put these in the audience. |
| Premise | Campaign premise | One sentence: why these people, why now. It names the signal and why the signal means they need the offer. |
| Playbook | Campaign playbook pin | One playbook from `playbook list`, or a new one drafted with the playbook-design skill, with one line on why. When the list returns a `recommendation`, start from that starter playbook and name it with its `reason` in one line. |
| Channels | Campaign channels | `email` and `linkedin`, only for accounts you reported. |
| Pace | Campaign pace | New people a day. Take the number and its reason from the **Pace line** in your queue task for the channels you propose: 25 a day per confirmed LinkedIn account, or the campaign's own number (50 by default) for email only. Write it as `Pace: 25 a day · 1 LinkedIn account · about 100 people a week`. Once the campaign is saved, `audienti campaign pace ID` returns its own line: use that line, so the card and the campaign page show the same number. The user can change it in their answer. |
| Test length | Campaign `schedule.endAt`, `schedule.maxCompanies` | 30 days from activation or a company cap, whichever comes first. |
| Success measure | Playbook goal stage | Meetings booked. |
| Waits | Playbook step `wait` | What each step waits for (`accept`, `reply`, `meeting` or `timeout`) and for how many days; their sum fits the test length. A wait starts only when the agent reports a succeeded result for the plan action that carries the step's key as `playbookStepKey`, and any reply ends every wait (playbook-design `references/fields.md`). |

## Signals: the through line

Prospect finding starts from signals: they find the companies that need the offer
today. A campaign with no signal, no target companies and no finding instructions cannot
start, so every signal campaign you draft has at least one signal. When the user already
has the people, or a source Audienti does not have, draft a custom campaign instead:
`method: "custom"`, finding instructions in the user's words and no signals. A signal is not "they might want to buy". It is an
observable event that shows a company has the problem the offer solves, now. Build the
line in this order:

1. **Offer**: what it solves. "An outbound agency books meetings for B2B software teams."
2. **Problem**: who has it. "The company needs pipeline and has no working outbound team."
3. **Signal**: the event that shows the problem today. "The company is hiring SDRs or
   BDRs": it has decided to invest in outbound but does not have the team yet.
4. **Premise**: one sentence that joins them. "Companies hiring their first SDRs need
   pipeline before the hires ramp; the agency books meetings in weeks."

If you cannot name the event that shows the problem, ask the user what tells them a
company needs the offer now. Do not leave the signals empty.

Ask for at most two `needed` values in your first message. Fill the rest after the user
replies.

Name the campaign after the buyer and the test, for example "Heads of finance,
logistics UK, problem-led email". When a later test changes one thing, say which in the
name or notes.

## Mapping to records

| Draft part | Command | MCP tool |
| --- | --- | --- |
| Offer | `audienti offer create --file OFFER.json --request-id UUID` | `offer_create` |
| Audience | `audienti audience create --file AUDIENCE.json --request-id UUID` | `audience_create` |
| Campaign | `audienti campaign create --file CAMPAIGN.json --request-id UUID` | `campaign_create` |
| Pace | `audienti campaign pace ID --per-day derived`, or `--per-day N` with the user's number | `campaign_pace_set` |
| Next test | `audienti campaign successor ID --file CAMPAIGN.json --request-id UUID` | `campaign_successor` |

Read each command's request fields in the API schema at `/api/v1/openapi.json`
(search for the MCP tool name above). A campaign also needs the `audienceRevision`
and `offerRevision` returned when you saved the audience and offer.

## Example proposal

The shape of a first proposal, not fixed copy:

> I'm Arthur, your prospecting agent in Audienti. I find people who fit, research them
> and draft first messages for you to review. I can use Gmail (read, draft), LinkedIn
> through Composio, and web search. No CRM is connected, so records stay in Audienti.
> Proposed first test, 30 days. Offer: late-invoice recovery for logistics firms (from
> your website). Audience: finance function, Director and above, logistics companies,
> 51 to 500 staff, UK (region inferred from your last 20 sent emails). Smart rule: the
> company runs its own truck or freight fleet. Signal: the company is hiring a credit
> controller or accounts receivable clerk. Premise: a company hiring for collections
> has late invoices piling up now, and recovery gets cash back faster than a new hire. Playbook: problem-led email, then LinkedIn
> follow-up. Pace: 25 a day · 1 LinkedIn account · about 100 people a week. Success:
> meetings booked. Two questions: is the UK the right first region, and is there a
> customer result I may cite? Answer "Go" to save it as a draft, or write your changes.
> Nothing is sent until you approve it.
