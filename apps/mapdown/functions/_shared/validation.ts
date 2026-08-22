import { checkInvariants } from "../../src/model/invariants";
import { normalizeText, SCHEMA_VERSION, type MindMapDocument, type MindMapNode } from "../../src/model/types";
import type { CloudSnapshot } from "../../src/cloud/types";
import { sha256 } from "./crypto";
import { ApiError } from "./http";
import {
  DOCUMENT_NODE_LIMIT,
  DOCUMENT_TITLE_MAX_CODE_POINTS,
  PRIVATE_SNAPSHOT_MAX_BYTES,
  PUBLISHED_MARKDOWN_MAX_BYTES,
  PUBLISHED_PNG_HEIGHT,
  PUBLISHED_PNG_MAX_BYTES,
  PUBLISHED_PNG_WIDTH,
  PUBLISHED_SVG_MAX_BYTES
} from "./limits";

const encoder = new TextEncoder();

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function codePointLength(value: string): number {
  return [...value].length;
}

export function normalizeCloudTitle(value: unknown): string {
  if (typeof value !== "string") throw new ApiError(400, "snapshot", "The document title is invalid.");
  const title = value.trim().replace(/\s+/g, " ");
  if (!title || codePointLength(title) > DOCUMENT_TITLE_MAX_CODE_POINTS) {
    throw new ApiError(400, "snapshot", `Use a title between 1 and ${DOCUMENT_TITLE_MAX_CODE_POINTS} characters.`);
  }
  return title;
}

function sanitizeNode(key: string, value: unknown): MindMapNode {
  const node = record(value);
  if (!node || node.id !== key || key.length > 100 || /\s/.test(key)) {
    throw new ApiError(400, "snapshot", "The document contains an invalid node id.");
  }
  if (typeof node.text !== "string" || codePointLength(node.text) > 10_000 || node.text !== normalizeText(node.text)) {
    throw new ApiError(400, "snapshot", "The document contains invalid node text.");
  }
  if (node.parentId !== null && typeof node.parentId !== "string") {
    throw new ApiError(400, "snapshot", "The document contains an invalid parent link.");
  }
  if (!Array.isArray(node.childIds) || node.childIds.some((id) => typeof id !== "string")) {
    throw new ApiError(400, "snapshot", "The document contains invalid child links.");
  }
  if (typeof node.collapsed !== "boolean" || ![null, "left", "right"].includes(node.side as string | null)) {
    throw new ApiError(400, "snapshot", "The document contains invalid view state.");
  }
  return {
    id: key,
    text: node.text,
    parentId: node.parentId,
    childIds: [...node.childIds] as string[],
    collapsed: node.collapsed,
    side: node.side as "left" | "right" | null
  };
}

export async function validateCloudSnapshot(value: unknown): Promise<{
  snapshot: CloudSnapshot;
  json: string;
  digest: string;
  nodeCount: number;
}> {
  const input = record(value);
  const sourceDocument = record(input?.document);
  if (!input || input.schemaVersion !== SCHEMA_VERSION || !sourceDocument) {
    throw new ApiError(400, "snapshot", "This document snapshot is not supported.");
  }
  if (
    typeof sourceDocument.id !== "string" ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(sourceDocument.id) ||
    typeof sourceDocument.rootId !== "string" ||
    sourceDocument.schemaVersion !== SCHEMA_VERSION ||
    !Number.isInteger(sourceDocument.revision) ||
    Number(sourceDocument.revision) < 0
  ) {
    throw new ApiError(400, "snapshot", "This document has invalid metadata.");
  }
  const sourceNodes = record(sourceDocument.nodes);
  if (!sourceNodes) throw new ApiError(400, "snapshot", "This document has no readable nodes.");
  const entries = Object.entries(sourceNodes);
  if (entries.length < 1 || entries.length > DOCUMENT_NODE_LIMIT) {
    throw new ApiError(400, "snapshot", `Cloud documents may contain at most ${DOCUMENT_NODE_LIMIT.toLocaleString()} nodes.`);
  }
  const nodes: Record<string, MindMapNode> = {};
  for (const [key, node] of entries) nodes[key] = sanitizeNode(key, node);

  const layout = record(sourceDocument.layout);
  const theme = record(sourceDocument.theme);
  if (!layout || (layout.mode !== "right" && layout.mode !== "two-sided")) {
    throw new ApiError(400, "snapshot", "This document has an invalid layout.");
  }
  if (
    !theme ||
    typeof theme.shapeId !== "string" || theme.shapeId.length > 64 ||
    typeof theme.paletteId !== "string" || theme.paletteId.length > 64 ||
    (theme.branchColorMode !== "single" && theme.branchColorMode !== "by-first-level-branch")
  ) {
    throw new ApiError(400, "snapshot", "This document has an invalid theme.");
  }
  const title = normalizeCloudTitle(sourceDocument.title);
  const document: MindMapDocument = {
    schemaVersion: SCHEMA_VERSION,
    id: sourceDocument.id,
    title,
    rootId: sourceDocument.rootId,
    nodes,
    layout: { mode: layout.mode },
    theme: {
      shapeId: theme.shapeId,
      paletteId: theme.paletteId,
      branchColorMode: theme.branchColorMode
    },
    revision: Number(sourceDocument.revision)
  };
  const violations = checkInvariants(document);
  if (violations.length > 0) {
    throw new ApiError(400, "snapshot", "The document tree is inconsistent.");
  }
  const selectedNodeId = input.selectedNodeId;
  if (selectedNodeId !== null && (typeof selectedNodeId !== "string" || !nodes[selectedNodeId])) {
    throw new ApiError(400, "snapshot", "The selected node does not exist.");
  }
  const snapshot: CloudSnapshot = {
    schemaVersion: SCHEMA_VERSION,
    document,
    selectedNodeId: selectedNodeId as string | null
  };
  const json = JSON.stringify(snapshot);
  if (encoder.encode(json).byteLength > PRIVATE_SNAPSHOT_MAX_BYTES) {
    throw new ApiError(413, "snapshot_too_large", "This map is too large for account save. Export Markdown to keep a durable copy.");
  }
  return { snapshot, json, digest: await sha256(json), nodeCount: entries.length };
}

export function validatePublishedMarkdown(value: unknown): string {
  if (typeof value !== "string" || encoder.encode(value).byteLength > PUBLISHED_MARKDOWN_MAX_BYTES) {
    throw new ApiError(413, "markdown_too_large", "The published Markdown is too large.");
  }
  if (!value.endsWith("\n") || value.includes("\0")) {
    throw new ApiError(400, "markdown", "The published Markdown is not canonical Mapdown Markdown.");
  }
  let withoutFrontMatter = value;
  if (value.startsWith("---\n")) {
    const end = value.indexOf("\n---\n", 4);
    if (end < 0) {
      throw new ApiError(400, "markdown", "The published Markdown has invalid front matter.");
    }
    const body = value.slice(end + 5);
    if (!body.startsWith("\n")) {
      throw new ApiError(400, "markdown", "The published Markdown has invalid front matter spacing.");
    }
    withoutFrontMatter = body.slice(1);
  }
  if (!/^#(?: |\n)/.test(withoutFrontMatter)) {
    throw new ApiError(400, "markdown", "The published Markdown has no root heading.");
  }
  return value;
}

export function validatePublishedSvg(value: unknown): string {
  if (typeof value !== "string" || encoder.encode(value).byteLength > PUBLISHED_SVG_MAX_BYTES) {
    throw new ApiError(413, "svg_too_large", "The published image is too large.");
  }
  const trimmed = value.trim();
  const markup = (trimmed.match(/<[^>]+>/g) ?? []).join("");
  const attributeStructure = markup
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''");
  if (
    !trimmed.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') ||
    !trimmed.endsWith("</svg>") ||
    !trimmed.includes("<desc>Generated by Mapdown</desc>") ||
    /<(?:script|foreignObject|iframe|image|style)\b/i.test(markup) ||
    /\s(?:href|xlink:href|style)\s*=/i.test(attributeStructure) ||
    /\son[a-z]+\s*=/i.test(attributeStructure) ||
    /\s(?:fill|stroke|filter|clip-path|mask|marker-start|marker-mid|marker-end)\s*=\s*["'][^"']*url\s*\(/i.test(markup)
  ) {
    throw new ApiError(400, "svg", "The published image is not a safe Mapdown SVG.");
  }
  return trimmed;
}

export function validatePublishedPng(value: unknown): Uint8Array {
  const prefix = "data:image/png;base64,";
  if (typeof value !== "string" || !value.startsWith(prefix)) {
    throw new ApiError(400, "png", "The published preview is not a PNG data URL.");
  }
  const encoded = value.slice(prefix.length);
  if (
    encoded.length === 0 ||
    encoded.length > Math.ceil(PUBLISHED_PNG_MAX_BYTES / 3) * 4 + 4 ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  ) {
    throw new ApiError(413, "png_too_large", "The published preview is too large or invalid.");
  }
  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    throw new ApiError(400, "png", "The published preview is not valid base64.");
  }
  if (binary.length > PUBLISHED_PNG_MAX_BYTES) {
    throw new ApiError(413, "png_too_large", "The published preview is too large.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const isPng = bytes.length >= 24 && signature.every((byte, index) => bytes[index] === byte);
  const isHeader = bytes[12] === 73 && bytes[13] === 72 && bytes[14] === 68 && bytes[15] === 82;
  if (!isPng || !isHeader) {
    throw new ApiError(400, "png", "The published preview is not a valid PNG.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(16) !== PUBLISHED_PNG_WIDTH || view.getUint32(20) !== PUBLISHED_PNG_HEIGHT) {
    throw new ApiError(
      400,
      "png",
      `The published preview must be ${PUBLISHED_PNG_WIDTH}×${PUBLISHED_PNG_HEIGHT} pixels.`
    );
  }
  return bytes;
}
