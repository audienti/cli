# Audienti outbound methodology — agent brief

You are running outbound experiments in Audienti for this account. Read this before you create, change, or judge any experiment. The CLI calls the same records motions; `plays`, `experiments`, and `experiment` are aliases for `motions`.

## The rule above all rules

The customer is the boss. You do not decide what the market wants; you run experiments that let the market tell you. Never start an experiment without a written baseline, target, and scheduled review date.

## What an experiment is

experiment = premise + approach + cadence + verdict. Change the trigger, ICP (ideal customer profile), offer, or value chain and it is a new experiment, not an edit.

Kinds:

- outbound/informant: first contact spreads across several people at a signal account, soldiers and generals, to find who becomes the informant. Default.
- outbound/owner-first: straight to the commercial owner. Exception; justify it.
- inbound: own-post engagement + LinkedIn inbound on a signal list. Supplements informants.
- transition: holding surface for existing people (network reactivation, podcast guests, owner changes). Finds no one new; never counts toward volume targets.
- lopa: Competitor Tracking only.

The CLI `kind` is `outbound`, `inbound`, `transition`, or `lopa`. Informant and owner-first describe the outbound strategy; they are not additional `kind` values.

## Premise

Write it in two sentences: job, person, friction, solution, benefit, outcome. The premise picks the signals. A signal finds people who can confirm the premise; it is not proof of pain or intent. A job post earns an account a place on the list, nothing more. Never invent a signal match.

## Approach — pick one mode and declare it

**validating:** open on their signal in their words. Ask, listen. No product, no price, no diagnostic. Stop when you have one sentence you can take to the owner.

**gifting (in development):** open directly with a disproportionate, proprietary give to a high-value person so reciprocity earns the meeting. Choose the gift from the gift shelf. If a gift is selected, lead with it; the selected proprietary gift may replace the vendor-landscape rung on first contact. The gift's value is itself under test. Prefer skills (they do the work) over reports (they explain the work).

The default offer ladder, in order: vendor landscape → reciprocity asset → diagnostic → meeting request. Apart from the selected-gift exception, never skip a rung on first contact. A diagnostic is a sales step, not a gift: to the prospect it reads as a pitch, so it is hard for them to see value in it. It comes only after interest, never on first contact. If you want to give insight up front, make it a gift that stands on its own, such as a skill or a finding about their account that they keep with no call attached.

For website-only research into possible gifts, run `audienti tools gift-research --url <website>`. That command gives the agent a research skill. It does not scan through the app or create a gift on the gift shelf.

## How you get in

Target wide, not just the top. At each account reach both soldiers (the people who do the work and feel the friction) and generals (the leaders who own the outcome). Do not lead too narrowly at the top of the org chart. Informant is a role you discover in conversation, not a title you guess in advance: whoever gives you the internal story is the informant. Either approach, validating or gifting, can open on soldiers or generals.

premise → signals → informant → champion → buyer → sale → evidence.

- informant: confirms need, premise, internal story, why now.
- champion: says why this, why us.
- buyer: only once you can use the informant's words.

LinkedIn is not a sequence and not cold email. A human reviews messages before they go out. Review every stage-changing conversation within 24 hours and carry one change forward.

## Cadence

Use the account's own settings if set. Defaults:

- A qualified connection request goes to someone who fits the customer profile and the role, whether or not they show a signal. Signals decide priority and the opening line; they are not required for a request to count.
- About 20 qualified connection requests per participating sender profile per weekday (about 100 per profile per week).
- Check mid-week that each profile is at half its weekly target.
- Withdraw requests after 21 days.
- Respect stage time limits (`audienti analytics stages`).

Volume guidance does not override account limits, platform controls, provider execution gates, or human message review. Reading this brief does not authorize sending, withdrawing requests, or changing an account.

## Default funnel rates

Use the account's own rates if set. These are starting defaults from [Audienti's performance model](https://audienti.com/performance-model/), not targets. Replace each with the account's measured rate once it has enough data.

| Stage | Default | Definition |
| --- | --- | --- |
| Prospect coverage | 78% | Identified prospects the team can actually work |
| Signal | 10% | Posts/comments found that become a valid prospect |
| Connect | 30% | Sent connection requests that are accepted |
| Engage | 20% | Connected prospects that reply, react, or engage |
| Meeting | 21% | Engaged prospects that convert to a meeting |
| Show | 75% | Booked meetings that are held |
| Accepted opportunity | 60% | Held meetings accepted by the sales team |

Judge an experiment by comparing its stage rates to these or the account's own. The first matured stage below its rate is the constraint to work on. Read the analytics numerator and denominator definitions before comparing rates; do not substitute a different metric because it has a similar name.

## Review and verdict

Schedule a review date before starting. On that date, judge each stage only once its cohort has matured: connect rate after requests are 21 days old, engage rate after connections have aged, and so on down the funnel. A cohort is the group that entered the same stage during the same period. Early stages can get a verdict while later ones are still maturing. For an immature stage, record **insufficient evidence** and the next review date; the calendar date alone never makes it eligible for a verdict. Stop immediately for brand risk.

Default thresholds; use the account's own if set:

- **kill:** 0 replies after 25 qualified executions, more than 10% negative, wrong persona replying, or brand risk. Mark complete with a reason; do not revive blindly. In CLI terms, archive the motion and retain the reason in the written experiment record; there is no `complete` status.
- **change:** one variable per round; wait at least 10 executions before judging.
- **promote:** stage rates at or above the default or account rate, replies from the ICP, and at least one follow-on conversation. Then climb the offer ladder, add volume with identical copy, or clone and change one variable. If you cannot name the single variable you are changing and why, kill it.

Define what a qualified execution means, the denominator for negative responses, and the maturity window for each later stage in the written experiment record before using these thresholds. If the account settings do not answer those questions, ask the account owner; do not guess. Missing definitions or missing data are insufficient evidence, not zero results.

Keep the written baseline, target, scheduled review date, premise, declared approach, cadence, evidence, changed variable, and verdict reason together in a durable record. Inspect supported payload fields before saving; this brief does not add baseline or verdict fields to the motion API.

## What counts

The goal is qualified meetings that become opportunities. Qualified = ICP match, a decision-maker or champion, an accepted agenda, and the meeting is held. Success = the sales team accepts it as an opportunity.

Booking a no-show or an irrelevant meeting is a cost, not a win: it wastes the effort to book it and the time to hold it. Do not optimize for meetings booked. Informant chats, job-post-only meetings, positive replies, and booked-but-not-held meetings do not count as qualified meetings or accepted opportunities.

## Check your work (read-only)

```bash
audienti motions list
audienti motions show <id>
audienti motions analytics <id>
audienti analytics metrics --cohort-preset week-to-date
audienti analytics stages --interval weekly
```

Week-to-date metrics show current activity; they do not by themselves prove a cohort is mature. Use experiment filters and explicit cohort dates when needed for a verdict.

## When unsure

If the account's settings or this guide do not answer it, ask the account owner. Do not guess.
