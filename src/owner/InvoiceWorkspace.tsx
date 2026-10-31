"use client";
import {useState,useRef,useCallback,useEffect} from "react";
import {Dialog} from "./OwnerDialog";
import {PayPalStudio,type InvoiceStudioTab} from "./PayPalStudio";
import styles from "./InvoiceWorkspace.module.css";
import buttons from "./OwnerButton.module.css";
export function InvoiceWorkspace({onClose,onBusyChange,onDirtyChange}:{onClose:()=>void;onBusyChange?:(value:boolean)=>void;onDirtyChange?:(value:boolean)=>void}){
 const[entry,setEntry]=useState<InvoiceStudioTab|null>(null);
 const[busy,setBusy]=useState(false),[discard,setDiscard]=useState(false);
 const busyNow=useRef(false),dirtyNow=useRef(false),discardNow=useRef(false);
 const keepEditingRef=useRef<HTMLButtonElement|null>(null);
 const callbacks=useRef({onBusyChange,onDirtyChange});useEffect(()=>{callbacks.current={onBusyChange,onDirtyChange};},[onBusyChange,onDirtyChange]);
 const changedBusy=useCallback((value:boolean)=>{busyNow.current=value;setBusy(value);callbacks.current.onBusyChange?.(value);},[]);
 const changedDirty=useCallback((value:boolean)=>{dirtyNow.current=value;callbacks.current.onDirtyChange?.(value);},[]);
 function close(){if(busyNow.current||discardNow.current)return;if(dirtyNow.current){discardNow.current=true;setDiscard(true);}else onClose();}
 function keepEditing(){if(busyNow.current)return;discardNow.current=false;setDiscard(false);}
 function discardEdits(){if(busyNow.current||!discardNow.current)return;discardNow.current=false;changedDirty(false);onClose();}
 return <div data-invoice-workspace><Dialog title="Invoices" wide onClose={close} dismissOnBackdrop={false} dismissDisabled={busy||discard} actions={<button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} disabled={busy||discard} onClick={close}>Close</button>}>
 <fieldset disabled={discard} inert={discard} style={{border:0,padding:0,margin:0,minWidth:0}} aria-hidden={discard||undefined}>{entry?<PayPalStudio initialTab={entry} onBusyChange={changedBusy} onDirtyChange={changedDirty}/>:<section className={styles.entry} aria-label="Choose an invoice action"><p>What would you like to do?</p><div className={styles.choices}>{([['create','Create Invoice','Choose a commission and prepare a draft.'],['send','Send Invoice','Review and send a saved draft.'],['status','View All Invoices','Check commission invoices and payment information.']] as const).map(([tab,title,description])=><button data-owner-button type="button" key={tab} className={styles.choice} onClick={()=>{if(!busyNow.current&&!discardNow.current)setEntry(tab);}}><strong>{title}</strong><span>{description}</span></button>)}</div></section>}</fieldset>
 </Dialog>
 {discard&&<Dialog title="Discard unsaved invoice edits?" onClose={keepEditing} dismissOnBackdrop={false} dismissDisabled={busy} initialFocusRef={keepEditingRef} actions={<><button ref={keepEditingRef} type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} disabled={busy} onClick={keepEditing}>Keep editing</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.primary}`} disabled={busy} onClick={discardEdits}>Discard edits and close</button></>}><p>Your unsaved invoice edits will be discarded. Saved invoices and catalog items stay unchanged.</p></Dialog>}
 </div>;
}
