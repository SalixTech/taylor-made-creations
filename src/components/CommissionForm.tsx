'use client';

import TermsAgreement from './TermsAgreement';
import { usePublicSiteState } from './PublicSiteContext';
import { currentTermsIdentity, withCurrentTermsConsent } from '@/content/terms-identity';
import SiteSelect from './SiteSelect';
import CountryPicker from './CountryPicker';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import styles from './CommissionForm.module.css';
import { acceptedImages, discoveryOptions, eligible, emptyDraft, handOptions, headOptions, hasTermsAgreement, checkReferenceSelection, partTypes, reviewRows, suitTypes, tailOptions, tailSizes, transition, validate, type CheckedReference, type Draft } from './commission-model';

export default function CommissionForm() {
  const publication = usePublicSiteState();
  const termsVersion = useMemo(() => currentTermsIdentity(publication), [publication]);
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
  const currentDraft = withCurrentTermsConsent(draft, acceptedTermsVersion, termsVersion);
  const active=eligible(currentDraft);
  const currentReview = review && hasTermsAgreement(currentDraft);
  function update(patch:Partial<Draft>){setDraft(d=>transition(d,patch));setErrors({});}
  const id=(key:string)=>`commission-${key}`;
  function error(key:string){return errors[key]?<p className={styles.error} id={`${id(key)}-error`}>{errors[key]}</p>:null;}
  function field(key:keyof Draft,label:string,required=false,type='text',hint?:string){return <div className={styles.field}><label htmlFor={id(key)}>{label}{required?' *':' (optional)'}</label><input id={id(key)} type={type} required={required} value={String(draft[key])} onChange={e=>update({[key]:e.target.value})} autoComplete={key==='email'?'email':'off'} aria-invalid={!!errors[key]} aria-describedby={[hint?`${id(key)}-hint`:'',errors[key]?`${id(key)}-error`:''].filter(Boolean).join(' ')||undefined}/>{hint&&<p className={styles.hint} id={`${id(key)}-hint`}>{hint}</p>}{error(key)}</div>;}
  function radios(key:keyof Draft,label:string,options:readonly string[],required=false){return <fieldset className={styles.field} id={id(key)} tabIndex={-1} aria-describedby={errors[key]?`${id(key)}-error`:undefined}><legend>{label}{required?' *':' (optional)'}</legend><div className={styles.choices}>{options.map(option=><label key={option}><input type="radio" name={id(key)} value={option} checked={currentDraft[key]===option} required={required} onChange={()=>key==='tos'&&option==='Yes'?setTermsOpen(true):update({[key]:option})}/>{option}</label>)}</div>{error(key)}</fieldset>;}
  function checks(key:'parts'|'head'|'hands'|'tail',label:string,options:readonly string[]){return <fieldset className={styles.field} id={id(key)} tabIndex={-1} aria-describedby={errors[key]?`${id(key)}-error`:undefined}><legend>{label}{key==='parts'?' *':' (optional)'}</legend><div className={styles.choices}>{options.map(option=><label key={option}><input type="checkbox" checked={draft[key].includes(option)} onChange={e=>update({[key]:e.target.checked?[...draft[key],option]:draft[key].filter(x=>x!==option)})}/>{option}</label>)}</div>{error(key)}</fieldset>;}
  function section(title:string,children:ReactNode){return <fieldset className={styles.section}><legend>{title}</legend>{children}</fieldset>;}
  function focusHeading(){requestAnimationFrame(()=>headingRef.current?.focus());}
  function reset(){fileSequence.current+=1;setCheckingFiles(false);setDraft({...emptyDraft});referencesRef.current=[];setReferences([]);setErrors({});setReview(false);setTermsOpen(false);if(fileRef.current)fileRef.current.value='';focusHeading();}
  function onReview(e:FormEvent){e.preventDefault();if(checkingFiles)return;const found=validate(currentDraft,files);setErrors(found);if(Object.keys(found).length){requestAnimationFrame(()=>errorRef.current?.focus());return;}setDraft(d=>transition(d,{}));setReview(true);focusHeading();}
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
  return <section className={styles.form} aria-labelledby="commission-heading"><h2 id="commission-heading" tabIndex={-1} ref={headingRef}>{currentReview?'Review your request':'Tell us about your character'}</h2><p>Build your custom fursuit request, then review the details.</p>{currentReview?<><p>Check your character, contact information and custom options below.</p><dl className={styles.review}>{reviewRows(currentDraft,files).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className={styles.actions}><button type="button" className="button" onClick={()=>{setReview(false);focusHeading();}}>Back to edit</button><button type="button" className={styles.secondary} onClick={reset}>Start over</button><button type="button" className="button" disabled aria-describedby="commission-send-hint">Send request</button></div><p id="commission-send-hint" className={styles.hint}>Online request submission is not available yet.</p></>:<form onSubmit={onReview} noValidate><p className={styles.hint}>* Required. Extras are optional.</p>{Object.keys(errors).length>0&&<div ref={errorRef} tabIndex={-1} className={styles.errors} role="alert"><strong>Please check these details:</strong><ul>{Object.entries(errors).map(([key,message])=><li key={key}><a href={`#${id(key)}`} onClick={e=>{e.preventDefault();document.getElementById(id(key))?.focus();}}>{message}</a></li>)}</ul></div>}
    {section('Your information',<><div className={styles.grid}>{field('email','Email address',true,'email')}{field('telegram','Telegram username')}{field('discord','Discord username')}</div><p><button type="button" className={styles.termsButton} aria-haspopup="dialog" onClick={()=>setTermsOpen(true)}>Read the terms of service</button></p>{radios('tos','Have you read the terms of service?',['Yes','No'],true)}<p className={styles.hint} role="status">{hasTermsAgreement(currentDraft)?'You agreed to the terms of service.':'Choose Yes to read and agree to the terms here before continuing.'}</p>{radios('usa','Will your order ship within the USA?',['Yes','No'],true)}{draft.usa==='No'&&<div className={styles.field}><label htmlFor={id('country')}>Shipping country *</label><CountryPicker id={id('country')} value={draft.country} onChange={country=>update({country})} required invalid={!!errors.country} describedBy={errors.country?`${id('country')}-error`:undefined}/>{error('country')}</div>}<p className={styles.hint}>Shipping outside the USA is supported. Choose your country above when shipping internationally.</p></>)}
    {section('Character information',<><div className={styles.grid}>{field('character','Character’s name',true)}{field('species','Species',true)}</div><div className={styles.field}><label htmlFor={id('references')}>Two-view character reference *</label><div className={styles.filePicker}><input className={styles.fileInput} ref={fileRef} id={id('references')} type="file" disabled={checkingFiles} accept={acceptedImages.join(',')} multiple aria-invalid={!!errors.references} aria-describedby={`${id('references')}-hint${errors.references?` ${id('references')}-error`:''}`} onChange={selectReferences}/><label className={styles.fileButton} aria-disabled={checkingFiles} htmlFor={id('references')}>Choose Files</label><span className={styles.fileCount} role="status">{files.length?`${files.length} ${files.length===1?'file':'files'} selected`:'No files selected'}</span></div><p id={`${id('references')}-hint`} className={styles.hint}>Add 1–5 images, up to 30 MB each. One sheet containing two views is enough. JPG, PNG, WebP, GIF or AVIF; no SVG. Duplicate images cannot be added.</p>{checkingFiles&&<p role="status" className={styles.hint}>Checking image files…</p>}{error('references')}{files.length>0&&<ul className={styles.files}>{files.map((file,index)=><li key={`${index}-${file.name}`}>{file.name} — {(file.size/1024/1024).toFixed(2)} MB<button type="button" aria-label={`Remove ${file.name}`} onClick={()=>removeReference(index)}>Remove</button></li>)}</ul>}</div></>)}
    {section('Fursuit details',<><div className={styles.field}><label htmlFor={id('suit')}>Suit type *</label><SiteSelect id={id('suit')} required value={draft.suit} onChange={suit=>update({suit})} options={suitTypes.map(type=>({value:type,label:type}))} placeholder="Choose a suit type" invalid={!!errors.suit} describedBy={errors.suit?`${id('suit')}-error`:undefined}/>{error('suit')}</div>{draft.suit==='Parts'&&<><p className={styles.hint}>Choose one or multiple parts; a full suit is not required.</p>{checks('parts','Parts',partTypes)}</>}{active.head&&checks('head','Head extras',headOptions)}{active.hands&&<>{checks('hands','Hand paw extras',handOptions)}<p className={styles.hint}>Resin claws are included; plush claws are an optional alternative.</p></>}{active.tail&&<>{draft.suit!=='Parts'&&radios('tailSize','Tail size',tailSizes,true)}{(draft.suit==='Parts'||(draft.tailSize&&draft.tailSize!=='No Tail'))&&checks('tail','Tail extras',tailOptions)}</>}{active.body&&radios('pockets','Body suit pockets',['None','1 pocket','2 pockets'])}{active.feet&&<>{draft.suit!=='Parts'&&radios('feet','Feet paws',['Indoor','Outdoor','One of each'],true)}<p className={styles.hint}>Toe beans are on indoor feet paws only. Outdoor feet paws do not have toe beans.</p><div className={styles.choices}><label><input type="checkbox" checked={draft.sandals} onChange={e=>update({sandals:e.target.checked})}/>Sandals (optional)</label></div></>}</>)}
    {section('A little more about your request',<>{radios('previous','Have you commissioned me before?',['Yes','No'])}{draft.previous==='Yes'&&field('previousCharacter','Last character you commissioned',true)}{radios('discovery','How did you find me?',discoveryOptions)}{draft.discovery==='A friend'&&field('friendName','What is your friend’s name?',true)}{draft.discovery==='In person'&&field('personName','What was the name?',true)}{draft.discovery==='Other'&&field('discoveryOther','How did you find me?',true)}<div className={styles.field}><label htmlFor={id('additional')}>Additional information (optional)</label><textarea id={id('additional')} rows={5} value={draft.additional} onChange={e=>update({additional:e.target.value})}/></div></>)}
    <div className={styles.actions}><button className="button" type="submit" disabled={checkingFiles||!hasTermsAgreement(currentDraft)} aria-describedby="commission-proceed-hint">Review request →</button><button className={styles.secondary} type="button" onClick={reset}>Start over</button></div><p id="commission-proceed-hint" className={styles.hint}>{!hasTermsAgreement(currentDraft)?'Read and agree to the terms of service to continue.':checkingFiles?'Your images are being checked.':'Review your details before sending your request.'}</p>
  </form>}{termsOpen&&<TermsAgreement onDismiss={()=>setTermsOpen(false)} onAgree={()=>{setAcceptedTermsVersion(termsVersion);update({tos:'Yes',tosAgreed:true});setTermsOpen(false);}}/>}</section>;
}
