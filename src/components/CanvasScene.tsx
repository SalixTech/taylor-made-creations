"use client";
import {Children,Fragment,cloneElement,isValidElement,createElement,type ReactElement,type ReactNode,type ElementType} from 'react';
import {getCanvasNodes,resolveCanvasLayout,validCanvasPlacement,type CanvasContent,type CanvasScope} from '@/owner/canvas-layout';
import {canvasInstanceId} from '@/owner/canvas-node-inventory';
import {resolveElementAppearance} from '@/owner/appearance';
import {validElementBox} from '@/owner/box-geometry';
import {CanvasSceneContext} from './CanvasSceneContext';
import styles from './CanvasScene.module.css';
export type CanvasMarker={type:ElementType;target:(props:Record<string,unknown>)=>string|null;expand?:(props:Record<string,unknown>)=>ReactNode};
export type ForceCanvasSlot={scope:'page'|'chrome';id:string;omitNodeId?:string};
type CompiledNode={id:string;target:string;parent:string|null;body:ReactNode;inline:boolean;native:boolean};
function mapNodes(tree:ReactNode,fn:(child:ReactNode)=>ReactNode):ReactNode{const result=Children.map(tree,fn);return !Array.isArray(tree)&&result?.length===1?result[0]:result;}
function OriginalSlot(props:{id:string}){void props;return null;}
/** Compiles only explicit marker identities/native React elements. It never invokes a component. */
export function compileCanvasScene(tree:ReactNode,markers:readonly CanvasMarker[]){
 const nodes=new Map<string,CompiledNode>();
 const replace=(tree:ReactNode,id:string,body:ReactNode):ReactNode=>mapNodes(tree,child=>{if(!isValidElement(child))return child;const el=child as ReactElement<Record<string,unknown>>;if(el.type===OriginalSlot&&el.props.id===id)return body;if(typeof el.type==='string'||el.type===Fragment)return cloneElement(el,{},replace(el.props.children as ReactNode,id,body));return el;});
 const walk=(tree:ReactNode,ancestors:string[],protectedRoot=false):ReactNode=>mapNodes(tree,child=>{
  if(!isValidElement(child))return child;const el=child as ReactElement<Record<string,unknown>>,marker=markers.find(item=>item.type===el.type),target=marker?.target(el.props);
  if(marker?.expand)return walk(marker.expand(el.props),ancestors);
  if(target){const id=canvasInstanceId(target,ancestors);if(nodes.has(id))throw Error(`Duplicate canvas layout identity: ${id}`);const node:CompiledNode={id,target,parent:ancestors.at(-1)??null,body:null,inline:el.props.inline===true||target.startsWith('template-text:')||target.startsWith('core-text:'),native:false};nodes.set(id,node);const children=walk(el.props.children as ReactNode,[...ancestors,id],isValidElement(el.props.children));node.body=cloneElement(el,{},children);return <OriginalSlot key={id} id={id}/>;}
  if(typeof el.type!=='string'&&el.type!==Fragment)return el;
  const children=walk(el.props.children as ReactNode,ancestors),native=cloneElement(el,{},children);
  // Move the complete semantic envelope, not a span out of its heading/label.
  const phrasing=typeof el.type==='string'&&['span','small','strong','em','b','i','u','s','mark','time','cite','abbr','code'].includes(el.type);
  if(!protectedRoot&&typeof el.type==='string'&&(['h1','h2','h3','h4','p','figcaption','label','dt','dd','summary'].includes(el.type)||phrasing)){
   const slots:string[]=[];const collect=(value:ReactNode)=>Children.forEach(value,item=>{if(!isValidElement(item))return;const part=item as ReactElement<Record<string,unknown>>;if(part.type===OriginalSlot)slots.push(String(part.props.id));else if(typeof part.type==='string'||part.type===Fragment)collect(part.props.children as ReactNode);});collect(children);
   const onlySlot=(value:ReactNode):boolean=>{let clean=true;Children.forEach(value,item=>{if(item===null||item===undefined||typeof item==='boolean'||typeof item==='string'&&!item.trim())return;if(!isValidElement(item)){clean=false;return;}const part=item as ReactElement<Record<string,unknown>>;if(part.type===OriginalSlot)return;if(typeof part.type==='string'||part.type===Fragment){if(!onlySlot(part.props.children as ReactNode))clean=false;}else clean=false;});return clean;};
   if(slots.length===1&&(!phrasing||onlySlot(children))){const node=nodes.get(slots[0]);if(node&&node.parent===(ancestors.at(-1)??null)){node.body=replace(native,node.id,node.body);node.inline=false;node.native=true;return <OriginalSlot key={node.id} id={node.id}/>;}}
  }
  return native;
 });
 return {tree:walk(tree,[]),nodes};
}
export function CanvasScene({content,scope,mobile=false,editable=false,markers,children,forceCanvasSlots}:{content:CanvasContent;scope:CanvasScope;mobile?:boolean;editable?:boolean;markers:readonly CanvasMarker[];children:ReactNode;forceCanvasSlots?:ForceCanvasSlot}){
 const kind=scope==='chrome'?'chrome':'page',compiled=compileCanvasScene(children,markers),inventory=new Map(getCanvasNodes(content,scope).map(item=>[item.id,item])),layout=resolveCanvasLayout(content,scope,mobile);
 const saved=scope==='chrome'?content.chromeLayout:scope.canvasLayout;
 const activeSaved=mobile?saved?.mobile:saved?.desktop;
 const missingDestination=[...compiled.nodes.values()].some(node=>{const entry=activeSaved?.[node.id];return !!entry&&!entry.removed&&entry.parentId!==null&&!compiled.nodes.has(entry.parentId);});
 if(missingDestination)return <div role="alert" data-owner-layout-error={editable?'unavailable-destination':undefined}>{editable?'A saved destination box is unavailable. Restore that box or undo the change before continuing.':'This page layout is temporarily unavailable.'}</div>;
 const moved=(node:CompiledNode)=>{const entry=(mobile?saved?.mobile:saved?.desktop)?.[node.id];return !!entry&&(entry.parentId===null||compiled.nodes.has(entry.parentId))&&(!!entry.placement||entry.parentId!==node.parent);};
 const incoming=(parent:string|null)=>[...compiled.nodes.values()].filter(node=>node.id!==forceCanvasSlots?.omitNodeId&&!layout[node.id]?.removed&&inventory.has(node.id)&&moved(node)&&layout[node.id]?.parentId===parent).sort((a,b)=>layout[a.id].order-layout[b.id].order||a.id.localeCompare(b.id));
 // Reorder complete semantic nodes through their existing native slots; do not
 // transplant wrappers or lift default children into absolute layers.
 const reordered=new Map<string,CompiledNode>();
 const groups=new Map<string|null,CompiledNode[]>();
 for(const node of compiled.nodes.values())if(!layout[node.id]?.removed&&!moved(node)&&inventory.get(node.id)?.movable!==false&&!inventory.get(node.id)?.parentLocked){const list=groups.get(node.parent)??[];list.push(node);groups.set(node.parent,list);}
 for(const group of groups.values()){
  if(!(mobile?saved?.mobile:saved?.desktop)||group.every(node=>layout[node.id]?.order===inventory.get(node.id)?.defaultOrder))continue;
  const sorted=[...group].sort((a,b)=>(layout[a.id]?.order??inventory.get(a.id)?.defaultOrder??0)-(layout[b.id]?.order??inventory.get(b.id)?.defaultOrder??0));
  group.forEach((node,index)=>reordered.set(node.id,sorted[index]));
 }
 const attrs=(id:string)=>editable?{'data-owner-layout-id':id,'data-owner-layout-scope':kind}:{};
 const renderTree=(tree:ReactNode,seen:ReadonlySet<string>):ReactNode=>mapNodes(tree,child=>{if(!isValidElement(child))return child;const el=child as ReactElement<Record<string,unknown>>;if(el.type===OriginalSlot){const original=compiled.nodes.get(String(el.props.id)),node=original&&!moved(original)?reordered.get(original.id)??original:original;return node&&node.id!==forceCanvasSlots?.omitNodeId&&!moved(node)?renderNode(node,seen):null;}if(typeof el.type==='string'||el.type===Fragment||markers.some(marker=>marker.type===el.type))return cloneElement(el,{},renderTree(el.props.children as ReactNode,seen));return el;});
 const slot=(id:string|null,seen:ReadonlySet<string>)=><div className={styles.slot} style={id&&layout[id]?.placement?.contentOffset?{translate:`${layout[id].placement!.contentOffset!.xPx}px ${layout[id].placement!.contentOffset!.yPx}px`}:undefined} {...(editable?{'data-owner-layout-slot':id??'__root','data-owner-placement-content':id??'__root','data-owner-layout-scope':kind}:{})}>{incoming(id).map(node=>renderNode(node,seen))}</div>;
 const renderNode=(node:CompiledNode,seen:ReadonlySet<string>):ReactNode=>{
  if(seen.has(node.id)||layout[node.id]?.removed)return null;const next=new Set([...seen,node.id]),entry=layout[node.id],placement=entry?.placement&&validCanvasPlacement(entry.placement)?entry.placement:undefined,hasSlot=incoming(node.id).length>0||forceCanvasSlots?.scope===kind&&forceCanvasSlots.id===node.id;
  // A caption/definition detached from its semantic owner becomes standalone
  // content; keep attributes and content, never orphan figure/dl-only tags.
  const standalone=(tree:ReactNode):ReactNode=>mapNodes(tree,child=>{if(!isValidElement(child))return child;const el=child as ReactElement<Record<string,unknown>>;
   if(typeof el.type==='string')return ['figcaption','dt','dd'].includes(el.type)?createElement(el.type==='figcaption'?'p':'div',{...el.props,key:el.key},el.props.children as ReactNode):el;
   if(markers.some(marker=>marker.type===el.type))return cloneElement(el,{},standalone(el.props.children as ReactNode));
   return el;
  });
  const rawAppearance=node.target==='page-title'&&scope!=='chrome'?(scope.titleAppearance??content.contentOverrides?.styles?.[`${scope.builtinKey}.title`]):node.target.startsWith('block:')?(scope==='chrome'?content.footerBlocks??[]:scope.blocks).find(block=>`block:${block.id}`===node.target)?.appearance:content.contentOverrides?.styles?.[node.target==='home-image'?'home.image':node.target.slice(node.target.indexOf(':')+1)];
  const semanticFrame=node.native&&!placement&&!validElementBox(resolveElementAppearance(rawAppearance,mobile)?.box);
  const rawBody=renderTree(moved(node)?standalone(node.body):node.body,next);let footerSlot=false;
  const insideFooter=(tree:ReactNode):ReactNode=>mapNodes(tree,child=>{if(!isValidElement(child))return child;const element=child as ReactElement<Record<string,unknown>>;if(element.type==='footer'){footerSlot=true;return cloneElement(element,{style:{...(element.props.style as Record<string,unknown>??{}),position:'relative'}},element.props.children as ReactNode,slot(node.id,next));}if(typeof element.type==='string'||element.type===Fragment||markers.some(marker=>marker.type===element.type))return cloneElement(element,{},insideFooter(element.props.children as ReactNode));return element;});
  const slottedBody=node.id==='canvas:layout.site.footer'&&hasSlot?insideFooter(rawBody):rawBody;
  const body=semanticFrame?mapNodes(slottedBody,child=>isValidElement(child)?cloneElement(child as ReactElement<Record<string,unknown>>,attrs(node.id)):child):slottedBody;
  const context={id:node.id,scope:kind as 'page'|'chrome',styleTarget:node.target,placement,outerFrame:!!placement||semanticFrame,childSlot:!footerSlot&&!placement&&hasSlot?slot(node.id,next):undefined};
  if(placement){const m=placement.matrix;return <CanvasSceneContext key={node.id} value={context}><div className={styles.placed} data-owner-layout-placed="true" {...attrs(node.id)} data-owner-edit={editable?node.target:undefined} tabIndex={editable?0:undefined} style={{width:placement.widthPx,height:placement.heightPx,transform:`matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`}}><div className={styles.placedBody} style={{width:placement.widthPx,minHeight:placement.heightPx}}>{body}</div>{!footerSlot&&slot(node.id,next)}</div></CanvasSceneContext>;}

  return <CanvasSceneContext key={node.id} value={context}>{body}</CanvasSceneContext>;
 };
 const rootNeeded=incoming(null).length>0||forceCanvasSlots?.scope===kind&&forceCanvasSlots.id==='__root';
 const authoredSpace=[...compiled.nodes.values()].filter(node=>!layout[node.id]?.removed&&node.target.startsWith('block:')&&scope!=='chrome'&&scope.blocks.some(block=>`block:${block.id}`===node.target&&block.type==='canvas-space')&&layout[node.id]?.parentId===null).flatMap(node=>{const p=layout[node.id]?.placement;if(!p)return [];const m=p.matrix;return [{x:0,y:0},{x:p.widthPx,y:0},{x:0,y:p.heightPx},{x:p.widthPx,y:p.heightPx}].map(c=>({x:m.a*c.x+m.c*c.y+m.e,y:m.b*c.x+m.d*c.y+m.f}));});
 const spaceStyle=authoredSpace.length?{minHeight:Math.max(0,...authoredSpace.map(p=>p.y)),minWidth:Math.max(0,...authoredSpace.map(p=>p.x))}:undefined;
 const output=renderTree(compiled.tree,new Set());
 return rootNeeded?<div className={styles.root} style={spaceStyle}>{output}{slot(null,new Set())}</div>:<>{output}</>;
}
