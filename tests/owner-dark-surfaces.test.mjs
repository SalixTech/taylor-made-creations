import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { harness } from './owner-ui-harness.mjs';
const require = createRequire(import.meta.url);
const local = require('next/dist/compiled/postcss-modules-local-by-default');
const scope = require('next/dist/compiled/postcss-modules-scope');

// Actual Next CSS-module compilation + component/token contracts. This is not
// a substitute for browser computed-style or screenshot verification.
async function compile(name) {
  const result = await postcss([local(), scope({ generateScopedName: key => `${name}_${key}` })]).process(fs.readFileSync(new URL(`../src/owner/${name}.module.css`, import.meta.url), 'utf8'), { from: `${name}.module.css` });
  const classes = {}, rules = [];
  result.root.walkRules(rule => {
    if (rule.selector === ':export') rule.walkDecls(decl => classes[decl.prop] = decl.value);
    else rules.push(rule);
  });
  return { classes, rules };
}
const property = (rule, name) => rule.nodes.find(node => node.type === 'decl' && node.prop === name)?.value;
const declarations = rule => Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
const global = postcss.parse(fs.readFileSync(new URL('../src/app/color-modes.css', import.meta.url), 'utf8'));
let palette;
global.walkRules(rule => { if (rule.selector === '[data-owner-portal][data-color-mode="dark"]') palette = declarations(rule); });
function resolve(value, tokens = palette) {
  if (!value.startsWith('var(')) return value;
  const [,name,fallback] = value.match(/^var\((--[\w-]+)(?:,\s*([^)]*))?\)$/);
  return resolve(tokens[name] ?? fallback, tokens);
}
function luminance(hex) {
  let value = hex.replace('#',''); if(value.length===3) value = [...value].map(v=>v+v).join('');
  return [0,2,4].map(i=>parseInt(value.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
}
function contrast(a,b) { const x=luminance(resolve(a)),y=luminance(resolve(b)); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }

test('dark surfaces compile against the exact classes used by text blocks and appearance controls', async () => {
  const portal = await compile('OwnerPortal'), design = await compile('OwnerDesignPanel');
  const h = harness();
  for(const [name,module] of [['OwnerPortal',portal],['OwnerDesignPanel',design]]) h.overrides[`./${name}.module.css`] = {__esModule:true,default:module.classes};
  const page = h.load('src/owner/defaults.ts').createDefaultOwnerContent().pages[0];
  page.blocks = [{ id:'text', type:'text', heading:'', body:'Your text goes here.' }];
  h.render(h.load('src/owner/OwnerBlocksEditor.tsx').OwnerBlocksEditor, {page, onEdit(){}, onRemove(){}});
  assert.ok(h.find(node => node.props.className === portal.classes.block));
  h.hooks=[]; h.render(h.load('src/owner/OwnerAppearancePanel.tsx').OwnerAppearancePanel,{onEdit(){},onReset(){}});
  assert.equal(h.tree.props.className,design.classes.appearance);
  for(const [module,key] of [[portal,'block'],[design,'appearance']]) {
    const base=module.rules.find(rule=>rule.selector===`.${module.classes[key]}`);
    assert.equal(property(base,'background'),'var(--owner-surface, #fff)');
    assert.equal(resolve(property(base,'background')),'#241f24');
    assert.equal(resolve(property(base,'background'),{}),'#fff','light-mode fallback stays white');
    assert.ok(contrast(palette['--owner-ink'],resolve(property(base,'background')))>=4.5);
    assert.ok(contrast(palette['--owner-muted'],resolve(property(base,'background')))>=4.5);
  }
  h.unmount();
});

test('dark action palette has distinct primary, secondary, hover and disabled rules plus readable control borders', async () => {
  const portal=await compile('OwnerPortal');
  const ruleFor=key=>portal.rules.find(rule=>rule.selector.includes('[data-color-mode="dark"]')&&rule.selector.includes(`.${portal.classes[key]}:is(:enabled, :disabled`));
  const primary=ruleFor('primary'),secondary=ruleFor('secondary'),danger=ruleFor('danger');
  assert.ok(primary&&secondary&&danger);
  assert.match(primary.selector,/:any-link/,'routed primary anchors keep the action treatment');
  for(const rule of [primary,secondary,danger]) {
    assert.ok(contrast(property(rule,'color'),property(rule,'background-color'))>=4.5);
    assert.ok(rule.nodes.filter(node=>node.type==='decl'&&['color','border-color','background-color'].includes(node.prop)).every(node=>node.important));
  }
  assert.notEqual(property(primary,'background-color'),property(secondary,'background-color'));
  const hover=portal.rules.find(rule=>rule.selector.includes(`.${portal.classes.primary}:is(:enabled, :any-link):hover`));
  assert.notEqual(property(hover,'background-color'),property(primary,'background-color'));
  assert.ok(contrast(property(primary,'color'),property(hover,'background-color'))>=4.5);
  const tokens=portal.rules.find(rule=>rule.selector===`.${portal.classes.portal}[data-owner-portal][data-color-mode="dark"]`);
  assert.ok(contrast(property(tokens,'--owner-control-line'),palette['--owner-raised'])>=3);
  assert.equal(property(tokens,'--owner-art-backplane'),'#3a3038');
  const text=portal.rules.find(rule=>rule.selector.includes(`.${portal.classes.textButton}`)&&rule.selector.endsWith(':is(:enabled, :disabled)'));
  assert.equal(property(text,'background-color'),'transparent');
  assert.ok(contrast(property(text,'color'),palette['--owner-surface'])>=4.5);
});
