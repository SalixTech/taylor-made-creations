import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { cascade, contrast, element } from './helpers/css-cascade.mjs';
import { harness, nodes, content } from './owner-ui-harness.mjs';
const require = createRequire(import.meta.url);
const local = require('next/dist/compiled/postcss-modules-local-by-default');
const scope = require('next/dist/compiled/postcss-modules-scope');
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
async function compile(name) { return (await postcss([local(), scope({ generateScopedName: key => `${name}_${key}` })]).process(read(`src/owner/${name}.module.css`), { from: `${name}.module.css` })).css; }
const owner = await compile('OwnerPortal'), managers = await compile('OwnerTemplateManagers');
const css = [read('src/app/globals.css'), read('src/app/color-modes.css'), owner, managers];
test('actual owner badge classes retain readable backgrounds in both modes and stylesheet orders', () => {
  for (const mode of ['light','dark']) for (const sheets of [css, [owner, managers, css[0], css[1]]]) {
    const root = element('div', {'data-owner-portal':'', 'data-color-mode':mode});
    const compute = cascade(sheets);
    for (const classes of ['OwnerPortal_badge', 'OwnerPortal_badge OwnerPortal_badgeVisible']) {
      const badge = element('span', {class:classes}, root), style=compute(badge);
      assert.ok(contrast(style.color,style['background-color']) >=4.5, `${mode}: ${style.color} on ${style['background-color']}`);
      if(mode==='dark') assert.notEqual(style['background-color'],'#f2f0f1');
    }
    const manager = element('section', {class:'Inventory_manager'}, root);
    assert.ok(!compute(manager)['background-color'] || compute(manager)['background-color']==='transparent');
    const card = element('section',{class:'OwnerPortal_card'},manager);
    if(mode==='dark') assert.equal(compute(card)['background-color'],'#242426');
  }
});
test('contacts collapse as a section without discarding editor and save callbacks', () => {
  const h=harness(), defaults=h.load('src/owner/defaults.ts').createDefaultOwnerContent;
  const Manager=h.load('src/owner/OwnerTemplateManagers.tsx').ContactSettingsManager;
  h.render(Manager,{content:defaults(),onEdit(){},onRemove(){}});
  const section=h.find(n=>n.type==='details' && content(n).includes('Where people can find you'));
  assert.ok(section); assert.equal(nodes(section).find(n=>n.type==='summary').props.children,'Where people can find you');
  assert.ok(nodes(section).some(n=>n.type?.name==='OwnerSocialLinksEditor'));
  assert.ok(nodes(section).some(n=>n.type?.name==='SettingsCardActions' && n.props.card==='contacts'));
  h.unmount();
});
test('social fields compact into one desktop row and wrap on small screens, footer deletion stays right aligned',()=>{
  const root=element('div'), fields=element('div',{class:'OwnerTemplateManagers_socialFields'},root);
  const label=element('label',{class:'OwnerPortal_field'},fields);
  assert.equal(cascade(css,1280)(fields)['grid-template-columns'],'minmax(0,1fr) minmax(0,1fr) minmax(0,1.5fr)');
  assert.equal(cascade(css,375)(fields)['grid-template-columns'],'1fr');
  assert.equal(cascade(css)(label)['margin-bottom'],'10px');
  const footer=element('div',{class:'OwnerTemplateManagers_listingFooter'},root);
  assert.equal(cascade(css)(footer)['justify-content'],'flex-end');
});
