import type { Tier } from "@/lib/checks/types";

interface CategoryBadgeProps {
  label: string;
  question: string;
  tier: Tier;
  summary: string;
  expanded?: boolean;
  onClick?: () => void;
}

const TIER_CONFIG: Record<Tier, { label: string; bg: string; text: string; border: string; icon: string }> = {
  green: {
    label: "Ready",
    bg: "bg-tier-green-light",
    text: "text-tier-green-text",
    border: "border-tier-green-border",
    icon: "✓",
  },
  yellow: {
    label: "Partial",
    bg: "bg-tier-yellow-light",
    text: "text-tier-yellow-text",
    border: "border-tier-yellow-border",
    icon: "◐",
  },
  red: {
    label: "Not Ready",
    bg: "bg-tier-red-light",
    text: "text-tier-red-text",
    border: "border-tier-red-border",
    icon: "✗",
  },
};

export default function CategoryBadge({
  label,
  question,
  tier,
  summary,
  expanded = false,
  onClick,
}: CategoryBadgeProps) {
  const config = TIER_CONFIG[tier];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-lg border transition-colors duration-150 ${
        expanded ? "border-border-strong bg-surface" : "border-border bg-background hover:bg-surface"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Tier badge */}
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.bg} ${config.text} ${config.border} shrink-0 mt-0.5`}
        >
          <span aria-hidden="true">{config.icon}</span>
          {config.label}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="font-semibold text-foreground">{label}</h3>
            <span className="text-sm text-text-muted">{question}</span>
          </div>
          <p className="mt-1 text-sm text-text-secondary line-clamp-2">{summary}</p>
        </div>

        {/* Expand indicator */}
        <svg
          className={`w-5 h-5 text-text-muted shrink-0 mt-1 transition-transform duration-150 ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </div>
    </button>
  );
}
