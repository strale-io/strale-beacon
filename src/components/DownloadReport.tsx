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
      className="hover:text-[#111827] hover:underline transition-colors disabled:opacity-50"
    >
      {loading ? "Generating…" : "PDF"}
    </button>
  );
}
