import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

// Contract 2 — the Receipt API (ARCHITECTURE.md). Chronological, no
// filters, no search (PLAN.md 1.4 fence).

export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("items")
    .select(
      "id, state, title, year, media_type, poster_ref, confidence, who, created_at, captures(payload_type, payload_text, source, captured_at)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}
