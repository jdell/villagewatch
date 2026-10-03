"use client";

import { useActionState, useEffect, useId, useState } from "react";
import dynamic from "next/dynamic";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { BellRing, Loader2, Mail } from "lucide-react";
import type { Severity } from "@/generated/prisma/enums";
import { CARD_SHADOW } from "@/components/you/settings-list";
import {
  saveNotificationsAction,
  type SettingsState,
} from "@/app/(app)/settings/actions";
import { SEVERITIES } from "@/lib/constants";
import { PIN_HEAT } from "@/lib/map/glyph-pin";
import { RADIUS_STOPS, radiusStop } from "@/lib/you";

/**
 * How a resident hears about things — the Notifications sub-page of "You".
 *
 * Two switches (push, email), the severity floor as a segmented control, and
 * the distance as a slider with the circle it draws on a map beneath it. One
 * form and one Save, posting exactly the four fields `notificationSettingsSchema`
 * reads. The switches are real checkboxes with `role="switch"`, so an
 * unchecked one is absent from the post — which the schema reads as off.
 *
 * Alerts are sent when a report is *published*, never when one is filed; the
 * copy at the top says so because it is the question every resident has.
 */

const RadiusPreviewMap = dynamic(
  () => import("@/components/you/radius-preview-map").then((m) => m.RadiusPreviewMap),
  {
    ssr: false,
    loading: () => <div className="h-40 animate-pulse rounded-[14px] bg-[#e2e8f0]" />,
  },
);

const IDLE: SettingsState = { ok: true, message: "" };

const SEVERITY_SEGMENTS: { value: Severity; label: string }[] = [
  { value: "LOW", label: "All" },
  { value: "MEDIUM", label: "Medium+" },
  { value: "HIGH", label: "High+" },
  { value: "CRITICAL", label: "Critical" },
];

function Save() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#0284c7] text-[15px] font-semibold text-white transition hover:bg-[#0369a1] disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Save
    </button>
  );
}

function Switch({
  name,
  defaultChecked,
  icon: Icon,
  label,
  detail,
}: {
  name: string;
  defaultChecked: boolean;
  icon: typeof Mail;
  label: string;
  detail: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f1f5f9] text-[#334155]">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="flex flex-1 flex-col">
        <span className="text-[15px] font-[550] text-[#0f172a]">{label}</span>
        <span className="text-[12.5px] leading-snug text-[#64748b]">{detail}</span>
      </span>
      <input
        id={id}
        name={name}
        type="checkbox"
        role="switch"
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      {/* The track, drawn from the input's state with `peer`. */}
      <span
        aria-hidden
        className="relative h-[30px] w-[50px] shrink-0 rounded-full bg-[#cbd5e1] transition peer-checked:bg-[#0284c7] peer-focus-visible:ring-2 peer-focus-visible:ring-[#0284c7] peer-focus-visible:ring-offset-2 after:absolute after:top-[3px] after:left-[3px] after:size-6 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
      />
    </label>
  );
}

export function NotificationsForm({
  notifyPush,
  notifyEmail,
  notifyMinSeverity,
  notifyRadiusMeters,
  home,
}: {
  notifyPush: boolean;
  notifyEmail: boolean;
  notifyMinSeverity: Severity;
  notifyRadiusMeters: number | null;
  /** The resident's approximate home, or null — then the radius has no effect. */
  home: { lat: number; lng: number } | null;
}) {
  const [state, save] = useActionState(saveNotificationsAction, IDLE);
  const [severity, setSeverity] = useState<Severity>(notifyMinSeverity);
  const [stop, setStop] = useState(() => radiusStop(notifyRadiusMeters));

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  const radius = RADIUS_STOPS[stop];
  const severityMeta = SEVERITIES.find((option) => option.value === severity);
  const sliderId = useId();

  return (
    <form action={save} className="flex flex-col gap-5">
      <p className="px-1 text-[13.5px] leading-relaxed text-[#475569]">
        Alerts are sent when a coordinator publishes a report — never when one is
        filed. Choose how they reach you; what and how close apply to both.
      </p>

      <div
        className={`divide-y divide-[#f1f5f9] overflow-hidden rounded-[18px] bg-white ${CARD_SHADOW}`}
      >
        <Switch
          name="notifyPush"
          defaultChecked={notifyPush}
          icon={BellRing}
          label="Push notifications"
          detail="On this device, when something is published nearby."
        />
        <Switch
          name="notifyEmail"
          defaultChecked={notifyEmail}
          icon={Mail}
          label="Email"
          detail="The same alert to your inbox. You still get emails about your own reports with this off."
        />
      </div>

      <fieldset className={`flex flex-col gap-3 rounded-[18px] bg-white p-4 ${CARD_SHADOW}`}>
        <legend className="sr-only">Tell me about</legend>
        <p aria-hidden className="text-[15px] font-[650] text-[#0f172a]">
          Tell me about
        </p>
        <div className="grid grid-cols-4 gap-1 rounded-[12px] bg-[#f1f5f9] p-1">
          {SEVERITY_SEGMENTS.map((segment) => (
            <label key={segment.value} className="relative">
              <input
                type="radio"
                name="notifyMinSeverity"
                value={segment.value}
                checked={severity === segment.value}
                onChange={() => setSeverity(segment.value)}
                className="peer sr-only"
              />
              <span className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] text-[13px] font-semibold text-[#475569] transition peer-checked:bg-white peer-checked:text-[#0f172a] peer-checked:shadow-[0_1px_2px_rgba(15,23,42,.12)] peer-focus-visible:ring-2 peer-focus-visible:ring-[#0284c7]">
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ backgroundColor: PIN_HEAT[segment.value] }}
                />
                {segment.label}
              </span>
            </label>
          ))}
        </div>
        {severityMeta && (
          <p className="text-[12.5px] text-[#64748b]" aria-live="polite">
            {severityMeta.label} and above — {severityMeta.description.toLowerCase()}.
          </p>
        )}
      </fieldset>

      <div className={`flex flex-col gap-3 rounded-[18px] bg-white p-4 ${CARD_SHADOW}`}>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={sliderId} className="text-[15px] font-[650] text-[#0f172a]">
            How close
          </label>
          <span className="text-[14px] font-semibold text-[#0284c7]">{radius.label}</span>
        </div>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={RADIUS_STOPS.length - 1}
          step={1}
          value={stop}
          onChange={(event) => setStop(Number(event.target.value))}
          aria-valuetext={`${radius.label} — ${radius.description}`}
          className="w-full accent-[#0284c7]"
        />
        <input
          type="hidden"
          name="notifyRadiusMeters"
          value={radius.value === null ? "" : String(radius.value)}
        />
        <p className="text-[12.5px] text-[#64748b]">{radius.description}.</p>

        {home && radius.value !== null ? (
          <RadiusPreviewMap center={home} radius={radius.value} />
        ) : (
          <p className="rounded-[12px] bg-[#f8fafc] p-3 text-[12.5px] leading-relaxed text-[#475569]">
            {home
              ? "You will hear about reports anywhere in the village."
              : "We do not have an approximate home location for you, so there is nothing to measure from — you will hear about reports anywhere in the village whichever distance is set."}
          </p>
        )}
      </div>

      <Save />
    </form>
  );
}
