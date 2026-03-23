import type { CheckResult } from "@/lib/checks/types";

interface CheckDetailProps {
  check: CheckResult;
}

const STATUS_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  pass: { icon: "✓", color: "text-tier-green-text", bg: "bg-tier-green-light" },
  warn: { icon: "!", color: "text-tier-yellow-text", bg: "bg-tier-yellow-light" },
  fail: { icon: "✗", color: "text-tier-red-text", bg: "bg-tier-red-light" },
};

export default function CheckDetail({ check }: CheckDetailProps) {
  const config = STATUS_CONFIG[check.status] || STATUS_CONFIG.warn;

  return (
    <div className="py-3 flex gap-3">
      {/* Status icon */}
      <span
        className={`flex-shrink-0 w-6 h-6 rounded-full ${config.bg} ${config.color} text-xs font-bold flex items-center justify-center mt-0.5`}
      >
        {config.icon}
      </span>

      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-semibold text-foreground">{check.name}</h4>
        <p className="mt-0.5 text-sm text-text-secondary">{check.finding}</p>
        {check.recommendation && (
          <p className="mt-1.5 text-sm text-brand">
            → {check.recommendation}
          </p>
        )}
      </div>
    </div>
  );
}
