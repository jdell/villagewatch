import { glyphEventPin, glyphPin, type GlyphPinInput } from "@/lib/map/glyph-pin";

/**
 * One map pin, drawn outside the map — for the key in the filter sheet, and
 * beside each row of the list and in the incident sheet.
 *
 * It is the map's own HTML (`glyphPin`), so the key cannot drift from what the
 * map draws. That means `dangerouslySetInnerHTML`, and it is safe here for a
 * structural reason rather than a careful one: `GlyphPinInput` carries enum
 * values, an ISO date, booleans and nothing else, so no resident-written text
 * can reach the string — and the glyphs are lucide's own path data. Keep it
 * that way: a title or a description passed in here would be stored XSS.
 */
export function PinPreview({
  pin,
  now,
}: {
  pin: GlyphPinInput | "event";
  now: number;
}) {
  const html = pin === "event" ? glyphEventPin().html : glyphPin(pin, now).html;
  return <span className="inline-flex" aria-hidden dangerouslySetInnerHTML={{ __html: html }} />;
}
