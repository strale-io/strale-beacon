import type { ScanResult, CheckResult, FixBlock } from "@/lib/checks/types";

interface ActionPlanProps {
  result: ScanResult;
}

/** Priority score: higher = do first. High impact + low effort = best. */
function priorityScore(fix: FixBlock): number {
  const impactScore = { high: 30, medium: 20, low: 10 }[fix.impact];
  const effortPenalty = { low: 0, medium: 10, high: 25 }[fix.effort];
  return impactScore - effortPenalty;
}

const EFFORT_COLORS: Record<string, string> = {
  low: "bg-tier-green-light text-tier-green-text",
  medium: "bg-tier-yellow-light text-tier-yellow-text",
  high: "bg-tier-red-light text-tier-red-text",
};

export default function ActionPlan({ result }: ActionPlanProps) {
  const actionItems: Array<CheckResult & { category: string; score: number }> = [];

  for (const cat of result.categories) {
    for (const check of cat.checks) {
      if (check.status === "pass") continue;
      if (!check.recommendation && !check.fix) continue;
      const score = check.fix ? priorityScore(check.fix) : ({ high: 3, medium: 2, low: 1 }[check.weight] || 0);
      actionItems.push({ ...check, category: cat.label, score });
    }
  }

  actionItems.sort((a, b) => b.score - a.score);
  const topActions = actionItems.slice(0, 5);

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
        The highest-impact, lowest-effort fixes to improve your agent-readiness.
      </p>

      <ol className="space-y-4">
        {topActions.map((action, i) => (
          <li key={action.check_id} className="flex gap-4">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand text-white text-sm font-bold flex items-center justify-center mt-0.5">
              {i + 1}
            </span>

            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h3 className="font-semibold text-foreground">{action.name}</h3>
                <span className="text-xs text-text-muted px-1.5 py-0.5 bg-muted rounded">
                  {action.category}
                </span>
                {action.fix && (
                  <>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${EFFORT_COLORS[action.fix.effort]}`}>
                      {action.fix.effort} effort
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${EFFORT_COLORS[action.fix.impact === "high" ? "low" : action.fix.impact === "low" ? "high" : "medium"]}`}>
                      {action.fix.impact} impact
                    </span>
                  </>
                )}
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                {action.fix ? action.fix.what : action.recommendation}
              </p>
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
          className="inline-block mt-3 px-4 py-2 bg-foreground text-background text-sm font-medium rounded-[4px] hover:bg-interactive-hover transition-colors"
        >
          Explore Strale →
        </a>
      </div>
    </div>
  );
}
