import { NextResponse, after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-server";
import { resolveCapture } from "@/lib/resolve/pipeline";
import { applyResolutionToItem, markItemState, markResolutionFailed } from "@/lib/items";
import {
  ensureCapturesBucket,
  uploadCaptureImage,
  downloadCaptureImage,
  isAllowedImageType,
  extForType,
  MAX_IMAGE_BYTES,
} from "@/lib/storage";
import type { PayloadType } from "@/lib/resolve/types";

// PLAN.md 1.2 + 2.1 — capture API. Law 1: store the raw capture before
// anything else. Law 2: capture never blocks — resolution runs in after().

const VALID_SOURCES = new Set([
  "instagram",
  "whatsapp",
  "web",
  "manual",
  "unknown",
]);

function pickSource(raw: unknown): string {
  return typeof raw === "string" && VALID_SOURCES.has(raw) ? raw : "unknown";
}

function pickWhoHint(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim().length > 0
    ? raw.trim().slice(0, 200)
    : null;
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return handleImageCapture(req);
  }
  return handleTextCapture(req);
}

async function handleTextCapture(req: Request) {
  const started = Date.now();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const payloadType = body.payload_type;
  const payload = body.payload;

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

  const db = supabaseAdmin();

  // Law 1: the capture row is the thing that must never fail silently.
  const { data: capture, error: captureError } = await db
    .from("captures")
    .insert({
      payload_type: payloadType,
      payload_text: payload.trim(),
      source: pickSource(body.source),
      who_hint: pickWhoHint(body.who_hint),
    })
    .select("id")
    .single();

  if (captureError || !capture) {
    return NextResponse.json(
      { error: "capture_failed", detail: captureError?.message },
      { status: 500 }
    );
  }

  scheduleResolution(db, capture.id, pickWhoHint(body.who_hint), {
    payloadType,
    text: payload.trim(),
  });

  return NextResponse.json(
    { capture_id: capture.id, state: "raw", ms: Date.now() - started },
    { status: 201 }
  );
}

async function handleImageCapture(req: Request) {
  const started = Date.now();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "image_required" }, { status: 400 });
  }
  if (!isAllowedImageType(file.type)) {
    return NextResponse.json(
      { error: "unsupported_image_type", type: file.type },
      { status: 400 }
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "empty_image" }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "image_too_large" }, { status: 400 });
  }

  const whoHint = pickWhoHint(form.get("who_hint"));
  const db = supabaseAdmin();

  // Store the image bytes (evidence) before the row that references them.
  const path = `${crypto.randomUUID()}.${extForType(file.type)}`;
  try {
    await ensureCapturesBucket(db);
    await uploadCaptureImage(db, path, await file.arrayBuffer(), file.type);
  } catch (e) {
    return NextResponse.json(
      { error: "image_store_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }

  // Law 1: the capture row must never fail silently.
  const { data: capture, error: captureError } = await db
    .from("captures")
    .insert({
      payload_type: "image",
      payload_image_ref: path,
      source: pickSource(form.get("source")),
      who_hint: whoHint,
    })
    .select("id")
    .single();

  if (captureError || !capture) {
    return NextResponse.json(
      { error: "capture_failed", detail: captureError?.message },
      { status: 500 }
    );
  }

  // 2.2: the image tiers (T3 OCR → T4 vision) run in resolveCapture; the
  // bytes are loaded from storage inside the background task.
  scheduleResolution(db, capture.id, whoHint, {
    payloadType: "image",
    text: "",
    imageRef: path,
  });

  return NextResponse.json(
    { capture_id: capture.id, state: "raw", ms: Date.now() - started },
    { status: 201 }
  );
}

// Law 2: resolution runs after the response, so the capture gesture never
// waits. Shared by both capture paths.
function scheduleResolution(
  db: SupabaseClient,
  captureId: string,
  whoHint: string | null,
  resolve: { payloadType: PayloadType; text: string; imageRef?: string }
) {
  after(async () => {
    const { data: item, error: itemError } = await db
      .from("items")
      .insert({ capture_id: captureId, state: "raw", who: whoHint })
      .select("id")
      .single();
    if (itemError || !item) {
      console.error(
        `raw item creation failed for capture ${captureId}: ${itemError?.message}`
      );
      return;
    }
    await markItemState(db, item.id, "resolving");
    try {
      // Load image bytes for the T3/T4 tiers (image captures only).
      let image: { bytes: Buffer; contentType: string } | undefined;
      if (resolve.imageRef) {
        const dl = await downloadCaptureImage(db, resolve.imageRef);
        image = { bytes: Buffer.from(dl.bytes), contentType: dl.contentType };
      }
      const result = await resolveCapture(
        resolve.payloadType,
        resolve.text,
        whoHint,
        { onRetry: () => markItemState(db, item.id, "retrying"), image }
      );
      const updateError = await applyResolutionToItem(db, item.id, result, whoHint);
      if (updateError) {
        console.error(`item update failed for capture ${captureId}: ${updateError}`);
      }
    } catch (e) {
      console.error(`resolution failed for capture ${captureId}:`, e);
      await markResolutionFailed(db, item.id, e);
    }
  });
}
