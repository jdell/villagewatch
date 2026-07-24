import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import {
  STORAGE_BUCKET,
  createAdminClient,
  isStorageConfigured,
} from "@/lib/supabase/admin";
import { fieldErrors, mediaUploadMetaSchema } from "@/lib/validations";

/**
 * POST /api/incidents/media — store one piece of already-blurred media.
 *
 * The contract with the browser is the important part: by the time anything
 * reaches this route the faces are already gone. `src/lib/media/face-blur.ts`
 * detects and blurs on-device and hands over a re-encoded canvas export, so the
 * original file — and the EXIF GPS tag that came with it — never leaves the
 * reporter's phone. This route deliberately has no "blur it server-side"
 * fallback: a fallback would mean accepting an unblurred original, which is the
 * one thing the pipeline exists to prevent.
 *
 * Thumbnails are generated in the browser too, off the blurred canvas. Doing it
 * here would mean a native image codec for stills and ffmpeg for video, and a
 * server-made thumbnail could only ever be a re-crop of what the client already
 * sent. Where a client sends no thumbnail, stills fall back to the full image.
 *
 * Objects are keyed `{villageId}/{userId}/{yyyy-mm}/{uuid}` so that the storage
 * policies still to be written can scope on the leading path segment, and so a
 * village's media can be purged wholesale on erasure requests.
 */

/** Ceiling on one blurred upload. The client caps video at 30s well below this. */
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

/** Output formats the blur pipeline can produce. Nothing else is accepted. */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "video/mp4",
  "video/webm",
]);

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/** `video/webm;codecs=vp9` and `video/webm` are the same bucket of bytes here. */
function baseMimeType(value: string): string {
  return value.split(";")[0]!.trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to attach media" }, { status: 401 });
  }

  // The village is the tenant boundary, and it comes from the session — never
  // from the request. A reporter with no village has nowhere to file anything.
  const villageId = session.profile?.villageId;
  if (!villageId) {
    return NextResponse.json(
      { error: "Join a village before attaching media" },
      { status: 403 },
    );
  }

  if (!isStorageConfigured) {
    return NextResponse.json(
      { error: "Media storage is not configured on this deployment." },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file was attached" }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `Blurred media must be under ${Math.round(
          MAX_UPLOAD_BYTES / 1024 / 1024,
        )}MB`,
      },
      { status: 413 },
    );
  }

  const mimeType = baseMimeType(file.type);
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: "Only blurred JPEG, MP4 and WebM output can be uploaded" },
      { status: 415 },
    );
  }

  const parsed = mediaUploadMetaSchema.safeParse({
    kind: form.get("kind"),
    width: form.get("width"),
    height: form.get("height"),
    durationSeconds: form.get("durationSeconds") ?? undefined,
    facesDetected: form.get("facesDetected") ?? 0,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid media details", fieldErrors: fieldErrors(parsed.error) },
      { status: 422 },
    );
  }

  const meta = parsed.data;

  const isVideo = mimeType.startsWith("video/");
  if ((meta.kind === "video") !== isVideo) {
    return NextResponse.json(
      { error: "The file type and media kind do not match" },
      { status: 422 },
    );
  }

  const thumbnail = form.get("thumbnail");
  const hasThumbnail =
    thumbnail instanceof File &&
    thumbnail.size > 0 &&
    thumbnail.size <= MAX_UPLOAD_BYTES &&
    baseMimeType(thumbnail.type) === "image/jpeg";

  if (meta.kind === "video" && !hasThumbnail) {
    // A still is the only thing a map popup can render for a clip, and only the
    // browser has a decoded frame to make one from.
    return NextResponse.json(
      { error: "Video uploads must include a thumbnail" },
      { status: 422 },
    );
  }

  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const prefix = `${villageId}/${session.user.id}/${period}`;
  const id = randomUUID();

  const storagePath = `${prefix}/${id}.${EXTENSIONS[mimeType]}`;
  const thumbnailPath = hasThumbnail ? `${prefix}/${id}-thumb.jpg` : storagePath;

  const supabase = createAdminClient();
  const storage = supabase.storage.from(STORAGE_BUCKET);

  const { error: uploadError } = await storage.upload(storagePath, file, {
    contentType: mimeType,
    cacheControl: "3600",
    upsert: false,
  });

  if (uploadError) {
    console.error("Media upload failed for village %s", villageId, uploadError);
    return NextResponse.json(
      { error: "Could not store that file. Try again." },
      { status: 502 },
    );
  }

  if (hasThumbnail) {
    const { error: thumbnailError } = await storage.upload(
      thumbnailPath,
      thumbnail,
      { contentType: "image/jpeg", cacheControl: "3600", upsert: false },
    );

    if (thumbnailError) {
      // Do not leave the main object behind if its thumbnail never landed —
      // half-uploaded media is harder to reason about than none.
      await storage.remove([storagePath]);
      console.error("Thumbnail upload failed for village %s", villageId, thumbnailError);
      return NextResponse.json(
        { error: "Could not store that file. Try again." },
        { status: 502 },
      );
    }
  }

  return NextResponse.json(
    {
      storagePath,
      thumbnailPath,
      mimeType,
      fileSize: file.size,
      width: meta.width,
      height: meta.height,
      durationSeconds: meta.durationSeconds ?? null,
      facesDetected: meta.facesDetected,
      kind: meta.kind,
    },
    { status: 201 },
  );
}

/**
 * DELETE /api/incidents/media?path=… — drop an attachment the reporter removed
 * before publishing, so abandoned wizard runs do not leave objects behind.
 *
 * The path prefix is the authorisation check: a reporter can only delete inside
 * their own `{villageId}/{userId}` prefix. Once media is attached to a saved
 * incident, deletion belongs to the moderation flow, not here.
 */
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const villageId = session.profile?.villageId;
  if (!villageId) {
    return NextResponse.json({ error: "No village" }, { status: 403 });
  }

  if (!isStorageConfigured) {
    return NextResponse.json(
      { error: "Media storage is not configured on this deployment." },
      { status: 503 },
    );
  }

  const path = request.nextUrl.searchParams.get("path") ?? "";
  const ownPrefix = `${villageId}/${session.user.id}/`;

  if (!path.startsWith(ownPrefix) || path.includes("..")) {
    return NextResponse.json({ error: "Not your file" }, { status: 403 });
  }

  const storage = createAdminClient().storage.from(STORAGE_BUCKET);
  const { error } = await storage.remove([path, path.replace(/\.[^.]+$/, "-thumb.jpg")]);

  if (error) {
    console.error("Media delete failed for %s", path, error);
    return NextResponse.json({ error: "Could not remove that file" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
