/**
 * Utility for extracting and categorizing links from JSON responses.
 *
 * Recursively walks a JSON object, finds all string values that look like URLs,
 * and categorizes them based on their key names and path context.
 */

export interface FoundLink {
  path: string;       // e.g., "documentation.quickstart"
  url: string;        // the URL value
  category: "documentation" | "changelog" | "status" | "pricing" | "support" | "other";
}

const CATEGORY_PATTERNS: Array<{ category: FoundLink["category"]; regex: RegExp }> = [
  { category: "documentation", regex: /doc|api[_-]?ref|reference|quickstart|guide|getting[_-]?started|developer/i },
  { category: "changelog", regex: /changelog|changes|release|update|version|what[_-]?s[_-]?new/i },
  { category: "status", regex: /status|health|uptime|incident|monitoring/i },
  { category: "pricing", regex: /pric|plan|billing|subscription|tier|cost/i },
  { category: "support", regex: /support|help|contact|feedback|issue|bug|report/i },
];

function categorizeKey(key: string, path: string): FoundLink["category"] {
  const combined = `${path}.${key}`.toLowerCase();
  for (const { category, regex } of CATEGORY_PATTERNS) {
    if (regex.test(combined)) return category;
  }
  return "other";
}

/**
 * Recursively extract all URL values from a JSON object and categorize them.
 */
export function extractLinksFromJson(obj: unknown, parentPath = ""): FoundLink[] {
  const links: FoundLink[] = [];
  if (!obj || typeof obj !== "object") return links;

  const entries = Array.isArray(obj)
    ? obj.map((v, i) => [String(i), v] as const)
    : Object.entries(obj as Record<string, unknown>);

  for (const [key, value] of entries) {
    const currentPath = parentPath ? `${parentPath}.${key}` : key;

    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      links.push({
        path: currentPath,
        url: value,
        category: categorizeKey(key, parentPath),
      });
    } else if (typeof value === "object" && value !== null) {
      links.push(...extractLinksFromJson(value, currentPath));
    }
  }

  return links;
}

/** Filter links to a specific category */
export function linksByCategory(links: FoundLink[], category: FoundLink["category"]): FoundLink[] {
  return links.filter((l) => l.category === category);
}
