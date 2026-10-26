'use client';
import {createContext,useContext,useReducer,useRef,useEffect,type ReactNode} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import CountryPicker from './CountryPicker';
import SiteSelect from './SiteSelect';
import {countryName} from './countries.js';
import {admittedCartItem,cartTransition,emptyCart,type CartItem,type CartPolicy} from './cart-model';
import {usePublicOwnerContent,usePublicSiteState} from './PublicSiteContext';
import {canAddPublishedPremade,getStorefrontPage} from './storefront-model';
import {pageHref} from '@/owner/model';
import styles from './Cart.module.css';
import {lockPageScroll} from './modal-scroll-lock';
const CartContext=createContext<{item:CartItem|null;enabled:boolean;add:(item:CartItem)=>void;open:()=>void}|null>(null);
export function useCart(){const cart=useContext(CartContext);if(!cart)throw new Error('CartProvider missing');return cart;}
export function CartProvider({children,allowSample=false}:{children:ReactNode;allowSample?:boolean}){
  const pathname=usePathname();
  const publication=usePublicSiteState();
  const content=usePublicOwnerContent();
  const page=content?getStorefrontPage(content):undefined;
  const shopHref=page?pageHref(page):'/premades';
  const sample=publication.status==='baseline'&&allowSample;
  const shopAvailable=publication.status==='published'?Boolean(page):sample;
  const catalogMode=content?.site.catalogMode===true;
  const isShopRoute=pathname===shopHref||pathname.startsWith(`${shopHref}/`);
  const enabled=shopAvailable&&!catalogMode&&isShopRoute;
  const policy:CartPolicy={allowSample:sample,catalogMode,publishedItems:content?content.premades.filter(item=>canAddPublishedPremade(content,item.id)).map(item=>({id:item.id,name:item.name,price:item.price!,image:item.image})):[]};
  const [state,dispatch]=useReducer((state:typeof emptyCart,action:Parameters<typeof cartTransition>[1])=>cartTransition(state,action,policy),emptyCart);
  const item=admittedCartItem(state.item,policy);
  const dialog=useRef<HTMLDialogElement>(null);
  const releaseScroll=useRef<null|(()=>void)>(null);
  const unlock=()=>{releaseScroll.current?.();releaseScroll.current=null;};
  const open=()=>{const modal=dialog.current;if(enabled&&modal&&!modal.open){releaseScroll.current=lockPageScroll();modal.showModal();}};
  const close=()=>{dialog.current?.close();unlock();};
  useEffect(()=>{
    const modal=dialog.current;
    // Published catalog/offline/hidden changes also remove the modal and its scroll lock.
    return ()=>{modal?.close();releaseScroll.current?.();releaseScroll.current=null;};
  },[enabled,pathname]);
  useEffect(()=>{if(state.item&&!item)dispatch({type:'remove'});},[state.item,item]);
  const {stage,destination}=state;
  const international=destination!==''&&destination!=='US';
  return <CartContext.Provider value={{item,enabled,open,add:requested=>{if(!enabled||!admittedCartItem(requested,policy))return;dispatch({type:'add',item:requested});open();}}}>{children}{enabled&&<dialog ref={dialog} className={styles.drawer} aria-labelledby="cart-title" onClose={unlock} onClick={event=>{if(event.target===event.currentTarget)close();}}><div className={styles.inner}><div className={styles.heading}><h2 id="cart-title">{stage==='cart'?'Your cart':stage==='shipping'?'Shipping':'Review & payment'}</h2><button type="button" className={styles.close} onClick={close} aria-label="Close cart" autoFocus>×</button></div>{!item?<div className={styles.empty}><p>Your cart is empty.</p><Link className="button" href={shopHref} onClick={close}>Explore premades →</Link></div>:<><ol className={styles.steps} aria-label="Checkout steps">{(['cart','shipping','payment'] as const).map((step,index)=><li key={step} aria-current={stage===step?'step':undefined}>{index+1}. {step==='payment'?'Review':step}</li>)}</ol><div className={styles.summary}><strong>{item.name}</strong><span>Quantity: 1</span><strong>${item.price.toLocaleString('en-US')} USD</strong></div><p className={styles.note}>{sample?'Development sample. Not for sale. No payment or order can be made.':'Checkout is not connected. Adding an item does not reserve it, place an order, or make a payment.'}</p>{stage==='cart'&&<><p>Shipping and taxes are not calculated. The final total is not available.</p><button className="button" type="button" onClick={()=>dispatch({type:'stage',value:'shipping'})}>Review shipping destination →</button></>}{stage==='shipping'&&<><label htmlFor="cart-region">Shipping destination</label><SiteSelect id="cart-region" value={destination==='US'?'US':international?'international':''} onChange={value=>dispatch({type:'destination',value:value==='US'?'US':'international'})} options={[{value:'US',label:'United States'},{value:'international',label:'Outside the United States'}]} placeholder="Choose your destination"/>{international&&<><label htmlFor="cart-country">Country or territory</label><CountryPicker id="cart-country" value={destination==='international'?'':destination} onChange={value=>dispatch({type:'destination',value})}/></>}<p className={styles.note}>Shipping rates, taxes and any import charges are not calculated. No address is collected.</p><div className={styles.actions}><button type="button" className={styles.back} onClick={()=>dispatch({type:'stage',value:'cart'})}>← Cart</button><button type="button" className="button" disabled={!destination||destination==='international'} onClick={()=>dispatch({type:'stage',value:'payment'})}>Continue to review →</button></div></>}{stage==='payment'&&<><p>Ship to: <strong>{destination==='US'?'United States':countryName(destination)}</strong></p><dl className={styles.totals}><div><dt>Item subtotal</dt><dd>${item.price.toLocaleString('en-US')} USD</dd></div><div><dt>Shipping</dt><dd>Not calculated</dd></div><div><dt>Taxes / import charges</dt><dd>Not calculated</dd></div><div><dt>Order total</dt><dd>Unavailable</dd></div></dl><p>PayPal and checkout are not connected. No order can be placed and no payment information is collected.</p><button type="button" className="button" disabled>Checkout not connected</button><button type="button" className={styles.back} onClick={()=>dispatch({type:'stage',value:'shipping'})}>← Shipping</button></>}<button type="button" className={styles.remove} onClick={()=>dispatch({type:'remove'})}>Remove item</button></>}</div></dialog>}</CartContext.Provider>;
}
export function CartButton(){const {item,open,enabled}=useCart();if(!enabled)return null;return <div className={styles.bar}><button type="button" className={styles.trigger} onClick={open} aria-label={`Open cart, ${item?1:0} items`} aria-haspopup="dialog"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 3h3l2.5 12h11l2-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg><span>Cart</span><span className={styles.count} aria-live="polite">{item?1:0}</span></button></div>;}
