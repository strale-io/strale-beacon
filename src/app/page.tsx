"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ScanResult, CheckResult } from "@/lib/checks/types";
import { normalizeUrl } from "@/lib/normalize-url";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScanFeed from "@/components/ScanFeed";

type ScanState = "idle" | "scanning" | "error";

export default function Home() {
  return (
    <Suspense>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [url, setUrl] = useState("");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [error, setError] = useState("");
  const [scanResults, setScanResults] = useState<CheckResult[]>([]);
  const [totalChecks, setTotalChecks] = useState(20);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoScanTriggered = useRef(false);

  const handleScan = async (overrideUrl?: string) => {
    const inputValue = overrideUrl || url;
    let normalized;
    try {
      normalized = normalizeUrl(inputValue);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please enter a valid URL");
      return;
    }

    setError("");
    setScanState("scanning");
    setScanResults([]);

    // Try primary URL, then fallbacks for bare-word inputs
    const urlsToTry = [normalized.url, ...normalized.fallbacks];
    let lastError = "";

    for (const candidateUrl of urlsToTry) {
      try {
        const response = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: candidateUrl }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          lastError = body.error || `Scan failed (${response.status})`;
          continue;
        }

        const result = await response.json();
        const slug = result.slug as string;

        const allChecks: CheckResult[] = [];
        for (const cat of (result as ScanResult).categories) {
          for (const check of cat.checks) {
            allChecks.push(check);
          }
        }
        setTotalChecks(allChecks.length);
        setScanResults(allChecks);

        const animationTime = Math.min(allChecks.length * 150, 3000);
        const apiSuggestion = result.apiDomainSuggestion as string | undefined;
        const query = apiSuggestion ? `?suggest=${encodeURIComponent(apiSuggestion)}` : "";
        setTimeout(() => {
          router.push(`/results/${slug}${query}`);
        }, animationTime + 500);
        return; // success — stop trying
      } catch {
        lastError = `Couldn't reach ${new URL(candidateUrl).hostname}. Check the domain and try again.`;
        continue;
      }
    }

    // All candidates failed
    setScanState("error");
    const displayDomain = urlsToTry.length === 1
      ? new URL(urlsToTry[0]).hostname
      : inputValue.trim();
    setError(`Couldn't reach ${displayDomain}. Check the domain and try again.`);
  };

  // Auto-scan if ?url= is present (from API domain suggestion link)
  useEffect(() => {
    const urlParam = searchParams.get("url");
    if (urlParam && !autoScanTriggered.current) {
      autoScanTriggered.current = true;
      setUrl(urlParam);
      handleScan(urlParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleScan();
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Strale Beacon",
    description: "Free agent-readiness scanner for SaaS products and APIs",
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://scan.strale.io",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    creator: { "@type": "Organization", name: "Strale", url: "https://strale.dev" },
  };

  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />

      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8">
        <h1 className="text-3xl sm:text-4xl lg:text-[3.25rem] font-medium text-foreground text-center tracking-[-0.03em] leading-[1.1] max-w-2xl">
          Is your product ready for AI agents?
        </h1>
        <p className="mt-5 text-lg text-text-secondary text-center max-w-[600px] leading-relaxed">
          Beacon scans your site and shows you exactly what agents see — and what they&apos;re missing.
        </p>

        {/* Scan input */}
        <div className="mt-10 w-full max-w-lg">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your URL"
              disabled={scanState === "scanning"}
              className="w-full sm:flex-1 h-12 px-5 text-base rounded-[4px] border border-border-strong bg-background text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={() => handleScan()}
              disabled={scanState === "scanning"}
              className="w-full sm:w-auto h-12 px-8 bg-foreground text-background font-medium rounded-[4px] hover:bg-interactive-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {scanState === "scanning" ? "Scanning..." : "Scan"}
            </button>
          </div>

          {error && scanState !== "scanning" && (
            <p className="mt-2 text-sm text-tier-red">{error}</p>
          )}

          {scanState === "error" && (
            <button
              onClick={() => { setScanState("idle"); setError(""); }}
              className="mt-2 text-sm text-foreground underline decoration-border-strong underline-offset-2 hover:decoration-foreground"
            >
              Try again
            </button>
          )}
        </div>

        {/* Scan feed */}
        {scanState === "scanning" && (
          <div className="mt-8 w-full max-w-lg" style={{ animation: "fade-in-up 0.3s ease-out both" }}>
            <ScanFeed
              results={scanResults}
              scanning={scanResults.length === 0}
              totalChecks={totalChecks}
            />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
