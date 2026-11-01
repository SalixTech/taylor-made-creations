"use client";
import {useId,useLayoutEffect,useRef,useState} from 'react';
import SiteSelect from '@/components/SiteSelect';
import type {InlineTextStyle} from './rich-text';
import type {ComputedTextAppearance} from './editable-text-dom';
import styles from './OwnerTextFormattingBar.module.css';
type Font={id:string;name:string};
export function OwnerTextFormattingBar({active,selected,disabled,fonts,onStyle,onLink,marks={},selectionKey="",selectionStyles=[],computed}:{active:boolean;selected:boolean;disabled:boolean;fonts?:Font[];onStyle:(style:InlineTextStyle)=>void;onReset?:()=>void;onLink:()=>void;onEdit?:()=>void;marks?:Partial<Record<"bold"|"italic"|"underline",boolean>>;selectionKey?:string;selectionStyles?:InlineTextStyle[];computed?:ComputedTextAppearance|null}){
 const id=useId(),common=<T,>(read:(style:InlineTextStyle)=>T):T|null|undefined=>{if(!selectionStyles.length)return undefined;const first=read(selectionStyles[0]);return selectionStyles.every(style=>Object.is(read(style),first))?first:null;};
 const explicitFont=common(style=>style.fontId?`custom:${style.fontId}`:style.font),explicitSize=common(style=>style.fontSize),explicitColor=common(style=>style.color);
 const family=computed?.fontFamily,rawFamily=family?.split(',')[0]?.trim().replace(/^['"]|['"]$/g,'');
 const displayFamily=(fonts??[]).find(font=>rawFamily===`TMCFont_${font.id}`)?.name??rawFamily;
 const fontValue=explicitFont??'__computed',size=computed?computed.fontSize:explicitSize,color=computed?computed.color:explicitColor;
 const fontOptions=[{value:'__computed',label:computed?(displayFamily||'Mixed fonts'):explicitFont===null?'Mixed fonts':'Font'},...['original','sans','serif','rounded','mono'].map(value=>({value,label:({original:'Original',sans:'Arial / sans serif',serif:'Georgia / serif',rounded:'Rounded',mono:'Monospace'}as Record<string,string>)[value]})),...(fonts??[]).map(font=>({value:`custom:${font.id}`,label:font.name}))];
 const[draft,setDraft]=useState<{key:string;value:string}|null>(null),dirty=useRef<string|null>(null),currentKey=useRef(selectionKey);
 // A newer selection invalidates only uncommitted control input, never content.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useLayoutEffect(()=>{currentKey.current=selectionKey;dirty.current=null;setDraft(null);},[selectionKey]);
 const available=active&&selected&&!disabled;
 const commitSize=()=>{const scope=dirty.current;dirty.current=null;const n=Number(draft?.value);if(available&&scope===selectionKey&&currentKey.current===selectionKey&&draft?.key===selectionKey&&scope!==null&&Number.isFinite(n)&&n>0){setDraft(null);onStyle({fontSize:n});}};
 return <div data-owner-text-tools role="toolbar" aria-label="Text formatting" className={styles.bar}>
  <fieldset className={styles.fontControl} disabled={!available}><label className={styles.srOnly} htmlFor={id}>Font</label><SiteSelect id={id} value={computed?'__computed':fontValue} options={fontOptions} listLabel="Text fonts" onChange={value=>{if(!available||value==='__computed')return;if(value.startsWith('custom:'))onStyle({fontId:value.slice(7)});else onStyle({font:value as InlineTextStyle['font']});}}/></fieldset>
  <input aria-label="Selected text size" title="Font size in pixels" type="number" min="1" step="1" value={draft?.key===selectionKey?draft.value:size??""} placeholder={size===null?"Mixed":"Size"} disabled={!available} onChange={e=>{dirty.current=selectionKey;setDraft({key:selectionKey,value:e.target.value});}} onBlur={commitSize} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commitSize();}}}/>
  <input className={styles.colorControl} type="color" aria-label="Choose selected text color" title={color||'Mixed colors — choose a color'} value={color??'#000000'} disabled={!available} onChange={e=>{if(available)onStyle({color:e.target.value});}}/>
  {(['bold','italic','underline']as const).map(mark=><button key={mark} type="button" title={mark[0].toUpperCase()+mark.slice(1)} disabled={!available} onMouseDown={e=>e.preventDefault()} aria-pressed={computed?.[mark]??!!marks[mark]} onClick={()=>{if(available)onStyle({[mark]:!(computed?.[mark]??marks[mark])});}}>{mark==='bold'?<b>B</b>:mark==='italic'?<i>I</i>:<u>U</u>}</button>)}
  <button type="button" disabled={!available} onMouseDown={e=>e.preventDefault()} onClick={()=>{if(available)onLink();}}>Hyperlink</button>
 </div>;
}
