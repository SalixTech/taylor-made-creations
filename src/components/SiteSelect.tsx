'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import styles from './SiteSelect.module.css';

export type SelectOption = {value:string;label:string};
export type SiteSelectProps = {id:string;value:string;onChange:(value:string)=>void;options:readonly SelectOption[];placeholder?:string;required?:boolean;invalid?:boolean;describedBy?:string;searchable?:boolean};

/** Focus stays on the combobox while aria-activedescendant tracks its listbox. */
export default function SiteSelect({id,value,onChange,options,placeholder='Choose an option',required,invalid,describedBy,searchable=false}:SiteSelectProps) {
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [active,setActive]=useState(0);
  const [placement,setPlacement]=useState({above:false,maxHeight:280});
  const root=useRef<HTMLDivElement>(null);
  const control=useRef<HTMLInputElement & HTMLButtonElement>(null);
  const typeahead=useRef({text:'',time:0});
  const selected=options.find(option=>option.value===value);
  const visible=searchable&&query?options.filter(option=>`${option.label} ${option.value}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())):options;
  const index=Math.min(active,Math.max(0,visible.length-1));
  const listId=`${id}-options`;
  function close(){setOpen(false);setQuery('');}
  function place(){
    const node=control.current;
    if(!node||typeof node.getBoundingClientRect!=='function')return;
    const box=node.getBoundingClientRect();let top=8,bottom=window.innerHeight-8;
    // Intersect scrolling editor panels as well as the viewport, so options aren't clipped.
    for(let parent=root.current?.parentElement;parent;parent=parent.parentElement){
      const overflow=window.getComputedStyle(parent).overflowY;
      if(/auto|scroll|hidden|clip/.test(overflow)){const bounds=parent.getBoundingClientRect();top=Math.max(top,bounds.top+6);bottom=Math.min(bottom,bounds.bottom-6);}
    }
    const below=bottom-box.bottom-6,above=box.top-top-6;const openAbove=below<180&&above>below;
    setPlacement({above:openAbove,maxHeight:Math.max(64,Math.min(280,openAbove?above:below))});
  }
  function show(){place();setQuery('');setActive(Math.max(0,options.findIndex(option=>option.value===value)));setOpen(true);}
  function choose(option:SelectOption){onChange(option.value);close();control.current?.focus();}
  useEffect(()=>{function outside(event:PointerEvent){if(!root.current?.contains(event.target as Node)){setOpen(false);setQuery('');}}document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[]);
  useEffect(()=>{if(!open)return;function reposition(){place();}window.addEventListener('resize',reposition);window.addEventListener('scroll',reposition,true);return()=>{window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition,true);};},[open]);
  useEffect(()=>{if(open)document.getElementById(`${listId}-${index}`)?.scrollIntoView({block:'nearest'});},[open,index,listId,query]);
  function keyDown(event:KeyboardEvent){
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
    <div className={styles.controlWrap}>{searchable?<input {...aria} ref={control} id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off" className={styles.control} placeholder={placeholder} value={open?query:selected?.label||''} onClick={()=>{if(!open)show();}} onChange={event=>{if(!open)place();setQuery(event.target.value);setActive(0);setOpen(true);}} onKeyDown={keyDown}/>:<button {...aria} ref={control} id={id} role="combobox" aria-expanded={open} aria-controls={listId} type="button" className={styles.control} onClick={()=>open?close():show()} onKeyDown={keyDown}>{selected?.label||placeholder}</button>}<span className={styles.arrow} aria-hidden="true"><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m5 7.5 5 5 5-5" /></svg></span></div>
    {open&&<div id={listId} role="listbox" aria-label={searchable?'Countries':'Available options'} className={styles.list} style={{maxHeight:placement.maxHeight,top:placement.above?"auto":"calc(100% + 6px)",bottom:placement.above?"calc(100% + 6px)":"auto"}}>{visible.map((option,i)=><div id={`${listId}-${i}`} key={option.value} role="option" data-active={i===index||undefined} aria-selected={value===option.value} className={`${styles.option} ${i===index?styles.active:''}`} onPointerMove={()=>setActive(i)} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(option)}>{option.label}{value===option.value&&<span aria-hidden="true">✓</span>}</div>)}{!visible.length&&<p role="status" className={styles.empty}>No countries found. Try another name or country code.</p>}</div>}
  </div>;
}
