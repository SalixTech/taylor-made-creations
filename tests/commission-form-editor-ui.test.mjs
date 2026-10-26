import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content, nodes } from './owner-ui-harness.mjs';
function fixture(callbacks={}){
 const h=harness(),defaults=h.load('src/owner/defaults.ts'),model=h.load('src/owner/model.ts');
 const configuration=h.load('src/components/commission-form-config.ts');
 const {CommissionFormEditor:Editor,reorderCommissionIds}=h.load('src/owner/CommissionFormEditor.tsx');
 let draft=defaults.createDefaultOwnerContent(),edits=0;
 const initial=structuredClone(draft);
 const render=()=>h.render(Editor,{content:draft,onEdit(change){draft=structuredClone(draft);change(draft);edits++;},...callbacks});
 const rendered=()=>[...nodes(h.tree),...(!preview()?.props.visualEditor?[]:configuration.COMMISSION_SECTIONS.flatMap(section=>{const q=questions(section.id),sec=sections();return [...q.props.items.flatMap(item=>nodes(q.props.children(item,null))),...sec.props.items.flatMap(item=>nodes(sec.props.children(item,null)))];}))];
 const component=(name,label)=>(name==='CommissionForm'?nodes(h.tree):rendered()).find(node=>node.type?.name===name&&(label===undefined||node.props.label===label));
 const button=label=>rendered().find(node=>node.type==='button'&&content(node)===label);
 const choose=id=>{const field=configuration.COMMISSION_FIELDS.find(item=>item.id===id)||draft.commissionForm.customQuestions.find(item=>item.id===id);const list=questions(field.section),card=list.props.children(list.props.items.find(item=>item.id===id),null);nodes(card).find(node=>node.props.onClickCapture).props.onClickCapture({preventDefault(){},stopPropagation(){}});render();};
 const selectSection=id=>{const list=sections(),card=list.props.children(list.props.items.find(item=>item.id===id),null);nodes(card).find(node=>node.type==='button').props.onClick();render();};
 const preview=()=>component('CommissionForm');
 const questions=section=>preview().props.visualEditor.renderQuestions(section,configuration.getCommissionQuestionOrder(draft.commissionForm,section).map(id=>({id,node:{type:'span',props:{children:id}}})));
 const sections=()=>preview().props.visualEditor.renderSections(configuration.getCommissionSectionOrder(draft.commissionForm).map(id=>({id,node:{type:'span',props:{children:id}}})));
 render();choose('email');return {h,model,configuration,initial,render,component,button,choose,selectSection,preview,questions,sections,reorderCommissionIds,get draft(){return draft;},get edits(){return edits;}};
}
test('visual editor opens actual private form renderer without edits or public configuration fallback',()=>{
 const t=fixture();assert.equal(t.edits,0);assert.equal(t.draft.commissionForm,undefined);
 assert.equal(t.preview().props.previewContent,t.draft);assert.deepEqual(t.preview().props.configuration,{});
 assert.ok(t.preview().props.visualEditor);assert.equal(t.component('Field','Question wording').props.value,'Email address');
 assert.equal(t.component('Toggle','Require an answer').props.checked,true);assert.equal(t.button('Move question up'),undefined);
 assert.equal(t.button('Move section down'),undefined);assert.equal(t.button('Remove custom question'),undefined);t.h.unmount();
});
test('all built-in requirements edit directly while wording resets preserve requirement choices',()=>{
 const t=fixture();for(const field of t.configuration.COMMISSION_FIELDS){t.selectSection(field.section);t.choose(field.id);t.component('Toggle','Require an answer').props.onChange(!field.required);t.render();assert.equal(t.draft.commissionForm.fields[field.id].required,!field.required);}
 t.selectSection('contact');t.choose('email');t.component('Field','Question wording').props.onChange('Your email');t.render();
 t.button('Reset question wording').props.onClick();t.render();assert.equal(t.draft.commissionForm.fields.email.required,false);assert.equal(t.component('Field','Question wording').props.value,'Email address');
 assert.deepEqual(t.draft.site,t.initial.site);assert.deepEqual(t.draft.pages,t.initial.pages);assert.doesNotThrow(()=>t.model.assertOwnerContent(t.draft));t.h.unmount();
});
test('preview section/question drag commits stable order; keyboard steps use the same draft-only boundary',()=>{
 const t=fixture();t.questions('contact').props.onReorder('email','discord',true);t.render();assert.deepEqual(t.configuration.getCommissionQuestionOrder(t.draft.commissionForm,'contact').slice(0,3),['telegram','discord','email']);
 t.questions('contact').props.onStep('email',-1);t.render();assert.deepEqual(t.configuration.getCommissionQuestionOrder(t.draft.commissionForm,'contact').slice(0,3),['telegram','email','discord']);
 t.sections().props.onReorder('request','contact',false);t.render();assert.equal(t.draft.commissionForm.sectionOrder[0],'request');
 t.sections().props.onStep('request',1);t.render();assert.equal(t.draft.commissionForm.sectionOrder[1],'request');
 assert.equal(t.reorderCommissionIds(['a','b'],'missing','a',false).join(','),'a,b');assert.doesNotThrow(()=>t.model.assertOwnerContent(t.draft));t.h.unmount();
});
test('clicking a preview field opens its inline editor, including custom questions',()=>{
 const t=fixture();const list=t.questions('contact'),item=list.props.items.find(item=>item.id==='tos');
 const card=list.props.children(item,{type:'button',props:{children:'drag'}});
 nodes(card).find(node=>node.type==='button'&&node.props['aria-label']==='Edit Have you read the terms of service?').props.onClick();t.render();assert.equal(t.component('Field','Question wording').props.value,'Have you read the terms of service?');
 const surface=nodes(card).find(node=>node.props.onClickCapture);let prevented=false;surface.props.onClickCapture({preventDefault(){prevented=true;},stopPropagation(){}});assert.equal(prevented,true);
 t.selectSection('request');t.button('Add custom question').props.onClick();t.render();const id=t.draft.commissionForm.customQuestions[0].id;
 assert.equal(t.questions('request').props.items.some(item=>item.id===id),true);t.h.unmount();
});
test('custom questions keep stable options, drag option order, move sections and remove only after confirmation',()=>{
 const t=fixture();t.selectSection('request');t.button('Add custom question').props.onClick();t.render();const id=t.draft.commissionForm.customQuestions[0].id;
 t.component('Field','Question wording').props.onChange('Preferred finish');t.render();t.component('OwnerSelect','Answer format').props.onChange('select');t.render();
 t.component('Toggle','Require an answer').props.onChange(true);t.render();const options=structuredClone(t.draft.commissionForm.customQuestions[0].options);
 t.component('OwnerPriceReorderList','Answer options').props.onReorder(options[0].id,options[1].id,true);t.render();assert.deepEqual(t.draft.commissionForm.customQuestions[0].options,[options[1],options[0]]);
 t.component('OwnerSelect','Question section').props.onChange('character');t.render();assert.equal(t.draft.commissionForm.customQuestions[0].section,'character');
 t.questions('character').props.onStep(id,-1);t.render();t.button('Remove custom question').props.onClick();t.render();t.button('Keep question').props.onClick();t.render();assert.equal(t.draft.commissionForm.customQuestions.length,1);
 t.button('Remove custom question').props.onClick();t.render();t.button('Confirm remove question').props.onClick();t.render();assert.equal(t.draft.commissionForm.customQuestions.length,0);assert.equal(t.draft.commissionForm.questionOrder.character.includes(id),false);assert.doesNotThrow(()=>t.model.assertOwnerContent(t.draft));t.h.unmount();
});
test('form test mode removes editing hooks but retains private draft and can return to editing',()=>{
 const t=fixture();t.component('Field','Question wording').props.onChange('Private email wording');t.render();t.button('Test form').props.onClick();t.render();
 assert.equal(t.preview().props.visualEditor,undefined);assert.equal(t.preview().props.configuration.fields.email.label,'Private email wording');assert.equal(t.component('Field','Question wording'),undefined);
 t.button('Edit form').props.onClick();t.render();assert.ok(t.preview().props.visualEditor);assert.equal(t.component('Field','Question wording').props.value,'Private email wording');t.h.unmount();
});
test('explicit save controls invoke only selected callbacks and keep edits on failure',async()=>{
 let drafts=0,live=0;const t=fixture({onSaveDraft:async()=>{drafts++;return true;},onPublishLive:async()=>{live++;throw Error('offline');}});
 t.component('Field','Question wording').props.onChange('Private change');t.render();assert.equal(drafts,0);assert.equal(live,0);
 t.button('Save Draft').props.onClick();await new Promise(resolve=>setImmediate(resolve));t.render();assert.equal(drafts,1);assert.equal(live,0);assert.match(content(t.h.tree),/Form draft saved/);
 t.button('Publish Live').props.onClick();await new Promise(resolve=>setImmediate(resolve));t.render();assert.equal(live,1);assert.match(content(t.h.tree),/could not be saved/);assert.equal(t.draft.commissionForm.fields.email.label,'Private change');t.h.unmount();
});
test('builder disables drag and save while persistence is busy',()=>{const t=fixture({busy:true,onSaveDraft(){},onPublishLive(){}});assert.equal(t.button('Save Draft').props.disabled,true);assert.equal(t.button('Publish Live').props.disabled,true);assert.equal(t.questions('contact').props.disabled,true);assert.equal(t.sections().props.disabled,true);t.h.unmount();});

test('Settings opens dedicated form editor through navigation callback, never the old question popup',()=>{
 const h=harness(),draft=h.load('src/owner/defaults.ts').createDefaultOwnerContent();let navigations=0;
 const Manager=h.load('src/owner/OwnerTemplateManagers.tsx').ContactSettingsManager;
 const render=()=>h.render(Manager,{content:draft,onEdit(){throw Error('No edit on navigation');},onRemove(){},userEmail:'owner@example.test',onSync(){},onEditCommissionForm(){navigations++;}});
 render();h.find(node=>node.type==='button'&&content(node)==='Edit commission form').props.onClick();render();assert.equal(navigations,1);assert.equal(h.find(node=>node.type?.name==='CommissionFormEditor'),undefined);
 assert.equal(h.find(node=>node.type?.name==='Dialog'),undefined);
 h.find(node=>node.type==='button'&&content(node)==='Preview commission form').props.onClick();render();assert.equal(h.find(node=>node.type?.name==='Dialog').props.title,'Commission form preview');
 assert.deepEqual(h.find(node=>node.type?.name==='CommissionForm').props.configuration,{});h.unmount();
});

test('section and question controls belong to their card, toggle closed, and use complete themed buttons',()=>{
 const t=fixture({onSaveDraft(){},onPublishLive(){}});
 const card=()=>{const list=t.questions('contact');return list.props.children(list.props.items.find(item=>item.id==='email'),null);};
 const edit=()=>nodes(card()).find(node=>node.type==='button'&&node.props['aria-label']==='Edit Email address');
 assert.equal(edit().props['aria-expanded'],true);
 assert.equal(nodes(card()).filter(node=>node.props['data-commission-inline-editor']==='question').length,1);
 edit().props.onClick();t.render();assert.equal(edit().props['aria-expanded'],false);assert.equal(nodes(card()).some(node=>node.props['data-commission-inline-editor']),false);
 edit().props.onClick();t.render();assert.equal(edit().props['aria-expanded'],true);
 t.selectSection('request');const sectionCard=()=>{const list=t.sections();return list.props.children(list.props.items.find(item=>item.id==='request'),null);};
 assert.equal(nodes(sectionCard()).filter(node=>node.props['data-commission-inline-editor']==='section').length,1);
 t.selectSection('request');assert.equal(nodes(sectionCard()).some(node=>node.props['data-commission-inline-editor']),false);
 assert.equal(t.h.all(node=>node.type==='aside').length,0);
 for(const label of ['Test form','Save Draft','Publish Live'])assert.match(t.button(label).props.className,/\bbutton\b/);
 assert.match(edit().props.className,/\bbutton\b/);assert.equal(t.edits,0);t.h.unmount();
});

test('Enter inside an inline editor cannot submit or switch the real form into request review',()=>{
 const h=harness();h.overrides['./PublicSiteContext']={usePublicSiteState:()=>({status:'unpublished'})};const Form=h.load('src/components/CommissionForm.tsx').default;
 const draft=h.load('src/owner/defaults.ts').createDefaultOwnerContent();
 const props={previewContent:draft,configuration:{},visualEditor:{renderSections:items=>items.map(item=>item.node),renderQuestions:(_,items)=>items.map(item=>item.node)}};
 h.render(Form,props);let prevented=false;h.find(node=>node.type==='form').props.onSubmit({preventDefault(){prevented=true;}});
 assert.equal(prevented,true);h.render(Form,props);assert.ok(h.find(node=>node.type==='form'));assert.equal(h.find(node=>node.type==='button'&&content(node)==='Back to edit'),undefined);h.unmount();
});


test('question editing uses a top-right labelled pencil while section editing keeps its text button',()=>{
 const t=fixture();const questions=t.questions('contact'),item=questions.props.items.find(item=>item.id==='email'),card=questions.props.children(item,null);
 const pencil=nodes(card).find(n=>n.type==='button'&&n.props['aria-label']==='Edit Email address');
 assert.ok(pencil);assert.equal(content(pencil),'');assert.match(pencil.props.className,/editPencil/);assert.ok(nodes(pencil).some(n=>n.type==='svg'&&n.props['aria-hidden']==='true'));
 const sections=t.sections(),section=sections.props.children(sections.props.items[0],null);
 assert.ok(nodes(section).some(n=>n.type==='button'&&content(n)==='Edit section'));t.h.unmount();
});


test('section toolbar shows its current name and question cards rely on their native labels',()=>{
 const t=fixture();t.selectSection('contact');
 t.component('Field','Section heading').props.onChange('Contact Taylor');t.render();
 const sectionList=t.sections(),section=sectionList.props.children(sectionList.props.items.find(item=>item.id==='contact'),null);
 const heading=nodes(section).find(node=>node.type==='h3'&&content(node)==='Contact Taylor');assert.ok(heading);
 assert.ok(nodes(section).some(node=>node.type==='button'&&content(node)==='Edit section'));
 const questions=t.questions('contact'),question=questions.props.children(questions.props.items.find(item=>item.id==='email'),null);
 assert.equal(nodes(question).filter(node=>node.type==='h3').length,0,'no repeated heading above the actual field');
 assert.equal(nodes(question).filter(node=>node.props['aria-label']==='Edit Email address').length,1);
 assert.equal(t.draft.commissionForm.sectionTitles.contact,'Contact Taylor');t.h.unmount();
});
