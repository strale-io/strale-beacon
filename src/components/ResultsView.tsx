"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [previousTiers, setPreviousTiers] = useState<Record<string, string> | null>(null);
  const [previousScannedAt, setPreviousScannedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [apiSuggestionDismissed, setApiSuggestionDismissed] = useState(false);
  const apiDomainSuggestion = searchParams.get("suggest") || null;

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
        <main className="flex-1 w-full max-w-[880px] mx-auto px-4 sm:px-8 py-8">
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

  // X (Twitter) share text — short, factual, no branding
  const xShareText =
    greenCount >= totalCategories - 1
      ? `${result.domain} — fully agent-ready. ${greenCount}/${totalCategories} areas ready.`
      : greenCount >= 1
        ? `${result.domain} — ${greenCount}/${totalCategories} areas agent-ready, room to improve.`
        : `${result.domain} — not set up for AI agents yet. Full report:`;
  const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(xShareText)}&url=${encodeURIComponent(shareUrl)}`;

  // LinkedIn share text — slightly longer
  const linkedinShareText = `I scanned ${result.domain} for AI agent readiness — ${greenCount}/${totalCategories} areas ready. The report shows what agents can and can't do with the product, with specific fixes for each gap.`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}&summary=${encodeURIComponent(linkedinShareText)}`;

  // Status label + color
  const statusLabel =
    greenCount >= totalCategories ? "Fully agent-ready" :
    greenCount >= 2 ? "Partially agent-ready" :
    "Not agent-ready";
  const statusColor =
    greenCount >= totalCategories ? "#15803D" :
    greenCount >= 2 ? "#B45309" :
    "#B91C1C";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 w-full max-w-[880px] mx-auto px-4 sm:px-8 py-8">
        {/* Part 1: Heading + subheading — canonical heading style from "How ready are you?" */}
        <div className="mb-8">
          <h1 className="text-[1.5rem] sm:text-[1.875rem] font-normal tracking-[-0.02em] leading-[1.8rem] sm:leading-[2.25rem] text-foreground">
            Agent-readiness report
          </h1>
          <p className="mt-2 text-lg text-text-secondary">
            How AI agents experience your product — from discovery to transaction.
          </p>
        </div>

        {/* Part 2: Score ring + summary table */}
        <div className="flex flex-col sm:flex-row gap-6 sm:gap-10 mb-7 items-center">
          <ScoreRing ready={greenCount} total={totalCategories} size={130} />
          <div className="flex-1 min-w-0 w-full text-[13px]">
            {/* Row 1: Site */}
            <div className="flex items-baseline py-2 border-b border-[#E5E7EB]">
              <span className="w-[120px] sm:w-[180px] flex-shrink-0 text-text-secondary font-medium">Site</span>
              <span className="font-medium text-foreground truncate">{result.domain}</span>
            </div>
            {/* Row 2: Scanned */}
            <div className="flex items-baseline py-2 border-b border-[#E5E7EB]">
              <span className="w-[120px] sm:w-[180px] flex-shrink-0 text-text-secondary font-medium">Scanned</span>
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
              <span className="w-[120px] sm:w-[180px] flex-shrink-0 text-text-secondary font-medium">Status</span>
              <span className="font-medium" style={{ color: statusColor }}>{statusLabel}</span>
            </div>
            {/* Row 4: Checks passed */}
            <div className="flex items-baseline py-2">
              <span className="w-[120px] sm:w-[180px] flex-shrink-0 text-text-secondary font-medium">Checks passed</span>
              <span className="font-medium text-foreground">{passedChecks} of {totalChecks}</span>
            </div>
          </div>
        </div>

        {/* Part 3: Narrative */}
        <div className="mb-5">
          {narrative.map((para, i) => (
            <p
              key={i}
              className={`text-[15px] text-[#4B5563] leading-[1.7] font-medium text-justify${i < narrative.length - 1 ? " mb-3" : ""}`}
            >
              {para}
            </p>
          ))}
        </div>

        {/* API domain suggestion banner */}
        {apiDomainSuggestion && !apiSuggestionDismissed && (
          <div
            className="mb-5 flex items-center justify-between gap-3 rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3"
            style={{ animation: "fade-in-up 0.3s ease-out both" }}
          >
            <p className="text-sm text-[#1E40AF] flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-[#1E40AF] text-[10px] font-semibold text-[#1E40AF] flex-shrink-0" style={{ lineHeight: 0, paddingTop: '1.5px' }}>i</span>
              <span>We found <span className="font-medium">{apiDomainSuggestion}</span> linked from this site.{" "}
              <a
                href={`/?url=${encodeURIComponent(apiDomainSuggestion)}`}
                onClick={(e) => {
                  e.preventDefault();
                  router.push(`/?url=${encodeURIComponent(apiDomainSuggestion)}`);
                }}
                className="font-medium underline underline-offset-2 hover:text-[#1E3A8A]"
              >
                Scan that instead →
              </a></span>
            </p>
            <button
              onClick={() => setApiSuggestionDismissed(true)}
              className="flex-shrink-0 text-[#1E40AF] hover:text-[#1E3A8A] text-lg leading-none"
              aria-label="Dismiss suggestion"
            >
              ×
            </button>
          </div>
        )}

        {/* Part 4: Share/export toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-[50px] text-[13px]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[#374151] font-medium">
            <button onClick={handleCopyLink} className="hover:text-[#111827] hover:underline cursor-pointer py-1">
              {copied ? "✓ Copied" : "Copy URL"}
            </button>
            <span className="w-px h-[14px] bg-[#D1D5DB] hidden sm:block" />
            <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#111827] hover:underline py-1">
              Share on X
            </a>
            <span className="w-px h-[14px] bg-[#D1D5DB] hidden sm:block" />
            <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#111827] hover:underline py-1">
              Share on LinkedIn
            </a>
            <span className="w-px h-[14px] bg-[#D1D5DB] hidden sm:block" />
            <DownloadReport slug={slug} domain={result.domain} />
            <span className="w-px h-[14px] bg-[#D1D5DB] hidden sm:block" />
            <a
              href={`/api/report/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#111827] hover:underline py-1"
            >
              Export JSON
            </a>
          </div>
          <a
            href="https://strale.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-medium text-white bg-[#185FA5] hover:bg-[#0C447C] px-[18px] py-2 rounded-md transition-colors whitespace-nowrap text-center sm:text-left"
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
        <div className="border-t border-[#E5E7EB] pt-[50px] mb-6">
          <h2 className="text-[1.5rem] sm:text-[1.875rem] font-normal tracking-[-0.02em] leading-[1.8rem] sm:leading-[2.25rem] text-foreground">
            What agents see
          </h2>
          <p className="mt-2 text-lg text-text-secondary">
            How AI agents discover, understand, and interact with your product.
          </p>
        </div>

        {/* Category rows — unified card */}
        <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] mb-[50px]">
          {result.categories.map((cat, i) => {
            const isFirst = i === 0;
            const isLast = i === result.categories.length - 1;
            const radius = isFirst && isLast ? "rounded-lg"
              : isFirst ? "rounded-t-lg"
              : isLast ? "rounded-b-lg"
              : "rounded-none";
            return (
            <div key={cat.category_id}>
              {i > 0 && <div className="border-t border-[#E5E7EB]" />}
              <div className={`px-3 sm:px-5 py-4 relative transition-[outline-color] duration-75 outline outline-1 -outline-offset-1 outline-transparent hover:outline-[#D1D5DB] hover:z-10 ${radius}`}>
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
                <div className="border-t border-[#E5E7EB] px-3 sm:px-5 py-3 bg-white">
                  <div className="sm:ml-[24px]">
                    {cat.checks.map((check) => (
                      <CheckDetail key={check.check_id} check={check} />
                    ))}
                    <CategoryProbeSummary checks={cat.checks} />
                  </div>
                </div>
              )}
            </div>
            );
          })}
        </div>

        {/* Divider + action plan */}
        <div className="border-t border-[#E5E7EB] pt-[50px] mb-[50px]">
          <ActionPlan result={result} slug={slug} />
        </div>

        {/* Divider + subscribe */}
        <div className="border-t border-[#E5E7EB] pt-[50px] mb-[50px]">
          <SubscribeForm domain={result.domain} />
        </div>

        {/* Divider + Strale CTA */}
        <div className="border-t border-[#E5E7EB] pt-[50px] mb-[50px]">
          <h2 className="text-[1.5rem] sm:text-[1.875rem] font-normal tracking-[-0.02em] leading-[1.8rem] sm:leading-[2.25rem] text-foreground">
            Let agents do more
          </h2>
          <p className="mt-2 text-lg text-text-secondary">
            <span className="text-[#185FA5]">Beacon</span> shows you what agents see. <span className="text-[#185FA5]">Strale</span> is where they act.
          </p>

          <div className="mt-5 bg-[#F9FAFB] rounded-lg p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6">
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-foreground mb-2">
                Strale — trust and quality infrastructure for AI agents
              </p>
              <p className="text-[13px] text-text-secondary leading-[1.6]">
                Strale is a capability marketplace where AI agents access 250+ verified tools at runtime — company lookups, compliance checks, financial data, and more. Every capability is continuously tested and quality-scored.
              </p>
            </div>
            <a
              href="https://strale.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-[13px] font-medium text-white bg-[#185FA5] hover:bg-[#0C447C] px-[18px] py-2 rounded-md transition-colors whitespace-nowrap text-center"
            >
              Visit Strale →
            </a>
          </div>
        </div>

        {/* Divider before footer */}
        <div className="border-t border-[#E5E7EB] pt-[50px]" />
      </main>

      <Footer />
    </div>
  );
}
