"use client";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { getImageAppearanceStyle, getImageFrameStyle, type ElementAppearance } from './appearance';
import { moveImageCrop, resizeImageFrame, type ImageCorner } from './image-interactions';
import { measureCanvasBox, type CanvasBoxBounds } from './box-affine';
import { multiplyAffine, transformPoint } from './box-geometry';
import { findCanvasBoxTarget } from './box-targets';
import styles from './OwnerVisualBuilder.module.css';
type Gesture = { pointerId: number; x: number; y: number; corner: ImageCorner | 'crop'; original: ElementAppearance; current: ElementAppearance; geometry: CanvasBoxBounds; frameStyle: string; imageStyle: string; frame: HTMLElement; image: HTMLImageElement; button: HTMLButtonElement };
export function OwnerCanvasImageTools({ canvasRef, target, occurrence = 0, value, disabled, onChange, renderVersion }: {
  renderVersion?: object; canvasRef: RefObject<HTMLDivElement | null>; target: string; occurrence?: number; value?: ElementAppearance; disabled: boolean; onChange: (value: ElementAppearance) => void;
}) {
  const [bounds, setBounds] = useState<CanvasBoxBounds | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [crop, setCrop] = useState(false);
  const [undo, setUndo] = useState<ElementAppearance | null>(null);
  const [status, setStatus] = useState('');
  const gesture = useRef<Gesture | null>(null);
  const frameRef = useRef<HTMLElement | null>(null);
  function release() {
    const state = gesture.current; gesture.current = null;
    if (state) {
      state.frame.style.cssText = state.frameStyle; state.image.style.cssText = state.imageStyle;
      try { if (state.button.hasPointerCapture?.(state.pointerId)) state.button.releasePointerCapture(state.pointerId); } catch { /* Detached capture is already gone. */ }
    }
    return state;
  }
  useEffect(() => {
    const canvas = canvasRef.current, node = canvas && findCanvasBoxTarget(canvas, target, occurrence);
    const frame = node?.hasAttribute?.('data-owner-image-frame') ? node : node?.querySelector<HTMLElement>('[data-owner-image-frame]');
    if (!canvas || !frame) { setBounds(null); setUnsupported(false); return; }
    let active = true;
    frameRef.current = frame;
    const update = () => {
      if (!active || gesture.current) return; // A temporary photo preview is never a measurement baseline.
      const next = measureCanvasBox(canvas, frame);
      setUnsupported(!next); setBounds(old => JSON.stringify(old) === JSON.stringify(next) ? old : next);
    };
    const cancel = () => { if (release()) setStatus('Photo adjustment canceled.'); };
    const resize = () => { cancel(); update(); };
    update(); const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(frame); observer?.observe(canvas);
    for (let parent = frame.parentElement; parent; parent = parent.parentElement) observer?.observe(parent);
    // Parent transforms can change without a layout resize. Cancel against the
    // original matrix instead of allowing a drag to jump to another coordinate plane.
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(resize);
    for (let parent = frame.parentElement; parent; parent = parent.parentElement) mutations?.observe(parent, { attributes: true, attributeFilter: ['style', 'class'] });
    window.addEventListener('blur', cancel); window.addEventListener('resize', resize); window.addEventListener('scroll', resize, true);
    return () => { active = false; window.removeEventListener('blur', cancel); observer?.disconnect(); mutations?.disconnect(); window.removeEventListener('resize', resize); window.removeEventListener('scroll', resize, true); release(); frameRef.current = null; };
  }, [canvasRef, target, occurrence, value, disabled, renderVersion]);
  function finish(commit: boolean, pointer?: number) {
    if (pointer !== undefined && gesture.current?.pointerId !== pointer) return;
    const state = release(); if (!state) return;
    if (commit && !disabled && JSON.stringify(state.current) !== JSON.stringify(state.original)) { setUndo(state.original); onChange(state.current); setStatus('Photo framing updated in your draft.'); }
    else if (!commit) setStatus('Photo adjustment canceled.');
  }
  function start(event: PointerEvent<HTMLButtonElement>, corner: ImageCorner | 'crop') {
    const frame = frameRef.current, image = frame?.querySelector('img');
    if (disabled || !bounds || !frame || !image || event.button !== 0 || event.isPrimary === false || gesture.current || ![event.clientX, event.clientY].every(Number.isFinite)) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true });
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { setStatus('Use the arrow keys or photo fields to adjust this image.'); return; }
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, corner, original: { ...value }, current: { ...value }, geometry: bounds, frameStyle: frame.style.cssText, imageStyle: image.style.cssText, frame, image, button: event.currentTarget };
  }
  function movement(event: PointerEvent<HTMLButtonElement>) {
    const state = gesture.current; if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    if (disabled) { finish(false); return; }
    if (![event.clientX, event.clientY].every(Number.isFinite)) return;
    if (Math.hypot(event.clientX - state.x, event.clientY - state.y) < 2) { state.current = state.original; state.frame.style.cssText = state.frameStyle; state.image.style.cssText = state.imageStyle; return; }
    const start = transformPoint(state.geometry.screenToParent, { x: state.x, y: state.y }), end = transformPoint(state.geometry.screenToParent, { x: event.clientX, y: event.clientY });
    const dx = end.x - start.x, dy = end.y - start.y;
    if (![dx, dy].every(Number.isFinite)) return;
    state.current = { ...state.original, ...(state.corner === 'crop' ? moveImageCrop(state.original, dx, dy, state.geometry) : resizeImageFrame(state.geometry, dx, dy, state.corner, state.original.imageAspectLocked !== false || event.shiftKey)) };
    const size = getImageFrameStyle(state.current);
    if (typeof size.width === 'string') state.frame.style.width = size.width;
    if (typeof size.height === 'string') { state.frame.style.height = size.height; state.frame.style.minHeight = '0'; state.frame.style.aspectRatio = 'auto'; }
    state.frame.style.maxWidth = '100%'; state.frame.style.marginInline = 'auto';
    Object.assign(state.image.style, getImageAppearanceStyle(state.current));
  }
  if (!bounds) return unsupported ? <p className={styles.boxUnsupported} data-owner-canvas-controls="true" role="status">Photo handles are unavailable inside this transform. Use the photo fields, or return to Whole content box.</p> : null;
  const matrix = multiplyAffine(bounds.parentToCanvas, { a: 1, b: 0, c: 0, d: 1, e: bounds.origin.x, f: bounds.origin.y });
  /* eslint-disable react-hooks/refs */
  const events = (corner: ImageCorner | 'crop') => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => start(event, corner), onPointerMove: movement,
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.stopPropagation(); finish(true, event.pointerId); },
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => finish(false, event.pointerId), onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => finish(false, event.pointerId),
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.nativeEvent?.isComposing) return;
      if (event.key === 'Escape' && gesture.current) { event.preventDefault(); event.stopPropagation(); finish(false); return; }
      if (disabled || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); finish(false); const step = event.shiftKey ? 10 : 1;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      const next = { ...value, ...(corner === 'crop' ? moveImageCrop(value ?? {}, dx, dy, bounds) : resizeImageFrame(bounds, dx, dy, corner, value?.imageAspectLocked !== false)) };
      if (JSON.stringify(next) !== JSON.stringify(value)) { setUndo({ ...value }); onChange(next); setStatus('Photo framing updated in your draft.'); }
    },
  });
  /* eslint-enable react-hooks/refs */
  return <div className={styles.imageTools} data-owner-canvas-controls="true" onClick={event => { event.preventDefault(); event.stopPropagation(); }} onDragStart={event => { event.preventDefault(); event.stopPropagation(); }}>
    <div className={styles.imageToolbar} style={{ left: Math.max(0, bounds.left), top: Math.max(0, bounds.top - 42) }}>
      <button data-owner-button type="button" disabled={disabled} aria-pressed={value?.imageAspectLocked !== false} onClick={() => { if (!disabled) { finish(false); onChange({ ...value, imageAspectLocked: value?.imageAspectLocked === false }); } }}>Lock ratio</button>
      <button data-owner-button type="button" disabled={disabled} aria-pressed={crop} onClick={() => { finish(false); setCrop(!crop); }}>Crop position</button>
      <button data-owner-button type="button" disabled={disabled || !undo} onClick={() => { if (!disabled && undo) { finish(false); onChange(undo); setUndo(null); setStatus('Photo adjustment undone.'); } }}>Undo framing</button>
    </div>
    {crop && <button data-owner-button type="button" disabled={disabled} className={styles.cropHandle} style={{ left: 0, top: 0, width: bounds.width, height: bounds.height, transform: `matrix(${matrix.a}, ${matrix.b}, ${matrix.c}, ${matrix.d}, ${matrix.e}, ${matrix.f})`, transformOrigin: '0 0' }} aria-label="Drag to position photo crop. Arrow keys move crop; Escape cancels a drag." {...events('crop')}><span>Drag to position crop</span></button>}
    {(['nw','ne','sw','se'] as const).map(corner => { const position = transformPoint(matrix, { x: corner.endsWith('e') ? bounds.width : 0, y: corner.startsWith('s') ? bounds.height : 0 }); return <button key={corner} data-owner-button type="button" disabled={disabled} className={styles.imageCorner} data-corner={corner} style={{ left: position.x - 12, top: position.y - 12 }} aria-label={`Resize photo ${corner} corner. Arrow keys resize; Escape cancels a drag.`} {...events(corner)} />; })}
    <span className={styles.srOnly} role="status" aria-live="polite">{status}</span>
  </div>;
}
