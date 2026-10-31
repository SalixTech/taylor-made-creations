import type { ElementAppearance } from './appearance';
export type ImageCorner = 'nw' | 'ne' | 'sw' | 'se';
export type ImageGeometry = { width: number; height: number; parentWidth: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
/** Centered frame grows on both sides. Lock uses the current frame ratio, not the file's pixels. */
export function resizeImageFrame(start: ImageGeometry, dx: number, dy: number, corner: ImageCorner, locked: boolean): Pick<ElementAppearance, 'imageWidthPercent' | 'imageHeightPx'> {
  // Return no patch on invalid/degenerate measurements, preserving the original
  // appearance in pointer and keyboard callers. Positive finite sizes are not
  // constrained to a section's width or an aesthetic pixel range.
  const {parentWidth:parent,width,height} = start;
  if (![parent,width,height].every(value => Number.isFinite(value) && value > 0) || ![dx,dy].every(Number.isFinite)) return {};
  let nextWidth = width + dx * (corner.endsWith('w') ? -2 : 2);
  let nextHeight = height + dy * (corner.startsWith('n') ? -1 : 1);
  if (locked) {
    const scaleX = nextWidth / width, scaleY = nextHeight / height;
    const scale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
    nextWidth = width * scale; nextHeight = height * scale;
  }
  const imageWidthPercent = nextWidth / parent * 100;
  if (![nextWidth,nextHeight,imageWidthPercent].every(value => Number.isFinite(value) && value > 0)) return {};
  return { imageWidthPercent, imageHeightPx: nextHeight };
}
export function moveImageCrop(start: ElementAppearance, dx: number, dy: number, geometry: ImageGeometry): Pick<ElementAppearance, 'imageFit' | 'imagePositionX' | 'imagePositionY'> {
  return { imageFit: 'cover', imagePositionX: clamp((start.imagePositionX ?? 50) - dx / Math.max(1, geometry.width) * 100, 0, 100), imagePositionY: clamp((start.imagePositionY ?? 50) - dy / Math.max(1, geometry.height) * 100, 0, 100) };
}
