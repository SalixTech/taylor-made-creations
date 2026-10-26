import {countryName} from './countries.js';
export type CartItem = {id:string;name:string;price:number;image:string};
export type CartState = {item:CartItem|null;stage:'cart'|'shipping'|'payment';destination:string};
export type CartAction = {type:'add';item:CartItem}|{type:'remove'}|{type:'destination';value:string}|{type:'stage';value:CartState['stage']};
export type CartPolicy = {allowSample?:boolean;catalogMode?:boolean;publishedItems?:readonly CartItem[]};
export const emptyCart:CartState={item:null,stage:'cart',destination:''};
/** Reconcile against the latest publication: caller-supplied names/prices never override a live offer. */
export function admittedCartItem(item:CartItem|null,policy:CartPolicy|boolean):CartItem|null {
  if(!item)return null;
  const options=typeof policy==='boolean'?{allowSample:policy}:policy;
  if(options.catalogMode)return null;
  const published=options.publishedItems?.find(candidate=>candidate.id===item.id);
  const admitted=published??(options.allowSample?item:null);
  return admitted&&Number.isFinite(admitted.price)&&admitted.price>=0?admitted:null;
}
/** One-of-a-kind products remain quantity one; no transition takes payment or creates an order. */
export function cartTransition(state:CartState,action:CartAction,policy:CartPolicy|boolean):CartState {
  if(action.type==='remove') return {...emptyCart};
  if(action.type==='add') { const item=admittedCartItem(action.item,policy); return item?{...emptyCart,item}:admittedCartItem(state.item,policy)?state:{...emptyCart}; }
  const item=admittedCartItem(state.item,policy);
  if(!item)return {...emptyCart};
  if(action.type==='destination') return {...state,item,destination:action.value,stage:'shipping'};
  if(action.value==='payment'&&(state.destination!=='US'&&!countryName(state.destination))) return {...state,item};
  return {...state,item,stage:action.value};
}
