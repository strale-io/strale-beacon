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
          // Force a full page reload to pick up fresh data
          window.location.href = `/results/${data.slug}`;
          return;
        }
      }
    } catch {
      // Silently fail
    }
    setRescanning(false);
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
        <main className="flex-1 w-full max-w-[880px] mx-auto px-8 py-8">
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

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Fix 1: max-w-3xl (48rem/768px) matches strale.dev content page width */}
      <main className="flex-1 w-full max-w-[880px] mx-auto px-8 py-8">
        {/* Part 1: Heading + subheading — canonical heading style from "How ready are you?" */}
        <div className="mb-8">
          <h1 className="text-[1.875rem] font-normal tracking-[-0.02em] leading-[2.25rem] text-foreground">
            Agent-readiness report
          </h1>
          <p className="mt-2 text-lg text-text-secondary">
            How AI agents experience your product — from discovery to transaction.
          </p>
        </div>

        {/* Part 2: Score ring + summary table */}
        <div className="flex gap-10 mb-7 items-center">
          <ScoreRing ready={greenCount} total={totalCategories} size={130} />
          <div className="flex-1 min-w-0 text-[13px]">
            {/* Row 1: Site */}
            <div className="flex items-baseline py-2 border-b border-[#E5E7EB]">
              <span className="w-[180px] flex-shrink-0 text-text-secondary font-medium">Site</span>
              <span className="font-medium text-foreground">{result.domain}</span>
            </div>
            {/* Row 2: Scanned */}
            <div className="flex items-baseline py-2 border-b border-[#E5E7EB]">
              <span className="w-[180px] flex-shrink-0 text-text-secondary font-medium">Scanned</span>
              <span className="font-medium text-foreground">
                {scannedDate}
                <button
                  onClick={handleRescan}
                  disabled={rescanning}
                  className="ml-2 text-[11px] text-text-secondary font-normal hover:underline disabled:opacity-50"
                >
                  {rescanning ? "Rescanning…" : "Rescan"}
                </button>
              </span>
            </div>
            {/* Row 3: Status */}
            <div className="flex items-baseline py-2 border-b border-[#E5E7EB]">
              <span className="w-[180px] flex-shrink-0 text-text-secondary font-medium">Status</span>
              <span className="font-medium" style={{ color: statusColor }}>{statusLabel}</span>
            </div>
            {/* Row 4: Checks passed */}
            <div className="flex items-baseline py-2">
              <span className="w-[180px] flex-shrink-0 text-text-secondary font-medium">Checks passed</span>
              <span className="font-medium text-foreground">{passedChecks} of {totalChecks}</span>
            </div>
          </div>
        </div>

        {/* Part 3: Narrative */}
        <p className="text-[15px] text-[#4B5563] leading-[1.7] font-medium mb-5">
          {narrative}
        </p>

        {/* Part 4: Share/export toolbar */}
        <div className="flex items-center justify-between mb-10 text-[13px]">
          <div className="flex items-center gap-4 text-[#374151] font-medium">
            <button onClick={handleCopyLink} className="hover:text-[#111827] hover:underline cursor-pointer">
              {copied ? "✓ Copied" : "Copy URL"}
            </button>
            <span className="w-px h-[14px] bg-[#D1D5DB]" />
            <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#111827] hover:underline">
              Share on X
            </a>
            <span className="w-px h-[14px] bg-[#D1D5DB]" />
            <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#111827] hover:underline">
              Share on LinkedIn
            </a>
            <span className="w-px h-[14px] bg-[#D1D5DB]" />
            <DownloadReport slug={slug} domain={result.domain} />
            <span className="w-px h-[14px] bg-[#D1D5DB]" />
            <a
              href={`/api/report/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#111827] hover:underline"
            >
              Export JSON
            </a>
          </div>
          <a
            href="https://strale.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-medium text-white bg-[#185FA5] hover:bg-[#0C447C] px-[18px] py-2 rounded-md transition-colors whitespace-nowrap"
          >
            Visit Strale →
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

        {/* Divider + section heading */}
        <div className="border-t border-[#E5E7EB] pt-10 mb-6">
          <h2 className="text-[1.875rem] font-normal tracking-[-0.02em] leading-[2.25rem] text-foreground">
            What agents see
          </h2>
          <p className="mt-2 text-lg text-text-secondary">
            How AI agents discover, understand, and interact with your product.
          </p>
        </div>

        {/* Category rows — unified card */}
        <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] mb-10">
          {result.categories.map((cat, i) => (
            <div key={cat.category_id}>
              {i > 0 && <div className="border-t border-[#E5E7EB]" />}
              <div className="px-5 py-4">
                <CategoryBadge
                  label={cat.label}
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
                  <div className="ml-[18px] space-y-0">
                    {cat.checks.map((check) => (
                      <CheckDetail key={check.check_id} check={check} />
                    ))}
                    <CategoryProbeSummary checks={cat.checks} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Divider + action plan */}
        <div className="border-t border-[#E5E7EB] pt-10 mb-10">
          <ActionPlan result={result} slug={slug} />
        </div>

        {/* Subscribe — compact */}
        <div className="mb-8">
          <SubscribeForm domain={result.domain} />
        </div>

      </main>

      <Footer />
    </div>
  );
}
