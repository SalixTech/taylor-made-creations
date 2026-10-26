'use client';

import TermsAgreement from './TermsAgreement';
import { usePublicSiteState } from './PublicSiteContext';
import { currentTermsIdentity, previewTermsIdentity, withCurrentTermsConsent } from '@/content/terms-identity';
import SiteSelect from './SiteSelect';
import CountryPicker from './CountryPicker';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import styles from './CommissionForm.module.css';
import { COMMISSION_FIELDS, COMMISSION_SECTIONS, getCommissionField, getCommissionOptionLabel, getCommissionQuestionOrder, getCommissionSectionOrder, type CommissionFieldId, type CommissionSectionId, type CommissionFormConfig, type CustomCommissionQuestion } from './commission-form-config';
import { acceptedImages, allowsAdditionalParts, cleanDraft, discoveryOptions, eligible, emptyDraft, handOptions, headOptions, hasTermsAgreement, checkReferenceSelection, partTypes, reviewRows, suitTypes, tailOptions, tailSizes, transition, validate, type CheckedReference, type Draft } from './commission-model';

export type CommissionFormVisualEditor = {
  renderQuestions: (section:CommissionSectionId,questions:{id:string;node:ReactNode}[])=>ReactNode;
  renderSections: (sections:{id:CommissionSectionId;node:ReactNode}[])=>ReactNode;
};
export default function CommissionForm({additionalPartsQuantities,configuration,previewContent,visualEditor}: {additionalPartsQuantities?:boolean;configuration?:CommissionFormConfig;previewContent?:import("@/owner/model").OwnerContent;visualEditor?:CommissionFormVisualEditor} = {}) {
  const publication = usePublicSiteState();
  const quantitiesEnabled = additionalPartsQuantities ?? (publication.status === 'published' && publication.snapshot.content.site.additionalPartsQuantities === true);
  const config = configuration ?? (publication.status === 'published' ? publication.snapshot.content.commissionForm : undefined);
  const formOptions = {additionalPartsQuantities: quantitiesEnabled,configuration:config};
  const [previousQuantitySetting,setPreviousQuantitySetting]=useState(quantitiesEnabled);
  const termsVersion = useMemo(() => previewContent ? previewTermsIdentity(previewContent) : currentTermsIdentity(publication), [publication, previewContent]);
  const [acceptedTermsVersion, setAcceptedTermsVersion] = useState<string | null>(null);
  const [draft,setDraft]=useState<Draft>({...emptyDraft});
  const [references,setReferences]=useState<CheckedReference<File>[]>([]);
  const referencesRef=useRef<CheckedReference<File>[]>([]);
  const files=references.map(reference=>reference.file);
  const [termsOpen,setTermsOpen]=useState(false);
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [review,setReview]=useState(false);
  const [checkingFiles,setCheckingFiles]=useState(false);
  const fileSequence=useRef(0);
  useEffect(()=>()=>{fileSequence.current+=1;},[]);
  const errorRef=useRef<HTMLDivElement>(null);
  const headingRef=useRef<HTMLHeadingElement>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  // A published setting can change while a visitor is editing or reviewing.
  // Turning quantities off must not leave a hidden request for multiple items.
  if(previousQuantitySetting!==quantitiesEnabled){
    setPreviousQuantitySetting(quantitiesEnabled);
    if(!quantitiesEnabled)setDraft(d=>cleanDraft(d,{...formOptions,additionalPartsQuantities:false}));
  }
  const currentDraft = withCurrentTermsConsent(cleanDraft(draft,formOptions), acceptedTermsVersion, termsVersion);
  const active=visualEditor?{head:true,hands:true,tail:true,body:true,feet:true}:eligible(currentDraft);
  const termsReady=!getCommissionField(config,'tos').required||hasTermsAgreement(currentDraft);
  const reviewErrors=review?validate(currentDraft,files,formOptions):{};
  const currentErrors=review||Object.keys(errors).length?validate(currentDraft,files,formOptions):{};
  const visibleErrors={...Object.fromEntries(Object.entries(errors).filter(([key])=>key==='references'||currentErrors[key])),...reviewErrors};
  const currentReview = review && termsReady && Object.keys(reviewErrors).length===0;
  // A newly required published question returns to editing. Completing it must
  // not jump back to review until the client explicitly chooses Review again.
  if(review&&Object.keys(reviewErrors).length){setReview(false);setErrors(reviewErrors);}
  function update(patch:Partial<Draft>){setDraft(d=>transition(d,patch,formOptions));setErrors({});}
  const id=(key:string)=>`commission-${key}`;
  const definition=(key:CommissionFieldId)=>getCommissionField(config,key);
  const optionLabel=(key:CommissionFieldId,value:string)=>getCommissionOptionLabel(config,key,value);
  function error(key:string){return visibleErrors[key]?<p className={styles.error} id={`${id(key)}-error`}>{visibleErrors[key]}</p>:null;}
  function hint(key:CommissionFieldId){const text=definition(key).hint;return text?<p className={styles.hint} id={`${id(key)}-hint`}>{text}</p>:null;}
  function describedBy(key:CommissionFieldId){return [definition(key).hint?`${id(key)}-hint`:'',visibleErrors[key]?`${id(key)}-error`:''].filter(Boolean).join(' ')||undefined;}
  function field(key:CommissionFieldId,type='text'){
    const {label,required}=definition(key);
    return <div className={styles.field}><label htmlFor={id(key)}>{label}{required?' *':' (optional)'}</label><input id={id(key)} type={type} required={required} value={String(currentDraft[key as keyof Draft]??'')} onChange={e=>update({[key]:e.target.value})} autoComplete={key==='email'?'email':'off'} aria-invalid={!!visibleErrors[key]} aria-describedby={describedBy(key)}/>{hint(key)}{error(key)}</div>;
  }
  function radios(key:CommissionFieldId,options:readonly string[]){
    const {label,required}=definition(key);
    return <fieldset className={styles.field} id={id(key)} tabIndex={-1} aria-describedby={describedBy(key)}><legend>{label}{required?' *':' (optional)'}</legend><div className={styles.choices}>{options.map(option=><label key={option}><input type="radio" name={id(key)} value={option} checked={currentDraft[key as keyof Draft]===option} required={required} onChange={()=>key==='tos'&&option==='Yes'?setTermsOpen(true):update({[key]:option})}/>{optionLabel(key,option)}</label>)}</div>{hint(key)}{error(key)}</fieldset>;
  }
  function checks(key:'parts'|'head'|'hands'|'tail',options:readonly string[]){
    const {label,required}=definition(key);
    return <fieldset className={styles.field} id={id(key)} tabIndex={-1} aria-describedby={describedBy(key)}><legend>{label}{required?' *':' (optional)'}</legend><div className={styles.choices}>{options.map(option=><label key={option}><input type="checkbox" checked={currentDraft[key].includes(option)} onChange={e=>update({[key]:e.target.checked?[...currentDraft[key],option]:currentDraft[key].filter(x=>x!==option)})}/>{optionLabel(key,option)}</label>)}</div>{hint(key)}{error(key)}</fieldset>;
  }
  function customQuestion(question:CustomCommissionQuestion){
    const key=`custom-${question.id}`,value=currentDraft.customAnswers?.[question.id],setValue=(value:string|string[])=>update({customAnswers:{...currentDraft.customAnswers,[question.id]:value}});
    const description=[question.hint?`${id(key)}-hint`:'',visibleErrors[key]?`${id(key)}-error`:''].filter(Boolean).join(' ')||undefined;
    const label=<>{question.label}{question.required?' *':' (optional)'}</>;
    const help=<>{question.hint&&<p className={styles.hint} id={`${id(key)}-hint`}>{question.hint}</p>}{error(key)}</>;
    if(question.type==='checkboxes')return <fieldset id={id(key)} tabIndex={-1} className={styles.field} aria-describedby={description}><legend>{label}</legend><div className={styles.choices}>{question.options?.map(option=><label key={option.id}><input type="checkbox" checked={Array.isArray(value)&&value.includes(option.id)} onChange={event=>setValue(event.target.checked?[...(Array.isArray(value)?value:[]),option.id]:(Array.isArray(value)?value:[]).filter(item=>item!==option.id))}/>{option.label}</label>)}</div>{help}</fieldset>;
    return <div className={styles.field}><label htmlFor={id(key)}>{label}</label>{question.type==='select'?<SiteSelect id={id(key)} value={typeof value==='string'?value:''} options={(question.options||[]).map(option=>({value:option.id,label:option.label}))} onChange={setValue} placeholder="Choose an option" required={question.required} invalid={!!visibleErrors[key]} describedBy={description}/>:question.type==='textarea'?<textarea id={id(key)} rows={4} value={typeof value==='string'?value:''} required={question.required} aria-invalid={!!visibleErrors[key]} aria-describedby={description} onChange={event=>setValue(event.target.value)}/>:<input id={id(key)} type="text" value={typeof value==='string'?value:''} required={question.required} aria-invalid={!!visibleErrors[key]} aria-describedby={description} onChange={event=>setValue(event.target.value)}/>} {help}</div>;
  }
  function additionalParts(){
    return <div id={id('additionalParts')} tabIndex={-1} aria-describedby={describedBy('additionalParts')}>
      {config?.fields?.additionalParts?.label&&<h3>{definition('additionalParts').label}</h3>}{hint('additionalParts')}
      <p className={styles.hint}>{quantitiesEnabled?'Select a part to choose how many extras you want.':'Each selected part adds one extra item.'}</p>
      <div className={styles.additionalParts}>{partTypes.map((part,index)=>{
        const selected=currentDraft.additionalParts?.find(item=>item.part===part),display=optionLabel('additionalParts',part);
        return <div className={styles.additionalPart} key={part}><label className={styles.partChoice}><input type="checkbox" checked={!!selected} onChange={e=>update({additionalParts:e.target.checked?[...(currentDraft.additionalParts||[]),{part,quantity:1}]:(currentDraft.additionalParts||[]).filter(item=>item.part!==part)})}/>{display}</label>{quantitiesEnabled&&selected&&<label className={styles.partQuantity} htmlFor={id(`additionalParts-${index}-quantity`)}>Quantity<input id={id(`additionalParts-${index}-quantity`)} type="number" inputMode="numeric" min={1} step={1} value={selected.quantity||''} aria-label={`Quantity for ${display}`} aria-invalid={!!visibleErrors.additionalParts&&(!Number.isSafeInteger(selected.quantity)||selected.quantity<1)} aria-describedby={visibleErrors.additionalParts?`${id('additionalParts')}-error`:undefined} onChange={e=>update({additionalParts:(currentDraft.additionalParts||[]).map(item=>item.part===part?{...item,quantity:Number(e.target.value)}:item)})}/></label>}</div>;
      })}</div>{error('additionalParts')}
    </div>;
  }
  function referenceField(){return <div className={styles.field}><label htmlFor={id('references')}>{definition('references').label}{definition('references').required?' *':' (optional)'}</label><div className={styles.filePicker}><input className={styles.fileInput} ref={fileRef} id={id('references')} type="file" disabled={checkingFiles} accept={acceptedImages.join(',')} multiple aria-invalid={!!visibleErrors.references} aria-describedby={`${id('references')}-rules${config?.fields?.references?.hint?` ${id('references')}-hint`:''}${visibleErrors.references?` ${id('references')}-error`:''}`}  onChange={selectReferences}/><label className={styles.fileButton} aria-disabled={checkingFiles} htmlFor={id('references')}>Choose Files</label><span className={styles.fileCount} role="status">{files.length?`${files.length} ${files.length===1?'file':'files'} selected`:'No files selected'}</span></div><p id={`${id('references')}-rules`} className={styles.hint}>Add 1–5 images, up to 30 MB each. One sheet containing two views is enough. JPG, PNG, WebP, GIF or AVIF; no SVG. Duplicate images cannot be added.</p>{config?.fields?.references?.hint&&hint('references')}{checkingFiles&&<p role="status" className={styles.hint}>Checking image files…</p>}{error('references')}{files.length>0&&<ul className={styles.files}>{files.map((file,index)=><li key={`${index}-${file.name}`}>{file.name} · {(file.size/1024/1024).toFixed(2)} MB<button type="button" aria-label={`Remove ${file.name}`} onClick={()=>removeReference(index)}>Remove</button></li>)}</ul>}</div>;}
  function renderQuestion(key:string):ReactNode{
    const custom=config?.customQuestions?.find(question=>question.id===key);
    if(custom)return customQuestion(custom);
    switch(key){
      case 'email':return field('email','email');
      case 'telegram':case 'discord':case 'character':case 'species':return field(key);
      case 'tos':return <><p><button type="button" className={styles.termsButton} aria-haspopup="dialog" onClick={()=>setTermsOpen(true)}>Read the terms of service</button></p>{radios('tos',['Yes','No'])}<p className={styles.hint} role="status">{hasTermsAgreement(currentDraft)?'You agreed to the terms of service.':definition('tos').required?'Choose Yes to read and agree to the terms here before continuing.':'If you choose Yes, read and agree to the terms here.'}</p></>;
      case 'usa':return <>{radios('usa',['Yes','No'])}<p className={styles.hint}>Shipping outside the USA is supported. Choose your country when shipping internationally.</p></>;
      case 'country':return (visualEditor||currentDraft.usa==='No')?<div className={styles.field}><label htmlFor={id('country')}>{definition('country').label}{definition('country').required?' *':' (optional)'}</label><CountryPicker id={id('country')} value={currentDraft.country} onChange={country=>update({country})} required={definition('country').required} invalid={!!visibleErrors.country} describedBy={describedBy('country')}/>{hint('country')}{error('country')}</div>:null;
      case 'references':return referenceField();
      case 'suit':return <div className={styles.field}><label htmlFor={id('suit')}>{definition('suit').label}{definition('suit').required?' *':' (optional)'}</label><SiteSelect id={id('suit')} required={definition('suit').required} value={currentDraft.suit} onChange={suit=>update({suit})} options={suitTypes.map(type=>({value:type,label:optionLabel('suit',type)}))} placeholder="Choose a suit type" invalid={!!visibleErrors.suit} describedBy={describedBy('suit')}/>{hint('suit')}{error('suit')}</div>;
      case 'parts':return (visualEditor||currentDraft.suit==='Parts')?checks('parts',partTypes):null;
      case 'head':return active.head?checks('head',headOptions):null;
      case 'hands':return active.hands?checks('hands',handOptions):null;
      case 'tailSize':return active.tail&&currentDraft.suit!=='Parts'?radios('tailSize',tailSizes):null;
      case 'tail':return active.tail&&(visualEditor||currentDraft.suit==='Parts'||(currentDraft.tailSize&&currentDraft.tailSize!=='No Tail'))?checks('tail',tailOptions):null;
      case 'pockets':return active.body?radios('pockets',['None','1 pocket','2 pockets']):null;
      case 'feet':return active.feet?(currentDraft.suit!=='Parts'?radios('feet',['Indoor','Outdoor','One of each']):hint('feet')):null;
      case 'sandals':return active.feet?<div className={styles.field} id={id('sandals')} tabIndex={-1}><div className={styles.choices}><label><input type="checkbox" checked={currentDraft.sandals} onChange={e=>update({sandals:e.target.checked})}/>{definition('sandals').label}{definition('sandals').required?' *':' (optional)'}</label></div>{hint('sandals')}</div>:null;
      case 'additionalParts':return (visualEditor||allowsAdditionalParts(currentDraft))?additionalParts():null;
      case 'previous':return radios('previous',['Yes','No']);
      case 'previousCharacter':return (visualEditor||currentDraft.previous==='Yes')?field('previousCharacter'):null;
      case 'discovery':return radios('discovery',discoveryOptions);
      case 'friendName':return (visualEditor||currentDraft.discovery==='A friend')?field('friendName'):null;
      case 'personName':return (visualEditor||currentDraft.discovery==='In person')?field('personName'):null;
      case 'discoveryOther':return (visualEditor||currentDraft.discovery==='Other')?field('discoveryOther'):null;
      case 'additional':return <div className={styles.field}><label htmlFor={id('additional')}>{definition('additional').label}{definition('additional').required?' *':' (optional)'}</label><textarea id={id('additional')} rows={5} value={currentDraft.additional} required={definition('additional').required} aria-invalid={!!visibleErrors.additional} aria-describedby={describedBy('additional')} onChange={e=>update({additional:e.target.value})}/>{hint('additional')}{error('additional')}</div>;
      default:return null;
    }
  }
  function focusHeading(){requestAnimationFrame(()=>headingRef.current?.focus());}
  function reset(){fileSequence.current+=1;setCheckingFiles(false);setDraft({...emptyDraft});referencesRef.current=[];setReferences([]);setErrors({});setReview(false);setTermsOpen(false);if(fileRef.current)fileRef.current.value='';focusHeading();}
  function onReview(e:FormEvent){e.preventDefault();if(checkingFiles)return;const found=validate(currentDraft,files,formOptions);setErrors(found);if(Object.keys(found).length){requestAnimationFrame(()=>errorRef.current?.focus());return;}setDraft(d=>transition(d,{},formOptions));setReview(true);focusHeading();}
  async function selectReferences(event:ChangeEvent<HTMLInputElement>){
    const selected=Array.from(event.target.files||[]);
    event.target.value='';
    if(!selected.length)return;
    const sequence=++fileSequence.current;
    setCheckingFiles(true);
    try {
      const result=await checkReferenceSelection(referencesRef.current,selected,()=>sequence===fileSequence.current);
      if(result.status==='stale'||sequence!==fileSequence.current)return;
      referencesRef.current=result.files;
      setReferences(result.files);
      setErrors(current=>{
        const next={...current};
        if(result.errors.length)next.references=result.errors.join(' ');
        else delete next.references;
        return next;
      });
    } finally {
      if(sequence===fileSequence.current)setCheckingFiles(false);
    }
  }
  function removeReference(index:number){
    fileSequence.current+=1;
    setCheckingFiles(false);
    referencesRef.current=referencesRef.current.filter((_,i)=>i!==index);
    setReferences(referencesRef.current);
    setErrors({});
  }
  return <section className={styles.form} aria-labelledby="commission-heading">
    <h2 id="commission-heading" tabIndex={-1} ref={headingRef}>{currentReview?'Review your request':'Tell us about your character'}</h2><p>Build your custom fursuit request, then review the details.</p>
    {currentReview?<><p>Check your character, contact information and custom options below.</p><dl className={styles.review}>{reviewRows(currentDraft,files,formOptions).map(([label,value],index)=><div key={`${index}-${label}`}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className={styles.actions}><button type="button" className="button" onClick={()=>{setReview(false);focusHeading();}}>Back to edit</button><button type="button" className={styles.secondary} onClick={reset}>Start over</button><button type="button" className="button" disabled aria-describedby="commission-send-hint">Send request</button></div><p id="commission-send-hint" className={styles.hint}>Online request submission is not available yet.</p></>:<form onSubmit={visualEditor?event=>event.preventDefault():onReview} noValidate>
      <p className={styles.hint}>* Required.</p>
      {Object.keys(visibleErrors).length>0&&<div ref={errorRef} tabIndex={-1} className={styles.errors} role="alert"><strong>Please check these details:</strong><ul>{Object.entries(visibleErrors).map(([key,message])=><li key={key}><a href={`#${id(key)}`} onClick={e=>{e.preventDefault();document.getElementById(id(key))?.focus();}}>{message}</a></li>)}</ul></div>}
      {(() => {
        const sections=getCommissionSectionOrder(config).flatMap(section=>{
          if(section==='additionalParts'&&!visualEditor&&!allowsAdditionalParts(currentDraft))return [];
          const title=config?.sectionTitles?.[section]??COMMISSION_SECTIONS.find(item=>item.id===section)!.title;
          const questions=getCommissionQuestionOrder(config,section).flatMap(key=>{
            const question=renderQuestion(key);if(!question)return [];
            const compact=['email','telegram','discord','character','species'].includes(key)&&COMMISSION_FIELDS.some(field=>field.id===key);
            return [{id:key,node:<div key={key} data-commission-question={key} className={compact?styles.compactQuestion:styles.question}>{question}</div>}];
          });
          return [{id:section,node:<fieldset className={styles.section} key={section} data-commission-section={section}><legend>{title}{section==='additionalParts'&&!definition('additionalParts').required?' (optional)':''}</legend>{visualEditor?visualEditor.renderQuestions(section,questions):<div className={styles.questionGrid}>{questions.map(question=>question.node)}</div>}</fieldset>}];
        });
        return visualEditor?visualEditor.renderSections(sections):sections.map(section=>section.node);
      })()}
      {!visualEditor&&<><div className={styles.actions}><button className="button" type="submit" disabled={checkingFiles||!termsReady} aria-describedby="commission-proceed-hint">Review request →</button><button className={styles.secondary} type="button" onClick={reset}>Start over</button></div><p id="commission-proceed-hint" className={styles.hint}>{!termsReady?'Read and agree to the terms of service to continue.':checkingFiles?'Your images are being checked.':'Review your details before sending your request.'}</p></>}
    </form>}
    {termsOpen&&<TermsAgreement previewContent={previewContent} onDismiss={()=>setTermsOpen(false)} onAgree={()=>{setAcceptedTermsVersion(termsVersion);update({tos:'Yes',tosAgreed:true});setTermsOpen(false);}}/>}
  </section>;
}
