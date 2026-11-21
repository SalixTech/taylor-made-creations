import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, content } from './owner-ui-harness.mjs';
import { sourceLoader } from './scout-source-loader.mjs';
const { DEFAULT_HUB_MILESTONES, validateHubMilestones }=sourceLoader()('src/client-hub/model.ts');

test('shared milestone editor uses themed buttons and editable names without changing lifecycle meanings',()=>{
 const h=harness(),Editor=h.load('src/owner/HubMilestoneEditor.tsx').HubMilestoneEditor;
 let value=DEFAULT_HUB_MILESTONES.map(node=>({...node}));const render=()=>h.render(Editor,{value,onChange:next=>{value=next;}});render();
 for(const button of h.all(node=>node.type==='button')) assert.equal(button.props['data-owner-button'],true,content(button));
 assert.equal(h.all(node=>node.type==='button'&&node.props['aria-label']?.startsWith('Remove ')).length,5);
 h.find(node=>node.props['aria-label']==='Node 3 name').props.onChange({target:{value:'BURNED'}});render();
 assert.equal(value[2].id,'completed');assert.equal(value[2].status,'completed');assert.equal(value[2].label,'BURNED');
 validateHubMilestones(value);
 h.find(node=>node.type==='button'&&content(node)==='Add milestone').props.onClick();render();
 assert.equal(value.at(-1).label,'New milestone');
 const added=value.at(-1).id;h.find(node=>node.type==='button'&&node.props['aria-label']==='Remove New milestone').props.onClick();
 assert.equal(value.some(node=>node.id===added),false);validateHubMilestones(value);
 value=value.slice(0,3);render();for(const control of h.all(node=>node.type==='button'&&node.props['aria-label']?.startsWith('Remove ')))assert.equal(control.props.disabled,true);h.unmount();
});

test('disabled milestone editor disables its native controls and keeps semantic anchor values',()=>{
 const h=harness(),Editor=h.load('src/owner/HubMilestoneEditor.tsx').HubMilestoneEditor;h.render(Editor,{value:DEFAULT_HUB_MILESTONES,onChange(){assert.fail('disabled render must not mutate');},disabled:true});
 assert.equal(h.tree.props.disabled,true);for(const control of h.all(node=>['button','input'].includes(node.type)))assert.equal(control.props.disabled,true);h.unmount();
});

test('Fox8 deletes commission percentage bar rendering and stripe CSS, preserving transfer progress controls',()=>{
 for(const file of ['src/owner/OwnerClientHub.tsx','src/client-hub/ProjectWorkspace.tsx','src/client-hub/ClientDashboard.tsx'])assert.doesNotMatch(readFileSync(file,'utf8'),/HubProgress|progressbar|Workspace open below/);
 const h=harness(),Retired=h.load('src/client-hub/HubProgress.tsx').HubProgress;for(const value of [null,0,50,100]){h.render(Retired,{value,label:'Retired bar'});assert.equal(h.tree,null);}h.unmount();assert.doesNotMatch(readFileSync('src/client-hub/HubProgress.module.css','utf8'),/repeating-linear-gradient|progressbar|@keyframes/);
 const work=readFileSync('src/client-hub/ProjectWorkspace.tsx','utf8');assert.match(work,/aria-current=\{index === activeStage \? "step"/);assert.match(work,/visibleStages\.map/);
 assert.doesNotMatch(readFileSync('src/client-hub/ProjectWorkspace.module.css','utf8'),/animatedTrack|repeating-linear-gradient|hub-progress-stripes/);
 assert.match(readFileSync('src/client-hub/MakerChatAttachments.tsx','utf8'),/<progress.*File transfer progress/);
});

test('milestone layout has a shared control baseline and its own field theme in both dialog contexts',()=>{
 const css=readFileSync('src/owner/HubMilestoneEditor.module.css','utf8');
 assert.match(css,/\.row \{[^}]*align-items:end/);assert.match(css,/\.stage > div \{[^}]*margin:0/);
 assert.match(css,/\.name input \{[^}]*height:44px/);assert.match(css,/\.stage \[role=combobox\] \{[^}]*height:44px/);
 assert.match(css,/\.visibility input \{[^}]*accent-color:var\(--owner-button-primary-bg/);
 assert.match(css,/@media\(max-width:520px\)/);
});


test('five ordinary milestones fit narrow inline cards while custom overflow remains keyboard accessible',()=>{
 const css=readFileSync('src/client-hub/ProjectWorkspace.module.css','utf8'),source=readFileSync('src/client-hub/ProjectWorkspace.tsx','utf8');
 assert.match(css,/\.milestones>div \{ flex:1 0 56px; min-width:56px/);assert.doesNotMatch(css,/flex:1 0 95px/);
 assert.match(css,/\.milestones small \{[^}]*overflow-wrap:anywhere/);assert.match(source,/className=\{styles.milestones\} role="region" aria-label="Commission milestones" tabIndex=\{0\}/);
 const desktopMinimum=5*56+4*8,smallMinimum=5*56+4*4;assert.ok(desktopMinimum<=420);assert.ok(smallMinimum<=300);
});

test('photo-upload fields use their existing grid gap instead of extra inherited label margins',()=>{
 const css=readFileSync('src/client-hub/ProjectWorkspace.module.css','utf8');assert.match(css,/\.workspace \.uploadForm > label \{ margin:0; \}/);assert.match(css,/\.uploadForm[^}]*gap:14px/);
});
