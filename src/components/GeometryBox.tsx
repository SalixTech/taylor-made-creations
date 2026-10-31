"use client";
import { Children, cloneElement, isValidElement, type ReactElement, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { validElementBox, type ElementBox } from "@/owner/box-geometry";
import type { AppearanceValues } from "@/owner/appearance";
import {useCanvasSceneNode,canvasNodeAttributes} from "./CanvasSceneContext";
import styles from "./GeometryBox.module.css";
import { layoutSize } from "@/owner/box-affine";
/** Saved legacy dimensions remain readable. Text/cards now reflow at their
 * chosen width instead of anisotropically stretching glyphs. A stable original
 * flow slot and visible overflow deliberately permit overlap outside sections. */
export function GeometryBox({ box: rawBox, children: rawChildren, target, editable, inline = false, contentMode = "reflow", appearance }: { box?: ElementBox; children: ReactNode; target?: string; editable?: boolean; inline?: boolean; contentMode?: "reflow" | "image"; appearance?: AppearanceValues }) {
  const scene=useCanvasSceneNode(target),placement=scene?.placement;
  const box:ElementBox|undefined=placement?{widthPercent:100,referenceParentPx:placement.widthPx,heightPx:placement.heightPx,baseWidthPx:placement.widthPx,baseHeightPx:placement.heightPx,xPercent:0,yPx:0,rotationDeg:0,aspectLocked:placement.aspectLocked??false,layout:"reflow",...(placement.contentOffset?{contentOffset:placement.contentOffset}:{})}:rawBox;
  const normalize=(child:ReactNode)=>isValidElement(child)?cloneElement(child as ReactElement<{style?:CSSProperties}>,{style:{...(child.props as {style?:CSSProperties}).style,width:"100%",minHeight:undefined,marginTop:0,marginRight:0,marginBottom:0,marginLeft:0}}):child;
  const children=placement?(isValidElement(rawChildren)?normalize(rawChildren):Children.map(rawChildren,normalize)):rawChildren;
  const sceneAttrs=editable?canvasNodeAttributes(scene):{};
  const ref = useRef<HTMLElement | null>(null);
  const contentsRef=useRef<HTMLElement|null>(null);
  const [actualWidth, setActualWidth] = useState<number | null>(null);
  const valid = validElementBox(box);
  const designWidth = valid ? box.referenceParentPx * (box.widthPercent / 100) : 0;
  useLayoutEffect(() => {
    const frame = ref.current;
    if (!valid || !frame) { setActualWidth(null); return; }
    let active = true;
    const measure = () => {
      if (!active) return;
      const width = layoutSize(frame, "width");
      if (Number.isFinite(width) && width > 0) setActualWidth(current => current === width ? current : width);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(frame);
    window.addEventListener("resize", measure);
    return () => { active = false; observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [valid, designWidth]);
  useLayoutEffect(()=>{
    const root=contentsRef.current?.firstElementChild;
    if(!valid||!box.contentOffset||!root)return;
    const cleanups:Array<()=>void>=[];
    const restore=()=>{cleanups.splice(0).forEach(cleanup=>cleanup());};
    const measure=()=>{restore();
    for(const child of Array.from(root.children)){
      if(!(child instanceof HTMLElement)||child.hasAttribute("data-owner-compensated-text"))continue;
      const css=window.getComputedStyle(child);
      if(css.display!=="inline")continue;
      // Inline non-replaced elements do not support CSS translate. Keep their
      // actual node/direct-child identity and compensate with relative offsets.
      const pixel=(value:string)=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)px$/.test(value)&&Number.isFinite(Number.parseFloat(value))?Number.parseFloat(value):0;
      const left=css.position==="relative"?(css.left!=="auto"?pixel(css.left):-pixel(css.right)):0;
      const top=css.position==="relative"?(css.top!=="auto"?pixel(css.top):-pixel(css.bottom)):0;
      const old=child.getAttribute("data-owner-compensated-inline"),oldLeft=child.style.getPropertyValue("--box-inline-left"),oldTop=child.style.getPropertyValue("--box-inline-top");
      child.setAttribute("data-owner-compensated-inline","true");child.style.setProperty("--box-inline-left",`${left}px`);child.style.setProperty("--box-inline-top",`${top}px`);
      cleanups.push(()=>{if(old===null)child.removeAttribute("data-owner-compensated-inline");else child.setAttribute("data-owner-compensated-inline",old);if(oldLeft)child.style.setProperty("--box-inline-left",oldLeft);else child.style.removeProperty("--box-inline-left");if(oldTop)child.style.setProperty("--box-inline-top",oldTop);else child.style.removeProperty("--box-inline-top");});
    }
    };
    measure();window.addEventListener("resize",measure);
    return()=>{window.removeEventListener("resize",measure);restore();};
  },[valid,box?.contentOffset,children,actualWidth]);
  if (!valid) {
    if(scene?.childSlot)return <div {...sceneAttrs} data-owner-edit={editable?target:undefined} style={{position:"relative",minWidth:0}}>{children}{scene.childSlot}</div>;
    if(!scene)return <>{children}</>;
    return <>{Children.map(children,child=>isValidElement(child)?cloneElement(child as ReactElement<Record<string,unknown>>,sceneAttrs):child)}</>;
  }
  const ratio = (actualWidth ?? designWidth) / designWidth;
  const responsiveScale = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const minHeight = box.heightPx * responsiveScale;
  const y = box.yPx * responsiveScale;
  const Tag = inline&&!scene?.childSlot ? "span" : "div";
  const margins: CSSProperties = {};
  for (const [key, css] of [["marginTopPx","marginTop"],["marginRightPx","marginRight"],["marginBottomPx","marginBottom"],["marginLeftPx","marginLeft"]] as const) {
    const value = placement?undefined:appearance?.[key];
    if (typeof value === "number" && Number.isFinite(value)) margins[css] = value;
  }
  const frameStyle: CSSProperties = {
    minHeight: Number.isFinite(minHeight) ? minHeight : undefined,
    ...(contentMode === "image" && Number.isFinite(minHeight) ? {height:minHeight} : {}),
    top: Number.isFinite(y) ? y : undefined,
    transform: box.rotationDeg ? `rotate(${box.rotationDeg % 360}deg)` : undefined,
    transformOrigin: "center center",
  };
  const contentX=(box.contentOffset?.xPx??0)*responsiveScale,contentY=(box.contentOffset?.yPx??0)*responsiveScale;
  const contentStyle:CSSProperties|undefined=box.contentOffset&&[contentX,contentY].every(Number.isFinite)?{"--box-content-offset-x":`${contentX}px`,"--box-content-offset-y":`${contentY}px`} as CSSProperties:undefined;
  // A parent may mix direct text with nested editable elements. Neutral inline
  // spans preserve text wrapping while making those text nodes compensatable.
  const renderedChildren=contentStyle&&typeof children==="object"&&children!==null&&isValidElement(children)&&typeof children.type==="string"?cloneElement(children as ReactElement<{children?:ReactNode}>,{},Children.map((children as ReactElement<{children?:ReactNode}>).props.children,child=>(typeof child==="string"||typeof child==="number")?<span data-owner-compensated-text="true" style={{position:"relative",left:"var(--box-content-offset-x,0px)",top:"var(--box-content-offset-y,0px)"}}>{child}</span>:child)):children;
  const childSlot=scene?.childSlot&&isValidElement(scene.childSlot)?cloneElement(scene.childSlot as ReactElement<{style?:CSSProperties}>,{style:{...(scene.childSlot.props as {style?:CSSProperties}).style,...(box.contentOffset?{translate:`${contentX}px ${contentY}px`}:{})}}):scene?.childSlot;
  const frameContents = <Tag ref={node=>{contentsRef.current=node;}} style={contentStyle} className={`${styles.contents} ${contentStyle?styles.compensatedContents:""} ${contentMode === "image" ? styles.imageContents : ""}`}>{renderedChildren}</Tag>;
  if (box.flow) {
    const slotWidthPercent = box.baseWidthPx / box.referenceParentPx * 100;
    const slotHeight = box.baseHeightPx * responsiveScale;
    const frameWidth = designWidth / box.baseWidthPx * 100, frameLeft = (box.xPercent-box.flow.xPercent)/slotWidthPercent*100;
    return <Tag className={`${styles.flowSlot} ${inline ? styles.inline : ""}`} data-owner-flow-slot="true" style={{ width: `${slotWidthPercent}%`, height: Number.isFinite(slotHeight) ? slotHeight : undefined, marginTop:box.flow.marginTopPx, marginRight:box.flow.marginRightPx, marginBottom:box.flow.marginBottomPx, marginLeft:box.flow.marginLeftPx, ...margins }}>
      <Tag ref={node => { ref.current = node; }} className={`${styles.frame} ${styles.flowFrame}`} {...sceneAttrs} data-owner-geometry="true" data-owner-layout="reflow" data-owner-edit={editable ? target : undefined} tabIndex={editable ? 0 : undefined} aria-label={editable ? "Edit content box" : undefined} style={{ ...frameStyle, width: Number.isFinite(frameWidth) ? `${frameWidth}%` : undefined, left: Number.isFinite(frameLeft) ? `${frameLeft}%` : undefined }}>{childSlot?<>{frameContents}{childSlot}</>:frameContents}</Tag>
    </Tag>;
  }
  return <Tag ref={node => { ref.current = node; }} className={`${styles.frame} ${inline ? styles.inline : ""}`} {...sceneAttrs} data-owner-geometry="true" data-owner-layout="reflow" data-owner-edit={editable ? target : undefined} tabIndex={editable ? 0 : undefined} aria-label={editable ? "Edit content box" : undefined} style={{ ...frameStyle, width: `${box.widthPercent}%`, left: `${box.xPercent}%`, ...margins }}>{childSlot?<>{frameContents}{childSlot}</>:frameContents}</Tag>;
}
