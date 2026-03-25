import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/url";
import "./globals.css";

const BASE_URL = getSiteUrl();

export const metadata: Metadata = {
  title: "Strale Beacon — Is your product ready for AI agents?",
  description:
    "Free agent-readiness scanner. See what AI agents can discover, understand, and do with your product. 32 checks across 6 categories.",
  metadataBase: new URL(BASE_URL),
  openGraph: {
    title: "Strale Beacon — Is your product ready for AI agents?",
    description:
      "Free agent-readiness scanner. See what AI agents can discover, understand, and do with your product. 32 checks across 6 categories.",
    type: "website",
    url: BASE_URL,
    siteName: "Strale Beacon",
  },
  twitter: {
    card: "summary_large_image",
    title: "Strale Beacon — Is your product ready for AI agents?",
    description:
      "Free agent-readiness scanner. See what AI agents can discover, understand, and do with your product. 32 checks across 6 categories.",
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
      <body className="min-h-full flex flex-col font-sans overflow-x-hidden">{children}</body>
    </html>
  );
}
