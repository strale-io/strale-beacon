# Strale Beacon MCP Server

Scan any URL for AI agent readiness directly from your editor.

Beacon checks 34 signals across 6 categories and tells you exactly what AI agents can discover, understand, and do with a product — and what they can't.

## Install

### Claude Code

```bash
claude mcp add strale-beacon -- npx -y strale-beacon-mcp
```

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "strale-beacon": {
      "command": "npx",
      "args": ["-y", "strale-beacon-mcp"]
    }
  }
}
```

### Cursor

```bash
cursor mcp add strale-beacon -- npx -y strale-beacon-mcp
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "strale-beacon": {
      "command": "npx",
      "args": ["-y", "strale-beacon-mcp"]
    }
  }
}
```

## Tools

### `scan`

Scan a URL for AI agent readiness.

**Input:** `{ "url": "https://api.strale.io" }`

Returns a structured assessment with scores per category, key findings, and the top 3 highest-impact fixes.

### `get_report`

Get a previously generated report for a domain.

**Input:** `{ "domain": "api.strale.io" }`

Returns the full structured JSON report with all checks, probes, findings, and fix recommendations — designed for LLM-powered remediation.

### `list_checks`

List all checks that Beacon runs, grouped by category.

**Input:** none

Returns the complete list of 34 checks across 6 categories with descriptions.

## Usage examples

Ask your AI assistant:

- "Scan example.com for agent readiness"
- "How agent-ready is api.strale.io?"
- "What checks does Beacon run?"
- "Get the full report for stripe.com"
- "Scan my API and fix everything that's failing"

## What it checks

34 checks across 6 categories:

- **Discoverability** — llms.txt, robots.txt AI policy, structured data, sitemap, MCP/A2A endpoints, registry presence
- **Comprehension** — OpenAPI specs, documentation accessibility, description quality, endpoint completeness, schema drift, pricing data, content negotiation
- **Usability** — Auth docs, signup friction, sandbox/test environment, error responses, SDKs
- **Stability** — API versioning, changelogs, rate limits, ToS agent compatibility, security headers, content freshness
- **Agent Experience** — First-contact response, doc navigability, response consistency, support paths, MCP/A2A verification
- **Transactability** — Machine-readable pricing, self-serve signup, agent checkout, billing transparency, free tier

## Links

- **Beacon:** [scan.strale.io](https://scan.strale.io)
- **Strale:** [strale.dev](https://strale.dev) — trust and quality infrastructure for AI agents
- **Contact:** hello@strale.io
