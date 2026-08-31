/**
 * Mount a capture canvas into a real, laid-out DOM subtree without showing it.
 *
 * PlayCanvas can render into a detached canvas, but Chromium does not give that
 * canvas a normal layout/compositor lifecycle. HDRI projection materials are
 * especially sensitive to that difference: the model and grid may render while
 * the environment shader fails to compile. Keeping the canvas attached to the
 * document and inside the viewport, but effectively transparent and inert,
 * gives the WebGL context the same compositor lifecycle as the visible editor
 * canvas.
 */
export function mountBlocking3dOffscreenCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): () => void {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.position = "fixed";
  host.style.left = "0px";
  host.style.top = "0";
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  host.style.overflow = "hidden";
  host.style.opacity = "0.001";
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";

  canvas.style.display = "block";
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  (document.body ?? document.documentElement).appendChild(host);

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    host.parentNode?.removeChild(host);
  };
}
