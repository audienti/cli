# Campaign draft

Fill this before you ask the owner anything. Mark each value with where it came from:
`found` (quote or link), `inferred` (say from what) or `needed` (ask the owner).

| Field | Where it goes | How to fill it |
| --- | --- | --- |
| Offer: what you sell | Offer | Website, pitch deck, proposals, email signature. Owner's words. |
| Offer: problem it solves | Offer | Website, sent email, call notes. Owner's words. |
| Offer: proof point | Offer | Only a result or customer the owner already states publicly or confirms. |
| Company type, size, region | Audience filters | Current customers in the CRM or sent email; check values with `audience options`. |
| Buyer title and seniority | Audience filters | Who replies to the owner or signs deals. |
| Who to avoid | Do-not-contact list | Current customers, partners, competitors (`dnc add` or `dnc import`). |
| Premise | Campaign premise | One sentence: why these people, why now. |
| Approach | Campaign approach pin | One published approach from `approach list`, with one line on why. |
| Channels | Campaign channels | `email` and `linkedin`, only for accounts you reported. |
| Test length | Campaign `schedule.endAt`, `schedule.maxCompanies` | 30 days from activation, or a company cap. |
| Success measure | Approach goal stage | Meetings booked. |

Ask for at most two `needed` values in your first message. Fill the rest after the owner
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
| Next test | `audienti campaign successor ID --file CAMPAIGN.json --request-id UUID` | `campaign_successor` |

Run each command without arguments to see its fields, or read the API schema at
`/api/v1/openapi.json`.
