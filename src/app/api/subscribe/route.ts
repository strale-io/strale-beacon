import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabase, supabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { email, domain } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Missing required field: email" },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Look up the domain to get domain_id and current green_count
    let domainId: string | null = null;
    let greenCount: number | null = null;

    if (domain && typeof domain === "string") {
      const { data: domainRow } = await supabase
        .from("domains")
        .select("id")
        .eq("domain", domain)
        .single();

      if (domainRow) {
        domainId = domainRow.id;

        // Get latest scan's green_count
        const { data: latestScan } = await supabase
          .from("scans")
          .select("green_count")
          .eq("domain_id", domainId)
          .order("scanned_at", { ascending: false })
          .limit(1)
          .single();

        if (latestScan) {
          greenCount = latestScan.green_count;
        }
      }
    }

    const { error } = await supabaseAdmin.from("subscribers").insert({
      email,
      domain_id: domainId,
      previous_green_count: greenCount,
    });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({
          success: true,
          alreadySubscribed: true,
        });
      }
      console.error("Subscribe error:", error);
      return NextResponse.json(
        { error: "Failed to subscribe" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      alreadySubscribed: false,
    });
  } catch (err) {
    console.error("Subscribe error:", err);
    return NextResponse.json(
      { error: "Failed to subscribe" },
      { status: 500 }
    );
  }
}
