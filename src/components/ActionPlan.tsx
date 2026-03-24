import type { ScanResult, CheckResult, FixBlock } from "@/lib/checks/types";
import { getActionTitle } from "@/lib/checks/summaries";

interface ActionPlanProps {
  result: ScanResult;
  slug?: string;
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

export default function ActionPlan({ result, slug }: ActionPlanProps) {
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
    return null;
  }

  const jsonUrl = slug ? `/api/report/${slug}` : null;

  return (
    <div>
      <h2 className="text-[1.875rem] font-normal tracking-[-0.02em] leading-[2.25rem] text-foreground">
        Where agents get stuck
      </h2>
      <p className="mt-2 text-lg text-text-secondary mb-6">
        The highest-impact changes to improve agent access.
      </p>

      {/* AI fix callout */}
      <div className="flex items-center justify-between bg-[#F9FAFB] rounded-lg px-4 py-3 mb-5">
        <div>
          <p className="text-[13px] font-medium text-foreground">Using an AI coding tool?</p>
          <p className="text-[13px] text-text-secondary">
            Export your scan results and paste them into Claude or Cursor to generate the fixes. Then rescan.
          </p>
        </div>
        {jsonUrl && (
          <a
            href={jsonUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] text-[#185FA5] font-medium hover:underline whitespace-nowrap ml-4"
          >
            Export JSON
          </a>
        )}
      </div>

      <ol className="space-y-4">
        {topActions.map((action, i) => (
          <li key={action.check_id} className="flex gap-4">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-foreground text-background text-sm font-bold flex items-center justify-center mt-0.5">
              {i + 1}
            </span>

            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h3 className="font-semibold text-foreground">
                  {getActionTitle(action.check_id, action.name)}
                </h3>
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
                {action.fix ? action.fix.why : action.recommendation}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
