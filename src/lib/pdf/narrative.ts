import type { ScanResult, Tier, CategoryResult } from "../checks/types";

/**
 * Generate a 2-3 sentence executive summary narrative from scan results.
 * Rule-based: synthesizes tier combination and key findings into natural prose.
 */
export function generateNarrative(result: ScanResult): string {
  const tiers: Record<string, Tier> = {};
  const keyFindings: Record<string, string[]> = {};

  for (const cat of result.categories) {
    tiers[cat.category_id] = cat.tier;
    keyFindings[cat.category_id] = cat.checks
      .filter((c) => c.status === "pass")
      .map((c) => c.name);
  }

  const greenCount = result.categories.filter((c) => c.tier === "green").length;
  const redCount = result.categories.filter((c) => c.tier === "red").length;

  const parts: string[] = [];

  // Opening — overall posture
  if (greenCount >= 4) {
    parts.push(
      `${result.domain} is well-prepared for AI agent interaction, with ${greenCount} of 5 areas rated agent-ready.`
    );
  } else if (greenCount >= 2) {
    parts.push(
      `${result.domain} has a mixed agent-readiness posture, with ${greenCount} of 5 areas rated agent-ready and notable gaps in ${redCount > 0 ? redCount + " area" + (redCount > 1 ? "s" : "") : "several areas"}.`
    );
  } else if (greenCount === 1) {
    parts.push(
      `${result.domain} has limited agent-readiness, with only 1 of 5 areas rated agent-ready.`
    );
  } else {
    parts.push(
      `${result.domain} is not currently prepared for AI agent interaction. None of the 5 assessed areas meet the agent-ready threshold.`
    );
  }

  // Strengths
  const strengths = buildStrengths(result.categories);
  if (strengths) {
    parts.push(strengths);
  }

  // Weaknesses
  const weaknesses = buildWeaknesses(result.categories);
  if (weaknesses) {
    parts.push(weaknesses);
  }

  return parts.join(" ");
}

function buildStrengths(categories: CategoryResult[]): string {
  const greenCats = categories.filter((c) => c.tier === "green");
  if (greenCats.length === 0) return "";

  const descriptions: string[] = [];
  for (const cat of greenCats) {
    switch (cat.category_id) {
      case "discoverability":
        descriptions.push("strong agent discoverability through llms.txt, structured data, or MCP endpoints");
        break;
      case "comprehension":
        descriptions.push("well-documented API surface that agents can understand");
        break;
      case "usability":
        descriptions.push("low-friction programmatic access for agents");
        break;
      case "stability":
        descriptions.push("strong operational stability with versioning, changelogs, and security headers");
        break;
      case "agent-experience":
        descriptions.push("a positive first-contact experience for arriving agents");
        break;
    }
  }

  if (descriptions.length === 1) {
    return `Key strength: ${descriptions[0]}.`;
  }
  const last = descriptions.pop();
  return `Key strengths include ${descriptions.join(", ")}, and ${last}.`;
}

function buildWeaknesses(categories: CategoryResult[]): string {
  const redCats = categories.filter((c) => c.tier === "red");
  if (redCats.length === 0) return "";

  const descriptions: string[] = [];
  for (const cat of redCats) {
    const topFail = cat.checks.find((c) => c.status === "fail");
    switch (cat.category_id) {
      case "discoverability":
        descriptions.push(
          topFail
            ? `not discoverable by agents through standard protocols (${topFail.name.toLowerCase()} missing)`
            : "not discoverable by agents through standard protocols"
        );
        break;
      case "comprehension":
        descriptions.push("lacking machine-readable API documentation");
        break;
      case "usability":
        descriptions.push("presenting significant friction for programmatic interaction");
        break;
      case "stability":
        descriptions.push("missing key stability signals like API versioning or status pages");
        break;
      case "agent-experience":
        descriptions.push(
          topFail
            ? `providing a poor first-contact experience (${topFail.name.toLowerCase()})`
            : "providing a poor first-contact experience for arriving agents"
        );
        break;
    }
  }

  if (descriptions.length === 1) {
    return `The primary gap: ${result_domain_placeholder} is ${descriptions[0]}.`;
  }
  const last = descriptions.pop();
  return `Critical gaps: the product is ${descriptions.join(", ")}, and ${last}.`;
}

// We use a placeholder that gets replaced — cleaner than threading domain through all helpers
const result_domain_placeholder = "the product";
