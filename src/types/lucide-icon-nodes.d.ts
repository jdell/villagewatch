/**
 * The deep import `src/lib/map/glyphs.ts` makes into lucide-react, for the raw
 * shapes of an icon. lucide-react ships no declaration for these modules — they
 * are the files its components are built from — so this describes the one
 * export read. `tests/glyph-pins.test.ts` loads every one of them, which is
 * what catches an upgrade that moves the files.
 */
declare module "lucide-react/dist/esm/icons/*.mjs" {
  export const __iconNode: ReadonlyArray<
    readonly [string, Readonly<Record<string, string | number>>]
  >;
}
