"use client";
import {Card,Toggle} from './OwnerFields';
import {SettingsCardActions,type SettingsCardSaveProps} from './SettingsCardActions';
import type {OwnerContent} from './model';
/** Hub-owned display preference; never changes photos or opens an embedded builder. */
export function GalleryDisplaySettings({content,onEdit,disabled=false,...save}:SettingsCardSaveProps&{content:OwnerContent;onEdit:(change:(draft:OwnerContent)=>void)=>void;disabled?:boolean}){
 return <Card title="Gallery display" description="Choose how your gallery appears. Photos, names, number overrides and their order stay unchanged.">
  <p>{content.gallery.length} photos in your saved/working gallery. This control changes only whether their gallery numbers are displayed.</p>
  <Toggle label="Show gallery photo numbers" checked={content.gallerySettings?.showNumbers!==false} disabled={disabled} onChange={showNumbers=>{if(!disabled)onEdit(draft=>{draft.gallerySettings={showNumbers};});}} hint="Names remain available in accessible photo labels. Turning numbers off does not remove or reorder any photo."/>
  <p>Save Draft keeps this setting private. Save Live applies only this display setting to your existing published gallery; other unsaved edits stay here.</p>
  <SettingsCardActions {...save} card="gallery-display"/>
 </Card>;
}
