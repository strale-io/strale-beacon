import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import { fetchScanBySlug } from "@/lib/supabase";
import type { Tier } from "@/lib/checks/types";

export const runtime = "edge";

const TIER_CONFIG: Record<Tier, { label: string; bg: string; text: string; dot: string }> = {
  green: { label: "Ready", bg: "#F0FDF4", text: "#15803D", dot: "#15803D" },
  yellow: { label: "Partial", bg: "#FEFCE8", text: "#B45309", dot: "#B45309" },
  red: { label: "Not Ready", bg: "#FEF2F2", text: "#B91C1C", dot: "#B91C1C" },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const scan = await fetchScanBySlug(slug);

  if (!scan) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#ffffff",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ fontSize: 32, color: "#6B7280" }}>Scan not found</div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  const result = scan.results;
  const greenCount = result.categories.filter((c) => c.tier === "green").length;
  const total = result.categories.length;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#ffffff",
          fontFamily: "system-ui, sans-serif",
          padding: "48px 64px",
        }}
      >
        {/* Header — strale in dark, beacon in grey */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span style={{ fontSize: 24, fontWeight: 600, color: "#111827", letterSpacing: "-0.025em" }}>
            strale
          </span>
          <span style={{ fontSize: 24, fontWeight: 600, color: "#9CA3AF", letterSpacing: "-0.025em" }}>
            beacon
          </span>
        </div>

        {/* Domain name */}
        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: "24px",
          }}
        >
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: "#111827",
              letterSpacing: "-0.02em",
            }}
          >
            {result.domain}
          </div>

          {/* Tier badges row */}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", justifyContent: "center" }}>
            {result.categories.map((cat) => {
              const config = TIER_CONFIG[cat.tier];
              return (
                <div
                  key={cat.category_id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    backgroundColor: config.bg,
                  }}
                >
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      backgroundColor: config.dot,
                    }}
                  />
                  <span style={{ fontSize: 16, fontWeight: 600, color: config.text }}>
                    {cat.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div style={{ fontSize: 28, color: "#6B7280", display: "flex", gap: "6px" }}>
            <span style={{ fontWeight: 700, color: "#111827" }}>
              {greenCount} of {total}
            </span>
            <span>areas agent-ready</span>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 16, color: "#9CA3AF" }}>
            scan.strale.io
          </span>
          <span style={{ fontSize: 16, color: "#9CA3AF" }}>
            Agent-Readiness Report
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
