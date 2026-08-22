/* global document, window, HTMLImageElement, HTMLElement */
(() => {
  const image = document.querySelector("[data-map-image]");
  const viewport = document.querySelector("[data-viewport]");
  if (!(image instanceof HTMLImageElement) || !(viewport instanceof HTMLElement)) return;
  let scale = 1;
  const apply = () => { image.style.transform = `scale(${scale})`; };
  const fit = () => {
    const naturalWidth = image.naturalWidth || image.width || 1;
    const naturalHeight = image.naturalHeight || image.height || 1;
    scale = Math.min((viewport.clientWidth - 48) / naturalWidth, (viewport.clientHeight - 48) / naturalHeight, 1);
    scale = Math.max(.1, scale);
    apply();
  };
  document.querySelector("[data-zoom-in]")?.addEventListener("click", () => { scale = Math.min(4, scale * 1.25); apply(); });
  document.querySelector("[data-zoom-out]")?.addEventListener("click", () => { scale = Math.max(.1, scale / 1.25); apply(); });
  document.querySelector("[data-fit]")?.addEventListener("click", fit);
  image.addEventListener("load", fit, { once: true });
  window.addEventListener("resize", fit);
})();
