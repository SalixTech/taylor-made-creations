import {isPageAvailable,type OwnerContent,type CommissionStatusBlock} from './model';
import {getTemplateText} from './site-design';
import {OWNER_PREVIEW_ROOT} from './preview-model';
/** Independent wording snapshot; availability and request routing are never copied. */
export function createCommissionStatusBlock(content:OwnerContent,id:string):CommissionStatusBlock{return {id,type:'commission-status',label:getTemplateText(content,'commissions.statusLabel'),note:content.site.statusNote,actionLabel:getTemplateText(content,'commissions.requestButton')};}
/** A copied unit never bypasses current route availability or points at a stale slug. */
export function commissionStatusRequestHref(content:OwnerContent,mode:'public'|'private-preview'|'editor'):string|null{
 const page=content.pages.find(page=>page.builtinKey==='commissions'&&isPageAvailable(content,page));
 return page&&content.site.commissionStatus==='Open!'?`${mode==='public'?'':OWNER_PREVIEW_ROOT}/${encodeURIComponent(page.slug)}/request`:null;
}
