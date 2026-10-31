"use client";
import {cloneElement,type ReactElement,type CSSProperties} from "react";
import {useCanvasSceneNode} from "./CanvasSceneContext";
import {GeometryBox} from "./GeometryBox";
import {getElementAppearanceAttributes,getElementAppearanceStyle,type AppearanceValues} from "@/owner/appearance";
import {validElementBox} from "@/owner/box-geometry";
/** Same physical wrapper for published chrome and editable semantic targets. */
export function LayoutAppearance({appearance,children,inline=false,image=false,target,editable=false}:{appearance?:AppearanceValues;children:ReactElement;inline?:boolean;image?:boolean;target?:string;editable?:boolean}){
 const scene=useCanvasSceneNode(target);
 const child=children as ReactElement<Record<string,unknown>>,boxed=!!scene?.placement||validElementBox(appearance?.box);
 const visual=boxed?{...appearance,widthPercent:undefined,heightPercent:undefined}:appearance;
 const element=cloneElement(child,{...getElementAppearanceAttributes(visual),"data-owner-content-editor":child.props["data-owner-content-editor"]??child.props["data-owner-edit"],...(editable?{"data-owner-edit":boxed?undefined:target,tabIndex:boxed?undefined:0}:{}),style:{...(child.props.style as CSSProperties|undefined),...(boxed?{width:undefined,minHeight:undefined}:{}),...getElementAppearanceStyle(visual)}});
 return <GeometryBox appearance={appearance} inline={inline} contentMode={image?"image":"reflow"} box={appearance?.box} target={target} editable={editable}>{element}</GeometryBox>;
}
