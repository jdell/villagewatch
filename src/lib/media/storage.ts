import {
  STORAGE_BUCKET,
  createAdminClient,
  isStorageConfigured,
} from "@/lib/supabase/admin";

/**
 * Reading back out of the `incident-media` bucket. **Server only** — every
 * function here uses the service-role client, which bypasses row-level
 * security entirely.
 *
 * That means the caller does the authorisation. The bucket is private and its
 * storage policies are not written yet (see "Not built yet" in CLAUDE.md), so
 * nothing in this module checks who is asking: a route must have established
 * the session and the village before it calls in. Once the bucket has
 * village-scoped policies this should move to the request-scoped client and let
 * RLS do the work.
 *
 * Every path in this bucket is `{villageId}/{userId}/{yyyy-mm}/{uuid}.{ext}`,
 * written by `POST /api/incidents/media`, and every object under it is already
 * blurred and EXIF-stripped — the originals never left the reporter's device.
 */

/** Long enough to load a page and look at it, short enough not to be a link. */
const SIGNED_URL_SECONDS = 60 * 60;

/** Refuse to send more than this to the model. Blurred stills are far smaller. */
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;

/** The image formats Claude accepts, intersected with what the blur pipeline emits. */
const INLINE_IMAGE_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export type InlineImageMediaType =
  (typeof INLINE_IMAGE_TYPES)[keyof typeof INLINE_IMAGE_TYPES];

/**
 * A time-limited URL for one stored object, or null when storage is not
 * configured or the object has gone.
 */
export async function signedMediaUrl(path: string): Promise<string | null> {
  if (!isStorageConfigured || !path) return null;

  const { data, error } = await createAdminClient()
    .storage.from(STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);

  if (error || !data) {
    console.error("Could not sign media URL for %s", path, error);
    return null;
  }

  return data.signedUrl;
}

/** Signs several paths at once, keyed by path. Missing objects are omitted. */
export async function signedMediaUrls(
  paths: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const result = new Map<string, string>();

  if (!isStorageConfigured || unique.length === 0) return result;

  const { data, error } = await createAdminClient()
    .storage.from(STORAGE_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_SECONDS);

  if (error || !data) {
    console.error("Could not sign %d media URLs", unique.length, error);
    return result;
  }

  for (const entry of data) {
    if (entry.signedUrl && entry.path) result.set(entry.path, entry.signedUrl);
  }

  return result;
}

/**
 * Downloads one stored still and base64-encodes it for the Messages API.
 *
 * Returns null rather than throwing for anything that is merely "no image to
 * send" — an unsupported extension, an object that is not there, a file too
 * large to be worth inlining. The AI pass is better off running on the text
 * alone than failing because a thumbnail went missing.
 */
export async function inlineImageFromStorage(
  path: string,
): Promise<{ mediaType: InlineImageMediaType; data: string } | null> {
  if (!isStorageConfigured || !path) return null;

  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const mediaType =
    INLINE_IMAGE_TYPES[extension as keyof typeof INLINE_IMAGE_TYPES];

  // Video paths land here whenever a report's first attachment is a clip; the
  // caller is expected to hand us the thumbnail instead, but if it does not,
  // this is the check that stops an MP4 being base64'd into a prompt.
  if (!mediaType) return null;

  const { data, error } = await createAdminClient()
    .storage.from(STORAGE_BUCKET)
    .download(path);

  if (error || !data) {
    console.error("Could not download media for AI processing", error);
    return null;
  }

  if (data.size > MAX_INLINE_IMAGE_BYTES) return null;

  const buffer = Buffer.from(await data.arrayBuffer());

  return { mediaType, data: buffer.toString("base64") };
}
