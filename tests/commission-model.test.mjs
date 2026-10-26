import {test} from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';
const {emptyDraft,eligible,transition,validate,referenceError,reviewRows,suitTypes,imageSignatureMatches,hasTermsAgreement,checkReferenceSelection} = sourceLoader()('src/components/commission-model.ts');
const image={name:'two-views.png',type:'image/png',size:1024};
const valid={...emptyDraft,email:'test@example.com',tos:'Yes',tosAgreed:true,usa:'No',country:'CA',character:'Fox',species:'Fox',suit:'Head only'};
test('one sheet, international shipping, optional contact and history are valid',()=>assert.deepEqual(validate(valid,[image]),{}));
test('email, TOS, shipping and character reference required',()=>{const errors=validate(emptyDraft,[]);for(const key of ['email','tos','usa','character','species','suit','references'])assert.ok(errors[key]);assert.ok(validate({...valid,tos:'No'},[image]).tos);});
test('reference count, exact per-file limit, empty files and allowlist',()=>{assert.equal(referenceError([{...image,size:30*1024*1024}]),'');assert.ok(referenceError([{...image,size:30*1024*1024+1}]));assert.ok(referenceError([{...image,size:0}]));assert.ok(referenceError(Array(6).fill(image)));assert.ok(referenceError([{...image,type:'image/svg+xml'}]));assert.equal(referenceError(Array(5).fill({...image,size:30*1024*1024})), '');});
test('all six option limiters',()=>{const expected=[[true,false,false,false,false],[true,true,true,false,false],[true,true,true,false,true],[true,true,true,true,true],[true,true,true,true,true],[false,false,false,false,false]];suitTypes.forEach((suit,i)=>assert.deepEqual(Object.values(eligible({...valid,suit})),expected[i]));});
test('switch types clears hidden options and preserves common data',()=>{const full={...valid,suit:'Digitigrade fullsuit',head:['NFC Chip'],hands:['Squeakers'],tail:['Squeaker'],tailSize:'Large (16–30 inches)',feet:'Outdoor',sandals:true,pockets:'2 pockets'};const head=transition(full,{suit:'Head only'});assert.deepEqual(head.hands,[]);assert.deepEqual(head.tail,[]);assert.equal(head.feet,'');assert.equal(head.pockets,'');assert.equal(head.sandals,false);assert.equal(head.email,full.email);assert.deepEqual(head.head,['NFC Chip']);const back=transition(head,{suit:full.suit});assert.deepEqual(back.hands,[]);assert.equal(back.tailSize,'');});
test('parts supports multiple parts and removes options when part removed',()=>{let d=transition(valid,{suit:'Parts',parts:['Hand paws','Feetpaws (indoor)','Large Tail','Plantigrade Body Suit'],hands:['Squeakers'],tail:['Hidden pocket'],pockets:'1 pocket',sandals:true});assert.equal(eligible(d).head,false);assert.deepEqual(validate(d,[image]),{});d=transition(d,{parts:['Arm sleeves']});assert.deepEqual(d.hands,[]);assert.deepEqual(d.tail,[]);assert.equal(d.pockets,'');assert.equal(d.sandals,false);assert.ok(validate({...d,parts:[]},[image]).parts);});
test('No Tail clears extras and excludes them from review',()=>{const d=transition({...valid,suit:'Mini partial',tailSize:'Large (16–30 inches)',tail:['Squeaker']},{tailSize:'No Tail'});assert.deepEqual(d.tail,[]);assert.ok(!reviewRows(d,[image]).some(([key])=>key==='Tail extras'));});
test('conditional prior commission and Other source are required, cleared and excluded',()=>{let d={...valid,previous:'Yes',discovery:'Other'};assert.ok(validate(d,[image]).previousCharacter);assert.ok(validate(d,[image]).discoveryOther);d=transition({...d,previousCharacter:'Old fox',discoveryOther:'Search'},{previous:'No',discovery:'Twitch'});assert.equal(d.previousCharacter,'');assert.equal(d.discoveryOther,'');assert.ok(!reviewRows(d,[image]).some(([key])=>key==='Previous character'||key==='Other source'));});
test('feet and tail choices required only when relevant; no invisible stale payload',()=>{assert.ok(validate({...valid,suit:'Full partial'},[image]).feet);assert.ok(validate({...valid,suit:'Mini partial'},[image]).tailSize);const rows=reviewRows({...valid,hands:['Squeakers'],feet:'Indoor',tailSize:'No Tail',pockets:'2 pockets'},[image]);assert.ok(!rows.some(([key])=>['Hand paw extras','Feet paws','Tail size','Body pockets'].includes(key)));});

test('byte signatures reject renamed text and SVG even with allowed MIME',()=>{const text=new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');for(const type of ['image/jpeg','image/png','image/webp','image/gif','image/avif'])assert.equal(imageSignatureMatches(text,type),false);assert.equal(imageSignatureMatches(new Uint8Array([137,80,78,71,13,10,26,10]),'image/png'),true);assert.equal(imageSignatureMatches(new Uint8Array([255,216,255]),'image/jpeg'),true);assert.equal(imageSignatureMatches(new TextEncoder().encode('GIF89a'),'image/gif'),true);assert.equal(imageSignatureMatches(new TextEncoder().encode('RIFF0000WEBP'),'image/webp'),true);});
test('AVIF major and compatible brands; malformed or unrelated brands rejected',()=>{function box(major,compatible){const b=new Uint8Array(20);new DataView(b.buffer).setUint32(0,20);b.set(new TextEncoder().encode('ftyp'),4);b.set(new TextEncoder().encode(major),8);b.set(new TextEncoder().encode(compatible),16);return b;}assert.equal(imageSignatureMatches(box('avif','mif1'),'image/avif'),true);assert.equal(imageSignatureMatches(box('mif1','avif'),'image/avif'),true);assert.equal(imageSignatureMatches(box('mif1','avis'),'image/avif'),true);assert.equal(imageSignatureMatches(box('mif1','heic'),'image/avif'),false);assert.equal(imageSignatureMatches(box('avif','mif1').slice(0,15),'image/avif'),false);});


test('international country is required, validated and cleared for USA shipping',()=>{assert.ok(validate({...valid,country:''},[image]).country);assert.ok(validate({...valid,country:'US'},[image]).country);assert.ok(validate({...valid,country:'ZZ'},[image]).country);assert.deepEqual(validate({...valid,country:'JP'},[image]),{});const domestic=transition(valid,{usa:'Yes'});assert.equal(domestic.country,'');assert.ok(!reviewRows({...valid,usa:'Yes'},[image]).some(([label])=>label==='Shipping country'));assert.ok(reviewRows(valid,[image]).some(([label,value])=>label==='Shipping country'&&value==='Canada'));});
test('referral names required only for selected source, clear on change and sanitize review',()=>{assert.ok(validate({...valid,discovery:'A friend'},[image]).friendName);assert.ok(validate({...valid,discovery:'In person'},[image]).personName);const friend={...valid,discovery:'A friend',friendName:'Alex'};assert.deepEqual(validate(friend,[image]),{});const person=transition(friend,{discovery:'In person',personName:'Taylor'});assert.equal(person.friendName,'');assert.deepEqual(validate(person,[image]),{});const other=transition(person,{discovery:'Other'});assert.equal(other.personName,'');assert.ok(validate(other,[image]).discoveryOther);assert.ok(!reviewRows({...valid,friendName:'Stale',personName:'Stale'},[image]).some(([label])=>label==='Friend’s name'||label==='Person met'));});

test('country options contain every non-US ISO entry once and review rejects an unknown code',async()=>{const {countryOptions,countryName}=await import('../src/components/countries.js');assert.equal(countryOptions.length,248);assert.equal(new Set(countryOptions.map(option=>option.value)).size,248);assert.ok(countryOptions.every(option=>/^[A-Z]{2}$/.test(option.value)&&option.value!=='US'&&option.label));assert.equal(countryName('US'),'');assert.equal(countryName('ZZ'),'');assert.ok(!reviewRows({...valid,country:'ZZ'},[image]).some(([label])=>label==='Shipping country'));});

test('Yes cannot replace explicit agreement; No revokes agreement and Yes does not restore it',()=>{
  const yesOnly={...valid,tosAgreed:false};
  assert.equal(hasTermsAgreement(yesOnly),false);
  assert.ok(validate(yesOnly,[image]).tos);
  assert.equal(hasTermsAgreement(valid),true);
  const declined=transition(valid,{tos:'No'});
  assert.equal(declined.tosAgreed,false);
  assert.equal(hasTermsAgreement(transition(declined,{tos:'Yes'})),false);
  assert.ok(validate({...valid,tos:'No',tosAgreed:true},[image]).tos);
  assert.ok(reviewRows(valid,[image]).some(([label,value])=>label==='Terms of service'&&value==='Agreed'));
});

const png=(name='reference.png',content=1)=>new File([new Uint8Array([137,80,78,71,13,10,26,10,content])],name,{type:'image/png'});
test('repeated files and byte-identical renamed copies are skipped within and across batches',async()=>{
  const first=png();
  const result=await checkReferenceSelection([],[first,first,png('renamed.png'),png('unique.png',2)]);
  assert.equal(result.status,'checked');
  assert.deepEqual(result.files.map(({file})=>file.name),['reference.png','unique.png']);
  assert.equal(result.errors.length,2);
  assert.ok(result.errors.every(message=>message.includes('duplicate')));
  const next=await checkReferenceSelection(result.files,[png('renamed-again.png'),png('new.png',3)]);
  assert.equal(next.status,'checked');
  assert.deepEqual(next.files.map(({file})=>file.name),['reference.png','unique.png','new.png']);
  assert.match(next.errors[0],/duplicate/);
  assert.equal(new Set(next.files.map(file=>file.fingerprint)).size,3);
});
test('matching filenames and sizes with different image contents are not duplicates',async()=>{
  const result=await checkReferenceSelection([],[png('same.png',1),png('same.png',2)]);
  assert.equal(result.status,'checked');
  assert.equal(result.files.length,2);
  assert.deepEqual(result.errors,[]);
});
test('invalid images are skipped without losing valid files; all image protections remain active',async()=>{
  const tooLarge={name:'large.png',type:'image/png',size:30*1024*1024+1,arrayBuffer(){throw new Error('oversize files must not be read');}};
  const result=await checkReferenceSelection([],[new File(['text'],'fake.png',{type:'image/png'}),new File(['<svg/>'],'vector.svg',{type:'image/svg+xml'}),new File([],'empty.png',{type:'image/png'}),tooLarge,png()]);
  assert.equal(result.status,'checked');
  assert.equal(result.files.length,1);
  assert.equal(result.errors.length,4);
  assert.match(result.errors[0],/supported image format/);
  assert.match(result.errors[1],/no SVG/);
  assert.match(result.errors[2],/Empty image/);
  assert.match(result.errors[3],/30 MB/);
});
test('five unique images are retained, sixth rejected, duplicates at capacity still identified',async()=>{
  const first=await checkReferenceSelection([],Array.from({length:6},(_,i)=>png(`image-${i}.png`,i)));
  assert.equal(first.status,'checked');
  assert.equal(first.files.length,5);
  assert.match(first.errors[0],/no more than 5/);
  const second=await checkReferenceSelection(first.files,[png('renamed.png',0)]);
  assert.equal(second.status,'checked');
  assert.equal(second.files.length,5);
  assert.match(second.errors[0],/duplicate/);
});
test('superseded selection cannot commit when an older file read finishes last',async()=>{
  let sequence=1,finish;
  const slow={name:'old.png',type:'image/png',size:9,arrayBuffer:()=>new Promise(resolve=>{finish=resolve;})};
  const old=checkReferenceSelection([],[slow],()=>sequence===1);
  sequence=2;
  const latest=await checkReferenceSelection([],[png('latest.png',2)],()=>sequence===2);
  finish(await png().arrayBuffer());
  assert.equal((await old).status,'stale');
  assert.equal(latest.status,'checked');
  assert.equal(latest.files[0].file.name,'latest.png');
});
test('reset/removal/unmount invalidation discards both results and errors from a pending read',async()=>{
  for(const failure of [false,true]){
    let current=true,finish;
    const slow={name:'pending.png',type:'image/png',size:9,arrayBuffer:()=>new Promise((resolve,reject)=>{finish=failure?reject:resolve;})};
    const pending=checkReferenceSelection([],[slow],()=>current);
    current=false;
    finish(failure?new Error('late failure'):await png().arrayBuffer());
    assert.deepEqual(await pending,{status:'stale'});
  }
});
test('unreadable selection leaves accepted files intact and allows a later retry',async()=>{
  const existing=await checkReferenceSelection([],[png()]);
  const unreadable={name:'broken.png',type:'image/png',size:9,arrayBuffer:async()=>{throw new Error('read failed');}};
  const result=await checkReferenceSelection(existing.files,[unreadable,png('next.png',2)]);
  assert.equal(result.status,'checked');
  assert.equal(result.files.length,2);
  assert.match(result.errors[0],/could not be checked/);
});

test('all owner-configurable requirements may be optional while provided values retain validation',()=>{
 const configuration={fields:Object.fromEntries(['email','telegram','discord','tos','usa','country','character','species','references','suit','parts','head','hands','tailSize','tail','pockets','feet','sandals','additionalParts','previous','previousCharacter','discovery','friendName','personName','discoveryOther','additional'].map(key=>[key,{required:false}]))};
 assert.deepEqual(validate({...emptyDraft},[],{configuration}),{});
 assert.ok(validate({...emptyDraft,email:'invalid'},[],{configuration}).email);
 assert.ok(validate({...emptyDraft,usa:'invalid'},[],{configuration}).usa);
 assert.ok(validate({...emptyDraft,suit:'invalid'},[],{configuration}).suit);
 assert.ok(validate({...emptyDraft,tos:'Yes',tosAgreed:false},[],{configuration}).tos);
 assert.ok(validate({...emptyDraft},[{name:'bad.svg',size:10,type:'image/svg+xml'}],{configuration}).references);
 assert.deepEqual(validate({...emptyDraft,tos:'No'},[],{configuration}),{});
});
test('conditional extras can be required but do not block when hidden',()=>{
 const configuration={fields:{head:{required:true},hands:{required:true},sandals:{required:true},additionalParts:{required:true}}};
 const errors=validate(valid,[image],{configuration});assert.ok(errors.head);assert.ok(errors.additionalParts);assert.equal(errors.hands,undefined);assert.equal(errors.sandals,undefined);
 const parts=validate({...valid,suit:'Parts',parts:['Hand paws']},[image],{configuration});assert.equal(parts.head,undefined);assert.equal(parts.additionalParts,undefined);assert.ok(parts.hands);
});
