"use client";

import { useState } from "react";

interface DownloadReportProps {
  slug: string;
  domain: string;
}

export default function DownloadReport({ slug, domain }: DownloadReportProps) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/pdf/${slug}`);
      if (!response.ok) throw new Error("Failed to generate PDF");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `beacon-report-${domain}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-[4px] border border-border-strong bg-background text-foreground hover:bg-surface transition-colors disabled:opacity-50"
    >
      {loading ? (
        <>
          <span
            className="block w-4 h-4 border-2 border-text-muted border-t-transparent rounded-full"
            style={{ animation: "spin-slow 0.8s linear infinite" }}
          />
          Generating report...
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Download PDF report
        </>
      )}
    </button>
  );
}
