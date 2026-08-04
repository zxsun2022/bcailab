/**
 * Escaping for node labels, per `markdown-format.md` §6.
 *
 * The requirement is narrow and strict: canonical serialisation MUST be reversible for ordinary
 * Markdown-significant punctuation (§6.3). A label is arbitrary user text — it can begin with
 * `- `, contain `*`, or look exactly like a link — and it must come back as the same string.
 *
 * Two classes of hazard, handled differently:
 *
 *   **Positional** — a leading `#`, list marker or ordered-list pattern changes the *block* the
 *   line parses as. Only the first characters matter, so only they are escaped.
 *
 *   **Inline** — `*`, `_`, backtick, brackets and `<` can open an inline construct anywhere in
 *   the line. §5 normalises inline syntax to plain text on import, so an unescaped `*pair*`
 *   would silently lose its asterisks on a round trip. These are escaped wherever they appear.
 *
 * Escaping is deliberately not minimal. A cleverer escaper that only acts when a construct
 * would actually parse is a source of round-trip bugs that appear years later on someone else's
 * label; the cost here is a backslash in a file that is still perfectly readable.
 */

/** Characters that can open an inline construct. Backslash must be handled first. */
const INLINE = /[\\`*_[\]<>]/g;

export function escapeLabel(text: string): string {
  if (text === "") return "";

  let out = text.replace(INLINE, (ch) => `\\${ch}`);

  // Positional hazards, applied after inline escaping so the backslash count stays right.
  // A leading '#' would make the line a heading; a leading marker would make it a list item;
  // '1. ' would make it an ordered list item. Escaping the first significant character is
  // enough to demote the whole construct to text.
  out = out.replace(/^(\s*)#/, "$1\\#");
  out = out.replace(/^(\s*)([-+])(\s|$)/, "$1\\$2$3");
  out = out.replace(/^(\s*)(\d+)([.)])(\s|$)/, "$1$2\\$3$4");

  return out;
}

/**
 * Reverses `escapeLabel`, and also decodes escapes a human wrote by hand.
 *
 * CommonMark allows a backslash to escape any ASCII punctuation, so this accepts that whole
 * class rather than only the characters this serialiser emits — an imported file was not
 * necessarily written by this application.
 */
export function unescapeLabel(text: string): string {
  return text.replace(/\\([!-/:-@[-`{-~])/g, "$1");
}

/**
 * Filesystem-safe export filename, per `storage-export.md` §11.3.
 *
 * Windows reserved device names are rejected outright rather than sanitised, because a file
 * called `CON.md` cannot be created there at all.
 */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sanitizeFilename(title: string, fallback = "mind-map"): string {
  const cleaned = title
    // Forbidden on one filesystem or another, plus C0 controls.
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // Trailing dots and spaces are silently stripped by Windows; do it here so the name on
    // disk is the name we chose.
    .replace(/[. ]+$/, "");

  if (cleaned === "" || WINDOWS_RESERVED.test(cleaned)) return fallback;
  return cleaned;
}
