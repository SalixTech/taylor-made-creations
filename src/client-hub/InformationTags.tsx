import type { ClientHubInformationTag, ProjectLocalLabelDefinitions } from "./model";
import { assignedLabelDefinition } from "./label-presentation";
import { useLabelPresentation, labelColorStyle } from "./LabelPresentationContext";
import styles from "./InformationTags.module.css";

/** These labels are manual studio notes, never verified payment information. */
export function InformationTags({ tags = [], order = [], localDefinitions = {} }: { tags?: ClientHubInformationTag[]; order?: string[]; localDefinitions?: ProjectLocalLabelDefinitions }) {
  const presentation=useLabelPresentation();
  const group=assignedLabelDefinition(presentation,"information");
  if (!tags.length || group.hidden) return null;
  const ordering=order.length?order:presentation?.order??[];
  return <ul className={styles.tags} aria-label={group.name}>{[...tags].sort((a,b)=>(ordering.includes(a)?ordering.indexOf(a):ordering.length)-(ordering.includes(b)?ordering.indexOf(b):ordering.length)).map(tag=>{const definition=localDefinitions[tag]?{...localDefinitions[tag],hidden:false,deleted:false}:assignedLabelDefinition(presentation,tag);return definition.hidden?null:<li key={tag} data-information-tag={tag} style={labelColorStyle(definition.color)} title="Manual studio label, not a payment verification">{definition.name}</li>;})}</ul>;
}
