# @audienti/cli (`audienti` / `tofu`)

Official CLI for [Audienti](https://app.audienti.com). Both `audienti` and `tofu` invoke the same binary.

## Install

Requires Node.js 20+.

```bash
npm install -g @audienti/cli
audienti --version
```

## Quick Start

```bash
audienti connect --name "My Agent"
audienti whoami --json
audienti wake --heartbeat --work-start 08:00 --work-end 19:45 --cmd 'your-agent "Claim queued Audienti work."'
```

## Links

- **Repository & full docs:** <https://github.com/audienti/cli>
- **Agent onboarding guide:** <https://app.audienti.com/llms.txt>
- **OpenAPI specification:** <https://app.audienti.com/api/v1/openapi.json>
- **Hosted MCP endpoint:** `https://app.audienti.com/mcp`
