import type { ScanResult, CheckResult, FixBlock } from "@/lib/checks/types";
import { getActionTitle } from "@/lib/checks/summaries";

interface ActionPlanProps {
  result: ScanResult;
  slug?: string;
}

function priorityScore(fix: FixBlock): number {
  const impactScore = { high: 30, medium: 20, low: 10 }[fix.impact];
  const effortPenalty = { low: 0, medium: 10, high: 25 }[fix.effort];
  return impactScore - effortPenalty;
}

const EFFORT_PILL: Record<string, string> = {
  low: "bg-[#DCFCE7] text-[#15803D]",
  medium: "bg-[#FEF3C7] text-[#B45309]",
  high: "bg-[#FEE2E2] text-[#B91C1C]",
};

const IMPACT_PILL: Record<string, string> = {
  high: "bg-[#DBEAFE] text-[#1E40AF]",
  medium: "bg-[#FEF3C7] text-[#B45309]",
  low: "bg-[#F3F4F6] text-[#4B5563]",
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
  const isPerfect = topActions.length === 0;
  const jsonUrl = slug ? `/api/report/${slug}` : null;

  return (
    <div>
      <h2 className="text-[1.875rem] font-normal tracking-[-0.02em] leading-[2.25rem] text-foreground">
        {isPerfect ? "Why agents trust you" : "Where agents get stuck"}
      </h2>
      <p className="mt-2 text-lg text-text-secondary mb-6">
        {isPerfect
          ? "What you're doing right — and how to stay ahead."
          : "The highest-impact changes to improve agent access."}
      </p>

      {isPerfect ? (
        <p className="text-[15px] text-[#15803D] font-medium">
          All checks passing — your product is fully accessible to AI agents.
        </p>
      ) : (
        <>
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
                <span className="flex-shrink-0 w-6 h-6 rounded-full border-[1.5px] border-[#D1D5DB] text-[12px] font-medium text-[#9CA3AF] flex items-center justify-center mt-0.5">
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
                        <span className={`text-[10px] px-[7px] py-[2px] rounded-[3px] font-medium ${EFFORT_PILL[action.fix.effort]}`}>
                          {action.fix.effort} effort
                        </span>
                        <span className={`text-[10px] px-[7px] py-[2px] rounded-[3px] font-medium ${IMPACT_PILL[action.fix.impact]}`}>
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
        </>
      )}
    </div>
  );
}
