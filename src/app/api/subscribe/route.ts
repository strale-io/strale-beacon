import { NextRequest, NextResponse } from "next/server";
import { subscribeEmail, isSupabaseConfigured } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { email, domain_id } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Missing required field: email" },
        { status: 400 }
      );
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    const result = await subscribeEmail(email, domain_id);

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to subscribe" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      alreadySubscribed: result.alreadySubscribed || false,
    });
  } catch (err) {
    console.error("Subscribe error:", err);
    return NextResponse.json(
      { error: "Failed to subscribe" },
      { status: 500 }
    );
  }
}
