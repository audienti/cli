# Audience definition

An audience is a set of structured filters plus one smart rule. Discovery and fit checks
read the structured filters first, so put everything you can into them. Free text is
only for the one test the filters cannot express.

## 1. Pick one buyer lane

One audience describes one kind of buyer: one function at one seniority band, in one
kind of company. If the offer sells to two different buyers (for example finance and
operations), draft two audiences and two campaigns. Do not mix lanes in one audience.

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

Kinds: `industries`, `industry_groups`, `sizes`, `types`, `locations`, `seniorities`,
`functions`, `titles`. Over MCP, use `audience_options` with the same `kind`.

## 3. Fill the template

```json
{
  "name": "Heads of finance, UK logistics, 51-500 staff",
  "company": {
    "industries": [{ "providerId": "ID", "name": "Transportation, Logistics, Supply Chain and Storage" }],
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
  "notes": "Region and size inferred from the owner's last 20 sent emails; owner confirmed in Operator."
}
```

- `seniorityMatchMode: "at_least"` matches the chosen seniority and higher.
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
- Hedges or open questions: "owner to confirm", "probably", "maybe", "TBD".
- Values the filters already hold (industry, size, region, seniority, title).
- More than one test joined with "and" or "or". Pick the one that matters most.

Put provenance in `notes`. Put open questions to the owner in Operator with
`audienti ask`, not in the audience.

Check the rule before you save: `audienti audience improve --text "RULE"` returns a
suggested rewrite when the rule is vague.
