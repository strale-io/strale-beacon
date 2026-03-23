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
    setStaleBannerDismissed(true);
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
            <div className="h-[130px] w-[130px] bg-muted rounded-full mx-auto mb-8" />
            <div className="h-16 max-w-md bg-muted rounded mx-auto mb-10" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-muted rounded mb-1" />
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
    hour: "2-digit",
    minute: "2-digit",
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
        <div className="text-center mb-6">
          <h1 className="text-[28px] font-semibold text-foreground">
            {result.domain}
          </h1>
          <p className="mt-1 text-[13px] text-[#9CA3AF]">
            Scanned {scannedDate}
            {" · "}
            <button
              onClick={handleRescan}
              disabled={rescanning}
              className="underline decoration-[#D1D5DB] underline-offset-2 hover:decoration-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {rescanning ? "Rescanning…" : "Rescan"}
            </button>
          </p>
        </div>

        {/* 2. Score ring */}
        <div className="flex justify-center mb-6">
          <ScoreRing ready={greenCount} total={totalCategories} />
        </div>

        {/* Staleness banner — below score ring, subtle */}
        {!staleBannerDismissed && (() => {
          const ageMs = Date.now() - new Date(result.scanned_at).getTime();
          if (ageMs < 15 * 60 * 1000) return null;
          return (
            <div className="mb-4 px-3 py-2 rounded-md bg-[#FEFCE8] flex items-center justify-between gap-3">
              <p className="text-[12px] text-[#CA8A04]">
                Results from {relativeTime(result.scanned_at)}.{" "}
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
                className="flex-shrink-0 text-[#CA8A04] hover:text-foreground"
                aria-label="Dismiss"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })()}

        {/* 3. Narrative — left aligned within centered container */}
        <div className="max-w-[560px] mx-auto mb-6">
          <p className="text-[15px] text-[#4B5563] leading-[1.6] text-left">
            {narrative}
          </p>
        </div>

        {/* 4. Share + download toolbar */}
        <div className="flex items-center justify-center flex-wrap gap-2 mb-8 text-[13px] text-[#6B7280]">
          <button onClick={handleCopyLink} className="hover:text-foreground transition-colors">
            {copied ? "✓ Copied" : "Copy link"}
          </button>
          <span className="text-[#9CA3AF]">·</span>
          <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors" title="Share on X">
            <svg className="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <span className="text-[#9CA3AF]">·</span>
          <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors" title="Share on LinkedIn">
            <svg className="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </a>
          <span className="text-[#9CA3AF]">·</span>
          <DownloadReport slug={slug} domain={result.domain} />
          <span className="text-[#9CA3AF]">·</span>
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

        {/* 5. Category rows */}
        <div className="mb-12">
          {result.categories.map((cat) => (
            <div key={cat.category_id}>
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

              {expandedCategory === cat.category_id && (
                <div className="mt-1 ml-[74px] pl-4 border-l-2 border-border space-y-0 mb-2">
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
