/**
 * XML escaping for exported SVG, per `storage-export.md` §12.3 and §12.6.
 *
 * Node labels are arbitrary user text. Without this, a label containing `</text><script>` would
 * become executable markup in a file the user then sends to someone else — §12.6 forbids script
 * in generated SVG, and escaping at the point of serialisation is what actually enforces it.
 *
 * All five XML predefined entities are escaped, not just the three that break well-formedness,
 * because attribute values use this function too.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
