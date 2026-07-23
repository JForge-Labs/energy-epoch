/** Map camera — pan/zoom in tile-space */

export interface Camera {
  /** World center X in tiles */
  x: number;
  /** World center Y in tiles */
  y: number;
  zoom: number;
}

export function createCamera(cols: number, rows: number): Camera {
  return { x: cols / 2, y: rows / 2, zoom: 1.15 };
}

export function clampCamera(cam: Camera, cols: number, rows: number) {
  cam.zoom = Math.min(2.8, Math.max(0.45, cam.zoom));
  cam.x = Math.min(cols - 0.5, Math.max(0.5, cam.x));
  cam.y = Math.min(rows - 0.5, Math.max(0.5, cam.y));
}

export function worldToScreen(
  cam: Camera,
  canvasW: number,
  canvasH: number,
  tileSize: number,
  wx: number,
  wy: number,
): { sx: number; sy: number; size: number } {
  const size = tileSize * cam.zoom;
  const sx = canvasW / 2 + (wx - cam.x) * size;
  const sy = canvasH / 2 + (wy - cam.y) * size;
  return { sx, sy, size };
}

export function screenToWorld(
  cam: Camera,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  tileSize: number,
): { wx: number; wy: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (clientX - rect.left) * scaleX;
  const my = (clientY - rect.top) * scaleY;
  const size = tileSize * cam.zoom;
  const wx = cam.x + (mx - canvas.width / 2) / size;
  const wy = cam.y + (my - canvas.height / 2) / size;
  return { wx, wy };
}
