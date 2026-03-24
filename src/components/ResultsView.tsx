"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import type { ScanResult } from "@/lib/checks/types";
import { categorySummary } from "@/lib/checks/summaries";
import { generateNarrative } from "@/lib/pdf/narrative";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScoreRing from "@/components/ScoreRing";
import CategoryBadge from "@/components/CategoryBadge";
import CheckDetail, { CategoryProbeSummary } from "@/components/CheckDetail";
import ActionPlan from "@/components/ActionPlan";
import SubscribeForm from "@/components/SubscribeForm";
import DownloadReport from "@/components/DownloadReport";
import ScoreProgression from "@/components/ScoreProgression";

export default function ResultsView() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [previousTiers, setPreviousTiers] = useState<Record<string, string> | null>(null);
  const [previousScannedAt, setPreviousScannedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleRescan = async () => {
    if (!result || rescanning) return;
    setRescanning(true);
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: result.url, force: true }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.slug) {
          router.push(`/results/${data.slug}`);
          router.refresh();
        }
      }
    } catch {
      // Silently fail
    } finally {
      setRescanning(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    async function loadResults() {
      try {
        const response = await fetch(`/api/results/${slug}`);
        if (response.ok) {
          const data = await response.json();
          setResult(data as ScanResult);
          if (data.previousTiers) setPreviousTiers(data.previousTiers);
          if (data.previousScannedAt) setPreviousScannedAt(data.previousScannedAt);
        } else if (response.status === 404) {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    loadResults();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 w-full max-w-3xl mx-auto px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-muted rounded mx-auto mb-2" />
            <div className="h-4 w-64 bg-muted rounded mx-auto mb-8" />
            <div className="h-[130px] w-[130px] bg-muted rounded-full mx-auto mb-8" />
            <div className="h-16 max-w-md bg-muted rounded mx-auto mb-10" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-24 bg-muted rounded-lg mb-3" />
            ))}
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (notFound || !result) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Scan not found</h1>
            <p className="mt-2 text-text-secondary">
              This scan doesn&apos;t exist or has expired. Try scanning again.
            </p>
            <a
              href="/"
              className="inline-block mt-4 px-4 py-2 bg-foreground text-background text-sm font-medium rounded-[4px] hover:bg-interactive-hover transition-colors"
            >
              Scan a URL
            </a>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const greenCount = result.categories.filter((c) => c.tier === "green").length;
  const totalCategories = result.categories.length;
  const totalChecks = result.categories.reduce((n, c) => n + c.checks.length, 0);
  const passedChecks = result.categories.reduce(
    (n, c) => n + c.checks.filter((ch) => ch.status === "pass").length, 0
  );
  const notReadyCount = result.categories.filter((c) => c.tier !== "green").length;
  const scannedDate = new Date(result.scanned_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const narrative = generateNarrative(result);
  const shareUrl = typeof window !== "undefined" ? window.location.href : result.url;
  const shareText = `Just scanned ${result.domain} for agent-readiness with Strale Beacon. Here's what AI agents see 👇`;
  const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

  // Status label + color
  const statusLabel =
    greenCount >= totalCategories ? "Fully agent-ready" :
    greenCount >= 2 ? "Partially agent-ready" :
    "Not agent-ready";
  const statusColor =
    greenCount >= totalCategories ? "#16A34A" :
    greenCount >= 2 ? "#CA8A04" :
    "#DC2626";

  // Row 5: key signals or issues
  const SIGNAL_IDS = [
    "disc-llms-txt", "comp-openapi", "disc-mcp-a2a", "disc-structured-data",
    "stab-security", "trans-pricing-structured", "ax-mcp-functional",
  ];
  const allChecks = result.categories.flatMap((c) => c.checks);
  const keySignals = SIGNAL_IDS
    .filter((id) => allChecks.some((ch) => ch.check_id === id && ch.status === "pass"))
    .map((id) => {
      const names: Record<string, string> = {
        "disc-llms-txt": "llms.txt",
        "comp-openapi": "OpenAPI spec",
        "disc-mcp-a2a": "MCP/A2A endpoint",
        "disc-structured-data": "Structured data",
        "stab-security": "Security headers",
        "trans-pricing-structured": "Machine-readable pricing",
        "ax-mcp-functional": "MCP verified",
      };
      return names[id] || id;
    })
    .slice(0, 3);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Fix 1: max-w-3xl (48rem/768px) matches strale.dev content page width */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-8 py-8">
        {/* Part 1: Heading + subheading */}
        <div className="mb-8">
          <h1 className="text-[22px] font-medium text-foreground tracking-[-0.02em]">
            Agent-readiness report
          </h1>
          <p className="mt-1 text-[14px] text-text-secondary leading-[1.5]">
            How AI agents experience your product — from discovery to transaction.
          </p>
        </div>

        {/* Part 2: Score ring + summary table */}
        <div className="flex gap-7 mb-7">
          <ScoreRing ready={greenCount} total={totalCategories} size={100} />
          <div className="flex-1 min-w-0 text-[13px]">
            {/* Row 1: Site */}
            <div className="flex items-baseline py-2.5 border-b border-[#F3F4F6]">
              <span className="w-[120px] flex-shrink-0 text-text-secondary">Site</span>
              <span className="font-medium text-foreground font-mono">{result.domain}</span>
            </div>
            {/* Row 2: Scanned */}
            <div className="flex items-baseline py-2.5 border-b border-[#F3F4F6]">
              <span className="w-[120px] flex-shrink-0 text-text-secondary">Scanned</span>
              <span className="font-medium text-foreground">
                {scannedDate}
                <button
                  onClick={handleRescan}
                  disabled={rescanning}
                  className="ml-2 text-[#185FA5] font-medium hover:underline disabled:opacity-50"
                >
                  {rescanning ? "Rescanning…" : "Rescan"}
                </button>
              </span>
            </div>
            {/* Row 3: Status */}
            <div className="flex items-baseline py-2.5 border-b border-[#F3F4F6]">
              <span className="w-[120px] flex-shrink-0 text-text-secondary">Status</span>
              <span className="font-medium" style={{ color: statusColor }}>{statusLabel}</span>
            </div>
            {/* Row 4: Checks passed */}
            <div className="flex items-baseline py-2.5 border-b border-[#F3F4F6]">
              <span className="w-[120px] flex-shrink-0 text-text-secondary">Checks passed</span>
              <span className="font-medium text-foreground">{passedChecks} of {totalChecks}</span>
            </div>
            {/* Row 5: Key signals or Issues found */}
            <div className="flex items-baseline py-2.5">
              {greenCount >= totalCategories ? (
                <>
                  <span className="w-[120px] flex-shrink-0 text-text-secondary">Key signals</span>
                  <span className="font-medium text-foreground">{keySignals.join(", ") || "All checks passing"}</span>
                </>
              ) : (
                <>
                  <span className="w-[120px] flex-shrink-0 text-text-secondary">Issues found</span>
                  <span className="font-medium" style={{ color: "#DC2626" }}>
                    {totalChecks - passedChecks} checks failed across {notReadyCount} area{notReadyCount !== 1 ? "s" : ""}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Part 3: Narrative */}
        <p className="text-[14px] text-text-secondary leading-[1.7] mb-5">
          {narrative}
        </p>

        {/* Part 4: Share/export toolbar */}
        <div className="flex items-center flex-wrap gap-5 text-[13px] text-text-secondary border-t border-[#F3F4F6] pt-4 mb-10">
          <button onClick={handleCopyLink} className="hover:text-foreground transition-colors">
            {copied ? "✓ Copied" : "Copy link"}
          </button>
          <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors" title="Share on X">
            <svg className="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors" title="Share on LinkedIn">
            <svg className="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </a>
          <DownloadReport slug={slug} domain={result.domain} />
          <a
            href={`/api/report/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors font-mono"
          >
            {"{ }"} JSON
          </a>
        </div>

        {/* Score progression */}
        {previousTiers && previousScannedAt && (
          <ScoreProgression
            categories={result.categories}
            previousTiers={previousTiers}
            previousScannedAt={previousScannedAt}
          />
        )}

        {/* Divider + section heading — Fix 2: strale.dev section heading style */}
        <div className="border-t border-border pt-10 mb-6">
          <h2 className="text-[1.875rem] font-normal tracking-[-0.02em] leading-[2.25rem] text-foreground">
            How ready are you?
          </h2>
          <p className="mt-2 text-lg text-text-secondary">
            Six areas that determine whether AI agents can work with your product.
          </p>
        </div>

        {/* 5. Category rows — Fix 5: each in a card */}
        <div className="space-y-3 mb-12">
          {result.categories.map((cat) => (
            <div key={cat.category_id}>
              <div className="rounded-lg border border-[#E5E7EB] bg-white">
                <div className="px-5 py-4">
                  <CategoryBadge
                    label={cat.label}
                    question={cat.question}
                    tier={cat.tier}
                    summary={categorySummary(cat)}
                    passCount={cat.checks.filter((c) => c.status === "pass").length}
                    totalChecks={cat.checks.length}
                    expanded={expandedCategory === cat.category_id}
                    onClick={() =>
                      setExpandedCategory(
                        expandedCategory === cat.category_id ? null : cat.category_id
                      )
                    }
                  />
                </div>

                {expandedCategory === cat.category_id && (
                  <div className="border-t border-[#F3F4F6] px-5 py-4">
                    <div className="ml-[74px] space-y-0">
                      {cat.checks.map((check) => (
                        <CheckDetail key={check.check_id} check={check} />
                      ))}
                      <CategoryProbeSummary checks={cat.checks} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Divider + action plan — Fix 2: section heading */}
        <div className="border-t border-border pt-10 mb-12">
          <ActionPlan result={result} />
        </div>

        {/* Subscribe — compact */}
        <div className="mb-8">
          <SubscribeForm domain={result.domain} />
        </div>

        {/* Strale connection — subtle text */}
        <p className="text-center text-sm text-text-muted mb-8">
          Want agents to find your product? List it on{" "}
          <a
            href="https://strale.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline decoration-[#D1D5DB] underline-offset-2 hover:decoration-foreground transition-colors"
          >
            Strale&apos;s marketplace
          </a>
          {" →"}
        </p>
      </main>

      <Footer />
    </div>
  );
}
