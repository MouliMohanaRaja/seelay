import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

// Contract 2 — one-tap confirmation for needs_confirm items.

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("items")
    .update({ state: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("state", "needs_confirm")
    .select("id, state")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "not_confirmable", detail: error?.message },
      { status: 409 }
    );
  }
  return NextResponse.json({ id: data.id, state: data.state });
}
