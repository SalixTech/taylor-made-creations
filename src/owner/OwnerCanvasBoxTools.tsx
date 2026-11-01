"use client";
import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type KeyboardEvent, type RefObject } from "react";
import type { ElementAppearance } from "./appearance";
import { elementBoxDimensions, resizeElementBoxInUnits, type BoxUnit, initialElementBox, moveElementBox, moveElementBoxFrame, resizeElementBox, resizeElementBoxFromHandle, rotateElementBox, inverseAffine, rotationAffine, multiplyAffine, transformPoint, sameElementBox, validElementBox, type ElementBox, type BoxHandle, type Affine } from "./box-geometry";
import { measuredCanvasFrame, measureCanvasBox, type CanvasBoxBounds } from "./box-affine";
import { firstBoxMaterializationError } from "./box-materialization";
import { OwnerSelect } from "./OwnerFields";
import { findCanvasBoxTarget } from "./box-targets";
import {canvasTextExtent,canvasToolbarPosition,type CanvasVisualExtent} from "./canvas-toolbar-bounds";
import { OwnerNumberInput } from "./OwnerDesignInputs";
import styles from "./OwnerVisualBuilder.module.css";
import { boxAlignmentGuides, type AlignmentRect, type AlignmentGuide } from "./box-alignment";
import { applyPlacementControl, measurePlacementControls, placementControlChart } from './canvas-placement-geometry';
import {validCanvasPlacement, type CanvasPlacement} from './canvas-layout';
import type {CapturedCanvasFrame} from './canvas-placement-geometry';
type CanvasMoveHooks={onCanvasMoveStart?:()=>void;onCanvasMovePreview?:(point:{x:number;y:number},snapshot?:CapturedCanvasFrame)=>void;onCanvasMoveCommit?:(snapshot:CapturedCanvasFrame,point:{x:number;y:number},next:{box:ElementBox;placement?:CanvasPlacement})=>boolean|void;onCanvasMoveCancel?:()=>void};
type PlacementProps = { layoutIdentity?:{id:string;scope:"page"|"chrome"}; placement?:CanvasPlacement; resolvePlacementDestination?:(canvas:HTMLDivElement)=>HTMLElement|null; onPlacementChange?:(placement:CanvasPlacement,box:ElementBox)=>void; onResetPlacement?:()=>void };
type Kind = "move" | "rotate" | BoxHandle;
type Gesture = { pointer: number; x: number; y: number; kind: Kind; original: ElementBox; current: ElementBox; bounds: CanvasBoxBounds; lastX: number; lastY: number; button: HTMLButtonElement; alignments: AlignmentRect[]; preserveContents:boolean };
const handles: BoxHandle[] = ["se", "nw", "n", "ne", "e", "s", "sw", "w"];
const handleNames = {nw:"top left corner",n:"top edge",ne:"top right corner",e:"right edge",se:"bottom right corner",s:"bottom edge",sw:"bottom left corner",w:"left edge"};
function releaseGesture(ref: { current: Gesture | null }) {
  const state = ref.current; ref.current = null;
  try { if (state?.button.hasPointerCapture?.(state.pointer)) state.button.releasePointerCapture(state.pointer); } catch { /* Capture already canceled or removed. */ }
  return state;
}
function markCanvasOutline(node: HTMLElement, visible: boolean) {
  if (visible) node.dataset.ownerCanvasOutline = "true";
  else delete node.dataset.ownerCanvasOutline;
}
function frameGeometry(bounds: CanvasBoxBounds, box: ElementBox, original: ElementBox) {
  const responsive = bounds.parentWidth / box.referenceParentPx;
  const width = box.widthPercent / 100 * bounds.parentWidth, height = box.heightPx * responsive * bounds.heightFactor;
  const rotation = rotationAffine(box.rotationDeg ?? 0), rotatedCenter = transformPoint(rotation,{x:width/2,y:height/2});
  rotation.e = bounds.origin.x + (box.xPercent-original.xPercent)/100*bounds.parentWidth + width/2 - rotatedCenter.x;
  rotation.f = bounds.origin.y + (box.yPx-original.yPx)*responsive + height/2 - rotatedCenter.y;
  return {width,height,matrix:multiplyAffine(bounds.parentToCanvas,rotation)};
}
const matrixStyle = (m: Affine) => `matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, ${m.e}, ${m.f})`;
export function OwnerCanvasBoxTools({ onCanvasMoveStart,onCanvasMovePreview,onCanvasMoveCommit,onCanvasMoveCancel, layoutIdentity, canvasRef, target, occurrence = 0, value, disabled, onChange, initialAspectLocked, onInitialAspectLockChange, onEditContent, onDelete, onCopyBox, onPasteBox, onSelectParent, selectBoxContents = true, onSelectBoxContents, sectionOrder, reparentId, renderVersion, placement, resolvePlacementDestination, onPlacementChange, onResetPlacement }: PlacementProps & CanvasMoveHooks & { selectBoxContents?:boolean; onSelectBoxContents?:(selected:boolean)=>void; onSelectParent?:()=>void; onCopyBox?:()=>void; onPasteBox?:()=>void; onDelete?:()=>void; reparentId?:string; sectionOrder?: { index: number; count: number; onMove: (direction: -1 | 1) => void }; onEditContent?: () => void; renderVersion?: object; initialAspectLocked?: boolean; onInitialAspectLockChange?: (locked: boolean) => void; occurrence?: number; canvasRef: RefObject<HTMLDivElement | null>; target: string; value?: ElementAppearance; disabled: boolean; onChange: (value: ElementAppearance) => void }) {
  const [bounds, setBounds] = useState<CanvasBoxBounds | null>(null), [preview, setPreview] = useState<{ box: ElementBox; appearance: ElementAppearance | undefined; target: string; guides?: AlignmentGuide[] } | null>(null), [notice, setNotice] = useState("");
  const [hasContents,setHasContents]=useState(false);
  const [textExtent,setTextExtent]=useState<CanvasVisualExtent|null>(null);
  const [initialLocked, setInitialLocked] = useState(true), [unsupported, setUnsupported] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const moveHooks=useRef({onCanvasMoveStart,onCanvasMovePreview,onCanvasMoveCommit,onCanvasMoveCancel});useLayoutEffect(()=>{moveHooks.current={onCanvasMoveStart,onCanvasMovePreview,onCanvasMoveCommit,onCanvasMoveCancel};});
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [toolbarSize, setToolbarSize] = useState({ width: 280, height: 60 });
  const hasBounds = !!bounds;
  useLayoutEffect(() => {
    const node = toolbarRef.current;
    if (!node) return;
    const measure = () => { const width = node.offsetWidth, height = node.offsetHeight; if (width > 0 && height > 0) setToolbarSize(current => current.width === width && current.height === height ? current : { width, height }); };
    measure(); const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure); observer?.observe(node);
    return () => observer?.disconnect();
  }, [hasBounds, target, occurrence]);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const node = canvas && findCanvasBoxTarget(canvas, target, occurrence, layoutIdentity);
    if (!canvas || !node) { setBounds(null); setTextExtent(null); setUnsupported(false); return; }
    setHasContents(!!node.querySelector?.("[data-owner-edit]"));
    let active = true;
    const cancel = () => { const prior=releaseGesture(gesture);if(prior?.kind==="move")moveHooks.current.onCanvasMoveCancel?.(); setPreview(null); };
    const measure = () => {
      if (!active) return;
      const destination = placement ? resolvePlacementDestination?.(canvas) : null;
      const next = placement ? (destination ? measurePlacementControls(canvas,destination,placement,value?.box)?.bounds ?? null : null) : measureCanvasBox(canvas, node, validElementBox(value?.box) ? value.box : undefined);
      if (gesture.current && (!next || next.signature !== gesture.current.bounds.signature)) cancel();
      markCanvasOutline(node, !!next && !next.materializationError);
      const extent=canvasTextExtent(canvas,node);setTextExtent(current=>JSON.stringify(current)===JSON.stringify(extent)?current:extent);
      setUnsupported(!next);
      setBounds(current => current && next && JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    const resize = () => { cancel(); measure(); };
    measure(); const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    const mutations = typeof MutationObserver === "undefined" ? null : new MutationObserver(measure);
    observer?.observe(node); observer?.observe(canvas); mutations?.observe(node,{attributes:true,attributeFilter:["style","class"]});
    for (let parent = node.parentElement; parent; parent = parent.parentElement) { observer?.observe(parent); mutations?.observe(parent,{attributes:true,attributeFilter:["style","class"]}); }
    const hidden=()=>{if(document.hidden)cancel();};document.addEventListener("visibilitychange",hidden);
    window.addEventListener("resize", resize); window.addEventListener("scroll", resize, { capture: true }); window.addEventListener("blur", cancel);
    return () => { document.removeEventListener("visibilitychange",hidden); active = false; markCanvasOutline(node, false); observer?.disconnect(); mutations?.disconnect(); window.removeEventListener("resize", resize); window.removeEventListener("scroll", resize, { capture: true }); window.removeEventListener("blur", cancel); cancel(); };
  }, [canvasRef, target, occurrence, layoutIdentity, value, disabled, initialAspectLocked, renderVersion, placement, resolvePlacementDestination]);
  if (!bounds) return unsupported ? <div data-owner-canvas-controls="true" className={styles.boxUnsupported} role="status">Canvas handles are unavailable while this box is hidden, uses a multi-line inline layout, or is inside an unsupported transform. {validElementBox(value?.box) ? "Use the content box fields, or remove the unsupported transform." : "Make the box visible and remove any unsupported transform to use handles."}</div> : null;
  if (bounds.materializationError) return <div className={styles.boxUnsupported} data-owner-canvas-controls="true" role="status">{bounds.materializationError}</div>;
  const chart = placement ? placementControlChart(placement,value?.box) : null;
  if (placement && !chart) return <p role="status">This placement cannot be safely edited. Nothing was changed.</p>;
  const boxed = !!placement || validElementBox(value?.box);
  const box = chart ? chart.box : boxed ? value!.box! : { ...initialElementBox(bounds), flow: bounds.flow, aspectLocked: initialAspectLocked ?? initialLocked };
  const ghost = preview?.appearance === value && preview?.target === target && !disabled ? preview.box : null;
  const baseFrame = measuredCanvasFrame(bounds);
  const frame = ghost ? frameGeometry(bounds, ghost, box) : baseFrame;
  const {left:toolbarLeft,top:toolbarTop}=canvasToolbarPosition(baseFrame,textExtent,toolbarSize,bounds.canvasWidth);
  function save(next: ElementBox) {
    if (placement) {
      const canvas=canvasRef.current,destination=canvas&&resolvePlacementDestination?.(canvas);
      const current=canvas&&destination?measurePlacementControls(canvas,destination,placement,value?.box):null;
      const updated=chart?applyPlacementControl(chart,next):null;
      if(disabled||!current||current.bounds.signature!==bounds?.signature||!updated||!onPlacementChange){setNotice("The placement changed or cannot be measured safely. Nothing was changed.");return;}
      onPlacementChange(updated,next);setNotice("Placement updated in your draft.");return;
    }
    if (!boxed && bounds) {
      const node = canvasRef.current && findCanvasBoxTarget(canvasRef.current, target, occurrence,layoutIdentity);
      const current = node && canvasRef.current ? measureCanvasBox(canvasRef.current, node) : null;
      const problem = !node || !current ? "This box is no longer safely measurable. Nothing was changed." : current.signature !== bounds.signature ? "The layout changed during this adjustment. Please try again; nothing was changed." : firstBoxMaterializationError(node, current);
      if (problem) { setNotice(problem); return; }
    }
    if (!disabled && validElementBox(next) && (!boxed || !sameElementBox(box, next))) { onChange({ ...value, box: next }); setNotice("Content box updated in your draft."); }
  }
  function finish(commit: boolean, pointer?: number) {
    if (pointer !== undefined && gesture.current?.pointer !== pointer) return;
    const state = releaseGesture(gesture); if (!state) return;
    setPreview(null);
    if(commit&&state.kind==="move"&&!sameElementBox(state.original,state.current)&&moveHooks.current.onCanvasMoveCommit){
      const f=frameGeometry(state.bounds,state.current,state.original),inverse=inverseAffine(state.bounds.parentToCanvas);
      const matrix=inverse?multiplyAffine(state.bounds.parentToScreen,multiplyAffine(inverse,f.matrix)):null,scale=state.bounds.parentWidth/state.current.referenceParentPx;
      const placement=matrix?{matrix,widthPx:f.width,heightPx:f.height,aspectLocked:state.current.aspectLocked,...(state.current.contentOffset?{contentOffset:{xPx:state.current.contentOffset.xPx*scale,yPx:state.current.contentOffset.yPx*scale}}:{})}:null;
      if(placement&&validCanvasPlacement(placement)){const {matrix:screenMatrix,...rest}=placement;const consumed=moveHooks.current.onCanvasMoveCommit({screenMatrix,...rest},{x:state.lastX,y:state.lastY},{box:state.current,...(chart?{placement:applyPlacementControl(chart,state.current)??undefined}:{})});if(consumed!==false)return;}else{moveHooks.current.onCanvasMoveCancel?.();setNotice("This move cannot be measured safely. Nothing changed.");return;}
    }
    if(state.kind==="move")moveHooks.current.onCanvasMoveCancel?.();
    if (commit && !sameElementBox(state.original, state.current)) save(state.current);
    else if (!commit) setNotice("Box adjustment canceled.");
    else if (Math.hypot(state.x - state.lastX, state.y - state.lastY) >= 2) setNotice("No box change applied. Check the position fields or try the gesture again; positions are not contained to the section.");
  }
  function start(event: PointerEvent<HTMLButtonElement>, kind: Kind) {
    event.preventDefault(); event.stopPropagation();
    if (disabled || event.button !== 0 || event.isPrimary === false || gesture.current || !bounds || ![event.clientX, event.clientY].every(Number.isFinite)) return;
    event.currentTarget.focus({ preventScroll: true });
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { setNotice("Use the arrow keys or geometry fields to adjust this box."); return; }
    const canvas=canvasRef.current, selected=canvas&&findCanvasBoxTarget(canvas,target,occurrence,layoutIdentity);
    const alignments:AlignmentRect[]=[];
    if(canvas&&selected){
      const candidates=[selected.parentElement,...Array.from(canvas.querySelectorAll<HTMLElement>("[data-owner-edit]"))];
      for(const candidate of candidates){if(!candidate||candidate===selected||selected.contains?.(candidate)||candidate!==selected.parentElement&&candidate.contains?.(selected))continue;
        const rect=candidate.getBoundingClientRect();alignments.push({left:rect.left,top:rect.top,width:rect.width,height:rect.height});}
    }
    if(kind==="move")moveHooks.current.onCanvasMoveStart?.();
    gesture.current = { preserveContents:hasContents&&!selectBoxContents, alignments, pointer:event.pointerId,x:event.clientX,y:event.clientY,kind,original:box,current:box,bounds,lastX:event.clientX,lastY:event.clientY,button:event.currentTarget };
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const state = gesture.current; if (!state || state.pointer !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    if (disabled) { finish(false); return; }
    if (![event.clientX, event.clientY].every(Number.isFinite)) return;
    state.lastX = event.clientX; state.lastY = event.clientY;
    if (Math.hypot(event.clientX-state.x,event.clientY-state.y) < 2) { state.current=state.original; setPreview(null); return; }
    const b=state.bounds, start=transformPoint(b.screenToParent,{x:state.x,y:state.y}), end=transformPoint(b.screenToParent,{x:event.clientX,y:event.clientY});
    const scale=state.original.referenceParentPx/b.parentWidth, dx=(end.x-start.x)*scale, dy=(end.y-start.y)*scale;
    if (state.kind === "move") state.current=(state.preserveContents?moveElementBoxFrame:moveElementBox)(state.original,state.original.xPercent+dx/state.original.referenceParentPx*100,state.original.yPx+dy);
    else if (state.kind === "rotate") {
      const center={x:b.origin.x+b.width/2,y:b.origin.y+b.height/2};
      const delta=(Math.atan2(end.y-center.y,end.x-center.x)-Math.atan2(start.y-center.y,start.x-center.x))*180/Math.PI;
      const wrapped=((delta+180)%360+360)%360-180;
      const angle=(((state.original.rotationDeg ?? 0)+wrapped+180)%360+360)%360-180;
      state.current=rotateElementBox(state.original,event.shiftKey ? Math.round(angle/15)*15 : angle);
    } else {
      const local=transformPoint(rotationAffine(-(state.original.rotationDeg ?? 0)),{x:dx,y:dy});
      state.current=resizeElementBoxFromHandle(state.original,state.kind,local.x,local.y,state.original.aspectLocked || event.shiftKey,b.heightFactor);
    }
    const currentFrame=frameGeometry(b,state.current,state.original),canvasToParent=inverseAffine(b.parentToCanvas);
    let guides:AlignmentGuide[]=[];
    if(canvasToParent&&state.kind!=="rotate"){
      const screenMatrix=multiplyAffine(b.parentToScreen,multiplyAffine(canvasToParent,currentFrame.matrix));
      const corners=[{x:0,y:0},{x:currentFrame.width,y:0},{x:0,y:currentFrame.height},{x:currentFrame.width,y:currentFrame.height}].map(p=>transformPoint(screenMatrix,p));
      const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y),left=Math.min(...xs),top=Math.min(...ys);
      guides=boxAlignmentGuides({left,top,width:Math.max(...xs)-left,height:Math.max(...ys)-top},state.alignments);
    }
    if(state.kind==="move"){
      const inverse=inverseAffine(b.parentToCanvas),matrix=inverse?multiplyAffine(b.parentToScreen,multiplyAffine(inverse,currentFrame.matrix)):null;
      const scale=b.parentWidth/state.current.referenceParentPx;
      moveHooks.current.onCanvasMovePreview?.({x:event.clientX,y:event.clientY},matrix?{screenMatrix:matrix,widthPx:currentFrame.width,heightPx:currentFrame.height,aspectLocked:state.current.aspectLocked,...(state.current.contentOffset?{contentOffset:{xPx:state.current.contentOffset.xPx*scale,yPx:state.current.contentOffset.yPx*scale}}:{})}:undefined);
    }
    setPreview({ box:state.current,appearance:value,target,guides });
  }
  function keys(event: KeyboardEvent<HTMLButtonElement>, kind: Kind) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); return; }
    if (disabled || event.nativeEvent?.isComposing || !["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); finish(false);
    const step=event.shiftKey ? 10 : 1, dx=event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0, dy=event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    const next=kind === "move" ? (hasContents&&!selectBoxContents?moveElementBoxFrame:moveElementBox)(box,box.xPercent+dx,box.yPx+dy) : kind === "rotate" ? rotateElementBox(box,event.shiftKey ? Math.round(((box.rotationDeg ?? 0)+(dx || dy)*1.5)/15)*15 : (box.rotationDeg ?? 0)+(dx || dy)) : resizeElementBoxFromHandle(box,kind,dx*box.referenceParentPx/100,dy,box.aspectLocked || event.shiftKey,bounds!.heightFactor);
    if (!sameElementBox(box,next)) save(next);
  }
  /* eslint-disable react-hooks/refs */
  const events=(kind:Kind)=>({onPointerDown:(event:PointerEvent<HTMLButtonElement>)=>start(event,kind),onPointerMove:move,onPointerUp:(event:PointerEvent<HTMLButtonElement>)=>{event.preventDefault();event.stopPropagation();finish(true,event.pointerId);},onPointerCancel:(event:PointerEvent<HTMLButtonElement>)=>finish(false,event.pointerId),onLostPointerCapture:(event:PointerEvent<HTMLButtonElement>)=>finish(false,event.pointerId),onKeyDown:(event:KeyboardEvent<HTMLButtonElement>)=>keys(event,kind)});
  const position=(x:number,y:number):CSSProperties=>{const p=transformPoint(frame.matrix,{x,y});return {left:p.x-14,top:p.y-14};};
  return <div data-owner-canvas-controls="true" className={styles.boxTools} onClick={event=>{event.preventDefault();event.stopPropagation();}} onDragStart={event=>{if(event.target instanceof HTMLElement&&event.target.closest("[data-owner-reparent-id]"))return;event.preventDefault();event.stopPropagation();}}>
    {ghost&&preview?.guides?.map((guide,index)=>{
      const screenToCanvas=multiplyAffine(bounds.parentToCanvas,bounds.screenToParent);
      const from=transformPoint(screenToCanvas,guide.axis==='x'?{x:guide.position,y:guide.start}:{x:guide.start,y:guide.position});
      const to=transformPoint(screenToCanvas,guide.axis==='x'?{x:guide.position,y:guide.end}:{x:guide.end,y:guide.position});
      const length=Math.hypot(to.x-from.x,to.y-from.y),angle=Math.atan2(to.y-from.y,to.x-from.x)*180/Math.PI;
      return [from.x,from.y,length,angle].every(Number.isFinite)?<span key={index} aria-hidden="true" data-owner-alignment-guide={guide.axis} data-guide-proximity={guide.proximity} className={styles.alignmentGuide} style={{left:from.x,top:from.y,width:length,transform:`rotate(${angle}deg)`}}/>:null;
    })}
    <div className={styles.boxMovePerimeter} style={{left:0,top:0,width:baseFrame.width,height:baseFrame.height,transform:matrixStyle(baseFrame.matrix),transformOrigin:"0 0"}}>{["top","right","bottom","left"].map(edge=><button key={edge} data-owner-button type="button" disabled={disabled} className={`${styles.boxMoveSurface} ${styles[`boxMove${edge}`]}`} {...events("move")} aria-label={`Drag ${edge} border to move ${selectBoxContents?"this box and its contents":"this frame only"}`} tabIndex={-1}/>)}</div>
    <div aria-hidden="true" className={ghost ? styles.boxGhost : styles.boxOutline} style={{left:0,top:0,width:frame.width,height:frame.height,transform:matrixStyle(frame.matrix),transformOrigin:"0 0"}} />
    <div ref={toolbarRef} className={styles.boxToolbar} data-moving={!!preview && gesture.current?.kind==="move" || undefined} style={{left:toolbarLeft,top:toolbarTop,maxWidth:`calc(100% - ${toolbarLeft}px)`}}>
      <div className={styles.boxToolbarButtons}>
      {onCopyBox&&<button data-owner-button type="button" disabled={disabled} onClick={onCopyBox}>Copy box</button>}
      {onPasteBox&&<button data-owner-button type="button" disabled={disabled} onClick={onPasteBox}>Paste box</button>}
      {onEditContent && <button data-owner-button type="button" disabled={disabled} onClick={onEditContent}>Edit content</button>}
      <button data-owner-button type="button" disabled={disabled} {...events("move")} aria-label="Move content box. Drag or use arrow keys; Shift moves faster; Escape cancels.">Move box</button>

      {onDelete&&<button data-owner-button type="button" disabled={disabled} onClick={()=>{if(!disabled){finish(false);onDelete();}}}>Delete</button>}
      <details className={styles.boxMore}><summary onClick={event=>event.stopPropagation()}>More</summary><div>{sectionOrder&&<><button data-owner-button type="button" disabled={disabled||sectionOrder.index<=0} onClick={()=>{if(!disabled&&sectionOrder.index>0)sectionOrder.onMove(-1);}}>Move earlier</button><button data-owner-button type="button" disabled={disabled||sectionOrder.index>=sectionOrder.count-1} onClick={()=>{if(!disabled&&sectionOrder.index<sectionOrder.count-1)sectionOrder.onMove(1);}}>Move later</button></>}      {onSelectParent&&<button data-owner-button type="button" disabled={disabled} onClick={onSelectParent}>Select parent box</button>}
      {hasContents&&<button data-owner-button type="button" disabled={disabled} aria-pressed={!selectBoxContents} onClick={()=>{if(disabled)return;finish(false);onSelectBoxContents?.(!selectBoxContents);}}>Move frame only</button>}
      {reparentId&&<button data-owner-button type="button" draggable={!disabled} disabled={disabled} data-owner-reparent-id={reparentId} title="Drag this handle into a section container to change membership">Move into section</button>}
      <button data-owner-button type="button" disabled={disabled} aria-pressed={box.aspectLocked} onClick={()=>{if(disabled)return;finish(false);if(boxed)save({...box,aspectLocked:!box.aspectLocked});else if(onInitialAspectLockChange)onInitialAspectLockChange(!box.aspectLocked);else setInitialLocked(locked=>!locked);}}>Lock ratio: {box.aspectLocked ? "on" : "off"}</button>
      <button data-owner-button type="button" disabled={disabled || !boxed || (!!placement && !onResetPlacement)} onClick={()=>{if(disabled || !boxed)return;finish(false);if(placement){onResetPlacement?.();return;}const next={...value};delete next.box;setInitialLocked(true);onInitialAspectLockChange?.(true);onChange(next);setNotice("Original flow layout restored.");}}>Reset box</button>
</div></details>
      </div>
      <span className={styles.boxToolbarHint}>{hasContents ? (selectBoxContents?"Move frame and contents together · draft only":"Move frame only · contents stay in place · draft only") : "Drag content or handles · draft only"}</span>
    </div>
    {handles.map(handle=><button key={handle} data-owner-button type="button" disabled={disabled} className={styles.boxHandle} data-handle={handle} style={position(handle.includes("w")?0:handle.includes("e")?frame.width:frame.width/2,handle.includes("n")?0:handle.includes("s")?frame.height:frame.height/2)} {...events(handle)} aria-label={`Resize content box. ${handleNames[handle]}. Drag or use arrow keys; Shift keeps proportions; Escape cancels.`} title={`Resize ${handleNames[handle]}`} />)}
    <button data-owner-button type="button" disabled={disabled} className={styles.boxRotateHandle} style={position(frame.width/2,-32)} {...events("rotate")} aria-label="Rotate content box. Drag or use arrow keys; Shift snaps to 15 degrees; Escape cancels." title="Rotate box; Shift snaps to 15°">↻</button>
    <span className={styles.boxNotice} role="status">{notice}</span>
  </div>;
  /* eslint-enable react-hooks/refs */
}
/** Typed geometry also works before the first drag. Measurement is read-only:
 * opening, switching units or canceling never materializes a saved box. */
export function OwnerBoxFields({ layoutIdentity, value, onChange, canvasRef, target, occurrence = 0, disabled = false, selectBoxContents = true, initialAspectLocked, onInitialAspectLockChange, renderVersion, placement, resolvePlacementDestination, onPlacementChange }: PlacementProps & { selectBoxContents?:boolean; renderVersion?: object; initialAspectLocked?: boolean; onInitialAspectLockChange?: (locked: boolean) => void; value?: ElementAppearance; onChange: (value: ElementAppearance) => void; canvasRef?: RefObject<HTMLDivElement | null>; target?: string; occurrence?: number; disabled?: boolean }) {
  const [unit, setUnit] = useState<BoxUnit>("px");
  const [notice, setNotice] = useState("");
  const [localInitialLocked, setLocalInitialLocked] = useState(true);
  const [measurement, setMeasurement] = useState<{ target: string; occurrence: number; box: ElementBox; bounds: CanvasBoxBounds } | null>(null);
  const chart=placement?placementControlChart(placement,value?.box):null;
  const boxed = !!placement || validElementBox(value?.box);
  useLayoutEffect(() => {
    const canvas = canvasRef?.current, node = canvas && target ? findCanvasBoxTarget(canvas, target, occurrence, layoutIdentity) : null;
    if (!canvas || !node || !target) { setMeasurement(null); return; }
    let active = true;
    const measure = () => {
      if (!active) return;
      const destination=placement?resolvePlacementDestination?.(canvas):null;
      const bounds = placement ? (destination?measurePlacementControls(canvas,destination,placement,value?.box)?.bounds??null:null) : measureCanvasBox(canvas, node, boxed ? value?.box : undefined);
      const next = bounds ? { target, occurrence, box: { ...initialElementBox(bounds), flow: bounds.flow }, bounds } : null;
      setMeasurement(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node); observer?.observe(canvas);
    for (let parent = node.parentElement; parent; parent = parent.parentElement) observer?.observe(parent);
    window.addEventListener("resize", measure);
    return () => { active = false; observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [canvasRef, target, occurrence, layoutIdentity, boxed, value, renderVersion, placement, resolvePlacementDestination]);
  const box = chart ? chart.box : boxed ? value?.box : measurement?.target === target && measurement?.occurrence === occurrence ? { ...measurement.box, aspectLocked: initialAspectLocked ?? localInitialLocked } : null;
  if (!box) return target ? <p className={styles.help} role="status">Size and tilt controls become available when this registered box is visible in the canvas. Unsupported 3-D transforms are not changed.</p> : null;
  if (!boxed && measurement?.bounds.materializationError) return <p className={styles.boxNotice} role="status">{measurement.bounds.materializationError}</p>;
  const dimensions = elementBoxDimensions(box, unit);
  function movePosition(x:number,y:number){
    const node=canvasRef?.current&&target?findCanvasBoxTarget(canvasRef.current,target,occurrence):null;
    return node?.querySelector?.("[data-owner-edit]")&&!selectBoxContents?moveElementBoxFrame(box!,x,y):moveElementBox(box!,x,y);
  }
  function change(next: ElementBox) {
    if (disabled || !validElementBox(next) || sameElementBox(box!, next)) return;
    if(placement){
      const canvas=canvasRef?.current,destination=canvas&&resolvePlacementDestination?.(canvas);
      const current=canvas&&destination?measurePlacementControls(canvas,destination,placement,value?.box):null;
      const updated=chart?applyPlacementControl(chart,next):null;
      if(!current||current.bounds.signature!==measurement?.bounds.signature||!updated||!onPlacementChange){setNotice("The placement changed or cannot be measured safely. Nothing was changed.");return;}
      onPlacementChange(updated,next);setNotice("");return;
    }
    if (canvasRef && target && (next.rotationDeg ?? 0) !== (box!.rotationDeg ?? 0)) {
      const node = canvasRef.current && findCanvasBoxTarget(canvasRef.current, target, occurrence,layoutIdentity);
      if (!node || !canvasRef.current || !measureCanvasBox(canvasRef.current, node, boxed ? box! : undefined)) { setNotice("Tilt is unavailable in this unsupported or hidden layout. Nothing was changed."); return; }
    }
    if (!boxed && measurement) {
      const node = canvasRef?.current && target && findCanvasBoxTarget(canvasRef.current, target, occurrence,layoutIdentity);
      const current = node && canvasRef?.current ? measureCanvasBox(canvasRef.current, node) : null;
      const problem = !node || !current ? "This box is no longer safely measurable. Nothing was changed." : current.signature !== measurement.bounds.signature ? "The layout changed. Please try again; nothing was changed." : firstBoxMaterializationError(node, current);
      if (problem) { setNotice(problem); return; }
    }
    setNotice(""); onChange({ ...value, box: next });
  }
  const numberProps = { commitMode: "blur" as const, disabled, step: 0.001 };
  return <details open className={styles.boxFields}><summary>Size, position &amp; tilt</summary>
    {notice && <p className={styles.boxNotice} role="alert">{notice}</p>}
    <label className={styles.boxRatio}><input type="checkbox" disabled={disabled} checked={box.aspectLocked} onChange={event => { if (disabled) return; if (boxed) change({ ...box, aspectLocked: event.target.checked }); else if (onInitialAspectLockChange) onInitialAspectLockChange(event.target.checked); else setLocalInitialLocked(event.target.checked); }} /> Lock aspect ratio</label>
    <div className={styles.boxUnits}><OwnerSelect label="Size units" value={unit} options={[{ value: "px", label: "PX × PX · CSS pixels" }, { value: "in", label: "IN × IN · CSS inches" }]} onChange={next => { if (!disabled && (next === "px" || next === "in")) setUnit(next); }} /></div>
    <div className={styles.boxDimensions}>
      <OwnerNumberInput key={`width-${unit}`} {...numberProps} label="Design width" value={Number(dimensions.width.toFixed(4))} min={Number.MIN_VALUE} max={Number.MAX_VALUE} unit={unit} hint="Enter or leave the field to apply. Escape cancels." onChange={width => { if (width !== undefined) change(resizeElementBoxInUnits(box, width, dimensions.height, unit, "width")); }} />
      <span aria-hidden="true">×</span>
      <OwnerNumberInput key={`height-${unit}`} {...numberProps} label="Design height" value={Number(dimensions.height.toFixed(4))} min={Number.MIN_VALUE} max={Number.MAX_VALUE} unit={unit} hint="With ratio locked, the other dimension follows." onChange={height => { if (height !== undefined) change(resizeElementBoxInUnits(box, dimensions.width, height, unit, "height")); }} />
    </div>
    <p className={styles.help}>1 CSS inch = 96 CSS pixels, not a physical ruler measurement. Text reflows within its box without stretching glyphs. Positions may overlap other content. Independent mobile mode stores separate geometry. Changing units alone changes nothing.</p>
    <OwnerNumberInput {...numberProps} label="Box rotation" hint="Clockwise degrees around the center. Drag the round handle; Shift snaps to 15°. Enter or blur applies; Escape cancels." value={box.rotationDeg ?? 0} min={-180} max={180} unit="°" onChange={angle => { if (angle !== undefined) change(rotateElementBox(box, angle)); }} />
    <details className={styles.boxAdvanced}><summary>Responsive size &amp; position</summary>
      <OwnerNumberInput {...numberProps} label="Box width" hint={placement ? "% compared with this piece’s current size. Clear keeps the last valid value." : "Percentage of the available page width. Clear keeps the last valid value."} value={box.widthPercent} min={Number.MIN_VALUE} max={Number.MAX_VALUE} unit="%" onChange={width => { if (width !== undefined) change(resizeElementBox(box, width, box.heightPx, "width")); }} />
      <OwnerNumberInput {...numberProps} label="Box height" hint="Design pixels. Text can grow to fit without distorting its letter shapes." value={box.heightPx} min={Number.MIN_VALUE} max={Number.MAX_VALUE} unit="px" onChange={height => { if (height !== undefined) change(resizeElementBox(box, box.widthPercent, height, "height")); }} />
      <OwnerNumberInput {...numberProps} label="Horizontal box position" hint={placement ? "Position inside its containing box. Negative values and placement outside the box are allowed." : "Signed position relative to the parent. Negative values and outside-section placement are allowed."} value={box.xPercent} min={-Number.MAX_VALUE} max={Number.MAX_VALUE} unit="%" onChange={x => { if (x !== undefined) change(movePosition(x, box.yPx)); }} />
      <OwnerNumberInput {...numberProps} label="Vertical box position" hint={placement ? "Position inside its containing box. Content may overlap or move outside it." : "Signed position; content may overlap or move beyond its original section."} value={box.yPx} min={-Number.MAX_VALUE} max={Number.MAX_VALUE} unit="px" onChange={y => { if (y !== undefined) change(movePosition(box.xPercent, y)); }} />
    </details>
    <details className={styles.boxAdvanced}><summary>Margins · flow spacing</summary>{(["Top","Right","Bottom","Left"] as const).map(side=>{const key=`margin${side}Px` as "marginTopPx"|"marginRightPx"|"marginBottomPx"|"marginLeftPx";return <OwnerNumberInput key={key} {...numberProps} label={`${side} margin`} value={value?.[key]} min={-Number.MAX_VALUE} max={Number.MAX_VALUE} unit="px" hint="Signed flow spacing, separate from visual X/Y position. Negative margins are allowed." onChange={number=>{const next={...value};if(number===undefined)delete next[key];else next[key]=number;onChange(next);}}/>;})}</details>
  </details>;
}
