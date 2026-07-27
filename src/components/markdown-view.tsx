import type { Block, Inline } from "@/lib/markdown";

/**
 * Renders the tree from `src/lib/markdown.ts` as React elements.
 *
 * No HTML string anywhere in the path, so there is no `dangerouslySetInnerHTML`
 * and nothing to sanitise — the parser produces typed nodes and this turns each
 * one into an element. That is the whole reason the parser returns a tree.
 *
 * The typography deliberately matches `src/components/legal-page.tsx`. A
 * coordinator reading the DPIA on `/dashboard/compliance` and the privacy notice
 * on `/privacy` is reading two documents about the same processing, and they
 * should not look like they came from different services.
 *
 * External links get `rel="noreferrer"`. Both documents cite the ICO and the
 * legislation, and an incident id in a `Referer` header going to a third party
 * is the exact leak `Referrer-Policy` in `next.config.ts` exists to stop.
 */

function InlineNodes({ nodes }: { nodes: readonly Inline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.kind) {
          case "text":
            return <span key={index}>{node.value}</span>;

          case "code":
            return (
              <code
                key={index}
                className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800"
              >
                {node.value}
              </code>
            );

          case "strong":
            return (
              <strong key={index} className="font-semibold text-slate-900">
                <InlineNodes nodes={node.children} />
              </strong>
            );

          case "em":
            return (
              <em key={index}>
                <InlineNodes nodes={node.children} />
              </em>
            );

          case "link": {
            const external = /^https?:/i.test(node.href);

            return (
              <a
                key={index}
                href={node.href}
                {...(external
                  ? { target: "_blank", rel: "noreferrer noopener" }
                  : {})}
                className="text-brand-700 underline underline-offset-2 hover:text-brand-800"
              >
                <InlineNodes nodes={node.children} />
              </a>
            );
          }
        }
      })}
    </>
  );
}

const HEADING_CLASS: Record<number, string> = {
  1: "text-2xl font-semibold tracking-tight text-slate-900",
  2: "mt-8 text-xl font-semibold tracking-tight text-slate-900",
  3: "mt-6 text-base font-semibold text-slate-900",
  4: "mt-5 text-sm font-semibold text-slate-900",
  5: "mt-4 text-sm font-semibold text-slate-700",
  6: "mt-4 text-sm font-semibold text-slate-700",
};

function BlockNode({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading": {
      // `h1`…`h6` from the document's own level. The page around this starts at
      // `h1`, so a document whose own title is `#` produces a second one — which
      // is why the compliance page renders the document body under a heading of
      // its own and the document's `#` reads as the section title it is.
      const Tag = `h${Math.min(block.level, 6)}` as "h1";

      return (
        <Tag
          id={block.id}
          className={`scroll-mt-4 ${HEADING_CLASS[block.level] ?? HEADING_CLASS[6]}`}
        >
          <InlineNodes nodes={block.children} />
        </Tag>
      );
    }

    case "paragraph":
      return (
        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          <InlineNodes nodes={block.children} />
        </p>
      );

    case "list": {
      const Tag = block.ordered ? "ol" : "ul";

      return (
        <Tag className="mt-3 space-y-2">
          {block.items.map((item, index) => (
            <li
              key={index}
              className="flex gap-3 text-sm leading-relaxed text-slate-700"
            >
              <span
                aria-hidden
                className={
                  block.ordered
                    ? "shrink-0 tabular-nums text-slate-400"
                    : "mt-2 size-1.5 shrink-0 rounded-full bg-slate-400"
                }
              >
                {block.ordered ? `${index + 1}.` : ""}
              </span>
              <span className="min-w-0">
                <InlineNodes nodes={item} />
              </span>
            </li>
          ))}
        </Tag>
      );
    }

    case "table":
      return (
        // The scroll container is the table's own, not the page's. Both
        // documents have tables wider than a phone, and a page that scrolls
        // sideways is a page whose text you cannot read.
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                {block.head.map((cell, index) => (
                  <th
                    key={index}
                    scope="col"
                    className="border-b border-slate-200 px-3 py-2 align-top font-semibold text-slate-900"
                  >
                    <InlineNodes nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="even:bg-slate-50/60">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="border-b border-slate-100 px-3 py-2 align-top leading-relaxed text-slate-700"
                    >
                      <InlineNodes nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "quote":
      return (
        <blockquote className="mt-4 rounded-xl border-l-4 border-brand-300 bg-brand-50/60 px-4 py-3">
          {block.blocks.map((child, index) => (
            <BlockNode key={index} block={child} />
          ))}
        </blockquote>
      );

    case "code":
      return (
        <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-3.5 text-xs leading-relaxed text-slate-100">
          <code>{block.value}</code>
        </pre>
      );

    case "rule":
      return <hr className="mt-6 border-slate-200" />;
  }
}

export function MarkdownView({ blocks }: { blocks: readonly Block[] }) {
  return (
    <div className="[&>*:first-child]:mt-0">
      {blocks.map((block, index) => (
        <BlockNode key={index} block={block} />
      ))}
    </div>
  );
}
