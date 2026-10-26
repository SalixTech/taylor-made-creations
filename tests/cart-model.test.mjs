import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyCart,cartTransition} from '../src/components/cart-model.ts';
const item={id:'sample',name:'Sample',price:621,image:'/api/dev-preview/product-image'};
test('sample offers cannot enter a production cart',()=>assert.deepEqual(cartTransition(emptyCart,{type:'add',item},false),emptyCart));
test('development add is single quantity and repeat does not duplicate',()=>{const added=cartTransition(emptyCart,{type:'add',item},true);assert.equal(added.item,item);assert.deepEqual(cartTransition(added,{type:'add',item},true),added);});
test('empty cart cannot advance and missing country cannot reach payment',()=>{assert.deepEqual(cartTransition(emptyCart,{type:'stage',value:'shipping'},true),emptyCart);let state=cartTransition(emptyCart,{type:'add',item},true);state=cartTransition(state,{type:'stage',value:'payment'},true);assert.equal(state.stage,'cart');state=cartTransition(state,{type:'destination',value:'international'},true);assert.equal(cartTransition(state,{type:'stage',value:'payment'},true).stage,'shipping');});
test('international destination review and back preserve country; remove clears all',()=>{let state=cartTransition(emptyCart,{type:'add',item},true);state=cartTransition(state,{type:'destination',value:'GB'},true);state=cartTransition(state,{type:'stage',value:'payment'},true);assert.equal(state.stage,'payment');assert.equal(state.destination,'GB');state=cartTransition(state,{type:'stage',value:'shipping'},true);assert.equal(state.destination,'GB');assert.deepEqual(cartTransition(state,{type:'remove'},true),emptyCart);});
test('invalid sample prices cannot enter cart',()=>{for(const price of [-1,NaN,Infinity])assert.deepEqual(cartTransition(emptyCart,{type:'add',item:{...item,price}},true),emptyCart);});

test('unknown destination cannot reach payment',()=>{let state=cartTransition(emptyCart,{type:'add',item},true);state=cartTransition(state,{type:'destination',value:'ZZ'},true);assert.equal(cartTransition(state,{type:'stage',value:'payment'},true).stage,'shipping');});
