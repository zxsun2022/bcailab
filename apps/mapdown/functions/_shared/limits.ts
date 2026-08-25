export const CLOUD_DOCUMENT_LIMIT = 100;
export const PRIVATE_SNAPSHOT_MAX_BYTES = 512 * 1024;
export const PUBLICATION_LIMIT = 25;
export const PUBLISHED_MARKDOWN_MAX_BYTES = 256 * 1024;
export const PUBLISHED_SVG_MAX_BYTES = 2 * 1024 * 1024;
export const PUBLISHED_PNG_MAX_BYTES = 4 * 1024 * 1024;
/**
 * The live viewer's payload. Sized against the same synthetic maps as the other caps: the
 * representative 2,000-node map is ~317 KiB as JSON, and this format is a strict subset of the
 * private snapshot, so it cannot exceed it.
 */
export const PUBLISHED_VIEW_MAX_BYTES = 512 * 1024;
export const PUBLISHED_PNG_WIDTH = 1200;
export const PUBLISHED_PNG_HEIGHT = 630;
export const DOCUMENT_TITLE_MAX_CODE_POINTS = 120;
export const DOCUMENT_NODE_LIMIT = 10_000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REPORT_DETAILS_MAX_CODE_POINTS = 500;
export const REPORTS_PER_DAY = 3;
export const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
