"use client";
import {useEffect,useRef,useState} from "react";
import {getApps,initializeApp} from "firebase/app";
import {getFunctions,httpsCallable} from "firebase/functions";
import {readClientHubFirebaseConfig} from "@/client-hub/client";
type Quote={mode:"sandbox";ready:false;currency:"USD";subtotalCents:number|null;totalCents:null;blockers:string[]};
export async function checkSandboxCheckout(items:{itemId:string;quantity:number}[],destinationCountry:string):Promise<Quote>{
 const config=readClientHubFirebaseConfig();if(config.status!=="ready")throw new Error("Checkout services need setup. No order or payment was created.");
 const app=getApps().find(app=>app.name==="tmc-paypal-public")??initializeApp(config.options,"tmc-paypal-public");
 const response=await httpsCallable<unknown,Quote>(getFunctions(app,"us-central1"),"tmcPayPalCheckoutQuote")({items,destinationCountry});const value=response.data;
 if(value?.mode!=="sandbox"||value.ready!==false||value.currency!=="USD"||value.totalCents!==null||!Array.isArray(value.blockers)||value.blockers.some(item=>typeof item!=="string")||value.subtotalCents!==null&&(!Number.isSafeInteger(value.subtotalCents)||value.subtotalCents<0))throw new Error("The checkout response could not be verified. No payment is available.");return value;
}
/** Real server-side availability check, never a disguised free/zero-total checkout. */
export function PayPalCheckout({itemId,destinationCountry,sample=false}:{itemId:string;destinationCountry:string;sample?:boolean}){
 const[quote,setQuote]=useState<Quote|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");const active=useRef(true),pending=useRef(false),generation=useRef(0);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{generation.current++;void Promise.resolve().then(()=>{if(active.current){setQuote(null);setError("");}});},[itemId,destinationCountry]);
 async function check(){if(pending.current||sample)return;pending.current=true;setBusy(true);setError("");const selected=generation.current;try{const value=await checkSandboxCheckout([{itemId,quantity:1}],destinationCountry);if(active.current&&generation.current===selected)setQuote(value);}catch(cause){if(active.current&&generation.current===selected)setError(cause instanceof Error?cause.message:"Checkout availability could not be checked.");}finally{pending.current=false;if(active.current)setBusy(false);}}
 return <section aria-label="PayPal sandbox checkout"><p>PayPal sandbox preparation only. Shipping, taxes and stock must be confirmed before checkout can open. No real payment is available.</p>{!sample&&<button type="button" className="button" disabled={busy||!destinationCountry||destinationCountry==="international"} onClick={()=>void check()}>{busy?"Checking server totals…":"Check sandbox checkout"}</button>}{sample&&<p>This development sample cannot reach the payment service.</p>}{error&&<p role="alert">{error}</p>}{quote&&<div role="status"><strong>Checkout remains unavailable</strong>{quote.subtotalCents!==null&&<p>Server-checked item subtotal: ${(quote.subtotalCents/100).toFixed(2)} USD. This is not the final total.</p>}<ul>{quote.blockers.map((blocker,index)=><li key={index}>{blocker}</li>)}</ul><p>No order, reservation, label purchase or payment has been created by this check.</p></div>}</section>;
}
