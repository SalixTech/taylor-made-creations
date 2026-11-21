import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { harness, nodes, content } from './owner-ui-harness.mjs';
import { cascade, element } from './helpers/css-cascade.mjs';
const require=createRequire(import.meta.url), local=require('next/dist/compiled/postcss-modules-local-by-default'),scope=require('next/dist/compiled/postcss-modules-scope');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const compile=async(folder,name)=>(await postcss([local(),scope({generateScopedName:key=>`${name}_${key}`})]).process(read(`src/${folder}/${name}.module.css`),{from:`${name}.module.css`})).css;
const [form,editor,portal,settings,intake]=await Promise.all([compile('components','CommissionForm'),compile('owner','CommissionFormEditor'),compile('owner','OwnerPortal'),compile('owner','OwnerTemplateManagers'),compile('intake','Intake')]);
const base=[read('src/app/globals.css'),read('src/app/color-modes.css'),portal];

test('Fox8 actual form output gives country, suit and custom combobox labels their own spacing class',()=>{
 const h=harness();h.overrides['./PublicSiteContext']={usePublicSiteState:()=>({status:'unpublished'})};
 const C=h.load('src/components/CommissionForm.tsx').default;
 h.render(C,{configuration:{customQuestions:[{id:'extra-choice',section:'contact',label:'Accent',type:'select',required:false,options:[{id:'one',label:'One'}]}]},visualEditor:{renderSections:items=>items.map(i=>i.node),renderQuestions:(_section,items)=>items.map(i=>i.node)}});
 for(const id of ['country','suit','extra-choice']){
  const question=h.find(n=>n.props['data-commission-question']===id);assert.ok(question,id);
  const field=nodes(question).find(n=>n.type==='div'&&n.props.className?.split(' ').includes('selectField'));
  assert.ok(field,`${id} actual field owns the select spacing class`);assert.ok(nodes(field).some(n=>n.type==='label'));
 }
 h.unmount();
});

test('Fox8 nested country/suit label spacing survives builder, public and reverse stylesheet order',()=>{
 for(const owner of [false,true])for(const mode of ['light','dark'])for(const width of [320,390,768,1440])for(const sheets of [[...base,editor,form],[form,editor,...base]]){
  const root=element('div',owner?{'data-owner-portal':'','data-color-mode':mode}:{'data-theme-scope':'public','data-color-mode':mode});
  const section=element('section',{class:'CommissionForm_form'},root),surface=element('div',{class:'CommissionFormEditor_questionSurface'},section),question=element('div',{'data-commission-question':'country'},surface),field=element('div',{class:'CommissionForm_field CommissionForm_selectField'},question),label=element('label',{},field),control=element('div',{class:'SiteSelect_root'},field),get=cascade(sheets,width);
  assert.equal(get(label).margin,'0 0 10px');assert.equal(get(control)['margin-top'],'0');
 }
});

test('Fox8 commission settings saves are in the lower action row before editing tools, never in heading',()=>{
 const h=harness(),C=h.load('src/owner/OwnerTemplateManagers.tsx').ContactSettingsManager,draft=h.load('src/owner/defaults.ts').createDefaultOwnerContent();
 h.render(C,{content:draft,onEdit(){},onRemove(){},onEditCommissionForm(){},onSync(){},userEmail:'qa@example.test',canSaveSettingsDraft:true,canSaveSettingsLive:true,onSaveSettingsCard:async()=>true});
 const card=h.find(n=>n.type?.name==='Card'&&n.props.title==='Commission form');assert.ok(card);assert.equal(card.props.action,undefined);
 const row=nodes(card).find(n=>n.props.className==='commissionFormActions'),items=nodes(row),save=items.find(n=>n.type?.name==='SettingsCardActions');assert.ok(save);assert.equal(save.props.card,'commission-form');assert.equal(save.props.inline,true);
 assert.ok(items.indexOf(save)<items.findIndex(n=>n.type==='button'&&content(n)==='Edit Form'));
 h.unmount();
});

test('Fox8 lower-left save group has no divider and safely wraps at narrow widths in both themes',()=>{
 for(const mode of ['light','dark'])for(const width of [320,390,768,1440])for(const sheets of [[...base,settings],[settings,...base]]){
  const root=element('div',{'data-owner-portal':'','data-color-mode':mode,class:'OwnerPortal_portal'}),row=element('div',{class:'OwnerTemplateManagers_commissionFormActions'},root),save=element('div',{class:'OwnerTemplateManagers_settingsSave OwnerTemplateManagers_settingsSaveInline'},row),tools=element('div',{class:'OwnerTemplateManagers_commissionFormEditActions'},row),get=cascade(sheets,width);
  assert.equal(get(save).border,'0');assert.equal(get(save).padding,'0');assert.equal(get(save).margin,'0');
  assert.equal(get(row)['justify-content'],'space-between');assert.equal(get(tools)['margin-left'],width<=560?'0':'auto');
 }
});

test('Fox8 recovery form and inputs blend with their card rather than generic dark form background',()=>{
 for(const mode of ['light','dark'])for(const sheets of [[...base,intake],[intake,...base]]){
  const root=element('div',{'data-theme-scope':'public','data-color-mode':mode}),card=element('section',{class:'Intake_card'},root),form=element('form',{class:'Intake_form'},card),fieldset=element('fieldset',{},form),input=element('input',{},fieldset),textarea=element('textarea',{},fieldset),get=cascade(sheets);
  for(const node of [form,fieldset,input,textarea])assert.equal(get(node)['background-color'],'transparent',`${mode}/${node.tag}`);
 }
});

test('Fox8 top bar puts recovery help before notification bell in DOM/keyboard order',()=>{
 const source=read('src/owner/OwnerPortal.tsx'),topbar=source.slice(source.indexOf('<div className={styles.topbarActions}>'),source.indexOf('</header>',source.indexOf('<div className={styles.topbarActions}>')));
 // The beta-only More menu has its own Drafts action. Verify the unchanged
 // main-owner branch, not the lexical order of both mutually exclusive shells.
 const mainStart=topbar.indexOf('</> : <>{fullPageBuilder &&');
 assert.ok(mainStart>=0,'main-owner topbar branch is present');
 const mainTopbar=topbar.slice(mainStart),help=mainTopbar.indexOf('Workspace help and draft recovery'),bell=mainTopbar.indexOf('<HubNotificationBell'),drafts=mainTopbar.indexOf('>Drafts</button>');
 assert.ok(help>=0&&bell>=0&&drafts>=0,'main help, notification bell and Drafts all remain present');
 assert.ok(help<bell,'main recovery help precedes the notification bell');
 assert.ok(bell<drafts,'main notification bell precedes Drafts');
});

test('Fox8 pop-out hint uses an accessible SVG rather than a missing font glyph',()=>{
 const source=read('src/client-hub/HubWorkspaceWindow.tsx');
 assert.match(source,/Pop out to new window<svg aria-hidden="true"/);
 assert.doesNotMatch(source,/Pop out to new window ↗/);
});

test('earlier SS6 decorative card arrows stay removed without changing their navigation',()=>{
 const portal=read('src/owner/OwnerPortal.tsx');
 for(const name of ['quickGrid','hubLinks']){
  const start=portal.indexOf(`<div className={styles.${name}}>`), section=portal.slice(start,portal.indexOf('</div>\n',start));
  assert.ok(start>=0);assert.doesNotMatch(section,/[›→]/);
  assert.match(section,/href=\{ownerDestinationHref/);assert.match(section,/onClick=\{event => navigate/);
 }
 const builder=read('src/owner/OwnerVisualBuilder.tsx'),start=builder.indexOf('<div className={styles.sectionDirectory}>'),section=builder.slice(start,builder.indexOf('</div>',start));
 assert.doesNotMatch(section,/[›→]/);assert.match(section,/onClick=\{\(\) => choose\(`block:\$\{item.id\}`,undefined,false,\{scope:"page",id:`block:\$\{item.id\}`}\s*\)\}/);
 assert.match(section,/onClick=\{\(\) => choose\("sections"\)\}/);
 // Meaningful CTA/external-window icons and disclosure/navigation controls remain separate.
 assert.match(portal,/Manage my pages <span aria-hidden="true">→<\/span>/);
});
