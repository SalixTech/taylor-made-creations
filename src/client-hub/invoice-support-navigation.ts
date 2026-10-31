import type {InvoiceSupportTarget} from './InvoiceInbox';
export type InvoiceSupportIntent={target:InvoiceSupportTarget;accepted:()=>void;rejected:(message:string)=>void};
export type InvoiceArchiveRequest={projectId:string;sequence:number;tab?:"overview"|"chat"|"photos"|"support";requestId?:string;invoiceSupport?:InvoiceSupportIntent};
