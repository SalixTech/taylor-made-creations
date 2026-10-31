export type InvoicePayment = {amountCents:number;paidOn:string};
export function canonicalInvoicePaymentDate(value:unknown):string|null {
 if(typeof value!=='string')return null;
 if(/^\d{4}-\d{2}-\d{2}$/.test(value))return Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:null;
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
 if(Number(value.slice(11,13))>23||Number(value.slice(14,16))>59||Number(value.slice(17,19))>59)return null;
 const day=value.slice(0,10);if(!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day||!Number.isFinite(Date.parse(value)))return null;
 return new Date(value).toISOString();
}
export function decodeInvoicePaymentHistory(value:unknown,paidCents:number|null):InvoicePayment[]|null {
 if(value===undefined||value===null||paidCents===null)return null;
 if(!Array.isArray(value)||value.length>=100)throw Error('The payment dates could not be verified.');
 let sum=0;const rows=value.map(raw=>{if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['amountCents','paidOn'].includes(k)))throw Error('The payment dates could not be verified.');const paidOn=canonicalInvoicePaymentDate(raw.paidOn);if(!paidOn||!Number.isSafeInteger(raw.amountCents)||raw.amountCents<1||raw.amountCents>100_000_000)throw Error('The payment dates could not be verified.');sum+=raw.amountCents;return{amountCents:raw.amountCents as number,paidOn};});
 if(sum!==paidCents||rows.some((row,i)=>i>0&&Date.parse(row.paidOn)<Date.parse(rows[i-1].paidOn)))throw Error('The payment dates do not match the verified paid amount.');
 return rows;
}
export function withInstallmentPaymentDates<T extends {paidCents:number|null}>(progress:T[],history:InvoicePayment[]|null):Array<T&{payments:InvoicePayment[]|null}>{
 let index=0,used=0;
 return progress.map(row=>{if(history===null||row.paidCents===null)return{...row,payments:null};let remaining=row.paidCents;const payments:InvoicePayment[]=[];while(remaining>0){const payment=history[index];if(!payment)return {...row,payments:null};const amount=Math.min(remaining,payment.amountCents-used);payments.push({amountCents:amount,paidOn:payment.paidOn});remaining-=amount;used+=amount;if(used===payment.amountCents){index++;used=0;}}return{...row,payments};});
}
/** Date-only provider facts deliberately do not acquire a guessed timezone/time. */
export function invoicePaymentDateLabel(value:string):string {
 const date=canonicalInvoicePaymentDate(value);if(!date)return 'Payment date unavailable';
 return date.length===10?new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`)):new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(date));
}
