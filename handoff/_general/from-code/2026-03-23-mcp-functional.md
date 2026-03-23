# MCP and A2A Functional Verification

**Intent:** Verify that discovered MCP servers and A2A endpoints actually work, not just that the discovery files exist.

## MCP protocol flow implemented

1. **Initialize** — POST JSON-RPC `method: "initialize"` with protocolVersion, capabilities, clientInfo
2. **Validate response** — check for jsonrpc 2.0, result with serverInfo, protocolVersion, capabilities
3. **Extract session ID** — from `Mcp-Session-Id` response header
4. **Send initialized notification** — required by MCP spec before tools/list
5. **tools/list** — POST JSON-RPC `method: "tools/list"` with session ID
6. **Count and report tools** — show first 5 tool names

## SSE handling

MCP Streamable HTTP can respond with `text/event-stream`. The handler parses SSE data lines for JSON-RPC responses. If SSE parsing fails, it reports that the server responded (HTTP 200 with SSE) but tool count couldn't be determined — still counts as partial pass.

## A2A verification

Posts a minimal `message/send` JSON-RPC request to the A2A task URL from the Agent Card. Accepts 401/403 as pass (endpoint responds to protocol, just needs auth). Only fails if endpoint returns 404/500 or times out.

## ScanContext changes

Added to ScanContext (types.ts):
- `mcpEndpointUrl`: MCP server URL (from manifest or default /mcp)
- `mcpManifest`: parsed /.well-known/mcp.json
- `a2aCardUrl`: URL of the Agent Card
- `a2aCard`: parsed Agent Card object
- `a2aTaskUrl`: A2A task endpoint from card's `url` field

Updated disc-mcp-a2a handler to populate these fields during discovery.

## Scoring

MCP functional pass is a strong positive for Agent Experience — can contribute to green tier alongside first-contact and doc-navigability.

## Test results

| Domain | MCP | A2A | Result |
|---|---|---|---|
| api.strale.io | Server 'strale' v0.1.0, 8 tools | HTTP 200, functional | pass |
| strale.dev | /mcp returns HTML (frontend catch-all) | — | warn |
| example.com | No endpoint discovered | — | pass (skipped) |

## Performance

Adds 2-3 HTTP POST requests per scan when MCP/A2A endpoints exist. ~1-2 seconds total. No impact when no endpoints are discovered.

## What's next

- Could parse tool schemas from tools/list to assess tool documentation quality
- Could verify individual tool execution with safe read-only tools
- Could check for resources/list and prompts/list (other MCP capabilities)
