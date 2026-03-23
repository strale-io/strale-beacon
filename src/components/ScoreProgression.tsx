import type { Tier, CategoryResult } from "@/lib/checks/types";

const TIER_LABELS: Record<Tier, string> = {
  green: "Ready",
  yellow: "Partial",
  red: "Not Ready",
};

const TIER_ORDER: Record<Tier, number> = { red: 0, yellow: 1, green: 2 };

interface ScoreProgressionProps {
  categories: CategoryResult[];
  previousTiers: Record<string, string>;
  previousScannedAt: string;
}

export default function ScoreProgression({
  categories,
  previousTiers,
  previousScannedAt,
}: ScoreProgressionProps) {
  const prevDate = new Date(previousScannedAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const prevGreen = Object.values(previousTiers).filter((t) => t === "green").length;
  const currGreen = categories.filter((c) => c.tier === "green").length;
  const total = categories.length;

  const improvements: string[] = [];
  const regressions: string[] = [];

  for (const cat of categories) {
    const prev = previousTiers[cat.category_id] as Tier | undefined;
    if (!prev) continue;
    const curr = cat.tier;
    if (prev === curr) continue;

    const improved = TIER_ORDER[curr] > TIER_ORDER[prev];
    const label = `${cat.label} (${TIER_LABELS[prev]} → ${TIER_LABELS[curr]})`;
    if (improved) {
      improvements.push(label);
    } else {
      regressions.push(label);
    }
  }

  const hasChanges = improvements.length > 0 || regressions.length > 0;

  return (
    <div className="text-center mb-6 px-4 py-3 rounded-lg bg-surface border border-border">
      <p className="text-xs text-text-muted mb-1">
        Previous scan: {prevDate} · {prevGreen}/{total} Ready → {currGreen}/{total} Ready
      </p>

      {!hasChanges && (
        <p className="text-xs text-text-muted">No tier changes since last scan</p>
      )}

      {improvements.length > 0 && (
        <p className="text-xs text-tier-green-text">
          {improvements.map((imp) => `↑ ${imp}`).join("  ·  ")}
        </p>
      )}

      {regressions.length > 0 && (
        <p className="text-xs text-tier-red-text">
          {regressions.map((reg) => `↓ ${reg}`).join("  ·  ")}
        </p>
      )}
    </div>
  );
}
