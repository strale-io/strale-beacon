"use client";

import React, { useState } from "react";
import type { CheckResult, Probe, Confidence, FixBlock } from "@/lib/checks/types";

interface CheckDetailProps {
  check: CheckResult;
}

// Muted text colors for status characters (dots stay bright in CategoryBadge)
const STATUS_CHARS: Record<string, { char: string; color: string }> = {
  pass: { char: "✓", color: "text-[#16A34A]" },
  warn: { char: "!", color: "text-[#92400E]" },
  fail: { char: "✗", color: "text-[#991B1B]" },
};

const CONFIDENCE_LABEL: Record<Confidence, { label: string; bg: string; text: string }> = {
  high: { label: "High confidence", bg: "bg-[#F0FDF4]", text: "text-[#166534]" },
  medium: { label: "Medium confidence", bg: "bg-[#FFFBEB]", text: "text-[#92400E]" },
  low: { label: "Low confidence — keyword inference", bg: "bg-[#FFFBEB]", text: "text-[#92400E]" },
};

function statusCodePill(status: number | null, error?: string | null): React.JSX.Element {
  if (!status) {
    return (
      <span className="inline-flex items-center px-1.5 py-px rounded text-[11px] font-medium font-mono bg-[#FEE2E2] text-[#991B1B]">
        {error || "failed"}
      </span>
    );
  }
  if (status >= 200 && status < 300) {
    return (
      <span className="inline-flex items-center px-1.5 py-px rounded text-[11px] font-medium font-mono bg-[#DCFCE7] text-[#166534]">
        {status}
      </span>
    );
  }
  if (status >= 300 && status < 400) {
    return (
      <span className="inline-flex items-center px-1.5 py-px rounded text-[11px] font-medium font-mono bg-[#DBEAFE] text-[#1E40AF]">
        {status}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-px rounded text-[11px] font-medium font-mono bg-[#FEE2E2] text-[#991B1B]">
      {status}
    </span>
  );
}

/** Capitalize first letter of each sentence */
function capitalizeSentences(text: string): string {
  return text
    .replace(/^([a-z])/, (_, c: string) => c.toUpperCase())
    .replace(/\. ([a-z])/g, (_, c: string) => ". " + c.toUpperCase());
}

/** Wrap technical terms (paths, URLs, identifiers) in inline code styling */
function renderWithInlineCode(text: string): (string | React.JSX.Element)[] {
  // Match file paths (/foo.bar), URLs (https://...), technical IDs (BearerAuth, JSON-LD, WebAPI, etc.)
  const pattern = /(\/[\w.-]+(?:\/[\w.-]+)*|https?:\/\/[^\s,)]+|(?:BearerAuth|OAuth\s*2\.0|JSON-LD|WebAPI|APIReference|SoftwareApplication|Schema\.org|OpenAPI|Swagger|x402|MCP|A2A))/g;
  const parts: (string | React.JSX.Element)[] = [];
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <code key={match.index} className="bg-[#F3F4F6] text-[#374151] font-mono text-[0.9em] px-[5px] py-[2px] rounded-[3px]">
        {match[0]}
      </code>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
}

function ProbeRow({ probe }: { probe: Probe }) {
  return (
    <div className="flex items-center gap-2 text-[12px] font-mono py-0.5">
      <span className="text-[#9CA3AF] flex-shrink-0">{probe.method}</span>
      <span className="text-[#374151] truncate flex-1 min-w-0">{probe.url}</span>
      <span className="text-[#9CA3AF]">→</span>
      {statusCodePill(probe.status, probe.error)}
    </div>
  );
}

const EFFORT_PILL: Record<string, string> = {
  low: "bg-[#F0FDF4] text-[#166534]",
  medium: "bg-[#F3F4F6] text-[#4B5563]",
  high: "bg-[#FEE2E2] text-[#991B1B]",
};

const IMPACT_PILL: Record<string, string> = {
  high: "bg-[#DCFCE7] text-[#166534]",
  medium: "bg-[#F3F4F6] text-[#4B5563]",
  low: "bg-[#F3F4F6] text-[#6B7280]",
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
    <div className="py-3 flex gap-2.5 border-b border-[#E5E7EB] last:border-b-0">
      {/* Status character */}
      <span className={`flex-shrink-0 text-[14px] font-bold leading-[1.4] ${statusCfg.color}`}>
        {statusCfg.char}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-[14px] font-medium text-foreground">{check.name}</h4>
          {check.foundButUnrecognized && (
            <span className="text-[11px] px-2 py-[2px] rounded bg-[#FFFBEB] text-[#92400E] font-medium">
              Found but format not recognized
            </span>
          )}
          {confidenceCfg && check.confidence !== "high" && (
            <span className={`text-[11px] px-2 py-[2px] rounded font-medium ${confidenceCfg.bg} ${confidenceCfg.text}`}>
              {confidenceCfg.label}
            </span>
          )}
        </div>

        <p className="mt-0.5 text-[14px] text-[#4B5563] leading-[1.5]">{renderWithInlineCode(finding)}</p>

        {/* Recommendation as blue callout */}
        {check.recommendation && (
          <div className="mt-2 border-l-2 border-[#185FA5] bg-[#EFF6FF] px-3 py-2 rounded-r">
            <p className="text-[13px] text-[#374151]">
              {renderWithInlineCode(capitalizeSentences(check.recommendation))}
            </p>
          </div>
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
                  <div>
                    <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1">
                      URLs probed
                    </p>
                    <div className="bg-[#F3F4F6] rounded-md px-4 py-3">
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
      <div className="bg-[#F3F4F6] rounded-md px-4 py-3">
        {uniqueProbes.map((probe, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px] font-mono py-0.5">
            <span className="text-[#9CA3AF]">{probe.method}</span>
            <span className="text-[#374151] truncate flex-1 min-w-0">{probe.url}</span>
            <span className="text-[#9CA3AF]">→</span>
            {statusCodePill(probe.status, probe.error)}
          </div>
        ))}
      </div>
    </div>
  );
}
