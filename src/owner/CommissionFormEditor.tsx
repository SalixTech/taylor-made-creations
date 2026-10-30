"use client";
import { PencilIcon } from "@/components/PencilIcon";

import { useState } from "react";
import {
  COMMISSION_FIELDS, COMMISSION_SECTIONS, getCommissionField, getCommissionOptionLabel,
  getCommissionQuestionOrder, getCommissionSectionOrder,
  MAX_CUSTOM_COMMISSION_QUESTIONS, MAX_CUSTOM_COMMISSION_OPTIONS, MAX_COMMISSION_LABEL_LENGTH, MAX_COMMISSION_HINT_LENGTH,
  type CommissionFieldId, type CommissionFormConfig, type CommissionSectionId, type CustomCommissionQuestion,
} from "@/components/commission-form-config";
import CommissionForm from "@/components/CommissionForm";
import { OwnerPriceReorderList } from "./OwnerPriceReorderList";
import buttonStyles from "./OwnerButton.module.css";
import { newOwnerId, type OwnerContent } from "./model";
import { Field, OwnerSelect, Toggle } from "./OwnerFields";
import ui from "./OwnerPortal.module.css";
import styles from "./CommissionFormEditor.module.css";

type Props = { content: OwnerContent; onEdit: (change: (draft: OwnerContent) => void) => void; onSaveDraft?:()=>void|Promise<boolean|void>; onPublishLive?:()=>void|Promise<boolean|void>; busy?:boolean };
export function reorderCommissionIds<T extends string>(values:readonly T[],source:string,target:string,after:boolean):T[]{
  if(source===target||!values.includes(source as T)||!values.includes(target as T))return [...values];
  const result=values.filter(id=>id!==source),index=result.indexOf(target as T);
  result.splice(index+(after?1:0),0,source as T);return result;
}
const questionTypes = [
  { value: "text", label: "Short answer" }, { value: "textarea", label: "Long answer" },
  { value: "select", label: "Choose one option" }, { value: "checkboxes", label: "Choose multiple options" },
];
function shifted<T>(values: readonly T[], id: T, direction: -1 | 1): T[] {
  const result=[...values], index=result.indexOf(id), target=index+direction;
  if(index>=0&&target>=0&&target<result.length)[result[index],result[target]]=[result[target],result[index]];
  return result;
}

/** Edits only the owner's in-memory draft. Save and publication stay with OwnerPortal. */
export function CommissionFormEditor({content,onEdit,onSaveDraft,onPublishLive,busy=false}: Props) {
  const config=content.commissionForm;
  const [testing,setTesting]=useState(false);
  const [saving,setSaving]=useState(false);
  const [saveMessage,setSaveMessage]=useState("");
  const locked=busy||saving;
  async function save(mode:"draft"|"live"){
    const callback=mode==="draft"?onSaveDraft:onPublishLive;if(!callback||locked)return;
    setSaving(true);setSaveMessage("");
    try{const ok=await callback();if(ok!==false)setSaveMessage(mode==="draft"?"Form draft saved.":"Form published live.");}
    catch{setSaveMessage("Your form could not be saved. Your edits are still here.");}
    finally{setSaving(false);}
  }
  const [section,setSection]=useState<CommissionSectionId>("contact");
  const [selected,setSelected]=useState<string>("email");
  const [pendingRemoval,setPendingRemoval]=useState<string|null>(null);
  const [editing,setEditing]=useState<"section"|"question"|null>(null);
  const questions=getCommissionQuestionOrder(config,section);
  const selectedId=questions.includes(selected)?selected:questions[0];
  const builtIn=COMMISSION_FIELDS.find(field=>field.id===selectedId);
  const custom=config?.customQuestions?.find(question=>question.id===selectedId);
  const field=builtIn?getCommissionField(config,builtIn.id):null;
  const sectionTitle=config?.sectionTitles?.[section]??COMMISSION_SECTIONS.find(item=>item.id===section)?.title??section;
  const questionIndex=questions.indexOf(selectedId);
  const customCount=config?.customQuestions?.length??0;
  const update=(change:(next:CommissionFormConfig)=>void)=>onEdit(draft=>{draft.commissionForm??={};change(draft.commissionForm);});
  function editField(patch:NonNullable<CommissionFormConfig["fields"]>[CommissionFieldId]) {
    if(!builtIn)return;
    update(next=>{next.fields??={};next.fields[builtIn.id]={...next.fields[builtIn.id],...patch};});
  }
  function editCustom(patch:Partial<CustomCommissionQuestion>) {
    if(!custom)return;
    update(next=>{const item=next.customQuestions?.find(question=>question.id===custom.id);if(item)Object.assign(item,patch);});
  }
  function chooseSection(value:string) {
    const next=value as CommissionSectionId;
    setEditing(section===next&&editing==="section"?null:"section");setSection(next);setSelected(getCommissionQuestionOrder(config,next)[0]??"");setPendingRemoval(null);
  }
  function selectQuestion(sectionId:CommissionSectionId,id:string,toggle=false){setEditing(toggle&&section===sectionId&&selected===id&&editing==="question"?null:"question");setSection(sectionId);setSelected(id);setPendingRemoval(null);}
  function reorderQuestions(sectionId:CommissionSectionId,source:string,target:string,after:boolean){
    update(next=>{next.questionOrder??={};next.questionOrder[sectionId]=reorderCommissionIds(getCommissionQuestionOrder(next,sectionId),source,target,after);});
  }
  function addQuestion() {
    if(customCount>=MAX_CUSTOM_COMMISSION_QUESTIONS||section==="additionalParts")return;
    const id=newOwnerId("custom");
    update(next=>{next.customQuestions??=[];if(next.customQuestions.length>=MAX_CUSTOM_COMMISSION_QUESTIONS)return;next.customQuestions.push({id,section,label:"New question",type:"text",required:false});});
    setSelected(id);setEditing("question");setPendingRemoval(null);
  }
  function removeQuestion() {
    if(!custom||pendingRemoval!==custom.id)return;
    const id=custom.id;
    update(next=>{
      next.customQuestions=next.customQuestions?.filter(question=>question.id!==id);
      for(const key of Object.keys(next.questionOrder??{}) as CommissionSectionId[])next.questionOrder![key]=next.questionOrder![key]?.filter(question=>question!==id);
    });
    setSelected(questions.find(question=>question!==id)??"");setPendingRemoval(null);
  }
  function changeType(value:string) {
    if(!custom)return;
    const type=value as CustomCommissionQuestion["type"];
    if(!questionTypes.some(option=>option.value===value))return;
    update(next=>{
      const question=next.customQuestions?.find(item=>item.id===custom.id);if(!question)return;
      question.type=type;
      if(type==="select"||type==="checkboxes")question.options??=[{id:newOwnerId("option"),label:"Option 1"},{id:newOwnerId("option"),label:"Option 2"}];
      else delete question.options;
    });
  }
  function addOption() {
    if(!custom||!(custom.type==="select"||custom.type==="checkboxes"))return;
    update(next=>{const question=next.customQuestions?.find(item=>item.id===custom.id);if(!question||!question.options||question.options.length>=MAX_CUSTOM_COMMISSION_OPTIONS)return;question.options.push({id:newOwnerId("option"),label:`Option ${question.options.length+1}`});});
  }
  function questionLabel(id:string) {
    const builtin=COMMISSION_FIELDS.find(item=>item.id===id);
    return builtin?getCommissionField(config,builtin.id).label:config?.customQuestions?.find(item=>item.id===id)?.label||"Untitled question";
  }
  const sectionControls=<fieldset disabled={locked} className={styles.inlineFields} data-commission-inline-editor="section">
    <Field label="Section heading" required value={sectionTitle} onChange={value=>update(next=>{next.sectionTitles??={};next.sectionTitles[section]=value.slice(0,MAX_COMMISSION_LABEL_LENGTH);})}/>
    <button type="button" data-owner-button="secondary" className={`${buttonStyles.button} ${buttonStyles.secondary}`} onClick={addQuestion} disabled={customCount>=MAX_CUSTOM_COMMISSION_QUESTIONS||section==="additionalParts"}>Add custom question</button>
  </fieldset>;
  const questionControls=<fieldset disabled={locked} className={styles.inlineFields} data-commission-inline-editor="question">
        {(builtIn||custom)&&<>
          <div className={styles.questionHeading}><h3>{custom?"Custom question":"Built-in question"}</h3><span>{questionIndex+1} of {questions.length}</span></div>

          {builtIn&&field&&<>
            <Field label="Question wording" required value={field.label} onChange={value=>editField({label:value.slice(0,MAX_COMMISSION_LABEL_LENGTH)})}/>
            {!field.label.trim()&&<p className={styles.error} role="status">Add question wording before saving or publishing.</p>}
            <Field label="Help text (optional)" multiline value={field.hint??""} onChange={value=>editField({hint:value.slice(0,MAX_COMMISSION_HINT_LENGTH)})}/>
            <Toggle label="Require an answer" checked={field.required} onChange={required=>editField({required})}/>
            {!!builtIn.options?.length&&<div className={styles.options}><h4>Option wording</h4><p className={ui.help}>These labels can change, but the original option values and form conditions stay the same.</p>{builtIn.options.map(option=><Field key={option} label={`Label for ${option}`} value={getCommissionOptionLabel(config,builtIn.id,option)} onChange={label=>editField({optionLabels:{...config?.fields?.[builtIn.id]?.optionLabels,[option]:label.slice(0,MAX_COMMISSION_LABEL_LENGTH)}})}/>)}</div>}
            <button type="button" data-owner-button="secondary" className={`${buttonStyles.button} ${buttonStyles.secondary}`} disabled={!Object.keys(config?.fields?.[builtIn.id]??{}).some(key=>key!=="required")} onClick={()=>update(next=>{if(!next.fields)return;const required=next.fields[builtIn.id]?.required;if(required===undefined)delete next.fields[builtIn.id];else next.fields[builtIn.id]={required};})}>Reset question wording</button>
          </>}
          {custom&&<>
            <Field label="Question wording" required value={custom.label} onChange={label=>editCustom({label:label.slice(0,MAX_COMMISSION_LABEL_LENGTH)})}/>
            {!custom.label.trim()&&<p className={styles.error} role="status">Add question wording before saving or publishing.</p>}
            <Field label="Help text (optional)" multiline value={custom.hint??""} onChange={hint=>editCustom({hint:hint.slice(0,MAX_COMMISSION_HINT_LENGTH)})}/>
            <OwnerSelect label="Question section" value={custom.section} options={COMMISSION_SECTIONS.filter(item=>item.id!=="additionalParts").map(item=>({value:item.id,label:config?.sectionTitles?.[item.id]??item.title}))} onChange={value=>{
              const destination=value as CustomCommissionQuestion["section"];
              if(destination===custom.section||!COMMISSION_SECTIONS.some(item=>item.id===value&&item.id!=="additionalParts"))return;
              update(next=>{const item=next.customQuestions?.find(question=>question.id===custom.id);if(!item)return;for(const key of Object.keys(next.questionOrder??{}) as CommissionSectionId[])next.questionOrder![key]=next.questionOrder![key]?.filter(id=>id!==item.id);item.section=destination;});
              setSection(destination);setSelected(custom.id);
            }}/>
            <OwnerSelect label="Answer format" value={custom.type} options={questionTypes} onChange={changeType}/>
            <Toggle label="Require an answer" checked={custom.required} onChange={required=>editCustom({required})}/>
            {(custom.type==="select"||custom.type==="checkboxes")&&<div className={styles.options}><h4>Answer options</h4><OwnerPriceReorderList items={custom.options??[]} label="Answer options" itemLabel={option=>option.label} disabled={locked} onReorder={(source,target,after)=>{const ids=reorderCommissionIds((custom.options??[]).map(option=>option.id),source,target,after);editCustom({options:ids.map(id=>custom.options!.find(option=>option.id===id)!)});}} onStep={(source,direction)=>{const option=custom.options?.find(option=>option.id===source);if(option)editCustom({options:shifted(custom.options??[],option,direction)});}}>{(option,handle)=><div className={styles.option}>{handle}<Field label="Option wording" required value={option.label} onChange={label=>editCustom({options:custom.options?.map(item=>item.id===option.id?{...item,label:label.slice(0,MAX_COMMISSION_LABEL_LENGTH)}:item)})}/><button type="button" data-owner-button="secondary" className={`${buttonStyles.button} ${buttonStyles.secondary}`} aria-label={`Remove ${option.label}`} disabled={(custom.options?.length??0)<=1} onClick={()=>editCustom({options:custom.options?.filter(item=>item.id!==option.id)})}>Remove option</button></div>}</OwnerPriceReorderList>{custom.options?.some(option=>!option.label.trim())&&<p className={styles.error} role="status">Give every option a label before saving or publishing.</p>}<button type="button" data-owner-button="secondary" className={`${buttonStyles.button} ${buttonStyles.secondary}`} disabled={(custom.options?.length??0)>=MAX_CUSTOM_COMMISSION_OPTIONS} onClick={addOption}>Add option</button><p className={ui.help}>Keep at least one option. Up to {MAX_CUSTOM_COMMISSION_OPTIONS} options per question.</p></div>}
            {pendingRemoval===custom.id?<div className={styles.removeConfirmation} role="alert"><p>Remove this custom question from the draft form? Clients will no longer see it after you publish.</p><div className={styles.actions}><button type="button" data-owner-button="danger" className={`${buttonStyles.button} ${buttonStyles.danger}`} onClick={removeQuestion}>Confirm remove question</button><button type="button" data-owner-button="secondary" className={`${buttonStyles.button} ${buttonStyles.secondary}`} onClick={()=>setPendingRemoval(null)}>Keep question</button></div></div>:<button type="button" data-owner-button="danger" className={`${buttonStyles.button} ${buttonStyles.danger}`} onClick={()=>setPendingRemoval(custom.id)}>Remove custom question</button>}
          </>}
        </>}

  </fieldset>;
  return <div className={styles.editor} data-commission-form-editor>
    <header className={styles.toolbar}>
      <div><h2>Commission form builder</h2><p>Select a pencil to edit a question. Drag a card to change the order.</p></div>
      <div className={styles.actions}>
        <button type="button" data-owner-button="secondary" className={`${buttonStyles.button} ${buttonStyles.secondary}`} aria-pressed={testing} data-form-mode-control onClick={()=>setTesting(value=>!value)}>{testing?"Edit form":"Test form"}</button>
        {onSaveDraft&&<button type="button" data-owner-button="secondary" className={`${buttonStyles.button} ${buttonStyles.secondary}`} disabled={locked} onClick={()=>void save("draft")}>Save Draft</button>}
        {onPublishLive&&<button type="button" data-owner-button="primary" className={`${buttonStyles.button} ${buttonStyles.primary}`} disabled={locked} onClick={()=>void save("live")}>Publish Live</button>}
      </div>
      <p className={styles.saveStatus} role="status">{saveMessage}</p>
    </header>
    <div className={styles.columns}>
      <div className={styles.preview} data-commission-builder-preview>
        <CommissionForm key={testing?"test":"edit"} previewContent={content} configuration={config??{}} additionalPartsQuantities={content.site.additionalPartsQuantities} visualEditor={testing?undefined:{
          renderSections:items=><OwnerPriceReorderList items={items} label="Form sections" disabled={locked} itemLabel={item=>config?.sectionTitles?.[item.id]??COMMISSION_SECTIONS.find(section=>section.id===item.id)!.title}
            onReorder={(source,target,after)=>update(next=>{next.sectionOrder=reorderCommissionIds(getCommissionSectionOrder(next),source,target,after);})}
            onStep={(source,direction)=>update(next=>{next.sectionOrder=shifted(getCommissionSectionOrder(next),source as CommissionSectionId,direction);})}>
            {(item,handle)=><div className={styles.sectionCanvas}><div className={`${styles.canvasTools} ${styles.sectionTools}`} onClick={event=>{if(!locked && !(event.target as Element | null)?.closest?.("button,input,select,textarea,a,[role=button]"))chooseSection(item.id);}}><h3>{config?.sectionTitles?.[item.id]??COMMISSION_SECTIONS.find(section=>section.id===item.id)!.title}</h3>{handle}<button type="button" data-owner-button="secondary" className={`${buttonStyles.button} ${buttonStyles.secondary}`} aria-expanded={section===item.id&&editing==="section"} onClick={()=>chooseSection(item.id)}>{section===item.id&&editing==="section"?"Done":"Edit Section"}</button></div>{section===item.id&&editing==="section"&&sectionControls}{item.node}</div>}
          </OwnerPriceReorderList>,
          renderQuestions:(sectionId,items)=><OwnerPriceReorderList items={items} label={`Questions in ${sectionId}`} disabled={locked} itemLabel={item=>questionLabel(item.id)} onReorder={(source,target,after)=>reorderQuestions(sectionId,source,target,after)} onStep={(source,direction)=>update(next=>{next.questionOrder??={};next.questionOrder[sectionId]=shifted(getCommissionQuestionOrder(next,sectionId),source,direction);})}>
            {(item,handle)=><div className={styles.questionCanvas} data-selected={editing==="question"&&section===sectionId&&selectedId===item.id}>
              <div className={styles.canvasTools}>{handle}<button type="button" data-owner-button="secondary" className={`${buttonStyles.button} ${buttonStyles.quiet} ${styles.editPencil}`} aria-label={`Edit ${questionLabel(item.id)}`} title={`Edit ${questionLabel(item.id)}`} aria-expanded={editing==="question"&&section===sectionId&&selectedId===item.id} onClick={()=>selectQuestion(sectionId,item.id,true)}><PencilIcon size={17} /></button></div>
              {editing==="question"&&section===sectionId&&selectedId===item.id&&questionControls}
              <div className={styles.questionSurface} role="button" tabIndex={locked ? -1 : 0} aria-label={`Edit ${questionLabel(item.id)}`} aria-expanded={editing==="question"&&section===sectionId&&selectedId===item.id} onClick={event=>{if(locked || (event.target as Element | null)?.closest?.("button,a,input:not(:disabled),select:not(:disabled),textarea:not(:disabled)"))return;event.stopPropagation();selectQuestion(sectionId,item.id,true);}} onKeyDown={event=>{if(!locked && event.target===event.currentTarget && (event.key==="Enter" || event.key===" ")){event.preventDefault();selectQuestion(sectionId,item.id,true);}}}><fieldset disabled aria-label={questionLabel(item.id)}>{item.node}</fieldset></div>
            </div>}
          </OwnerPriceReorderList>
        }}/>
      </div>

    </div>
  </div>;
}
