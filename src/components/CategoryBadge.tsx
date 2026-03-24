import type { Tier } from "@/lib/checks/types";

interface CategoryBadgeProps {
  label: string;
  tier: Tier;
  summary: string;
  passCount: number;
  totalChecks: number;
  expanded?: boolean;
  onClick?: () => void;
}

const DOT_COLORS: Record<Tier, string> = {
  green: "bg-[#16A34A]",
  yellow: "bg-[#CA8A04]",
  red: "bg-[#DC2626]",
};

const SUMMARY_FAIL_COLORS: Record<Tier, string> = {
  green: "text-[#4B5563]",
  yellow: "text-[#CA8A04]",
  red: "text-[#DC2626]",
};

export default function CategoryBadge({
  label,
  tier,
  summary,
  passCount,
  totalChecks,
  expanded = false,
  onClick,
}: CategoryBadgeProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left hover:bg-[#F9FAFB] transition-colors cursor-pointer"
    >
      {/* Header row */}
      <div className="flex items-center gap-2.5">
        {/* Colored dot */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_COLORS[tier]}`} />

        {/* Category name */}
        <span className="text-[15px] font-medium text-foreground">{label}</span>

        {/* Check count */}
        <span className="text-[13px] text-[#9CA3AF]">{passCount} / {totalChecks}</span>

        {/* Spacer */}
        <span className="flex-1" />

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-[#D1D5DB] shrink-0 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </div>

      {/* Summary line */}
      <div className="mt-1 ml-[18px]">
        <p className={`text-[13px] leading-[1.5] ${tier === "green" ? "text-[#4B5563]" : SUMMARY_FAIL_COLORS[tier]}`}>
          {summary}
        </p>
      </div>
    </button>
  );
}
