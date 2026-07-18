import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { resolveCapture } from "@/lib/resolve/pipeline";
import { applyResolutionToItem } from "@/lib/items";

// PLAN.md 1.2 — capture API. Law 1: store the raw capture before anything
// else. Law 2: capture never blocks — no resolution here, ever (fence).

const VALID_SOURCES = new Set([
  "instagram",
  "whatsapp",
  "web",
  "manual",
  "unknown",
]);

export async function POST(req: Request) {
  const started = Date.now();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const payloadType = body.payload_type;
  const payload = body.payload;

  if (payloadType === "image") {
    // Fence: images are not accepted until PLAN.md step 2.1.
    return NextResponse.json(
      { error: "images_not_yet_supported", see: "PLAN.md 2.1" },
      { status: 400 }
    );
  }
  if (payloadType !== "url" && payloadType !== "text") {
    return NextResponse.json(
      { error: "payload_type_must_be_url_or_text" },
      { status: 400 }
    );
  }
  if (typeof payload !== "string" || payload.trim().length === 0) {
    return NextResponse.json(
      { error: "payload_must_be_nonempty_string" },
      { status: 400 }
    );
  }
  if (payload.length > 8000) {
    return NextResponse.json({ error: "payload_too_long" }, { status: 400 });
  }

  const source =
    typeof body.source === "string" && VALID_SOURCES.has(body.source)
      ? body.source
      : "unknown";
  const whoHint =
    typeof body.who_hint === "string" && body.who_hint.trim().length > 0
      ? body.who_hint.trim().slice(0, 200)
      : null;

  const db = supabaseAdmin();

  // Law 1: the capture row is the thing that must never fail silently.
  const { data: capture, error: captureError } = await db
    .from("captures")
    .insert({
      payload_type: payloadType,
      payload_text: payload.trim(),
      source,
      who_hint: whoHint,
    })
    .select("id, captured_at")
    .single();

  if (captureError || !capture) {
    return NextResponse.json(
      { error: "capture_failed", detail: captureError?.message },
      { status: 500 }
    );
  }

  // A raw item makes the catch visible on the receipt (1.4) before any
  // resolution exists. It is interpretation, not evidence — Law 2 lets it
  // happen after the response so the capture gesture never waits on it.
  // The waterfall (T0–T2, no LLM) then upgrades the item's state; on any
  // failure the item stays raw — visible, never lost, never guessed (Law 3).
  after(async () => {
    const { data: item, error: itemError } = await db
      .from("items")
      .insert({ capture_id: capture.id, state: "raw", who: whoHint })
      .select("id")
      .single();
    if (itemError || !item) {
      console.error(
        `raw item creation failed for capture ${capture.id}: ${itemError?.message}`
      );
      return;
    }
    try {
      const result = await resolveCapture(payloadType, payload.trim(), whoHint);
      const updateError = await applyResolutionToItem(
        db,
        item.id,
        result,
        whoHint
      );
      if (updateError) {
        console.error(
          `item update failed for capture ${capture.id}: ${updateError}`
        );
      }
    } catch (e) {
      console.error(`resolution failed for capture ${capture.id}:`, e);
    }
  });

  return NextResponse.json(
    { capture_id: capture.id, state: "raw", ms: Date.now() - started },
    { status: 201 }
  );
}
