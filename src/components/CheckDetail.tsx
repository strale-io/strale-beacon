"use client";

import React, { useState } from "react";
import type { CheckResult, Probe, Confidence, FixBlock } from "@/lib/checks/types";

interface CheckDetailProps {
  check: CheckResult;
}

const STATUS_CHARS: Record<string, { char: string; color: string }> = {
  pass: { char: "✓", color: "text-[#15803D]" },
  warn: { char: "!", color: "text-[#B45309]" },
  fail: { char: "✗", color: "text-[#B91C1C]" },
};

const CONFIDENCE_LABEL: Record<Confidence, { label: string; bg: string; text: string }> = {
  high: { label: "High confidence", bg: "bg-[#F0FDF4]", text: "text-[#15803D]" },
  medium: { label: "Medium confidence", bg: "bg-[#FFFBEB]", text: "text-[#B45309]" },
  low: { label: "Low confidence — keyword inference", bg: "bg-[#FFFBEB]", text: "text-[#B45309]" },
};

function StatusCodePill({ status, error }: { status: number | null; error?: string | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center px-1.5 py-px rounded-[3px] text-[10px] font-medium font-mono bg-[#FEE2E2] text-[#B91C1C]">
        {error || "failed"}
      </span>
    );
  }
  if (status >= 200 && status < 300) {
    return (
      <span className="inline-flex items-center px-1.5 py-px rounded-[3px] text-[10px] font-medium font-mono bg-[#DCFCE7] text-[#15803D]">
        {status}
      </span>
    );
  }
  if (status >= 300 && status < 400) {
    return (
      <span className="inline-flex items-center px-1.5 py-px rounded-[3px] text-[10px] font-medium font-mono bg-[#DBEAFE] text-[#1E40AF]">
        {status}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-px rounded-[3px] text-[10px] font-medium font-mono bg-[#FEE2E2] text-[#B91C1C]">
      {status}
    </span>
  );
}

function capitalizeSentences(text: string): string {
  return text
    .replace(/^([a-z])/, (_, c: string) => c.toUpperCase())
    .replace(/\. ([a-z])/g, (_, c: string) => ". " + c.toUpperCase());
}

function ProbeRow({ probe }: { probe: Probe }) {
  return (
    <div className="flex items-center gap-2 text-[12px] font-mono leading-[2]">
      <span className="text-[#9CA3AF] flex-shrink-0">{probe.method}</span>
      <span className="text-[#4B5563] truncate flex-1 min-w-0">{probe.url}</span>
      <span className="text-[#9CA3AF]">→</span>
      <StatusCodePill status={probe.status} error={probe.error} />
    </div>
  );
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
        <span className={`ml-1 text-[11px] px-2 py-[2px] rounded font-medium ${EFFORT_PILL[fix.effort]}`}>
          {fix.effort} effort
        </span>
        <span className={`text-[11px] px-2 py-[2px] rounded font-medium ${IMPACT_PILL[fix.impact]}`}>
          {fix.impact} impact
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-3">
          {/* Pattern 3: methodology border — fix explanation */}
          <div className="border-l-2 border-[#D1D5DB] pl-[14px] py-2">
            <p className="text-[13px] font-medium text-foreground">{fix.what}</p>
            <p className="text-[13px] text-[#6B7280] mt-0.5">{fix.why}</p>
          </div>

          {fix.example_before && fix.example_after && (
            <div className="flex gap-3">
              <div className="flex-1 min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-[#B91C1C] uppercase tracking-[0.04em] mb-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#B91C1C] flex-shrink-0" />
                  Before
                </p>
                <pre className="text-[12px] bg-[#F3F4F6] text-[#6B7280] border-l-2 border-[#B91C1C] rounded-r-md px-[14px] py-3 overflow-x-auto font-mono whitespace-pre-wrap leading-[1.7]">{fix.example_before.trim()}</pre>
              </div>
              <div className="flex-1 min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-[#15803D] uppercase tracking-[0.04em] mb-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#15803D] flex-shrink-0" />
                  After
                </p>
                <pre className="text-[12px] bg-[#F3F4F6] text-[#4B5563] border-l-2 border-[#15803D] rounded-r-md px-[14px] py-3 overflow-x-auto font-mono whitespace-pre-wrap leading-[1.7]">{fix.example_after.trim()}</pre>
              </div>
            </div>
          )}

          {/* Pattern 2: evidence — verify command */}
          {fix.verification && (
            <div>
              <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1">Verify</p>
              <div className="bg-[#F3F4F6] rounded-md px-[14px] py-[10px]">
                <pre className="text-[12px] text-[#4B5563] overflow-x-auto font-mono">{fix.verification}</pre>
              </div>
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
    <div className="py-3 flex gap-2.5 border-b border-[#E5E7EB] last:border-b-0">
      {/* Status character */}
      <span className={`flex-shrink-0 text-[14px] font-bold leading-[1.4] ${statusCfg.color}`}>
        {statusCfg.char}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-[14px] font-medium text-foreground">{check.name}</h4>
          {check.foundButUnrecognized && (
            <span className="text-[11px] px-2 py-[2px] rounded bg-[#FFFBEB] text-[#B45309] font-medium">
              Found but format not recognized
            </span>
          )}
          {confidenceCfg && check.confidence !== "high" && (
            <span className={`text-[11px] px-2 py-[2px] rounded font-medium ${confidenceCfg.bg} ${confidenceCfg.text}`}>
              {confidenceCfg.label}
            </span>
          )}
        </div>

        <p className="mt-0.5 text-[14px] text-[#4B5563] leading-[1.5]">{finding}</p>

        {/* Pattern 1: Blue = Action — recommendation callout */}
        {check.recommendation && (
          <div className="mt-2 border-l-2 border-[#185FA5] bg-[#EFF6FF] px-4 py-3">
            <p className="text-[13px] text-[#1E3A5F] leading-[1.5]">
              {capitalizeSentences(check.recommendation)}
            </p>
          </div>
        )}

        {/* Fix block — collapsed by default */}
        {check.fix && check.status !== "pass" && (
          <FixBlockSection fix={check.fix} />
        )}

        {/* What we checked — collapsed by default */}
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
              <div className="mt-2 space-y-3">
                {/* Pattern 3: Gray border = Methodology */}
                {check.detectionMethod && (
                  <div className="border-l-2 border-[#D1D5DB] pl-[14px] py-2">
                    <p className="text-[13px] text-[#6B7280] leading-[1.6]">
                      {capitalizeSentences(check.detectionMethod)}
                    </p>
                  </div>
                )}
                {/* Pattern 2: Gray bg = Evidence — URLs probed */}
                {hasProbes && (
                  <div>
                    <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1">
                      URLs probed
                    </p>
                    <div className="bg-[#F3F4F6] rounded-md px-[14px] py-[10px]">
                      {check.probes.map((probe, i) => (
                        <ProbeRow key={i} probe={probe} />
                      ))}
                    </div>
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
      <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-2">
        All URLs probed in this category ({uniqueProbes.length})
      </p>
      {/* Pattern 2: Gray bg = Evidence */}
      <div className="bg-[#F3F4F6] rounded-md px-[14px] py-[10px]">
        {uniqueProbes.map((probe, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px] font-mono leading-[2]">
            <span className="text-[#9CA3AF]">{probe.method}</span>
            <span className="text-[#4B5563] truncate flex-1 min-w-0">{probe.url}</span>
            <span className="text-[#9CA3AF]">→</span>
            <StatusCodePill status={probe.status} error={probe.error} />
          </div>
        ))}
      </div>
    </div>
  );
}
