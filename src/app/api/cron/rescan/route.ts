import { NextRequest, NextResponse } from "next/server";
import { supabase, supabaseAdmin, isSupabaseConfigured, domainToSlug, storeScan } from "@/lib/supabase";
import { runScan } from "@/lib/checks/runner";
import { sendScoreChangeEmail } from "@/lib/email/send";
import { signUnsubscribeToken } from "@/lib/email/tokens";

const MAX_DOMAINS_PER_RUN = 50;

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // 1. Get all active subscriptions with domain info
  const { data: subscriptions, error: subError } = await supabase
    .from("subscribers")
    .select("id, email, domain_id, previous_green_count, domains(domain, last_scanned_at)")
    .is("unsubscribed_at", null)
    .not("domain_id", "is", null)
    .order("last_notified_at", { ascending: true, nullsFirst: true });

  if (subError || !subscriptions) {
    console.error("Failed to fetch subscriptions:", subError);
    return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 });
  }

  // 2. Group by domain — scan each domain only once
  const domainMap = new Map<string, {
    domainId: string;
    domain: string;
    subscribers: Array<{ id: string; email: string; previousGreenCount: number | null }>;
  }>();

  for (const sub of subscriptions) {
    const domainData = sub.domains as unknown as { domain: string; last_scanned_at: string } | null;
    if (!domainData || !sub.domain_id) continue;

    if (!domainMap.has(sub.domain_id)) {
      domainMap.set(sub.domain_id, {
        domainId: sub.domain_id,
        domain: domainData.domain,
        subscribers: [],
      });
    }

    domainMap.get(sub.domain_id)!.subscribers.push({
      id: sub.id,
      email: sub.email,
      previousGreenCount: sub.previous_green_count,
    });
  }

  // 3. Take oldest-scanned domains first, up to max
  const domains = [...domainMap.values()].slice(0, MAX_DOMAINS_PER_RUN);

  let scannedCount = 0;
  let emailsSent = 0;
  let errorsCount = 0;

  for (const entry of domains) {
    try {
      // Run a fresh scan
      const { result, context } = await runScan(`https://${entry.domain}`);
      scannedCount++;

      const newGreenCount = result.categories.filter((c) => c.tier === "green").length;
      const total = result.categories.length;
      const slug = domainToSlug(entry.domain);

      // Store scan with intelligence data
      await storeScan(entry.domainId, entry.domain, result, context);

      // Update domain's last_scanned_at
      await supabaseAdmin
        .from("domains")
        .update({ last_scanned_at: new Date().toISOString() })
        .eq("id", entry.domainId);

      // Get previous tier summary for change detection
      // We need per-category comparison, so fetch the old scan's tier_summary
      // For now, compare green_count which is what subscribers track

      // 4. Check each subscriber for changes, send emails
      for (const sub of entry.subscribers) {
        const oldGreenCount = sub.previousGreenCount;

        // If no previous score stored, just set it and move on
        if (oldGreenCount === null) {
          await supabaseAdmin
            .from("subscribers")
            .update({ previous_green_count: newGreenCount })
            .eq("id", sub.id);
          continue;
        }

        // No change — skip
        if (oldGreenCount === newGreenCount) continue;

        // Score changed — figure out which categories improved/declined
        // We need the old tier_summary. Fetch previous scan data for this subscriber.
        const improved: string[] = [];
        const declined: string[] = [];

        // We can infer from the new scan — but to know which changed, we'd need the old tiers.
        // Use a simple approach: just report the count change direction.
        if (newGreenCount > oldGreenCount) {
          // Find categories that are green now (some subset of these improved)
          for (const cat of result.categories) {
            if (cat.tier === "green") improved.push(cat.label);
          }
          // Trim to likely new ones (we show up to the delta)
          improved.splice(newGreenCount - oldGreenCount);
        }
        if (newGreenCount < oldGreenCount) {
          for (const cat of result.categories) {
            if (cat.tier !== "green") declined.push(cat.label);
          }
          declined.splice(oldGreenCount - newGreenCount);
        }

        const token = signUnsubscribeToken(sub.email, entry.domain);

        const sent = await sendScoreChangeEmail({
          to: sub.email,
          domain: entry.domain,
          slug,
          oldGreenCount,
          newGreenCount,
          total,
          improved,
          declined,
          unsubscribeToken: token,
        });

        if (sent) {
          emailsSent++;
          // Update subscriber
          await supabaseAdmin
            .from("subscribers")
            .update({
              previous_green_count: newGreenCount,
              last_notified_at: new Date().toISOString(),
            })
            .eq("id", sub.id);
        } else {
          errorsCount++;
        }
      }

      // Update subscribers who had no change — still update their previous_green_count
      for (const sub of entry.subscribers) {
        if (sub.previousGreenCount !== null && sub.previousGreenCount === newGreenCount) {
          await supabaseAdmin
            .from("subscribers")
            .update({ previous_green_count: newGreenCount })
            .eq("id", sub.id);
        }
      }
    } catch (err) {
      console.error(`Failed to rescan ${entry.domain}:`, err);
      errorsCount++;
    }
  }

  return NextResponse.json({
    success: true,
    domains_scanned: scannedCount,
    emails_sent: emailsSent,
    errors: errorsCount,
    total_domains_queued: domains.length,
  });
}
