'use client';
import Image from 'next/image';
import {useCart} from './Cart';
import styles from './PremadeShopPreview.module.css';
export default function PremadeShopPreview({name,price,image}:{name:string;price:number;image:string}){
 const {item,add,open}=useCart();
 return <section className={styles.shop} aria-label="Development-only shop sample"><div className="notice"><strong>Development-only sample · not for sale</strong><p>Explore the cart and shipping steps. No orders or payments can be made.</p></div><article className={styles.product}><div className={styles.productPhoto}><Image src={image} alt={`${name} sample premade photographs supplied by Taylor`} fill unoptimized sizes="(max-width:760px) 90vw, 700px"/></div><div className={styles.details}><p className="eyebrow">SAMPLE PREMADE</p><h2>{name}</h2><p className={styles.price}>${price} USD</p><p>Development listing for reviewing the shop. Shipping and taxes are not calculated.</p><button type="button" className="button" onClick={()=>item?open():add({id:'dev-sample',name,price,image})}>{item?'View cart →':'Add to sample cart'}</button></div></article></section>;
}
