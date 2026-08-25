import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MindMapDocument, NodeId } from "../model/types";
import { documentFromPublishedView, parsePublishedView } from "./published-view";
import { PublishedMap, type MapCommands } from "./PublishedMap";

/**
 * The published page's live layer.
 *
 * The page it enhances is already complete: the Pages Function serves the title, the metadata,
 * the frozen SVG in an `<img>`, the zoom capsule and the report form. This bundle only replaces
 * the image with a map a reader can open and close, and it takes over the buttons that are
 * already on screen. If the fetch fails, the format is newer than this build understands, or
 * the bundle never loads at all, the page stays exactly what it was — which is why the image
 * fallback is a design requirement and not a defensive afterthought (D-32).
 */

interface PublishedViewerProps {
  publicId: string;
  /** The container holding the fallback image; emptied only after the map renders. */
  fallback: HTMLElement;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; document: MindMapDocument }
  | { kind: "fallback" };

export function PublishedViewer({ publicId, fallback }: PublishedViewerProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const commandRef = useRef<MapCommands | null>(null);
  const [zoomPercent, setZoomPercent] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/p/${encodeURIComponent(publicId)}/map.json`, {
          headers: { Accept: "application/json" },
          // The publication is frozen but revocable; a cached copy would outlive an unpublish.
          cache: "no-store"
        });
        if (!response.ok) throw new Error(String(response.status));
        const view = parsePublishedView(await response.json());
        if (!view) throw new Error("unsupported");
        if (cancelled) return;
        setState({ kind: "ready", document: documentFromPublishedView(view, `published-${publicId}`) });
      } catch {
        if (!cancelled) setState({ kind: "fallback" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicId]);

  // The image and the live map must never both be on screen: swapping only after a successful
  // render means a failure leaves the reader with the page they already had.
  useEffect(() => {
    fallback.hidden = state.kind === "ready";
  }, [fallback, state.kind]);

  const toggleCollapse = useCallback((id: NodeId) => {
    setState((current) => {
      if (current.kind !== "ready") return current;
      const node = current.document.nodes[id];
      if (!node || node.childIds.length === 0 || id === current.document.rootId) return current;
      return {
        kind: "ready",
        document: {
          ...current.document,
          nodes: {
            ...current.document.nodes,
            [id]: { ...node, collapsed: !node.collapsed }
          }
        }
      };
    });
  }, []);

  // The capsule exists in the server-rendered header; wiring it here keeps one set of controls
  // instead of a second row that appears when the bundle loads.
  useEffect(() => {
    if (state.kind !== "ready") return;
    const bind = (selector: string, run: (commands: MapCommands) => void) => {
      const button = window.document.querySelector<HTMLButtonElement>(selector);
      if (!button) return () => undefined;
      const handler = () => {
        const commands = commandRef.current;
        if (commands) run(commands);
      };
      button.addEventListener("click", handler);
      return () => button.removeEventListener("click", handler);
    };
    const unbind = [
      bind("[data-zoom-in]", (commands) => commands.zoomIn()),
      bind("[data-zoom-out]", (commands) => commands.zoomOut()),
      bind("[data-fit]", (commands) => commands.fit())
    ];
    return () => unbind.forEach((off) => off());
  }, [state.kind]);

  const onZoomChange = useCallback((scale: number) => {
    setZoomPercent(Math.round(scale * 100));
  }, []);

  const hint = useMemo(
    () => "Drag to move · scroll to zoom · click a badge to open or close a branch",
    []
  );

  if (state.kind !== "ready") return null;

  return (
    <div className="published-live">
      <PublishedMap
        document={state.document}
        onToggleCollapse={toggleCollapse}
        commandRef={commandRef}
        onZoomChange={onZoomChange}
      />
      <p className="published-live-hint">
        <span>{hint}</span>
        {zoomPercent !== null && <span className="published-live-zoom">{zoomPercent}%</span>}
      </p>
    </div>
  );
}
