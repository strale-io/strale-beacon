"use client";

import { useState } from "react";
import type { CheckResult, Probe, Confidence, FixBlock } from "@/lib/checks/types";

interface CheckDetailProps {
  check: CheckResult;
}

const STATUS_CHARS: Record<string, { char: string; color: string }> = {
  pass: { char: "✓", color: "text-[#16A34A]" },
  warn: { char: "!", color: "text-[#CA8A04]" },
  fail: { char: "✗", color: "text-[#DC2626]" },
};

const CONFIDENCE_LABEL: Record<Confidence, { label: string; color: string }> = {
  high: { label: "High confidence", color: "text-[#16A34A]" },
  medium: { label: "Medium confidence", color: "text-[#CA8A04]" },
  low: { label: "Low confidence — keyword inference", color: "text-[#DC2626]" },
};

function statusCodeColor(status: number | null): string {
  if (!status) return "text-[#9CA3AF]";
  if (status >= 200 && status < 300) return "text-[#16A34A]";
  if (status >= 300 && status < 400) return "text-[#CA8A04]";
  return "text-[#DC2626]";
}

/** Capitalize first letter of each sentence */
function capitalizeSentences(text: string): string {
  return text
    .replace(/^([a-z])/, (_, c: string) => c.toUpperCase())
    .replace(/\. ([a-z])/g, (_, c: string) => ". " + c.toUpperCase());
}

function ProbeRow({ probe }: { probe: Probe }) {
  return (
    <div className="flex items-start gap-2 text-[12px] font-mono py-0.5">
      <span className="text-[#9CA3AF] flex-shrink-0">{probe.method}</span>
      <span className="text-foreground truncate flex-1 min-w-0">{probe.url}</span>
      <span className="text-[#9CA3AF]">→</span>
      {probe.status ? (
        <span className={`flex-shrink-0 ${statusCodeColor(probe.status)}`}>
          {probe.status}
        </span>
      ) : (
        <span className="flex-shrink-0 text-[#DC2626]">
          {probe.error || "failed"}
        </span>
      )}
    </div>
  );
}

const EFFORT_COLORS: Record<string, string> = {
  low: "bg-[#F0FDF4] text-[#16A34A]",
  medium: "bg-[#FEFCE8] text-[#CA8A04]",
  high: "bg-[#FEF2F2] text-[#DC2626]",
};

function FixBlockSection({ fix }: { fix: FixBlock }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[13px] text-[#6B7280] hover:text-foreground hover:underline transition-colors flex items-center gap-1 cursor-pointer"
      >
        <svg
          className={`w-3 h-3 transition-transform duration-75 ${expanded ? "rotate-90" : ""}`}
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
        <div className="mt-2 pl-3 border-l-2 border-[#E5E7EB] space-y-3">
          <div>
            <p className="text-[13px] font-medium text-foreground">{fix.what}</p>
            <p className="text-[13px] text-[#6B7280] mt-0.5">{fix.why}</p>
          </div>

          {fix.example_before && fix.example_after && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1">Before</p>
                <pre className="text-[12px] bg-[#FEF2F2]/50 text-foreground p-2 rounded overflow-x-auto font-mono whitespace-pre-wrap">{fix.example_before.trim()}</pre>
              </div>
              <div>
                <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1">After</p>
                <pre className="text-[12px] bg-[#F0FDF4]/50 text-foreground p-2 rounded overflow-x-auto font-mono whitespace-pre-wrap">{fix.example_after.trim()}</pre>
              </div>
            </div>
          )}

          {fix.verification && (
            <div>
              <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1">Verify</p>
              <pre className="text-[12px] bg-[#F9FAFB] text-foreground p-2 rounded overflow-x-auto font-mono">{fix.verification}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CheckDetail({ check }: CheckDetailProps) {
  const statusCfg = STATUS_CHARS[check.status] || STATUS_CHARS.warn;
  const [showDetails, setShowDetails] = useState(false);
  const confidenceCfg = check.confidence ? CONFIDENCE_LABEL[check.confidence] : null;
  const hasProbes = check.probes && check.probes.length > 0;
  const hasDetails = hasProbes || check.detectionMethod;
  const finding = capitalizeSentences(check.finding || "");

  return (
    <div className="py-3 flex gap-2.5 border-b border-[#F3F4F6] last:border-b-0">
      {/* Status character */}
      <span className={`flex-shrink-0 text-[14px] font-bold leading-[1.4] ${statusCfg.color}`}>
        {statusCfg.char}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-[14px] font-medium text-foreground">{check.name}</h4>
          {check.foundButUnrecognized && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FEFCE8] text-[#CA8A04] font-medium">
              Found but format not recognized
            </span>
          )}
          {confidenceCfg && check.confidence !== "high" && (
            <span className={`text-[10px] ${confidenceCfg.color}`}>
              {confidenceCfg.label}
            </span>
          )}
        </div>

        <p className="mt-0.5 text-[14px] text-[#4B5563] leading-[1.5]">{finding}</p>

        {check.recommendation && (
          <p className="mt-1.5 text-[13px] text-[#6B7280]">
            → {capitalizeSentences(check.recommendation)}
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
              className="text-[13px] text-[#6B7280] hover:text-foreground hover:underline transition-colors flex items-center gap-1 cursor-pointer"
            >
              <svg
                className={`w-3 h-3 transition-transform duration-75 ${showDetails ? "rotate-90" : ""}`}
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
              <div className="mt-2 pl-3 border-l-2 border-[#E5E7EB]">
                {check.detectionMethod && (
                  <p className="text-[13px] text-[#6B7280] leading-[1.6] mb-2">
                    {capitalizeSentences(check.detectionMethod)}
                  </p>
                )}
                {hasProbes && (
                  <div className="space-y-0">
                    <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1">
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
    <div className="mt-3 pt-3 border-t border-[#E5E7EB]">
      <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1">
        All URLs probed in this category ({uniqueProbes.length})
      </p>
      <div className="space-y-0">
        {uniqueProbes.map((probe, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px] font-mono py-0.5 pr-0">
            <span className="text-[#9CA3AF]">{probe.method}</span>
            <span className="text-foreground truncate flex-1 min-w-0">{probe.url}</span>
            <span className="text-[#9CA3AF]">→</span>
            <span className={statusCodeColor(probe.status)}>
              {probe.status || probe.error || "failed"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
