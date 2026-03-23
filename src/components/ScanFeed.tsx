"use client";

import { useEffect, useState } from "react";
import type { CheckResult } from "@/lib/checks/types";

interface FeedItem {
  name: string;
  status: "pass" | "warn" | "fail" | "running";
}

interface ScanFeedProps {
  /** Completed check results — revealed sequentially to simulate live scanning */
  results?: CheckResult[];
  /** Whether the scan is still in progress */
  scanning?: boolean;
  /** Total expected checks (for progress indicator) */
  totalChecks?: number;
}

const STATUS_ICON: Record<string, { icon: string; color: string }> = {
  pass: { icon: "✓", color: "text-tier-green" },
  warn: { icon: "!", color: "text-tier-yellow" },
  fail: { icon: "✗", color: "text-tier-red" },
  running: { icon: "●", color: "text-text-muted" },
};

export default function ScanFeed({
  results = [],
  scanning = false,
  totalChecks = 20,
}: ScanFeedProps) {
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    if (results.length === 0) {
      setRevealedCount(0);
      return;
    }

    // Reveal items one at a time with a staggered delay
    // Total reveal time should match scan duration feel (~2-3 seconds after results arrive)
    const interval = Math.min(150, 3000 / results.length);

    if (revealedCount < results.length) {
      const timer = setTimeout(() => {
        setRevealedCount((prev) => prev + 1);
      }, interval);
      return () => clearTimeout(timer);
    }
  }, [results.length, revealedCount]);

  const visibleItems: FeedItem[] = results.slice(0, revealedCount).map((r) => ({
    name: r.name,
    status: r.status,
  }));

  // Show a "running" indicator for next item if still revealing
  if (scanning || revealedCount < results.length) {
    const nextName =
      revealedCount < results.length
        ? results[revealedCount].name
        : "Running checks...";
    visibleItems.push({ name: nextName, status: "running" });
  }

  const completedCount = revealedCount;
  const progressPct = totalChecks > 0 ? Math.round((completedCount / totalChecks) * 100) : 0;

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-text-muted mb-1.5">
          <span>Scanning...</span>
          <span>{completedCount}/{totalChecks} checks</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-brand rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Feed items */}
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {visibleItems.map((item, i) => {
          const { icon, color } = STATUS_ICON[item.status];
          const isLatest = i === visibleItems.length - 1;
          return (
            <div
              key={`${item.name}-${i}`}
              className="flex items-center gap-2.5 py-1 px-2 text-sm rounded"
              style={{
                animation: "fade-in-up 0.2s ease-out both",
              }}
            >
              {item.status === "running" ? (
                <span className="w-4 h-4 flex items-center justify-center">
                  <span
                    className="block w-3 h-3 border-2 border-brand border-t-transparent rounded-full"
                    style={{ animation: "spin-slow 0.8s linear infinite" }}
                  />
                </span>
              ) : (
                <span className={`w-4 text-center font-bold text-xs ${color}`}>{icon}</span>
              )}
              <span
                className={
                  item.status === "running"
                    ? "text-text-muted"
                    : "text-foreground"
                }
              >
                {item.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
