import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import type { CheckDefinition, CategoryDefinition, CheckRegistry } from "./types";

interface RawCheck {
  id: string;
  name: string;
  check_type: string;
  paths?: string[];
  weight: string;
  description: string;
  how_we_check?: string;
  recommendation: string;
  mvp?: boolean;
  strale_api_checks?: string[];
  added: string;
  last_reviewed: string;
}

interface RawCategory {
  label: string;
  question: string;
  checks: RawCheck[];
  thresholds: {
    green: string;
    yellow: string;
    red: string;
  };
}

interface RawRegistry {
  version: string;
  last_updated: string;
  categories: Record<string, RawCategory>;
}

let cachedRegistry: CheckRegistry | null = null;

function loadRegistryFromDisk(): CheckRegistry {
  const registryPath = path.join(process.cwd(), "check-registry.yaml");
  const raw = fs.readFileSync(registryPath, "utf-8");
  const parsed = yaml.load(raw) as RawRegistry;

  const categories: CategoryDefinition[] = Object.entries(parsed.categories).map(
    ([id, cat]: [string, RawCategory]) => ({
      id,
      label: cat.label,
      question: cat.question,
      thresholds: cat.thresholds,
      checks: cat.checks.map(
        (check: RawCheck): CheckDefinition => ({
          id: check.id,
          name: check.name,
          check_type: check.check_type,
          paths: check.paths,
          weight: check.weight as CheckDefinition["weight"],
          description: check.description,
          how_we_check: check.how_we_check || check.description,
          recommendation: check.recommendation,
          mvp: check.mvp !== false,
          strale_api_checks: check.strale_api_checks,
          added: check.added,
          last_reviewed: check.last_reviewed,
        })
      ),
    })
  );

  return {
    version: parsed.version,
    last_updated: parsed.last_updated,
    categories,
  };
}

/** Returns the full check registry with all checks (including non-MVP). */
export function getFullRegistry(): CheckRegistry {
  if (!cachedRegistry) {
    cachedRegistry = loadRegistryFromDisk();
  }
  return cachedRegistry;
}

/** Returns only MVP checks, filtering out v2 features. */
export function getCheckRegistry(): CheckRegistry {
  const full = getFullRegistry();
  return {
    ...full,
    categories: full.categories.map((cat) => ({
      ...cat,
      checks: cat.checks.filter((check) => check.mvp),
    })),
  };
}

/** Reset the cache (useful for testing or hot-reload). */
export function resetRegistryCache(): void {
  cachedRegistry = null;
}
