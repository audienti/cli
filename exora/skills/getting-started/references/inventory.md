# Tool inventory format

Report what your runtime can use right now. One entry per connector or tool family.

```json
{
  "runtime": { "name": "Claude Code", "model": "claude-opus-5-5" },
  "entries": [
    { "category": "web_search", "name": "Web search", "access": ["read"], "status": "connected" },
    { "category": "email", "name": "Gmail", "access": ["read", "write", "send"], "status": "connected", "via": "Composio", "tools": ["gmail.search", "gmail.create_draft"] },
    { "category": "spreadsheet", "name": "Google Sheets", "access": ["read", "write"], "status": "connected" },
    { "category": "linkedin", "name": "LinkedIn", "access": ["read", "send"], "status": "connected", "via": "Composio" },
    { "category": "crm", "name": "Salesforce", "access": ["read"], "status": "needs_sign_in" },
    { "category": "scheduling", "name": "Routines", "access": ["write"], "status": "connected" }
  ]
}
```

## Fields

- `runtime.name`: your product or runtime as the owner knows it. `runtime.model` is
  optional.
- `category`: one of `web_search`, `web_browse`, `people_data`, `company_data`,
  `email`, `linkedin`, `social`, `crm`, `spreadsheet`, `docs`, `chat`, `calendar`,
  `tasks`, `files`, `code`, `scheduling`, `memory`, `other`.
- `name`: the connector name as the owner would recognize it (Gmail, HubSpot, Slack,
  X). At most 80 characters. One entry per category and name.
- `access`: any of `read`, `write`, `send`. `send` means it can deliver a message to
  another person (email, DM, post). Drafting is `write`.
- `status`: `connected` when you can call it now, `needs_sign_in` when it is installed
  but signed out, `unavailable` when it exists but fails.
- `via`: optional. How you reach it when it is not built in: an integration hub or
  aggregator such as Composio or Treg, or an MCP server name. Leave it out for native
  connectors built into your runtime.
- `tools`: optional tool IDs you would call, at most 16.

At most 64 entries and 32 KiB. Leave out anything you cannot call. Never include
account secrets, tokens or personal data about the owner's contacts.

## Categories, with examples

| Category | Examples |
| --- | --- |
| `web_search`, `web_browse` | built-in search, a browser, a fetch tool |
| `people_data`, `company_data` | enrichment or lookup providers |
| `email` | Gmail, Outlook |
| `linkedin`, `social` | LinkedIn seat tools, X, Reddit |
| `crm` | Salesforce, HubSpot, Attio |
| `spreadsheet`, `docs` | Google Sheets, Excel, Notion, Google Docs |
| `chat`, `calendar`, `tasks` | Slack, Google Calendar, Linear |
| `files`, `code` | file storage, a code or shell sandbox |
| `scheduling`, `memory` | routines, cron, saved memories |
