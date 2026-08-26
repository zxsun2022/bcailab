import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PublishedViewer } from "./PublishedViewer";
import { publicIdFromPathname } from "./public-id";

/**
 * Entry point for the published page, built as its own Vite entry to a fixed path
 * (`/published/viewer.js`) so the Pages Function can reference it from server-rendered HTML.
 *
 * Nothing here imports the editor, the storage layer or the model commands. That is a security
 * property, not a bundle-size preference — this code runs on the host that serves other
 * people's content — and `import-boundary.test.ts` walks the module graph to keep it true.
 *
 * The zoom fallback for a publication with no view snapshot is the same behaviour the page had
 * before this bundle existed: scale the frozen image. Publications made before the view
 * snapshot shipped are frozen and will never gain one, so this path is permanent.
 */

function mountImageZoom(viewport: HTMLElement): void {
  const image = viewport.querySelector("img");
  if (!image) return;
  let scale = 1;
  let userAdjusted = false;
  const apply = () => {
    image.style.transform = `scale(${scale})`;
  };
  const fit = () => {
    const naturalWidth = image.naturalWidth || image.width || 1;
    const naturalHeight = image.naturalHeight || image.height || 1;
    scale = Math.max(
      0.1,
      Math.min(
        (viewport.clientWidth - 48) / naturalWidth,
        (viewport.clientHeight - 48) / naturalHeight,
        1
      )
    );
    apply();
  };
  const on = (selector: string, run: () => void) =>
    document.querySelector(selector)?.addEventListener("click", run);
  on("[data-zoom-in]", () => {
    userAdjusted = true;
    scale = Math.min(4, scale * 1.25);
    apply();
  });
  on("[data-zoom-out]", () => {
    userAdjusted = true;
    scale = Math.max(0.1, scale / 1.25);
    apply();
  });
  on("[data-fit]", () => {
    userAdjusted = false;
    fit();
  });
  if (image.complete && image.naturalWidth > 0) fit();
  else image.addEventListener("load", fit, { once: true });
  window.addEventListener("resize", () => {
    if (!userAdjusted) fit();
  });
}

const viewport = document.querySelector<HTMLElement>("[data-viewport]");
const fallback = document.querySelector<HTMLElement>("[data-map-fallback]");
const publicId = publicIdFromPathname(window.location.pathname);

if (viewport && fallback) {
  mountImageZoom(fallback);
  if (publicId) {
    const host = document.createElement("div");
    host.className = "published-live-host";
    viewport.append(host);
    createRoot(host).render(
      <StrictMode>
        <PublishedViewer publicId={publicId} fallback={fallback} />
      </StrictMode>
    );
  }
}
