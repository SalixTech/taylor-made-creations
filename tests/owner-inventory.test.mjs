import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';
const model = sourceLoader()('src/owner/inventory-model.ts');
const id = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';
const edit = overrides => ({name:'Red fur',kind:'material',categoryId:'',barcode:'FUR-001',tags:['red'],quantity:4.5,unit:'yards',lowStock:2,notes:'',archived:false,...overrides});

test('inventory validates both kinds, fractional stock, tags and bounded values', () => {
  assert.equal(model.validateInventoryEdit(edit()).quantity, 4.5);
  assert.equal(model.validateInventoryEdit(edit({kind:'finished',quantity:1})).kind,'finished');
  for (const value of [-1,Infinity,NaN,1000001,0.0001,'2']) assert.throws(()=>model.validateInventoryEdit(edit({quantity:value})),/Quantity/);
  for (const value of [-1,NaN]) assert.throws(()=>model.validateInventoryEdit(edit({lowStock:value})),/Quantity/);
  assert.throws(()=>model.validateInventoryEdit(edit({barcode:'../bad'})),/barcode/);
  assert.throws(()=>model.validateInventoryEdit(edit({tags:['Red','red']})),/tags/);
  assert.throws(()=>model.validateInventoryEdit(edit({name:' '})),/name/);
  assert.throws(()=>model.validateInventoryEdit(edit({kind:'other'})),/material/);
  assert.deepEqual(model.inventoryTags('red, Red, soft, , soft'),['Red','soft']);
});

test('zero stock overrides low threshold; low threshold is inclusive and configurable', () => {
  assert.equal(model.inventoryStatus({quantity:0,lowStock:0}),'out');
  assert.equal(model.inventoryStatus({quantity:1,lowStock:1}),'low');
  assert.equal(model.inventoryStatus({quantity:1.001,lowStock:1}),'available');
});

test('categories reject duplicate names, identities and stale malformed shape', () => {
  assert.deepEqual(model.decodeInventoryCategories({schemaVersion:1,revision:1,categories:[{id:categoryId,name:'Fur'}]}).categories[0].name,'Fur');
  assert.throws(()=>model.decodeInventoryCategories({schemaVersion:1,revision:1,categories:[{id:categoryId,name:'Fur'},{id,name:'fur'}]}));
  assert.throws(()=>model.decodeInventoryCategories({schemaVersion:1,revision:1,categories:[{id:categoryId,name:'Fur'},{id:categoryId,name:'Eyes'}]}));
});

test('Code39 MOD43 matches known value and bars round-trip independently with quiet zones', () => {
  assert.equal(model.barcodeChecksum('CODE39'),'W');
  assert.equal(model.barcodeChecksum('12345'),'F');
  // Independently convert runs back to standard narrow/wide patterns and map to characters.
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*';
  const patterns = [52,289,97,352,49,304,112,37,292,100,265,73,328,25,280,88,13,268,76,28,259,67,322,19,274,82,7,262,70,22,385,193,448,145,400,208,133,388,196,168,162,138,42,148];
  for (const code of ['CODE39','12345','TMCABCDEFGHIJKL','A-9.0']) {
    const result=model.code39Bars(code); assert.equal(result.bars[0].x,12);
    let decoded='';
    for(let i=0;i<result.bars.length;i+=5) {
      let encoding=0;
      for(let j=0;j<5;j++) { const b=result.bars[i+j]; encoding=(encoding<<1)|(b.width===3?1:0); if(j<4){ const space=result.bars[i+j+1].x-b.x-b.width; assert.ok(space===1||space===3); encoding=(encoding<<1)|(space===3?1:0); } }
      decoded+=chars[patterns.indexOf(encoding)];
    }
    assert.equal(decoded,`*${code}${model.barcodeChecksum(code)}*`);
    const last=result.bars.at(-1); assert.ok(result.width-last.x-last.width>=10);
  }
});

test('scanner search supports exact payload, checksum suffix, names and tags without modifying stock', () => {
  const item=edit();
  for(const query of ['fur-001',model.barcodeAliases(item.barcode)[1],'red fur','red']) assert.equal(model.matchesInventory(item,query),true);
  assert.equal(model.matchesInventory(item,'blue'),false);
  assert.equal(item.quantity,4.5);
  assert.match(model.generatedInventoryBarcode(),/^TMC[A-F0-9]{12}$/);
});

function cloud() {
  const docs=new Map();let fail=false,changed=false;
  const view=path=>({exists:()=>docs.has(path),data:()=>structuredClone(docs.get(path)),id:path.split('/').at(-1)});
  const session={db:{},assertCurrent:()=>{if(changed)throw Error('Session changed');}};
  const api={doc:(_db,...p)=>({path:p.join('/')}),collection:(_db,path)=>({path}),getDoc:async r=>view(r.path),getDocs:async r=>({docs:[...docs.keys()].filter(p=>p.startsWith(r.path+'/')).map(view)}),runTransaction:async(_db,fn)=>{const changes=[];let wrote=false; const tx={get:async r=>{assert.equal(wrote,false,'all reads precede writes');return view(r.path);},set:(r,v)=>{wrote=true;changes.push([r.path,structuredClone(v)]);},delete:r=>{wrote=true;changes.push([r.path,null]);}};const result=await fn(tx);if(fail)throw Error('Network failed');for(const[p,v]of changes){if(v===null)docs.delete(p);else docs.set(p,v);}return result;}};
  const load=sourceLoader({'firebase/firestore/lite':api,'./taylor-services-client':{taylorOwnerSession:async()=>session}});
  return {client:load('src/owner/inventory-client.ts'),docs,fail:()=>fail=true,changeSession:()=>changed=true};
}

test('cloud inventory saves and reserves both scanner forms atomically; duplicate barcode cannot be used',async()=>{
  const c=cloud(); const first=await c.client.saveInventoryItem(null,edit());
  assert.equal(first.revision,1);assert.equal(first.history[0].note,'Opening stock');
  for(const alias of model.barcodeAliases(first.barcode))assert.equal(c.docs.get(`ownerInventoryBarcodes/${model.barcodeKey(alias)}`).itemId,first.id);
  await assert.rejects(c.client.saveInventoryItem(null,edit({name:'Another'})),/already assigned/);
  assert.equal((await c.client.readInventory()).items.length,1);
});

test('stock adjustments preserve history, revisions and archive; stale writes never lose newer stock',async()=>{
  const c=cloud();const first=await c.client.saveInventoryItem(null,edit());
  const second=await c.client.saveInventoryItem(first,edit({quantity:2}),'Used for a commission');
  assert.equal(second.history[0].from,4.5);assert.equal(second.history[0].to,2);assert.equal(second.history[0].note,'Used for a commission');
  await assert.rejects(c.client.saveInventoryItem(first,edit({quantity:7})),/another device/);
  const archived=await c.client.saveInventoryItem(second,edit({quantity:2,archived:true}));
  assert.equal(archived.archived,true);assert.equal(archived.history.length,2);
  const restored=await c.client.saveInventoryItem(archived,edit({quantity:2,archived:false}));assert.equal(restored.archived,false);
});

test('barcode change releases old reservations only after valid atomic commit',async()=>{
  const c=cloud();const first=await c.client.saveInventoryItem(null,edit());
  const second=await c.client.saveInventoryItem(first,edit({barcode:'FUR-002'}));
  for(const alias of model.barcodeAliases(first.barcode))assert.equal(c.docs.has(`ownerInventoryBarcodes/${model.barcodeKey(alias)}`),false);
  for(const alias of model.barcodeAliases(second.barcode))assert.equal(c.docs.get(`ownerInventoryBarcodes/${model.barcodeKey(alias)}`).itemId,first.id);
  c.fail();await assert.rejects(c.client.saveInventoryItem(second,edit({barcode:'FUR-003'})),/Network/);
  assert.equal((await c.client.readInventory()).items[0].barcode,'FUR-002');
});

test('invalid category and signed-out session cannot write, category revisions prevent stale updates',async()=>{
  const c=cloud();await assert.rejects(c.client.saveInventoryItem(null,edit({categoryId})),/no longer/);
  const categories=await c.client.saveInventoryCategories(model.emptyInventoryCategories(),[{id:categoryId,name:'Fur'}]);
  await c.client.saveInventoryItem(null,edit({categoryId}));
  await assert.rejects(c.client.saveInventoryCategories(model.emptyInventoryCategories(),[]),/another device/);
  assert.equal(categories.revision,1);c.changeSession();await assert.rejects(c.client.saveInventoryItem(null,edit({barcode:'OTHER'})),/Session/);
  assert.equal(c.docs.size,4);
});

test('checksum scanner aliases cannot collide with another item barcode',async()=>{
 const c=cloud();const first=await c.client.saveInventoryItem(null,edit({barcode:'12345'}));
 assert.equal(model.barcodeAliases(first.barcode)[1],'12345F');
 await assert.rejects(c.client.saveInventoryItem(null,edit({barcode:'12345F'})),/already assigned/);
});

test('inventory snapshots edits before asynchronous session lookup and stores units in history',async()=>{
 const c=cloud();const input=edit();const pending=c.client.saveInventoryItem(null,input);input.name='Changed after click';input.tags.push('later');const saved=await pending;
 assert.equal(saved.name,'Red fur');assert.deepEqual(saved.tags,['red']);
 const next=await c.client.saveInventoryItem(saved,edit({quantity:4.5,unit:'metres'}),'Corrected unit');
 assert.equal(next.history[0].fromUnit,'yards');assert.equal(next.history[0].unit,'metres');
 assert.equal(next.history[1].unit,'yards');
});

test('legacy category settings and fractional stock survive, new thresholds accept only whole or half values', async()=>{
 const c=cloud();const saved=await c.client.saveInventoryItem(null,edit({quantity:2.375,lowStock:0.5}));
 assert.equal(saved.quantity,2.375);
 for(const lowStock of [0,0.5,1,1.5,999999.5,1000000]) assert.doesNotThrow(()=>model.validateInventoryEdit(edit({lowStock})));
 for(const lowStock of [0.1,0.25,0.75,1.001]) assert.throws(()=>model.validateInventoryEdit(edit({lowStock})),/whole number or half/);
 c.docs.get(`ownerInventory/${saved.id}`).lowStock=0.125;
 const legacy=(await c.client.readInventory()).items[0]; assert.equal(legacy.lowStock,0.125);
 const renamed=await c.client.saveInventoryItem(legacy,{...legacy,name:'Renamed legacy stock'});
 assert.equal(renamed.lowStock,0.125);assert.equal(renamed.quantity,2.375);
 await assert.rejects(c.client.saveInventoryItem(renamed,{...renamed,lowStock:0.25}),/whole number or half/);
});

test('custom item types and units persist in settings without losing legacy categories',async()=>{
 const c=cloud();let settings=await c.client.saveInventoryCategories(model.emptyInventoryCategories(),[{id:categoryId,name:'Fur'}]);
 settings=await c.client.saveInventoryCategories(settings,settings.categories,{itemTypes:[{id,name:'Packaging'}],units:['rolls']});
 const saved=await c.client.saveInventoryItem(null,edit({kind:id,unit:'rolls',categoryId}));assert.equal(saved.kind,id);
 settings=await c.client.saveInventoryCategories(settings,[{id:categoryId,name:'Fabrics'}]);
 assert.equal(settings.itemTypes[0].name,'Packaging');assert.deepEqual(settings.units,['rolls']);
 assert.equal((await c.client.readInventory()).items[0].unit,'rolls');
 await assert.rejects(c.client.saveInventoryCategories(settings,settings.categories,{units:['rolls','Rolls']}),/units/);
 await assert.rejects(c.client.saveInventoryCategories(settings,settings.categories,{itemTypes:[{id,name:'Material'}]}),/types/);
 await assert.rejects(c.client.saveInventoryItem(null,edit({barcode:'NEW',kind:categoryId})),/item type/);
});

test('generated barcodes retry collisions with both scanner aliases without changing existing data',async()=>{
 const c=cloud();const existing=await c.client.saveInventoryItem(null,edit({barcode:'12345'}));
 const candidates=['12345','12345F','UNUSED'];let index=0;
 assert.equal(await c.client.generateAvailableInventoryBarcode(()=>candidates[index++]),'UNUSED');
 assert.equal(index,3);assert.equal((await c.client.readInventory()).items[0].barcode,existing.barcode);
 index=0;assert.equal(model.uniqueInventoryBarcode([existing],()=>candidates[index++]),'UNUSED');
 await assert.rejects(c.client.generateAvailableInventoryBarcode(()=>existing.barcode),/unused barcode/);
 assert.throws(()=>model.uniqueInventoryBarcode([existing],()=>existing.barcode),/unused barcode/);
 // Another device may reserve an offered candidate before save. The atomic save rejects it.
 await c.client.saveInventoryItem(null,edit({barcode:'UNUSED'}));
 await assert.rejects(c.client.saveInventoryItem(null,edit({barcode:'UNUSED'})),/already assigned/);
});
