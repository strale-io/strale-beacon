import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/url";
import "./globals.css";

const BASE_URL = getSiteUrl();

export const metadata: Metadata = {
  title: "Strale Beacon — How Visible Is Your Product to AI Agents?",
  description:
    "Free agent-readiness scanner. Beacon checks your site across 5 categories and shows you exactly what AI agents see — and what they're missing.",
  metadataBase: new URL(BASE_URL),
  openGraph: {
    title: "Strale Beacon — How Visible Is Your Product to AI Agents?",
    description:
      "Free agent-readiness scanner. Beacon checks your site across 5 categories and shows you exactly what AI agents see — and what they're missing.",
    type: "website",
    url: BASE_URL,
    siteName: "Strale Beacon",
  },
  twitter: {
    card: "summary_large_image",
    title: "Strale Beacon — How Visible Is Your Product to AI Agents?",
    description:
      "Free agent-readiness scanner. Beacon checks your site across 5 categories and shows you exactly what AI agents see — and what they're missing.",
    site: "@strale_io",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
