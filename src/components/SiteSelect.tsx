'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {getTemplateText} from '@/owner/site-design';
import type {OwnerContent,PublicOwnerContent} from '@/owner/model';
import styles from './SiteSelect.module.css';
import { DropdownChevron } from './DropdownChevron';

export type SelectOption = {value:string;label:string};
export type InlineSelectCreate = { active: boolean; name: string; label: string; maxLength?: number; busy?: boolean; error?: string; onStart: () => void; onCancel: () => void; onNameChange: (value: string) => void; onSubmit: () => Promise<boolean> };
export type SiteSelectProps = {copyContent?:OwnerContent|PublicOwnerContent|null;id:string;value:string;onChange:(value:string)=>void;options:readonly SelectOption[];placeholder?:string;required?:boolean;invalid?:boolean;describedBy?:string;searchable?:boolean;listLabel?:string;emptyMessage?:string;inlineCreate?:InlineSelectCreate};

/** Focus stays on the combobox while aria-activedescendant tracks its listbox. */
export default function SiteSelect({copyContent,id,value,onChange,options,placeholder=getTemplateText(copyContent,"site.selectPlaceholder"),required,invalid,describedBy,searchable=false,listLabel=getTemplateText(copyContent,"site.selectListLabel"),emptyMessage=getTemplateText(copyContent,"site.selectEmpty"),inlineCreate}:SiteSelectProps) {
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [active,setActive]=useState(0);
  const [placement,setPlacement]=useState({floating:false,maxHeight:280,top:0,left:0,width:0});
  const root=useRef<HTMLDivElement>(null);
  const menu=useRef<HTMLDivElement>(null);
  const control=useRef<HTMLInputElement & HTMLButtonElement>(null);
  const typeahead=useRef({text:'',time:0});
  const selected=options.find(option=>option.value===value);
  const visible=searchable&&query?options.filter(option=>`${option.label} ${option.value}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())):options;
  const index=Math.min(active,Math.max(0,visible.length-1));
  const listId=`${id}-options`;
  function close(){if(inlineCreate?.busy)return;setOpen(false);setQuery('');if(inlineCreate?.active)inlineCreate.onCancel();}
  function place(){
    const node=control.current;
    if(!node||typeof node.getBoundingClientRect!=='function')return;
    const box=node.getBoundingClientRect();
    const below=Math.max(0,window.innerHeight-box.bottom-12);
    const nativePopover=typeof HTMLElement!=="undefined" && "showPopover" in HTMLElement.prototype;
    // Never flip above the field. Native popovers escape clipped cards/dialog
    // scrollports. At the bottom (or older browsers), an in-flow list expands
    // the scrollable form instead of covering its label or leaving the screen.
    const floating=nativePopover && below>=64;
    const width=Math.min(box.width,Math.max(0,window.innerWidth-16));
    setPlacement({floating,maxHeight:floating?Math.min(280,below):280,top:box.bottom+6,left:Math.max(8,Math.min(box.left,window.innerWidth-width-8)),width});
  }
  function show(){if(inlineCreate?.busy)return;place();setQuery('');setActive(Math.max(0,options.findIndex(option=>option.value===value)));setOpen(true);}
  function choose(option:SelectOption){if(inlineCreate?.busy)return;if(option.value==='__create__'&&inlineCreate){inlineCreate.onStart();return;}onChange(option.value);close();control.current?.focus();}
  async function submitCreate(){if(!inlineCreate||inlineCreate.busy||!inlineCreate.name.trim())return;if(await inlineCreate.onSubmit()){setOpen(false);setQuery('');control.current?.focus();}}
  useEffect(()=>{function outside(event:PointerEvent){if(!root.current?.contains(event.target as Node)){if(inlineCreate?.busy)return;setOpen(false);setQuery('');if(inlineCreate?.active)inlineCreate.onCancel();}}document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[inlineCreate]);
  useEffect(()=>{if(!open)return;function reposition(){place();}window.addEventListener('resize',reposition);window.addEventListener('scroll',reposition,true);return()=>{window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition,true);};},[open]);
  useEffect(()=>{
    if(!open)return;
    const node=menu.current; let active=true;
    if(placement.floating && node && typeof node.showPopover==='function') {
      try { node.showPopover(); } catch { void Promise.resolve().then(()=>{if(active)setPlacement(current=>({...current,floating:false}));}); }
    }
    return()=>{ active=false; if(node && typeof node.hidePopover==='function') { try { node.hidePopover(); } catch { /* Already closed. */ } } };
  },[open,placement.floating]);
  useEffect(()=>{
    if(!open)return;
    const list=menu.current,option=document.getElementById(`${listId}-${index}`);
    if(!list||!option)return;
    // Scroll only the options, never the entire page/dialog to its selected row.
    const top=option.offsetTop,bottom=top+option.offsetHeight;
    if(top<list.scrollTop)list.scrollTop=top;
    else if(bottom>list.scrollTop+list.clientHeight)list.scrollTop=bottom-list.clientHeight;
  },[open,index,listId,query]);
  function keyDown(event:KeyboardEvent){
    if(inlineCreate?.busy){if(event.key!=='Tab'){event.preventDefault();event.stopPropagation();}return;}
    if(event.key==='Escape'){if(open){event.preventDefault();event.stopPropagation();close();}return;}
    if(event.key==='Tab'){close();return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();if(!open){show();if(event.key==='End')setActive(options.length-1);return;}
      setActive(event.key==='Home'?0:event.key==='End'?visible.length-1:event.key==='ArrowDown'?Math.min(index+1,visible.length-1):Math.max(index-1,0));return;
    }
    if(event.key==='Enter'||(!searchable&&event.key===' ')){event.preventDefault();if(!open)show();else if(visible[index])choose(visible[index]);return;}
    if(!searchable&&event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      event.preventDefault();const now=Date.now();const text=(now-typeahead.current.time<700?typeahead.current.text:'')+event.key.toLocaleLowerCase();typeahead.current={text,time:now};if(!open)place();const next=options.findIndex(option=>option.label.toLocaleLowerCase().startsWith(text));setOpen(true);if(next>=0)setActive(next);
    }
  }
  const aria={'aria-haspopup':'listbox' as const,'aria-required':required,'aria-invalid':invalid,'aria-describedby':describedBy,'aria-activedescendant':open&&visible[index]?`${listId}-${index}`:undefined};
  return <div ref={root} className={styles.root} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))close();}}>
    <div className={styles.controlWrap}>{searchable?<input {...aria} ref={control} id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off" className={styles.control} placeholder={placeholder} value={open?query:selected?.label||''} onClick={()=>{if(!open)show();}} onChange={event=>{if(!open)place();setQuery(event.target.value);setActive(0);setOpen(true);}} onKeyDown={keyDown}/>:<button {...aria} ref={control} id={id} role="combobox" aria-expanded={open} aria-controls={listId} type="button" className={styles.control} onClick={()=>open?close():show()} onKeyDown={keyDown}>{selected?.label||placeholder}</button>}<span className={styles.arrow} aria-hidden="true"><DropdownChevron /></span></div>
    {open&&<div id={inlineCreate?undefined:listId} role={inlineCreate?undefined:"listbox"} aria-label={inlineCreate?undefined:listLabel} ref={menu} popover={placement.floating?"manual":undefined} data-site-select-menu data-floating={placement.floating} className={styles.list} style={placement.floating?{position:"fixed",maxHeight:placement.maxHeight,top:placement.top,left:placement.left,width:placement.width,bottom:"auto",right:"auto",margin:0}:{position:"relative",maxHeight:280,top:"auto",bottom:"auto"}}><div id={inlineCreate?listId:undefined} role={inlineCreate?"listbox":undefined} aria-label={inlineCreate?listLabel:undefined}>{visible.map((option,i)=><div id={`${listId}-${i}`} key={option.value} role="option" data-active={i===index||undefined} aria-selected={value===option.value} className={`${styles.option} ${i===index?styles.active:''}`} aria-disabled={inlineCreate?.busy||undefined} onPointerMove={()=>{if(!inlineCreate?.busy)setActive(i);}} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(option)}>{option.label}{value===option.value&&<span aria-hidden="true">✓</span>}</div>)}{!visible.length&&<p role="status" className={styles.empty}>{emptyMessage}</p>}</div>{inlineCreate?.active&&<div className={styles.createRow} data-select-create onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();if(!inlineCreate.busy){inlineCreate.onCancel();control.current?.focus();}}else if(event.key==='Enter'){event.preventDefault();void submitCreate();}}}><label className={styles.createLabel} htmlFor={`${id}-create`}>{inlineCreate.label}</label><input id={`${id}-create`} autoFocus maxLength={inlineCreate.maxLength??80} value={inlineCreate.name} disabled={inlineCreate.busy} placeholder="Name" onChange={event=>inlineCreate.onNameChange(event.target.value)} /><button type="button" disabled={inlineCreate.busy||!inlineCreate.name.trim()} onClick={()=>void submitCreate()} aria-label={`Create ${inlineCreate.name.trim()||inlineCreate.label.toLowerCase()}`}>{inlineCreate.busy?"Saving…":"Add"}</button><button type="button" disabled={inlineCreate.busy} onClick={()=>{if(!inlineCreate.busy){inlineCreate.onCancel();control.current?.focus();}}} aria-label="Cancel new option">×</button>{inlineCreate.error&&<small role="alert" className={styles.createError}>{inlineCreate.error}</small>}</div>}</div>}
  </div>;
}
