import {
  layout,
  layoutOptionsForTheme,
  type LayoutResult,
  type NodeBox
} from "../layout/layout";
import { escapeXml } from "./xml";
import { branchColorFor, connectorColorFor, nodeFillAndTextFor } from "../theme/branch-colors";
import { themeById } from "../theme/presets";
import { roleTokens, roleTypography } from "../theme/roles";
import type { MindMapTheme } from "../theme/types";
import { getNode, type MindMapDocument } from "../model/types";

/**
 * SVG export, per `storage-export.md` §12 and `theme.md` §17.1.
 *
 * Three properties this file exists to guarantee, each of which has a test:
 *
 * **It contains what is visible and nothing else (§12.1).** Collapsed descendants are absent —
 * unlike Markdown, which must contain every node. Selection, hover and the editing caret are
 * absent too; the collapsed *count badge* stays, because it is the only thing telling a reader
 * that structure is hidden (§12.2).
 *
 * **It is self-contained (§12.3).** No script, no foreignObject, no external reference of any
 * kind. Phase 0 spike 2 showed why this is not merely policy: an SVG loaded into an `<img>`
 * renders in an isolated context where a web font simply vanishes.
 *
 * **Node labels cannot inject markup (§12.6).** Every label goes through XML escaping, and a
 * test feeds it labels that are themselves markup.
 */

export interface SvgExportOptions {
  /** §12.4 — theme background by default, transparent on request. */
  background?: "theme" | "transparent";
  /** §12.2 — configurable outer padding. */
  padding?: number;
}

export interface SvgExport {
  svg: string;
  width: number;
  height: number;
}

const round = (value: number) => Number(value.toFixed(2));

function renderNode(doc: MindMapDocument, theme: MindMapTheme, box: NodeBox): string {
  const tokens = roleTokens(theme, box.depth);
  const { size, weight } = roleTypography(theme, box.depth);
  const lineHeight = theme.typography.lineHeight;
  const firstBaseline = box.y + tokens.paddingY + (size * lineHeight) / 2;
  const { background: fill, text: textColor } = nodeFillAndTextFor(doc, theme, box.nodeId, box.depth);

  const rect =
    `<rect x="${round(box.x)}" y="${round(box.y)}" width="${round(box.width)}" ` +
    `height="${round(box.height)}" rx="${tokens.radius}" fill="${fill}" ` +
    `stroke="${tokens.border}" stroke-width="${tokens.borderWidth}"/>`;

  // Wrapping was decided by the measurement layer, so the export positions exactly the lines
  // the editor drew. The two cannot disagree about where a break went.
  const tspans = box.lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : size * lineHeight;
      return `<tspan x="${round(box.x + tokens.paddingX)}" dy="${round(dy)}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  const text =
    `<text x="${round(box.x + tokens.paddingX)}" y="${round(firstBaseline)}" ` +
    `font-family="${escapeXml(theme.typography.fontFamily)}" font-size="${size}" ` +
    `font-weight="${weight}" fill="${textColor}" dominant-baseline="central">${tspans}</text>`;

  // §12.2 — the collapsed count badge survives into the export because it is the only signal
  // that a branch is hiding structure. The expanded "minus" control does not: that is UI.
  let badge = "";
  if (box.collapsed && box.directChildCount > 0) {
    const cx = box.outwardEdgeX + (box.side === "left" ? -theme.controls.collapseSize / 2 : theme.controls.collapseSize / 2);
    const cy = box.y + box.height / 2;
    const label = box.directChildCount > 99 ? "99+" : String(box.directChildCount);
    badge =
      `<circle cx="${round(cx)}" cy="${round(cy)}" r="${theme.controls.collapseSize / 2}" ` +
      `fill="${theme.controls.collapseBackground}" stroke="${theme.controls.collapseBorder}"/>` +
      `<text x="${round(cx)}" y="${round(cy)}" font-family="${escapeXml(theme.typography.fontFamily)}" ` +
      `font-size="${theme.controls.collapseFontSize}" fill="${theme.controls.collapseText}" ` +
      `text-anchor="middle" dominant-baseline="central">${label}</text>`;
  }

  return `<g>${rect}${text}${badge}</g>`;
}

export function exportSvg(
  doc: MindMapDocument,
  options: SvgExportOptions = {},
  precomputed?: LayoutResult
): SvgExport {
  const theme = themeById(doc.theme.themeId);
  const result = precomputed ?? layout(doc, layoutOptionsForTheme(theme));
  const padding = options.padding ?? 32;

  // §12.2 — bounds include the collapse badge, or a collapsed branch on the outer edge would
  // be clipped by exactly the thing that says it is collapsed.
  let { minX, minY, maxX, maxY } = result.bounds;
  for (const box of Object.values(result.boxes)) {
    if (!box.collapsed || box.directChildCount === 0) continue;
    const reach = theme.controls.collapseSize;
    if (box.side === "left") minX = Math.min(minX, box.outwardEdgeX - reach);
    else maxX = Math.max(maxX, box.outwardEdgeX + reach);
  }

  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  const viewBox = `${round(minX - padding)} ${round(minY - padding)} ${round(width)} ${round(height)}`;

  const background =
    options.background === "transparent"
      ? ""
      : `<rect x="${round(minX - padding)}" y="${round(minY - padding)}" width="${round(width)}" ` +
        `height="${round(height)}" fill="${theme.canvas.exportBackground}"/>`;

  const edges = result.connectors
    .map((connector) => {
      const { x1, y1, c1x, c1y, c2x, c2y, x2, y2 } = connector.path;
      const color = connectorColorFor(doc, theme, connector.toId);
      const strokeWidth =
        connector.fromId === doc.rootId ? theme.connectors.rootWidth : theme.connectors.width;
      const faded =
        theme.branches.descendantTintPolicy === "same-with-opacity" &&
        branchColorFor(doc, theme, connector.toId) !== null &&
        (result.boxes[connector.toId]?.depth ?? 0) > 1;
      const opacity = faded ? 0.65 : theme.connectors.opacity;
      return (
        `<path d="M${round(x1)},${round(y1)} C${round(c1x)},${round(c1y)} ${round(c2x)},${round(c2y)} ${round(x2)},${round(y2)}" ` +
        `fill="none" stroke="${color}" stroke-width="${strokeWidth}"` +
        (opacity === 1 ? "" : ` opacity="${opacity}"`) +
        `/>`
      );
    })
    .join("");

  const nodes = result.order.map((id) => renderNode(doc, theme, result.boxes[id]!)).join("");

  // §12.5 — a small generator note, with no local paths and no document history.
  const metadata = `<desc>Generated by Mapdown</desc>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round(width)}" height="${round(height)}" ` +
    `viewBox="${viewBox}" role="img" aria-label="${escapeXml(getNode(doc, doc.rootId).text || "Mind map")}">` +
    metadata +
    background +
    edges +
    nodes +
    `</svg>`;

  return { svg, width, height };
}
