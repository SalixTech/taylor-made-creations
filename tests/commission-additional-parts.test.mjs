import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, nodes, content } from './owner-ui-harness.mjs';
import { sourceLoader } from './scout-source-loader.mjs';
const { allowsAdditionalParts, cleanDraft, emptyDraft, eligible, partTypes, reviewRows, suitTypes, transition, validate } = sourceLoader()('src/components/commission-model.ts');

const image={name:'reference.png',type:'image/png',size:9};
const valid={...emptyDraft,email:'client@example.test',tos:'Yes',tosAgreed:true,usa:'Yes',character:'Fox',species:'Fox',suit:'Head only'};
const quantities={additionalPartsQuantities:true};
const selection=[{part:'Hand paws',quantity:3},{part:'Large Tail',quantity:2}];

test('additional parts are optional for each existing suit category, never a new suit category',()=>{
  assert.equal(suitTypes.length,6);
  for(const suit of suitTypes){
    assert.equal(allowsAdditionalParts({suit}),suit!=='Parts');
    assert.deepEqual(cleanDraft({...valid,suit}).additionalParts,[]);
  }
  for(const suit of ['', 'Additional Parts', 'Unknown'])assert.equal(allowsAdditionalParts({suit}),false);
  assert.deepEqual(validate(valid,[image]),{});
  assert.equal(reviewRows(valid,[image]).some(([label])=>label==='Additional Parts'),false);
});

test('extra selections remain separate from included suit parts and retain explicit quantities only when enabled',()=>{
  const extra=transition(valid,{additionalParts:selection},quantities);
  assert.deepEqual(extra.additionalParts,selection);
  assert.deepEqual(eligible(extra),eligible(valid));
  assert.deepEqual(extra.parts,[]);
  assert.deepEqual(extra.hands,[]);
  assert.deepEqual(validate(extra,[image],quantities),{});
  assert.deepEqual(reviewRows(extra,[image],quantities).find(([label])=>label==='Additional Parts'),['Additional Parts','Hand paws (quantity: 3); Large Tail (quantity: 2)']);
  const off=cleanDraft(extra);
  assert.deepEqual(off.additionalParts,selection.map(item=>({...item,quantity:1})));
  assert.equal(reviewRows(extra,[image]).find(([label])=>label==='Additional Parts')[1],'Hand paws (quantity: 1); Large Tail (quantity: 1)');
});

test('Parts, blank and invalid categories clear extras; changing suit categories preserves explicit extras',()=>{
  const extra={...valid,additionalParts:selection};
  const changed=transition(extra,{suit:'Mini partial',tailSize:'No Tail'},quantities);
  assert.deepEqual(changed.additionalParts,selection);
  assert.deepEqual(validate(changed,[image],quantities),{});
  for(const suit of ['Parts','','Unknown']){
    const removed=transition(extra,{suit,parts:['Arm sleeves']},quantities);
    assert.deepEqual(removed.additionalParts,[]);
    assert.equal(reviewRows({...extra,suit},[image],quantities).some(([label])=>label==='Additional Parts'),false);
    assert.deepEqual(transition(removed,{suit:'Head only'},quantities).additionalParts,[]);
  }
});

test('extra normalization accepts older drafts, drops unknown or duplicate parts, and does not mutate input',()=>{
  const legacy={...valid};delete legacy.additionalParts;
  assert.deepEqual(cleanDraft(legacy).additionalParts,[]);
  const input={...valid,additionalParts:[...selection,{part:'Hand paws',quantity:8},{part:'Not a part',quantity:1}]};
  const before=structuredClone(input);
  assert.deepEqual(cleanDraft(input,quantities).additionalParts,selection);
  assert.deepEqual(input,before);
  assert.deepEqual(emptyDraft.additionalParts,[]);
});

test('quantity mode accepts positive safe integers and rejects blank, negative, fractional or non-finite counts',()=>{
  for(const quantity of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
    const draft={...valid,additionalParts:[{part:'Hand paws',quantity}]};
    assert.match(validate(draft,[image],quantities).additionalParts,/whole-number quantity/);
    assert.deepEqual(validate(draft,[image]),{});
    assert.deepEqual(cleanDraft(draft).additionalParts,[{part:'Hand paws',quantity:1}]);
  }
  for(const quantity of [1,2,100])assert.deepEqual(validate({...valid,additionalParts:[{part:'Hand paws',quantity}]},[image],quantities),{});
});

function fixture(props={}){
  const h=harness();let state={status:'baseline',reason:'not-published'};
  h.overrides['./PublicSiteContext']={usePublicSiteState:()=>state};
  h.overrides['./TermsAgreement']={__esModule:true,default:function TermsAgreement(){}};
  const Form=h.load('src/components/CommissionForm.tsx').default;
  const render=()=>h.render(Form,props);
  const field=id=>h.find(n=>n.props.id===`commission-${id}`);
  const button=label=>h.find(n=>n.type==='button'&&content(n)===label);
  const section=()=>field('additionalParts');
  const checkbox=part=>nodes(section()).find(n=>n.type==='label'&&content(n)===part)?.props.children[0];
  const selectSuit=suit=>{field('suit').props.onChange(suit);render();};
  const choose=(part,checked=true)=>{checkbox(part).props.onChange({target:{checked}});render();};
  const quantity=part=>h.find(n=>n.type==='input'&&n.props['aria-label']===`Quantity for ${part}`);
  const submit=()=>{h.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});render();};
  async function complete(){
    for(const [id,value] of [['email','client@example.test'],['character','Fox'],['species','Fox']]){field(id).props.onChange({target:{value}});render();}
    h.find(n=>n.type==='input'&&n.props.name==='commission-usa'&&n.props.value==='Yes').props.onChange();render();
    button('Read the terms of service').props.onClick();render();
    h.find(n=>n.type?.name==='TermsAgreement').props.onAgree();render();
    await field('references').props.onChange({target:{value:'',files:[new File([new Uint8Array([137,80,78,71,13,10,26,10,1])],'reference.png',{type:'image/png'})]}});render();
  }
  render();return {h,props,render,field,button,section,checkbox,selectSuit,choose,quantity,submit,complete,setState(value){state=value;render();}};
}

test('form places the optional section after suit details, excludes Parts and blank, and keeps all extras initially unchecked',()=>{
  const t=fixture();assert.equal(t.section(),undefined);
  assert.deepEqual(t.field('suit').props.options.map(option=>option.value),[...suitTypes]);
  for(const suit of suitTypes.filter(suit=>suit!=='Parts')){
    t.selectSuit(suit);assert.ok(t.section());
    assert.match(content(t.section()),/additional to the parts included/);
    assert.equal(nodes(t.section()).filter(n=>n.type==='input'&&n.props.type==='checkbox').length,partTypes.length);
    assert.ok(partTypes.every(part=>t.checkbox(part).props.checked===false));
    assert.equal(nodes(t.section()).some(n=>n.type==='input'&&n.props.type==='number'),false);
  }
  const sections=t.h.all(n=>n.type==='fieldset'&&n.props.className==='section').map(n=>content(n.props.children[0]));
  assert.ok(sections.indexOf('Additional Parts (optional)')>sections.indexOf('Fursuit details'));
  assert.ok(sections.indexOf('Additional Parts (optional)')<sections.indexOf('A little more about your request'));
  t.choose('Hand paws');t.selectSuit('Parts');assert.equal(t.section(),undefined);
  t.selectSuit('Head only');assert.equal(t.checkbox('Hand paws').props.checked,false);t.h.unmount();
});

test('enabled quantities appear only for selected extras; validation blocks invalid counts and Back to edit retains correct selection',async()=>{
  const t=fixture({additionalPartsQuantities:true});t.selectSuit('Head only');
  assert.equal(t.quantity('Hand paws'),undefined);
  t.choose('Hand paws');t.choose('Large Tail');
  assert.equal(t.quantity('Hand paws').props.value,1);
  assert.equal(t.quantity('Hand paws').props.min,1);assert.equal(t.quantity('Hand paws').props.step,1);
  t.quantity('Hand paws').props.onChange({target:{value:'3'}});t.render();
  await t.complete();t.submit();assert.match(content(t.h.tree),/Hand paws \(quantity: 3\)/);
  assert.equal(t.button('Send request').props.disabled,true);
  t.button('Back to edit').props.onClick();t.render();
  assert.equal(t.checkbox('Hand paws').props.checked,true);assert.equal(t.quantity('Hand paws').props.value,3);
  t.quantity('Hand paws').props.onChange({target:{value:''}});t.render();t.submit();
  assert.match(content(t.h.tree),/whole-number quantity/);assert.equal(t.quantity('Hand paws').props['aria-invalid'],true);
  t.choose('Hand paws',false);assert.equal(t.quantity('Hand paws'),undefined);t.submit();
  assert.doesNotMatch(content(t.h.tree),/Hand paws \(quantity:/);assert.match(content(t.h.tree),/Large Tail \(quantity: 1\)/);
  t.button('Start over').props.onClick();t.render();assert.equal(t.section(),undefined);t.selectSuit('Head only');
  assert.ok(partTypes.every(part=>!t.checkbox(part).props.checked));assert.equal(t.quantity('Large Tail'),undefined);t.h.unmount();
});

test('live quantity setting changes sanitize review immediately and do not invalidate unchanged terms consent',async()=>{
  const t=fixture(),defaults=t.h.load('src/owner/defaults.ts'),model=t.h.load('src/owner/model.ts');
  let draft=defaults.createDefaultOwnerContent();draft.site.additionalPartsQuantities=true;
  t.setState({status:'published',snapshot:model.createPublishedOwnerSnapshot(draft,1)});
  t.selectSuit('Head only');t.choose('Hand paws');t.quantity('Hand paws').props.onChange({target:{value:'4'}});t.render();
  await t.complete();t.submit();assert.match(content(t.h.tree),/Hand paws \(quantity: 4\)/);
  draft=structuredClone(draft);draft.site.additionalPartsQuantities=false;
  t.setState({status:'published',snapshot:model.createPublishedOwnerSnapshot(draft,2)});
  assert.match(content(t.h.tree),/Review your request/);assert.match(content(t.h.tree),/Hand paws \(quantity: 1\)/);assert.doesNotMatch(content(t.h.tree),/quantity: 4/);
  t.button('Back to edit').props.onClick();t.render();assert.equal(t.quantity('Hand paws'),undefined);
  draft=structuredClone(draft);draft.site.additionalPartsQuantities=true;
  t.setState({status:'published',snapshot:model.createPublishedOwnerSnapshot(draft,3)});
  assert.equal(t.quantity('Hand paws').props.value,1);t.h.unmount();
});

test('owner quantity setting is strict, backwards compatible and preserved only through deliberate public projection',()=>{
  const h=harness(),defaults=h.load('src/owner/defaults.ts'),model=h.load('src/owner/model.ts');
  const owner=defaults.createDefaultOwnerContent();assert.equal(owner.site.additionalPartsQuantities,false);
  const previous=structuredClone(owner);delete previous.site.additionalPartsQuantities;assert.doesNotThrow(()=>model.assertOwnerContent(previous));
  assert.equal(model.publicContentToOwnerContent(model.createPublicContentSnapshot(previous)).site.additionalPartsQuantities,undefined);
  const published=model.createPublicContentSnapshot(owner);owner.site.additionalPartsQuantities=true;
  assert.equal(published.site.additionalPartsQuantities,false);
  assert.equal(model.createPublicContentSnapshot(owner).site.additionalPartsQuantities,true);
  for(const bad of ['true',1,null,{}]){const invalid=structuredClone(owner);invalid.site.additionalPartsQuantities=bad;assert.throws(()=>model.assertOwnerContent(invalid));}
  h.unmount();
});

test('owner toggle edits the draft only, previews its unsaved setting, and Close/reopen retains the owner setting',()=>{
  const h=harness(),defaults=h.load('src/owner/defaults.ts');let owner=defaults.createDefaultOwnerContent(),edits=0,syncs=0;
  const Manager=h.load('src/owner/OwnerTemplateManagers.tsx').ContactSettingsManager;
  const render=()=>h.render(Manager,{content:owner,onEdit(change){owner=structuredClone(owner);change(owner);edits++;},onRemove(){throw Error('No remove expected');},userEmail:'owner@example.test',onSync(){syncs++;},constructionSettings:{type:'div',props:{id:'construction-card'}}});
  const toggle=()=>h.find(n=>n.type?.name==='Toggle'&&n.props.label==='Allow quantities for Additional Parts');
  const button=label=>h.find(n=>n.type==='button'&&content(n)===label);
  render();assert.ok(h.find(n=>n.props.id==='construction-card'));assert.equal(toggle().props.checked,false);
  toggle().props.onChange(true);render();assert.equal(owner.site.additionalPartsQuantities,true);assert.equal(edits,1);assert.equal(syncs,0);
  button('Preview commission form').props.onClick();render();
  assert.equal(h.find(n=>n.type?.name==='CommissionForm').props.additionalPartsQuantities,true);
  let dialog=h.find(n=>n.type?.name==='Dialog');assert.equal(dialog.props.maximizable,true);assert.match(content(dialog),/does not save a request/);
  dialog.props.onClose();render();assert.equal(h.find(n=>n.type?.name==='Dialog'),undefined);
  toggle().props.onChange(false);render();button('Preview commission form').props.onClick();render();
  assert.equal(h.find(n=>n.type?.name==='CommissionForm').props.additionalPartsQuantities,false);assert.equal(syncs,0);h.unmount();
});

test('explicit private preview quantity setting works even while public construction mode is locked',()=>{
  const t=fixture({additionalPartsQuantities:true});t.setState({status:'locked'});t.selectSuit('Head only');t.choose('Hand paws');
  assert.equal(t.quantity('Hand paws').props.value,1);
  assert.equal(t.button('Review request →').props.disabled,true,'private preview must not bypass current terms consent');
  t.h.unmount();
});

test('configured wording, hints and option labels change display only, while safe optional requirements validate',()=>{
  const configuration={fields:{email:{label:'Your contact email',hint:'Use the address you check most.'},telegram:{label:'Telegram handle',required:true},suit:{optionLabels:{'Head only':'Custom head'}},discovery:{optionLabels:{Other:'Somewhere else'},required:true}}};
  const t=fixture({configuration});
  assert.match(content(t.h.tree),/Your contact email/);assert.match(content(t.h.tree),/Use the address you check most/);
  assert.equal(t.field('telegram').props.required,true);
  assert.deepEqual(t.field('suit').props.options.find(option=>option.value==='Head only'),{value:'Head only',label:'Custom head'});
  t.selectSuit('Head only');assert.ok(t.section());
  const other=t.h.find(n=>n.type==='input'&&n.props.name==='commission-discovery'&&n.props.value==='Other');
  other.props.onChange();t.render();assert.ok(t.field('discoveryOther'),'conditional behavior still uses stable Other identity');
  const errors=validate(valid,[image],{configuration});assert.match(errors.telegram,/Telegram handle/);assert.ok(errors.discovery);
  t.h.unmount();
});

test('section and question ordering applies to the actual form and its review, including custom answer types',async()=>{
  const customQuestions=[
    {id:'custom-timing',section:'request',label:'Preferred timing',type:'text',required:true},
    {id:'custom-mood',section:'request',label:'Character mood',type:'select',required:true,options:[{id:'option-calm',label:'Calm'},{id:'option-playful',label:'Playful'}]},
    {id:'custom-use',section:'request',label:'Planned use',type:'checkboxes',required:true,options:[{id:'option-events',label:'Events'},{id:'option-photos',label:'Photos'}]},
    {id:'custom-notes',section:'request',label:'Extra character notes',type:'textarea',required:false},
  ];
  const configuration={sectionOrder:['request','contact','character','suit','additionalParts'],questionOrder:{request:['custom-mood','custom-timing','custom-use','custom-notes','additional']},customQuestions};
  const t=fixture({configuration});
  assert.equal(t.h.all(n=>n.props['data-commission-section'])[0].props['data-commission-section'],'request');
  assert.deepEqual(t.h.all(n=>n.props['data-commission-question']).slice(0,4).map(n=>n.props['data-commission-question']),['custom-mood','custom-timing','custom-use','custom-notes']);
  t.selectSuit('Head only');await t.complete();t.submit();assert.match(content(t.h.tree),/Complete “Preferred timing”/);
  t.field('custom-custom-timing').props.onChange({target:{value:'Next spring'}});t.render();
  t.field('custom-custom-mood').props.onChange('option-playful');t.render();
  const use=t.field('custom-custom-use');nodes(use).find(n=>n.type==='input').props.onChange({target:{checked:true}});t.render();
  t.field('custom-custom-notes').props.onChange({target:{value:'Relaxed expression'}});t.render();t.submit();
  const rows=t.h.find(n=>n.type==='dl').props.children;
  assert.deepEqual(rows.slice(0,4).map(row=>content(row.props.children[0])),['Character mood','Preferred timing','Planned use','Extra character notes']);
  assert.match(content(t.h.tree),/Playful/);assert.match(content(t.h.tree),/Next spring/);assert.match(content(t.h.tree),/Events/);
  t.button('Back to edit').props.onClick();t.render();assert.equal(t.field('custom-custom-mood').props.value,'option-playful');assert.equal(t.field('custom-custom-timing').props.value,'Next spring');
  t.button('Start over').props.onClick();t.render();assert.equal(t.field('custom-custom-timing').props.value,'');assert.equal(t.field('custom-custom-mood').props.value,'');t.h.unmount();
});

test('custom choice answers are allowlisted, duplicates/removed options disappear, and removed questions never leak into review',()=>{
  const customQuestions=[{id:'custom-choice',section:'request',label:'Choice',type:'select',required:true,options:[{id:'option-a',label:'A'}]},{id:'custom-multi',section:'request',label:'Multiple',type:'checkboxes',required:false,options:[{id:'option-b',label:'B'}]}];
  const configuration={customQuestions},draft={...valid,customAnswers:{'custom-choice':'option-removed','custom-multi':['option-b','option-b','option-removed'],'custom-deleted':'PRIVATE OLD ANSWER'}};
  assert.deepEqual(cleanDraft(draft,{configuration}).customAnswers,{'custom-choice':'','custom-multi':['option-b']});
  assert.ok(validate(draft,[image],{configuration})['custom-custom-choice']);
  assert.equal(reviewRows(draft,[image],{configuration}).some(([,value])=>value.includes('PRIVATE OLD ANSWER')),false);
  assert.deepEqual(cleanDraft(draft).customAnswers,{});
  assert.deepEqual(validate(draft,[image]),{});
});

test('owner required settings apply but supplied email, consent and files remain checked',()=>{
  const configuration={fields:{email:{required:false},tos:{required:false},references:{required:false},suit:{required:false}}};
  const errors=validate({...valid,email:'wrong',tosAgreed:false,suit:''},[],{configuration});
  for(const key of ['email','tos'])assert.ok(errors[key]);
  for(const key of ['references','suit'])assert.equal(errors[key],undefined);
  assert.ok(validate({...valid,tos:'No'},[{...image,type:'image/svg+xml'}],{configuration}).references);
  const t=fixture({configuration});assert.equal(t.field('email').props.required,false);assert.equal(t.field('suit').props.required,false);assert.equal(t.button('Review request →').props.disabled,false);t.h.unmount();
});

test('published configuration changes reach the form while explicit private defaults ignore public edits',()=>{
  const t=fixture(),defaults=t.h.load('src/owner/defaults.ts'),model=t.h.load('src/owner/model.ts');
  const owner=defaults.createDefaultOwnerContent();owner.commissionForm={fields:{email:{label:'Published contact question'}}};
  t.setState({status:'published',snapshot:model.createPublishedOwnerSnapshot(owner,1)});assert.match(content(t.h.tree),/Published contact question/);
  t.props.configuration={};t.render();assert.doesNotMatch(content(t.h.tree),/Published contact question/);assert.match(content(t.h.tree),/Email address/);
  t.props.configuration={fields:{email:{label:'Unsaved owner question'}}};t.render();assert.match(content(t.h.tree),/Unsaved owner question/);assert.equal(owner.commissionForm.fields.email.label,'Published contact question');t.h.unmount();
});

test('new required published questions return review to editing; removing them clears their stale errors and answers',async()=>{
  const t=fixture(),defaults=t.h.load('src/owner/defaults.ts'),model=t.h.load('src/owner/model.ts');let owner=defaults.createDefaultOwnerContent();
  t.setState({status:'published',snapshot:model.createPublishedOwnerSnapshot(owner,1)});t.selectSuit('Head only');await t.complete();t.submit();assert.ok(t.button('Send request'));
  owner=structuredClone(owner);owner.commissionForm={customQuestions:[{id:'custom-size',section:'request',label:'Requested size',type:'text',required:true}]};
  t.setState({status:'published',snapshot:model.createPublishedOwnerSnapshot(owner,2)});
  assert.equal(t.button('Send request'),undefined);assert.match(content(t.h.tree),/Complete “Requested size”/);assert.ok(t.field('custom-custom-size'));
  t.field('custom-custom-size').props.onChange({target:{value:'LARGE SECRET'}});t.render();t.submit();assert.match(content(t.h.tree),/LARGE SECRET/);
  owner=structuredClone(owner);owner.commissionForm={};t.setState({status:'published',snapshot:model.createPublishedOwnerSnapshot(owner,3)});
  assert.ok(t.button('Send request'));assert.doesNotMatch(content(t.h.tree),/LARGE SECRET|Requested size/);t.h.unmount();
});

test('reference constraints stay visible and reachable even if their configurable help text changes',()=>{
  const t=fixture({configuration:{fields:{references:{label:'Your character sheet',hint:'Please show the markings clearly.'}}}});
  assert.match(content(t.h.tree),/30 MB each/);assert.match(content(t.h.tree),/no SVG/);assert.match(content(t.h.tree),/Please show the markings clearly/);
  for(const id of t.field('references').props['aria-describedby'].split(' '))assert.ok(t.h.find(n=>n.props.id===id),`missing description ${id}`);
  t.props.configuration={};t.render();for(const id of t.field('references').props['aria-describedby'].split(' '))assert.ok(t.h.find(n=>n.props.id===id));t.h.unmount();
});

test('spare parts reuse original applicability without merging main suit or other spare answers',()=>{
  const {additionalPartFollowups}=sourceLoader()('src/components/commission-model.ts');
  const mapping={'Arm sleeves':[],'Feetpaws (indoor)':['sandals'],'Feetpaws (outdoor)':['sandals'],'Hand paws':['hands'],'Short Tail':['tail'],'Large Tail':['tail'],'Floor Dragger Tail':['tail'],'Digitigrade Body Suit':['pockets'],'Plantigrade Body Suit':['pockets']};
  for(const part of partTypes)assert.deepEqual(additionalPartFollowups(part),mapping[part]);
  const draft={...valid,suit:'Mini partial',hands:['Finger Escapes'],tailSize:'Large (16–30 inches)',tail:['Squeaker'],additionalParts:[{part:'Hand paws',quantity:2,details:{hands:['Plush claws'],tail:['Squeaker']}},{part:'Large Tail',quantity:1,details:{tail:['Hidden pocket']}},{part:'Short Tail',quantity:1,details:{tail:['Squeaker']}}]};
  const clean=cleanDraft(draft,quantities);
  assert.deepEqual(clean.hands,['Finger Escapes']);assert.deepEqual(clean.tail,['Squeaker']);
  assert.deepEqual(clean.additionalParts.find(item=>item.part==='Hand paws').details,{hands:['Plush claws']});
  const rows=reviewRows(draft,[image],quantities);
  assert.deepEqual(rows.find(([label])=>label==='Large Tail · Tail extras'),['Large Tail · Tail extras','Hidden pocket']);
  assert.deepEqual(rows.find(([label])=>label==='Short Tail · Tail extras'),['Short Tail · Tail extras','Squeaker']);
  assert.deepEqual(cleanDraft(draft).additionalParts.find(item=>item.part==='Hand paws'),{part:'Hand paws',quantity:1,details:{hands:['Plush claws']}});
  assert.equal(reviewRows({...draft,suit:'Parts',parts:['Arm sleeves']},[image]).some(([label])=>label.includes(' · ')),false);
});

test('additional followups honor original configurable labels/options/requirements and do not require inactive main fields',()=>{
  const configuration={fields:{tail:{label:'Tail customizations',required:true,optionLabels:{'Hidden pocket':'Secret pocket'}}}};
  const selected={...valid,additionalParts:[{part:'Large Tail',quantity:1}]};
  const errors=validate(selected,[image],{configuration});
  assert.equal(errors.tail,undefined);assert.equal(errors.tailSize,undefined);
  assert.match(errors['additionalParts-5-tail'],/Tail customizations.*Large Tail/);
  const answered={...selected,additionalParts:[{part:'Large Tail',quantity:1,details:{tail:['Hidden pocket']}}]};
  assert.deepEqual(validate(answered,[image],{configuration}),{});
  assert.deepEqual(reviewRows(answered,[image],{configuration}).find(([label])=>label==='Large Tail · Tail customizations'),['Large Tail · Tail customizations','Secret pocket']);
  const invalid={...selected,additionalParts:[{part:'Large Tail',quantity:1,details:{tail:['Invalid']}}]};
  assert.match(validate(invalid,[image],{configuration})['additionalParts-5-tail'],/valid option/);
  assert.doesNotMatch(JSON.stringify(reviewRows(invalid,[image],{configuration})),/Invalid/);
  assert.deepEqual(validate(selected,[image],{configuration:{fields:{tail:{required:false}}}}),{});
});

test('selected additional parts show scoped original followups, survive review and lose answers when deselected',async()=>{
  const t=fixture({configuration:{fields:{tail:{label:'Tail customizations',hint:'Tail help',required:true,optionLabels:{'Hidden pocket':'Secret pocket'}}}}});
  t.selectSuit('Head only');t.choose('Large Tail');
  assert.match(content(t.field('additionalParts-5-tail')),/Tail customizations.*Secret pocket.*Tail help/);
  assert.equal(t.field('tail'),undefined);assert.equal(t.field('tailSize'),undefined);
  await t.complete();t.submit();assert.match(content(t.h.tree),/Complete “Tail customizations” for Large Tail/);
  const choice=nodes(t.field('additionalParts-5-tail')).find(n=>n.type==='input'&&n.props.value==='Hidden pocket');
  choice.props.onChange({target:{checked:true}});t.render();t.submit();
  assert.match(content(t.h.tree),/Large Tail · Tail customizationsSecret pocket/);
  t.button('Back to edit').props.onClick();t.render();
  assert.equal(nodes(t.field('additionalParts-5-tail')).find(n=>n.type==='input'&&n.props.value==='Hidden pocket').props.checked,true);
  t.choose('Large Tail',false);assert.equal(t.field('additionalParts-5-tail'),undefined);t.submit();
  assert.doesNotMatch(content(t.h.tree),/Secret pocket/);
  t.button('Back to edit').props.onClick();t.render();t.choose('Large Tail');
  assert.equal(nodes(t.field('additionalParts-5-tail')).find(n=>n.type==='input'&&n.props.value==='Hidden pocket').props.checked,false);
  t.h.unmount();
});

test('all original extra-part controls remain reachable in private preview with separate values and exact wording',()=>{
  const h=harness(),previewContent=h.load('src/owner/defaults.ts').createDefaultOwnerContent();h.unmount();
  const t=fixture({previewContent,configuration:{}});t.selectSuit('Head only');
  for(const part of ['Hand paws','Feetpaws (indoor)','Feetpaws (outdoor)','Digitigrade Body Suit','Plantigrade Body Suit'])t.choose(part);
  assert.match(content(t.field('additionalParts-3-hands')),/Hand paw extras.*Finger Escapes.*Squeakers.*NFC chip\(s\).*Plush claws/);
  assert.match(content(t.field('additionalParts-7-pockets')),/Body suit pockets.*None.*1 pocket.*2 pockets/);
  const indoor=nodes(t.field('additionalParts-1-sandals')).find(n=>n.type==='input');indoor.props.onChange({target:{checked:true}});t.render();
  assert.equal(nodes(t.field('additionalParts-1-sandals')).find(n=>n.type==='input').props.checked,true);
  assert.equal(nodes(t.field('additionalParts-2-sandals')).find(n=>n.type==='input').props.checked,false);
  const pocket=nodes(t.field('additionalParts-7-pockets')).find(n=>n.type==='input'&&n.props.value==='2 pockets');pocket.props.onChange({target:{checked:true}});t.render();
  assert.equal(nodes(t.field('additionalParts-7-pockets')).find(n=>n.type==='input'&&n.props.value==='2 pockets').props.checked,true);
  assert.equal(nodes(t.field('additionalParts-8-pockets')).find(n=>n.type==='input'&&n.props.value==='2 pockets').props.checked,false);
  t.h.unmount();
});
