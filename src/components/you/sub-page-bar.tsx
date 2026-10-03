import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * The bar across a sub-page of "You": back on the left, the page's name in the
 * middle. A real link to `/settings`, so back is a navigation the browser's own
 * back button agrees with, rather than a history.back() that could leave the
 * app on a page opened from a notification.
 */
export function SubPageBar({ title }: { title: string }) {
  return (
    <nav
      aria-label={title}
      className="sticky top-0 z-[900] grid h-[calc(3.5rem+env(safe-area-inset-top))] grid-cols-[1fr_auto_1fr] items-center border-b border-[#e2e8f0] bg-white/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur lg:static lg:h-14 lg:border-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none"
    >
      <Link
        href="/settings"
        className="inline-flex h-10 items-center gap-1.5 justify-self-start rounded-xl px-2.5 text-[15px] font-semibold text-[#0284c7] transition hover:bg-[#f0f9ff]"
      >
        <ArrowLeft className="size-[18px]" aria-hidden />
        You
      </Link>
      <h1 className="text-[16px] font-[650] text-[#0f172a]">{title}</h1>
      <span aria-hidden />
    </nav>
  );
}
