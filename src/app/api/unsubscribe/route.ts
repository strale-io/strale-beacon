import { NextRequest, NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { verifyUnsubscribeToken } from "@/lib/email/tokens";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return htmlResponse("Missing unsubscribe token.", 400);
  }

  if (!isSupabaseConfigured()) {
    return htmlResponse("Service unavailable.", 503);
  }

  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    return htmlResponse("Invalid or expired unsubscribe link.", 400);
  }

  // Find the domain_id for this domain
  const { data: domainRow } = await supabase
    .from("domains")
    .select("id")
    .eq("domain", payload.domain)
    .single();

  if (!domainRow) {
    return htmlResponse("Domain not found.", 404);
  }

  // Set unsubscribed_at
  const { error } = await supabase
    .from("subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("email", payload.email)
    .eq("domain_id", domainRow.id)
    .is("unsubscribed_at", null);

  if (error) {
    console.error("Unsubscribe error:", error);
    return htmlResponse("Something went wrong. Please try again.", 500);
  }

  return htmlResponse(
    `You've been unsubscribed from Beacon notifications for <strong>${escapeHtml(payload.domain)}</strong>.`,
    200
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function htmlResponse(message: string, status: number): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe — Strale Beacon</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #fff; color: #111827; }
    .card { text-align: center; max-width: 400px; padding: 2rem; }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem; }
    p { font-size: 0.9375rem; color: #6B7280; line-height: 1.6; }
    a { color: #111827; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Strale Beacon</h1>
    <p>${message}</p>
    <p style="margin-top: 1.5rem;"><a href="https://scan.strale.io">Back to Beacon</a></p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
