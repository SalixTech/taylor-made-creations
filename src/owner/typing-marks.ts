import type {OwnerContent} from './model';
import {getInlineTextId,getInlineTextSource,validInlineTextStyle,type InlineTextStyle,type InlineTextSpan,type InlineTextRecord} from './rich-text';
type Content=OwnerContent;
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function cells(text:string,spans:InlineTextSpan[]):InlineTextStyle[]{const result=Array.from(text,()=>({}));for(const span of spans)for(let i=span.start;i<span.end&&i<result.length;i++)result[i]={...span.style};return result;}
function compact(values:InlineTextStyle[]):InlineTextSpan[]{const result:InlineTextSpan[]=[];for(let i=0;i<values.length;){let end=i+1;while(end<values.length&&equal(values[i],values[end]))end++;if(Object.keys(values[i]).length)result.push({start:i,end,style:values[i]});i=end;}return result;}
/** Merge ephemeral typing choices without persisting an empty/collapsed span. */
export function mergePendingInlineTextStyle(current:InlineTextStyle,patch:InlineTextStyle,fonts:Content['fonts']):InlineTextStyle|null{
 if(!validInlineTextStyle(patch,fonts)||Object.keys(current).length&&!validInlineTextStyle(current,fonts))return null;
 const result={...current,...patch};if(patch.font!==undefined)delete result.fontId;else if(patch.fontId!==undefined)delete result.font;
 return result;
}
function typingGraphemeBoundaries(text:string):number[]|null{
 if(typeof Intl.Segmenter==='function')return [...Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text),part=>part.index),text.length];
 if(/[^\x00-\x7f]/.test(text))return null;
 return Array.from({length:text.length+1},(_,index)=>index).filter(index=>!(text[index-1]==='\r'&&text[index]==='\n'));
}
/** Apply a captured native edit and pending marks in the SAME draft transaction.
 * The caller owns source editing and scope/IME fences. No source text is changed here.
 * Exact prefix/suffix anchoring avoids styling the wrong repeated word. */
export function applyPendingInlineTextStyle(before:OwnerContent,after:OwnerContent,pageId:string,target:string,selection:{start:number;end:number;value:string},style:InlineTextStyle,mobile:boolean):boolean{
 const id=getInlineTextId(before,pageId,target),nextId=getInlineTextId(after,pageId,target),old=id&&getInlineTextSource(before,id),next=nextId&&getInlineTextSource(after,nextId);
 if(!before.pages.some(page=>page.id===pageId)||!after.pages.some(page=>page.id===pageId)||!id||id!==nextId||!old||!next||/^price-(item|parts|extras):[^:]+:amount$/.test(id)||old.source!==selection.value||old.text===next.text||!validInlineTextStyle(style,after.fonts))return false;
 const {start,end}=selection,boundaries=typingGraphemeBoundaries(old.text),nextBoundaries=typingGraphemeBoundaries(next.text);
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>old.text.length||!boundaries?.includes(start)||!boundaries.includes(end)||!nextBoundaries)return false;
 const prefix=old.text.slice(0,start),suffix=old.text.slice(end),insertEnd=next.text.length-suffix.length;
 if(insertEnd<start||!next.text.startsWith(prefix)||!next.text.endsWith(suffix))return false;
 const existing=before.contentOverrides?.inlineStyles?.[id],candidate=after.contentOverrides?.inlineStyles?.[id];
 if(existing&&existing.text!==old.text||!equal(existing,candidate))return false;
 const record:InlineTextRecord=existing?structuredClone(existing):{text:old.text,spans:[],...((before.design?.mobileLayoutEnabled||before.design?.mobileDesign!==undefined)?{mobile:[]}: {})};
 const first=Array.from(prefix).length,last=Array.from(old.text.slice(0,end)).length,inserted=Array.from(next.text.slice(start,insertEnd)).length;
 const rebase=(spans:InlineTextSpan[])=>{const values=cells(old.text,spans),replaced=values.slice(first,last),inherit=replaced.length&&replaced.every(value=>equal(value,replaced[0]))?replaced[0]:first>0&&last<values.length&&equal(values[first-1],values[last])?values[first-1]:{};return compact([...values.slice(0,first),...Array.from({length:inserted},()=>({...inherit})),...values.slice(last)]);};
 record.spans=rebase(record.spans);if(record.mobile!==undefined)record.mobile=rebase(record.mobile);record.text=next.text;
 if(inserted){const low=nextBoundaries.filter(value=>value<=start).at(-1)??0,high=nextBoundaries.find(value=>value>=insertEnd)??next.text.length,from=Array.from(next.text.slice(0,low)).length,to=Array.from(next.text.slice(0,high)).length,values=cells(next.text,mobile?(record.mobile??[]):record.spans);for(let i=from;i<to;i++){values[i]={...values[i],...style};if(style.font!==undefined)delete values[i].fontId;else if(style.fontId!==undefined)delete values[i].font;}if(mobile)record.mobile=compact(values);else record.spans=compact(values);}
 after.contentOverrides??={};after.contentOverrides.inlineStyles??={};after.contentOverrides.inlineStyles[id]=record;return true;
}
/** Explicit saved marks at a caret, using the preceding character except at start.
 * Theme/inherited CSS is intentionally not materialized into saved spans. */
export function inlineTextStyleAtCaret(content:OwnerContent,pageId:string,target:string,selection:{start:number;end:number;value:string},mobile:boolean):InlineTextStyle|null{
 const id=getInlineTextId(content,pageId,target),source=id&&getInlineTextSource(content,id);
 if(!id||!source||/^price-(item|parts|extras):[^:]+:amount$/.test(id)||source.source!==selection.value||selection.start!==selection.end||!typingGraphemeBoundaries(source.text)?.includes(selection.start))return null;
 const record=content.contentOverrides?.inlineStyles?.[id];if(record&&record.text!==source.text)return null;
 const offset=Array.from(source.text.slice(0,selection.start)).length,index=offset>0?offset-1:0;
 const span=(mobile?(record?.mobile??[]):record?.spans??[]).find(span=>span.start<=index&&span.end>index);
 return span?{...span.style}:{};
}
