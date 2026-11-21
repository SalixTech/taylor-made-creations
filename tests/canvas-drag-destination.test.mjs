import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';
const load=sourceLoader({}),{resolveCanvasDragDestination:resolve}=load('src/owner/canvas-drag-destination.ts'),{transformPoint}=load('src/owner/box-geometry.ts');
const I={a:1,b:0,c:0,d:1,e:0,f:0};
const box=(id,extra={})=>({id,parentId:null,label:id,matrix:I,width:100,height:100,depth:0,ancestorIds:[],...extra});
test('empty and outside candidates select root; containment returns exact label without mutation',()=>{
 const candidates=[box('card',{label:'Commission card'})],before=structuredClone(candidates);
 assert.deepEqual(resolve({x:1,y:1},[]),{kind:'root'});assert.deepEqual(resolve({x:101,y:10},candidates),{kind:'root'});
 assert.deepEqual(resolve({x:10,y:10},candidates),{kind:'target',id:'card',label:'Commission card'});assert.deepEqual(candidates,before);
});
test('inverse affine handles rotation reflection shear and nonuniform scale, not AABB shortcuts',()=>{
 for(const matrix of [{a:0,b:2,c:-3,d:0,e:100,f:10},{a:-2,b:.5,c:1,d:3,e:70,f:-90},{a:.7071067811865476,b:.7071067811865476,c:-.7071067811865476,d:.7071067811865476,e:0,f:0}]){
  const candidate=box('rotated',{matrix});assert.equal(resolve(transformPoint(matrix,{x:20,y:50}),[candidate]).kind,'target');assert.equal(resolve(transformPoint(matrix,{x:-10,y:50}),[candidate]).kind,'root');
 }
 const rotation=box('diamond',{matrix:{a:1,b:1,c:-1,d:1,e:0,f:0}});assert.equal(resolve({x:90,y:10},[rotation]).kind,'root');
});
test('unique innermost target follows full ancestry across omitted intermediate nodes independent of list order',()=>{
 const outer=box('outer'),inner=box('inner',{parentId:'unmeasured',ancestorIds:['unmeasured','outer'],depth:2,width:20,height:20});
 for(const candidates of [[outer,inner],[inner,outer]])assert.deepEqual(resolve({x:10,y:10},candidates),{kind:'target',id:'inner',label:'inner'});
 assert.equal(resolve({x:40,y:40},[inner,outer]).id,'outer');
});
test('unrelated overlapping branches are blocked even with unequal depths and shared edges',()=>{
 const a=box('a'),b=box('b',{parentId:'other',ancestorIds:['other'],depth:1});
 for(const candidates of [[a,b],[b,a]])assert.equal(resolve({x:10,y:10},candidates).kind,'blocked');
 assert.equal(resolve({x:100,y:50},[a,box('adjacent',{matrix:{...I,e:100}})]).kind,'blocked');
});
test('invalid candidate geometry blocks instead of silently falling back to root, even far away',()=>{
 for(const patch of [{width:0},{height:-1},{width:Infinity},{matrix:{...I,a:0}},{matrix:{...I,e:NaN}},{matrix:{...I,a:1e308},width:1e308},{matrix:{...I,a:1e-12}}])assert.equal(resolve({x:10000,y:10000},[box('bad',patch)]).kind,'blocked');
 for(const point of [{x:NaN,y:0},{x:0,y:Infinity}])assert.equal(resolve(point,[box('a')]).kind,'blocked');
});
test('duplicate identity, cycles, inconsistent paths and depth fail closed',()=>{
 for(const candidates of [[box('same'),box('same')],[box('self',{parentId:'self',ancestorIds:['self'],depth:1})],[box('a',{parentId:'x',ancestorIds:['x','x'],depth:2})],[box('a',{depth:3})],[box('a',{parentId:'missing'})],[box('a'),box('b',{parentId:'a',ancestorIds:['a','unexpected'],depth:2})],[box('__root')],[box('a',{parentId:'shared',ancestorIds:['shared','one'],depth:2}),box('b',{parentId:'shared',ancestorIds:['shared','two'],depth:2})]])assert.equal(resolve({x:10,y:10},candidates).kind,'blocked');
});
