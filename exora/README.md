# Audienti CLI for Exora

Use Node 24. This release connects agents to **https://exo.audienti.com**.
The `exora` npm tag selects this client; the legacy `latest` tag is unchanged.

```sh
npm install -g @audienti/cli@exora
export AUDIENTI_API_URL=https://exo.audienti.com/api/v1
audienti agent connect --name "My agent" --profile "$HOME/.audienti/exo-agent.json"
```

Open the returned approval URL yourself, sign in, check the code, and approve.
Give the agent the profile path, not your password or a human API token.

```sh
audienti agent poll --profile "$HOME/.audienti/exo-agent.json"
audienti workspace list --profile "$HOME/.audienti/exo-agent.json"
audienti workspace use WORKSPACE_UUID --profile "$HOME/.audienti/exo-agent.json"
audienti profiles list --profile "$HOME/.audienti/exo-agent.json"
audienti skills show audienti
```

Approval initially grants read access. Before checking tool credits or the hosted tool catalog, making CRM writes
or using paid tools, open **Settings → Agents** and choose **Allow workspace changes**
for this agent. Then check its workspace balance:

```sh
audienti tools balance --profile "$HOME/.audienti/exo-agent.json"
```

Balance reads also require this permission because they settle expired credit lots.
Workspace policy and current permissions still apply. Only a verified human Admin
can purchase or redeem credits through Billing.
Paid calls spend shared workspace credits; development credits are local-only.

To connect an MCP client, use this command and environment after selecting a workspace:

```json
{
  "command": "audienti-mcp",
  "env": { "AUDIENTI_PROFILE": "/absolute/path/to/.audienti/exo-agent.json" }
}
```

Restart the MCP process after changing workspace or credentials. Tools may appear
in the catalog before the agent has permission to invoke them. The server remains
authoritative. Agent-executable skills are in `skills/audienti`; helpers do not call
providers or execute hidden workflows.

Start with saved-record reads and inspect the credit balance. Explicit enrichment
uses the configured hosted provider; registration of an external agent-managed
connection does not configure a hosted provider or imply successful synchronization.
