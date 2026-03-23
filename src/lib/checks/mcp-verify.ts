/**
 * MCP and A2A functional verification.
 *
 * Goes beyond file-exists detection: actually initiates an MCP session
 * using Streamable HTTP transport and verifies initialize + tools/list.
 * Also verifies A2A task endpoints respond to JSON-RPC.
 */

import type { CheckDefinition, CheckResult, ScanContext, Probe } from "./types";
import { beaconFetch } from "./fetch";

// ─── MCP Protocol Messages ───────────────────────────────────────────────────

function mcpInitialize() {
  return {
    jsonrpc: "2.0",
    method: "initialize",
    id: 1,
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: "StraleBeacon",
        version: "1.0",
      },
    },
  };
}

function mcpInitialized() {
  return {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  };
}

function mcpToolsList() {
  return {
    jsonrpc: "2.0",
    method: "tools/list",
    id: 2,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toProbe(
  url: string,
  method: string,
  result: { status: number; headers: Record<string, string>; body: string; error?: string }
): Probe {
  return {
    url,
    method,
    status: result.status || null,
    contentType: result.headers["content-type"] || null,
    snippet: result.body ? result.body.substring(0, 200) : null,
    error: result.error || null,
  };
}

/** POST a JSON-RPC request to an MCP endpoint */
async function mcpPost(
  url: string,
  body: unknown,
  sessionId?: string
): Promise<{
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  body: string;
  parsed: Record<string, unknown> | null;
  error?: string;
  isSSE: boolean;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "User-Agent": "StraleBeacon/1.0 (+https://scan.strale.io)",
    };
    if (sessionId) {
      headers["Mcp-Session-Id"] = sessionId;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const respHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      respHeaders[key.toLowerCase()] = value;
    });

    const contentType = respHeaders["content-type"] || "";
    const isSSE = contentType.includes("text/event-stream");
    const respBody = await response.text();

    let parsed: Record<string, unknown> | null = null;

    if (isSSE) {
      // Parse SSE stream for the JSON-RPC response
      const lines = respBody.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.substring(6).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            if (json.jsonrpc === "2.0" && (json.result !== undefined || json.error !== undefined)) {
              parsed = json;
              break;
            }
          } catch { /* skip non-JSON data lines */ }
        }
      }
    } else {
      try {
        parsed = JSON.parse(respBody);
      } catch { /* not valid JSON */ }
    }

    return {
      ok: response.ok,
      status: response.status,
      headers: respHeaders,
      body: respBody,
      parsed,
      isSSE,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      headers: {},
      body: "",
      parsed: null,
      error: message.includes("abort") ? "Timeout (10s)" : message,
      isSSE: false,
    };
  }
}

// ─── Main Handler ────────────────────────────────────────────────────────────

export async function checkMcpFunctional(
  ctx: ScanContext,
  check: CheckDefinition
): Promise<CheckResult> {
  const probes: Probe[] = [];
  const findings: string[] = [];
  let mcpOk = false;
  let a2aOk = false;
  let hasMcp = false;
  let hasA2a = false;

  // ── MCP Verification ──

  if (ctx.mcpEndpointUrl) {
    hasMcp = true;
    const mcpUrl = ctx.mcpEndpointUrl;

    // Step 1: Initialize
    const initResult = await mcpPost(mcpUrl, mcpInitialize());
    probes.push(toProbe(mcpUrl, "POST", initResult));

    if (!initResult.ok) {
      if (initResult.status === 401 || initResult.status === 403) {
        findings.push(
          `MCP: Endpoint at ${mcpUrl} requires authentication (HTTP ${initResult.status}). ` +
          `Beacon cannot verify without credentials, but the endpoint is responding to requests.`
        );
        mcpOk = true; // Partial — responding is good
      } else {
        findings.push(
          `MCP: Initialization failed at ${mcpUrl}. ` +
          `POST returned HTTP ${initResult.status}${initResult.error ? ` (${initResult.error})` : ""}. ` +
          `Agents attempting to connect will fail.`
        );
      }
    } else if (!initResult.parsed) {
      if (initResult.isSSE) {
        findings.push(
          `MCP: Endpoint at ${mcpUrl} uses SSE transport (text/event-stream). ` +
          `Could not parse a JSON-RPC response from the SSE stream. ` +
          `The endpoint responded (HTTP 200) but protocol verification was inconclusive.`
        );
        mcpOk = true; // Partial — server is alive
      } else {
        findings.push(
          `MCP: Endpoint at ${mcpUrl} returned HTTP 200 but response is not valid JSON-RPC. ` +
          `Body starts with: "${initResult.body.substring(0, 100)}..."`
        );
      }
    } else {
      // Validate JSON-RPC response
      const resp = initResult.parsed;
      if (resp.error) {
        const err = resp.error as Record<string, unknown>;
        findings.push(
          `MCP: Initialization returned JSON-RPC error: ${err.message || JSON.stringify(err)}. ` +
          `The server is reachable but rejected the initialize request.`
        );
      } else if (resp.result && typeof resp.result === "object") {
        const result = resp.result as Record<string, unknown>;
        const serverInfo = result.serverInfo as Record<string, unknown> | undefined;
        const serverName = serverInfo?.name || "unknown";
        const serverVersion = serverInfo?.version || "";
        const protocolVersion = result.protocolVersion || "unknown";
        const sessionId = initResult.headers["mcp-session-id"];

        // Step 2: Send initialized notification
        if (sessionId) {
          await mcpPost(mcpUrl, mcpInitialized(), sessionId);
          // Notification — no response expected, don't record probe
        }

        // Step 3: List tools
        const toolsResult = await mcpPost(mcpUrl, mcpToolsList(), sessionId);
        probes.push(toProbe(mcpUrl, "POST", toolsResult));

        let toolCount = 0;
        let toolNames: string[] = [];

        if (toolsResult.parsed?.result && typeof toolsResult.parsed.result === "object") {
          const toolsData = toolsResult.parsed.result as Record<string, unknown>;
          const tools = toolsData.tools;
          if (Array.isArray(tools)) {
            toolCount = tools.length;
            toolNames = tools
              .slice(0, 5)
              .map((t) => (t as Record<string, unknown>).name as string)
              .filter(Boolean);
          }
        } else if (toolsResult.isSSE) {
          // SSE for tools/list — server is working even if we can't parse count
          findings.push(
            `MCP: Session verified at ${mcpUrl}. Server: '${serverName}'${serverVersion ? ` v${serverVersion}` : ""} ` +
            `(protocol ${protocolVersion}). tools/list returned SSE stream — tool count not parsed.`
          );
          mcpOk = true;
        }

        if (toolCount > 0) {
          const preview = toolNames.length > 0 ? ` (${toolNames.join(", ")}${toolCount > 5 ? "..." : ""})` : "";
          findings.push(
            `MCP: Session verified at ${mcpUrl}. Server: '${serverName}'${serverVersion ? ` v${serverVersion}` : ""} ` +
            `(protocol ${protocolVersion}). tools/list returned ${toolCount} tool(s)${preview}. ` +
            `Session initializes correctly — agents can discover and use this MCP server.`
          );
          mcpOk = true;
        } else if (!mcpOk) {
          // Session initialized but tools/list returned nothing or failed
          findings.push(
            `MCP: Session initialized at ${mcpUrl}. Server: '${serverName}'${serverVersion ? ` v${serverVersion}` : ""}. ` +
            `But tools/list returned ${toolsResult.ok ? "empty result" : `HTTP ${toolsResult.status}`}. ` +
            `The server connects but has no tools available.`
          );
          mcpOk = true; // Initialize worked, partial credit
        }
      } else {
        findings.push(
          `MCP: Endpoint at ${mcpUrl} returned JSON-RPC but without a valid result object.`
        );
      }
    }
  }

  // ── A2A Verification ──

  if (ctx.a2aTaskUrl) {
    hasA2a = true;
    const a2aUrl = ctx.a2aTaskUrl;

    const a2aTestRequest = {
      jsonrpc: "2.0",
      method: "message/send",
      id: 1,
      params: {
        message: {
          role: "user",
          parts: [{ type: "text", text: "ping" }],
        },
      },
    };

    const a2aResult = await mcpPost(a2aUrl, a2aTestRequest);
    probes.push(toProbe(a2aUrl, "POST", a2aResult));

    if (a2aResult.status === 401 || a2aResult.status === 403) {
      findings.push(
        `A2A: Endpoint at ${a2aUrl} responds to JSON-RPC (HTTP ${a2aResult.status} — authentication required, which is expected).`
      );
      a2aOk = true;
    } else if (a2aResult.ok && a2aResult.parsed) {
      findings.push(
        `A2A: Endpoint at ${a2aUrl} responds to JSON-RPC (HTTP 200). Protocol is functional.`
      );
      a2aOk = true;
    } else if (a2aResult.ok) {
      findings.push(
        `A2A: Endpoint at ${a2aUrl} returned HTTP ${a2aResult.status} but response is not valid JSON-RPC.`
      );
    } else {
      findings.push(
        `A2A: Endpoint at ${a2aUrl} ${a2aResult.error ? a2aResult.error : `returned HTTP ${a2aResult.status}`}. ` +
        `Agents attempting A2A communication will fail.`
      );
    }
  }

  // ── No endpoints found ──

  if (!hasMcp && !hasA2a) {
    return {
      check_id: check.id,
      name: check.name,
      status: "pass",
      finding: "No MCP or A2A endpoints discovered — functional verification skipped. See the MCP/A2A discovery check.",
      recommendation: "",
      weight: check.weight,
      probes: [],
      detectionMethod: check.how_we_check,
      confidence: "high",
      foundButUnrecognized: false,
    };
  }

  // ── Score ──

  const finding = findings.join("\n");
  const anyOk = mcpOk || a2aOk;
  const allTested = (hasMcp ? mcpOk : true) && (hasA2a ? a2aOk : true);

  if (allTested && anyOk) {
    return {
      check_id: check.id,
      name: check.name,
      status: "pass",
      finding,
      recommendation: "",
      weight: check.weight,
      probes,
      detectionMethod: check.how_we_check,
      confidence: "high",
      foundButUnrecognized: false,
    };
  }

  if (anyOk) {
    return {
      check_id: check.id,
      name: check.name,
      status: "warn",
      finding,
      recommendation: check.recommendation,
      weight: check.weight,
      probes,
      detectionMethod: check.how_we_check,
      confidence: "high",
      foundButUnrecognized: false,
      fix: check.fix,
    };
  }

  return {
    check_id: check.id,
    name: check.name,
    status: "fail",
    finding,
    recommendation: check.recommendation,
    weight: check.weight,
    probes,
    detectionMethod: check.how_we_check,
    confidence: "high",
    foundButUnrecognized: false,
    fix: check.fix,
  };
}
