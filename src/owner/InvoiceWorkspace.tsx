"use client";
import {useState,useRef,useCallback,useEffect} from "react";
import {Dialog} from "./OwnerDialog";
import {PayPalStudio} from "./PayPalStudio";
import buttons from "./OwnerButton.module.css";
export function InvoiceWorkspace({onClose,onBusyChange,onDirtyChange}:{onClose:()=>void;onBusyChange?:(value:boolean)=>void;onDirtyChange?:(value:boolean)=>void}){
 const[busy,setBusy]=useState(false),[discard,setDiscard]=useState(false);
 const busyNow=useRef(false),dirtyNow=useRef(false);
 const callbacks=useRef({onBusyChange,onDirtyChange});useEffect(()=>{callbacks.current={onBusyChange,onDirtyChange};},[onBusyChange,onDirtyChange]);
 const changedBusy=useCallback((value:boolean)=>{busyNow.current=value;setBusy(value);callbacks.current.onBusyChange?.(value);},[]);
 const changedDirty=useCallback((value:boolean)=>{dirtyNow.current=value;callbacks.current.onDirtyChange?.(value);},[]);
 function close(){if(busyNow.current)return;if(dirtyNow.current)setDiscard(true);else onClose();}
 return <Dialog title="Invoices" wide onClose={close} dismissDisabled={busy} actions={<button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} disabled={busy} onClick={close}>Close invoices</button>}>
 {discard&&<section role="alert"><p>Discard unsaved invoice edits and close? Saved invoices and catalog items stay unchanged.</p><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} onClick={()=>setDiscard(false)}>Keep editing</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.danger}`} disabled={busy} onClick={()=>{if(busyNow.current)return;onDirtyChange?.(false);onClose();}}>Discard edits and close</button></section>}
 <fieldset disabled={discard} inert={discard} style={{border:0,padding:0,margin:0,minWidth:0}} aria-hidden={discard||undefined}><PayPalStudio onBusyChange={changedBusy} onDirtyChange={changedDirty}/></fieldset>
 </Dialog>;
}
