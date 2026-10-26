import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { harness, nodes, content as text } from './owner-ui-harness.mjs';

function managerFixture() {
  const h = harness(); let value = h.load('src/owner/defaults.ts').createDefaultOwnerContent(), confirmation;
  const Component = h.load('src/owner/OwnerPricesManager.tsx').OwnerPricesManager;
  const props = { content: value, disabled: false, onEdit(change) { value = structuredClone(value); change(value); props.content = value; }, onRemove(title, description, remove) { confirmation = { title, description, remove }; } };
  const render = () => h.render(Component, props); render();
  const lists = () => h.all(node => node.type?.name === 'OwnerPriceReorderList');
  const list = label => lists().find(node => node.props.label === label);
  const groupCard = group => list('Price groups').props.children(group, 'group-handle');
  const groupItems = group => nodes(groupCard(group)).find(node => node.type?.name === 'OwnerPriceReorderList');
  const field = (tree, label) => nodes(tree).find(node => node.type?.name === 'Field' && node.props.label === label);
  const money = tree => nodes(tree).find(node => node.type?.name === 'MoneyField');
  return { h, props, render, list, groupCard, groupItems, field, money, get value() { return value; }, get confirmation() { return confirmation; } };
}

test('price groups drag reorder by stable identity without changing price content or unrelated draft data', () => {
  const t = managerFixture(), before = structuredClone(t.value), groups = t.value.prices.groups;
  t.list('Price groups').props.onReorder(groups[0].id, groups[2].id, true); t.render();
  assert.deepEqual(t.value.prices.groups.map(group => group.id), [groups[1].id, groups[2].id, groups[0].id]);
  for (const group of before.prices.groups) assert.deepEqual(t.value.prices.groups.find(x => x.id === group.id), group);
  assert.deepEqual({ ...t.value, prices: before.prices }, before);
});

test('group and price field handlers still edit the same card after later group and item reordering', () => {
  const t = managerFixture(), group = t.value.prices.groups.find(group => group.items.length > 1), item = group.items[0], second = group.items[1];
  const name = t.field(t.groupCard(group), 'Group name');
  const items = t.groupItems(group), row = items.props.children(item, 'item-handle');
  const itemName = t.field(row, 'Item name'), detail = t.field(row, 'What is included?'), price = t.money(row);
  t.list('Price groups').props.onReorder(group.id, t.value.prices.groups[2].id, true);
  items.props.onReorder(item.id, second.id, true);
  name.props.onChange('New group title'); itemName.props.onChange('Custom item'); detail.props.onChange('Updated details'); price.props.onChange(4321.75);
  const current = t.value.prices.groups.find(x => x.id === group.id);
  assert.equal(current.title, 'New group title'); assert.equal(current.items[1].id, item.id);
  assert.deepEqual(current.items[1], { ...item, name: 'Custom item', detail: 'Updated details', price: 4321.75 });
  assert.deepEqual(current.items[0], second);
});

for (const [key, label] of [['parts', 'Individual parts'], ['extras', 'Extras and add-ons']]) test(`${key} reordering preserves exact amounts and stale callbacks follow IDs`, () => {
  const t = managerFixture(), list = t.list(label), [first, second] = t.value.prices[key];
  const row = list.props.children(first, 'handle'), name = t.field(row, 'Name'), amount = t.money(row);
  list.props.onReorder(first.id, second.id, true);
  name.props.onChange(`Custom ${key}`); amount.props.onChange(543.25);
  assert.equal(t.value.prices[key][1].id, first.id);
  assert.deepEqual(t.value.prices[key][1], { ...first, name: `Custom ${key}`, price: 543.25 });
  assert.deepEqual(t.value.prices[key][0], second);
  list.props.onStep(first.id, -1); assert.equal(t.value.prices[key][0].id, first.id);
});

test('delayed removal confirms and removes only the selected price after reorder, without resurrecting deleted groups', () => {
  const t = managerFixture(), group = t.value.prices.groups.find(group => group.items.length > 1), item = group.items[0];
  const rows = t.groupItems(group), row = rows.props.children(item, 'handle');
  const remove = nodes(row).find(node => node.type === 'button' && text(node) === 'Remove item');
  const amount = t.money(row), add = nodes(t.groupCard(group)).find(node => node.type?.name === 'PriceItemChooser');
  remove.props.onClick(); assert.ok(t.value.prices.groups.find(x => x.id === group.id).items.some(x => x.id === item.id));
  rows.props.onReorder(item.id, group.items[1].id, true); t.confirmation.remove();
  assert.ok(!t.value.prices.groups.find(x => x.id === group.id).items.some(x => x.id === item.id));
  const before = structuredClone(t.value); amount.props.onChange(1); assert.deepEqual(t.value, before);
  t.props.onEdit(draft => { draft.prices.groups = draft.prices.groups.filter(x => x.id !== group.id); });
  const removed = structuredClone(t.value); rows.props.onReorder(item.id, group.items[1].id, true); add.props.onChoose({ name: "New item", price: 0, detail: "" }); assert.deepEqual(t.value, removed);
});

test('price manager ignores missing and cross-list IDs; keyboard moves use the latest order', () => {
  const t = managerFixture(), groups = t.list('Price groups'), before = structuredClone(t.value);
  groups.props.onReorder(t.value.prices.parts[0].id, t.value.prices.groups[0].id, false);
  groups.props.onReorder(t.value.prices.groups[0].id, 'removed', true);
  groups.props.onStep('removed', 1); assert.deepEqual(t.value, before);
  const id = t.value.prices.groups[0].id;
  groups.props.onReorder(id, t.value.prices.groups[2].id, true);
  groups.props.onStep(id, -1); assert.equal(t.value.prices.groups[1].id, id);
});

test('locked price manager does not reorder or edit; prices still validate and publish in the reordered sequence', () => {
  const t = managerFixture(); t.props.disabled = true; t.render(); const before = structuredClone(t.value);
  const group = t.value.prices.groups[0];
  t.list('Price groups').props.onStep(group.id, 1); t.field(t.groupCard(group), 'Group name').props.onChange('Blocked');
  assert.deepEqual(t.value, before);
  t.props.disabled = false; t.render(); t.list('Price groups').props.onStep(group.id, 1);
  const model = t.h.load('src/owner/model.ts');
  assert.equal(model.validateOwnerContent(t.value).valid, true);
  assert.deepEqual(model.publicContentToOwnerContent(model.createPublicContentSnapshot(t.value)).prices, t.value.prices);
});

function dragFixture() {
  const h = harness(), ghosts = [], writes = [], timers = new Map(); let timerId=0;
  h.globals.setTimeout = fn => { timers.set(++timerId,fn); return timerId; }; h.globals.clearTimeout = id => timers.delete(id);
  const helpers = h.load('src/owner/navigation-drag.ts');
  h.overrides['./navigation-drag'] = { ...helpers, createNavigationDragGhost(card, x, y) { const ghost = { card, x, y, moves: [], removed: false, move(x, y) { this.moves.push([x, y]); }, remove() { this.removed = true; } }; ghosts.push(ghost); return ghost; } };
  const { OwnerPriceReorderList } = h.load('src/owner/OwnerPriceReorderList.tsx');
  const props = { label: 'Prices', items: [{id:'a',name:'First'}, {id:'b',name:'Second'}, {id:'c',name:'Third'}], itemLabel:item=>item.name, disabled:false, onReorder(...args) { writes.push(['reorder',...args]); }, onStep(...args) { writes.push(['step',...args]); }, children(item,handle) { return {type:'section',props:{children:[item.name,handle]}}; } };
  const render = () => h.render(OwnerPriceReorderList,props); render();
  const list = h.find(node=>node.props['data-price-sort-list']).props.ref.current;
  const captures=new Set();
  const cards = props.items.map((item,index)=>({dataset:{priceSortCard:item.id},parentElement:list,isConnected:true,getBoundingClientRect:()=>({left:0,top:index*240,width:500,height:220}),closest(selector){return selector==='[data-price-sort-card]'?this:null;},setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id),focus(){}}));
  let target=cards[2];h.document.elementFromPoint=()=>target;
  const handle=cards[0];
  const event=(x=20,y=20,extra={})=>({button:0,pointerId:1,clientX:x,clientY:y,currentTarget:handle,target:handle,preventDefault(){},stopPropagation(){},...extra});
  const drag=()=>h.find(node=>node.props['data-price-drag-handle']==='a');
  return {h,props,render,list,cards,ghosts,writes,captures,timers,hold(){ for(const [id,fn] of timers){timers.delete(id);fn();} },event,drag,setTarget(node){target=node;}};
}

test('mouse and pen start on movement while touch uses its short hold, with one full-card drop', () => {
  for (const pointerType of ['mouse','touch','pen']) {
    const t=dragFixture(); const original=structuredClone(t.props.items);
    t.drag().props.onPointerDown(t.event(20,20,{pointerType}));
    t.drag().props.onPointerMove(t.event(22,22,{pointerType})); assert.equal(t.ghosts.length,0);
    t.hold(); t.drag().props.onPointerMove(t.event(100,650,{pointerType}));
    assert.equal(t.ghosts[0].card,t.cards[0]);assert.deepEqual(t.ghosts[0].moves,[[100,650]]);assert.deepEqual(t.props.items,original);assert.equal(t.writes.length,0);
    t.drag().props.onPointerUp(t.event(100,650,{pointerType}));t.drag().props.onPointerUp(t.event());
    assert.deepEqual(t.writes,[['reorder','a','c',true]]);assert.equal(t.ghosts[0].removed,true);assert.equal(t.captures.size,0);
    let clicks=0;t.h.tree.props.onClickCapture({detail:1,preventDefault(){clicks++;},stopPropagation(){}});assert.equal(clicks,1);
    t.h.tree.props.onPointerDownCapture();t.h.tree.props.onClickCapture({detail:1,preventDefault(){clicks++;},stopPropagation(){}});assert.equal(clicks,1);
  }
});

test('price drag cancellation, Escape, blur, unmount, outside drop and busy lock remove the ghost and never write', () => {
  for (const action of ['cancel','lostcapture','escape','blur','unmount','outside','lock']) {
    const t=dragFixture();t.drag().props.onPointerDown(t.event());t.hold();t.drag().props.onPointerMove(t.event(100,650));
    if(action==='cancel')t.drag().props.onPointerCancel(t.event());
    if(action==='lostcapture')t.drag().props.onLostPointerCapture(t.event());
    if(action==='escape')t.h.tree.props.onKeyDownCapture({key:'Escape',preventDefault(){},stopPropagation(){}});
    if(action==='blur')t.h.window.dispatchEvent(new Event('blur'));
    if(action==='unmount')t.h.unmount();
    if(action==='outside'){t.setTarget(null);t.drag().props.onPointerMove(t.event(1000,800));t.drag().props.onPointerUp(t.event());}
    if(action==='lock'){t.props.disabled=true;t.render();t.drag().props.onPointerUp(t.event());}
    assert.equal(t.writes.length,0,action);assert.equal(t.ghosts[0].removed,true,action);assert.equal(t.captures.size,0,action);
  }
});

test('nested group drops find the outer card while cross-list item drops cannot escape their current list', () => {
  const t=dragFixture();const inner={dataset:{priceSortCard:'nested'},parentElement:{closest:()=>t.cards[2]},closest(){return this;}};
  t.setTarget(inner);t.drag().props.onPointerDown(t.event());t.hold();t.drag().props.onPointerMove(t.event(100,650));t.drag().props.onPointerUp(t.event());
  assert.deepEqual(t.writes,[['reorder','a','c',true]]);
  const other=dragFixture();other.setTarget({dataset:{priceSortCard:'foreign'},parentElement:{closest:()=>null},closest(){return this;}});other.drag().props.onPointerDown(other.event());other.hold();other.drag().props.onPointerMove(other.event(100,650));other.drag().props.onPointerUp(other.event());assert.deepEqual(other.writes,[]);
});

test('keyboard ordering is on the focused card, boundary presses do not write and non-primary pointers do not start', () => {
  const t=dragFixture();t.drag().props.onKeyDown({key:'ArrowUp',preventDefault(){},stopPropagation(){}});assert.deepEqual(t.writes,[]);
  t.drag().props.onKeyDown({key:'ArrowDown',preventDefault(){},stopPropagation(){}});assert.deepEqual(t.writes,[['step','a',1]]);
  t.drag().props.onPointerDown(t.event(20,20,{button:2}));t.drag().props.onPointerMove(t.event(100,650));assert.equal(t.ghosts.length,0);
  t.drag().props.onPointerDown(t.event(20,20,{isPrimary:false}));t.drag().props.onPointerMove(t.event(100,650));assert.equal(t.ghosts.length,0);
  t.props.disabled=true;t.render();t.drag().props.onKeyDown({key:'ArrowDown',preventDefault(){},stopPropagation(){}});assert.equal(t.writes.length,1);
});

test('actual prices manager markup has focusable whole cards without dotted handles and no visible up/down arrow buttons', () => {
  const h=harness();h.overrides.react=React;h.overrides['react/jsx-runtime']=jsxRuntime;
  const {OwnerPricesManager}=h.load('src/owner/OwnerPricesManager.tsx'),content=h.load('src/owner/defaults.ts').createDefaultOwnerContent();
  const html=renderToStaticMarkup(React.createElement(OwnerPricesManager,{content,onEdit(){},onRemove(){}}));
  const count=content.prices.groups.length+content.prices.groups.reduce((total,group)=>total+group.items.length,0)+content.prices.parts.length+content.prices.extras.length;
  assert.equal((html.match(/data-price-drag-handle=/g)||[]).length,count);
  assert.doesNotMatch(html,/>↑<|>↓<|aria-label="Move [^"]+ (?:up|down)"/);
  assert.match(html,/aria-describedby=/);assert.match(html,/aria-live="polite"/);
  const css=readFileSync(new URL('../src/owner/OwnerPricesManager.module.css',import.meta.url),'utf8');
  assert.match(css,/touch-action:pan-y/);assert.doesNotMatch(html,/>⠿</);assert.match(css,/data-dragging="true"/);assert.match(css,/data-drop-target="true"/);
  const portal=readFileSync(new URL('../src/owner/OwnerPortal.tsx',import.meta.url),'utf8');assert.match(portal,/section === "prices"\) body = <OwnerPricesManager/);assert.doesNotMatch(portal,/function MoneyField|function reordered/);
});


test('gallery grid uses horizontal card midpoint for before/after drop and commits only on release', () => {
  const t = dragFixture(); t.props.layout = 'grid'; t.render();
  t.drag().props.onPointerDown(t.event()); t.hold(); t.drag().props.onPointerMove(t.event(400, 500)); assert.equal(t.writes.length, 0);
  t.drag().props.onPointerUp(t.event(400, 500)); assert.deepEqual(t.writes, [['reorder', 'a', 'c', true]]); assert.equal(t.ghosts[0].removed, true); t.h.unmount();
});


test('short clicks, touch scrolling before hold, form controls and nested cards never start a move',()=>{
 for(const action of ['click','scroll','cancel','blur','unmount','lock','leave']) {
  const t=dragFixture();t.drag().props.onPointerDown(t.event(20,20,{pointerType:'touch'}));assert.equal(t.timers.size,1);
  if(action==='click') t.drag().props.onPointerUp(t.event());
  if(action==='scroll') t.drag().props.onPointerMove(t.event(21,45,{pointerType:'touch'}));
  if(action==='cancel') t.drag().props.onPointerCancel(t.event());
  if(action==='blur') t.h.window.dispatchEvent(new Event('blur'));
  if(action==='unmount') t.h.unmount();
  if(action==='lock'){t.props.disabled=true;t.render();}
  if(action==='leave')t.drag().props.onPointerLeave(t.event());
  t.hold();assert.equal(t.ghosts.length,0,action);assert.equal(t.writes.length,0,action);t.h.unmount();
 }
 for(const kind of ['input','button','label','nested']) {
  const t=dragFixture(); const child={closest(selector){return selector==='[data-price-sort-card]'?(kind==='nested'?{}:t.cards[0]):this;}};
  t.drag().props.onPointerDown(t.event(20,20,{target:child}));t.hold();assert.equal(t.ghosts.length,0,kind);assert.equal(t.timers.size,0);t.h.unmount();
 }
 const t=dragFixture();t.drag().props.onKeyDown({key:'ArrowDown',target:{},currentTarget:t.cards[0],preventDefault(){throw Error('input arrow stolen');}});assert.deepEqual(t.writes,[]);t.h.unmount();
});


test('mouse and pen require only five pixels, not a timer, while touch delay is shortened',()=>{
 for(const pointerType of ['mouse','pen']){
  const t=dragFixture();t.drag().props.onPointerDown(t.event(20,20,{pointerType}));assert.equal(t.timers.size,0);
  t.drag().props.onPointerMove(t.event(23,20,{pointerType}));assert.equal(t.ghosts.length,0);
  t.drag().props.onPointerMove(t.event(25,20,{pointerType}));assert.equal(t.ghosts.length,1);assert.equal(t.writes.length,0);
  t.drag().props.onPointerCancel(t.event());assert.equal(t.ghosts[0].removed,true);t.h.unmount();
 }
 const h=harness();assert.equal(h.load('src/owner/OwnerPriceReorderList.tsx').CARD_HOLD_DELAY,160);
});
