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

const SUMMARY_COLORS: Record<Tier, { base: string; hover: string }> = {
  green: { base: "text-[#6B7280]", hover: "group-hover:text-[#374151]" },
  yellow: { base: "text-[#CA8A04]", hover: "group-hover:text-[#A16207]" },
  red: { base: "text-[#DC2626]", hover: "group-hover:text-[#B91C1C]" },
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
  const summaryStyle = SUMMARY_COLORS[tier];

  return (
    <button
      onClick={onClick}
      className="group w-full text-left cursor-pointer"
    >
      {/* Header row */}
      <div className="flex items-center gap-2.5">
        {/* Colored dot */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_COLORS[tier]}`} />

        {/* Category name */}
        <span className="text-[15px] font-medium text-foreground">{label}</span>

        {/* Check count */}
        <span className="text-[13px] font-medium text-[#9CA3AF] transition-colors duration-150 group-hover:text-[#6B7280]">
          {passCount} / {totalChecks}
        </span>

        {/* Spacer */}
        <span className="flex-1" />

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-[#9CA3AF] shrink-0 transition-all duration-150 group-hover:text-[#374151] ${expanded ? "rotate-90" : ""}`}
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
        <p className={`text-[13px] font-medium leading-[1.5] transition-colors duration-150 ${summaryStyle.base} ${summaryStyle.hover}`}>
          {summary}
        </p>
      </div>
    </button>
  );
}
