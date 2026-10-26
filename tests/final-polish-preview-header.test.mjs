import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness, content } from './owner-ui-harness.mjs';

function headerSetup() {
  const h = harness(); let pendingHold; h.globals.setTimeout = fn => { pendingHold = fn; return 1; }; h.globals.clearTimeout = () => { pendingHold = null; }; h.overrides['./PhotoUpload'] = { PhotoUpload: 'PhotoUpload' };
  const ghosts = []; h.overrides['./navigation-drag'] = { ...h.load('src/owner/navigation-drag.ts'), createNavigationDragGhost(card, x, y) { const ghost = { card, x, y, moves: [], removed: false, move(x,y) { this.moves.push([x,y]); }, remove() { this.removed = true; } }; ghosts.push(ghost); return ghost; } };
  const { OwnerHeaderEditor } = h.load('src/owner/OwnerHeaderEditor.tsx'); let value = h.load('src/owner/defaults.ts').createDefaultOwnerContent(); let writes = 0;
  const props = { content: value, open: true, disabled: false, onOpenChange() {}, onEdit(change) { value = structuredClone(value); change(value); props.content = value; writes++; } };
  const render = () => h.render(OwnerHeaderEditor, props); render();
  const cards = value.pages.map((page, index) => ({ dataset: { navCard: page.id }, getBoundingClientRect: () => ({ left: (index % 3) * 300, top: Math.floor(index / 3) * 400, width: 280, height: 380 }), closest() { return this; } }));
  const list = h.find(n => n.props.className === 'navRows').props.ref.current; list.contains = node => cards.includes(node); list.querySelectorAll = () => cards;
  let target = cards[2]; h.document.elementFromPoint = () => target;
  const captured = new Set(); const handle = Object.assign(cards[0], { setPointerCapture: id => captured.add(id), hasPointerCapture: id => captured.has(id), releasePointerCapture: id => captured.delete(id), focus() {} });
  const event = (x = 20, y = 20, extra = {}) => ({ button: 0, pointerId: 1, clientX: x, clientY: y, currentTarget: handle, target: { closest: () => null }, preventDefault() {}, stopPropagation() {}, ...extra });
  const drag = () => h.all(n => n.props.onPointerDown)[0]; const order = () => value.pages.filter(p => !p.trashedAt).sort((a,b) => a.order-b.order).map(p => p.id);
  return { h, props, render, cards, ghosts, captured, event, drag, order, hold() { const fn = pendingHold; pendingHold = null; fn?.(); }, setTarget(node) { target = node; }, get value() { return value; }, get writes() { return writes; } };
}

test('preview maximize/restore keeps the same modal, focus and page scroll lock; Escape still closes', () => {
  const h = harness(); const { Dialog } = h.load('src/owner/OwnerDialog.tsx'); let closed = 0;
  const props = { title: 'Your draft preview', wide: true, maximizable: true, children: 'Preview', actions: 'Back', onClose() { closed++; } };
  h.render(Dialog, props); const dialog = h.tree.props.ref.current; h.document.activeElement = dialog; const originalBody = structuredClone(h.document.body.style);
  h.find(n => n.props['aria-label'] === 'Maximize preview').props.onClick(); h.render(Dialog, props);
  assert.equal(h.tree.props['data-maximized'], true); assert.equal(h.tree.props.ref.current, dialog); assert.equal(dialog.open, true); assert.deepEqual(h.document.body.style, originalBody); assert.equal(h.document.activeElement, dialog);
  h.find(n => n.props['aria-label'] === 'Restore preview size').props.onClick(); h.render(Dialog, props); assert.equal(h.tree.props['data-maximized'], false);
  props.dismissDisabled = true; h.render(Dialog, props); h.tree.props.onCancel({ preventDefault() {} }); assert.equal(closed, 0);
  props.dismissDisabled = false; h.render(Dialog, props); h.tree.props.onCancel({ preventDefault() {} }); assert.equal(closed, 1); h.unmount(); assert.equal(h.document.body.style.overflow, 'auto');
  const css = fs.readFileSync(new URL('../src/owner/OwnerDialog.module.css', import.meta.url), 'utf8'); assert.match(css, /\.dialog\.maximized[^}]*height:100dvh/); assert.match(css, /\[data-dialog-preview\][^}]*max-height:none/);
});
test('only draft preview opts into maximize and Overview removes only the decorative spade', () => {
  const source = fs.readFileSync(new URL('../src/owner/OwnerPortal.tsx', import.meta.url), 'utf8');
  assert.match(source, /<Dialog draggable wide maximizable title="Your draft preview"/); assert.equal((source.match(/<Dialog draggable\b/g)||[]).length,1); assert.doesNotMatch(source, /styles\.spadeDisc/); assert.match(source, /OwnerBrandLogo className=\{styles\.welcomeLogo\}/); assert.match(source, /<OwnerBrandLogo decorative/);
});
test('More enable creates one visible assignment, preserves existing groups and never promotes unavailable pages', () => {
  const t = headerSetup(); const before = structuredClone(t.value.pages); const toggle = () => t.h.find(n => n.type?.name === 'Toggle' && n.props.label === 'Enable the More dropdown');
  toggle().props.onChange(true); t.render(); const changed = t.value.pages.filter((p,i) => p.navPlacement !== before[i].navPlacement); assert.equal(changed.length, 1); assert.equal(changed[0].builtinKey, 'contact'); assert.equal(changed[0].navPlacement, 'more'); assert.equal(t.value.site.moreEnabled, true);
  toggle().props.onChange(false); t.render(); toggle().props.onChange(true); assert.equal(t.value.pages.filter(p => p.navPlacement === 'more').length, 1); assert.equal(t.value.pages.find(p => p.builtinKey === 'terms').showInNav, false);
  t.props.onEdit(draft => { for (const p of draft.pages) if (p.builtinKey !== 'home') { p.navPlacement = 'unlisted'; p.showInNav = false; } }); t.render(); toggle().props.onChange(true); t.render(); assert.equal(t.value.pages.filter(p => p.navPlacement === 'more').length, 0); assert.match(content(t.h.tree), /More has no accessible pages yet/);
});
test('assigning a card to More automatically enables the dropdown without changing other placements', () => {
  const t = headerSetup(); const controls = t.h.all(n => n.type?.name === 'OwnerPageNavigation'); controls[2].props.onEdit(page => { page.navPlacement = 'more'; page.showInNav = true; });
  assert.equal(t.value.site.moreEnabled, true); assert.equal(t.value.pages[2].navPlacement, 'more'); assert.equal(t.value.pages.filter(p => p.navPlacement === 'more').length, 1);
});
test('pointer drag starts on movement without delay, moves the full card ghost and commits once on drop', () => {
  const t = headerSetup(); const original = t.order(); t.drag().props.onPointerDown(t.event()); t.drag().props.onPointerMove(t.event(22,22)); assert.equal(t.ghosts.length, 0); assert.equal(t.writes, 0);
  t.hold(); t.drag().props.onPointerMove(t.event(850,200)); assert.equal(t.ghosts.length, 1); assert.equal(t.ghosts[0].card, t.cards[0]); assert.deepEqual(t.ghosts[0].moves, [[850,200]]); assert.deepEqual(t.order(), original, 'source order is a stable placeholder until drop');
  t.drag().props.onPointerUp(t.event(850,200)); assert.equal(t.order()[2], original[0]); assert.equal(t.writes, 1); assert.equal(t.ghosts[0].removed, true); assert.equal(t.captured.size, 0);
  let blocked = 0; t.h.tree.props.onClickCapture({ detail: 1, preventDefault() { blocked++; }, stopPropagation() {} }); assert.equal(blocked, 1);
  t.h.tree.props.onPointerDownCapture(); t.h.tree.props.onClickCapture({ detail: 1, preventDefault() { blocked++; }, stopPropagation() {} }); assert.equal(blocked, 1, 'a subsequent deliberate click works');
});
test('pointercancel, lost capture, Escape, outside drop and upload lock never commit a card move', () => {
  for (const action of ['pointercancel', 'lostcapture', 'escape', 'outside', 'lock']) {
    const t = headerSetup(); const original = t.order(); t.drag().props.onPointerDown(t.event()); t.hold(); t.drag().props.onPointerMove(t.event(850,200));
    if (action === 'pointercancel') t.drag().props.onPointerCancel(t.event());
    if (action === 'lostcapture') t.drag().props.onLostPointerCapture(t.event());
    if (action === 'escape') t.h.tree.props.onKeyDownCapture({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
    if (action === 'outside') { t.setTarget(null); t.drag().props.onPointerMove(t.event(1000,400)); t.drag().props.onPointerUp(t.event()); }
    if (action === 'lock') { t.props.disabled = true; t.render(); t.drag().props.onPointerUp(t.event()); }
    assert.deepEqual(t.order(), original, action); assert.equal(t.writes, 0, action); assert.equal(t.ghosts[0].removed, true, action); assert.equal(t.captured.size, 0, action);
  }
});
test('header drag keyboard arrows move cards and disabled editor remains immutable', () => {
  const t = headerSetup(); const original = t.order(); t.drag().props.onKeyDown({ key: 'ArrowDown', preventDefault() {} }); assert.equal(t.order()[1], original[0]);
  t.props.disabled = true; t.render(); const before = t.order(); t.drag().props.onPointerDown(t.event()); t.drag().props.onKeyDown({ key: 'ArrowDown', preventDefault() {} }); assert.deepEqual(t.order(), before);
});
test('full-card ghost is inert, copies complete card, strips duplicate IDs, follows pointer and cleans up', () => {
  const h = harness(); const { createNavigationDragGhost } = h.load('src/owner/navigation-drag.ts'); const removedIds = []; const ghost = { style: {}, dataset: {}, removeAttribute: name => removedIds.push(name), querySelectorAll: () => [{ removeAttribute: name => removedIds.push(name) }], setAttribute(name,value) { this[name] = value; }, remove() { this.removed = true; } }; let cloneDeep, appended;
  const card = { dataset: {}, getBoundingClientRect: () => ({ left: 10, top: 20, width: 300, height: 420 }), cloneNode(deep) { cloneDeep = deep; return ghost; }, parentElement: { appendChild(node) { appended = node; } } };
  const preview = createNavigationDragGhost(card, 30, 40); assert.equal(cloneDeep, true); assert.equal(appended, ghost); assert.equal(ghost.inert, true); assert.equal(ghost['aria-hidden'], 'true'); assert.deepEqual(removedIds, ['id','id']); assert.equal(ghost.style.width, '300px'); assert.equal(ghost.style.height, '420px'); assert.equal(card.dataset.dragging, 'true');
  preview.move(130, 240); assert.equal(ghost.style.transform, 'translate3d(100px,200px,0)'); preview.remove(); assert.equal(ghost.removed, true); assert.equal(card.dataset.dragging, undefined);
});
function slugSetup(key = 'terms') {
  const h = harness(); const { OwnerPageSlug } = h.load('src/owner/OwnerPageSlug.tsx'); const pages = h.load('src/owner/defaults.ts').createDefaultOwnerContent().pages; let writes = 0;
  const props = { page: pages.find(p => p.builtinKey === key), pages, onChange(slug) { props.page = { ...props.page, slug }; writes++; } }; const render = () => h.render(OwnerPageSlug, props); render(); const input = () => h.find(n => n.type === 'input');
  return { h, props, render, input, get writes() { return writes; } };
}
test('inline addresses reject duplicate, trashed, reserved and malformed values without mutating draft', () => {
  for (const invalid of ['prices', 'taylor', 'bad//path', 'contains spaces', '', '-bad', 'bad-']) {
    const t = slugSetup(); t.input().props.onChange({ target: { value: invalid } }); t.render(); assert.equal(t.input().props['aria-invalid'], true, invalid); t.input().props.onBlur(); t.input().props.onKeyDown({ key: 'Enter', preventDefault() {} }); assert.equal(t.props.page.slug, 'terms'); assert.equal(t.writes, 0);
  }
  const t = slugSetup(); t.props.pages.push({ id:'trashed',slug:'old-page',trashedAt:'2026-01-01' }); t.input().props.onChange({target:{value:'old-page'}}); t.render(); t.input().props.onBlur(); assert.equal(t.writes,0); assert.match(content(t.h.tree),/trash/);
});
test('valid address commits on Enter or blur once; unchanged/escape/home do not write', () => {
  const t = slugSetup(); t.input().props.onBlur(); assert.equal(t.writes, 0); t.input().props.onChange({ target: { value: 'STUDIO-TERMS' } }); t.render(); const input = t.input(); input.props.onKeyDown({ key: 'Enter', preventDefault() {} }); input.props.onBlur(); assert.equal(t.props.page.slug, 'studio-terms'); assert.equal(t.writes, 1); t.render(); t.input().props.onBlur(); assert.equal(t.writes, 1);
  t.input().props.onChange({ target: { value: 'another' } }); t.render(); t.input().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} }); t.render(); assert.equal(t.input().props.value, 'studio-terms'); assert.equal(t.writes, 1);
  t.input().props.onChange({ target: { value: 'terms' } }); t.render(); assert.equal(t.input().props['aria-invalid'], false, 'built-in can return to its own canonical default'); t.input().props.onBlur(); assert.equal(t.props.page.slug, 'terms');
  const home = slugSetup('home'); assert.equal(home.input(), undefined); assert.match(content(home.h.tree), /Home address: \/ \(fixed\)/);
});
test('menu reorder preserves unique saved positions reserved by trashed pages', () => {
  const t = headerSetup(); t.props.onEdit(draft => { draft.pages[1].trashedAt = '2026-01-01T00:00:00.000Z'; }); t.render();
  const trashed = structuredClone(t.value.pages[1]); t.drag().props.onKeyDown({ key: 'ArrowDown', preventDefault() {} });
  assert.equal(new Set(t.value.pages.map(page => page.order)).size, t.value.pages.length); assert.deepEqual(t.value.pages[1], trashed); assert.equal(t.order()[1], 'builtin-home');
});
test('preview More closes on Escape without dismissing its containing preview dialog', () => {
  const h = harness(); h.overrides['@/owner/media-client'] = { useOwnerMediaSource: src => ({src,error:null}) };
  const value = h.load('src/owner/defaults.ts').createDefaultOwnerContent(); value.site.moreEnabled = true; value.pages[2].navPlacement = 'more'; const {SiteContentFrame} = h.load('src/components/SiteContent.tsx');
  h.render(SiteContentFrame,{content:value,page:value.pages[0],mode:'editor'}); const more = h.find(n=>n.type==='details'); let closed=0, focused=0, stopped=0;
  more.props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){stopped++;},currentTarget:{removeAttribute(name){assert.equal(name,'open');closed++;},querySelector(){return {focus(){focused++;}};}}}); assert.deepEqual([closed,focused,stopped],[1,1,1]);
});

test('whole navigation cards have no six-dot handle and hold does not hijack clicks, controls or pre-hold scrolling', () => {
  const t = headerSetup(); const before = t.order();
  assert.equal(t.h.all(n => n.props.className === 'dragHandle').length, 0);
  t.drag().props.onPointerDown(t.event()); t.drag().props.onPointerUp(t.event()); t.hold(); assert.equal(t.ghosts.length, 0);
  t.drag().props.onPointerDown(t.event(20,20,{pointerType:'touch'})); t.drag().props.onPointerMove(t.event(20,40,{pointerType:'touch'})); t.hold(); assert.equal(t.ghosts.length, 0);
  t.drag().props.onPointerDown(t.event(20,20,{target:{closest:()=>({})}})); t.hold(); assert.equal(t.ghosts.length, 0, 'nested form controls never drag');
  t.drag().props.onKeyDown({key:'ArrowDown',target:{},currentTarget:{},preventDefault(){throw Error('input key swallowed');}});
  assert.deepEqual(t.order(), before); assert.equal(t.writes, 0);
  t.drag().props.onPointerDown(t.event()); t.drag().props.onPointerMove(t.event(30,20)); t.h.window.dispatchEvent(new Event('blur'));
  assert.equal(t.ghosts[0].removed, true); assert.equal(t.captured.size, 0); assert.deepEqual(t.order(), before);
});

test('enabled legacy empty More is explained in the editor without making a draft write', () => {
  const t = headerSetup(); t.value.site.moreEnabled = true; t.render();
  assert.match(content(t.h.tree), /Contact appears in More automatically/);
  assert.match(content(t.h.tree), /Automatically in More/); assert.equal(t.writes, 0);
});


test('header mouse and pen drags activate at five pixels without waiting for a hold',()=>{
 for(const pointerType of ['mouse','pen']) {
  const t=headerSetup();t.drag().props.onPointerDown(t.event(20,20,{pointerType}));
  t.hold();assert.equal(t.ghosts.length,0,'holding alone does not start mouse drag');
  t.drag().props.onPointerMove(t.event(23,20,{pointerType}));assert.equal(t.ghosts.length,0);
  t.drag().props.onPointerMove(t.event(25,20,{pointerType}));assert.equal(t.ghosts.length,1);
  t.drag().props.onPointerCancel(t.event());assert.equal(t.writes,0);assert.equal(t.captured.size,0);t.h.unmount();
 }
});
