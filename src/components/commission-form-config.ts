import { discoveryOptions, handOptions, headOptions, partTypes, suitTypes, tailOptions, tailSizes } from './commission-options';

export const COMMISSION_SECTION_IDS = ['contact','character','suit','additionalParts','request'] as const;
export type CommissionSectionId = typeof COMMISSION_SECTION_IDS[number];
export const COMMISSION_FIELD_IDS = ['email','telegram','discord','tos','usa','country','character','species','references','suit','parts','head','hands','tailSize','tail','pockets','feet','sandals','additionalParts','previous','previousCharacter','discovery','friendName','personName','discoveryOther','additional'] as const;
export type CommissionFieldId = typeof COMMISSION_FIELD_IDS[number];
export type CommissionFieldOverride = {label?:string;hint?:string;required?:boolean;optionLabels?:Record<string,string>};
export type CustomCommissionQuestion = {id:string;section:Exclude<CommissionSectionId,'additionalParts'>;label:string;hint?:string;type:'text'|'textarea'|'select'|'checkboxes';options?:{id:string;label:string}[];required:boolean};
export type CommissionFormConfig = {
  sectionOrder?:CommissionSectionId[];
  sectionTitles?:Partial<Record<CommissionSectionId,string>>;
  fields?:Partial<Record<CommissionFieldId,CommissionFieldOverride>>;
  customQuestions?:CustomCommissionQuestion[];
  questionOrder?:Partial<Record<CommissionSectionId,string[]>>;
};
export type CommissionFieldDefinition = {id:CommissionFieldId;section:CommissionSectionId;label:string;hint?:string;required:boolean;requiredEditable:boolean;options?:readonly string[]};
export const MAX_CUSTOM_COMMISSION_QUESTIONS = 20;
export const MAX_CUSTOM_COMMISSION_OPTIONS = 20;
export const MAX_COMMISSION_LABEL_LENGTH = 160;
export const MAX_COMMISSION_HINT_LENGTH = 1000;
export const COMMISSION_SECTIONS:readonly {id:CommissionSectionId;title:string}[] = [
  {id:'contact',title:'Your information'},
  {id:'character',title:'Character information'},
  {id:'suit',title:'Fursuit details'},
  {id:'additionalParts',title:'Additional Parts'},
  {id:'request',title:'A little more about your request'},
];
const field=(id:CommissionFieldId,section:CommissionSectionId,label:string,required=false,options?:readonly string[],hint?:string,requiredEditable=true):CommissionFieldDefinition=>({id,section,label,required,requiredEditable,...(options?{options}:{}),...(hint?{hint}:{})});
export const COMMISSION_FIELDS:readonly CommissionFieldDefinition[] = [
  field('email','contact','Email address',true),
  field('telegram','contact','Telegram username',false,undefined,undefined,true),
  field('discord','contact','Discord username',false,undefined,undefined,true),
  field('tos','contact','Have you read the terms of service?',true,['Yes','No']),
  field('usa','contact','Will your order ship within the USA?',true,['Yes','No']),
  field('country','contact','Shipping country',true),
  field('character','character','Character’s name',true),
  field('species','character','Species',true),
  field('references','character','Two-view character reference',true,undefined,'Add 1–5 images, up to 30 MB each. One sheet containing two views is enough. JPG, PNG, WebP, GIF or AVIF; no SVG. Duplicate images cannot be added.'),
  field('suit','suit','Suit type',true,suitTypes),
  field('parts','suit','Parts',true,partTypes,'Choose one or multiple parts; a full suit is not required.'),
  field('head','suit','Head extras',false,headOptions),
  field('hands','suit','Hand paw extras',false,handOptions,'Resin claws are included; plush claws are an optional alternative.'),
  field('tailSize','suit','Tail size',true,tailSizes),
  field('tail','suit','Tail extras',false,tailOptions),
  field('pockets','suit','Body suit pockets',false,['None','1 pocket','2 pockets']),
  field('feet','suit','Feet paws',true,['Indoor','Outdoor','One of each'],'Toe beans are on indoor feet paws only. Outdoor feet paws do not have toe beans.'),
  field('sandals','suit','Sandals'),
  field('additionalParts','additionalParts','Additional Parts',false,partTypes,'Choose any extra or spare parts you would like to purchase with your suit. These are additional to the parts included in your selected suit type.'),
  field('previous','request','Have you commissioned me before?',false,['Yes','No'],undefined,true),
  field('previousCharacter','request','Last character you commissioned',true),
  field('discovery','request','How did you find me?',false,discoveryOptions,undefined,true),
  field('friendName','request','What is your friend’s name?',true),
  field('personName','request','What was the name?',true),
  field('discoveryOther','request','How did you find me?',true),
  field('additional','request','Additional information',false,undefined,undefined,true),
];

export function getCommissionSectionOrder(config?:CommissionFormConfig):CommissionSectionId[] {
  const requested=(config?.sectionOrder||[]).filter(id=>COMMISSION_SECTION_IDS.includes(id));
  return [...new Set([...requested,...COMMISSION_SECTION_IDS])];
}
export function getCommissionQuestionOrder(config:CommissionFormConfig|undefined,section:CommissionSectionId):string[] {
  const available=[...COMMISSION_FIELDS.filter(field=>field.section===section).map(field=>field.id),...(config?.customQuestions||[]).filter(question=>question.section===section).map(question=>question.id)];
  const requested=(config?.questionOrder?.[section]||[]).filter(id=>available.includes(id));
  return [...new Set([...requested,...available])];
}
export function getCommissionField(config:CommissionFormConfig|undefined,id:CommissionFieldId):CommissionFieldDefinition {
  const original=COMMISSION_FIELDS.find(field=>field.id===id)!;
  const override=config?.fields?.[id];
  return {...original,label:override?.label??original.label,hint:override?.hint??original.hint,required:override?.required??original.required};
}
export function getCommissionOptionLabel(config:CommissionFormConfig|undefined,id:CommissionFieldId,value:string):string {
  return config?.fields?.[id]?.optionLabels?.[value]??value;
}

export type CommissionConfigIssue={path:string;message:string};
/** This validates configuration only, never client answers or consent. */
export function validateCommissionFormConfig(value:unknown):{valid:boolean;issues:CommissionConfigIssue[]} {
  const issues:CommissionConfigIssue[]=[];
  const issue=(path:string,message:string)=>issues.push({path:`commissionForm${path?'.'+path:''}`,message});
  const object=(value:unknown,path:string):Record<string,unknown>=>{
    if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)){issue(path,'Use a plain form configuration object.');return {};}
    return value as Record<string,unknown>;
  };
  const exact=(value:Record<string,unknown>,allowed:readonly string[],path:string)=>{for(const key of Object.keys(value))if(!allowed.includes(key))issue(path?`${path}.${key}`:key,'This form setting is not supported.');};
  const text=(value:unknown,path:string,max=MAX_COMMISSION_LABEL_LENGTH,required=true)=>{if(typeof value!=='string'||(required&&!value.trim())||(typeof value==='string'&&value.length>max))issue(path,`Enter ${required?'non-empty ':''}text of at most ${max} characters.`);};
  const boolean=(value:unknown,path:string)=>{if(typeof value!=='boolean')issue(path,'Use true or false.');};
  const list=(value:unknown,path:string,max:number):unknown[]=>{if(!Array.isArray(value)){issue(path,'Use a list.');return [];}if(value.length>max)issue(path,`Use no more than ${max} items.`);return Array.from(value.slice(0,max+1));};
  const unique=(values:unknown[],path:string)=>{const seen=new Set();values.forEach((value,index)=>{if(seen.has(value))issue(`${path}[${index}]`,'Each item must appear only once.');seen.add(value);});};
  const root=object(value,'');
  exact(root,['sectionOrder','sectionTitles','fields','customQuestions','questionOrder'],'');
  if(root.sectionOrder!==undefined){const values=list(root.sectionOrder,'sectionOrder',COMMISSION_SECTION_IDS.length);unique(values,'sectionOrder');values.forEach((value,index)=>{if(!COMMISSION_SECTION_IDS.includes(value as CommissionSectionId))issue(`sectionOrder[${index}]`,'Choose an existing form section.');});}
  if(root.sectionTitles!==undefined){const titles=object(root.sectionTitles,'sectionTitles');exact(titles,COMMISSION_SECTION_IDS,'sectionTitles');for(const [key,value]of Object.entries(titles))text(value,`sectionTitles.${key}`);}
  if(root.fields!==undefined){
    const fields=object(root.fields,'fields');exact(fields,COMMISSION_FIELD_IDS,'fields');
    for(const [id,value]of Object.entries(fields)){
      const base=COMMISSION_FIELDS.find(field=>field.id===id);if(!base)continue;
      const path=`fields.${id}`,entry=object(value,path);exact(entry,['label','hint','required','optionLabels'],path);
      if(entry.label!==undefined)text(entry.label,`${path}.label`);
      if(entry.hint!==undefined)text(entry.hint,`${path}.hint`,MAX_COMMISSION_HINT_LENGTH,false);
      if(entry.required!==undefined){boolean(entry.required,`${path}.required`);}
      if(entry.optionLabels!==undefined){const labels=object(entry.optionLabels,`${path}.optionLabels`);exact(labels,base.options||[],`${path}.optionLabels`);for(const [key,value]of Object.entries(labels))text(value,`${path}.optionLabels.${key}`);}
    }
  }
  const customIds=new Set<string>();
  const customSections=new Map<string,CommissionSectionId>();
  if(root.customQuestions!==undefined){
    for(const [index,value]of list(root.customQuestions,'customQuestions',MAX_CUSTOM_COMMISSION_QUESTIONS).entries()){
      const path=`customQuestions[${index}]`,question=object(value,path);exact(question,['id','section','label','hint','type','options','required'],path);
      const id=question.id;
      if(typeof id!=='string'||!/^custom-[A-Za-z0-9][A-Za-z0-9_-]{0,70}$/.test(id)){issue(`${path}.id`,'Use a stable custom question identifier.');}
      else{if(customIds.has(id))issue(`${path}.id`,'Custom question identifiers must be unique.');customIds.add(id);}
      if(!COMMISSION_SECTION_IDS.includes(question.section as CommissionSectionId)||question.section==='additionalParts')issue(`${path}.section`,'Choose a form section other than Additional Parts.');
      else if(typeof id==='string')customSections.set(id,question.section as CommissionSectionId);
      text(question.label,`${path}.label`);if(question.hint!==undefined)text(question.hint,`${path}.hint`,MAX_COMMISSION_HINT_LENGTH,false);
      boolean(question.required,`${path}.required`);
      if(!['text','textarea','select','checkboxes'].includes(question.type as string))issue(`${path}.type`,'Choose text, long text, single choice or multiple choice.');
      if(question.type==='select'||question.type==='checkboxes'){
        const options=list(question.options,`${path}.options`,MAX_CUSTOM_COMMISSION_OPTIONS);if(options.length===0)issue(`${path}.options`,'Add at least one choice.');
        const optionIds=new Set<string>();
        options.forEach((value,index)=>{const optionPath=`${path}.options[${index}]`,option=object(value,optionPath);exact(option,['id','label'],optionPath);if(typeof option.id!=='string'||!/^option-[A-Za-z0-9][A-Za-z0-9_-]{0,70}$/.test(option.id))issue(`${optionPath}.id`,'Use a stable option identifier.');else{if(optionIds.has(option.id))issue(`${optionPath}.id`,'Option identifiers must be unique within a question.');optionIds.add(option.id);}text(option.label,`${optionPath}.label`);});
      }else if(question.options!==undefined)issue(`${path}.options`,'Only single-choice and multiple-choice questions have choices.');
    }
  }
  if(root.questionOrder!==undefined){
    const orders=object(root.questionOrder,'questionOrder');exact(orders,COMMISSION_SECTION_IDS,'questionOrder');
    for(const [section,value]of Object.entries(orders)){
      const path=`questionOrder.${section}`,values=list(value,path,COMMISSION_FIELD_IDS.length+MAX_CUSTOM_COMMISSION_QUESTIONS);unique(values,path);
      const available=new Set([...COMMISSION_FIELDS.filter(field=>field.section===section).map(field=>field.id),...[...customSections].filter(([,value])=>value===section).map(([id])=>id)]);
      values.forEach((id,index)=>{if(typeof id!=='string'||!available.has(id))issue(`${path}[${index}]`,'Choose a question in this section.');});
    }
  }
  return {valid:issues.length===0,issues};
}

/** Explicit allowlisted clone for publication, preserving stable IDs without private answers. */
export function projectCommissionFormConfig(config:CommissionFormConfig):CommissionFormConfig {
  const result:CommissionFormConfig={};
  if(config.sectionOrder!==undefined)result.sectionOrder=[...config.sectionOrder];
  if(config.sectionTitles!==undefined)result.sectionTitles=Object.fromEntries(COMMISSION_SECTION_IDS.filter(id=>Object.hasOwn(config.sectionTitles!,id)).map(id=>[id,config.sectionTitles![id]]));
  if(config.fields!==undefined)result.fields=Object.fromEntries(COMMISSION_FIELDS.filter(field=>Object.hasOwn(config.fields!,field.id)).map(field=>{const entry=config.fields![field.id]!,copy:CommissionFieldOverride={};for(const key of ['label','hint','required']as const)if(entry[key]!==undefined)Object.assign(copy,{[key]:entry[key]});if(entry.optionLabels!==undefined)copy.optionLabels=Object.fromEntries((field.options||[]).filter(value=>Object.hasOwn(entry.optionLabels!,value)).map(value=>[value,entry.optionLabels![value]]));return[field.id,copy];}));
  if(config.customQuestions!==undefined)result.customQuestions=config.customQuestions.map(question=>({id:question.id,section:question.section,label:question.label,type:question.type,required:question.required,...(question.hint!==undefined?{hint:question.hint}:{}),...(question.options!==undefined?{options:question.options.map(option=>({id:option.id,label:option.label}))}:{})}));
  if(config.questionOrder!==undefined)result.questionOrder=Object.fromEntries(COMMISSION_SECTION_IDS.filter(id=>Object.hasOwn(config.questionOrder!,id)).map(id=>[id,[...config.questionOrder![id]!]]));
  return result;
}
