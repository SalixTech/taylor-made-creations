import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';
import { model, defaults, storage, memoryAdapter } from './owner-test-modules.mjs';
const load=sourceLoader();
const form=load('src/components/commission-form-config.ts');
const question=(changes={})=>({id:'custom-deadline',section:'request',label:'Preferred completion date',type:'text',required:false,...changes});
const choice=(changes={})=>question({id:'custom-look',section:'character',label:'Choose a style',type:'select',options:[{id:'option-soft',label:'Soft'},{id:'option-bright',label:'Bright'}],required:true,...changes});
const config=()=>({sectionOrder:['character','contact'],sectionTitles:{character:'Your character'},fields:{email:{label:'Best email address'},telegram:{required:true},suit:{optionLabels:{'Head only':'Head'}}},customQuestions:[question(),choice()],questionOrder:{character:['custom-look','species'],request:['custom-deadline']}});
const valid=value=>assert.deepEqual(form.validateCommissionFormConfig(value),{valid:true,issues:[]});
const invalid=value=>assert.equal(form.validateCommissionFormConfig(value).valid,false);

test('legacy and empty configuration preserve all original sections, questions and requirements',()=>{
  valid({});assert.deepEqual(form.getCommissionSectionOrder(),['contact','character','suit','additionalParts','request']);
  assert.deepEqual(form.getCommissionQuestionOrder(undefined,'contact'),['email','telegram','discord','tos','usa','country']);
  assert.equal(form.getCommissionField(undefined,'email').required,true);
  assert.equal(form.getCommissionField(undefined,'telegram').required,false);
  assert.equal(defaults.createDefaultOwnerContent().commissionForm,undefined);
  assert.doesNotThrow(()=>model.assertOwnerContent(defaults.createDefaultOwnerContent()));
});

test('partial requested order appends omitted protected fields and new custom questions without duplication',()=>{
  const input=config(),before=structuredClone(input);valid(input);
  assert.deepEqual(form.getCommissionSectionOrder(input),['character','contact','suit','additionalParts','request']);
  assert.deepEqual(form.getCommissionQuestionOrder(input,'character'),['custom-look','species','character','references']);
  assert.equal(form.getCommissionQuestionOrder(input,'request')[0],'custom-deadline');
  assert.deepEqual(input,before);
  assert.equal(form.getCommissionField(input,'email').label,'Best email address');
  assert.equal(form.getCommissionField(input,'telegram').required,true);
});

test('option label editing never changes stored identities or eligibility values',()=>{
  const input=config();valid(input);
  assert.equal(form.getCommissionOptionLabel(input,'suit','Head only'),'Head');
  assert.equal(form.getCommissionOptionLabel(input,'suit','Parts'),'Parts');
  assert.deepEqual(form.getCommissionField(input,'suit').options,['Head only','Mini partial','Full partial','Plantigrade fullsuit','Digitigrade fullsuit','Parts']);
  invalid({fields:{suit:{optionLabels:{Custom:'Anything'}}}});
  invalid({fields:{email:{optionLabels:{Yes:'Yes'}}}});
});

test('all built-in business requirements can be configured without changing default semantics',()=>{
  for(const field of form.COMMISSION_FIELDS){
    valid({fields:{[field.id]:{required:!field.required}}});
    assert.equal(form.getCommissionField({fields:{[field.id]:{required:!field.required}}},field.id).required,!field.required);
    assert.equal(form.getCommissionField(undefined,field.id).required,field.required);
  }
});

test('unknown keys, executable behavior, invalid shapes and overlong wording are rejected',()=>{
  for(const value of [null,[],new Date(),{onSubmit:'fetch(1)'},{fields:{email:{html:'<script/>'}}},{fields:{unknown:{label:'Unknown'}}},{fields:{email:{label:''}}},{fields:{email:{label:'a'.repeat(161)}}},{sectionTitles:{contact:'a'.repeat(161)}},{fields:{email:{hint:'a'.repeat(1001)}}},{fields:{email:{required:'false'}}}])invalid(value);
  valid({fields:{email:{hint:''}}});
  const odd=Object.create({label:'Inherited'});odd.hint='Text';invalid({fields:{email:odd}});
});

test('section/question ordering rejects duplicates, unknown IDs and questions from another section',()=>{
  for(const value of [{sectionOrder:['contact','contact']},{sectionOrder:['invented']},{sectionTitles:{secret:'Secret'}},{questionOrder:{contact:['email','email']}},{questionOrder:{contact:['suit']}},{questionOrder:{request:['custom-absent']}},{questionOrder:{secret:['email']}},{questionOrder:{contact:'email'}}])invalid(value);
  invalid({customQuestions:[question()],questionOrder:{contact:['custom-deadline']}});
});

test('custom text, long-text, single-choice and multiple-choice questions retain stable IDs',()=>{
  for(const type of ['text','textarea'])valid({customQuestions:[question({type})]});
  for(const type of ['select','checkboxes'])valid({customQuestions:[choice({type})]});
  invalid({customQuestions:[question({type:'file'})]});
  invalid({customQuestions:[question({options:[]})]});
  invalid({customQuestions:[choice({options:[]})]});
  invalid({customQuestions:[choice({options:undefined})]});
  invalid({customQuestions:[question({section:'additionalParts'})]});
});

test('custom and option identifiers reject duplicate, dangerous and oversized identities',()=>{
  for(const id of ['email','__proto__','constructor','custom-','custom-a/b','custom-'+ 'x'.repeat(72)])invalid({customQuestions:[question({id})]});
  invalid({customQuestions:[question(),question()]});
  invalid({customQuestions:[choice({options:[{id:'option-1',label:'One'},{id:'option-1',label:'Two'}]})]});
  for(const id of ['__proto__','constructor','choice','option-','option-a/b'])invalid({customQuestions:[choice({options:[{id,label:'One'}]})]});
  invalid({customQuestions:[choice({options:[{id:'option-one',label:''}]})]});
});

test('custom question/choice counts and content lengths are bounded',()=>{
  valid({customQuestions:Array.from({length:20},(_,i)=>question({id:`custom-${i}`}))});
  invalid({customQuestions:Array.from({length:21},(_,i)=>question({id:`custom-${i}`}))});
  const options=Array.from({length:20},(_,i)=>({id:`option-${i}`,label:`Option ${i}`}));
  valid({customQuestions:[choice({options})]});
  invalid({customQuestions:[choice({options:[...options,{id:'option-extra',label:'Extra'}]})]});
  invalid({customQuestions:[question({hint:'a'.repeat(1001)})]});
  invalid({customQuestions:[question({label:'a'.repeat(161)})]});
});

test('owner and public boundaries validate configuration without introducing client answers',()=>{
  const owner=defaults.createDefaultOwnerContent();owner.commissionForm=config();
  model.assertOwnerContent(owner);
  const snapshot=model.createPublicContentSnapshot(owner);model.assertPublicOwnerContent(snapshot);
  assert.deepEqual(snapshot.commissionForm,owner.commissionForm);
  assert.deepEqual(model.publicContentToOwnerContent(snapshot).commissionForm,owner.commissionForm);
  for(const bad of [{answers:{secret:'Client data'}},{fields:{email:{required:'false'}}},{customQuestions:[question({type:'script'})]}]){
    const privateInvalid=structuredClone(owner);privateInvalid.commissionForm=bad;
    assert.throws(()=>model.assertOwnerContent(privateInvalid));assert.throws(()=>model.createPublicContentSnapshot(privateInvalid));
    const publicInvalid=structuredClone(snapshot);publicInvalid.commissionForm=bad;assert.throws(()=>model.assertPublicOwnerContent(publicInvalid));
  }
});

test('publication makes a fresh allowlisted configuration copy and draft edits do not mutate public state',()=>{
  const owner=defaults.createDefaultOwnerContent();owner.commissionForm=config();const before=structuredClone(owner);
  const published=model.createPublishedOwnerSnapshot(owner,2,'2026-10-26T14:00:00.000Z');
  owner.commissionForm.fields.email.label='Private wording';owner.commissionForm.customQuestions[1].options[0].label='Private choice';owner.commissionForm.sectionOrder.reverse();owner.commissionForm.questionOrder.character.push('references');
  assert.deepEqual(published.content.commissionForm,before.commissionForm);
  const restored=model.publicContentToOwnerContent(published.content);restored.commissionForm.customQuestions[0].label='Local renderer copy';assert.deepEqual(published.content.commissionForm,before.commissionForm);
});


test('sparse lists fail closed instead of writing holes that later become null JSON',()=>{
  invalid({sectionOrder:new Array(1)});
  invalid({questionOrder:{contact:new Array(1)}});
  invalid({customQuestions:new Array(1)});
  invalid({customQuestions:[choice({options:new Array(1)})]});
});

test('saving form edits round-trips private configuration without changing an earlier published snapshot',async()=>{
  const original=defaults.createDefaultOwnerContent(),published=model.createPublishedOwnerSnapshot(original,1,'2026-10-26T14:00:00.000Z');
  const adapter=memoryAdapter(),store=storage.createOwnerStore(adapter);
  const before=await store.load();const draft=structuredClone(before.draft);draft.commissionForm=config();
  const saved=await store.saveDraft(draft,before.revision);assert.deepEqual(saved.draft.commissionForm,draft.commissionForm);
  assert.deepEqual((await store.load()).draft.commissionForm,draft.commissionForm);
  assert.equal(saved.localPublished,null);assert.equal(published.content.commissionForm,undefined);
});


test('inactive commission-page wording stays in the private draft, not the public JSON',()=>{
  for(const state of ['hidden','trashed']){
    const owner=defaults.createDefaultOwnerContent();owner.commissionForm={fields:{email:{label:'PRIVATE FORM WORDING'}},customQuestions:[question({label:'PRIVATE CUSTOM QUESTION'})]};
    const page=owner.pages.find(page=>page.builtinKey==='commissions');if(state==='hidden')page.availability='hidden';else page.trashedAt='2026-10-26T14:00:00.000Z';
    const snapshot=model.createPublicContentSnapshot(owner);assert.equal(snapshot.commissionForm,undefined);assert.doesNotMatch(JSON.stringify(snapshot),/PRIVATE FORM WORDING|PRIVATE CUSTOM QUESTION/);
    assert.ok(owner.commissionForm);assert.equal(model.publicContentToOwnerContent(snapshot).commissionForm,undefined);
    page.availability='public';page.trashedAt=null;assert.deepEqual(model.createPublicContentSnapshot(owner).commissionForm,owner.commissionForm);
  }
});

test('unlisted navigation and closed commission status do not remove available form configuration',()=>{
  const owner=defaults.createDefaultOwnerContent();owner.commissionForm=config();owner.site.commissionStatus='Closed';
  const page=owner.pages.find(page=>page.builtinKey==='commissions');page.showInNav=false;page.navPlacement='unlisted';
  assert.deepEqual(model.createPublicContentSnapshot(owner).commissionForm,owner.commissionForm);
});
