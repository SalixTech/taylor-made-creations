import {countryName} from './countries.js';
export const suitTypes = ['Head only', 'Mini partial', 'Full partial', 'Plantigrade fullsuit', 'Digitigrade fullsuit', 'Parts'] as const;
export const partTypes = ['Arm sleeves', 'Feetpaws (indoor)', 'Feetpaws (outdoor)', 'Hand paws', 'Short Tail', 'Large Tail', 'Floor Dragger Tail', 'Digitigrade Body Suit', 'Plantigrade Body Suit'] as const;
export const headOptions = ['Room for glasses', 'NFC Chip', 'Removable Eye Lids', 'Squeaker', 'Extra Tongues', 'Pickable Nose', 'Hidden pocket'];
export const handOptions = ['Finger Escapes', 'Squeakers', 'NFC chip(s)', 'Plush claws'];
export const tailOptions = ['Squeaker', 'Hidden pocket'];
export const tailSizes = ['No Tail', 'Short (less than 16 inches; nub style)', 'Large (16–30 inches)', 'Floor dragging tail'];
export const discoveryOptions = ['A friend', 'My website', 'Twitch', 'Twitter', 'Tik Tok', 'In person', 'Other'];
export const acceptedImages = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
export type Draft = {email:string;telegram:string;discord:string;tos:string;tosAgreed:boolean;usa:string;country:string;character:string;species:string;suit:string;parts:string[];head:string[];hands:string[];tail:string[];tailSize:string;pockets:string;feet:string;sandals:boolean;previous:string;previousCharacter:string;discovery:string;discoveryOther:string;friendName:string;personName:string;additional:string};
export const emptyDraft: Draft = {email:'',telegram:'',discord:'',tos:'',tosAgreed:false,usa:'',country:'',character:'',species:'',suit:'',parts:[],head:[],hands:[],tail:[],tailSize:'',pockets:'',feet:'',sandals:false,previous:'',previousCharacter:'',discovery:'',discoveryOther:'',friendName:'',personName:'',additional:''};
export function eligible(d:Draft) {const full=d.suit==='Plantigrade fullsuit'||d.suit==='Digitigrade fullsuit';const parts=d.suit==='Parts';return {head:!!d.suit&&!parts,hands:full||['Mini partial','Full partial'].includes(d.suit)||(parts&&d.parts.includes('Hand paws')),tail:full||['Mini partial','Full partial'].includes(d.suit)||(parts&&d.parts.some(p=>p.includes('Tail'))),body:full||(parts&&d.parts.some(p=>p.includes('Body Suit'))),feet:full||d.suit==='Full partial'||(parts&&d.parts.some(p=>p.startsWith('Feetpaws')))};}
export function cleanDraft(d:Draft):Draft {const e=eligible(d);return {...d,country:d.usa==='No'&&countryName(d.country)?d.country:'',friendName:d.discovery==='A friend'?d.friendName:'',personName:d.discovery==='In person'?d.personName:'',parts:d.suit==='Parts'?d.parts:[],head:e.head?d.head:[],hands:e.hands?d.hands:[],tail:e.tail&&(d.suit==='Parts'||(d.tailSize&&d.tailSize!=='No Tail'))?d.tail:[],tailSize:e.tail&&d.suit!=='Parts'?d.tailSize:'',pockets:e.body?d.pockets:'',feet:e.feet&&d.suit!=='Parts'?d.feet:'',sandals:e.feet?d.sandals:false,previousCharacter:d.previous==='Yes'?d.previousCharacter:'',discoveryOther:d.discovery==='Other'?d.discoveryOther:''};}
export function transition(d:Draft, patch:Partial<Draft>):Draft {const next={...d,...patch};if(next.tos!=='Yes')next.tosAgreed=false;return cleanDraft(next);}
export function hasTermsAgreement(d:Draft):boolean {return d.tos==='Yes'&&d.tosAgreed===true;}
export type Reference = {name:string;size:number;type:string};
export function referenceError(files:Reference[]) {if(!files.length)return 'Add a two-view reference sheet (one image can contain both views).';if(files.length>5)return 'Choose no more than 5 images.';if(files.some(f=>!acceptedImages.includes(f.type)))return 'Use JPG, PNG, WebP, GIF or AVIF images only (no SVG).';if(files.some(f=>f.size>30*1024*1024))return 'Each image must be 30 MB or smaller.';if(files.some(f=>f.size===0))return 'Empty image files cannot be used.';return '';}
export function validate(d:Draft, files:Reference[]) {const errors:Record<string,string>={};const required=(key:keyof Draft,message:string)=>{if(!String(d[key]).trim())errors[key]=message;};required('email','Enter your email address.');if(d.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()))errors.email='Enter a valid email address.';if(!hasTermsAgreement(d))errors.tos='Read and agree to the terms of service to continue.';if(!['Yes','No'].includes(d.usa))errors.usa='Choose whether shipping is within the USA.';if(d.usa==='No'&&!countryName(d.country))errors.country='Choose your shipping country.';required('character','Enter your character’s name.');required('species','Enter your character’s species.');if(!suitTypes.includes(d.suit as typeof suitTypes[number]))errors.suit='Choose a suit type.';if(d.suit==='Parts'&&!d.parts.length)errors.parts='Choose at least one part.';const e=eligible(d);if(e.tail&&d.suit!=='Parts'&&!tailSizes.includes(d.tailSize))errors.tailSize='Choose a tail size or No Tail.';if(e.feet&&d.suit!=='Parts'&&!['Indoor','Outdoor','One of each'].includes(d.feet))errors.feet='Choose indoor, outdoor or one of each.';if(d.previous==='Yes')required('previousCharacter','Enter the last character you commissioned.');if(d.discovery==='A friend')required('friendName','Enter your friend’s name.');if(d.discovery==='In person')required('personName','Enter the name of the person you met.');if(d.discovery==='Other')required('discoveryOther','Tell us how you found Taylor.');const ref=referenceError(files);if(ref)errors.references=ref;return errors;}
export function reviewRows(input:Draft, files:Reference[]):[string,string][] {const d=cleanDraft(input),e=eligible(d);const rows:[string,string][]=[['Email',d.email.trim()],['Telegram',d.telegram],['Discord',d.discord],['Terms of service',hasTermsAgreement(d)?'Agreed':'Not agreed'],['Shipping within USA',d.usa],['Shipping country',countryName(d.country)],['Character',d.character],['Species',d.species],['Reference images',files.map(f=>`${f.name} (${(f.size/1024/1024).toFixed(2)} MB)`).join('; ')],['Suit type',d.suit]];if(d.suit==='Parts')rows.push(['Parts',d.parts.join(', ')]);if(e.head)rows.push(['Head extras',d.head.join(', ')||'None selected']);if(e.hands)rows.push(['Hand paw extras',d.hands.join(', ')||'None selected']);if(e.tail){if(d.tailSize)rows.push(['Tail size',d.tailSize]);if(d.suit==='Parts'||d.tailSize!=='No Tail')rows.push(['Tail extras',d.tail.join(', ')||'None selected']);}if(e.body)rows.push(['Body pockets',d.pockets||'None selected']);if(e.feet){rows.push(['Feet paws',d.suit==='Parts'?d.parts.filter(p=>p.startsWith('Feetpaws')).join(', '):d.feet],['Sandals',d.sandals?'Requested':'Not requested']);}rows.push(['Commissioned before',d.previous],['Previous character',d.previousCharacter],['How you found Taylor',d.discovery],['Friend’s name',d.friendName],['Person met',d.personName],['Other source',d.discoveryOther],['Additional information',d.additional]);return rows.filter(([,value])=>value.trim());}

/** Header sniffing supplements the MIME allowlist; it is not a server-side upload guarantee. */
export function imageSignatureMatches(bytes:Uint8Array, mime:string):boolean {
  const at=(offset:number, text:string)=>[...text].every((c,i)=>bytes[offset+i]===c.charCodeAt(0));
  if(mime==='image/jpeg')return bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(mime==='image/png')return [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
  if(mime==='image/gif')return at(0,'GIF87a')||at(0,'GIF89a');
  if(mime==='image/webp')return at(0,'RIFF')&&at(8,'WEBP');
  if(mime==='image/avif'&&bytes.length>=16&&at(4,'ftyp')) {
    const size=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);
    if(size<16||size>bytes.length)return false;
    if(at(8,'avif')||at(8,'avis'))return true;
    for(let offset=16;offset+4<=size;offset+=4)if(at(offset,'avif')||at(offset,'avis'))return true;
  }
  return false;
}

export type ReadableReference = Reference & {arrayBuffer():Promise<ArrayBuffer>};
export type CheckedReference<T extends Reference = Reference> = {file:T;fingerprint:string};
export type ReferenceSelection<T extends Reference> =
  | {status:'stale'}
  | {status:'checked';files:CheckedReference<T>[];errors:string[]};

/** Compare full file contents, not names or timestamps. A newer selection/reset wins. */
export async function checkReferenceSelection<T extends ReadableReference>(
  existing:CheckedReference<T>[],
  selected:T[],
  isCurrent:()=>boolean=()=>true,
):Promise<ReferenceSelection<T>> {
  const files=[...existing];
  const fingerprints=new Set(existing.map(reference=>reference.fingerprint));
  const errors:string[]=[];
  for(const file of selected) {
    if(!isCurrent())return {status:'stale'};
    const problem=referenceError([file]);
    if(problem) {errors.push(`“${file.name}”: ${problem}`);continue;}
    try {
      const buffer=await file.arrayBuffer();
      if(!isCurrent())return {status:'stale'};
      if(!imageSignatureMatches(new Uint8Array(buffer,0,Math.min(buffer.byteLength,4096)),file.type)) {
        errors.push(`“${file.name}” does not contain a supported image format. Choose genuine JPG, PNG, WebP, GIF or AVIF files.`);
        continue;
      }
      const digest=await crypto.subtle.digest('SHA-256',buffer);
      if(!isCurrent())return {status:'stale'};
      const fingerprint=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
      if(fingerprints.has(fingerprint)) {
        errors.push(`“${file.name}” is a duplicate and was not added. Each image can only be added once.`);
        continue;
      }
      if(files.length>=5) {
        errors.push(`“${file.name}” was not added. Choose no more than 5 images.`);
        continue;
      }
      files.push({file,fingerprint});
      fingerprints.add(fingerprint);
    } catch {
      if(!isCurrent())return {status:'stale'};
      errors.push(`“${file.name}” could not be checked. Please choose it again.`);
    }
  }
  return isCurrent()?{status:'checked',files,errors}:{status:'stale'};
}
