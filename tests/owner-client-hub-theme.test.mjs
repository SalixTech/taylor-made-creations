import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { cascade, contrast, element } from './helpers/css-cascade.mjs';

const require = createRequire(import.meta.url);
const local = require('next/dist/compiled/postcss-modules-local-by-default');
const scope = require('next/dist/compiled/postcss-modules-scope');
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
async function compile(folder, name) { return (await postcss([local(), scope({ generateScopedName: key => `${name}_${key}` })]).process(read(`src/${folder}/${name}.module.css`), { from: `${name}.module.css` })).css; }
const owner = await compile('owner', 'OwnerPortal'), hub = await compile('owner', 'OwnerClientHub'), button = await compile('owner', 'OwnerButton'), select = await compile('components', 'SiteSelect');
const base = [read('src/app/globals.css'), read('src/app/color-modes.css'), owner, button, select];
function fixture(mode) {
  const site = element('div', { class: 'selected-design' });
  const portal = element('div', { class: 'OwnerPortal_portal', 'data-owner-portal': '', 'data-color-mode': mode }, site);
  const root = element('div', { class: 'OwnerClientHub_root' }, portal);
  return { root, portal, site };
}


function mixedColor(value) {
 if (value.startsWith("linear-gradient")) return "#950020";
 const m=value.match(/^color-mix\(in srgb,(#[a-f0-9]+) (\d+)%,(#[a-f0-9]+)\)$/i);
 if(!m) return value;
 const rgb=hex=>{let h=hex.slice(1);if(h.length===3)h=[...h].map(c=>c+c).join('');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));};
 const a=rgb(m[1]),b=rgb(m[3]),w=Number(m[2])/100;return '#'+a.map((v,i)=>Math.round(v*w+b[i]*(1-w)).toString(16).padStart(2,'0')).join('');
}

// Compiled CSS-cascade regressions, not rendered browser/pixel verification.
test('client selection stays visible and copy/action controls stay readable in light/dark in either stylesheet order', () => {
  for (const mode of ['light', 'dark']) for (const sheets of [[...base, hub], [hub, ...base]]) {
    const { root } = fixture(mode), compute = cascade(sheets);
    const directory = element('section', { class: 'OwnerClientHub_directory' }, root), list = element('ul', {}, directory), row = element('button', { class: 'OwnerClientHub_clientRow', 'aria-pressed': 'false', 'data-owner-button': '' }, list);
    const idle = compute(row); row.attrs['aria-pressed'] = 'true'; const selected = compute(row);
    assert.notEqual(selected.background, idle.background); assert.notEqual(selected['border-color'], idle['border-color']); assert.match(selected['box-shadow'], /#00b1f5/); assert.match(selected.background,/linear-gradient/); assert.equal(selected['border-radius'],'12px');
    assert.ok(contrast(selected.color, '#950020') >= 4.5); const name=element('span',{class:'OwnerClientHub_clientName'},row),id=element('code',{},name); assert.ok(contrast(compute(id).color,'#950020')>=4.5); row.states.add('focus-visible'); assert.match(compute(row).outline,/2px solid/);
    for (const variant of ['primary', 'secondary', 'danger']) {
      const action = element('button', { class: `OwnerButton_button OwnerButton_${variant}`, 'data-owner-button': '' }, root);
      const css = compute(action); assert.equal(css['border-radius'], '10px'); assert.equal(css['min-height'], '42px'); assert.ok(contrast(css.color, css['background-color']) >= 4.5);
    }
  }
});

test('Client Hub stacks before owner sidebar constrains the detail pane and prevents long identity overflow', () => {
  for (const sheets of [[...base, hub], [hub, ...base]]) {
    const { root } = fixture('light'), workspace = element('div', { class: 'OwnerClientHub_workspace' }, root), identity = element('div', { class: 'OwnerClientHub_identity' }, root), code = element('code', {}, element('div', {}, identity)), secret = element('code', {}, element('div', { class: 'OwnerClientHub_credential' }, root));
    assert.match(cascade(sheets, 1280)(workspace)['grid-template-columns'], /minmax/);
    for (const width of [900, 800, 650, 375]) assert.equal(cascade(sheets, width)(workspace)['grid-template-columns'], '1fr');
    assert.equal(cascade(sheets, 375)(identity)['flex-direction'], 'column');
    for (const target of [code, secret]) assert.equal(cascade(sheets, 375)(target)['overflow-wrap'], 'anywhere');
    const form = element('fieldset', { class: 'OwnerClientHub_form' }, root); assert.equal(cascade(sheets, 375)(form)['grid-template-columns'], '1fr');
  }
});

test('inputs and shared status combobox preserve readable owner theme without public navigation styling', () => {
  for (const mode of ['light', 'dark']) for (const sheets of [[...base, hub], [hub, ...base]]) {
    const { root } = fixture(mode), compute = cascade(sheets), form = element('fieldset', { class: 'OwnerClientHub_form' }, root), label = element('label', {}, form), input = element('input', {}, label);
    const inputCss = compute(input); assert.ok(contrast(inputCss.color, inputCss['background-color']) >= 4.5); assert.equal(inputCss['border-radius'], '9px');
    const field = element('div', { class: 'OwnerPortal_field OwnerPortal_ownerSelect' }, form), selectRoot = element('div', { class: 'SiteSelect_root' }, field), control = element('button', { class: 'SiteSelect_control', role: 'combobox' }, selectRoot);
    assert.ok(contrast(compute(control).color, compute(control)['background-color']) >= 4.5); assert.equal(compute(field).margin, '0');
  }
});

test('access and commission badges retain distinct readable colors despite legacy owner dark rules', () => {
  const colors = new Map();
  for (const mode of ['light', 'dark']) for (const sheets of [[...base, hub], [hub, ...base]]) {
    const { root } = fixture(mode), compute = cascade(sheets);
    for (const [kind, values] of [['access', ['active', 'suspended']], ['status', ['queued', 'in-progress', 'on-hold', 'delayed', 'completed', 'shipped', 'delivered']]]) for (const value of values) {
      const badge = element('span', { class: 'OwnerClientHub_badge', [`data-${kind}`]: value }, root), css = compute(badge);
      assert.ok(contrast(css.color, css['background-color']) >= 4.5, `${mode} ${value} readable`);
      if (kind === 'status' && mode === 'light') colors.set(value, css['background-color']);
      if (kind === 'access') assert.notEqual(css['background-color'], compute(element('span', { class: 'OwnerClientHub_badge', 'data-access': value === 'active' ? 'suspended' : 'active' }, root))['background-color']);
    }
  }
  assert.equal(new Set(colors.values()).size, 7, 'each commission status has its own color');
});

test('small add control, real stat buttons and studio callout remain readable at mobile widths', () => {
  for (const mode of ['light', 'dark']) {
    const { root } = fixture(mode), compute = cascade([...base, hub], 375);
    const add = element('button', { class: 'OwnerButton_button OwnerButton_primary OwnerButton_compact OwnerClientHub_addClient', 'data-owner-button': '' }, root);
    assert.equal(compute(add)['min-height'], '42px', 'mobile keeps a usable tap target');
    assert.equal(cascade([...base, hub], 1280)(add)['min-height'], '36px');
    const stats = element('div', { class: 'OwnerClientHub_studioStats' }, root), active = element('button', { 'aria-pressed': 'true', 'data-owner-button': '' }, stats), idle = element('button', { 'aria-pressed': 'false', 'data-owner-button': '' }, stats);
    if(mode==='dark'){assert.equal(compute(active)['background-color'],'#2c2c2d');assert.notEqual(compute(active)['border-color'],compute(idle)['border-color']);}else assert.notEqual(compute(active)['background-color'],compute(idle)['background-color']);
    assert.ok(contrast(compute(active).color, compute(active)['background-color']) >= 4.5);
    const callout = element('div', { class: 'OwnerClientHub_studioCallout' }, stats), copy = element('p', {}, callout);
    assert.equal(compute(callout).display, 'flex'); assert.ok(contrast(compute(copy).color, compute(callout)['background-color']) >= 4.5);
  }
});

test('Fox9 directory heading keeps Add beside far-right Refresh in both themes and stylesheet orders',()=>{
 for(const mode of ['light','dark'])for(const width of [320,390,768,1176,1440])for(const sheets of [[...base,hub],[hub,...base]]){
  const {root}=fixture(mode),directory=element('section',{class:'OwnerClientHub_directory'},root),heading=element('div',{class:'OwnerClientHub_sectionHeading'},directory),actions=element('div',{class:'OwnerClientHub_directoryActions'},heading),refresh=element('button',{class:'OwnerButton_button OwnerButton_secondary OwnerButton_compact OwnerClientHub_refreshRound','data-owner-button':''},actions),get=cascade(sheets,width);
  assert.equal(get(heading)['flex-wrap'],width<380?'wrap':'nowrap');
  assert.equal(get(actions)['margin-left'],'auto'); assert.equal(get(actions)['flex-wrap'],'nowrap');
  assert.equal(get(refresh).margin,'0');assert.equal(get(refresh).flex,'0 0 40px');assert.equal(get(refresh)['border-radius'],'50%');
  assert.equal(get(actions).padding,'0');
 }
});

test('Fox9 busy client cards retain theme and selected state instead of flashing white',()=>{
 for(const mode of ['light','dark'])for(const sheets of [[...base,hub],[hub,...base]]){
  const {root}=fixture(mode), row=element('button',{class:'OwnerClientHub_clientRow','aria-pressed':'false','data-owner-button':'',disabled:''},root),get=cascade(sheets);
  row.states.add('disabled');
  if(mode==='dark')assert.match(get(row).background,/linear-gradient/);else assert.equal(get(row).background,'transparent');
  const idleColor=get(row).color;
  row.attrs['aria-pressed']='true';
  assert.match(get(row).background,mode==='dark'?/linear-gradient/:/color-mix/);
  assert.equal(get(row).color,idleColor);
  assert.ok(contrast(get(row).color,mode==='dark'?'#690014':mixedColor(get(row).background))>=4.5);
 }
});
