"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ScanResult, CheckResult } from "@/lib/checks/types";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScanFeed from "@/components/ScanFeed";
import RadarChart from "@/components/RadarChart";

type ScanState = "idle" | "scanning" | "error";

const CATEGORIES = [
  { label: "Discoverability", question: "Can agents find you?", icon: "🔍" },
  { label: "Comprehension", question: "Can agents understand what you do?", icon: "🧠" },
  { label: "Usability", question: "Can agents interact with you?", icon: "🔗" },
  { label: "Stability", question: "Can agents depend on you?", icon: "🛡️" },
  { label: "Agent Experience", question: "What happens when an agent shows up?", icon: "🤖" },
];

const SAMPLE_RESULT = {
  categories: [
    { label: "Discoverability", tier: "green" as const },
    { label: "Comprehension", tier: "yellow" as const },
    { label: "Usability", tier: "yellow" as const },
    { label: "Stability", tier: "green" as const },
    { label: "Agent Experience", tier: "red" as const },
  ],
};

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

    // Basic URL validation
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

      // Collect all check results for the feed animation
      const allChecks: CheckResult[] = [];
      for (const cat of (result as ScanResult).categories) {
        for (const check of cat.checks) {
          allChecks.push(check);
        }
      }
      setTotalChecks(allChecks.length);
      setScanResults(allChecks);

      // Wait for the feed animation to mostly finish, then redirect
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
    <div className="flex flex-col min-h-full">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />

      <main className="flex-1 flex flex-col">
        {/* Hero section */}
        <section className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-16 sm:py-24">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground text-center tracking-tight max-w-2xl">
            How visible is your product to AI agents?
          </h1>
          <p className="mt-4 text-lg text-text-secondary text-center max-w-xl">
            Beacon scans your site and shows you exactly what agents see — and what they&apos;re missing.
          </p>

          {/* Scan input */}
          <div className="mt-8 w-full max-w-lg">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter your URL"
                disabled={scanState === "scanning"}
                className="flex-1 h-12 px-4 text-base rounded-lg border border-border bg-background text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleScan}
                disabled={scanState === "scanning"}
                className="h-12 px-6 bg-brand text-white font-medium rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {scanState === "scanning" ? "Scanning..." : "Scan"}
              </button>
            </div>

            {/* Error message */}
            {error && scanState !== "scanning" && (
              <p className="mt-2 text-sm text-tier-red">{error}</p>
            )}

            {/* Retry on error */}
            {scanState === "error" && (
              <button
                onClick={() => { setScanState("idle"); setError(""); }}
                className="mt-2 text-sm text-brand hover:underline"
              >
                Try again
              </button>
            )}
          </div>

          {/* Scan feed (visible during scanning) */}
          {scanState === "scanning" && (
            <div className="mt-8 w-full max-w-lg" style={{ animation: "fade-in-up 0.3s ease-out both" }}>
              <ScanFeed
                results={scanResults}
                scanning={scanResults.length === 0}
                totalChecks={totalChecks}
              />
            </div>
          )}
        </section>

        {/* Below the fold */}
        {scanState === "idle" && (
          <section className="border-t border-border bg-surface">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
              <h2 className="text-xl font-bold text-foreground text-center mb-8">
                What Beacon checks
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {CATEGORIES.map((cat) => (
                  <div key={cat.label} className="p-4 bg-background rounded-lg border border-border">
                    <div className="text-2xl mb-2">{cat.icon}</div>
                    <h3 className="font-semibold text-foreground">{cat.label}</h3>
                    <p className="mt-1 text-sm text-text-secondary">{cat.question}</p>
                  </div>
                ))}

                {/* Sample radar chart card */}
                <div className="p-4 bg-background rounded-lg border border-border sm:col-span-2 lg:col-span-3 flex flex-col items-center">
                  <p className="text-sm text-text-muted mb-4">Example scan result</p>
                  <RadarChart
                    categories={SAMPLE_RESULT.categories}
                    size="md"
                    animate={false}
                  />
                  <p className="mt-3 text-sm text-text-secondary">
                    2 of 5 areas agent-ready
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
