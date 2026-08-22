/* global document, window, HTMLImageElement, HTMLElement */
(() => {
  const image = document.querySelector("[data-map-image]");
  const viewport = document.querySelector("[data-viewport]");
  if (!(image instanceof HTMLImageElement) || !(viewport instanceof HTMLElement)) return;
  let scale = 1;
  let userAdjusted = false;
  const apply = () => { image.style.transform = `scale(${scale})`; };
  const fit = () => {
    const naturalWidth = image.naturalWidth || image.width || 1;
    const naturalHeight = image.naturalHeight || image.height || 1;
    scale = Math.min((viewport.clientWidth - 48) / naturalWidth, (viewport.clientHeight - 48) / naturalHeight, 1);
    scale = Math.max(.1, scale);
    apply();
  };
  document.querySelector("[data-zoom-in]")?.addEventListener("click", () => {
    userAdjusted = true;
    scale = Math.min(4, scale * 1.25);
    apply();
  });
  document.querySelector("[data-zoom-out]")?.addEventListener("click", () => {
    userAdjusted = true;
    scale = Math.max(.1, scale / 1.25);
    apply();
  });
  document.querySelector("[data-fit]")?.addEventListener("click", () => {
    userAdjusted = false;
    fit();
  });
  if (image.complete && image.naturalWidth > 0) fit();
  else image.addEventListener("load", fit, { once: true });
  window.addEventListener("resize", () => {
    if (!userAdjusted) fit();
  });
})();
