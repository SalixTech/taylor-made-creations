import {test} from 'node:test';import assert from 'node:assert/strict';import {sourceLoader} from './scout-source-loader.mjs';
const api=sourceLoader({'firebase/firestore':{},'firebase/auth':{},'firebase/functions':{},'./taylor-services-client':{}})('src/owner/studio-settings-client.ts');
test('catalog decoder preserves optional legacy settings and validates strict picker IDs',()=>{
 const defaults=api.emptyStudioSettings();assert.deepEqual(defaults.customLabelCatalog,[]);const legacy={...defaults};delete legacy.customLabelCatalog;assert.deepEqual(api.decodeStudioSettings(legacy).customLabelCatalog,[]);
 assert.deepEqual(api.decodeStudioSettings({...defaults,customLabelCatalog:['custom:Commission repeat']}).customLabelCatalog,['custom:Commission repeat']);
 for(const value of [['custom:'],['custom: Bad'],['custom:Bad '],['custom:Hi','custom:hi'],['paid-100'],['custom:New\nline']])assert.throws(()=>api.decodeStudioSettings({...defaults,customLabelCatalog:value}));
});
