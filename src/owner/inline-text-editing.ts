import {makeInlineLink,parseInlineLinks} from './inline-links';
type Unit={text:string;href?:string};
const units=(source:string):Unit[]=>parseInlineLinks(source).flatMap(part=>part.text.split('').map(text=>({text,...(part.href?{href:part.href}:{})})));
export const inlinePlainText=(source:string)=>parseInlineLinks(source).map(part=>part.text).join('');
function serialize(chars:Unit[]):string{let result='';for(let i=0;i<chars.length;){let end=i+1;while(end<chars.length&&chars[end].href===chars[i].href)end++;const text=chars.slice(i,end).map(c=>c.text).join('');const edges=text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;result+=chars[i].href?(edges[1]+(makeInlineLink(edges[2],chars[i].href!)??edges[2])+edges[3]):text;i=end;}return result;}
export function editInlinePlainText(source:string,next:string):string{const old=units(source),plain=old.map(c=>c.text).join('');if(plain===next)return source;let start=0,end=plain.length,nextEnd=next.length;while(start<end&&start<nextEnd&&plain[start]===next[start])start++;while(end>start&&nextEnd>start&&plain[end-1]===next[nextEnd-1]){end--;nextEnd--;}const href=end>start&&old.slice(start,end).every(c=>c.href===old[start]?.href)?old[start]?.href:start>0&&old[start-1]?.href===old[start]?.href?old[start]?.href:undefined;return serialize([...old.slice(0,start),...next.slice(start,nextEnd).split('').map(text=>({text,href})),...old.slice(end)]);}
/** Native offsets stay UTF-16, but editing never bisects a grapheme. Missing
 * Segmenter fails closed for non-ASCII rather than pretending code points are glyphs. */
export function snapGraphemeRange(text:string,start:number,end:number):{start:number;end:number}|null{
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>text.length)return null;
 let boundaries:number[];
 if(typeof Intl.Segmenter==='function')boundaries=[...Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text),part=>part.index),text.length];
 else {if(/[^\x00-\x7f]/.test(text))return null;boundaries=Array.from({length:text.length+1},(_,index)=>index).filter(index=>!(text[index-1]==='\r'&&text[index]==='\n'));}
 const before=(offset:number)=>boundaries.filter(value=>value<=offset).at(-1)??0,after=(offset:number)=>boundaries.find(value=>value>=offset)??text.length;
 if(start===end){const low=before(start),high=after(start),caret=start-low<=high-start?low:high;return{start:caret,end:caret};}
 return{start:before(start),end:after(end)};
}
export type InlineSelection={start:number;end:number;value:string};
export function applyInlineHyperlink(source:string,selection:InlineSelection,label:string,href:string,mode:'selection'|'insert'):string|null{
 if(selection.value!==source||!Number.isSafeInteger(selection.start)||!Number.isSafeInteger(selection.end)||selection.start<0||selection.end<selection.start)return null;
 const chars=units(source);if(selection.end>chars.length||!makeInlineLink(label,href)||mode==='selection'&&selection.start===selection.end)return null;
 const start=selection.start,end=mode==='selection'?selection.end:start,name=label.trim(),destination=href.trim();
 const selectedText=chars.slice(start,end).map(c=>c.text).join(''),leading=mode==='selection'?selectedText.match(/^\s*/)?.[0]??'':'',trailing=mode==='selection'?selectedText.match(/\s*$/)?.[0]??'':'';
 const before=mode==='insert'&&start>0&&!/\s/.test(chars[start-1].text)?[{text:' '}]:[],after=mode==='insert'&&start<chars.length&&!/\s/.test(chars[start].text)?[{text:' '}]:[];
 return serialize([...chars.slice(0,start),...leading.split('').map(text=>({text})),...before,...name.split('').map(text=>({text,href:destination})),...after,...trailing.split('').map(text=>({text})),...chars.slice(end)]);
}
/** Locate the single saved link under a caret or wholly selected link text. Offsets are native UTF-16 textarea offsets. */
export function inlineLinkAtSelection(source:string,selection:InlineSelection):{selection:InlineSelection;label:string;href:string}|null{
 if(selection.value!==source||!Number.isSafeInteger(selection.start)||!Number.isSafeInteger(selection.end)||selection.start<0||selection.end<selection.start)return null;
 let offset=0;
 for(const part of parseInlineLinks(source)){
  const end=offset+part.text.length;
  if(part.href&&selection.start>=offset&&selection.end<=end&&(selection.start<end||selection.start===selection.end&&selection.start===end))return{selection:{start:offset,end,value:source},label:part.text,href:part.href};
  offset=end;
 }
 return null;
}
