"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import type { ScanResult, Tier } from "@/lib/checks/types";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import RadarChart from "@/components/RadarChart";
import CategoryBadge from "@/components/CategoryBadge";
import CheckDetail, { CategoryProbeSummary } from "@/components/CheckDetail";
import ActionPlan from "@/components/ActionPlan";
import ShareBar from "@/components/ShareBar";
import SubscribeForm from "@/components/SubscribeForm";
import DownloadReport from "@/components/DownloadReport";

function getCategorySummary(category: { tier: Tier; checks: { status: string; finding: string }[] }): string {
  const passCount = category.checks.filter((c) => c.status === "pass").length;
  const total = category.checks.length;

  if (category.tier === "green") {
    return `${passCount} of ${total} checks passed. Your product is well-prepared in this area.`;
  }
  if (category.tier === "red") {
    const firstFail = category.checks.find((c) => c.status === "fail");
    return firstFail?.finding || `Only ${passCount} of ${total} checks passed. Significant gaps found.`;
  }
  const firstWarnOrFail = category.checks.find((c) => c.status === "warn" || c.status === "fail");
  return firstWarnOrFail?.finding || `${passCount} of ${total} checks passed. Some improvements needed.`;
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
      // Silently fail — user can try again
    } finally {
      setRescanning(false);
    }
  };

  useEffect(() => {
    async function loadResults() {
      try {
        const response = await fetch(`/api/results/${slug}`);
        if (response.ok) {
          const data = await response.json();
          setResult(data as ScanResult);
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
      <div className="flex flex-col min-h-full">
        <Header />
        <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-8">
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
      <div className="flex flex-col min-h-full">
        <Header />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Scan not found</h1>
            <p className="mt-2 text-text-secondary">
              This scan doesn&apos;t exist or has expired. Try scanning again.
            </p>
            <a
              href="/"
              className="inline-block mt-4 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
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

  return (
    <div className="flex flex-col min-h-full">
      <Header />

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            {result.domain}
          </h1>
          <p className="mt-1 text-sm text-text-muted flex items-center justify-center gap-2 flex-wrap">
            <span>Scanned {scannedDate} · {result.scan_duration_ms}ms · v{result.scan_version}</span>
            <button
              onClick={handleRescan}
              disabled={rescanning}
              className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand-hover transition-colors disabled:opacity-50"
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
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                  Rescan
                </>
              )}
            </button>
          </p>
        </div>

        <div className="flex justify-center mb-6">
          <div className="block sm:hidden">
            <RadarChart
              categories={result.categories.map((c) => ({
                label: c.label,
                tier: c.tier,
              }))}
              size="md"
            />
          </div>
          <div className="hidden sm:block">
            <RadarChart
              categories={result.categories.map((c) => ({
                label: c.label,
                tier: c.tier,
              }))}
              size="lg"
            />
          </div>
        </div>

        <p className="text-center text-lg font-medium text-text-secondary mb-10">
          <span className="text-foreground font-bold">{greenCount} of {totalCategories}</span>
          {" areas agent-ready"}
        </p>

        <div className="space-y-2 mb-12">
          {result.categories.map((cat) => (
            <div key={cat.category_id}>
              <CategoryBadge
                label={cat.label}
                question={cat.question}
                tier={cat.tier}
                summary={getCategorySummary(cat)}
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

        <div className="mb-12">
          <ActionPlan result={result} />
        </div>

        <div className="mb-12">
          <SubscribeForm domain={result.domain} />
        </div>

        {/* Share and download */}
        <div className="mb-12 space-y-4">
          <ShareBar
            url={result.url}
            productName={result.domain}
            greenCount={greenCount}
            totalCategories={totalCategories}
          />
          <div className="flex justify-center">
            <DownloadReport slug={slug} domain={result.domain} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
