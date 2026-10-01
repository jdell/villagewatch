"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Loader2, MapPin, X } from "lucide-react";
import type { LocationValue } from "@/components/location-picker";
import {
  EVENT_CATEGORIES,
  EVENT_CATEGORY_MAX_CHARS,
  EVENT_DESCRIPTION_MAX_CHARS,
  EVENT_TITLE_MAX_CHARS,
  LOCATION_FUZZ_METERS,
} from "@/lib/constants";
import {
  communityEventSchema,
  eventWindowError,
  fieldErrors as toFieldErrors,
} from "@/lib/validations";

/**
 * Posting a community event.
 *
 * One screen, not a wizard: an event is a title, a time and a place, and none
 * of the report's steps — the photo blur, the AI rewrite, the preview — has
 * anything to do here.
 *
 * Validated twice with the same code: `communityEventSchema` and
 * `eventWindowError` run here for the field messages and again in
 * `POST /api/events`, which is the check that counts. The two
 * `datetime-local` values are turned into instants **here**, where the
 * resident's own time zone is, and sent as ISO strings — the server has no way
 * to know what "10:00" meant to the person typing it.
 *
 * The pin is optional, and the copy under it says it will be moved: the route
 * fuzzes it by `LOCATION_FUZZ_METERS` before storing it (domain rule 2), so an
 * event at somebody's house does not pinpoint the house.
 */

const LocationPicker = dynamic(
  () => import("@/components/location-picker").then((m) => m.LocationPicker),
  {
    ssr: false,
    loading: () => (
      <div className="mt-2 h-72 w-full animate-pulse rounded-2xl bg-slate-100 sm:h-96" />
    ),
  },
);

const OTHER = "Other";

const inputClass =
  "mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 aria-invalid:border-red-400";

function Field({
  name,
  label,
  optional,
  hint,
  error,
  children,
}: {
  name: string;
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700">
        {label}
        {optional && <span className="font-normal text-slate-400"> (optional)</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** A `datetime-local` value as an instant in the browser's zone, or undefined. */
function toInstant(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function EventForm({
  center,
  zoom,
}: {
  center: LocationValue;
  zoom: number;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  // A synchronous guard: `pending` is a render away, and two clicks in one
  // frame would both read it as false and post the event twice.
  const inFlight = useRef(false);

  const [category, setCategory] = useState<string>(EVENT_CATEGORIES[0]);
  const [pin, setPin] = useState<LocationValue | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");

    const payload = {
      title: text("title"),
      description: text("description"),
      category: category === OTHER ? text("customCategory").trim() || "" : category,
      locationText: text("locationText"),
      lat: pin?.lat,
      lng: pin?.lng,
      startsAt: toInstant(text("startsAt")),
      endsAt: toInstant(text("endsAt")),
    };

    const parsed = communityEventSchema.safeParse(payload);
    if (!parsed.success) {
      const found = toFieldErrors(parsed.error);
      // "Other" with nothing typed reads better against the box the resident
      // has to fill in than against the select they already chose.
      if (found.category && category === OTHER) {
        found.customCategory = "Say what kind of event it is";
        delete found.category;
      }
      setErrors(found);
      return;
    }

    const windowError = eventWindowError(parsed.data.startsAt, new Date());
    if (windowError) {
      setErrors({ startsAt: windowError });
      return;
    }

    setErrors({});
    inFlight.current = true;
    setPending(true);

    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
        fieldErrors?: Record<string, string>;
      };

      if (response.status === 201 && result.id) {
        toast.success("Event posted");
        router.push(`/events/${result.id}`);
        router.refresh();
        return;
      }

      if (result.fieldErrors) setErrors(result.fieldErrors);
      toast.error(result.error ?? "Could not post that event. Try again.");
    } catch {
      toast.error("Could not reach the server. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  const describedBy = (name: string) =>
    errors[name] ? `${name}-error` : undefined;

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Field name="title" label="What is it?" error={errors.title}>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={EVENT_TITLE_MAX_CHARS}
          placeholder="Litter pick on the rec"
          aria-invalid={Boolean(errors.title)}
          aria-describedby={describedBy("title")}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="category" label="Kind of event" error={errors.category}>
          <select
            id="category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={inputClass}
          >
            {EVENT_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        {category === OTHER && (
          <Field
            name="customCategory"
            label="Which kind?"
            error={errors.customCategory}
          >
            <input
              id="customCategory"
              name="customCategory"
              type="text"
              maxLength={EVENT_CATEGORY_MAX_CHARS}
              placeholder="Plant swap"
              aria-invalid={Boolean(errors.customCategory)}
              aria-describedby={describedBy("customCategory")}
              className={inputClass}
            />
          </Field>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="startsAt" label="Starts" error={errors.startsAt}>
          <input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            required
            aria-invalid={Boolean(errors.startsAt)}
            aria-describedby={describedBy("startsAt")}
            className={inputClass}
          />
        </Field>

        <Field name="endsAt" label="Ends" optional error={errors.endsAt}>
          <input
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            aria-invalid={Boolean(errors.endsAt)}
            aria-describedby={describedBy("endsAt")}
            className={inputClass}
          />
        </Field>
      </div>

      <Field
        name="description"
        label="Details"
        optional
        hint="What to bring, who it is for, who to ask."
        error={errors.description}
      >
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={EVENT_DESCRIPTION_MAX_CHARS}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={describedBy("description")}
          className={inputClass}
        />
      </Field>

      <Field
        name="locationText"
        label="Where"
        optional
        hint="A place everyone knows — the village hall, the green."
        error={errors.locationText}
      >
        <input
          id="locationText"
          name="locationText"
          type="text"
          maxLength={120}
          aria-invalid={Boolean(errors.locationText)}
          aria-describedby={describedBy("locationText")}
          className={inputClass}
        />
      </Field>

      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <MapPin className="size-4 text-slate-400" aria-hidden />
          Pin it on the map
          <span className="font-normal text-slate-400">(optional)</span>
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
          Tap the map to drop a pin. It is moved up to {LOCATION_FUZZ_METERS} m
          before anyone sees it, so an event at a home does not point at the
          house — say where it is in &ldquo;Where&rdquo; above.
        </p>
        <LocationPicker
          value={pin}
          onChange={setPin}
          center={center}
          zoom={zoom}
          className="mt-2"
        />
        {errors.lat && <p className="mt-1.5 text-sm text-red-600">{errors.lat}</p>}
        {pin && (
          <button
            type="button"
            onClick={() => setPin(null)}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <X className="size-3.5" aria-hidden />
            Remove the pin
          </button>
        )}
      </div>

      <p className="rounded-xl bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600 ring-1 ring-inset ring-slate-200">
        Everyone in your village can see this event and your name on it. You can
        delete it at any time from its page.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <CalendarPlus className="size-4" aria-hidden />
        )}
        Post event
      </button>
    </form>
  );
}
