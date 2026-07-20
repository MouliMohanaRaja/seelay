import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Screenshot storage (PLAN.md 2.1). Private bucket — screenshots can hold
// personal content; only the server (service role) reads/writes, and the
// image is served back through a same-origin proxy route, never a public URL.

export const CAPTURES_BUCKET = "captures";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

export function isAllowedImageType(type: string): boolean {
  return ALLOWED_IMAGE_TYPES.has(type);
}

export function extForType(type: string): string {
  switch (type) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    default:
      return "bin";
  }
}

let bucketEnsured = false;

// Idempotent: create the private bucket once per process; "already exists"
// is success. Keeps the whole thing self-provisioning (no dashboard step).
export async function ensureCapturesBucket(db: SupabaseClient): Promise<void> {
  if (bucketEnsured) return;
  const { error } = await db.storage.createBucket(CAPTURES_BUCKET, {
    public: false,
  });
  if (error && !/exist/i.test(error.message)) {
    throw new Error(`could not ensure storage bucket: ${error.message}`);
  }
  bucketEnsured = true;
}

export async function uploadCaptureImage(
  db: SupabaseClient,
  path: string,
  bytes: ArrayBuffer,
  contentType: string
): Promise<void> {
  const { error } = await db.storage
    .from(CAPTURES_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`image upload failed: ${error.message}`);
}

export async function downloadCaptureImage(
  db: SupabaseClient,
  path: string
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const { data, error } = await db.storage
    .from(CAPTURES_BUCKET)
    .download(path);
  if (error || !data) throw new Error(error?.message ?? "image not found");
  return {
    bytes: await data.arrayBuffer(),
    contentType: data.type || "application/octet-stream",
  };
}
