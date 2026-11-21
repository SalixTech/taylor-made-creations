import {test,after,before} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,collection,getDocs} from 'firebase/firestore';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:18080')throw Error('Loopback emulator required');
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-tmc-gold-rules',firestore:{host:'127.0.0.1',port:18080,rules:readFileSync(new URL('../../firebase/firestore.rules',import.meta.url),'utf8')}});});
after(async()=>{await env?.cleanup();});
test('gold accounts and immutable roll records deny all direct browser reads/writes including owner',async()=>{
 for(const context of [env.unauthenticatedContext(),env.authenticatedContext('a4ARjp0z8ZOByKlC2AfGzmMRj843'),env.authenticatedContext('hub:TMC-0000000000000001',{hubRole:'client',hubClientId:'TMC-0000000000000001',hubAuthVersion:1})])for(const path of ['foxGoldAccounts/owner','foxGoldAccounts/TMC-0000000000000001','foxGoldRolls/owner_roll']){
  await assertFails(getDoc(doc(context.firestore(),path)));await assertFails(setDoc(doc(context.firestore(),path),{balance:999}));await assertFails(getDocs(collection(context.firestore(),path.split('/')[0])));
 }
});
