"use client";
import {useId,useLayoutEffect,useRef,useState} from 'react';
import SiteSelect from '@/components/SiteSelect';
import type {InlineTextStyle} from './rich-text';
import type {ComputedTextAppearance} from './editable-text-dom';
import styles from './OwnerTextFormattingBar.module.css';
type Font={id:string;name:string};
export function OwnerTextFormattingBar({resizeHandles=true,onResizeHandlesChange,active,selected,caretActive=false,disabled,fonts,onStyle,onLink,marks={},selectionKey="",selectionStyles=[],computed,shove=false,onShoveChange,canHyperlink}:{resizeHandles?:boolean;onResizeHandlesChange?:(enabled:boolean)=>void;canHyperlink?:boolean;shove?:boolean;onShoveChange?:(enabled:boolean)=>void;active:boolean;selected:boolean;caretActive?:boolean;disabled:boolean;fonts?:Font[];onStyle:(style:InlineTextStyle)=>void;onReset?:()=>void;onLink:()=>void;onEdit?:()=>void;marks?:Partial<Record<"bold"|"italic"|"underline",boolean>>;selectionKey?:string;selectionStyles?:InlineTextStyle[];computed?:ComputedTextAppearance|null}){
 const id=useId(),common=<T,>(read:(style:InlineTextStyle)=>T):T|null|undefined=>{if(!selectionStyles.length)return undefined;const first=read(selectionStyles[0]);return selectionStyles.every(style=>Object.is(read(style),first))?first:null;};
 const explicitFont=common(style=>style.fontId?`custom:${style.fontId}`:style.font),explicitSize=common(style=>style.fontSize),explicitColor=common(style=>style.color);
 const family=computed?.fontFamily,rawFamily=family?.split(',')[0]?.trim().replace(/^['"]|['"]$/g,'');
 const displayFamily=(fonts??[]).find(font=>rawFamily===`TMCFont_${font.id}`)?.name??rawFamily;
 const fontValue=explicitFont==='original'?'__computed':explicitFont??'__computed',size=computed?computed.fontSize:explicitSize,color=computed?computed.color:explicitColor;
 const fontOptions=[{value:'__computed',label:computed?(displayFamily||'Mixed fonts'):explicitFont===null?'Mixed fonts':'Font'},...['sans','serif','rounded','mono'].map(value=>({value,label:({original:'Original',sans:'Arial / sans serif',serif:'Georgia / serif',rounded:'Rounded',mono:'Monospace'}as Record<string,string>)[value]})),...(fonts??[]).map(font=>({value:`custom:${font.id}`,label:font.name}))];
 const[draft,setDraft]=useState<{key:string;value:string}|null>(null),dirty=useRef<string|null>(null),currentKey=useRef(selectionKey);
 // A newer selection invalidates only uncommitted control input, never content.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useLayoutEffect(()=>{currentKey.current=selectionKey;dirty.current=null;setDraft(null);},[selectionKey]);
 // The parent validates a text caret; range formatting and caret typing share
 // controls, but a caret never grants empty-link insertion.
 const available=active&&(selected||caretActive)&&!disabled,linkAvailable=(canHyperlink??(active&&selected))&&!disabled;
 const [hexDraft,setHexDraft]=useState<{key:string;value:string}|null>(null),hexDirty=useRef<string|null>(null),live=useRef({key:selectionKey,available,linkAvailable});
 useLayoutEffect(()=>{live.current={key:selectionKey,available,linkAvailable};if(!available){hexDirty.current=null;dirty.current=null;}return()=>{live.current={key:selectionKey,available:false,linkAvailable:false};};},[selectionKey,available,linkAvailable]);
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useLayoutEffect(()=>{hexDirty.current=null;setHexDraft(null);},[selectionKey]);
 const hexValue=hexDraft?.key===selectionKey?hexDraft.value:color??'';
 const validHex=/^#[0-9a-f]{6}$/i.test(hexValue);
 const commitHex=()=>{const scope=hexDirty.current;hexDirty.current=null;if(scope!==selectionKey||live.current.key!==selectionKey||!live.current.available||!available||hexDraft?.key!==selectionKey||!/^#[0-9a-f]{6}$/i.test(hexDraft.value))return;onStyle({color:hexDraft.value.toLowerCase()});setHexDraft(null);};
 const commitSize=()=>{const scope=dirty.current;dirty.current=null;const n=Number(draft?.value);if(available&&live.current.available&&live.current.key===selectionKey&&scope===selectionKey&&currentKey.current===selectionKey&&draft?.key===selectionKey&&scope!==null&&Number.isFinite(n)&&n>0){setDraft(null);onStyle({fontSize:n});}};
 return <div data-owner-text-tools role="toolbar" aria-label="Text formatting" className={styles.bar}>
  <fieldset className={styles.fontControl} disabled={!available}><label className={styles.srOnly} htmlFor={id}>Font</label><SiteSelect id={id} value={computed?'__computed':fontValue} options={fontOptions} listLabel="Text fonts" onChange={value=>{if(!available||!live.current.available||live.current.key!==selectionKey||value==='__computed')return;if(value.startsWith('custom:'))onStyle({fontId:value.slice(7)});else onStyle({font:value as InlineTextStyle['font']});}}/></fieldset>
  <input aria-label="Selected text size" title="Font size in pixels" type="number" min="1" step="1" value={draft?.key===selectionKey?draft.value:size??""} placeholder={size===null?"Mixed":"Size"} disabled={!available} onChange={e=>{if(!available||!live.current.available||live.current.key!==selectionKey)return;dirty.current=selectionKey;setDraft({key:selectionKey,value:e.target.value});}} onBlur={commitSize} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commitSize();}}}/>
  <input className={styles.colorControl} type="color" aria-label="Choose selected text color" title={color||'Mixed colors — choose a color'} value={color??'#000000'} disabled={!available} onChange={e=>{if(available&&live.current.available&&live.current.key===selectionKey&&/^#[0-9a-f]{6}$/i.test(e.target.value)){hexDirty.current=null;setHexDraft(null);onStyle({color:e.target.value});}}}/>
  <input className={styles.hexControl} type="text" aria-label="Text color HEX" title="Six-digit HEX color, for example #7f0011" placeholder={color===null?'Mixed':'#RRGGBB'} value={hexValue} maxLength={7} spellCheck={false} autoComplete="off" aria-invalid={hexValue!==''&&!validHex} disabled={!available} onChange={e=>{if(!available||!live.current.available||live.current.key!==selectionKey)return;hexDirty.current=selectionKey;setHexDraft({key:selectionKey,value:e.target.value});}} onBlur={commitHex} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commitHex();}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();hexDirty.current=null;setHexDraft(null);}}}/>
  {(['bold','italic','underline']as const).map(mark=><button key={mark} type="button" title={mark[0].toUpperCase()+mark.slice(1)} disabled={!available} onMouseDown={e=>e.preventDefault()} aria-pressed={computed?.[mark]??!!marks[mark]} onClick={()=>{if(available&&live.current.available&&live.current.key===selectionKey)onStyle({[mark]:!(computed?.[mark]??marks[mark])});}}>{mark==='bold'?<b>B</b>:mark==='italic'?<i>I</i>:<u>U</u>}</button>)}
  <button type="button" disabled={!linkAvailable} onMouseDown={e=>e.preventDefault()} onClick={()=>{if(linkAvailable&&live.current.linkAvailable&&live.current.key===selectionKey)onLink();}}>Hyperlink</button>
  {onShoveChange&&<button type="button" disabled={disabled} aria-pressed={shove} title="Shove: moving a box into a gap makes room below. Off keeps free placement." onMouseDown={e=>e.preventDefault()} onClick={()=>{if(!disabled)onShoveChange(!shove);}}>Shove</button>}
  {onResizeHandlesChange&&<button type="button" disabled={disabled} aria-pressed={resizeHandles} title="Show or hide resize handles; selection outlines stay visible." onMouseDown={e=>e.preventDefault()} onClick={()=>{if(!disabled)onResizeHandlesChange(!resizeHandles);}}>Resize handles</button>}
 </div>;
}
