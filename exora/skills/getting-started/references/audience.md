# Audience definition

The workspace Do not contact list is checked when people are found and before any research.

An audience is a set of structured filters plus one smart rule. Discovery and fit checks
read the structured filters first, so put everything you can into them. Free text is
only for the one test the filters cannot express.

An audience says **who** the buyer is: facts about the company and the person that stay
true for months. It never says **why now**. Hiring, funding, a new leader, a tool
change, a post or an intent to buy are events, and events are campaign signals (see
section 5). An audience with an event in it matches almost no one.

## 1. Pick one buyer lane

One audience describes one kind of buyer: one function at one seniority band, in one
kind of company. If the offer sells to two different buyers (for example finance and
operations), draft two audiences and two campaigns. Do not mix lanes in one audience.

Every audience sets `person.functions`. Seniority alone is not a lane: "all VPs" reaches
the VP of Finance and the VP of Engineering as well as the buyer. Pick the function that
owns the problem the offer solves and signs for it. For example, an outbound or SDR
agency sells to whoever owns pipeline: Sales, and Marketing when marketing owns
pipeline. Add `currentTitles` such as "VP of Sales" or "Chief Revenue Officer" when the
function is still too wide.

## 2. Resolve every value with `audience options`

Never type a value from memory. Look each one up and copy the `providerId` and `name`
the command returns:

```
audienti audience options --kind industries --q logistics
audienti audience options --kind sizes
audienti audience options --kind locations --q "United Kingdom"
audienti audience options --kind seniorities
audienti audience options --kind functions --q finance
audienti audience options --kind titles --q "head of finance"
```

Kinds: `industries`, `sizes`, `types`, `locations`, `seniorities`, `functions`, `titles`.
Over MCP, use `audience_options` with the same `kind`. Name industries one by one: new
audiences cannot add industry groups, because a group's industries do not match its name.

- Search ignores case. Several terms in one query ("freight and logistics", or a
  comma-separated list) return the matches for each term.
- An industry search matches the industry's own name, not the group it sits in:
  "logistics" returns the logistics industries, not airlines or rail.
- Company size comes in LinkedIn's bands. A range in `--q` ("100 to 1000", "500+",
  "under 50") returns every band it overlaps. Add all of them to `company.sizes`.
- `functions` is LinkedIn's fixed list of 26 job functions. It needs no Sales Navigator
  account.
- A title that is not in the list can be saved as typed, without a `providerId`.

## 3. Fill the template

```json
{
  "name": "Heads of finance, UK logistics, 51-500 staff",
  "company": {
    "industries": [{ "providerId": "ID", "name": "Logistics and Supply Chain" }, { "providerId": "ID", "name": "Package/Freight Delivery" }],
    "sizes": [{ "providerId": "ID", "name": "51-200" }, { "providerId": "ID", "name": "201-500" }],
    "locations": [{ "providerId": "ID", "name": "United Kingdom" }]
  },
  "person": {
    "functions": [{ "providerId": "ID", "name": "Finance" }],
    "seniorities": [{ "providerId": "ID", "name": "Director" }],
    "currentTitles": [{ "providerId": "ID", "name": "Head of Finance" }],
    "locations": [{ "providerId": "ID", "name": "United Kingdom" }]
  },
  "seniorityMatchMode": "at_least",
  "textCriteria": "The company runs its own truck or freight fleet.",
  "notes": "Region and size inferred from the user's last 20 sent emails; user confirmed in Operator."
}
```

- `seniorityMatchMode: "at_least"` matches the chosen seniority and higher.
- After saving, `audienti audience summary --audience ID` returns `sizes`: about how many
  people the included industries, functions and regions reach, against the 1,000-person
  minimum. Under 1,000, widen the industries, functions or regions.
- Use `negative: true` on a value to exclude it (for example a competitor's industry).
- `currentTitles` narrows the lane; keep it to the titles that buy, at most a few.

## 4. Write the smart rule (`textCriteria`)

The smart rule is one criterion that a reviewer can answer true or false from a
person's profile or company page. It covers only what the filters cannot express.

Good:

- "The company runs its own truck or freight fleet."
- "The person manages accounts receivable or credit control."
- "The company sells to hospitals."

Not allowed in the smart rule:

- Provenance: "inferred from…", "based on the website", "found in sent email".
- Hedges or open questions: "user to confirm", "probably", "maybe", "TBD".
- Values the filters already hold (industry, size, region, seniority, function, title).
- More than one test joined with "and" or "or". Pick the one that matters most.
- Events, timing or intent: "is hiring…", "recently raised…", "is considering…",
  "is looking for…", "just changed…". These are campaign signals (section 5).

Put provenance in `notes`. Put open questions to the user in Operator with
`audienti ask`, not in the audience.

Saving refuses a smart rule that states the company's size or an event, and says where
it belongs: size in `company.sizes`, events in a campaign signal.

Check the rule before you save: `audienti audience improve --text "RULE"` returns a
suggested rewrite when the rule is vague.

## 5. Audience or signal?

Ask of each condition: would it still be true of this company in six months?

| Condition | Where it goes |
| --- | --- |
| Sells B2B software; 51 to 500 staff; based in the US | Audience filters |
| Sells to hospitals; runs its own freight fleet | Audience smart rule |
| Owns pipeline or revenue (VP of Sales, CRO) | Audience `person.functions`, `seniorities`, `currentTitles` |
| Is hiring SDRs; is considering an outbound agency | Campaign signal |
| Raised a round this quarter; new VP of Sales in the last 90 days | Campaign signal |

A signal lives in the campaign's `signals` array. A `research` signal is a yes/no
question a researcher answers from public evidence such as job posts, news or the
company's site:

```json
{
  "signalMatch": "any",
  "signals": [{
    "id": "UUID",
    "kind": "research",
    "scope": "company",
    "question": "Is the company hiring SDRs or BDRs, or looking for an outbound agency?",
    "expected": true,
    "details": "Open SDR or BDR job posts, or a post asking for agency recommendations, in the last 90 days."
  }]
}
```

`signalMatch: "any"` lets a company qualify on any one signal; `"all"` needs every one.
A signal narrows who is worth contacting now; it never replaces the audience, so the
company and person still have to fit the audience.
