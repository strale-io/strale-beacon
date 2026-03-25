#!/usr/bin/env node

/**
 * Strale Beacon MCP Server
 *
 * Lets any AI agent scan URLs for agent-readiness directly from their workflow.
 * Wraps the Beacon scan API at scan.strale.io.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BEACON_API = "https://scan.strale.io";

// ─── Tier display ─────────────────────────────────────────────────────────

const TIER_ICON: Record<string, string> = {
  green: "●",
  yellow: "◐",
  red: "○",
};

const TIER_LABEL: Record<string, string> = {
  green: "Ready",
  yellow: "Partial",
  red: "Not Ready",
};

// ─── Static check list ────────────────────────────────────────────────────

const CHECKS_BY_CATEGORY = [
  {
    name: "Discoverability",
    question: "Can agents find you?",
    checks: [
      "llms.txt",
      "AI Crawler Policy",
      "Structured Data",
      "Sitemap & Crawlability",
      "MCP Server / A2A Agent Card",
      "Registry Presence",
    ],
  },
  {
    name: "Comprehension",
    question: "Can agents understand what you do?",
    checks: [
      "OpenAPI / Swagger Specification",
      "API Documentation Accessibility",
      "Description Specificity",
      "Endpoint Documentation Completeness",
      "Schema Drift Detection",
      "Machine-Readable Pricing",
      "Content Negotiation",
    ],
  },
  {
    name: "Usability",
    question: "Can agents interact with you?",
    checks: [
      "Authentication Documentation",
      "Signup Friction",
      "Sandbox / Test Environment",
      "Error Response Quality",
      "SDK & Integration Availability",
    ],
  },
  {
    name: "Stability",
    question: "Can agents depend on you?",
    checks: [
      "API Versioning",
      "Changelog & Status Signals",
      "Rate Limit Documentation",
      "Terms of Service — Agent Compatibility",
      "Security Basics",
      "Content Freshness Signals",
    ],
  },
  {
    name: "Agent Experience",
    question: "What happens when an agent shows up?",
    checks: [
      "First-Contact Response Quality",
      "Documentation Navigability",
      "Response Format Consistency",
      "Machine-Readable Support Paths",
      "MCP / A2A Functional Verification",
    ],
  },
  {
    name: "Transactability",
    question: "Can agents do business with you?",
    checks: [
      "Machine-readable pricing",
      "Self-serve provisioning",
      "Agent-compatible checkout",
      "Usage and billing transparency",
      "Free tier or trial available",
    ],
  },
];

// ─── Helper functions ─────────────────────────────────────────────────────

function domainToSlug(domain: string): string {
  return domain.toLowerCase().replace(/\./g, "-");
}

interface ScanCategory {
  category_id: string;
  label: string;
  question: string;
  tier: string;
  checks: Array<{
    check_id: string;
    name: string;
    status: string;
    finding: string;
    recommendation: string;
    fix?: {
      what: string;
      effort: string;
      impact: string;
    };
  }>;
}

interface ScanResult {
  domain: string;
  slug?: string;
  categories: ScanCategory[];
  scan_version: string;
  scanned_at: string;
}

function formatScanResults(data: ScanResult): string {
  const greenCount = data.categories.filter((c) => c.tier === "green").length;
  const total = data.categories.length;
  const slug = data.slug || domainToSlug(data.domain);

  const lines: string[] = [];

  lines.push(`Agent Readiness Report for ${data.domain}`);
  lines.push(`Score: ${greenCount}/${total} areas agent-ready`);
  lines.push("");
  lines.push("Categories:");

  for (const cat of data.categories) {
    const icon = TIER_ICON[cat.tier] || "?";
    const label = TIER_LABEL[cat.tier] || cat.tier;
    const summary = cat.checks
      .filter((c) => c.status === "pass")
      .map((c) => c.name)
      .slice(0, 3)
      .join(", ");
    const failSummary = cat.checks
      .filter((c) => c.status === "fail")
      .map((c) => c.name)
      .slice(0, 2)
      .join(", ");

    let detail = "";
    if (cat.tier === "green" && summary) {
      detail = ` — ${summary}`;
    } else if (cat.tier !== "green" && failSummary) {
      detail = ` — Missing: ${failSummary}`;
    }

    lines.push(`${icon} ${cat.label}: ${label}${detail}`);
  }

  // Top fixes
  const fixes: Array<{ name: string; effort: string; impact: string; category: string }> = [];
  for (const cat of data.categories) {
    for (const check of cat.checks) {
      if (check.status !== "pass" && check.fix) {
        fixes.push({
          name: check.fix.what,
          effort: check.fix.effort,
          impact: check.fix.impact,
          category: cat.label,
        });
      }
    }
  }
  // Sort: high impact first, low effort first
  const impactOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const effortOrder: Record<string, number> = { low: 0, medium: 1, high: 2 };
  fixes.sort(
    (a, b) =>
      (impactOrder[b.impact] || 0) - (impactOrder[a.impact] || 0) ||
      (effortOrder[a.effort] || 0) - (effortOrder[b.effort] || 0)
  );

  if (fixes.length > 0) {
    lines.push("");
    lines.push(`Top ${Math.min(fixes.length, 3)} fixes:`);
    for (let i = 0; i < Math.min(fixes.length, 3); i++) {
      const f = fixes[i];
      lines.push(`${i + 1}. ${f.name} (${f.effort} effort, ${f.impact} impact)`);
    }
  }

  lines.push("");
  lines.push(`Full report: ${BEACON_API}/results/${slug}`);
  lines.push(`JSON report: ${BEACON_API}/api/report/${slug}`);
  lines.push("");
  lines.push("---");
  lines.push("Powered by Strale Beacon (scan.strale.io)");
  lines.push("Built by Strale — trust and quality infrastructure for AI agents (strale.dev)");

  return lines.join("\n");
}

// ─── Server setup ─────────────────────────────────────────────────────────

const server = new McpServer({
  name: "strale-beacon",
  version: "1.0.0",
});

// Tool 1: scan
server.tool(
  "scan",
  "Scan a URL for AI agent readiness. Returns a detailed assessment across 6 categories: Discoverability, Comprehension, Usability, Stability, Agent Experience, and Transactability.",
  { url: z.string().describe("The URL to scan (e.g. https://api.strale.io or stripe.com)") },
  async ({ url }) => {
    try {
      const response = await fetch(`${BEACON_API}/api/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, force: false }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return {
          content: [
            {
              type: "text" as const,
              text: `Scan failed: ${(err as Record<string, string>).error || response.statusText}`,
            },
          ],
        };
      }

      const data = (await response.json()) as ScanResult;
      return {
        content: [{ type: "text" as const, text: formatScanResults(data) }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error scanning ${url}: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  }
);

// Tool 2: get_report
server.tool(
  "get_report",
  "Get a previously generated agent-readiness report for a domain. Returns the full structured report with all checks, findings, and fix recommendations.",
  { domain: z.string().describe("The domain to get the report for (e.g. api.strale.io)") },
  async ({ domain }) => {
    const slug = domainToSlug(domain.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));

    try {
      const response = await fetch(`${BEACON_API}/api/report/${slug}`);
      if (!response.ok) {
        if (response.status === 404) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No report found for ${domain}. Run a scan first with the 'scan' tool.`,
              },
            ],
          };
        }
        return {
          content: [
            { type: "text" as const, text: `Failed to fetch report: ${response.statusText}` },
          ],
        };
      }

      const report = await response.json();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(report, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching report: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  }
);

// Tool 3: list_checks
server.tool(
  "list_checks",
  "List all checks that Beacon runs, grouped by category. Useful for understanding what agent-readiness means and what specific signals are evaluated.",
  {},
  async () => {
    const lines: string[] = [];
    let totalChecks = 0;

    lines.push("Strale Beacon — Agent Readiness Checks");
    lines.push("=======================================");
    lines.push("");

    for (const cat of CHECKS_BY_CATEGORY) {
      lines.push(`${cat.name} — ${cat.question}`);
      for (const check of cat.checks) {
        lines.push(`  • ${check}`);
        totalChecks++;
      }
      lines.push("");
    }

    lines.push(`Total: ${totalChecks} checks across ${CHECKS_BY_CATEGORY.length} categories`);
    lines.push("");
    lines.push("Each category is rated: Ready (green), Partial (yellow), or Not Ready (red).");
    lines.push("Run a scan with the 'scan' tool to see how a specific domain scores.");
    lines.push("");
    lines.push("Learn more: https://scan.strale.io/about");

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  }
);

// ─── Start ────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
