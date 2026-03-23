"use client";

import { useState } from "react";
import type { CheckResult, Probe, Confidence, FixBlock } from "@/lib/checks/types";

interface CheckDetailProps {
  check: CheckResult;
}

const STATUS_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  pass: { icon: "✓", color: "text-tier-green-text", bg: "bg-tier-green-light" },
  warn: { icon: "!", color: "text-tier-yellow-text", bg: "bg-tier-yellow-light" },
  fail: { icon: "✗", color: "text-tier-red-text", bg: "bg-tier-red-light" },
};

const CONFIDENCE_LABEL: Record<Confidence, { label: string; color: string }> = {
  high: { label: "High confidence", color: "text-tier-green-text" },
  medium: { label: "Medium confidence", color: "text-tier-yellow-text" },
  low: { label: "Low confidence — keyword inference", color: "text-tier-red-text" },
};

function statusCodeColor(status: number | null): string {
  if (!status) return "text-text-muted";
  if (status >= 200 && status < 300) return "text-tier-green-text";
  if (status >= 300 && status < 400) return "text-tier-yellow-text";
  return "text-tier-red-text";
}

function ProbeRow({ probe }: { probe: Probe }) {
  return (
    <div className="flex items-start gap-2 text-xs font-mono py-0.5">
      <span className="text-text-muted flex-shrink-0">{probe.method}</span>
      <span className="text-foreground truncate flex-1 min-w-0">{probe.url}</span>
      <span className="text-text-muted">→</span>
      {probe.status ? (
        <span className={`flex-shrink-0 ${statusCodeColor(probe.status)}`}>
          {probe.status}
        </span>
      ) : (
        <span className="flex-shrink-0 text-tier-red-text">
          {probe.error || "failed"}
        </span>
      )}
    </div>
  );
}

const EFFORT_COLORS: Record<string, string> = {
  low: "bg-tier-green-light text-tier-green-text",
  medium: "bg-tier-yellow-light text-tier-yellow-text",
  high: "bg-tier-red-light text-tier-red-text",
};

function FixBlockSection({ fix }: { fix: FixBlock }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-foreground font-medium hover:text-brand transition-colors flex items-center gap-1"
      >
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        How to fix
        <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${EFFORT_COLORS[fix.effort]}`}>
          {fix.effort} effort
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${EFFORT_COLORS[fix.impact === "high" ? "low" : fix.impact === "low" ? "high" : "medium"]}`}>
          {fix.impact} impact
        </span>
      </button>

      {expanded && (
        <div className="mt-2 pl-4 border-l-2 border-brand/20 space-y-3">
          <div>
            <p className="text-xs font-semibold text-foreground">{fix.what}</p>
            <p className="text-xs text-text-muted mt-0.5">{fix.why}</p>
          </div>

          {fix.example_before && fix.example_after && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">Before</p>
                <pre className="text-xs bg-tier-red-light/50 text-foreground p-2 rounded overflow-x-auto font-mono whitespace-pre-wrap">{fix.example_before.trim()}</pre>
              </div>
              <div>
                <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">After</p>
                <pre className="text-xs bg-tier-green-light/50 text-foreground p-2 rounded overflow-x-auto font-mono whitespace-pre-wrap">{fix.example_after.trim()}</pre>
              </div>
            </div>
          )}

          {fix.verification && (
            <div>
              <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">Verify</p>
              <pre className="text-xs bg-surface text-foreground p-2 rounded overflow-x-auto font-mono">{fix.verification}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CheckDetail({ check }: CheckDetailProps) {
  const config = STATUS_CONFIG[check.status] || STATUS_CONFIG.warn;
  const [showDetails, setShowDetails] = useState(false);
  const confidenceCfg = check.confidence ? CONFIDENCE_LABEL[check.confidence] : null;
  const hasProbes = check.probes && check.probes.length > 0;
  const hasDetails = hasProbes || check.detectionMethod;

  return (
    <div className="py-3 flex gap-3">
      {/* Status icon */}
      <span
        className={`flex-shrink-0 w-6 h-6 rounded-full ${config.bg} ${config.color} text-xs font-bold flex items-center justify-center mt-0.5`}
      >
        {config.icon}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-semibold text-foreground">{check.name}</h4>
          {check.foundButUnrecognized && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-tier-yellow-light text-tier-yellow-text font-medium">
              Found but format not recognized
            </span>
          )}
          {confidenceCfg && check.confidence !== "high" && (
            <span className={`text-[10px] ${confidenceCfg.color}`}>
              {confidenceCfg.label}
            </span>
          )}
        </div>

        <p className="mt-0.5 text-sm text-text-secondary">{check.finding}</p>

        {check.recommendation && (
          <p className="mt-1.5 text-sm text-brand">
            → {check.recommendation}
          </p>
        )}

        {/* Fix block — for warn/fail checks with a fix */}
        {check.fix && check.status !== "pass" && (
          <FixBlockSection fix={check.fix} />
        )}

        {/* Expandable "What we checked" section */}
        {hasDetails && (
          <div className="mt-2">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-text-muted hover:text-text-secondary transition-colors flex items-center gap-1"
            >
              <svg
                className={`w-3 h-3 transition-transform ${showDetails ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              What we checked
            </button>

            {showDetails && (
              <div className="mt-1.5 pl-4 border-l border-border">
                {check.detectionMethod && (
                  <p className="text-xs text-text-muted mb-2">
                    {check.detectionMethod}
                  </p>
                )}
                {hasProbes && (
                  <div className="space-y-0">
                    <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">
                      URLs probed
                    </p>
                    {check.probes.map((probe, i) => (
                      <ProbeRow key={i} probe={probe} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact probe summary for the bottom of a category section */
export function CategoryProbeSummary({ checks }: { checks: CheckResult[] }) {
  const allProbes = checks.flatMap((c) => c.probes || []);
  if (allProbes.length === 0) return null;

  // Deduplicate by URL
  const seen = new Set<string>();
  const uniqueProbes: Probe[] = [];
  for (const p of allProbes) {
    const key = `${p.method}:${p.url}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueProbes.push(p);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">
        All URLs probed in this category ({uniqueProbes.length})
      </p>
      <div className="space-y-0">
        {uniqueProbes.map((probe, i) => (
          <div key={i} className="flex items-center gap-2 text-xs font-mono py-0.5">
            <span className="text-text-muted">{probe.method}</span>
            <span className="text-foreground truncate flex-1 min-w-0">{probe.url}</span>
            <span className="text-text-muted">→</span>
            <span className={statusCodeColor(probe.status)}>
              {probe.status || probe.error || "failed"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
