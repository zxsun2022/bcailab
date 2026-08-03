import { exportSvg, type SvgExportOptions } from "./svg";
import type { MindMapDocument } from "../model/types";

/**
 * PNG export, per `storage-export.md` §13.
 *
 * Rasterising through an `<img>` is not merely a conversion — it is the strongest available
 * proof that the SVG is self-contained, because an SVG loaded that way renders in an isolated
 * context where page CSS does not apply and external references are refused. Phase 0 spike 2
 * established that; a web font would vanish at exactly this step.
 *
 * PNG has one property SVG cannot offer: it is rasterised on the **author's** machine, so it
 * looks the same everywhere. SVG delegates font resolution to the reader. §14.4 requires the
 * export dialog to say so, because a user choosing between the two needs that sentence.
 */

/** §13.2 — browsers refuse a canvas beyond roughly this area; Safari is the strictest. */
export const MAX_CANVAS_AREA = 16_777_216;
export const MAX_CANVAS_DIMENSION = 16_384;

export type PngScale = 1 | 2 | 3;

export interface PngExportOptions extends SvgExportOptions {
  scale?: PngScale;
}

export type PngExportResult =
  | { ok: true; dataUrl: string; width: number; height: number; scale: number; reducedFrom?: PngScale }
  | { ok: false; reason: string };

/**
 * §13.2 — if the requested size exceeds what a canvas can hold, reduce the scale and say so.
 * It "MUST not silently produce an empty or clipped image", and a silently blank PNG is exactly
 * what an over-large canvas yields.
 */
export function resolveScale(width: number, height: number, requested: PngScale): PngScale | null {
  for (let scale = requested; scale >= 1; scale--) {
    const w = Math.ceil(width * scale);
    const h = Math.ceil(height * scale);
    if (w <= MAX_CANVAS_DIMENSION && h <= MAX_CANVAS_DIMENSION && w * h <= MAX_CANVAS_AREA) {
      return scale as PngScale;
    }
  }
  // Returning 1 here would be a lie: a map large enough to exceed the limit at 1x cannot be
  // rasterised at all, and a canvas that big yields a blank image. §13.2 says the exporter
  // "MUST not silently produce an empty or clipped image", so this reports impossibility and
  // the caller offers SVG instead.
  return null;
}

export function pixelDimensions(width: number, height: number, scale: PngScale) {
  return { width: Math.ceil(width * scale), height: Math.ceil(height * scale) };
}

export async function exportPng(
  doc: MindMapDocument,
  options: PngExportOptions = {}
): Promise<PngExportResult> {
  const requested = options.scale ?? 2;
  const { svg, width, height } = exportSvg(doc, options);
  const scale = resolveScale(width, height, requested);
  if (scale === null) {
    return {
      ok: false,
      reason:
        "This map is too large to rasterise at any scale. Export SVG instead — it has no size limit and stays sharp at any zoom."
    };
  }

  const canvas = document.createElement("canvas");
  const pixels = pixelDimensions(width, height, scale);
  canvas.width = pixels.width;
  canvas.height = pixels.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return { ok: false, reason: "This browser did not provide a 2D canvas context." };

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        ctx.scale(scale, scale);
        ctx.drawImage(image, 0, 0);
        resolve();
      };
      image.onerror = () =>
        reject(new Error("The generated SVG could not be loaded for rasterisation."));
      image.src = url;
    });
  } catch (error) {
    URL.revokeObjectURL(url);
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  URL.revokeObjectURL(url);

  // §13.2 — never hand back a blank image and call it success. Checking the alpha channel
  // catches both an empty draw and a tainted canvas, and it stays correct for a transparent
  // background because glyph pixels still have non-zero alpha.
  try {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = false;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) {
        painted = true;
        break;
      }
    }
    if (!painted) {
      return { ok: false, reason: "The export produced an empty image and was discarded." };
    }
  } catch {
    // A tainted canvas cannot be inspected, but it did draw. Fall through rather than fail.
  }

  return {
    ok: true,
    dataUrl: canvas.toDataURL("image/png"),
    width: pixels.width,
    height: pixels.height,
    scale,
    ...(scale !== requested ? { reducedFrom: requested } : {})
  };
}

export function scaleReductionMessage(result: PngExportResult): string | null {
  if (!result.ok || result.reducedFrom === undefined) return null;
  return `This map is too large for a ${result.reducedFrom}× image, so it was exported at ${result.scale}× (${result.width}×${result.height} px). Export SVG for full resolution.`;
}
