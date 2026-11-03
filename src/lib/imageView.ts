export interface Size { width: number; height: number }
export interface Point { x: number; y: number }
export interface ImageView { zoom: number; rotation: number; x: number; y: number }

export const initialImageView: ImageView = { zoom: 1, rotation: 0, x: 0, y: 0 };

function rotatedSize(size: Size, rotation: number): Size {
  const radians = rotation * Math.PI / 180;
  // Remove floating-point residue at multiples of 90 degrees.
  const cos = Math.round(Math.abs(Math.cos(radians)) * 1e12) / 1e12;
  const sin = Math.round(Math.abs(Math.sin(radians)) * 1e12) / 1e12;
  return { width: size.width * cos + size.height * sin, height: size.width * sin + size.height * cos };
}

/** Establish the unrotated 100% size. Rotation must never change this scale. */
export function fitImage(image: Size, viewport: Size): Size {
  if (image.width <= 0 || image.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(
    viewport.width / image.width,
    viewport.height / image.height,
  );
  return { width: image.width * scale, height: image.height * scale };
}

export function constrainView(view: ImageView, image: Size, viewport: Size): ImageView {

  const box = fitImage(image, viewport);
  const bounds = rotatedSize(box, view.rotation);
  // Permit canvas-style movement even when the image fits, retaining a
  // visible strip rather than snapping a panned image to center.
  const width = bounds.width * view.zoom;
  const height = bounds.height * view.zoom;
  const limitX = width > 0 ? (width + viewport.width) / 2 - Math.min(48, width / 2) : 0;
  const limitY = height > 0 ? (height + viewport.height) / 2 - Math.min(48, height / 2) : 0;
  return { ...view, x: limitX === 0 ? 0 : Math.max(-limitX, Math.min(limitX, view.x)), y: limitY === 0 ? 0 : Math.max(-limitY, Math.min(limitY, view.y)) };
}

/** Rotate the entire view around the fixed viewport center (0, 0). */
export function rotateAt(view: ImageView, degrees: number): ImageView {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    ...view,
    rotation: ((view.rotation + degrees) % 360 + 360) % 360,
    x: view.x * cos - view.y * sin,
    y: view.x * sin + view.y * cos,
  };
}

/** Signed pointer-angle change around the viewport center, without wrap jumps. */
export function rotationDelta(from: Point, to: Point): number {
  // Direction is unstable very close to the pivot; resume once outside it.
  if (Math.hypot(from.x, from.y) < 16 || Math.hypot(to.x, to.y) < 16) return 0;
  return Math.atan2(from.x * to.y - from.y * to.x, from.x * to.x + from.y * to.y) * 180 / Math.PI;
}

/** Keep the image point under the cursor stationary, unless an edge is reached. */
export function zoomAt(view: ImageView, factor: number, x: number, y: number, image: Size, viewport: Size): ImageView {
  const zoom = Math.max(0.25, Math.min(12, view.zoom * factor));
  const ratio = zoom / view.zoom;
  return constrainView({ ...view, zoom, x: x - (x - view.x) * ratio, y: y - (y - view.y) * ratio }, image, viewport);
}
