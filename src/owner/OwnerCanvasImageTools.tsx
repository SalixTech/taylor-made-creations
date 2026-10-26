"use client";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { getImageAppearanceStyle, getImageFrameStyle, type ElementAppearance } from './appearance';
import { moveImageCrop, resizeImageFrame, type ImageCorner, type ImageGeometry } from './image-interactions';
import styles from './OwnerVisualBuilder.module.css';
type Bounds = ImageGeometry & { left: number; top: number };
type Gesture = { pointerId: number; x: number; y: number; corner: ImageCorner | 'crop'; original: ElementAppearance; current: ElementAppearance; geometry: ImageGeometry; frameStyle: string; imageStyle: string; frame: HTMLElement; image: HTMLImageElement; button: HTMLButtonElement };
export function OwnerCanvasImageTools({ canvasRef, target, value, disabled, onChange }: {
  canvasRef: RefObject<HTMLDivElement | null>; target: string; value?: ElementAppearance; disabled: boolean; onChange: (value: ElementAppearance) => void;
}) {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [crop, setCrop] = useState(false);
  const [undo, setUndo] = useState<ElementAppearance | null>(null);
  const [status, setStatus] = useState('');
  const gesture = useRef<Gesture | null>(null);
  const frameRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const node = canvas && Array.from(canvas.querySelectorAll<HTMLElement>('[data-owner-edit]')).find(node => node.dataset.ownerEdit === target);
    const frame = node?.hasAttribute?.('data-owner-image-frame') ? node : node?.querySelector<HTMLElement>('[data-owner-image-frame]');
    if (!canvas || !frame) { setBounds(null); return; }
    frameRef.current = frame;
    const update = () => { const rect = frame.getBoundingClientRect(), base = canvas.getBoundingClientRect(); const next = { left: rect.left - base.left + canvas.scrollLeft, top: rect.top - base.top + canvas.scrollTop, width: rect.width, height: rect.height, parentWidth: frame.parentElement?.getBoundingClientRect().width ?? base.width }; setBounds(old => old && Object.keys(next).every(key => old[key as keyof Bounds] === next[key as keyof Bounds]) ? old : next); };
    update(); const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update); observer?.observe(frame); observer?.observe(canvas);
    const cancel = () => { const state = gesture.current; if (!state) return; gesture.current = null; state.frame.style.cssText = state.frameStyle; state.image.style.cssText = state.imageStyle; if (state.button.hasPointerCapture?.(state.pointerId)) state.button.releasePointerCapture(state.pointerId); setStatus('Photo adjustment canceled.'); };
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('blur', cancel); observer?.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); const state = gesture.current; if (state) { state.frame.style.cssText = state.frameStyle; state.image.style.cssText = state.imageStyle; gesture.current = null; } };
  }, [canvasRef, target, value, disabled]);
  function finish(commit: boolean) {
    const state = gesture.current; if (!state) return;
    gesture.current = null; state.frame.style.cssText = state.frameStyle; state.image.style.cssText = state.imageStyle;
    if (state.button.hasPointerCapture?.(state.pointerId)) state.button.releasePointerCapture(state.pointerId);
    if (commit) { setUndo(state.original); onChange(state.current); setStatus('Photo framing updated in your draft.'); } else setStatus('Photo adjustment canceled.');
  }
  function start(event: PointerEvent<HTMLButtonElement>, corner: ImageCorner | 'crop') {
    const frame = frameRef.current, image = frame?.querySelector('img');
    if (disabled || !bounds || !frame || !image || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus();
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, corner, original: { ...value }, current: { ...value }, geometry: bounds, frameStyle: frame.style.cssText, imageStyle: image.style.cssText, frame, image, button: event.currentTarget };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function movement(event: PointerEvent<HTMLButtonElement>) {
    const state = gesture.current; if (!state || state.pointerId !== event.pointerId) return;
    if (disabled) { finish(false); return; }
    const dx = event.clientX - state.x, dy = event.clientY - state.y;
    state.current = { ...state.original, ...(state.corner === 'crop' ? moveImageCrop(state.original, dx, dy, state.geometry) : resizeImageFrame(state.geometry, dx, dy, state.corner, state.original.imageAspectLocked !== false)) };
    const size = getImageFrameStyle(state.current);
    // CSS pixel units must be explicit when applying React style values directly to the DOM.
    if (typeof size.width === 'string') state.frame.style.width = size.width;
    if (typeof size.height === 'string') { state.frame.style.height = size.height; state.frame.style.minHeight = '0'; state.frame.style.aspectRatio = 'auto'; }
    state.frame.style.maxWidth = '100%'; state.frame.style.marginInline = 'auto';
    Object.assign(state.image.style, getImageAppearanceStyle(state.current));
  }
  if (!bounds) return null;
  // The factory only returns event callbacks; gesture refs are read on interaction, never during render.
  /* eslint-disable react-hooks/refs */
  const events = (corner: ImageCorner | 'crop') => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => start(event, corner), onPointerMove: movement,
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => { if (gesture.current?.pointerId === event.pointerId) finish(true); },
    onPointerCancel: () => finish(false), onLostPointerCapture: () => finish(false),
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Escape' && gesture.current) { event.preventDefault(); event.stopPropagation(); finish(false); return; }
      if (disabled || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? 10 : 1;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      setUndo({ ...value }); onChange({ ...value, ...(corner === 'crop' ? moveImageCrop(value ?? {}, dx, dy, bounds) : resizeImageFrame(bounds, dx, dy, corner, value?.imageAspectLocked !== false)) }); setStatus('Photo framing updated in your draft.');
    },
  });
  /* eslint-enable react-hooks/refs */
  return <div className={styles.imageTools} data-owner-canvas-controls="true" onDragStart={event => { event.preventDefault(); event.stopPropagation(); }}>
    <div className={styles.imageToolbar} style={{ left: Math.max(0, bounds.left), top: Math.max(0, bounds.top - 42) }}>
      <button data-owner-button type="button" disabled={disabled} aria-pressed={value?.imageAspectLocked !== false} onClick={() => onChange({ ...value, imageAspectLocked: value?.imageAspectLocked === false })}>Lock ratio</button>
      <button data-owner-button type="button" disabled={disabled} aria-pressed={crop} onClick={() => setCrop(!crop)}>Crop position</button>
      <button data-owner-button type="button" disabled={disabled || !undo} onClick={() => { if (undo) { onChange(undo); setUndo(null); setStatus('Photo adjustment undone.'); } }}>Undo framing</button>
    </div>
    {crop && <button data-owner-button type="button" disabled={disabled} className={styles.cropHandle} style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }} aria-label="Drag to position photo crop. Arrow keys move crop; Escape cancels a drag." {...events('crop')}><span>Drag to position crop</span></button>}
    {(['nw','ne','sw','se'] as const).map(corner => <button key={corner} type="button" disabled={disabled} className={styles.imageCorner} data-corner={corner} style={{ left: bounds.left + (corner.endsWith('e') ? bounds.width : 0) - 12, top: bounds.top + (corner.startsWith('s') ? bounds.height : 0) - 12 }} aria-label={`Resize photo ${corner} corner. Arrow keys resize; Escape cancels a drag.`} {...events(corner)} />)}
    <span className={styles.srOnly} role="status" aria-live="polite">{status}</span>
  </div>;
}
