import type { Tier } from "@/lib/checks/types";

interface CategoryBadgeProps {
  label: string;
  question: string;
  tier: Tier;
  summary: string;
  passCount: number;
  totalChecks: number;
  expanded?: boolean;
  onClick?: () => void;
}

const TIER_CONFIG: Record<Tier, { label: string; bg: string; text: string }> = {
  green: { label: "Ready", bg: "bg-tier-green-light", text: "text-tier-green-text" },
  yellow: { label: "Partial", bg: "bg-tier-yellow-light", text: "text-tier-yellow-text" },
  red: { label: "Not Ready", bg: "bg-tier-red-light", text: "text-tier-red-text" },
};

export default function CategoryBadge({
  label,
  question,
  tier,
  summary,
  passCount,
  totalChecks,
  expanded = false,
  onClick,
}: CategoryBadgeProps) {
  const config = TIER_CONFIG[tier];

  return (
    <button
      onClick={onClick}
      className="w-full text-left border-t border-[#F3F4F6] first:border-t-0 py-3.5 transition-colors hover:bg-[#FAFAFA]"
    >
      {/* Header row */}
      <div className="flex items-center gap-3">
        {/* Tier badge */}
        <span
          className={`inline-flex items-center justify-center min-w-[52px] px-2.5 py-[3px] rounded-[4px] text-[11px] font-medium ${config.bg} ${config.text}`}
        >
          {config.label}
        </span>

        {/* Category name */}
        <span className="text-[14px] font-medium text-foreground">{label}</span>

        {/* Check count */}
        <span className="text-[12px] text-[#B0B0B0]">{passCount}/{totalChecks}</span>

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

      {/* Body — finding + description */}
      <div className="mt-1.5 ml-[74px]">
        <p className="text-[13px] text-[#4B5563] leading-[1.5]">{summary}</p>
        <p className="text-[12px] text-[#B0B0B0] mt-0.5">{question}</p>
      </div>
    </button>
  );
}
