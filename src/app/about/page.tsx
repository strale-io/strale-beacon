import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "About — Strale Beacon",
  description: "What Beacon checks, how scoring works, and why agent-readiness matters.",
};

const CATEGORIES = [
  { name: "Discoverability", question: "Can agents find you?" },
  { name: "Comprehension", question: "Can agents understand what you do?" },
  { name: "Usability", question: "Can agents interact with you?" },
  { name: "Stability", question: "Can agents depend on you?" },
  { name: "Agent Experience", question: "What happens when an agent shows up?" },
  { name: "Transactability", question: "Can agents do business with you?" },
];

export default function AboutPage() {
  return (
    <div className="flex flex-col min-h-full">
      <Header />

      <main className="flex-1 w-full max-w-[640px] mx-auto px-6 sm:px-8 py-16 sm:py-20">

        {/* What is Beacon? */}
        <h1 className="text-[26px] sm:text-[32px] font-semibold text-foreground tracking-tight leading-tight">
          What is Beacon?
        </h1>

        <div className="mt-6 space-y-4 text-[16px] text-[#374151] leading-[1.7]">
          <p>
            AI agents are becoming the primary way software discovers and interacts with
            other software. They don&apos;t browse websites — they search registries, read
            machine-readable descriptions, and evaluate APIs programmatically.
          </p>
          <p>
            Most products aren&apos;t ready for this. They have marketing sites designed
            for humans but nothing for machines. No llms.txt, no MCP server, no structured
            data that tells an agent what the product does or how to use it.
          </p>
          <p>
            Beacon tells you exactly where you stand — and how to fix it. It runs 25 automated
            checks across 6 categories and produces a detailed report with specific, actionable
            remediation steps.
          </p>
        </div>

        {/* What we check */}
        <h2 className="mt-16 text-[22px] font-semibold text-foreground tracking-tight">
          What we check
        </h2>

        <div className="mt-6 space-y-3">
          {CATEGORIES.map((cat) => (
            <div key={cat.name} className="flex flex-col sm:flex-row sm:gap-4">
              <span className="text-sm font-semibold text-foreground sm:w-[160px] sm:flex-shrink-0 sm:pt-0.5">
                {cat.name}
              </span>
              <span className="text-sm text-text-secondary">
                {cat.question}
              </span>
            </div>
          ))}
        </div>

        {/* How scoring works */}
        <h2 className="mt-16 text-[22px] font-semibold text-foreground tracking-tight">
          How scoring works
        </h2>

        <div className="mt-6 space-y-4 text-[16px] text-[#374151] leading-[1.7]">
          <p>
            Each category is assessed independently as{" "}
            <span className="inline-flex items-center gap-1 text-sm font-medium text-tier-green-text bg-tier-green-light px-1.5 py-0.5 rounded">Ready</span>,{" "}
            <span className="inline-flex items-center gap-1 text-sm font-medium text-tier-yellow-text bg-tier-yellow-light px-1.5 py-0.5 rounded">Partial</span>, or{" "}
            <span className="inline-flex items-center gap-1 text-sm font-medium text-tier-red-text bg-tier-red-light px-1.5 py-0.5 rounded">Not Ready</span>.
            There is no aggregate score — the five independent assessments give you a clear
            picture of where to focus.
          </p>
          <p>
            Results are available in three formats: a web page with expandable findings,
            a downloadable PDF report suitable for sharing with engineering leads, and a
            structured JSON report designed for LLM-powered remediation — paste it into
            Claude or ChatGPT and say &ldquo;fix everything.&rdquo;
          </p>
        </div>

        {/* See it in action */}
        <h2 className="mt-16 text-[22px] font-semibold text-foreground tracking-tight">
          See it in action
        </h2>

        <p className="mt-6 text-[16px] text-[#374151] leading-[1.7]">
          Here&apos;s what Beacon found when we scanned our own API:{" "}
          <a
            href="/results/api-strale-io"
            className="text-foreground underline decoration-border-strong underline-offset-[3px] hover:decoration-foreground transition-colors"
          >
            api.strale.io scan results&nbsp;&rarr;
          </a>
        </p>

        {/* About Strale */}
        <h2 className="mt-16 text-[22px] font-semibold text-foreground tracking-tight">
          About Strale
        </h2>

        <div className="mt-6 space-y-4 text-[16px] text-[#374151] leading-[1.7]">
          <p>
            Beacon is built by{" "}
            <a
              href="https://strale.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline decoration-border-strong underline-offset-[3px] hover:decoration-foreground transition-colors"
            >
              Strale
            </a>
            {" — "}the trust layer for the agent economy. Strale provides quality-scored
            capabilities that AI agents can discover and use at runtime.
          </p>
          <p>
            Contact:{" "}
            <a
              href="mailto:hello@strale.io"
              className="text-foreground underline decoration-border-strong underline-offset-[3px] hover:decoration-foreground transition-colors"
            >
              hello@strale.io
            </a>
          </p>
        </div>

      </main>

      <Footer />
    </div>
  );
}
