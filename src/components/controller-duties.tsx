import { CONTROLLER_RESPONSIBILITIES } from "@/lib/constants";

/**
 * The three duties that come with being a data controller, numbered.
 *
 * Two screens render it and they are describing different people, which is why
 * this is the list and not the paragraph around it. `/dashboard/compliance` in
 * community mode shows it to the coordinator who is about to *become* the
 * controller; `/admin/villages` shows it to the administrator activating a
 * village, about the coordinator they are about to make one. Each supplies its
 * own heading and its own second person; the duties are the same three either
 * way, and one list is what stops a later edit landing on only one of them.
 *
 * Not a Client Component. It has no state and no handlers, so it renders on the
 * server in both places and costs a resident's browser nothing.
 */
export function ControllerDuties({
  /** `sm` for the admin card, where it sits inside a smaller box. */
  size = "base",
}: {
  size?: "base" | "sm";
}) {
  const small = size === "sm";

  return (
    <ol className={small ? "mt-2 space-y-2" : "mt-3 space-y-3"}>
      {CONTROLLER_RESPONSIBILITIES.map((duty, index) => (
        <li key={duty.title} className="flex gap-2.5">
          <span
            className={`mt-0.5 flex shrink-0 items-center justify-center rounded-full bg-brand-600 font-semibold text-white ${
              small ? "size-5 text-[0.625rem]" : "size-6 text-xs"
            }`}
          >
            {index + 1}
          </span>
          <div className="min-w-0">
            <p
              className={`font-medium text-slate-900 ${small ? "text-xs" : "text-sm"}`}
            >
              {duty.title}
            </p>
            <p
              className={`mt-0.5 leading-relaxed text-slate-600 ${
                small ? "text-xs" : "text-sm"
              }`}
            >
              {duty.detail}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
