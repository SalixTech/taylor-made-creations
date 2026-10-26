import {countryName} from './countries.js';
import {acceptedImages, suitTypes, partTypes} from './commission-options';
import {getCommissionField, getCommissionOptionLabel, getCommissionQuestionOrder, getCommissionSectionOrder, type CommissionFieldId, type CommissionFormConfig} from './commission-form-config';
export {acceptedImages, suitTypes, partTypes, headOptions, handOptions, tailOptions, tailSizes, discoveryOptions} from './commission-options';

export type CommissionFormOptions = {additionalPartsQuantities?:boolean;configuration?:CommissionFormConfig};
export type AdditionalPart = {part:typeof partTypes[number];quantity:number};
export type CustomCommissionAnswers = Record<string,string|string[]>;
export type Draft = {email:string;telegram:string;discord:string;tos:string;tosAgreed:boolean;usa:string;country:string;character:string;species:string;suit:string;parts:string[];additionalParts?:AdditionalPart[];customAnswers?:CustomCommissionAnswers;head:string[];hands:string[];tail:string[];tailSize:string;pockets:string;feet:string;sandals:boolean;previous:string;previousCharacter:string;discovery:string;discoveryOther:string;friendName:string;personName:string;additional:string};
export const emptyDraft: Draft = {email:'',telegram:'',discord:'',tos:'',tosAgreed:false,usa:'',country:'',character:'',species:'',suit:'',parts:[],additionalParts:[],customAnswers:{},head:[],hands:[],tail:[],tailSize:'',pockets:'',feet:'',sandals:false,previous:'',previousCharacter:'',discovery:'',discoveryOther:'',friendName:'',personName:'',additional:''};
export function eligible(d:Draft) {const full=d.suit==='Plantigrade fullsuit'||d.suit==='Digitigrade fullsuit';const parts=d.suit==='Parts';return {head:!!d.suit&&!parts,hands:full||['Mini partial','Full partial'].includes(d.suit)||(parts&&d.parts.includes('Hand paws')),tail:full||['Mini partial','Full partial'].includes(d.suit)||(parts&&d.parts.some(p=>p.includes('Tail'))),body:full||(parts&&d.parts.some(p=>p.includes('Body Suit'))),feet:full||d.suit==='Full partial'||(parts&&d.parts.some(p=>p.startsWith('Feetpaws')))};}
/** Additional parts are separate from the parts and options included in a suit. */
export function allowsAdditionalParts(d:Pick<Draft,'suit'>):boolean {return d.suit!=='Parts'&&suitTypes.includes(d.suit as typeof suitTypes[number]);}
function cleanAdditionalParts(d:Draft, options:CommissionFormOptions):AdditionalPart[] {
  if(!allowsAdditionalParts(d))return [];
  return partTypes.flatMap(part=>{
    const selected=d.additionalParts?.find(item=>item.part===part);
    return selected?[{part,quantity:options.additionalPartsQuantities===true?selected.quantity:1}]:[];
  });
}
function cleanCustomAnswers(d:Draft, configuration?:CommissionFormConfig):CustomCommissionAnswers {
  const answers:CustomCommissionAnswers={};
  for(const question of configuration?.customQuestions||[]){
    const value=d.customAnswers?.[question.id];
    if(question.type==='checkboxes')answers[question.id]=Array.isArray(value)?(question.options||[]).filter(option=>value.includes(option.id)).map(option=>option.id):[];
    else if(question.type==='select')answers[question.id]=typeof value==='string'&&question.options?.some(option=>option.id===value)?value:'';
    else answers[question.id]=typeof value==='string'?value:'';
  }
  return answers;
}
export function cleanDraft(d:Draft, options:CommissionFormOptions={}):Draft {
  const e=eligible(d);
  return {...d,country:d.usa==='No'&&countryName(d.country)?d.country:'',friendName:d.discovery==='A friend'?d.friendName:'',personName:d.discovery==='In person'?d.personName:'',parts:d.suit==='Parts'?d.parts:[],additionalParts:cleanAdditionalParts(d,options),customAnswers:cleanCustomAnswers(d,options.configuration),head:e.head?d.head:[],hands:e.hands?d.hands:[],tail:e.tail&&(d.suit==='Parts'||(d.tailSize&&d.tailSize!=='No Tail'))?d.tail:[],tailSize:e.tail&&d.suit!=='Parts'?d.tailSize:'',pockets:e.body?d.pockets:'',feet:e.feet&&d.suit!=='Parts'?d.feet:'',sandals:e.feet?d.sandals:false,previousCharacter:d.previous==='Yes'?d.previousCharacter:'',discoveryOther:d.discovery==='Other'?d.discoveryOther:''};
}
export function transition(d:Draft, patch:Partial<Draft>, options:CommissionFormOptions={}):Draft {const next={...d,...patch};if(next.tos!=='Yes')next.tosAgreed=false;return cleanDraft(next,options);}
export function hasTermsAgreement(d:Draft):boolean {return d.tos==='Yes'&&d.tosAgreed===true;}
export type Reference = {name:string;size:number;type:string};
export function referenceError(files:Reference[]) {if(!files.length)return 'Add a two-view reference sheet (one image can contain both views).';if(files.length>5)return 'Choose no more than 5 images.';if(files.some(f=>!acceptedImages.includes(f.type)))return 'Use JPG, PNG, WebP, GIF or AVIF images only (no SVG).';if(files.some(f=>f.size>30*1024*1024))return 'Each image must be 30 MB or smaller.';if(files.some(f=>f.size===0))return 'Empty image files cannot be used.';return '';}
export function validate(d:Draft, files:Reference[], options:CommissionFormOptions={}) {
  const errors:Record<string,string>={};
  const config=options.configuration,e=eligible(d);
  const shown=(key:CommissionFieldId):boolean=>{
    switch(key){
      case 'country':return d.usa==='No';
      case 'parts':return d.suit==='Parts';
      case 'head':return e.head;
      case 'hands':return e.hands;
      case 'tailSize':return e.tail&&d.suit!=='Parts';
      case 'tail':return e.tail&&(d.suit==='Parts'||!!d.tailSize&&d.tailSize!=='No Tail');
      case 'pockets':return e.body;
      case 'feet':return e.feet&&d.suit!=='Parts';
      case 'sandals':return e.feet;
      case 'additionalParts':return allowsAdditionalParts(d);
      case 'previousCharacter':return d.previous==='Yes';
      case 'friendName':return d.discovery==='A friend';
      case 'personName':return d.discovery==='In person';
      case 'discoveryOther':return d.discovery==='Other';
      default:return true;
    }
  };
  for(const key of getCommissionSectionOrder(config).flatMap(section=>getCommissionQuestionOrder(config,section))){
    if(!Object.hasOwn(emptyDraft,key)||!shown(key as CommissionFieldId)||key==='references')continue;
    const field=getCommissionField(config,key as CommissionFieldId),value=d[key as keyof Draft];
    const missing=Array.isArray(value)?value.length===0:typeof value==='boolean'?!value:!String(value??'').trim();
    if(field.required&&missing)errors[key]=`Complete “${field.label}”.`;
    // Required is an owner preference. Supplied values must still use the field's data format.
    if(field.options&&key!=='additionalParts'&&!missing){
      const values=Array.isArray(value)?value:[value];
      if(values.some(item=>typeof item!=='string'||!field.options!.includes(item)))errors[key]=`Choose a valid option for “${field.label}”.`;
    }
  }
  if(d.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()))errors.email='Enter a valid email address.';
  if(getCommissionField(config,'tos').required&&!hasTermsAgreement(d))errors.tos='Read and agree to the terms of service to continue.';
  // Optional consent is never fabricated: a supplied Yes still needs real acceptance.
  if(d.tos==='Yes'&&!hasTermsAgreement(d))errors.tos='Read and agree to the terms of service to confirm Yes.';
  if(d.usa==='No'&&d.country&&!countryName(d.country))errors.country='Choose a valid shipping country.';
  if(options.additionalPartsQuantities===true&&allowsAdditionalParts(d)&&(d.additionalParts||[]).some(item=>!partTypes.includes(item.part)||!Number.isSafeInteger(item.quantity)||item.quantity<1))errors.additionalParts='Choose a whole-number quantity of at least 1 for each additional part.';
  const answers=cleanCustomAnswers(d,options.configuration);
  for(const question of options.configuration?.customQuestions||[]){
    const value=answers[question.id];
    if(question.required&&(Array.isArray(value)?!value.length:!value?.trim()))errors[`custom-${question.id}`]=`Complete “${question.label}”.`;
  }
  const ref=files.length||getCommissionField(config,'references').required?referenceError(files):'';if(ref)errors.references=ref;
  return errors;
}
export function reviewRows(input:Draft, files:Reference[], options:CommissionFormOptions={}):[string,string][] {
  const d=cleanDraft(input,options),e=eligible(d),config=options.configuration;
  const rows:Partial<Record<CommissionFieldId,[string,string]>>={};
  const label=(key:CommissionFieldId,fallback:string)=>config?.fields?.[key]?.label||fallback;
  const option=(key:CommissionFieldId,value:string)=>getCommissionOptionLabel(config,key,value);
  const add=(key:CommissionFieldId,title:string,value:string)=>{if(value.trim())rows[key]=[label(key,title),value];};
  add('email','Email',d.email.trim());add('telegram','Telegram',d.telegram);add('discord','Discord',d.discord);
  add('tos','Terms of service',hasTermsAgreement(d)?'Agreed':'Not agreed');add('usa','Shipping within USA',option('usa',d.usa));add('country','Shipping country',countryName(d.country));
  add('character','Character',d.character);add('species','Species',d.species);add('references','Reference images',files.map(f=>`${f.name} (${(f.size/1024/1024).toFixed(2)} MB)`).join('; '));add('suit','Suit type',option('suit',d.suit));
  if(d.suit==='Parts')add('parts','Parts',d.parts.map(value=>option('parts',value)).join(', '));
  if(e.head)add('head','Head extras',d.head.map(value=>option('head',value)).join(', ')||'None selected');
  if(e.hands)add('hands','Hand paw extras',d.hands.map(value=>option('hands',value)).join(', ')||'None selected');
  if(e.tail){if(d.tailSize)add('tailSize','Tail size',option('tailSize',d.tailSize));if(d.suit==='Parts'||d.tailSize!=='No Tail')add('tail','Tail extras',d.tail.map(value=>option('tail',value)).join(', ')||'None selected');}
  if(e.body)add('pockets','Body pockets',option('pockets',d.pockets)||'None selected');
  if(e.feet){add('feet','Feet paws',d.suit==='Parts'?d.parts.filter(p=>p.startsWith('Feetpaws')).map(value=>option('parts',value)).join(', '):option('feet',d.feet));add('sandals','Sandals',d.sandals?'Requested':'Not requested');}
  if(d.additionalParts?.length)add('additionalParts','Additional Parts',d.additionalParts.map(item=>`${option('additionalParts',item.part)} (quantity: ${item.quantity})`).join('; '));
  add('previous','Commissioned before',option('previous',d.previous));add('previousCharacter','Previous character',d.previousCharacter);add('discovery','How you found Taylor',option('discovery',d.discovery));add('friendName','Friend’s name',d.friendName);add('personName','Person met',d.personName);add('discoveryOther','Other source',d.discoveryOther);add('additional','Additional information',d.additional);
  const customRows:Record<string,[string,string]>={};
  for(const question of config?.customQuestions||[]){
    const answer=d.customAnswers?.[question.id];
    const text=Array.isArray(answer)?answer.map(value=>question.options?.find(option=>option.id===value)?.label||'').filter(Boolean).join(', '):question.type==='select'?question.options?.find(option=>option.id===answer)?.label||'':answer||'';
    if(text.trim())customRows[question.id]=[question.label,text];
  }
  return getCommissionSectionOrder(config).flatMap(section=>getCommissionQuestionOrder(config,section).flatMap(key=>{const row=rows[key as CommissionFieldId]||customRows[key];return row?[row]:[];}));
}

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
