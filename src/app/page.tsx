"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ScanResult, CheckResult } from "@/lib/checks/types";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScanFeed from "@/components/ScanFeed";

type ScanState = "idle" | "scanning" | "error";

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [error, setError] = useState("");
  const [scanResults, setScanResults] = useState<CheckResult[]>([]);
  const [totalChecks, setTotalChecks] = useState(20);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleScan = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please enter a URL");
      return;
    }

    let normalizedUrl: string;
    try {
      const withProtocol = trimmed.match(/^https?:\/\//) ? trimmed : `https://${trimmed}`;
      new URL(withProtocol);
      normalizedUrl = withProtocol;
    } catch {
      setError("Please enter a valid URL (e.g., stripe.com)");
      return;
    }

    setError("");
    setScanState("scanning");
    setScanResults([]);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Scan failed (${response.status})`);
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
      setTimeout(() => {
        router.push(`/results/${slug}`);
      }, animationTime + 500);
    } catch (err) {
      setScanState("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

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

      <main className="flex-1 flex flex-col items-center justify-center px-8">
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
              className="flex-1 h-12 px-5 text-base rounded-[4px] border border-border-strong bg-background text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleScan}
              disabled={scanState === "scanning"}
              className="h-12 px-8 bg-foreground text-background font-medium rounded-[4px] hover:bg-interactive-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
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
