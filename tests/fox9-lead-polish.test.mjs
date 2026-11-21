import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness,content} from './owner-ui-harness.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Fox9 refresh updates check time while preserving the real saved time and private draft',async()=>{
 const h=harness();h.overrides['./HelpButton']={HelpButton:()=>null};h.overrides['./TaylorServices']={TaylorServices:()=>null};h.overrides['./CommissionRequests']={CommissionRequests:()=>null};let now='2026-10-28T18:00:00.000Z';const NativeDate=Date;
 h.globals.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[now]));} static now(){return new NativeDate(now).getTime();}};
 const raw=h.load('src/owner/defaults.ts').createInitialOwnerWorkspace();raw.updatedAt='2026-10-28T10:00:00.000Z';raw.revision=1;let fail=false;
 const store={load:async()=>{if(fail)throw Error('Offline');return structuredClone(raw);},subscribe:()=>()=>{}};
 const C=h.load('src/owner/OwnerPortal.tsx').default,props={store,mode:'cloud',userEmail:'qa@example.test',onSignOut:async()=>{}};
 const render=()=>h.render(C,props);render();await flush();render();
 let text=content(h.tree);assert.match(text,/Cloud checked ·/);assert.match(text,/Website draft saved ·/);
 const before=h.find(n=>n.type==='div'&&n.props.className==='saveState');const initial=content(before);
 now='2026-10-28T18:12:00.000Z';h.find(n=>n.props['aria-label']==='Sync cloud draft').props.onClick();await flush();render();
 text=content(h.find(n=>n.type==='div'&&n.props.className==='saveState'));assert.notEqual(text,initial);assert.equal(raw.updatedAt,'2026-10-28T10:00:00.000Z');
 const accepted=text;fail=true;now='2026-10-28T18:20:00.000Z';h.find(n=>n.props['aria-label']==='Sync cloud draft').props.onClick();await flush();render();
 assert.equal(content(h.find(n=>n.type==='div'&&n.props.className==='saveState')),accepted);h.unmount();
});

test('Fox9 saved gallery photo has shared outline pencil and multiline description',()=>{
 const h=harness(),C=h.load('src/owner/OwnerTemplateManagers.tsx').PhotoGalleryManager;
 const draft=h.load('src/owner/defaults.ts').createDefaultOwnerContent();h.render(C,{content:draft,onEdit(){},onRemove(){},onSavePhotos(){}});
 const Pencil=h.load('src/components/PencilIcon.tsx').PencilIcon;const icon=Pencil({});assert.equal(icon.type,'svg');assert.equal(icon.props.stroke,'currentColor');assert.match(read('src/owner/OwnerTemplateManagers.tsx'),/onClick=\{\(\) => setEditing\(photo.id\)\}><PencilIcon/);assert.doesNotMatch(read('src/owner/OwnerTemplateManagers.tsx'),/✎/);
 const source=read('src/owner/OwnerFields.tsx');assert.match(source,/<Field label="Photo description" multiline/);assert.match(read('src/owner/OwnerPortal.module.css'),/\.field textarea \{ resize: vertical/);h.unmount();
});

test('Fox9 builder history stays beside Add Item and separate from Save actions',()=>{
 const source=read('src/owner/OwnerVisualBuilder.tsx'),start=source.indexOf('<div className={styles.sectionHistoryActions}>'),end=source.indexOf('canvasBoxes.length',start),group=source.slice(start,end);
 assert.ok(group.includes('>Undo</button>'));assert.ok(group.includes('>Add Item</button>'));assert.ok(group.indexOf('>Undo</button>')<group.indexOf('>Add Item</button>'));assert.ok(group.includes('>Redo</button>'));
 const saveStart=source.indexOf('<div className={styles.builderSaveActions}>'),moreStart=source.indexOf('<details className={styles.moreControls}>');
 assert.ok(saveStart>start&&moreStart>saveStart);assert.doesNotMatch(source.slice(saveStart,moreStart),/>Undo<|>Redo</);
 assert.match(group,/disabled=\{saveBusy \|\| uploadBusy \|\| !canUndo\}/);assert.match(group,/disabled=\{saveBusy \|\| uploadBusy \|\| !canRedo\}/);
});

test('Fox9 theme surface, compact recovery, independent options and collapsed Socials are explicit',()=>{
 assert.match(read('src/app/color-modes.css'),/\.studio-theme-settings \{ background:var\(--owner-surface,#fff\)/);
 assert.match(read('src/intake/Intake.module.css'),/max-width:520px/);assert.match(read('src/intake/Intake.module.css'),/textarea \{ resize:vertical/);
 assert.match(read('src/components/CommissionForm.module.css'),/\.additionalParts \{ align-items:start/);
 assert.doesNotMatch(read('src/owner/OwnerTemplateManagers.tsx'),/contactsSection\} open/);
 const source=read('src/owner/StudioPreferenceControls.tsx'),actions=source.slice(source.indexOf('<div className={ui.cooldownActions}>'),source.indexOf('</form>'));
 assert.ok(actions.includes('Save default interval'));assert.ok(actions.includes('Reset all update cooldowns'));
});


test('builder pseudo-element edit badges use the same outline pencil, never platform emoji',()=>{
 const css=readFileSync('src/owner/OwnerVisualBuilder.module.css','utf8');
 assert.doesNotMatch(css,/✎|✏/); assert.match(css,/m16 3 5 5-12 12-6 1 1-6L16 3Z/);
});
