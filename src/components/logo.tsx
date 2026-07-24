import { APP_NAME } from "@/lib/constants";

type LogoProps = {
  /** Extra classes for the wordmark text. */
  className?: string;
  /** Hide the wordmark and render the shield only (collapsed sidebar, favicons). */
  markOnly?: boolean;
};

/**
 * Brand mark: a shield with a house inside — protection around a home.
 * Uses `currentColor` for the wordmark so it inherits from whatever it sits on.
 */
export function Logo({ className = "", markOnly = false }: LogoProps) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-sm shadow-brand-900/20">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="size-5 text-white"
        >
          <path
            d="M12 2.5 4.5 5.6v6.2c0 4.6 3.1 8.8 7.5 10 4.4-1.2 7.5-5.4 7.5-10V5.6L12 2.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M8.4 12.4 12 9.3l3.6 3.1v3.9H8.4v-3.9Z"
            fill="currentColor"
          />
        </svg>
      </span>
      {!markOnly && (
        <span className={`text-lg font-semibold tracking-tight ${className}`}>
          {APP_NAME}
        </span>
      )}
      <span className="sr-only">{markOnly ? APP_NAME : ""}</span>
    </span>
  );
}
