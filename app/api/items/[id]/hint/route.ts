import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { resolveCapture } from "@/lib/resolve/pipeline";
import { applyResolutionToItem, markItemState, markResolutionFailed } from "@/lib/items";

// Contract 2 — the one-word hint loop. The hint re-enters the waterfall at
// T2 (ARCHITECTURE.md): original text + hint combined; if that still can't
// clear the confirm bar, the hint is tried alone and the better result wins.

const CONFIRM_BAR = 0.45;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const hint =
    typeof body.hint === "string" ? body.hint.trim().slice(0, 100) : "";
  if (!hint) {
    return NextResponse.json({ error: "hint_required" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: item, error } = await db
    .from("items")
    .select("id, state, who, captures(payload_type, payload_text)")
    .eq("id", id)
    .single();

  if (error || !item) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!["needs_hint", "needs_confirm", "raw"].includes(item.state)) {
    return NextResponse.json({ error: "not_hintable" }, { status: 409 });
  }

  const capture = Array.isArray(item.captures)
    ? item.captures[0]
    : item.captures;
  const baseText =
    capture?.payload_type === "text" ? (capture.payload_text ?? "") : "";

  await markItemState(db, id, "resolving");
  const onRetry = () => markItemState(db, id, "retrying");

  try {
    let result = await resolveCapture(
      "text",
      `${baseText} ${hint}`.trim(),
      item.who,
      { onRetry }
    );
    if (result.score < CONFIRM_BAR && baseText) {
      const hintAlone = await resolveCapture("text", hint, item.who, {
        onRetry,
      });
      if (hintAlone.score > result.score) result = hintAlone;
    }

    const updateError = await applyResolutionToItem(db, id, result, item.who);
    if (updateError) {
      return NextResponse.json(
        { error: "update_failed", detail: updateError },
        { status: 500 }
      );
    }
    return NextResponse.json({ id, state: result.state });
  } catch (e) {
    // Backend truth, not silence: the item goes back to needs_hint with
    // resolution_failed rather than staying stuck at "resolving".
    await markResolutionFailed(db, id, e);
    return NextResponse.json(
      { id, state: "needs_hint", error: "resolution_failed" },
      { status: 502 }
    );
  }
}
