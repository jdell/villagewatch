"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { deleteCommunityEvent } from "@/lib/events";

/**
 * Taking an event down — the poster's own, or any in the village for a
 * coordinator. The rule lives in `deleteCommunityEvent`, which also writes the
 * `event.deleted` row; this resolves the village from the session (domain rule
 * 4) and refreshes the three screens an event appears on.
 */

export type DeleteEventState = { ok: boolean; message: string };

export async function deleteEventAction(
  _previous: DeleteEventState,
  formData: FormData,
): Promise<DeleteEventState> {
  const session = await requireSession("/events");
  const villageId = session.profile?.villageId;
  const eventId = formData.get("eventId");

  if (!villageId || typeof eventId !== "string") {
    return { ok: false, message: "That event could not be found." };
  }

  const result = await deleteCommunityEvent({ session, villageId, eventId });
  if (!result.ok) return { ok: false, message: result.error };

  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/map");

  return { ok: true, message: "Event deleted" };
}
