import Link from "next/link";
import { ChevronRight, ExternalLink, type LucideIcon } from "lucide-react";

/**
 * The grouped rows "You" is built from — a white card per group, rows 56px and
 * up with a chevron where they go somewhere. iOS's Settings shape, because that
 * is the shape a resident already knows how to read: a label on the left, the
 * current value on the right, tap to change it.
 *
 * Server-safe. A row is a link, an external link, a submit button for another
 * form (`formId`), or plain text — never a control with state of its own; the
 * controls live on the sub-pages.
 */

export const CARD_SHADOW =
  "shadow-[0_1px_2px_rgba(15,23,42,.06),0_2px_8px_rgba(15,23,42,.05)]";

export function SettingsGroup({
  title,
  footer,
  children,
  id,
}: {
  title?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className="flex flex-col gap-2">
      {title && (
        <h2
          id={headingId}
          className="px-1 text-[13px] font-semibold tracking-wide text-[#64748b] uppercase"
        >
          {title}
        </h2>
      )}
      <div
        className={`divide-y divide-[#f1f5f9] overflow-hidden rounded-[18px] bg-white ${CARD_SHADOW}`}
      >
        {children}
      </div>
      {footer && (
        <div className="px-1 text-[12.5px] leading-relaxed text-[#64748b]">
          {footer}
        </div>
      )}
    </section>
  );
}

type RowProps = {
  icon?: LucideIcon;
  /** Tailwind classes for the icon's round tile. */
  iconTile?: string;
  label: string;
  /** The current value, right-aligned and muted — or a sentence under the label. */
  value?: React.ReactNode;
  detail?: React.ReactNode;
  tone?: "default" | "danger";
  href?: string;
  external?: boolean;
  /** Submits the form with this id — sign out, which is a real POST. */
  formId?: string;
};

export function SettingsRow({
  icon: Icon,
  iconTile = "bg-[#f1f5f9] text-[#334155]",
  label,
  value,
  detail,
  tone = "default",
  href,
  external = false,
  formId,
}: RowProps) {
  const body = (
    <>
      {Icon && (
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full ${iconTile}`}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={`text-[15px] font-[550] ${tone === "danger" ? "text-[#b91c1c]" : "text-[#0f172a]"}`}
        >
          {label}
        </span>
        {detail && (
          <span className="text-[12.5px] leading-snug text-[#64748b]">{detail}</span>
        )}
      </span>
      {value !== undefined && value !== null && (
        <span className="max-w-[45%] truncate text-right text-[14px] text-[#64748b]">
          {value}
        </span>
      )}
      {href &&
        (external ? (
          <ExternalLink className="size-4 shrink-0 text-[#94a3b8]" aria-hidden />
        ) : (
          <ChevronRight className="size-[18px] shrink-0 text-[#94a3b8]" aria-hidden />
        ))}
    </>
  );

  const className =
    "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition";

  if (href && external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${className} hover:bg-[#f8fafc]`}
      >
        {body}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={`${className} hover:bg-[#f8fafc]`}>
        {body}
      </Link>
    );
  }
  if (formId) {
    return (
      <button type="submit" form={formId} className={`${className} hover:bg-[#f8fafc]`}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}
