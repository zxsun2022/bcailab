export const MAX_POST_LENGTH = 20000;

export const normalizePostContent = (content: string): string =>
  content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

/**
 * Extract a clean title from markdown content (first heading or first line).
 */
export const extractTitle = (md: string): string | null => {
  const match = /^#{1,6}\s+(.+)$/m.exec(md);
  return match ? match[1].replace(/[*_`~\[\]]/g, "").trim() : null;
};

/**
 * Strip markdown syntax to produce a plain-text preview.
 */
export const stripMarkdown = (md: string): string =>
  md
    .replace(/^#{1,6}\s+/gm, "")       // headings
    .replace(/^\s*[-*+]\s+/gm, "")     // unordered list markers
    .replace(/^\s*\d+\.\s+/gm, "")     // ordered list markers
    .replace(/^\s*>{1,}\s?/gm, "")     // blockquotes
    .replace(/^---+$/gm, "")           // horizontal rules
    .replace(/\*\*(.+?)\*\*/g, "$1")   // bold
    .replace(/__(.+?)__/g, "$1")        // bold alt
    .replace(/\*(.+?)\*/g, "$1")        // italic
    .replace(/_(.+?)_/g, "$1")          // italic alt
    .replace(/~~(.+?)~~/g, "$1")        // strikethrough
    .replace(/`(.+?)`/g, "$1")          // inline code
    .replace(/\[(.+?)\]\(.+?\)/g, "$1") // links
    .replace(/!\[.*?\]\(.+?\)/g, "")    // images
    .replace(/\n{2,}/g, " ")            // collapse blank lines
    .replace(/\n/g, " ")               // remaining newlines
    .trim();
