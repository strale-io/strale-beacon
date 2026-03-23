"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import type { ScanResult } from "@/lib/checks/types";
import { categorySummary } from "@/lib/checks/summaries";
import { generateNarrative } from "@/lib/pdf/narrative";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import RadarChart from "@/components/RadarChart";
import CategoryBadge from "@/components/CategoryBadge";
import CheckDetail, { CategoryProbeSummary } from "@/components/CheckDetail";
import ActionPlan from "@/components/ActionPlan";
import SubscribeForm from "@/components/SubscribeForm";
import DownloadReport from "@/components/DownloadReport";
import ScoreProgression from "@/components/ScoreProgression";

function relativeTime(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

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
  const [staleBannerDismissed, setStaleBannerDismissed] = useState(false);
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
        <main className="flex-1 w-full max-w-[1152px] mx-auto px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-muted rounded mx-auto mb-2" />
            <div className="h-4 w-64 bg-muted rounded mx-auto mb-8" />
            <div className="h-64 w-64 bg-muted rounded-full mx-auto mb-8" />
            <div className="h-6 w-40 bg-muted rounded mx-auto mb-10" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 bg-muted rounded-lg mb-2" />
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
  const scannedDate = new Date(result.scanned_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const narrative = generateNarrative(result);
  const shareUrl = typeof window !== "undefined" ? window.location.href : result.url;
  const shareText = `Just scanned ${result.domain} for agent-readiness with Strale Beacon. Here's what AI agents see 👇`;
  const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 w-full max-w-[1152px] mx-auto px-8 py-8">
        {/* 1. Domain + scan metadata */}
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            {result.domain}
          </h1>
          <p className="mt-1 text-sm text-text-muted flex items-center justify-center gap-2 flex-wrap">
            <span>Scanned {scannedDate}</span>
            <span className="text-border-strong">·</span>
            <button
              onClick={handleRescan}
              disabled={rescanning}
              className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-foreground transition-colors disabled:opacity-50"
            >
              {rescanning ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Rescanning…
                </>
              ) : (
                <>↻ Rescan</>
              )}
            </button>
          </p>
        </div>

        {/* Staleness banner */}
        {!staleBannerDismissed && (() => {
          const ageMs = Date.now() - new Date(result.scanned_at).getTime();
          if (ageMs < 15 * 60 * 1000) return null;
          return (
            <div className="mb-4 px-4 py-3 rounded-lg bg-tier-yellow-light border border-yellow-200 flex items-center justify-between gap-3">
              <p className="text-sm text-tier-yellow-text">
                These results are from {relativeTime(result.scanned_at)}. They may not reflect recent changes.{" "}
                <button
                  onClick={handleRescan}
                  disabled={rescanning}
                  className="font-medium underline hover:no-underline"
                >
                  {rescanning ? "Rescanning…" : "Rescan now"}
                </button>
              </p>
              <button
                onClick={() => setStaleBannerDismissed(true)}
                className="flex-shrink-0 text-tier-yellow-text hover:text-foreground"
                aria-label="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })()}

        {/* 2. Radar chart */}
        <div className="flex justify-center mb-6">
          <div className="block sm:hidden">
            <RadarChart
              categories={result.categories.map((c) => ({ label: c.label, tier: c.tier }))}
              size="md"
            />
          </div>
          <div className="hidden sm:block">
            <RadarChart
              categories={result.categories.map((c) => ({ label: c.label, tier: c.tier }))}
              size="lg"
            />
          </div>
        </div>

        {/* 3. Summary line + narrative */}
        <p className="text-center text-lg font-medium text-text-secondary mb-3">
          <span className="text-foreground font-bold">{greenCount} of {totalCategories}</span>
          {" areas agent-ready"}
        </p>

        <p className="text-center text-sm text-text-secondary leading-relaxed max-w-2xl mx-auto mb-6">
          {narrative}
        </p>

        {/* 4. Action bar — share + download */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-8 py-3 border-y border-border">
          <div className="flex items-center gap-3 text-sm text-text-muted">
            <span className="font-medium text-text-secondary">Share</span>
            <button
              onClick={handleCopyLink}
              className="hover:text-foreground transition-colors"
              title="Copy link"
            >
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
          </div>
          <div className="flex items-center gap-3 text-sm">
            <DownloadReport slug={slug} domain={result.domain} />
            <a
              href={`/api/report/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-text-muted hover:text-foreground transition-colors font-mono text-xs"
            >
              {"{ }"} JSON
            </a>
          </div>
        </div>

        {/* 6. Score progression */}
        {previousTiers && previousScannedAt && (
          <ScoreProgression
            categories={result.categories}
            previousTiers={previousTiers}
            previousScannedAt={previousScannedAt}
          />
        )}

        {/* 5. Category rows */}
        <div className="space-y-2 mb-12">
          {result.categories.map((cat) => (
            <div key={cat.category_id}>
              <CategoryBadge
                label={cat.label}
                question={cat.question}
                tier={cat.tier}
                summary={categorySummary(cat)}
                expanded={expandedCategory === cat.category_id}
                onClick={() =>
                  setExpandedCategory(
                    expandedCategory === cat.category_id ? null : cat.category_id
                  )
                }
              />

              {expandedCategory === cat.category_id && (
                <div className="mt-1 ml-4 sm:ml-8 pl-4 border-l-2 border-border space-y-0 mb-2">
                  {cat.checks.map((check) => (
                    <CheckDetail key={check.check_id} check={check} />
                  ))}
                  <CategoryProbeSummary checks={cat.checks} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 7. Action plan */}
        <div className="mb-12">
          <ActionPlan result={result} />
        </div>

        {/* 8. Subscribe — compact */}
        <div className="mb-8">
          <SubscribeForm domain={result.domain} />
        </div>

        {/* 9. Strale connection — subtle text */}
        <p className="text-center text-sm text-text-muted mb-8">
          Want agents to find your product? List it on{" "}
          <a
            href="https://strale.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline decoration-border-strong underline-offset-2 hover:decoration-foreground transition-colors"
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
