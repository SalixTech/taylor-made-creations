import type { ElementAppearance } from './appearance';
export type ImageCorner = 'nw' | 'ne' | 'sw' | 'se';
export type ImageGeometry = { width: number; height: number; parentWidth: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
/** Centered frame grows on both sides. Lock uses the current frame ratio, not the file's pixels. */
export function resizeImageFrame(start: ImageGeometry, dx: number, dy: number, corner: ImageCorner, locked: boolean): Pick<ElementAppearance, 'imageWidthPercent' | 'imageHeightPx'> {
  const parent = Math.max(1, start.parentWidth), width = Math.max(1, start.width), height = Math.max(1, start.height);
  let nextWidth = width + dx * (corner.endsWith('w') ? -2 : 2);
  let nextHeight = height + dy * (corner.startsWith('n') ? -1 : 1);
  if (locked) {
    const scaleX = nextWidth / width, scaleY = nextHeight / height;
    const requested = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
    const scale = clamp(requested, Math.max(parent * .05 / width, 16 / height), Math.min(parent / width, 2000 / height));
    nextWidth = width * scale; nextHeight = height * scale;
  } else { nextWidth = clamp(nextWidth, parent * .05, parent); nextHeight = clamp(nextHeight, 16, 2000); }
  return { imageWidthPercent: clamp(nextWidth / parent * 100, 5, 100), imageHeightPx: clamp(nextHeight, 16, 2000) };
}
export function moveImageCrop(start: ElementAppearance, dx: number, dy: number, geometry: ImageGeometry): Pick<ElementAppearance, 'imageFit' | 'imagePositionX' | 'imagePositionY'> {
  return { imageFit: 'cover', imagePositionX: clamp((start.imagePositionX ?? 50) - dx / Math.max(1, geometry.width) * 100, 0, 100), imagePositionY: clamp((start.imagePositionY ?? 50) - dy / Math.max(1, geometry.height) * 100, 0, 100) };
}
