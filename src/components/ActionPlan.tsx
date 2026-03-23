import type { ScanResult, CheckResult } from "@/lib/checks/types";

interface ActionPlanProps {
  result: ScanResult;
}

const WEIGHT_PRIORITY: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export default function ActionPlan({ result }: ActionPlanProps) {
  // Extract all failed checks across categories, sorted by weight
  const failedChecks: Array<CheckResult & { category: string }> = [];

  for (const cat of result.categories) {
    for (const check of cat.checks) {
      if (check.status === "fail" && check.recommendation) {
        failedChecks.push({ ...check, category: cat.label });
      }
    }
  }

  // Sort by weight (high first), then by category order
  failedChecks.sort(
    (a, b) => (WEIGHT_PRIORITY[b.weight] || 0) - (WEIGHT_PRIORITY[a.weight] || 0)
  );

  // Take top 5
  const topActions = failedChecks.slice(0, 5);

  if (topActions.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-lg font-medium text-tier-green">
          No critical issues found — your product is well-prepared for AI agents.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-foreground mb-1">Prioritized Action Plan</h2>
      <p className="text-sm text-text-secondary mb-6">
        The highest-impact fixes to improve your agent-readiness, ranked by importance.
      </p>

      <ol className="space-y-4">
        {topActions.map((action, i) => (
          <li key={action.check_id} className="flex gap-4">
            {/* Number */}
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand text-white text-sm font-bold flex items-center justify-center mt-0.5">
              {i + 1}
            </span>

            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h3 className="font-semibold text-foreground">{action.name}</h3>
                <span className="text-xs text-text-muted px-1.5 py-0.5 bg-muted rounded">
                  {action.category}
                </span>
              </div>
              <p className="mt-1 text-sm text-text-secondary">{action.recommendation}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* Strale CTA */}
      <div className="mt-8 p-5 bg-brand-light rounded-lg border border-border">
        <p className="text-foreground font-medium">
          Beacon shows you where you stand. Strale helps you get there.
        </p>
        <p className="mt-2 text-sm text-text-secondary">
          List your capabilities on Strale&apos;s marketplace and become accessible to agents today.
        </p>
        <a
          href="https://strale.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
        >
          Explore Strale →
        </a>
      </div>
    </div>
  );
}
