"use client";

import { useCallback, useEffect, useLayoutEffect, useId, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type PointerEvent } from "react";
import {BUTTON_PRESETS,type ButtonAppearance} from "./button-import";
import {createDefaultOwnerContent} from "./defaults";
import {OwnerTitleSizeHandle} from "./OwnerTitleSizeHandle";
import {setStatusTitleFlow} from "./canvas-title-flow";
import {captureNewItemFrame} from "./capture-new-item-frame";
import {usePreviewViewportWidth} from "./use-preview-viewport-width";
import { SiteContentFrame, CommissionStatusSizingSamples } from "@/components/SiteContent";
import { COMMISSION_STATUSES, newOwnerId, validatePageSlug, type OwnerContent, type OwnerPage, type PageBlock } from "./model";
import { Dialog, Field, ImagePicker, ImagePickerFramingContext, MoveButtons, OwnerSelect, Toggle } from "./OwnerFields";
import { OwnerBlocksEditor, createBlock } from "./OwnerBlocksEditor";
import { PremadePhotoEditor } from "./PremadePhotoEditor";
import { OwnerDesignPanel } from "./OwnerDesignPanel";
import { OwnerAppearancePanel, OwnerElementAppearance, CanvasPlacementEditingContext } from "./OwnerAppearancePanel";
import { OwnerHeaderEditor, OwnerPageNavigation } from "./OwnerHeaderEditor";
import { OwnerCanvasBoxTools, OwnerBoxFields } from "./OwnerCanvasBoxTools";
import { BOX_BLOCK_TYPES, boxStyleKeyForTarget, boxTargetLabel, supportsBoxTarget, findCanvasBoxTarget } from "./box-targets";
import { initializeMobileLayout, contentForLayout, editContentForLayout, reflowPageForMobile, reorderNavigationPages } from "./builder-interactions";
import {applyAllPriceColors} from "./price-colors";
import { OwnerPricesManager } from "./OwnerPricesManager";
import { OwnerTemplateEditor } from "./OwnerTemplateEditor";
import { DESIGN_SELECT_FIELDS, IMAGE_FIELDS, LINK_FIELDS, TEXT_FIELDS } from "./site-design";
import ui from "./OwnerPortal.module.css";
import styles from "./OwnerVisualBuilder.module.css";
import buttons from "./OwnerButton.module.css";
import { OwnerLinkedTextField } from "./OwnerLinkedTextField";
import {OwnerCanvasTextEditor,type CanvasTextEditMetadata} from "./OwnerCanvasTextEditor";
import {canvasHyperlinkTarget,applyCanvasHyperlink,type CanvasHyperlinkTarget} from "./canvas-hyperlinks";
import {WebsiteAssetPicker} from "./WebsiteAssetPicker";
import {OwnerHyperlinkDialog} from "./OwnerHyperlinkDialog";
import { OwnerNumberInput } from "./OwnerDesignInputs";
import {trackToolbarViewport} from "./toolbar-viewport";
import {OwnerTextFormattingBar} from "./OwnerTextFormattingBar";
import {applyPendingInlineTextStyle,mergePendingInlineTextStyle,inlineTextStyleAtCaret} from "./typing-marks";
import {getInlineTextId,getInlineTextRuns,applyInlineTextStyle,resetInlineTextStyle,reconcileInlineTextStyles,type InlineTextStyle} from "./rich-text";
import {canvasTextField,changeCanvasText} from "./canvas-text-adapter";
import {resolveCanvasClickTarget} from "./canvas-hit-target";
import {inlinePlainText,type InlineSelection,applyInlineHyperlink,removeInlineHyperlink,inlineLinkAtSelection} from "./inline-text-editing";
import {readComputedPriceAppearance,readComputedTextAppearance,type ComputedTextAppearance} from "./editable-text-dom";
import { OwnerCanvasImageTools } from "./OwnerCanvasImageTools";
import type { ElementAppearance } from "./appearance";
import { getCanvasNodes, resolveCanvasLayout, canAssignCanvasParent, assignCanvasParent, updateCanvasPlacement, stepCanvasNode, removeCanvasNode, renameCanvasNode, type CanvasPlacement } from "./canvas-layout";
import { marginAfterGapCut, measureGapCut } from "./canvas-gap";
import { canvasSpacePlacementFromDrag, captureCanvasSpaceParent } from "./canvas-space";
import {shoveShiftCurrent,shovePlacedSiblings,restoreShifts,mergeShifts,type ShoveShift} from "./placed-shove";
import {shoveNativeRow,captureCanvasShove,canvasShoveCaptureCurrent,planCanvasShove,applyCanvasShove} from "./canvas-shove";
import type { Affine, ElementBox } from "./box-geometry";
import { captureCanvasFrame, placeCapturedCanvasFrame, type CapturedCanvasFrame } from "./canvas-placement-geometry";
import { transferPageBlockToFooter } from "./shared-footer";
import {captureAssetBox,placeAsset,replaceAssetCopies,assetRoot,linkedAssetId,changeAssetField,type BuilderAsset} from "./builder-assets";
import {captureFrameClipboard,pasteFrameClipboard,updatedAssetSources,type FrameClipboard,type FrameClipboardSessionRef} from "./frame-clipboard";
import {captureHorizontalGrowth,horizontalGrowthCaptureCurrent,measureHorizontalText,proposeHorizontalGrowth} from "./horizontal-text-growth";
import { useMovablePanel } from "./use-movable-panel";
import { canvasInteractionArea } from "./canvas-interaction-area";
import { deleteItemWithContents } from "./canvas-delete-policy";
import { commissionStatusTemplateKey } from "./commission-status-value";
import { OwnerHexInput } from "./OwnerDesignInputs";

type Props = {
  workspaceMode?:boolean;
  frameClipboard?:FrameClipboardSessionRef;
  clipboardScopeKey?:string;
  assetLibraryKey?:string;
  shoveMemory?: {current:boolean};
  deviceMemory?: { current: "desktop"|"mobile" };
  draftNameControl?:ReactNode;
  content: OwnerContent;
  page: OwnerPage;
  mainCommissionStatus?: OwnerContent["site"]["commissionStatus"] | null;
  onEdit: (change: (draft: OwnerContent) => void) => void;
  onPageChange: (page: OwnerPage) => void;
  onManagePages: () => void;
  onAddPage: () => void;
  onPrices: () => void;
  onEditCommissionForm?: () => void;
  onRemove: (title: string, description: string, remove: () => void) => void;
  liveShopVisibility: boolean | null;
  liveShopKnown?: boolean;
  liveShopReadError?: string | null;
  onRetryLiveShop?: () => void;
  canUpdateLiveShop: boolean;
  onUpdateLiveShop: () => void;
  uploadBusy?: boolean;
  onSaveDraft?: () => void;
  onSave?: () => void;
  saveBusy?: boolean;
  draftSaveStatus?: string;
  onPopOut?: () => void;
  onRequestDiscard?: () => void;
  onUndo?: () => void; onRedo?: () => void; canUndo?: boolean; canRedo?: boolean;
  browsing: boolean;
  onBrowsingChange: (browsing: boolean) => void;
};
const assetFrameSelector='[data-owner-layout-scope="page"]:is([data-owner-layout-id^="block:"],[data-owner-layout-id="canvas:layout.commissions.status"],[data-owner-layout-id^="template-text:"],[data-owner-layout-id^="template-link:"],[data-owner-layout-id^="template-image:"],[data-owner-layout-id^="core-text:"],[data-owner-layout-id="page-title"],[data-owner-layout-id="canvas:layout.commissions.statusValue"])';
const blockLabels: Record<PageBlock["type"], string> = { text: "Text", image: "Photo", link: "Button", heading: "Heading", list: "List", divider: "Divider", spacer: "Space", faq: "Questions & answers", feature: "Photo + text", "canvas-space": "Add Canvas Space", section: "Section container", "commission-status":"Commission status" };
const selectionLabels: Record<string, string> = { site: "Header & footer", design: "Website design", "page-content": "Page content", "home-copy": "Welcome text", "home-image": "Main photo", status: "Commission availability", contact: "Contact details", page: "Page settings", sections: "Add Item", shop: "Premade shop", prices: "Prices & options" };
function move<T extends { id: string }>(items: T[], id: string, direction: -1 | 1) { const from = items.findIndex(item => item.id === id); const to = from + direction; if (from >= 0 && to >= 0 && to < items.length) [items[from], items[to]] = [items[to], items[from]]; }

/** The public renderer IS the canvas. Only the selected piece gets editing controls. */
export function OwnerVisualBuilder({ frameClipboard:sharedFrameClipboard,clipboardScopeKey,assetLibraryKey,deviceMemory,shoveMemory,workspaceMode=false, mainCommissionStatus, draftNameControl, content:sourceContent, page:sourcePage, onEdit:onContentEdit, onPageChange, onManagePages, onAddPage, onEditCommissionForm, onRemove, liveShopVisibility, liveShopKnown = true, liveShopReadError, onRetryLiveShop, canUpdateLiveShop, onUpdateLiveShop, uploadBusy = false, browsing, onBrowsingChange, onSave, saveBusy = false, draftSaveStatus, onPopOut, onRequestDiscard, onUndo, onRedo, canUndo = false, canRedo = false }: Props) {
  const panelId = useId();
  const builderRef=useRef<HTMLElement>(null),toolbarRef=useRef<HTMLDivElement>(null);
  const [priceColors,setPriceColors]=useState<{source:OwnerContent;pageId:string;mobile:boolean;session:string|undefined;color:string}|null>(null);
  const priceColorsLive=useRef(priceColors);priceColorsLive.current=priceColors;
  function closePriceColors(){priceColorsLive.current=null;setPriceColors(null);}
  const [computedText,setComputedText]=useState<{key:string;appearance:ComputedTextAppearance|null}|null>(null);
  const [parentChoice,setParentChoice]=useState<{id:string;value:string}|null>(null);
  useLayoutEffect(()=>{const root=builderRef.current,bar=toolbarRef.current;if(!root||!bar)return;return trackToolbarViewport(root,bar,canvasRef.current);},[browsing]);
  const navigationTarget = useRef<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [inlineTarget,setInlineTarget]=useState<string|null>(null);
  const [showResizeHandles,setShowResizeHandles]=useState(true);
  const [inlineSelection,setInlineSelection]=useState<InlineSelection|null>(null);
  const inlineSelectionScope=useRef("");
  type PendingTyping={key:string;value:string;start:number;end:number;style:InlineTextStyle;record:string};
  const [pendingTyping,setPendingTyping]=useState<PendingTyping|null>(null),pendingTypingRef=useRef<PendingTyping|null>(null);
  const [textFocusRequest,setTextFocusRequest]=useState(0);
  function clearPendingTyping(){if(pendingTypingRef.current){pendingTypingRef.current=null;setPendingTyping(null);}}
  function rememberPendingTyping(value:PendingTyping){pendingTypingRef.current=value;setPendingTyping(value);}
  const linkRequestSequence=useRef(0);
  const [destinationLink,setDestinationLink]=useState<{source:OwnerContent;pageId:string;mobile:boolean;session:string|undefined;target:string;identity:{id:string;scope:"page"|"chrome"}|null;destination:Extract<CanvasHyperlinkTarget,{kind:"destination"}>}|null>(null);
  const destinationLinkLive=useRef<typeof destinationLink>(null);
  function closeDestinationLink(){destinationLinkLive.current=null;setDestinationLink(null);}
  const [linkRequest,setLinkRequest]=useState<(InlineSelection & {requestId:number;contextKey:string})|null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const sectionMenuButton = useRef<HTMLButtonElement>(null);
  const [selectedOccurrence, setSelectedOccurrence] = useState(0);
  const [selectedLayout, setSelectedLayout] = useState<{scope:"page"|"chrome";id:string}|null>(null);
  const [footerTransfer,setFooterTransfer]=useState<{source:OwnerContent;pageId:string;blockId:string;newId:string;mobile:boolean;capture:CapturedCanvasFrame;preview:OwnerContent;viewport:number[];phase:"confirm"|"measure"}|null>(null);
  const applyingFooter=useRef<typeof footerTransfer>(null);
  const [placementIntent,setPlacementIntent]=useState<{scope:"page"|"chrome";id:string;parentId:string|null;pageId:string;mobile:boolean;source:OwnerContent;capture:CapturedCanvasFrame;relative?:{id:string;after:boolean}}|null>(null);
  const [deleteIntent,setDeleteIntent]=useState<{scope:"page"|"chrome";id:string;parentId:string|null;pageId:string;mobile:boolean;source:OwnerContent;restoreShifts?:ShoveShift[];captures:Record<string,CapturedCanvasFrame>}|null>(null);
  const [drawingSpace,setDrawingSpace]=useState(false);
  const [cuttingSpace,setCuttingSpace]=useState(false);
  function pageNameNode(p:OwnerPage){return p.builtinKey==="home"?"canvas:layout.home.intro":`canvas:layout.page:${p.id}:shell`;}
  function editorPageName(p:OwnerPage){return p.canvasLayout?.desktop[pageNameNode(p)]?.label??p.title;}
  const [renamePage,setRenamePage]=useState<{id:string;name:string}|null>(null);
  const [itemPicker,setItemPicker]=useState<{x:number;y:number}|null>(null);
  const pickerRef=useRef<HTMLDivElement>(null);
  const draggingItem=useRef<{type:PageBlock["type"];source:OwnerContent;pageId:string;mobile:boolean}|null>(null);
  const [interactionArea,setInteractionArea]=useState<ReturnType<typeof canvasInteractionArea>|undefined>(undefined);
  const previewViewportWidth=usePreviewViewportWidth();
  const statusSizingRef=useRef<HTMLDivElement|null>(null);
  const [statusSizingVersion,setStatusSizingVersion]=useState(0);
  const [addingItem,setAddingItem]=useState<{block:PageBlock;source:OwnerContent;pageId:string;mobile:boolean;point?:{x:number;y:number}}|null>(null);
  const applyingItem=useRef<typeof addingItem>(null);
  const itemPreview=useMemo(()=>{
    if(!addingItem?.point)return null;
    const preview=structuredClone(addingItem.source),target=preview.pages.find(p=>p.id===addingItem.pageId);
    if(!target)return null;
    target.blocks.push(structuredClone(addingItem.block));
    return preview;
  },[addingItem]);
  const [shoveRemoval,setShoveRemoval]=useState<{remove:(restore:boolean)=>void}|null>(null);
  const [contextMenu,setContextMenu]=useState<{x:number;y:number;target?:string}|null>(null);
  const contextMenuRef=useRef<HTMLDivElement>(null);
  const [boxNameDraft,setBoxNameDraft]=useState<{id:string;original:string;value:string}|null>(null);
  const [spacePreview,setSpacePreview]=useState<{left:number;top:number;width:number;height:number}|null>(null);
  const spaceDrag=useRef<{pointer:number;start:{x:number;y:number};map:Affine;source:OwnerContent;pageId:string;mobile:boolean}|null>(null);
  const applyingDelete=useRef<typeof deleteIntent>(null);
  const applyingPlacement=useRef<typeof placementIntent>(null);
  const [contentsSelection,setContentsSelection]=useState<string|null>(null);
  const [initialBoxLocked, setInitialBoxLocked] = useState(false);
  const [canvasBoxes, setCanvasBoxes] = useState<{ target: string; occurrence: number; value: string; label: string }[]>([]);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [pricesOpen,setPricesOpen]=useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [shove,setShove]=useState(shoveMemory?.current??false),[shoveNotice,setShoveNotice]=useState("");
  const shoveGesture=useRef<{result:ReturnType<typeof captureCanvasShove>;source:OwnerContent;pageId:string;mobile:boolean;session:string|undefined;id:string;scope:"page"|"chrome"}|null>(null);
  const shoveEnabled=useRef(shove);shoveEnabled.current=shove;
  const [textWidthWarning,setTextWidthWarning]=useState("");
  const localFrameClipboard=useRef<FrameClipboardSessionRef["current"]>(null),clipboardBusy=useRef(false),clipboardAbort=useRef<AbortController|null>(null);
  const frameClipboard=sharedFrameClipboard??localFrameClipboard;
  const clipboardScope=useRef(clipboardScopeKey);clipboardScope.current=clipboardScopeKey;
  if(frameClipboard.current&&frameClipboard.current.scopeKey!==clipboardScopeKey)frameClipboard.current=null;
  const [openAssetLibraryKey,setOpenAssetLibraryKey]=useState<string|null>(null);
  const assetLibraryOpen=!!assetLibraryKey&&openAssetLibraryKey===assetLibraryKey;
  const shelfRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!assetLibraryOpen||browsing)return;
    const outside=(event:globalThis.PointerEvent)=>{if(shelfRef.current&&!event.composedPath().includes(shelfRef.current)){
      clipboardAbort.current?.abort();
      setOpenAssetLibraryKey(null);
    }};
    document.addEventListener("pointerdown",outside,true);
    return ()=>document.removeEventListener("pointerdown",outside,true);
  },[assetLibraryOpen,browsing]);
  const [assetName,setAssetName]=useState("");
  const [editingAsset,setEditingAsset]=useState<BuilderAsset|null>(null);
  const [variantRoot,setVariantRoot]=useState<string|null>(null);
  const dragAsset=useRef<BuilderAsset|null>(null);
  const [assetPreview,setAssetPreview]=useState<{draft:OwnerContent;source:OwnerContent;pageId:string;mobile:boolean;root:string;point:{x:number;y:number}|null}|null>(null);
  const [pendingAsset,setPendingAsset]=useState<FrameClipboard|null>(null);
  const [builderAssets,setBuilderAssets]=useState<BuilderAsset[]>([]);
  const [assetSelection,setAssetSelection]=useState<{pageId:string;mobile:boolean;ids:string[]}|null>(null);
  const [clipboardNotice,setClipboardNotice]=useState("");
  const [hasFrameClipboard,setHasFrameClipboard]=useState(()=>!!clipboardScopeKey&&frameClipboard.current?.scopeKey===clipboardScopeKey);
  const draggingNav = useRef<string | null>(null);
  const dragClickGuard = useRef(false);
  const [imageEditMode, setImageEditMode] = useState<"photo" | "box">("box");
  const [device, setActiveDevice] = useState<"desktop" | "mobile">(deviceMemory?.current??"desktop");
  function setDevice(next:"desktop"|"mobile"){if(deviceMemory)deviceMemory.current=next;setActiveDevice(next);}
  const assetIds=assetSelection?.pageId===sourcePage.id&&assetSelection.mobile===(device==="mobile")?assetSelection.ids:undefined;
  const contentsSelectionKey=`${sourcePage.id}:${selected}:${selectedOccurrence}:${device}`;
  const selectBoxContents=contentsSelection!==contentsSelectionKey;
  const useMobile=!!sourceContent.design?.mobileLayoutEnabled&&device==="mobile";
  useEffect(()=>()=>{clipboardAbort.current?.abort();},[sourceContent,sourcePage.id,useMobile,clipboardScopeKey,browsing,saveBusy,uploadBusy]);
  const deleteMounted=useRef(true);
  useEffect(()=>{deleteMounted.current=true;return()=>{deleteMounted.current=false;};},[]);
  const deleteContext=useRef({source:sourceContent,pageId:sourcePage.id,mobile:useMobile,browsing,uploadBusy,saveBusy,selection:selectedLayout,target:selected});
  deleteContext.current={source:sourceContent,pageId:sourcePage.id,mobile:useMobile,browsing,uploadBusy,saveBusy,selection:selectedLayout,target:selected};
  const content=useMemo(()=>contentForLayout(sourceContent,useMobile),[sourceContent,useMobile]);
  const page=content.pages.find(item=>item.id===sourcePage.id)??sourcePage;
  const onEdit=(change:(draft:OwnerContent)=>void)=>onContentEdit(draft=>editContentForLayout(draft,change,useMobile));
  const canvasRef = useRef<HTMLDivElement>(null);
  const [flowDetach,setFlowDetach]=useState<{source:OwnerContent;pageId:string;id:string;block:PageBlock;mobile:boolean;viewport:string}|null>(null);
  const flowSizingRef=useRef<HTMLDivElement|null>(null),flowApplying=useRef<typeof flowDetach>(null);
  const titleFlowViewport=()=>JSON.stringify([window.innerWidth,window.innerHeight,window.scrollX,window.scrollY,window.visualViewport?.scale??1,canvasRef.current?.getBoundingClientRect().left,canvasRef.current?.getBoundingClientRect().top,canvasRef.current?.clientWidth]);

  const panelRef = useRef<HTMLElement>(null);
  const placingItem=!!addingItem;
  useLayoutEffect(()=>{
    const canvas=canvasRef.current;if(!canvas||(!drawingSpace&&!placingItem)){setInteractionArea(undefined);return;}
    const measure=()=>{
      const rect=canvas.getBoundingClientRect();
      const items=Array.from(canvas.querySelectorAll<HTMLElement>("[data-owner-layout-id]")).map(node=>node.getBoundingClientRect());
      const next=canvasInteractionArea(rect,canvas.scrollWidth,canvas.scrollHeight,items);
      setInteractionArea(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
    };
    measure();const observer=typeof ResizeObserver==="undefined"?null:new ResizeObserver(measure);observer?.observe(canvas);window.addEventListener("resize",measure);
    return()=>{observer?.disconnect();window.removeEventListener("resize",measure);};
  },[drawingSpace,placingItem,sourceContent,sourcePage.id,device]);
  const movable = useMovablePanel(panelRef, workspaceMode || !selected || !inspectorOpen, {memoryKey:"section-editor",defaultPosition:{x:55,y:90}});
  const lastTarget = useRef<HTMLElement | null>(null);
  const activePages = sourceContent.pages.filter(item => !item.trashedAt).sort((a, b) => a.order - b.order);
  const photo = content.gallery.find(item => selected === `gallery:${item.id}`);
  const premade = content.premades.find(item => selected === `premade:${item.id}`);
  const footerBlock=content.footerBlocks?.find(item=>selected===`block:${item.id}`);
  const footerPage=useMemo(()=>({...page,id:"shared-footer",blocks:content.footerBlocks??[]}),[page,content.footerBlocks]);
  const boxPage=useMemo(()=>({...page,blocks:[...page.blocks,...(content.footerBlocks??[])]}),[page,content.footerBlocks]);
  const block = page.blocks.find(item => selected === `block:${item.id}`)??footerBlock;
  const linkedContents=!!block&&["link","heading","text","commission-status"].includes(block.type)||selected==="template-text:commissions.statusLabel"||selected==="canvas:layout.commissions.statusValue";
  const boxEditableBlock = block && BOX_BLOCK_TYPES.includes(block.type);
  const coreStyleKey = selected?.startsWith("core-text:") ? selected.slice(10) : null;
  const imageStyleKey = selected === "home-image" ? "home.image" : selected?.startsWith("template-image:") ? selected.slice(15) : null;
  const imageBoxEditable = imageStyleKey && imageStyleKey !== "site.logo";
  const boxStyleKey = boxStyleKeyForTarget(selected);
  const boxAppearance = block?.appearance ?? (selected === "page-title" ? page.titleAppearance ?? content.contentOverrides?.styles?.[`${page.builtinKey}.title`] : boxStyleKey ? content.contentOverrides?.styles?.[boxStyleKey] : undefined);
  const selectedLayoutScope=selectedLayout?.scope==="chrome"?"chrome":sourcePage;
  const selectedLayoutMap=useMemo(()=>resolveCanvasLayout(sourceContent,selectedLayoutScope,useMobile),[sourceContent,selectedLayoutScope,useMobile]);
  const selectedTitleFlow=!!selectedLayout&&selectedLayoutMap[selectedLayout.id]?.flowAttachment==="after-page-title";
  const selectedPlacement=selectedLayout?selectedLayoutMap[selectedLayout.id]?.placement:undefined;
  const titleFlowHostLocked=selectedLayout?.scope==="page"&&["page-title",`canvas:layout.page:${sourcePage.id}:intro`,`canvas:layout.page:${sourcePage.id}:shell`].includes(selectedLayout.id)&&Object.values(selectedLayoutMap).some(entry=>!entry.removed&&entry.flowAttachment==="after-page-title");
  const titleFlowGeometryLocked=selectedTitleFlow||titleFlowHostLocked;
  const selectedSiblings=selectedLayout?Object.entries(selectedLayoutMap).filter(([,entry])=>entry.parentId===selectedLayoutMap[selectedLayout.id]?.parentId).sort((a,b)=>a[1].order-b[1].order).map(([id])=>id):[];
  const selectedBoxName=selectedLayout?(selectedLayoutMap[selectedLayout.id]?.label??getCanvasNodes(sourceContent,selectedLayoutScope).find(node=>node.id===selectedLayout.id)?.label):undefined;
  const boxName=selectedLayout&&boxNameDraft?.id===selectedLayout.id&&boxNameDraft.original===selectedBoxName?boxNameDraft.value:selectedBoxName??"";
  const layoutOrder=selectedLayout&&getCanvasNodes(sourceContent,selectedLayoutScope).find(node=>node.id===selectedLayout.id)?.movable?{index:selectedSiblings.indexOf(selectedLayout.id),count:selectedSiblings.length,onMove:(direction:-1|1)=>{const current=deleteContext.current;if(!deleteMounted.current||current.source!==sourceContent||current.pageId!==sourcePage.id||current.mobile!==useMobile||current.selection?.id!==selectedLayout.id||current.selection?.scope!==selectedLayout.scope||current.uploadBusy||current.saveBusy||current.browsing)return;onContentEdit(draft=>{const scope=selectedLayout.scope==="chrome"?"chrome":draft.pages.find(item=>item.id===sourcePage.id);if(scope)stepCanvasNode(draft,scope,selectedLayout.id,direction,useMobile);});}}:undefined;
  function changePlacement(placement:CanvasPlacement){
    if(repairButton){setAnnouncement("Connect this existing button to its box before moving it.");return;}
    if(uploadBusy||saveBusy||browsing||!selectedLayout)return;
    onContentEdit(draft=>{const scope=selectedLayout.scope==="chrome"?"chrome":draft.pages.find(item=>item.id===sourcePage.id);if(scope&&JSON.stringify(resolveCanvasLayout(draft,scope,useMobile)[selectedLayout.id])===JSON.stringify(selectedLayoutMap[selectedLayout.id]))updateCanvasPlacement(draft,scope,selectedLayout.id,useMobile,placement);});
  }
  function resetPlacement(){if(selectedPlacement)changePlacement({...selectedPlacement,matrix:{a:1,b:0,c:0,d:1,e:0,f:0},contentOffset:{xPx:0,yPx:0}});}
  const placementHandlers=useRef({changePlacement,resetPlacement});useLayoutEffect(()=>{placementHandlers.current={changePlacement,resetPlacement};});
  const placementProps=useMemo(()=>selectedPlacement&&selectedLayout?{placement:selectedPlacement,resolvePlacementDestination:(canvas:HTMLDivElement)=>layoutDestination(selectedLayout.scope,resolveCanvasLayout(sourceContent,selectedLayout.scope==="chrome"?"chrome":sourcePage,useMobile)[selectedLayout.id]?.parentId??null,canvas),onPlacementChange:(next:CanvasPlacement)=>placementHandlers.current.changePlacement(next),onResetPlacement:()=>placementHandlers.current.resetPlacement()}:{},[selectedPlacement,selectedLayout,sourceContent,sourcePage,useMobile]);
  function changeBoxAppearance(value: ElementAppearance) {
    if(repairButton){setAnnouncement("Connect this existing button to its box before resizing it.");return;}
    if(titleFlowGeometryLocked){setAnnouncement("Detach the status before changing the title group box geometry.");return;}
    if (uploadBusy || selectedPlacement || !supportsBoxTarget(selected, boxPage)) return;
    onEdit(draft => {
      if (block) { const item = footerBlock?draft.footerBlocks?.find(item=>item.id===block.id):draft.pages.find(item => item.id === page.id)?.blocks.find(item => item.id === block.id); if (item) item.appearance = value; }
      else if (selected === "page-title" && page.kind === "custom") { const item = draft.pages.find(item => item.id === page.id); if (item) item.titleAppearance = value; }
      else { const key = selected === "page-title" ? `${page.builtinKey}.title` : boxStyleKey; if (!key) return; draft.contentOverrides ??= {}; draft.contentOverrides.styles ??= {}; draft.contentOverrides.styles[key] = value; }
    });
  }
  const templateField = [...TEXT_FIELDS, ...IMAGE_FIELDS, ...LINK_FIELDS].find(field => selected?.endsWith(`:${field.key}`));
  const imageBlock = block && (block.type === "image" || block.type === "feature") ? block : null;
  const selectedImageAppearance = imageStyleKey ? content.contentOverrides?.styles?.[imageStyleKey] : imageBlock?.appearance;
  function changeImageAppearance(value: ElementAppearance) {
    onEdit(draft => {
      if (imageStyleKey) { draft.contentOverrides ??= {}; draft.contentOverrides.styles ??= {}; draft.contentOverrides.styles[imageStyleKey] = value; }
      else if (imageBlock) { const item = draft.pages.find(item => item.id === page.id)?.blocks.find(item => item.id === imageBlock.id); if (item) item.appearance = value; }
    });
  }
  const statusWord=selected==="canvas:layout.commissions.statusValue"||block?.type==="commission-status"&&block.textOnly;
  const actualStatus=mainCommissionStatus??sourceContent.site.commissionStatus;
  const displayWord=sourceContent.contentOverrides?.text?.[commissionStatusTemplateKey(actualStatus)]??actualStatus;
  const selectedText=statusWord?{value:displayWord,label:"Status wording",links:false,inputKind:undefined}:canvasTextField(sourceContent,sourcePage,selected);
  const selectedHyperlink=canvasHyperlinkTarget(sourceContent,sourcePage,selected,selectedLayout?.id,useMobile);
  const horizontalText=!!selectedText&&(block?.type==="heading"||selected?.endsWith(":body")&&sourcePage.blocks.some(item=>item.type==="text"&&!item.heading&&selected===`canvas:layout.block:${sourcePage.id}:${item.id}:body`));
  const textContextKey=`${sourcePage.id}:${selected}:${selectedLayout?.scope??"page"}:${selectedLayout?.id??selectedOccurrence}:${useMobile}:${clipboardScopeKey??"owner-mounted"}`;
  function openPriceColors(){if(uploadBusy||saveBusy||browsing)return;setPriceColors({source:sourceContent,pageId:sourcePage.id,mobile:useMobile,session:clipboardScopeKey,color:"#315b50"});}
  function priceColorsCurrent(){const current=deleteContext.current;return !!priceColors&&priceColorsLive.current===priceColors&&deleteMounted.current&&clipboardScope.current===priceColors.session&&current.source===priceColors.source&&current.pageId===priceColors.pageId&&current.mobile===priceColors.mobile&&!current.uploadBusy&&!current.saveBusy&&!current.browsing;}
  function commitPriceColors(){if(!priceColorsCurrent()||!priceColors)return;const intent=priceColors;if(!applyAllPriceColors(structuredClone(sourceContent),intent.color,intent.mobile)){setAnnouncement("Choose a six-digit hex color different from the current price colors.");return;}onContentEdit(draft=>{if(priceColorsCurrent())applyAllPriceColors(draft,intent.color,intent.mobile);});closePriceColors();setAnnouncement("All price colors updated in this layout. Undo restores the previous colors. Nothing was published.");}
  function requestInlineHyperlink(selection:InlineSelection){const current=deleteContext.current;if(!deleteMounted.current||clipboardScope.current!==clipboardScopeKey||current.source!==sourceContent||current.pageId!==sourcePage.id||current.mobile!==useMobile||current.selection?.id!==selectedLayout?.id||current.selection?.scope!==selectedLayout?.scope||current.target!==selected||current.uploadBusy||current.saveBusy||current.browsing)return;inlineSelectionScope.current=textContextKey;setInlineSelection(selection);setLinkRequest({...selection,requestId:++linkRequestSequence.current,contextKey:textContextKey});setInspectorOpen(false);}
  function commitInlineText(expected:string,value:string,edit?:CanvasTextEditMetadata){const current=deleteContext.current;if(!deleteMounted.current||!selected||clipboardScope.current!==clipboardScopeKey||current.source!==sourceContent||current.pageId!==sourcePage.id||current.mobile!==useMobile||current.selection?.id!==selectedLayout?.id||current.selection?.scope!==selectedLayout?.scope||current.target!==selected||current.uploadBusy||current.saveBusy||current.browsing)return false;
    const pending=pendingTypingRef.current,typing=pending?.key===textContextKey&&pending.value===expected&&selectedText?.inputKind!=="money"?pending:null;
    const parentId=selectedLayout&&selectedLayoutMap[selectedLayout.id]?.parentId;
    const textParent=parentId&&!selectedPlacement&&selectedLayout?.scope==="page"&&sourcePage.blocks.find(b=>b.type==="text"&&!b.heading&&`block:${b.id}`===parentId&&selected===`canvas:layout.block:${sourcePage.id}:${b.id}:body`);
    const parentPlacement=textParent&&parentId?selectedLayoutMap[parentId]?.placement:undefined;
    const growthIdentity=parentPlacement&&parentId?{scope:"page" as const,id:parentId}:selectedLayout;
    const growthPlacement=parentPlacement??selectedPlacement;
    const growthAppearance=parentPlacement&&textParent?textParent.appearance:boxAppearance;
    const growthContext=horizontalText&&edit&&growthIdentity?{source:sourceContent,pageId:sourcePage.id,target:parentPlacement?parentId!:selected,value:expected,mobile:useMobile,identity:growthIdentity}:null;
    const growth=(()=>{try{return growthContext&&canvasRef.current?captureHorizontalGrowth(canvasRef.current,growthContext,growthAppearance,growthPlacement):null;}catch{return null;}})();
    let changed=false,nextRecord="",widthWarning="";onContentEdit(draft=>{const next=structuredClone(draft);if(statusWord){if(expected!==displayWord||value.length>120)return;next.contentOverrides??={};next.contentOverrides.text??={};next.contentOverrides.text[commissionStatusTemplateKey(actualStatus)]=value;}else if(!changeCanvasText(next,sourcePage.id,selected,expected,value))return;
      if(edit?.inputType.startsWith("insert")){const inherited=edit.selection?inlineTextStyleAtCaret(draft,sourcePage.id,selected,edit.selection,useMobile):null,marks=typing?mergePendingInlineTextStyle(inherited??{},typing.style,draft.fonts):inherited;if(typing&&!edit.selection)return;if(marks&&Object.keys(marks).length&&(!edit.selection||!applyPendingInlineTextStyle(draft,next,sourcePage.id,selected,edit.selection,marks,useMobile)))return;}
      reconcileInlineTextStyles(draft,next);
      let resized=false;
      if(growth&&growthContext&&edit?.node&&!growth.node.closest("a,button,label,input,textarea,select,[role=button]")){(()=>{try{
        const fieldId=getInlineTextId(next,sourcePage.id,selected),runs=fieldId?getInlineTextRuns(next,fieldId,useMobile):[],plain=selectedText?.links?inlinePlainText(value):value;
        const measurement=measureHorizontalText(edit.node,plain,runs);if(!measurement||!horizontalGrowthCaptureCurrent(growth,growthContext,growthAppearance,growthPlacement))return;
        const rect=growth.node.getBoundingClientRect(),edge=Math.min(window.innerWidth,canvasRef.current?.getBoundingClientRect().right??window.innerWidth);
        if(edge!==undefined&&rect.width>0)measurement.widthPx=Math.min(measurement.widthPx,Math.max(growth.frame.widthPx,(edge-rect.left)*growth.frame.widthPx/rect.width));
        const proposal=proposeHorizontalGrowth(growth,measurement);if(!proposal)return;
        if(proposal.kind==="placement"){const scope=growthIdentity?.scope==="chrome"?"chrome":next.pages.find(item=>item.id===sourcePage.id);if(!scope||!growthIdentity)return;
          proposal.placement.heightPx=Math.max(proposal.placement.heightPx,edit.node.scrollHeight||0);
          if(JSON.stringify(proposal.placement)!==JSON.stringify(growthPlacement)&&!updateCanvasPlacement(next,scope,growthIdentity.id,useMobile,proposal.placement))return;}
        else if(!proposal.materialized||measurement.widthPx>growth.frame.widthPx){
          let applied=false;editContentForLayout(next,projected=>{const field=canvasTextField(projected,projected.pages.find(item=>item.id===sourcePage.id)!,selected);if(!field)return;
            if(field.appearance==="block"){const target=projected.footerBlocks?.find(item=>item.id===field.blockId)??projected.pages.find(item=>item.id===sourcePage.id)?.blocks.find(item=>item.id===field.blockId);if(!target)return;target.appearance={...target.appearance,box:proposal.box};}
            else if(field.appearance==="page"&&sourcePage.kind==="custom"){const target=projected.pages.find(item=>item.id===sourcePage.id);if(!target)return;target.titleAppearance={...target.titleAppearance,box:proposal.box};}
            else{const key=field.styleKey??(selected==="page-title"?`${sourcePage.builtinKey}.title`:boxStyleKey);if(!key)return;projected.contentOverrides??={};projected.contentOverrides.styles??={};projected.contentOverrides.styles[key]={...projected.contentOverrides.styles[key],box:proposal.box};}applied=true;
          },useMobile);if(!applied)return;
        }
        resized=true;
      }catch{/* Keep valid text/marks when a transient DOM measurement is unavailable. */}})();}
      if(horizontalText&&edit&&!resized)widthWarning="Text saved in your draft. Its width could not be measured safely right now; continue typing to retry when the layout or font is ready.";
      nextRecord=JSON.stringify(next.contentOverrides?.inlineStyles?.[getInlineTextId(next,sourcePage.id,selected)??""]??null);Object.assign(draft,next);changed=true;
    });if(changed){setTextWidthWarning(widthWarning);if(typing)rememberPendingTyping({...typing,value,record:nextRecord});}return changed;
  }
  function receiveInlineSelection(range:InlineSelection,origin?:"input"|"selection"){
    const pending=pendingTypingRef.current;if(pending){if(origin==="input"&&pending.key===textContextKey&&pending.value===range.value)rememberPendingTyping({...pending,start:range.start,end:range.end});else if(pending.key!==textContextKey||pending.value!==range.value||pending.start!==range.start||pending.end!==range.end)clearPendingTyping();}
    inlineSelectionScope.current=textContextKey;setInlineSelection(range);
  }
  useLayoutEffect(()=>{const pending=pendingTypingRef.current;if(pending&&(pending.key!==textContextKey||pending.value!==selectedText?.value||pending.record!==JSON.stringify(sourceContent.contentOverrides?.inlineStyles?.[selected?getInlineTextId(sourceContent,sourcePage.id,selected)??"":""]??null)||inlineTarget!==selected||browsing||uploadBusy||saveBusy))clearPendingTyping();},[textContextKey,sourceContent,sourcePage.id,selectedText?.value,inlineTarget,selected,browsing,uploadBusy,saveBusy]);

  const inlineTextId=selected?getInlineTextId(sourceContent,sourcePage.id,selected):null;
  const inlineRuns=useMemo(()=>inlineTextId?getInlineTextRuns(sourceContent,inlineTextId,useMobile):[],[sourceContent,inlineTextId,useMobile]);
  const currentTextSelection=inlineSelectionScope.current===textContextKey&&inlineSelection&&selectedText&&inlineSelection.value===selectedText.value?inlineSelection:null;
  const formattingSelection=currentTextSelection&&currentTextSelection.end>currentTextSelection.start?currentTextSelection:null;
  const fullTextLength=selectedText?(selectedText.links?inlinePlainText(selectedText.value):selectedText.value).length:0;
  const liveTextSelection=useRef<{key:string;range:InlineSelection|null}>({key:textContextKey,range:currentTextSelection});liveTextSelection.current={key:textContextKey,range:currentTextSelection};
  const typingCaret=currentTextSelection&&currentTextSelection.start===currentTextSelection.end&&inlineTarget===selected&&selectedText?.inputKind!=="money"?currentTextSelection:null;
  const selectedTextValue=selectedText?.value;
  const styleRange=useMemo(()=>formattingSelection??(!typingCaret&&selectedTextValue&&fullTextLength?{value:selectedTextValue,start:0,end:fullTextLength}:null),[formattingSelection,typingCaret,selectedTextValue,fullTextLength]);
  const explicitCaretStyle=typingCaret&&selected?inlineTextStyleAtCaret(sourceContent,sourcePage.id,selected,typingCaret,useMobile):null;
  const pendingCaretStyle=typingCaret&&pendingTyping?.key===textContextKey&&pendingTyping.value===selectedText?.value?pendingTyping.style:null;
  const activeTyping=pendingCaretStyle?mergePendingInlineTextStyle(explicitCaretStyle??{},pendingCaretStyle,sourceContent.fonts):explicitCaretStyle;

  const selectedRichRuns=(()=>{let offset=0;return inlineRuns.filter(run=>{const start=offset;offset+=run.text.length;return styleRange&&start<styleRange.end&&offset>styleRange.start;});})();
  function openHyperlink(){
    const current=deleteContext.current;
    if(!selected||!selectedHyperlink||!deleteMounted.current||clipboardScope.current!==clipboardScopeKey||current.source!==sourceContent||current.pageId!==sourcePage.id||current.mobile!==useMobile||current.target!==selected||current.selection?.id!==selectedLayout?.id||current.selection?.scope!==selectedLayout?.scope||current.browsing||current.uploadBusy||current.saveBusy)return;
    if(selectedHyperlink.kind==="inline"){if(styleRange)requestInlineHyperlink(styleRange);else setAnnouncement("Highlight the words you want to link first.");return;}
    const intent={source:sourceContent,pageId:sourcePage.id,mobile:useMobile,session:clipboardScopeKey,target:selected,identity:selectedLayout?{...selectedLayout}:null,destination:selectedHyperlink};destinationLinkLive.current=intent;setDestinationLink(intent);
  }
  function commitSelectedPdf(href:string){
    const current=deleteContext.current;
    if(!selected||selectedHyperlink?.kind!=="destination"||!deleteMounted.current||clipboardScope.current!==clipboardScopeKey||current.source!==sourceContent||current.pageId!==sourcePage.id||current.mobile!==useMobile||current.target!==selected||current.selection?.id!==selectedLayout?.id||current.selection?.scope!==selectedLayout?.scope||current.browsing||current.uploadBusy||current.saveBusy)return;
    const candidate=structuredClone(sourceContent);if(!applyCanvasHyperlink(candidate,sourcePage.id,selected,href,selectedLayout?.id,useMobile))return;
    onContentEdit(draft=>{if(JSON.stringify(draft)===JSON.stringify(sourceContent))Object.assign(draft,candidate);});
  }
  function commitDestinationLink(href:string|null){
    const intent=destinationLink,current=deleteContext.current;
    if(!intent||destinationLinkLive.current!==intent||!deleteMounted.current||current.source!==intent.source||current.pageId!==intent.pageId||current.mobile!==intent.mobile||clipboardScope.current!==intent.session||current.target!==intent.target||current.selection?.id!==intent.identity?.id||current.selection?.scope!==intent.identity?.scope||current.browsing||current.uploadBusy||current.saveBusy)return false;
    const candidate=structuredClone(intent.source);
    if(!applyCanvasHyperlink(candidate,intent.pageId,intent.target,href,intent.identity?.id,intent.mobile))return false;
    let changed=false;onContentEdit(draft=>{if(JSON.stringify(draft)!==JSON.stringify(intent.source))return;Object.assign(draft,candidate);changed=true;});
    if(changed){closeDestinationLink();setAnnouncement(href===null?"Link removed or restored to its original destination in your draft.":"Hyperlink updated in your draft.");}return changed;
  }
  const formattingKey=`${textContextKey}:${currentTextSelection?.start}:${currentTextSelection?.end}:${selectedText?.value}`;
  useLayoutEffect(()=>{
    const canvas=canvasRef.current,frame=canvas&&selected?findCanvasBoxTarget(canvas,selected,selectedOccurrence,selectedLayout??undefined):null;
    if(!frame||!selectedText||browsing)return;
    const computedSelection=styleRange??(typingCaret?{start:Math.max(0,typingCaret.start-1),end:typingCaret.start||Math.min(1,(selectedText.links?inlinePlainText(selectedText.value):selectedText.value).length)}:null);
    const nested=frame.querySelectorAll?Array.from(frame.querySelectorAll<HTMLElement>('[data-owner-edit]')).filter(node=>node.dataset.ownerEdit===selected):[];
    const node=nested.at(-1)??frame;let alive=true;
    const measure=()=>{if(!alive)return;const appearance=selectedText.inputKind==="money"?readComputedPriceAppearance(node.querySelector<HTMLElement>("[data-owner-inline-value]")??node,selectedText.value,computedSelection):readComputedTextAppearance(node,selectedText.links?inlinePlainText(selectedText.value):selectedText.value,computedSelection);setComputedText(previous=>previous?.key===formattingKey&&JSON.stringify(previous.appearance)===JSON.stringify(appearance)?previous:{key:formattingKey,appearance});};
    measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);observer?.observe(node);window.addEventListener('resize',measure);document.fonts?.addEventListener?.('loadingdone',measure);
    return()=>{alive=false;observer?.disconnect();window.removeEventListener('resize',measure);document.fonts?.removeEventListener?.('loadingdone',measure);};
  },[formattingKey,sourceContent,selected,selectedOccurrence,selectedLayout,selectedText,styleRange,typingCaret,browsing]);
  const textMarks={bold:!!selectedRichRuns.length&&selectedRichRuns.every(run=>run.style?.bold===true),italic:!!selectedRichRuns.length&&selectedRichRuns.every(run=>run.style?.italic===true),underline:!!selectedRichRuns.length&&selectedRichRuns.every(run=>run.style?.underline===true)};
  const toolbarComputed=(()=>{const base=computedText?.key===formattingKey?computedText.appearance:null;if(!activeTyping)return base;const result:ComputedTextAppearance={fontFamily:null,fontSize:null,color:null,bold:null,italic:null,underline:null,...base};for(const mark of ["bold","italic","underline"] as const)if(activeTyping[mark]!==undefined)result[mark]=activeTyping[mark];if(activeTyping.fontSize!==undefined)result.fontSize=activeTyping.fontSize;if(activeTyping.color!==undefined)result.color=activeTyping.color;if(activeTyping.fontId)result.fontFamily=`TMCFont_${activeTyping.fontId}`;else if(activeTyping.font&&activeTyping.font!=="original")result.fontFamily={sans:"Arial, sans-serif",serif:"Georgia, serif",rounded:'"Trebuchet MS", sans-serif',mono:"monospace"}[activeTyping.font];return result;})();
  function formatSelectedText(style:InlineTextStyle|null){const current=deleteContext.current,range=styleRange;if(!inlineTextId||!selected||!deleteMounted.current||clipboardScope.current!==clipboardScopeKey||current.source!==sourceContent||current.pageId!==sourcePage.id||current.mobile!==useMobile||current.target!==selected||current.selection?.id!==selectedLayout?.id||current.selection?.scope!==selectedLayout?.scope||current.uploadBusy||current.saveBusy||current.browsing)return;
    if(liveTextSelection.current.key!==textContextKey||JSON.stringify(liveTextSelection.current.range)!==JSON.stringify(currentTextSelection))return;
    if(!range){if(!typingCaret||!style||!selectedText)return;const merged=mergePendingInlineTextStyle(pendingCaretStyle??{},style,sourceContent.fonts);if(!merged)return;rememberPendingTyping({key:textContextKey,value:selectedText.value,start:typingCaret.start,end:typingCaret.end,style:merged,record:JSON.stringify(sourceContent.contentOverrides?.inlineStyles?.[inlineTextId??""]??null)});setTextFocusRequest(value=>value+1);return;}
    clearPendingTyping();let changed=false;onContentEdit(draft=>{changed=style?applyInlineTextStyle(draft,sourcePage.id,selected,range,style,useMobile):resetInlineTextStyle(draft,sourcePage.id,selected,range,useMobile);});if(!changed)setAnnouncement("Select the current text again before changing its formatting.");else if(inlineTarget===selected)setTextFocusRequest(value=>value+1);
  }
  const selectedTitle = templateField?.label ?? (photo ? "Edit photo" : premade ? "Edit premade" : block ? blockLabels[block.type] : selectionLabels[selected ?? ""] ?? "Edit section");

  useEffect(() => {
    const cancel=()=>{draggingNav.current=null;canvasRef.current?.querySelectorAll<HTMLElement>("[data-owner-dragging],[data-owner-drop]").forEach(node=>{delete node.dataset.ownerDragging;delete node.dataset.ownerDrop;});};
    const hidden=()=>{if(document.visibilityState==="hidden")cancel();};
    cancel();window.addEventListener("blur",cancel);document.addEventListener("visibilitychange",hidden);
    return()=>{cancel();window.removeEventListener("blur",cancel);document.removeEventListener("visibilitychange",hidden);};
  },[page.id,useMobile,browsing,uploadBusy,saveBusy]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const counts = new Map<string, number>(), boxes: typeof canvasBoxes = [];
    canvas.querySelectorAll<HTMLElement>("[data-owner-edit]").forEach(node => {
      const target = node.dataset.ownerEdit ?? "", occurrence = counts.get(target) ?? 0;
      counts.set(target, occurrence + 1);
      node.dataset.ownerSelected = String(!browsing && target === selected && occurrence === selectedOccurrence);
      const supported = supportsBoxTarget(target, boxPage);
      node.dataset.ownerBoxSupported = String(supported);
      const identity=node.closest<HTMLElement>("[data-owner-layout-id]"),scope=identity?.dataset.ownerLayoutScope==="chrome"?"chrome":sourcePage;
      const customLabel=identity?.dataset.ownerLayoutId?resolveCanvasLayout(sourceContent,scope,useMobile)[identity.dataset.ownerLayoutId]?.label:undefined;
      if (supported && (!node.getClientRects || node.getClientRects().length)) boxes.push({ target, occurrence, value: `${target}#${occurrence}`, label: `${customLabel??boxTargetLabel(target, page)}${occurrence ? ` · instance ${occurrence + 1}` : ""}` });
      node.draggable = false;
    });
    setCanvasBoxes(current => JSON.stringify(current) === JSON.stringify(boxes) ? current : boxes);
    canvas.querySelectorAll<HTMLElement>("[data-owner-nav-page]").forEach(node => { node.draggable = !browsing && !uploadBusy && !saveBusy; });
  }, [selected, selectedOccurrence, browsing, content, page, boxPage, uploadBusy, saveBusy, sourceContent, sourcePage, useMobile]);
  useEffect(()=>{
    if(!selectedLayout||!selected)return;
    const frame=layoutFrame(selectedLayout.scope,selectedLayout.id);if(!frame)return;
    const nodes=Array.from(canvasRef.current?.querySelectorAll<HTMLElement>("[data-owner-edit]")??[]).filter(node=>node.dataset.ownerEdit===selected);
    const next=nodes.findIndex(node=>node.closest("[data-owner-layout-id]")===frame);
    if(next>=0&&next!==selectedOccurrence)setSelectedOccurrence(next);
  },[sourceContent,selectedLayout,selected,selectedOccurrence,useMobile]);
  useEffect(() => {
    if (workspaceMode || inlineTarget || !selected || !inspectorOpen) return;
    const panel = panelRef.current;
    panel?.scrollTo?.({ top: 0 });
    const focus = panel?.querySelector<HTMLElement>("[data-owner-fields] input:not([type=file]):not([type=hidden]), [data-owner-fields] textarea, [data-owner-fields] button, [data-owner-fields] [tabindex='0']");
    focus?.focus({ preventScroll: true });
  }, [selected, selectedOccurrence, inspectorOpen,workspaceMode,inlineTarget]);

  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas||browsing||!assetIds?.length)return;
    const ids=new Set(assetIds);
    const frames=canvas.querySelectorAll<HTMLElement>(assetFrameSelector);
    frames.forEach(frame=>{if(ids.has(frame.dataset.ownerLayoutId??""))frame.dataset.ownerAssetSelected="true";});
    return()=>frames.forEach(frame=>{delete frame.dataset.ownerAssetSelected;});
  },[assetIds,browsing,sourceContent]);
  function closeCanvasMenu() { canvasRef.current?.querySelectorAll<HTMLDetailsElement>(".nav-more[open]").forEach(menu => { menu.open = false; }); }
  function dismissSectionMenu() {
    if (uploadBusy) return;
    setInspectorOpen(false);
    sectionMenuButton.current?.focus({ preventScroll: true });
  }
  function closePanel() {
    if (uploadBusy) return;
    setInspectorOpen(false);setInlineTarget(null);
    if(workspaceMode){setSelected(null);setSelectedLayout(null);return;}
    // Materialization replaces the original text node with a transformed frame.
    // Resolve the live occurrence instead of focusing the detached old span.
    const current = selected && canvasRef.current ? findCanvasBoxTarget(canvasRef.current, selected, selectedOccurrence) : null;
    (current ?? lastTarget.current)?.focus({ preventScroll: true });
    // Done closes fields, not the selected content box. Its measured affine
    // outline remains aligned with the rendered rotation until deselected.
    if (!supportsBoxTarget(selected, boxPage)) setSelected(null);
  }
  useEffect(() => {
    if (browsing) return;
    const exit = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || uploadBusy || document.querySelector("dialog[open]")) return;
      event.preventDefault(); onBrowsingChange(true);
    };
    window.addEventListener("keydown", exit);
    return () => window.removeEventListener("keydown", exit);
  }, [browsing, onBrowsingChange, uploadBusy]);
  function changeMode(nextBrowsing: boolean) {
    if (uploadBusy) return;
    closeCanvasMenu(); spaceDrag.current=null;setDrawingSpace(false);setSpacePreview(null); setSelected(null); setInspectorOpen(false); setNavigationOpen(false); navigationTarget.current = null; lastTarget.current = null;
    endBlockDrag(); onBrowsingChange(nextBrowsing);
  }
  function openPageManager() { if (!uploadBusy && !browsing) onManagePages(); }
  function openNewPage() { if (!uploadBusy && !browsing) onAddPage(); }
  function panelOpener(target: string) {
    return { "aria-expanded": inspectorOpen && selected === target, "aria-controls": panelId, disabled: uploadBusy };
  }
  function changeNavigationOpen(open: boolean) {
    if (uploadBusy || browsing) return;
    closeCanvasMenu(); navigationTarget.current = null; setNavigationOpen(open);
    if (open) setSelected(null);
  }
  function choose(target: string, element?: HTMLElement, toggle = false, createdIdentity?:{scope:"page"|"chrome";id:string}) {
    if (uploadBusy || browsing) return;
    const buttonPart=/^canvas:layout\.block:([^:]+):([^:]+):link$/.exec(target);
    if (buttonPart && (buttonPart[1] === "shared-footer" ? sourceContent.footerBlocks : sourcePage.blocks)
        ?.some(item => item.id === buttonPart[2] && item.type === "link")) {
      const scope = buttonPart[1] === "shared-footer" ? "chrome" : "page";
      target = `block:${buttonPart[2]}`;
      element = layoutFrame(scope, target) ?? undefined;
      createdIdentity = {scope, id:target};
    }
    // A live status is a functional item, not an independently editable word.
    const statusPart=/^canvas:layout\.block:([^:]+):([^:]+):status-value$/.exec(target);
    const statusBlock=statusPart&&(statusPart[1]==="shared-footer"?sourceContent.footerBlocks:sourcePage.blocks)?.find(item=>item.id===statusPart[2]&&item.type==="commission-status");
    if(statusBlock){target=`block:${statusBlock.id}`;const scope=statusPart![1]==="shared-footer"?"chrome":"page";element=layoutFrame(scope,target)??element;createdIdentity={scope,id:target};}
    closeCanvasMenu();
    if (addingItem) setAddingItem(null);
    if (target.startsWith("nav:")) {
      const closing = toggle && navigationOpen && navigationTarget.current === target;
      navigationTarget.current = closing ? null : target;
      setNavigationOpen(!closing); setSelected(null);
      if (closing) element?.focus({ preventScroll: true });
      else window.setTimeout(() => { if (navigationTarget.current === target) document.getElementById(`owner-nav-${target.slice(4)}`)?.focus(); }, 0);
      return;
    }
    // External openers toggle; switching within the inspector keeps its original focus return target.
    if (element) lastTarget.current = element;
    const occurrence = element && canvasRef.current ? Array.from(canvasRef.current.querySelectorAll<HTMLElement>("[data-owner-edit]")).filter(node => node.dataset.ownerEdit === target).indexOf(element) : 0;
    const nextOccurrence = Math.max(0, occurrence);
    if (toggle && inspectorOpen && selected === target && selectedOccurrence === nextOccurrence) { if (workspaceMode) dismissSectionMenu(); else closePanel(); return; }
    if (selected !== target || selectedOccurrence !== nextOccurrence) { setInitialBoxLocked(false); setContentsSelection(null); }
    const liveElement=element ?? (canvasRef.current?findCanvasBoxTarget(canvasRef.current,target,nextOccurrence):null);
    const frame=liveElement?.closest<HTMLElement>("[data-owner-layout-id]");
    setSelectedLayout(frame?.dataset.ownerLayoutId?{scope:frame.dataset.ownerLayoutScope==="chrome"?"chrome":"page",id:frame.dataset.ownerLayoutId}:createdIdentity??null);
    setSelectedOccurrence(nextOccurrence); setSelected(target); setInspectorOpen(!workspaceMode || toggle || inspectorOpen);setInlineTarget(null);setInlineSelection(null);
  }
  function capture(event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) {
    if (browsing || !(event.target instanceof HTMLElement)) return;
    // Canvas controls own Escape and arrow keys for their active gesture.
    // Do not close the inspector first and swallow their cancellation event.
    if("key" in event&&event.key==="Escape"&&assetIds?.length){event.preventDefault();event.stopPropagation();setAssetSelection(null);return;}
    if(!("key" in event)&&!event.target.closest("[data-owner-canvas-controls]")){
      if(event.altKey&&event.button===0&&assetLibraryKey){
        const frame=event.target.closest<HTMLElement>(assetFrameSelector);
        const id=frame?.dataset.ownerLayoutId;
        if(id){event.preventDefault();event.stopPropagation();const base=assetIds??[];setInlineTarget(null);setInspectorOpen(false);setAssetSelection({pageId:sourcePage.id,mobile:device==="mobile",ids:base.includes(id)?base.filter(item=>item!==id):[...base,id]});return;}
      }
      setAssetSelection(null);
    }
    if (event.target.closest("[data-owner-canvas-controls]") && !("key" in event && event.key==="Delete")) return;
    if ("key" in event && event.key === "Escape" && (draggingNav.current)) { event.preventDefault(); event.stopPropagation(); endBlockDrag(); return; }
    if ("key" in event && event.key === "Escape" && selected) { event.preventDefault(); event.stopPropagation(); if (inspectorOpen) closePanel(); else {setSelected(null);setSelectedLayout(null);} return; }
    if (!("key" in event) && dragClickGuard.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); return; }
    // More is an actual disclosure even while editing; do not select the surrounding header.
    const moreSummary = event.target.closest(".nav-more > summary");
    // The chevron/summary still opens More; its explicitly editable label is a text leaf.
    if (moreSummary && event.target.closest<HTMLElement>("[data-owner-edit]")?.dataset.ownerEdit !== "template-text:site.moreLabel") return;
    if ("key" in event && event.nativeEvent?.isComposing) return;
    if ("key" in event && event.key === "Delete" && !event.target.closest("input,textarea,select,[contenteditable],[role=textbox]")) { if(selectedLayout){event.preventDefault();event.stopPropagation();requestDelete();}return; }
    if ("key" in event && event.key !== "Enter" && event.key !== " ") return;
    const nav = event.target.closest<HTMLElement>("[data-owner-nav-page]");
    if (nav && canvasRef.current?.contains(nav)) {
      event.preventDefault(); event.stopPropagation();
      const wrappedTarget = nav.closest<HTMLElement>("[data-owner-edit]")?.dataset.ownerEdit;
      const target = nav.dataset.ownerEdit ?? (wrappedTarget?.startsWith("canvas:layout.navigation:") ? wrappedTarget : `nav:${nav.dataset.ownerNavPage}`);
      // Legacy links without a semantic text leaf still open/toggle navigation settings.
      const text = target.startsWith("nav:") ? null : canvasTextField(sourceContent,sourcePage,target);
      choose(target, nav, !text);
      if (text && (selected===target || "key" in event && event.key === "Enter")) { setInlineTarget(target); setInlineSelection(null); }
      return;
    }
    const face = event.target.closest<HTMLElement>("[data-owner-button-face]");
    const buttonTarget = face?.dataset.ownerEdit?.match(/^canvas:layout\.block:([^:]+):([^:]+):link$/);
    if (buttonTarget && canvasRef.current?.contains(face!)) {
      event.preventDefault();
      event.stopPropagation();
      const target = `block:${buttonTarget[2]}`;
      const editLabel = selected === target || ("key" in event && event.key === "Enter");
      choose(face!.dataset.ownerEdit!,face!);
      if (editLabel) setInlineTarget(target);
      return;
    }
    const nearest = event.target.closest<HTMLElement>("[data-owner-edit]");
    // Detached/pasted frames have clickable padding outside their editable child.
    // Prefer that frame over an unrelated editable ancestor underneath it.
    const hitFrame=event.target.closest<HTMLElement>("[data-owner-layout-id]");
    if(hitFrame?.dataset.ownerLayoutScope==="page"&&hitFrame.dataset.ownerLayoutId){
      const root=assetRoot(sourceContent,sourcePage,useMobile,hitFrame.dataset.ownerLayoutId);
      if(root&&root.id!==linkedRoot?.id){
        event.preventDefault();event.stopPropagation();
        const id="block:"+root.id;choose(id,layoutFrame("page",id)??undefined,false,{id,scope:"page"});return;
      }
    }
    if(hitFrame&&canvasRef.current?.contains(hitFrame)&&(!nearest||nearest.closest("[data-owner-layout-id]")!==hitFrame)){
      const scope=hitFrame.dataset.ownerLayoutScope==="chrome"?"chrome":"page";
      const node=getCanvasNodes(sourceContent,scope==="chrome"?"chrome":sourcePage).find(n=>n.id===hitFrame.dataset.ownerLayoutId);
      if(node){event.preventDefault();event.stopPropagation();choose(node.styleTarget,hitFrame,false,{scope,id:node.id});return;}
    }
    const target=nearest&&canvasRef.current?resolveCanvasClickTarget(sourceContent,sourcePage,canvasRef.current,nearest):nearest;
    if (!target || !canvasRef.current?.contains(target)) { if (!("key" in event)) { setSelected(null); setSelectedLayout(null); setInspectorOpen(false); } return; }
    event.preventDefault(); event.stopPropagation();
    const text=canvasTextField(sourceContent,sourcePage,target.dataset.ownerEdit!);
    // Legacy section panels retain click/keyboard toggle behavior. A text leaf
    // instead enters native editing; the dedicated workspace inspector stays put.
    const alreadySelected=selected===target.dataset.ownerEdit&&target.closest("[data-owner-layout-id]")===layoutFrame(selectedLayout?.scope??"page",selectedLayout?.id??"");
    choose(target.dataset.ownerEdit!, target, !workspaceMode&&!text);
    // First click selects the box and exposes resize controls. Click again (or
    // press Enter) to type, so small/pasted text never traps the box controls.
    if((text||target.dataset.ownerEdit==="canvas:layout.commissions.statusValue")&&(("key" in event&&event.key==="Enter")||alreadySelected)){setInlineTarget(target.dataset.ownerEdit!);setInlineSelection(null);}
  }
  function canvasNav(event: DragEvent<HTMLDivElement>) { const node = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-owner-nav-page]") : null; return node && canvasRef.current?.contains(node) ? node : null; }
  function beginBlockDrag(event: DragEvent<HTMLDivElement>) {
    const toolbar=event.target instanceof HTMLElement?event.target.closest<HTMLElement>("[data-owner-reparent-id]"):null;
    if(event.target instanceof HTMLElement&&event.target.closest("[data-owner-canvas-controls]")&&!toolbar){event.preventDefault();return;}if(browsing||uploadBusy||saveBusy)return;
    const nav=canvasNav(event);if(nav?.dataset.ownerNavPage&&activePages.some(item=>item.id===nav.dataset.ownerNavPage)){draggingNav.current=nav.dataset.ownerNavPage;event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",nav.dataset.ownerNavPage);event.dataTransfer.setDragImage?.(nav,16,16);nav.dataset.ownerDragging="true";return;}
    event.preventDefault();
  }

  function overBlock(event:DragEvent<HTMLDivElement>){if(browsing||uploadBusy||saveBusy)return;if(draggingItem.current||dragAsset.current){event.preventDefault();event.dataTransfer.dropEffect="copy";return;}if(!draggingNav.current)return;const node=canvasNav(event);if(!node)return;event.preventDefault();event.dataTransfer.dropEffect="move";canvasRef.current?.querySelectorAll<HTMLElement>("[data-owner-drop]").forEach(item=>delete item.dataset.ownerDrop);node.dataset.ownerDrop="true";}
  function endBlockDrag(){if(draggingNav.current)dragClickGuard.current=true;canvasRef.current?.querySelectorAll<HTMLElement>("[data-owner-dragging],[data-owner-drop]").forEach(item=>{delete item.dataset.ownerDragging;delete item.dataset.ownerDrop;});draggingNav.current=null;}
  function dropBlock(event:DragEvent<HTMLDivElement>){
    if(dragAsset.current){const asset=dragAsset.current;dragAsset.current=null;event.preventDefault();event.stopPropagation();void insertAsset(asset,{x:event.clientX,y:event.clientY});return;}
    const item = draggingItem.current;
    if (item) {
      event.preventDefault();
      event.stopPropagation();
      draggingItem.current = null;
      if (item.source === sourceContent && item.pageId === sourcePage.id && item.mobile === useMobile) {
        beginItem(item.type,{x:event.clientX,y:event.clientY});
      }
      return;
    }
    if(!browsing&&!uploadBusy&&!saveBusy&&draggingNav.current){const nav=canvasNav(event),sourceId=draggingNav.current;if(nav?.dataset.ownerNavPage){event.preventDefault();event.stopPropagation();const targetId=nav.dataset.ownerNavPage,rect=nav.getBoundingClientRect(),after=nav.closest(".nav-more-menu")?event.clientY>rect.top+rect.height/2:event.clientX>rect.left+rect.width/2;let changed=false;onContentEdit(draft=>{changed=reorderNavigationPages(draft,sourceId,targetId,after);});if(changed)setAnnouncement("Navigation order updated in your draft.");}endBlockDrag();return;}
    endBlockDrag();
  }
  function reorderLayout(draft:OwnerContent,scope:OwnerPage|"chrome",id:string,targetId:string,after:boolean,mobile:boolean){
    const graph=resolveCanvasLayout(draft,scope,mobile);if(id===targetId||!graph[id]||graph[id].parentId!==graph[targetId]?.parentId)return;
    const siblings=Object.entries(graph).filter(([,entry])=>entry.parentId===graph[id].parentId).sort((a,b)=>a[1].order-b[1].order).map(([key])=>key);
    const desired=siblings.filter(key=>key!==id),at=desired.indexOf(targetId);if(at<0)return;desired.splice(at+(after?1:0),0,id);
    let index=siblings.indexOf(id);const to=desired.indexOf(id);while(index!==to){const direction=index<to?1:-1;if(!stepCanvasNode(draft,scope,id,direction,mobile))break;index+=direction;}
  }
  function openAssets(clip:FrameClipboard|null=null){
    if(!assetLibraryKey)return;
    setClipboardNotice("");
    setContextMenu(null);setItemPicker(null);setInspectorOpen(false);
    try{
      const raw=window.localStorage.getItem(assetLibraryKey);
      const items=raw?JSON.parse(raw):[];
      setBuilderAssets(Array.isArray(items)?items:[]);
    }catch{setBuilderAssets([]);setClipboardNotice("Saved assets could not be loaded in this browser.");}
    setEditingAsset(null);setVariantRoot(null);setPendingAsset(clip);setAssetName("");setOpenAssetLibraryKey(assetLibraryKey);
  }
  function captureSelection(ids:string[],asset=false){
    const destination=layoutDestination("page",null)??canvasRef.current;
    if(!destination)throw Error("Open the page canvas before copying a box.");
    const capture=(id:string)=>{
      const clip=asset?captureAssetBox(sourceContent,sourcePage,id,newOwnerId):captureFrameClipboard(sourceContent,sourcePage.id,id);
      const block=clip.blocks.find(item=>"block:"+item.id===clip.rootId);
      const mode=useMobile?"mobile":"desktop",other=useMobile?"desktop":"mobile";
      const entry=clip[mode][clip.rootId];
      const appearance=useMobile?block?.appearance?.mobile:block?.appearance;
      const frame=layoutFrame("page",id);
      const snapshot=frame&&captureCanvasFrame(frame,entry.placement?undefined:appearance?.box);
      if(!snapshot)throw Error("This box is hidden or cannot be measured in this layout.");
      const placement=placeCapturedCanvasFrame(snapshot,destination);
      if(!placement)throw Error("This box cannot be measured in page coordinates.");
      entry.placement={...entry.placement,...placement};
      delete entry.flowAttachment;
      if(!clip[other][clip.rootId].placement&&!sourceContent.design?.mobileLayoutEnabled){
        clip[other][clip.rootId].placement=structuredClone(entry.placement);
        delete clip[other][clip.rootId].flowAttachment;
      }
      return clip;
    };
    const frames=ids.map(id=>layoutFrame("page",id));
    const roots=ids.filter((_,i)=>!frames.some((parent,j)=>j!==i&&parent&&frames[i]&&parent.contains(frames[i])));
    const [first,...others]=roots.map(capture);
    for(const clip of others){
      first.blocks.push(...clip.blocks.filter(block=>!first.blocks.some(b=>b.id===block.id)));
      Object.assign(first.desktop,clip.desktop);Object.assign(first.mobile,clip.mobile);
      Object.assign(first.styles,clip.styles);Object.assign(first.inlineStyles,clip.inlineStyles);
      Object.assign(first.elementLinks??={},clip.elementLinks);
      first.buttonDesigns.push(...clip.buttonDesigns.filter(d=>!first.buttonDesigns.some(b=>b.id===d.id)));
      first.assets=[...new Set([...first.assets,...clip.assets])];
    }
    return first;
  }
  function saveAssetSelection(){
    const ids=assetIds?.length?assetIds:selectedLayout?.scope==="page"?[selectedLayout.id]:[];
    if(!ids.length)return;
    try{openAssets(captureSelection(ids,true));}
    catch(error){setContextMenu(null);setClipboardNotice(error instanceof Error?error.message:"This selection could not be saved.");}
  }
  function storeAssets(items:typeof builderAssets){
    if(!assetLibraryKey||!assetLibraryOpen)return false;
    try{const current=JSON.parse(window.localStorage.getItem(assetLibraryKey)??"[]");
      if(JSON.stringify(current)!==JSON.stringify(builderAssets)){setClipboardNotice("Assets changed in another tab. Reopen Assets to load the latest version.");return false;}
      window.localStorage.setItem(assetLibraryKey,JSON.stringify(items));setBuilderAssets(items);return true;}
    catch{setClipboardNotice("There is not enough space to save this asset in this browser.");return false;}
  }
  async function saveAsset(){
    if(!pendingAsset||!assetName.trim()||saveBusy||uploadBusy||clipboardBusy.current)return;
    const clip={...(editingAsset?.clip??pendingAsset)};delete (clip as Partial<FrameClipboard>).sourceBinding;
    const id=newOwnerId();
    const asset={id,name:assetName.trim(),clip};
    clipboardBusy.current=true;
    try{
      if(variantRoot&&clip.assets.length){
        const {verifyFrameClipboardAssets}=await import("./frame-clipboard-assets");
        const check=await verifyFrameClipboardAssets(clip.assets,new AbortController().signal);
        check.assertCurrent();
      }
      if(!deleteMounted.current||deleteContext.current.source!==sourceContent||deleteContext.current.saveBusy||deleteContext.current.uploadBusy||clipboardScope.current!==clipboardScopeKey)return;
      const revised=variantRoot?replaceAssetCopies(sourceContent,asset,newOwnerId,new Set(clip.assets),{pageId:sourcePage.id,id:variantRoot}):null;
      if(storeAssets([...builderAssets,asset])){
        if(revised)onContentEdit(draft=>{if(JSON.stringify(draft)===JSON.stringify(sourceContent))Object.assign(draft,revised);});
        setVariantRoot(null);setEditingAsset(null);setPendingAsset(null);setAssetName("");setAssetSelection(null);setClipboardNotice("Selection saved to Assets in this browser.");
      }
    }catch(error){setClipboardNotice(error instanceof Error?error.message:"Could not save this variant.");}finally{clipboardBusy.current=false;}
  }
  async function insertAsset(asset:BuilderAsset,point:{x:number;y:number}|null=null){
    if(!assetLibraryOpen||clipboardBusy.current||browsing||saveBusy||uploadBusy)return;
    const clip={...asset.clip,sourceBinding:JSON.stringify(sourceContent)};
    const abort=new AbortController();clipboardAbort.current=abort;clipboardBusy.current=true;
    try{
      if(clip.assets.length){
        const {verifyFrameClipboardAssets}=await import("./frame-clipboard-assets");
        abort.signal.throwIfAborted();
        const verification=await verifyFrameClipboardAssets(clip.assets,abort.signal);
        verification.assertCurrent();
      }
      abort.signal.throwIfAborted();
      const latest=deleteContext.current;
      if(!deleteMounted.current||clipboardScope.current!==clipboardScopeKey||latest.source!==sourceContent||
        latest.pageId!==sourcePage.id||latest.mobile!==useMobile||latest.browsing||latest.saveBusy||latest.uploadBusy)return;
      const result=placeAsset(sourceContent,sourcePage.id,asset,newOwnerId,new Set(clip.assets));
      setOpenAssetLibraryKey(null);setAssetSelection(null);setInspectorOpen(false);
      setAssetPreview({draft:result.content,source:sourceContent,pageId:sourcePage.id,mobile:useMobile,root:result.rootId,point});
    }catch(error){if(deleteMounted.current&&!abort.signal.aborted)setClipboardNotice(error instanceof Error?error.message:"This asset could not be added safely.");}
    finally{clipboardBusy.current=false;if(clipboardAbort.current===abort)clipboardAbort.current=null;}
  }
  const linkedRoot=selectedLayout?.scope==="page"?assetRoot(sourceContent,sourcePage,useMobile,selectedLayout.id):undefined;
  function editPlacedAsset(){
    if(!linkedRoot||!assetLibraryKey)return;
    try{
      const saved:BuilderAsset[]=JSON.parse(localStorage.getItem(assetLibraryKey)??"[]"),asset=saved.find(a=>a.id===linkedAssetId(linkedRoot.id));
      const clip=captureFrameClipboard(sourceContent,sourcePage.id,"block:"+linkedRoot.id);
      openAssets(clip);setVariantRoot(linkedRoot.id);setAssetName((asset?.name??"Asset")+" variant");
      if(asset)setEditingAsset({...asset,clip});
    }catch(error){setClipboardNotice(error instanceof Error?error.message:"Could not open this asset.");}
  }
  function assetButtonDesign(asset:BuilderAsset,index:number):ButtonAppearance{
    const block=asset.clip.blocks[index];if(block?.type!=="link")return {preset:"solid"};
    const design=block.buttonAppearance??asset.clip.buttonDesigns.find(d=>d.id===block.buttonDesignId);
    if(!design)return {preset:"solid"};
    const {preset,imported,artwork,hover,focus}=design;
    return {preset,...(imported?{imported}:{}),...(artwork?{artwork}:{}),...(hover?{hover}:{}),...(focus?{focus}:{})};
  }
  function changeAssetButton(asset:BuilderAsset,index:number,design:ButtonAppearance){
    const copy=structuredClone(asset),block=copy.clip.blocks[index];if(block?.type!=="link")return;
    block.buttonAppearance=design;delete block.buttonDesignId;
    copy.clip.buttonDesigns=copy.clip.buttonDesigns.filter(d=>copy.clip.blocks.some(b=>b.type==="link"&&b.buttonDesignId===d.id));
    copy.clip.assets=updatedAssetSources(copy.clip);setEditingAsset(copy);
  }
  async function overwriteAsset(asset:BuilderAsset){
    if(saveBusy||uploadBusy||clipboardBusy.current)return;clipboardBusy.current=true;
    try{
      const clip={...asset.clip};delete (clip as Partial<FrameClipboard>).sourceBinding;
      const next={...asset,clip},verified=new Set(clip.assets);
      if(verified.size){const {verifyFrameClipboardAssets}=await import("./frame-clipboard-assets");const check=await verifyFrameClipboardAssets(clip.assets,new AbortController().signal);check.assertCurrent();}
      if(!deleteMounted.current||deleteContext.current.source!==sourceContent||deleteContext.current.saveBusy||deleteContext.current.uploadBusy||clipboardScope.current!==clipboardScopeKey)return;
      // Validate even a template with no linked instances before replacing it.
      const scratch=createDefaultOwnerContent();if(sourceContent.fonts)scratch.fonts=structuredClone(sourceContent.fonts);
      placeAsset(scratch,scratch.pages[0].id,next,newOwnerId,verified);
      const change=replaceAssetCopies(sourceContent,next,newOwnerId,verified);
      onContentEdit(draft=>{if(JSON.stringify(draft)!==JSON.stringify(sourceContent))return;if(storeAssets(builderAssets.map(a=>a.id===next.id?next:a))){Object.assign(draft,change);setEditingAsset(null);setPendingAsset(null);setClipboardNotice("Saved asset and updated its linked copies in this draft.");}});
    }catch(error){setClipboardNotice(error instanceof Error?error.message:"Could not save this asset.");}
    finally{clipboardBusy.current=false;}
  }
  /* eslint-disable react-hooks/set-state-in-effect -- Measure the inserted group before committing it. */
  useLayoutEffect(()=>{
    const preview=assetPreview;if(!preview)return;
    if(preview.source!==sourceContent||preview.pageId!==sourcePage.id||preview.mobile!==useMobile||saveBusy||uploadBusy||browsing){setAssetPreview(null);return;}
    if(!preview.point)return;
    const frame=layoutFrame("page",preview.root),dest=layoutDestination("page",null),snapshot=frame&&captureCanvasFrame(frame);
    if(!snapshot||!dest){setAssetPreview(null);setClipboardNotice("Could not measure that location. Try placing the asset again.");return;}
    snapshot.screenMatrix.e=preview.point.x;snapshot.screenMatrix.f=preview.point.y;
    const placement=placeCapturedCanvasFrame(snapshot,dest),draft=structuredClone(preview.draft),page=draft.pages.find(p=>p.id===sourcePage.id)!;
    if(placement){updateCanvasPlacement(draft,page,preview.root,useMobile,placement);
      if(shoveEnabled.current)rememberShifts(page,useMobile,preview.root,shoveAt(draft,page,useMobile,preview.root,0,snapshot));
      onContentEdit(current=>{if(JSON.stringify(current)===JSON.stringify(sourceContent))Object.assign(current,draft);});
      setSelected(preview.root);setSelectedLayout({id:preview.root,scope:"page"});setSelectedOccurrence(0);setInlineTarget(null);
    }
    setAssetPreview(null);
  },[assetPreview,sourceContent,sourcePage.id,useMobile,browsing,saveBusy,uploadBusy,onContentEdit]);
  /* eslint-enable react-hooks/set-state-in-effect */
  function copyBox(){
    const current=deleteContext.current;if(!clipboardScopeKey||clipboardScope.current!==clipboardScopeKey||!sharedFrameClipboard||!deleteMounted.current||current.source!==sourceContent||current.pageId!==sourcePage.id||current.selection?.id!==selectedLayout?.id||current.selection?.scope!==selectedLayout?.scope||current.browsing||current.saveBusy||current.uploadBusy||!selectedLayout||selectedLayout.scope!=="page"){setClipboardNotice("Select a page box to copy. Header and footer units are not copied here.");return;}
    try{clipboardAbort.current?.abort();frameClipboard.current={scopeKey:clipboardScopeKey,value:captureSelection([selectedLayout.id])};setHasFrameClipboard(true);setClipboardNotice("Box copied for this builder session. Paste box on another page creates independent contents at the new page origin; nothing is published.");}catch(error){setClipboardNotice(error instanceof Error?error.message:"This box cannot be copied safely.");}
  }
  async function pasteBox(){
    const session=frameClipboard.current,copied=session?.value,current=deleteContext.current;if(!clipboardScopeKey||clipboardScope.current!==clipboardScopeKey||!sharedFrameClipboard||session?.scopeKey!==clipboardScopeKey||!copied||clipboardBusy.current||!deleteMounted.current||current.source!==sourceContent||current.pageId!==sourcePage.id||current.browsing||current.saveBusy||current.uploadBusy)return;
    clipboardBusy.current=true;const abort=new AbortController();clipboardAbort.current=abort;setClipboardNotice("Checking this box’s assets before pasting…");
    try{const {verifyFrameClipboardAssets}=await import("./frame-clipboard-assets");abort.signal.throwIfAborted();const assetSession=await verifyFrameClipboardAssets(copied.assets,abort.signal),latest=deleteContext.current;if(!deleteMounted.current||clipboardScope.current!==clipboardScopeKey||frameClipboard.current!==session||frameClipboard.current?.scopeKey!==clipboardScopeKey||latest.source!==sourceContent||latest.pageId!==sourcePage.id||latest.mobile!==useMobile||latest.browsing||latest.saveBusy||latest.uploadBusy)throw Error("The page or draft changed while checking the box. Nothing was pasted.");
      assetSession.assertCurrent();const result=pasteFrameClipboard(sourceContent,sourcePage.id,copied,{newId:newOwnerId,verifiedAssets:new Set(copied.assets)});let changed=false;
      onContentEdit(draft=>{assetSession.assertCurrent();if(JSON.stringify(draft)!==JSON.stringify(sourceContent))return;Object.assign(draft,result.content);changed=true;});
      if(!changed)throw Error("The current draft changed. Copy the box again before pasting.");frameClipboard.current={scopeKey:clipboardScopeKey,value:result.clipboard};setSelected(result.rootId);setSelectedLayout({scope:"page",id:result.rootId});setInlineTarget(null);setInspectorOpen(false);setClipboardNotice("Independent box pasted in your draft at this page’s origin. Both layouts retain their own styles and contents. Undo removes this copy.");
    }catch(error){if(deleteMounted.current)setClipboardNotice(error instanceof Error?error.message:"This box could not be pasted safely.");}finally{clipboardBusy.current=false;if(clipboardAbort.current===abort)clipboardAbort.current=null;}
  }
  function layoutFrame(scope:"page"|"chrome",id:string){return Array.from(canvasRef.current?.querySelectorAll<HTMLElement>("[data-owner-layout-id]")??[]).find(node=>node.dataset.ownerLayoutId===id&&node.dataset.ownerLayoutScope===scope)??null;}
  function layoutDestination(scope:"page"|"chrome",parentId:string|null,canvas=canvasRef.current){return Array.from(canvas?.querySelectorAll<HTMLElement>("[data-owner-placement-content]")??[]).find(node=>node.dataset.ownerPlacementContent===(parentId??"__root")&&node.dataset.ownerLayoutScope===scope)??null;}
  const shoveReceipts=useRef(new Map<string,ShoveShift[]>());
  function receiptKey(page:OwnerPage,mobile:boolean,id:string){return "tmc-shove:"+JSON.stringify([assetLibraryKey??clipboardScopeKey,page.id,mobile,id]);}
  function shiftsFor(page:OwnerPage,mobile:boolean,id:string):ShoveShift[]{
    const key=receiptKey(page,mobile,id);
    try{return shoveReceipts.current.get(key)??JSON.parse(localStorage.getItem(key)??"[]");}catch{return [];}
  }
  function rememberShifts(page:OwnerPage,mobile:boolean,id:string,shifts:ShoveShift[]){
    if(!shifts.length)return;
    const key=receiptKey(page,mobile,id),merged=mergeShifts(shiftsFor(page,mobile,id),shifts);
    shoveReceipts.current.set(key,merged);try{localStorage.setItem(key,JSON.stringify(merged));}catch{/* Keep the in-memory receipt during this session. */}
  }
  function shoveAt(candidate:OwnerContent,page:OwnerPage,mobile:boolean,id:string,direction:1|-1|0,snapshot?:CapturedCanvasFrame|null){
    const shifts=shovePlacedSiblings(candidate,page,mobile,id,direction);
    if(canvasRef.current&&snapshot)shifts.push(...shoveNativeRow(canvasRef.current,candidate,page.id,mobile,id,snapshot,direction));
    return shifts;
  }
  function startShove(){
    shoveGesture.current=null;
    if(!shove||!selectedLayout||uploadBusy||saveBusy||browsing)return;
    const frame=layoutFrame(selectedLayout.scope,selectedLayout.id),canvas=canvasRef.current;
    if(!frame||!canvas){setShoveNotice("Shove cannot measure this box. Nothing will be moved.");return;}
    const result=captureCanvasShove(canvas,{source:sourceContent,pageId:sourcePage.id,mobile:useMobile,id:selectedLayout.id,scope:selectedLayout.scope,sessionKey:clipboardScopeKey},frame);
    shoveGesture.current={result,source:sourceContent,pageId:sourcePage.id,mobile:useMobile,session:clipboardScopeKey,...selectedLayout};
    setShoveNotice(selectedPlacement?"Drag to move neighboring boxes.":result.ok?"Drag into a gap to make room below.":"Drag to move this box.");
  }
  function previewShove(snapshot?:CapturedCanvasFrame){
    const gesture=shoveGesture.current;if(!shove||!gesture||!snapshot)return;
    if(selectedPlacement){setShoveNotice("Release to move overlapping boxes in the opposite direction.");return;}
    if(!gesture.result.ok){setShoveNotice("Release over a neighboring box to make room.");return;}
    const result=planCanvasShove(gesture.result.value,snapshot);
    setShoveNotice(result.ok?"Shove: release to place this box and make room below.":"Release over a neighboring box to make room.");
  }
  function commitShove(snapshot:CapturedCanvasFrame,next:{box:ElementBox;placement?:CanvasPlacement}){
    if(!shoveEnabled.current)return false;
    const gesture=shoveGesture.current;shoveGesture.current=null;
    const current=deleteContext.current;
    if(!gesture||!deleteMounted.current||current.source!==gesture.source||current.pageId!==gesture.pageId||current.mobile!==gesture.mobile||clipboardScope.current!==gesture.session||current.selection?.id!==gesture.id||current.selection?.scope!==gesture.scope||current.uploadBusy||current.saveBusy||current.browsing){setShoveNotice("The page, selection or layout changed. Shove moved nothing; try again.");return true;}
    if(selectedPlacement&&next.placement&&gesture.scope==="page"){
      const candidate=structuredClone(gesture.source),target=candidate.pages.find(p=>p.id===gesture.pageId);
      if(!target||!updateCanvasPlacement(candidate,target,gesture.id,useMobile,next.placement))return true;
      const direction=next.placement.matrix.f>=selectedPlacement.matrix.f?-1:1;
      const shifts=shoveAt(candidate,target,useMobile,gesture.id,direction,snapshot);
      onContentEdit(draft=>{if(JSON.stringify(draft)===JSON.stringify(gesture.source)){rememberShifts(target,useMobile,gesture.id,shifts);Object.assign(draft,candidate);}});
      setShoveNotice(shifts.length?`Moved ${shifts.length} neighboring boxes ${direction===1?"down":"up"}.`:"Box moved.");return true;
    }
    const frame=layoutFrame(gesture.scope,gesture.id),canvas=canvasRef.current;
    if(!canvas||!frame||gesture.scope!=="page")return false;
    const capture=gesture.result.ok?gesture.result.value:null;
    if(capture&&!canvasShoveCaptureCurrent(canvas,capture,frame)){setShoveNotice("The page layout changed during this move. Try again.");return true;}
    const result=capture?planCanvasShove(capture,snapshot):null;
    const candidate=structuredClone(gesture.source);
    if(selectedPlacement){
      const scope=candidate.pages.find(p=>p.id===gesture.pageId);
      if(!scope||!next.placement){setShoveNotice("Shove cannot safely place this box. Nothing changed.");return true;}
      updateCanvasPlacement(candidate,scope,gesture.id,gesture.mobile,next.placement);
    }else{
      editContentForLayout(candidate,draft=>{
        const value={...boxAppearance,box:next.box};
        if(block){const item=footerBlock?draft.footerBlocks?.find(item=>item.id===block.id):draft.pages.find(item=>item.id===gesture.pageId)?.blocks.find(item=>item.id===block.id);if(item)item.appearance=value;}
        else if(selected==="page-title"&&page.kind==="custom"){const item=draft.pages.find(item=>item.id===gesture.pageId);if(item)item.titleAppearance=value;}
        else {const key=selected==="page-title"?`${page.builtinKey}.title`:boxStyleKey;if(key){draft.contentOverrides??={};draft.contentOverrides.styles??={};draft.contentOverrides.styles[key]=value;}}
      },gesture.mobile);
    }
    const shifts:ShoveShift[]=[];
    if(capture&&result?.ok){
      if(!applyCanvasShove(candidate,capture,result.value))return false;
      const anchor=capture.anchors.find(a=>a.id===result.value.anchorId);
      if(anchor&&result.value.deltaPx>0)shifts.push({id:anchor.id,parentId:selectedLayoutMap[anchor.id]?.parentId??null,before:anchor.marginTop,after:result.value.marginTopPx,margin:true});
    }
    const targetPage=candidate.pages.find(p=>p.id===gesture.pageId)!;
    const direction=snapshot.screenMatrix.f>=frame.getBoundingClientRect().top?-1:1;
    const parentId=selectedLayoutMap[gesture.id]?.parentId??null;
    for(const parent of new Set([parentId,null])){
      const dest=layoutDestination("page",parent);
      const placement=dest&&placeCapturedCanvasFrame(snapshot,dest);
      if(placement)shifts.push(...shovePlacedSiblings(candidate,targetPage,useMobile,gesture.id,direction,undefined,{placement,parentId:parent}));
    }
    if(!result?.ok){
      shifts.push(...shoveNativeRow(canvas,candidate,gesture.pageId,useMobile,gesture.id,snapshot,direction));
      if(!shifts.length){setShoveNotice("Box moved. No neighboring box overlapped the drop.");return false;}
    }
    let changed=false;
    onContentEdit(draft=>{if(JSON.stringify(draft)!==JSON.stringify(gesture.source))return;Object.assign(draft,candidate);rememberShifts(targetPage,useMobile,gesture.id,shifts);changed=true;});
    setShoveNotice(changed?(shifts.length?"Shove moved neighboring boxes. Undo restores the whole move.":"Box moved into the available space."):"The draft changed. Shove moved nothing; try again.");
    return true;
  }
  const footerViewport=()=>[window.innerWidth??0,window.innerHeight??0,window.visualViewport?.width??0,window.visualViewport?.height??0,window.visualViewport?.scale??1];
  const footerFrame=()=>layoutFrame("chrome","canvas:layout.site.footer");
  const clearFooterHighlight=()=>{const frame=footerFrame();if(frame)delete frame.dataset.ownerFooterDrop;};
  const overFooter=(point:{x:number;y:number})=>{const r=footerFrame()?.getBoundingClientRect();return !!r&&point.x>=r.left&&point.x<=r.right&&point.y>=r.top&&point.y<=r.bottom;};
  const footerTransferCurrent=useCallback((intent:NonNullable<typeof footerTransfer>)=>{const c=deleteContext.current;return deleteMounted.current&&c.source===intent.source&&c.pageId===intent.pageId&&c.mobile===intent.mobile&&!c.browsing&&!c.uploadBusy&&!c.saveBusy&&c.target===`block:${intent.blockId}`&&JSON.stringify(footerViewport())===JSON.stringify(intent.viewport);},[]);
  function requestFooterTransfer(given?:CapturedCanvasFrame){
    if(uploadBusy||saveBusy||browsing||footerBlock||!block||!['text','heading','link'].includes(block.type))return false;
    const frame=layoutFrame("page",`block:${block.id}`),capture=given??(frame?captureCanvasFrame(frame,selectedPlacement?undefined:block.appearance?.box):null);
    if(!capture){setAnnouncement("This item cannot be measured safely. Nothing was changed.");return false;}
    if(selectedPlacement){if(selectedPlacement.contentOffset)capture.contentOffset={...selectedPlacement.contentOffset};if(selectedPlacement.aspectLocked!==undefined)capture.aspectLocked=selectedPlacement.aspectLocked;}
    const newId=newOwnerId();
    try{const preview=transferPageBlockToFooter(sourceContent,{pageId:sourcePage.id,blockId:block.id,newId,mobile:useMobile,placement:{matrix:{a:1,b:0,c:0,d:1,e:0,f:0},widthPx:capture.widthPx,heightPx:capture.heightPx}}).content;
      setFooterTransfer({source:sourceContent,pageId:sourcePage.id,blockId:block.id,newId,mobile:useMobile,capture,preview,viewport:footerViewport(),phase:"confirm"});return true;
    }catch{setAnnouncement("Move any separately assigned children out first. This item cannot be transferred safely yet.");return false;}
  }
  /* eslint-disable react-hooks/set-state-in-effect -- Final-layout measurement is transient; only a confirmed unchanged scope commits one atomic draft edit. */
  useLayoutEffect(()=>{
    const intent=footerTransfer;if(!intent||intent.phase!=="measure"||applyingFooter.current===intent)return;applyingFooter.current=intent;
    if(!footerTransferCurrent(intent)){setFooterTransfer(null);setAnnouncement("The page, view or selection changed. Nothing was moved; try again from its current position.");return;}
    const destination=Array.from(canvasRef.current?.querySelectorAll<HTMLElement>("[data-owner-placement-content]")??[]).find(n=>n.dataset.ownerLayoutScope==="chrome"&&n.dataset.ownerPlacementContent==="canvas:layout.site.footer");
    const placement=destination?placeCapturedCanvasFrame(intent.capture,destination):null;
    if(!placement){setFooterTransfer(null);setAnnouncement("The footer cannot receive this item safely. Nothing was changed.");return;}
    let changed=false;
    try{const result=transferPageBlockToFooter(intent.source,{pageId:intent.pageId,blockId:intent.blockId,newId:intent.newId,mobile:intent.mobile,placement});
      onContentEdit(draft=>{if(!footerTransferCurrent(intent)||JSON.stringify(draft)!==JSON.stringify(intent.source))return;Object.assign(draft,result.content);changed=true;});
    }catch{setAnnouncement("The footer transfer could not be applied safely. Nothing was changed.");}
    setFooterTransfer(null);if(changed){setSelected(`block:${intent.newId}`);setSelectedLayout({scope:"chrome",id:`block:${intent.newId}`});setInlineTarget(null);setInspectorOpen(true);setAnnouncement("Moved to the shared footer in your draft. Review both layouts; Undo brings it back. Nothing was published.");}
  },[footerTransfer,footerTransferCurrent,onContentEdit]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // eslint-disable-next-line react-hooks/set-state-in-effect -- Revision/scope changes invalidate transient pointer UI, never persisted content.
  useEffect(()=>{setContextMenu(null);},[sourceContent,sourcePage.id,useMobile,browsing,uploadBusy,saveBusy]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Page/device/session changes end a local text-edit session, never write to another scope.
  useEffect(()=>{setInlineTarget(null);setInlineSelection(null);},[sourcePage.id,useMobile,browsing]);
  useEffect(()=>{if(!contextMenu)return;contextMenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();const outside=(event:Event)=>{if(!contextMenuRef.current?.contains(event.target as Node))setContextMenu(null);};const close=()=>setContextMenu(null);document.addEventListener("pointerdown",outside);window.addEventListener("blur",close);return()=>{document.removeEventListener("pointerdown",outside);window.removeEventListener("blur",close);};},[contextMenu]);
  function changeTitleFlow(follow:boolean){
    if(uploadBusy||saveBusy||browsing||!block||block.type!=="commission-status"||!block.textOnly||footerBlock)return;
    if(!follow){setFlowDetach({source:sourceContent,pageId:sourcePage.id,id:`block:${block.id}`,block,mobile:useMobile,viewport:titleFlowViewport()});return;}
    let changed=false;onContentEdit(draft=>{if(JSON.stringify(draft)!==JSON.stringify(sourceContent))return;changed=setStatusTitleFlow(draft,sourcePage.id,`block:${block.id}`,useMobile,true);});
    setAnnouncement(changed?"Status now follows this page title in the selected layout. It wraps below when space runs out. Undo restores free placement.":"This title cannot accept the status safely. Keep its title, intro and status geometry in their native form, and use only one attached status.");
  }
  /* eslint-disable react-hooks/set-state-in-effect -- Explicit detach waits for a transient measured destination, then commits once. */
  useLayoutEffect(()=>{
    const intent=flowDetach;if(!intent||flowApplying.current===intent)return;
    if(intent.source!==sourceContent||intent.pageId!==sourcePage.id||intent.mobile!==useMobile||browsing||uploadBusy||saveBusy||intent.viewport!==titleFlowViewport()){setFlowDetach(null);setAnnouncement("The view changed. Nothing was detached.");return;}
    if(flowSizingRef.current&&canvasRef.current){const baseline=window.getComputedStyle(canvasRef.current);for(const property of ["font-family","font-size","font-weight","font-style","font-stretch","font-variant","font-kerning","font-feature-settings","font-variation-settings","line-height","letter-spacing","word-spacing","text-transform","direction","writing-mode"])flowSizingRef.current.style.setProperty(property,baseline.getPropertyValue(property));flowSizingRef.current.style.width=`${canvasRef.current.clientWidth}px`;for(const text of flowSizingRef.current.querySelectorAll('[data-owner-status-value]'))text.getBoundingClientRect();}
    if(document.fonts?.status==="loading"){let active=true;void document.fonts.ready.then(()=>{if(active)setStatusSizingVersion(v=>v+1);}).catch(()=>{if(active){setFlowDetach(null);setAnnouncement("Status fonts could not be measured. Nothing was detached.");}});return()=>{active=false;};}
    flowApplying.current=intent;
    const frame=layoutFrame("page",intent.id),destination=layoutDestination("page",null,canvasRef.current),original=frame?captureCanvasFrame(frame):null,capture=frame?captureNewItemFrame(frame,intent.block,flowSizingRef.current):null;
    if(capture&&original&&frame){const align=window.getComputedStyle(frame.querySelector('h2')??frame).textAlign,factor=align==='center'?.5:align==='right'||align==='end'?1:0,shift=(capture.widthPx-original.widthPx)*factor;capture.screenMatrix.e-=capture.screenMatrix.a*shift;capture.screenMatrix.f-=capture.screenMatrix.b*shift;}
    const placement=capture&&destination?placeCapturedCanvasFrame(capture,destination):null;
    let changed=false;if(placement)onContentEdit(draft=>{if(intent.viewport!==titleFlowViewport()||JSON.stringify(draft)!==JSON.stringify(intent.source))return;changed=setStatusTitleFlow(draft,intent.pageId,intent.id,intent.mobile,false,placement);});
    setFlowDetach(null);setAnnouncement(changed?"Status is freely placed at its current location, with space for every Hub status. Undo restores Follow page title.":"The status could not be measured safely. Nothing was detached.");
  },[flowDetach,sourceContent,sourcePage.id,useMobile,browsing,uploadBusy,saveBusy,onContentEdit,statusSizingVersion,previewViewportWidth]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function moveLayer(scope:"page"|"chrome",id:string,parentId:string|null,relative?:{id:string;after:boolean}){
    if(repairButton){setAnnouncement("Connect this existing button to its box before moving it.");return;}
    if(uploadBusy||saveBusy||browsing)return;
    const modelScope=scope==="chrome"?"chrome":sourcePage;
    if(!canAssignCanvasParent(sourceContent,modelScope,id,parentId,useMobile)){setAnnouncement("That move would put a box inside itself or an unavailable piece. Nothing was changed.");return;}
    const frame=layoutFrame(scope,id),descriptor=getCanvasNodes(sourceContent,modelScope).find(node=>node.id===id);
    const priorPlacement=resolveCanvasLayout(sourceContent,modelScope,useMobile)[id]?.placement;
    const styleTarget=descriptor?.styleTarget??"",styleKey=boxStyleKeyForTarget(styleTarget);
    const appearance=styleTarget.startsWith("block:")?page.blocks.find(block=>`block:${block.id}`===styleTarget)?.appearance:styleTarget==="page-title"?page.titleAppearance??content.contentOverrides?.styles?.[`${page.builtinKey}.title`]:styleKey?content.contentOverrides?.styles?.[styleKey]:undefined;
    const captured=frame?captureCanvasFrame(frame,priorPlacement?undefined:appearance?.box):null;
    if(!captured){setAnnouncement("This piece cannot be moved safely in its current hidden or unsupported layout. Nothing was changed.");return;}
    if(priorPlacement){if(priorPlacement.aspectLocked!==undefined)captured.aspectLocked=priorPlacement.aspectLocked;if(priorPlacement.contentOffset)captured.contentOffset={...priorPlacement.contentOffset};}
    setPlacementIntent({scope,id,parentId,pageId:sourcePage.id,mobile:useMobile,source:sourceContent,capture:captured,relative});
  }
  /* eslint-disable react-hooks/set-state-in-effect -- This layout effect measures the temporary DOM destination, then atomically commits or removes that preview before paint. */
  useLayoutEffect(()=>{
    const intent=placementIntent;if(!intent||applyingPlacement.current===intent)return;
    applyingPlacement.current=intent;
    if(uploadBusy||saveBusy||browsing||intent.source!==sourceContent||intent.pageId!==sourcePage.id||intent.mobile!==useMobile){setPlacementIntent(null);setAnnouncement("The page changed before this move could finish. Nothing was changed.");return;}
    const destination=layoutDestination(intent.scope,intent.parentId),placement=destination?placeCapturedCanvasFrame(intent.capture,destination):null;
    if(!placement){setPlacementIntent(null);setAnnouncement("That box cannot receive this piece safely in its current layout. Nothing was changed.");return;}
    let changed=false;
    onContentEdit(draft=>{if(JSON.stringify(draft)!==JSON.stringify(intent.source))return;const scope=intent.scope==="chrome"?"chrome":draft.pages.find(page=>page.id===intent.pageId);if(scope){changed=assignCanvasParent(draft,scope,intent.id,intent.parentId,intent.mobile,placement);if(changed&&intent.relative)reorderLayout(draft,scope,intent.id,intent.relative.id,intent.relative.after,intent.mobile);}});
    setPlacementIntent(null);
    if(changed){setSelectedLayout({scope:intent.scope,id:intent.id});setContentsSelection(null);setAnnouncement("Moved into its new box without changing its position. Undo brings it back.");}
    else setAnnouncement("The page changed before this move could finish. Nothing was changed.");
  },[placementIntent,sourceContent,sourcePage.id,useMobile,uploadBusy,saveBusy,browsing,onContentEdit]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const frameOffset=selectedPlacement?.contentOffset??boxAppearance?.box?.contentOffset;
  const displacedParts=selectedLayout&&(selectedLayout.id==="canvas:layout.commissions.status"||block&&["text","section","commission-status"].includes(block.type))
    ?getCanvasNodes(sourceContent,selectedLayoutScope).filter(node=>{
      if(node.defaultParentId!==selectedLayout.id)return false;
      const entry=selectedLayoutMap[node.id],style=content.contentOverrides?.styles?.[boxStyleKeyForTarget(node.styleTarget)??""];
      return entry&&!entry.removed&&(entry.parentId!==selectedLayout.id||!!entry.placement||!!style?.box);
    }):[];
  const hasOwnOffset=!!(frameOffset?.xPx||frameOffset?.yPx||boxAppearance?.box?.contentOffset?.xPx||boxAppearance?.box?.contentOffset?.yPx);
  const hasFrameOffset=hasOwnOffset||displacedParts.length>0;
  function reconnectContents(){
    if(uploadBusy||saveBusy||browsing||!selectedLayout)return;
    setContentsSelection(null);
    onContentEdit(draft=>{
      if(JSON.stringify(draft)!==JSON.stringify(sourceContent))return;
      const next=structuredClone(draft),scope=selectedLayout.scope==="chrome"?"chrome":next.pages.find(p=>p.id===sourcePage.id);
      if(!scope)return;
      for(const part of displacedParts){
        const entry=selectedLayoutMap[part.id];
        if(entry.parentId!==selectedLayout.id&&!assignCanvasParent(next,scope,part.id,selectedLayout.id,useMobile))return;
        if(entry.placement&&!updateCanvasPlacement(next,scope,part.id,useMobile,undefined))return;
      }
      if(selectedPlacement?.contentOffset){
        const placement={...selectedPlacement};delete placement.contentOffset;
        if(!updateCanvasPlacement(next,scope,selectedLayout.id,useMobile,placement))return;
      }
      editContentForLayout(next,view=>{
        for(const part of displacedParts){const style=view.contentOverrides?.styles?.[boxStyleKeyForTarget(part.styleTarget)??""];if(style)delete style.box;}
        const target=block?(selectedLayout.scope==="chrome"?view.footerBlocks:view.pages.find(p=>p.id===sourcePage.id)?.blocks)?.find(b=>b.id===block.id)?.appearance:
          selected==="page-title"&&sourcePage.kind==="custom"?view.pages.find(p=>p.id===sourcePage.id)?.titleAppearance:view.contentOverrides?.styles?.[boxStyleKey??(selected==="page-title"?`${sourcePage.builtinKey}.title`:"")];
        if(target?.box)delete target.box.contentOffset;
      },useMobile);
      Object.assign(draft,next);
    });
  }
  function requestDelete(withContents=false){
    const selectedRect=selectedLayout&&layoutFrame(selectedLayout.scope,selectedLayout.id)?.getBoundingClientRect();
    const separated=selectedRect&&selectedLayout&&displacedParts.some(part=>{
      const rect=layoutFrame(selectedLayout.scope,part.id)?.getBoundingClientRect();
      return rect&&(rect.right<=selectedRect.left||rect.left>=selectedRect.right||rect.bottom<=selectedRect.top||rect.top>=selectedRect.bottom);
    });
    if(hasOwnOffset||separated){
      setClipboardNotice(`This frame has displaced contents (${selectedBoxName??"selected item"}). Choose Reconnect contents to bring them back into the frame before deleting it.`);
      return;
    }
    if(repairButton){setAnnouncement("Connect this existing button to its box before removing it.");return;}
    if(uploadBusy||saveBusy||browsing||!selectedLayout)return;
    const selection={...selectedLayout},source=sourceContent,modelScope=selection.scope==="chrome"?"chrome":sourcePage;
    const nodes=getCanvasNodes(source,modelScope),clicked=nodes.find(n=>n.id===selection.id);
    const blocks=modelScope==="chrome"?source.footerBlocks??[]:modelScope.blocks;
    const layout=resolveCanvasLayout(source,modelScope,useMobile);
    const partOwner=blocks.find(b=>`block:${b.id}`===clicked?.defaultParentId);
    if(partOwner?.type==="text"&&!partOwner.heading.trim()&&(!partOwner.body.trim()||partOwner.body==="Your text goes here.")&&layout[selection.id]?.parentId===clicked?.defaultParentId)selection.id=`block:${partOwner.id}`;
    const node=nodes.find(n=>n.id===selection.id);if(!node?.movable)return;
    withContents=withContents||deleteItemWithContents(modelScope==="chrome"?source.footerBlocks??[]:modelScope.blocks,selection.id);
    const authored=(modelScope==="chrome"?source.footerBlocks??[]:modelScope.blocks).find(item=>`block:${item.id}`===selection.id);
    const emptyBox=!!authored&&(authored.type==="section"&&(!authored.heading.trim()||authored.heading==="New section")||authored.type==="text"&&!authored.heading.trim()&&(!authored.body.trim()||authored.body==="Your text goes here.")||authored.type==="heading"&&(!authored.text.trim()||authored.text==="Your section heading")||authored.type==="canvas-space"||authored.type==="spacer")&&
      !Object.entries(layout).some(([id,entry])=>!entry.removed&&entry.parentId===selection.id&&!id.startsWith(`canvas:layout.block:${selection.scope==="chrome"?"shared-footer":sourcePage.id}:${authored.id}:`));
    const shifts=selection.scope==="page"?shiftsFor(sourcePage,useMobile,selection.id):[];
    const remove=(restore=false)=>{
      const current=deleteContext.current;
      if(!deleteMounted.current||current.source!==source||current.pageId!==sourcePage.id||current.mobile!==useMobile||current.browsing||current.uploadBusy||current.saveBusy||current.selection?.id!==selectedLayout.id||current.selection?.scope!==selection.scope)return;
      if(withContents){let changed=false;onContentEdit(draft=>{if(JSON.stringify(draft)!==JSON.stringify(source))return;const scope=selection.scope==="chrome"?"chrome":draft.pages.find(p=>p.id===sourcePage.id);if(scope){changed=removeCanvasNode(draft,scope,selection.id,useMobile,true);if(changed&&restore&&scope!=="chrome")restoreShifts(draft,scope,useMobile,shifts);}});if(changed){setSelected(null);setSelectedLayout(null);setInlineTarget(null);setInspectorOpen(false);setAnnouncement("Item removed from this layout. Undo restores it.");}else setAnnouncement("The item could not be removed safely. Nothing changed.");return;}
      const map=resolveCanvasLayout(source,modelScope,useMobile),captures:Record<string,CapturedCanvasFrame>={};
      for(const [id,entry]of Object.entries(map)){if(entry.removed||entry.parentId!==selection.id)continue;const descriptor=getCanvasNodes(source,modelScope).find(node=>node.id===id),frame=layoutFrame(selection.scope,id);
        if(!descriptor?.movable||!frame){setAnnouncement("These contents must stay together as a functional unit. Move them out first, or explicitly remove the box and its contents. Nothing changed.");return;}
        const key=boxStyleKeyForTarget(descriptor.styleTarget),appearance=descriptor.styleTarget.startsWith("block:")?page.blocks.find(b=>`block:${b.id}`===descriptor.styleTarget)?.appearance:descriptor.styleTarget==="page-title"?page.titleAppearance:key?content.contentOverrides?.styles?.[key]:undefined;
        const captured=captureCanvasFrame(frame,entry.placement?undefined:appearance?.box);if(!captured){setAnnouncement("The contents cannot be measured safely right now. Nothing was removed.");return;}if(entry.placement?.contentOffset)captured.contentOffset={...entry.placement.contentOffset};if(entry.placement?.aspectLocked!==undefined)captured.aspectLocked=entry.placement.aspectLocked;captures[id]=captured;
      }
      setDeleteIntent({restoreShifts:restore?shifts:undefined,scope:selection.scope,id:selection.id,parentId:map[selection.id].parentId,pageId:sourcePage.id,mobile:useMobile,source,captures});
    };
    if(emptyBox)withContents=true;
    if(shifts.some(shift=>shoveShiftCurrent(source,sourcePage,useMobile,shift))){setShoveRemoval({remove});return;}
    if(emptyBox){remove();return;}
    onRemove(withContents?`Remove “${selectedBoxName??node.label}” and its contents from the canvas?`:`Remove “${selectedBoxName??node.label}” from the canvas?`,
      withContents?"This removes this box and its nested contents. Undo restores it.":"The contents stay in place. Undo restores the box.",remove);
  }
  /* eslint-disable react-hooks/set-state-in-effect -- Finite child rebasing is committed atomically after measuring a temporary destination. */
  useLayoutEffect(()=>{const intent=deleteIntent;if(!intent||applyingDelete.current===intent)return;applyingDelete.current=intent;
    if(uploadBusy||saveBusy||browsing||intent.source!==sourceContent||intent.pageId!==sourcePage.id||intent.mobile!==useMobile){setDeleteIntent(null);setAnnouncement("The layout changed before removal. Nothing was removed.");return;}
    const destination=layoutDestination(intent.scope,intent.parentId),placements:Record<string,CanvasPlacement>={};
    for(const [id,captured]of Object.entries(intent.captures)){const placement=destination?placeCapturedCanvasFrame(captured,destination):null;if(!placement){setDeleteIntent(null);setAnnouncement("The contents cannot keep their positions safely. Nothing was removed.");return;}placements[id]=placement;}
    let changed=false;onContentEdit(draft=>{if(JSON.stringify(draft)!==JSON.stringify(intent.source))return;const scope=intent.scope==="chrome"?"chrome":draft.pages.find(p=>p.id===intent.pageId);if(scope){changed=removeCanvasNode(draft,scope,intent.id,intent.mobile,false,placements);if(changed&&scope!=="chrome"&&intent.restoreShifts)restoreShifts(draft,scope,intent.mobile,intent.restoreShifts);}});setDeleteIntent(null);
    if(changed){setSelected(null);setSelectedLayout(null);setInspectorOpen(false);setAnnouncement("Box removed; its contents kept their positions. Undo restores it.");}else setAnnouncement("Removal could not be applied safely. Nothing changed.");
  },[deleteIntent,sourceContent,sourcePage.id,useMobile,uploadBusy,saveBusy,browsing,onContentEdit]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(()=>{const cancel=()=>{spaceDrag.current=null;setSpacePreview(null);setDrawingSpace(false);};const hidden=()=>{if(document.hidden)cancel();};const escape=(event:globalThis.KeyboardEvent)=>{if(event.key==="Escape"&&drawingSpace){event.preventDefault();event.stopImmediatePropagation();cancel();}};window.addEventListener("blur",cancel);document.addEventListener("visibilitychange",hidden);window.addEventListener("keydown",escape,true);return()=>{spaceDrag.current=null;window.removeEventListener("blur",cancel);document.removeEventListener("visibilitychange",hidden);window.removeEventListener("keydown",escape,true);};},[drawingSpace]);
  /* eslint-disable react-hooks/set-state-in-effect -- Switching layout/session invalidates a pending pointer transaction. */
  useEffect(()=>{spaceDrag.current=null;setSpacePreview(null);setDrawingSpace(false);},[browsing,sourcePage.id,useMobile]);
  /* eslint-enable react-hooks/set-state-in-effect */
  /* eslint-disable react-hooks/set-state-in-effect -- Measure a transient insertion preview, then atomically commit or discard before paint. */
  // Adding is a cancellable local preview until the user clicks a location.
  // Measure the real renderer before one atomic draft edit; never guess a box height.
  useEffect(()=>{
    if(!addingItem)return;
    const cancel=()=>setAddingItem(null);
    const escape=(event:globalThis.KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();cancel();}};
    window.addEventListener("keydown",escape,true);
    if(addingItem.source!==sourceContent||addingItem.pageId!==sourcePage.id||addingItem.mobile!==useMobile||browsing||uploadBusy||saveBusy)cancel();
    return()=>window.removeEventListener("keydown",escape,true);
  },[addingItem,sourceContent,sourcePage.id,useMobile,browsing,uploadBusy,saveBusy]);
  useLayoutEffect(()=>{
    const intent=addingItem;if(!intent?.point||!itemPreview||applyingItem.current===intent)return;
    if(statusSizingRef.current&&canvasRef.current){
      // Match the real preview container queries before measuring any state.
      const baseline=window.getComputedStyle(canvasRef.current);
      for(const property of ["font-family","font-size","font-weight","font-style","font-stretch","font-variant","font-kerning","font-feature-settings","font-variation-settings","line-height","letter-spacing","word-spacing","text-transform","direction","writing-mode"]){
        statusSizingRef.current.style.setProperty(property,baseline.getPropertyValue(property));
      }
      statusSizingRef.current.style.width=`${canvasRef.current.clientWidth}px`;
      for(const text of statusSizingRef.current.querySelectorAll<HTMLElement>('[data-owner-status-value="true"]'))text.getBoundingClientRect();
    }
    if(intent.block.type==="commission-status"&&intent.block.textOnly&&document.fonts?.status==="loading"){
      let active=true;
      void document.fonts.ready.then(()=>{if(active)setStatusSizingVersion(value=>value+1);}).catch(()=>{if(active){setAddingItem(null);setAnnouncement("The status fonts could not be measured. Nothing was added; try again.");}});
      return()=>{active=false;};
    }
    applyingItem.current=intent;
    if(intent.source!==sourceContent||intent.pageId!==sourcePage.id||intent.mobile!==useMobile||browsing||uploadBusy||saveBusy){setAddingItem(null);return;}
    const frame=layoutFrame("page",`block:${intent.block.id}`),destination=layoutDestination("page",null,canvasRef.current);
    const captured=frame?captureNewItemFrame(frame,intent.block,statusSizingRef.current):null;
    if(captured){const bounds=destination?.getBoundingClientRect(),textItem=intent.block.type==="text"||intent.block.type==="heading";
      captured.screenMatrix.e=textItem&&bounds&&bounds.width>0?Math.max(bounds.left,Math.min(intent.point.x,bounds.right-captured.widthPx*captured.screenMatrix.a)):intent.point.x;captured.screenMatrix.f=intent.point.y;captured.aspectLocked=false;}
    const placement=captured&&destination?placeCapturedCanvasFrame(captured,destination):null;
    let changed=false;
    if(placement)onContentEdit(draft=>{
      if(JSON.stringify(draft)!==JSON.stringify(intent.source))return;
      const target=draft.pages.find(p=>p.id===intent.pageId);if(!target||target.blocks.length>=100)return;
      const candidate=structuredClone(draft),page=candidate.pages.find(p=>p.id===intent.pageId)!;
      page.blocks.push(structuredClone(intent.block));
      if(!assignCanvasParent(candidate,page,`block:${intent.block.id}`,null,intent.mobile,placement))return;
      if(shoveEnabled.current)rememberShifts(page,intent.mobile,`block:${intent.block.id}`,shoveAt(candidate,page,intent.mobile,`block:${intent.block.id}`,0,captured));
      Object.assign(draft,candidate);changed=true;
    });
    setAddingItem(null);
    if(changed){canvasRef.current?.focus({preventScroll:true});setSelected(`block:${intent.block.id}`);setSelectedLayout({scope:"page",id:`block:${intent.block.id}`});setSelectedOccurrence(0);setInlineTarget(null);setInspectorOpen(!workspaceMode);setAnnouncement("Item placed at your chosen location. Undo removes it.");}
    else setAnnouncement("This item could not be placed safely. Nothing was added; try again.");
  },[addingItem,itemPreview,statusSizingVersion,previewViewportWidth,sourceContent,sourcePage.id,useMobile,browsing,uploadBusy,saveBusy,onContentEdit,workspaceMode]);
  /* eslint-enable react-hooks/set-state-in-effect */
  function beginItem(type:PageBlock["type"],point?:{x:number;y:number}) {
    if (browsing || uploadBusy || saveBusy || sourcePage.blocks.length >= 100) return;
    setItemPicker(null); setInspectorOpen(false); setSelected(null); setSelectedLayout(null); setInlineTarget(null);
    setCuttingSpace(false);
    if (type === "canvas-space") {
      setDrawingSpace(true);
      setAnnouncement("Drag to draw Canvas Space. Escape cancels.");
      return;
    }
    setAddingItem({block:createBlock(type),source:sourceContent,pageId:sourcePage.id,mobile:useMobile,point});
  }
  function startSpaceCut() {
    if (browsing || uploadBusy || saveBusy) return;
    setContextMenu(null); setItemPicker(null); setInspectorOpen(false); setAddingItem(null);
    setSelected(null); setSelectedLayout(null); setInlineTarget(null);
    setCuttingSpace(true); setDrawingSpace(true);
  }
  function reflowMobilePage(){
    if(device!=="mobile"||browsing||uploadBusy||saveBusy)return;
    onContentEdit(draft=>{
      reflowPageForMobile(draft,sourcePage.id);
    });
    setSelected(null);setSelectedLayout(null);setInlineTarget(null);setInspectorOpen(false);
    setAnnouncement("Page items reflowed for mobile. Undo restores their previous position.");
  }
  function openItems(x:number,y:number) {
    setContextMenu(null); setInspectorOpen(false); setAddingItem(null); setDrawingSpace(false); setCuttingSpace(false);
    setItemPicker({x,y});
  }
  useEffect(() => {
    if (!itemPicker || browsing) return;
    pickerRef.current?.focus();
    const close = (event:globalThis.PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setItemPicker(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  },[itemPicker,browsing,sourcePage.id,useMobile]);
  function closeDrawnGap(start:{x:number;y:number},end:{x:number;y:number}) {
    const canvas=canvasRef.current;
    if (!canvas) return false;
    const layout = resolveCanvasLayout(sourceContent,sourcePage,useMobile);
    const left=Math.min(start.x,end.x), right=Math.max(start.x,end.x);
    const topEdge=Math.min(start.y,end.y), bottomEdge=Math.max(start.y,end.y);
    const emptySpacer = sourcePage.blocks.find(block => {
      if (block.type !== "spacer" && block.type !== "canvas-space") return false;
      const id=`block:${block.id}`, node=layoutFrame("page",id);
      if (!node || layout[id]?.removed || Object.values(layout).some(entry => entry.parentId===id && !entry.removed)) return false;
      const rect=node.getBoundingClientRect();
      return rect.height>=8 && rect.width>0 && right>rect.left && left<rect.right
        && topEdge<=rect.top+1 && bottomEdge>=rect.bottom-1;
    });
    if (emptySpacer) {
      let removed=false;
      onContentEdit(draft=>{
        if(JSON.stringify(draft)!==JSON.stringify(sourceContent))return;
        const page=draft.pages.find(page=>page.id===sourcePage.id);
        if(page)removed=removeCanvasNode(draft,page,`block:${emptySpacer.id}`,useMobile,false);
      });
      return removed;
    }
    const sections = sourcePage.blocks.filter(block => ["text","heading","section"].includes(block.type));
    const target = sections.flatMap(block => {
      const id=`block:${block.id}`, node=layoutFrame("page",id), entry=layout[id];
      if (!node || !entry || entry.removed || entry.placement || (entry.parentId !== null && entry.parentId !== `canvas:layout.page:${sourcePage.id}:shell`) || node.hasAttribute("data-owner-geometry")) return [];
      const rect=node.getBoundingClientRect();
      return rect.top >= Math.max(start.y,end.y) && rect.left < Math.max(start.x,end.x)
        && rect.right > Math.min(start.x,end.x) ? [{block,node,rect}] : [];
    }).sort((a,b) => a.rect.top-b.rect.top)[0];
    if (!target) return false;
    const obstacles = Array.from(canvas.querySelectorAll<HTMLElement>("[data-owner-layout-id]"))
      .filter(node => !node.contains(target.node) && !target.node.contains(node))
      .map(node => node.getBoundingClientRect()).filter(rect=>rect.width>0 && rect.height>0);
    const cut = measureGapCut(target.rect,obstacles,start,end);
    if (!cut) return false;
    const top = parseFloat(window.getComputedStyle(target.node).marginTop);
    const previous = target.node.previousElementSibling;
    const parentDisplay=target.node.parentElement && window.getComputedStyle(target.node.parentElement).display;
    if (parentDisplay !== "block" && parentDisplay !== "flow-root") return false;
    const bottom = previous ? parseFloat(window.getComputedStyle(previous).marginBottom) : 0;
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) return false;
    const marginTop = marginAfterGapCut(top,bottom,cut);
    if (marginTop === null) return false;
    onEdit(draft => {
      const block=draft.pages.find(page => page.id === sourcePage.id)?.blocks.find(block => block.id === target.block.id);
      if (block) block.appearance={...block.appearance,marginTopPx:marginTop};
    });
    return true;
  }
  function spaceGestureMap() {
    if (cuttingSpace) {
      const rect=canvasRef.current?.getBoundingClientRect();
      return rect ? {a:1,b:0,c:0,d:1,e:rect.left,f:rect.top} : null;
    }
    const parent=layoutDestination("page",null);
    return parent ? captureCanvasSpaceParent(parent) : null;
  }
  function finishSpace(event:PointerEvent<HTMLDivElement>,cancel=false){
    const drag=spaceDrag.current;if(!drag||drag.pointer!==event.pointerId)return;spaceDrag.current=null;setSpacePreview(null);
    if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(cancel){setDrawingSpace(false);return;}
    const map=spaceGestureMap();
    const placement=map?canvasSpacePlacementFromDrag(drag.start,{x:event.clientX,y:event.clientY},map):null;
    if(!placement||JSON.stringify(map)!==JSON.stringify(drag.map)||drag.source!==sourceContent||drag.pageId!==sourcePage.id||drag.mobile!==useMobile||browsing||document.hidden||uploadBusy||saveBusy){setDrawingSpace(false);setAnnouncement("Canvas changed or the drawn space was empty. Nothing was added.");return;}
    if (cuttingSpace) {
      setDrawingSpace(false); setCuttingSpace(false);
      setAnnouncement(closeDrawnGap(drag.start,{x:event.clientX,y:event.clientY})
        ? "Blank space reduced. Undo restores it."
        : "Draw across a clear gap above a section. This area could not be closed safely.");
      return;
    }
    const id=newOwnerId("block");let changed=false;
    onContentEdit(draft=>{if(JSON.stringify(draft)!==JSON.stringify(drag.source))return;const page=draft.pages.find(p=>p.id===drag.pageId);if(!page||page.blocks.length>=100)return;page.blocks.push({id,type:"canvas-space",widthPx:placement.widthPx,heightPx:placement.heightPx});changed=assignCanvasParent(draft,page,`block:${id}`,null,drag.mobile,placement);if(changed&&shoveEnabled.current)rememberShifts(page,drag.mobile,`block:${id}`,shovePlacedSiblings(draft,page,drag.mobile,`block:${id}`,0));if(!changed)page.blocks=page.blocks.filter(b=>b.id!==id);});
    setDrawingSpace(false);if(changed){canvasRef.current?.focus({preventScroll:true});setSelected(`block:${id}`);setSelectedLayout({scope:"page",id:`block:${id}`});setSelectedOccurrence(0);setInspectorOpen(true);setAnnouncement("Canvas Space added. Resize any edge or corner; Undo removes it.");}
  }
  function selectLayer(scope:"page"|"chrome",id:string){
    if(uploadBusy||browsing)return;
    const statusPart=/^canvas:layout\.block:[^:]+:([^:]+):status-value$/.exec(id);
    if(statusPart&&(scope==="chrome"?sourceContent.footerBlocks:sourcePage.blocks)?.some(b=>b.id===statusPart[1]&&b.type==="commission-status"))id=`block:${statusPart[1]}`;
    const modelScope=scope==="chrome"?"chrome":sourcePage;
    const descriptor=getCanvasNodes(sourceContent,modelScope).find(item=>item.id===id),frame=layoutFrame(scope,id);
    if(!descriptor||!frame){setAnnouncement("That piece is not visible on this page right now. Nothing was changed.");return;}
    const editable=frame.dataset.ownerEdit===descriptor.styleTarget?frame:Array.from(frame.querySelectorAll<HTMLElement>("[data-owner-edit]")).find(node=>node.dataset.ownerEdit===descriptor.styleTarget);
    choose(descriptor.styleTarget,editable??frame);setSelectedLayout({scope,id});frame.scrollIntoView?.({block:"nearest",behavior:"auto"});
  }
  function selectParent(){
    if(!selectedLayout){setAnnouncement("Choose a piece on the canvas to see its containing box.");return;}
    const scope=selectedLayout.scope==="chrome"?"chrome":sourcePage,parent=resolveCanvasLayout(sourceContent,scope,useMobile)[selectedLayout.id]?.parentId;
    if(parent)selectLayer(selectedLayout.scope,parent);else setAnnouncement(`This piece belongs directly to ${selectedLayout.scope==="chrome"?"Header & footer":"Page content"}.`);
  }
  function editPage(change: (target: OwnerPage) => void) { onEdit(draft => { const target = draft.pages.find(item => item.id === page.id); if (target) change(target); }); }
  function addPhoto() {
    if (uploadBusy || browsing) return;
    const id = newOwnerId("photo");
    onEdit(draft => { draft.gallery.unshift({ id, name: "New photo", src: "/images/home-collage.webp", alt: "Taylor Made Creations fursuit work", width: 1996, height: 960, visible: true }); });
    choose(`gallery:${id}`,undefined,false,{scope:"page",id:`canvas:layout.gallery:${id}`}); canvasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function addPremade() {
    if (uploadBusy || browsing) return;
    const id = newOwnerId("premade");
    onEdit(draft => { draft.premades.unshift({ id, name: "New premade", image: "/images/home-collage.webp", alt: "Premade fursuit", description: "", price: null, visible: false }); });
    choose(`premade:${id}`,undefined,false,{scope:"page",id:`canvas:layout.premade:${id}`}); canvasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function removeSelected(title: string, description: string, remove: () => void) { onRemove(title, description, () => { remove(); closePanel(); }); }

  const pageTitleAppearance = page.kind === "custom"
    ? <OwnerAppearancePanel fonts={content.fonts} label="Page title appearance" value={page.titleAppearance} onEdit={change => editPage(target => { target.titleAppearance ??= {}; change(target.titleAppearance); })} onReset={() => editPage(target => { delete target.titleAppearance; })} />
    : <OwnerElementAppearance content={content} styleKey={`${page.builtinKey}.title`} onEdit={onEdit} />;
  let controls: ReactNode = null;
  function selectTitle(){
    const target=sourcePage.builtinKey==="home"?"core-text:home.title":"page-title";
    const node=canvasRef.current?.querySelector<HTMLElement>(`[data-owner-edit="${target}"]`);
    if(node){choose(target,node);node.focus({preventScroll:true});}
  }
  if(selected==="prices")controls=<><p className={ui.help}>Click price text or amounts directly on the canvas. Open Prices &amp; options for structured groups and options.</p><button type="button" disabled={uploadBusy||saveBusy} onClick={()=>setPricesOpen(true)}>Edit prices &amp; options here</button></>;
  if(selected?.startsWith("canvas:")&&boxStyleKey)controls=<><OwnerElementAppearance content={content} styleKey={boxStyleKey} onEdit={onEdit}/><button type="button" className={ui.secondary} onClick={()=>{const node=canvasRef.current&&findCanvasBoxTarget(canvasRef.current,selected!,selectedOccurrence),editor=node?.dataset.ownerContentEditor??node?.querySelector<HTMLElement>("[data-owner-content-editor]")?.dataset.ownerContentEditor;if(editor)choose(editor);else setAnnouncement("Use the nested text or content box picker to edit this content.");}}>Edit content</button>{boxStyleKey.includes("price")&&<button type="button" className={ui.secondary} onClick={()=>{if(!uploadBusy&&!saveBusy)setPricesOpen(true);}}>Edit prices &amp; options here</button>}</>;
  if (selected === "design") controls = <OwnerDesignPanel content={content} onEdit={onEdit} onReset={() => onRemove(`Restore the original ${useMobile?"mobile":"desktop"} design?`, `This resets colors, fonts, spacing, photo framing and layout for the ${useMobile?"independent mobile":"desktop/shared"} layout in your draft. The other independent layout is preserved. Your writing, photos, pages and prices stay unchanged. Nothing is published.`, () => onEdit(draft => { delete draft.design; if (draft.contentOverrides) delete draft.contentOverrides.styles; for (const page of draft.pages) { delete page.titleAppearance; for (const block of page.blocks) delete block.appearance; } }))} />;
  if (selected?.startsWith("template-") && templateField) controls = <OwnerTemplateEditor disabled={uploadBusy||saveBusy} key={selected} content={content} onEdit={onEdit} target={selected} />;
  if (coreStyleKey) controls = <>{coreStyleKey.startsWith("home.") ? <OwnerLinkedTextField revision={sourceContent} disabled={uploadBusy||saveBusy} contextKey={`${textContextKey}:${coreStyleKey}`} label="Text" multiline value={content.home[coreStyleKey.slice(5) as "title" | "eyebrow" | "description" | "caption"]} onChange={value => onEdit(draft => { draft.home[coreStyleKey.slice(5) as "title" | "eyebrow" | "description" | "caption"] = value; })} /> : coreStyleKey === "prices.intro" ? <OwnerLinkedTextField revision={sourceContent} disabled={uploadBusy||saveBusy} contextKey={`${textContextKey}:prices.intro`} label="Prices introduction" multiline value={content.prices.intro} onChange={value => onEdit(draft => { draft.prices.intro = value; })} /> : null}<OwnerElementAppearance content={content} styleKey={coreStyleKey} onEdit={onEdit} /></>;
  if (selected === "page-title") controls = <><Field label="Page title" value={page.title} onChange={value => editPage(target => { target.title = value; })} />{pageTitleAppearance}</>;
  if(selected==="canvas:layout.site.navigation")controls=<OwnerHeaderEditor content={content} onEdit={onEdit} open={true} onOpenChange={open=>{if(!open)dismissSectionMenu();}} disabled={uploadBusy||saveBusy}/>;
  if (selected === "site") controls = <>
    <Field label="Business name" value={content.site.name} onChange={value => onEdit(draft => { draft.site.name = value; })} hint="This appears in your website header and footer." />
    <OwnerElementAppearance content={content} styleKey="site.brand" onEdit={onEdit} />
    <OwnerSelect label="Header tagline visibility" value={content.design?.headerTagline ?? "hidden"} options={DESIGN_SELECT_FIELDS.find(field => field.key === "headerTagline")!.options} onChange={value => onEdit(draft => { draft.design = { ...draft.design, headerTagline: value === "visible" ? "visible" : "hidden" }; })} />
    <OwnerTemplateEditor disabled={uploadBusy||saveBusy} key="site-template" content={content} onEdit={onEdit} group="site" />
  </>;
  const homeCopyControls = <>
    <Field label="Main heading" value={content.home.title} onChange={value => onEdit(draft => { draft.home.title = value; })} />
    <OwnerElementAppearance content={content} styleKey="home.title" onEdit={onEdit} />
    <OwnerSelect label="Home introduction layout" value={content.design?.homeIntro ?? "title-only"} options={DESIGN_SELECT_FIELDS.find(field => field.key === "homeIntro")!.options} onChange={value => onEdit(draft => { draft.design = { ...draft.design, homeIntro: value === "full" ? "full" : "title-only" }; })} hint="The original layout shows just the title. Choose the full introduction to show your eyebrow, description and buttons." />
    <Field label="Welcome eyebrow" value={content.home.eyebrow} onChange={value => onEdit(draft => { draft.home.eyebrow = value; })} />
    <OwnerElementAppearance content={content} styleKey="home.eyebrow" onEdit={onEdit} />
    <OwnerLinkedTextField revision={sourceContent} disabled={uploadBusy||saveBusy} contextKey={`${textContextKey}:home.description`} label="Welcome description" multiline value={content.home.description} onChange={value => onEdit(draft => { draft.home.description = value; })} />
    <OwnerElementAppearance content={content} styleKey="home.description" onEdit={onEdit} />
  </>;
  if (selected === "home-copy") controls = homeCopyControls;
  if (selected === "page-content") controls = <>
    {page.builtinKey === "home" ? homeCopyControls : <Field label="Page title" value={page.title} onChange={value => editPage(target => { target.title = value; })} required />}
    {page.builtinKey !== "home" && pageTitleAppearance}
    {page.builtinKey === "prices" && <><OwnerLinkedTextField revision={sourceContent} disabled={uploadBusy||saveBusy} contextKey={`${textContextKey}:prices.intro`} label="Prices introduction" value={content.prices.intro} multiline onChange={value => onEdit(draft => { draft.prices.intro = value; })} /><OwnerElementAppearance content={content} styleKey="prices.intro" onEdit={onEdit} /></>}
    {page.builtinKey && <OwnerTemplateEditor disabled={uploadBusy||saveBusy} key={`template-${page.id}`} content={content} onEdit={onEdit} group={page.builtinKey} />}
    <div className={styles.sectionDirectory}><h3>Sections on this page</h3>{page.blocks.length ? page.blocks.map((item, index) => <button key={item.id} type="button" onClick={() => choose(`block:${item.id}`,undefined,false,{scope:"page",id:`block:${item.id}`} )}><span>{index + 1}. {blockLabels[item.type]}</span></button>) : <p className={ui.help}>Add Item to include more words, photos, buttons or questions and answers.</p>}<button type="button" onClick={event => openItems(event.clientX || 16,event.clientY || 100)}>Add Item</button></div>
  </>;
  if (selected === "home-image") controls = <>
    <ImagePicker key="home-image" src={content.home.image.src} alt={content.home.image.alt} onSource={value => onEdit(draft => { draft.home.image.src = value; })} onAlt={value => onEdit(draft => { draft.home.image.alt = value; })} />
    <OwnerElementAppearance content={content} styleKey="home.image" onEdit={onEdit} />
    <OwnerLinkedTextField revision={sourceContent} disabled={uploadBusy||saveBusy} contextKey={`${textContextKey}:home.caption`} label="Caption beneath the main photo" value={content.home.caption} onChange={value => onEdit(draft => { draft.home.caption = value; })} />
    <OwnerElementAppearance content={content} styleKey="home.caption" onEdit={onEdit} />
    <OwnerTemplateEditor disabled={uploadBusy||saveBusy} content={content} onEdit={onEdit} target="template-text:home.photoCredit" />
  </>;
  if (selected === "status") controls = mainCommissionStatus ? <>
    <p>Live commission status is set in the Hub.</p>
    <p><strong>{mainCommissionStatus}</strong></p>
    <OwnerLinkedTextField revision={sourceContent} disabled={uploadBusy||saveBusy} contextKey={`${textContextKey}:site.statusNote`} label="A note for visitors" multiline value={content.site.statusNote} onChange={value => onEdit(draft => { draft.site.statusNote = value; })} />
  </> : <>
    <OwnerSelect label="Commission status" value={content.site.commissionStatus} options={COMMISSION_STATUSES.map(value => ({ value, label: value }))} onChange={value => onEdit(draft => { draft.site.commissionStatus = value as OwnerContent["site"]["commissionStatus"]; })} />
    <OwnerLinkedTextField revision={sourceContent} disabled={uploadBusy||saveBusy} contextKey={`${textContextKey}:site.statusNote`} label="A note for visitors" multiline value={content.site.statusNote} onChange={value => onEdit(draft => { draft.site.statusNote = value; })} />
  </>;
  if (selected === "contact") controls = <>{([ ["telegram", "Telegram username"], ["discord", "Discord username"], ["email", "Email address"], ["tiktok", "TikTok username"], ["twitch", "Twitch username"] ] as const).map(([key, label]) => <Field key={key} label={label} type={key === "email" ? "email" : "text"} value={content.site[key]} onChange={value => onEdit(draft => { draft.site[key] = key === "email" || key === "discord" ? value : value.replace(/^@/, ""); })} hint={key === "email" || key === "discord" ? "Leave blank to hide this contact method." : "Just your username, without @ or a link. Leave blank to hide it."} />)}</>;
  if (selected === "page") controls = <>
    <Field label={page.builtinKey === "home" ? "Page name in this workspace" : "Page title"} value={page.title} onChange={value => editPage(target => { target.title = value; })} required />
    {page.builtinKey !== "home" && pageTitleAppearance}
    <Field label="Name in the menu" value={page.navLabel} onChange={value => editPage(target => { target.navLabel = value; })} required />
    {page.builtinKey !== "home" ? <><Field label="Page address" value={page.slug} onChange={value => editPage(target => { target.slug = value.toLowerCase(); })} hint="Lowercase words with hyphens, such as about-the-maker." />{validatePageSlug(page.slug, content.pages, page.id) && <p className={ui.inlineError}>{validatePageSlug(page.slug, content.pages, page.id)}</p>}</> : <p className={ui.help}>Home page address: /. The home address stays fixed.</p>}
    <OwnerPageNavigation page={page} onEdit={editPage} />
    <button type="button" className={ui.secondary} disabled={uploadBusy} onClick={openPageManager}>Organize all pages</button>
  </>;
  if (selected === "shop") controls = <>
    <Toggle label="Show the premade shop" checked={content.site.showPremades} onChange={value => onEdit(draft => { draft.site.showPremades = value; })} hint="Your listings remain editable here even when the shop is off." />
    <p className={ui.help}>Live shop: <strong>{!liveShopKnown ? liveShopReadError ? "Could not check" : "Checking…" : liveShopVisibility === null ? "Not published yet" : liveShopVisibility ? "On" : "Off"}</strong>. Changing this switch edits your draft, not the live website.</p>
    {!liveShopKnown && <div className={ui.softNote}><p role={liveShopReadError ? "alert" : "status"}>{liveShopReadError || "Checking the published website before offering a live update…"}</p>{onRetryLiveShop && liveShopReadError && <button type="button" className={ui.secondary} onClick={onRetryLiveShop}>Check again</button>}</div>}
    {liveShopKnown && content.site.showPremades !== liveShopVisibility && <div className={ui.softNote}><strong>Apply just the shop switch</strong><p>Update live changes only whether the already-published shop is shown. It does not publish new listings, photos, prices, or any other draft edits.</p><button type="button" className={ui.primary} disabled={!canUpdateLiveShop || liveShopVisibility === null} onClick={onUpdateLiveShop}>Update live</button>{liveShopVisibility === null && <p>Publish the website once before using the shop-only update.</p>}</div>}
  </>;
  if (photo) {
    const index = content.gallery.findIndex(item => item.id === photo.id);
    controls = <>
      <Field label="Photo name" value={photo.name} onChange={value => onEdit(draft => { const item = draft.gallery.find(item => item.id === photo.id); if (item) item.name = value; })} />
      <ImagePicker key={photo.id} src={photo.src} alt={photo.alt} onSource={value => onEdit(draft => { const item = draft.gallery.find(item => item.id === photo.id); if (item) item.src = value; })} onAlt={value => onEdit(draft => { const item = draft.gallery.find(item => item.id === photo.id); if (item) item.alt = value; })} />
      <Field label="Gallery number (optional)" value={photo.displayNumber ?? ""} onChange={value => onEdit(draft => { const item = draft.gallery.find(item => item.id === photo.id); if (item) item.displayNumber = value; })} hint="Leave blank for automatic numbering. Order is controlled below." />
      <Toggle label="Show this photo in the gallery" checked={photo.visible} onChange={value => onEdit(draft => { const item = draft.gallery.find(item => item.id === photo.id); if (item) item.visible = value; })} />
      <div className={styles.itemActions}><span>Photo {index + 1} of {content.gallery.length}</span><MoveButtons label={photo.name} index={index} length={content.gallery.length} onMove={direction => onEdit(draft => move(draft.gallery, photo.id, direction))} /></div>
      <button type="button" className={ui.dangerLink} onClick={() => removeSelected(`Remove “${photo.name}”?`, "This removes it from your draft gallery, not from your image files. The live site stays unchanged until you publish.", () => onEdit(draft => { draft.gallery = draft.gallery.filter(item => item.id !== photo.id); }))}>Remove photo</button>
    </>;
  }
  if (premade) {
    const index = content.premades.findIndex(item => item.id === premade.id);
    controls = <>
      <Field label="Listing name" value={premade.name} onChange={value => onEdit(draft => { const item = draft.premades.find(item => item.id === premade.id); if (item) item.name = value; })} />
      <Field label="Price (USD, optional)" type="number" value={premade.price ?? ""} onChange={value => onEdit(draft => { const item = draft.premades.find(item => item.id === premade.id); if (item) item.price = value === "" ? null : Number(value); })} />
      <OwnerLinkedTextField revision={sourceContent} disabled={uploadBusy||saveBusy} contextKey={`${textContextKey}:premade:${premade.id}:description`} label="Description" multiline value={premade.description} onChange={value => onEdit(draft => { const item = draft.premades.find(item => item.id === premade.id); if (item) item.description = value; })} />
      <PremadePhotoEditor key={premade.id} item={premade} onChange={patch => onEdit(draft => { const item = draft.premades.find(item => item.id === premade.id); if (item) Object.assign(item, patch); })} />
      <Toggle label="Show this listing" checked={premade.visible} onChange={value => onEdit(draft => { const item = draft.premades.find(item => item.id === premade.id); if (item) item.visible = value; })} hint="Hidden listings are only shown in this builder. The shop switch must also be on for visitors to see it." />
      <div className={styles.itemActions}><span>Listing {index + 1} of {content.premades.length}</span><MoveButtons label={premade.name} index={index} length={content.premades.length} onMove={direction => onEdit(draft => move(draft.premades, premade.id, direction))} /></div>
      <button type="button" className={ui.dangerLink} onClick={() => removeSelected(`Remove “${premade.name}”?`, "This removes the listing from your draft. Its photos are not deleted, and the live site stays unchanged until you publish.", () => onEdit(draft => { draft.premades = draft.premades.filter(item => item.id !== premade.id); }))}>Remove listing</button>
    </>;
  }
  if (block) controls = <OwnerBlocksEditor mainCommissionStatus={mainCommissionStatus} disabled={uploadBusy||saveBusy} content={content} onEditContent={onEdit} layoutOrder={layoutOrder} mobileLayout={useMobile} fonts={content.fonts} page={footerBlock?footerPage:page} focusedBlockId={block.id} hideAddPalette hideReorder onEdit={footerBlock?change=>onEdit(draft=>{const target={...page,id:"shared-footer",blocks:draft.footerBlocks??[]};change(target);draft.footerBlocks=target.blocks;}):editPage} onRemove={() => requestDelete()} />;
  if (selected === "sections") controls = <><p className={ui.help}>Choose an item, then click where it should start on the page. You can scroll before placing it; Escape cancels. New items are independent. Existing saved layouts stay unchanged; boxes move with their contents by default; frame-only movement is optional.</p><div className={styles.palette}>{(Object.entries(blockLabels) as [PageBlock["type"], string][]).map(([type, label]) => <button type="button" key={type} draggable={false} disabled={uploadBusy || page.blocks.length >= 100} onClick={() => { if (uploadBusy || page.blocks.length >= 100) return; if(type==="canvas-space"){setSelected(null);setSelectedLayout(null);setInspectorOpen(false);setDrawingSpace(true);setAnnouncement("Drag in any direction to draw Canvas Space. Escape cancels.");return;} setAddingItem({block:createBlock(type),source:sourceContent,pageId:sourcePage.id,mobile:useMobile});setSelected(null);setSelectedLayout(null);setInlineTarget(null);setInspectorOpen(false);setAnnouncement("Click where this item should start. Scroll to another part of the page first if needed. Escape cancels."); }}><span aria-hidden="true">＋</span>{label}</button>)}</div></>;


  if (imageBlock || imageBoxEditable) controls = <ImagePickerFramingContext.Provider value={<><div className={styles.modeSwitch} aria-label="Image editing target"><button type="button" aria-pressed={imageEditMode === "photo"} onClick={() => setImageEditMode("photo")}>Photo framing</button><button type="button" aria-pressed={imageEditMode === "box"} onClick={() => setImageEditMode("box")}>Whole content box</button></div>{imageEditMode === "box" && <p className={ui.help}>Move, resize or tilt the whole content box. Photo framing changes only the image size and crop.</p>}</>}>{controls}</ImagePickerFramingContext.Provider>;
  if(selectedText && !selected?.startsWith("template-link:") && block?.type!=="link"){const field=selectedText;controls=<>{field.inputKind==="money"?<><p>Edit the amount directly on the canvas. Prices are shared across your draft.</p><div className={styles.moneyActions}><button type="button" data-owner-button data-owner-text-tools className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy||saveBusy} onClick={()=>{if(!uploadBusy&&!saveBusy){setInlineTarget(selected);setTextFocusRequest(value=>value+1);}}}>Edit amount</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy||saveBusy} onClick={()=>{if(!uploadBusy&&!saveBusy)setPricesOpen(true);}}>Prices &amp; options</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy||saveBusy} onClick={openPriceColors}>Edit all Price Colors</button></div></>:field.links?<OwnerLinkedTextField revision={sourceContent} disabled={uploadBusy||saveBusy} label={selected==="page-title"?"Page title":"Text"} multiline={selected!=="page-title"&&selected!=="core-text:home.title"} value={field.value} selectionHint={inlineSelectionScope.current===textContextKey?inlineSelection??undefined:undefined} contextKey={textContextKey}  onChange={value=>commitInlineText(field.value,value)}/>:<><Field label={selected==="page-title"?"Page title":"Text"} multiline={selected!=="page-title"&&selected!=="core-text:home.title"} value={field.value} onChange={value=>commitInlineText(field.value,value)}/><small>{selectedHyperlink?.kind==="destination"?"Use Hyperlink to edit this item’s destination.":"Edit this item’s text here."}</small></>}</>;}
  if(block?.type==="commission-status"&&block.textOnly){
    const key=`layout.block:${footerBlock?"shared-footer":page.id}:${block.id}:status-value`;
    const own=content.contentOverrides?.styles?.[key]?.textColor;
    const statusAlignment=content.contentOverrides?.styles?.[key]?.align;
    const setStatusAlignment=(value:string)=>{if(uploadBusy||saveBusy||!["","left","center","right"].includes(value))return;onEdit(draft=>{draft.contentOverrides??={};draft.contentOverrides.styles??={};const style=draft.contentOverrides.styles[key]??={};if(value)style.align=value as "left"|"center"|"right";else delete style.align;});};
    const color=own??content.contentOverrides?.styles?.["layout.commissions.statusValue"]?.textColor??content.contentOverrides?.styles?.[commissionStatusTemplateKey(content.site.commissionStatus)]?.textColor??(content.site.commissionStatus==="Closed"?"#b21b2b":content.site.commissionStatus==="Waitlist"?"#805216":"#24703e");
    const setColor=(value:string)=>{if(uploadBusy||saveBusy)return;onEdit(draft=>{draft.contentOverrides??={};draft.contentOverrides.styles??={};draft.contentOverrides.styles[key]={...draft.contentOverrides.styles[key],textColor:value};});};
    controls=<>{!footerBlock&&<><button type="button" className={ui.secondary} disabled={uploadBusy||saveBusy||!!flowDetach} onClick={()=>changeTitleFlow(!selectedTitleFlow)}>{selectedTitleFlow?"Detach to free placement":"Follow page title"}</button><small>{selectedTitleFlow?"Attached in this layout. Text wraps below the title when needed. Detach before dragging or resizing the box.":"Optional: keep this status beside the page title, wrapping below on smaller screens. Free placement stays unchanged unless selected."}</small></>}<p>Commission status follows the Hub. Its wording is locked here.</p><p>Current status: <strong>{content.site.commissionStatus}</strong></p><fieldset disabled={uploadBusy||saveBusy}><OwnerSelect label="Status text alignment" value={statusAlignment??""} options={[{value:"",label:"Original alignment"},{value:"left",label:"Left"},{value:"center",label:"Center"},{value:"right",label:"Right"}]} onChange={setStatusAlignment}/><small>Align the live text inside this box. The box stays in place.</small><label>Status color <input type="color" value={/^#[0-9a-f]{6}$/i.test(color)?color:"#24703e"} onChange={event=>setColor(event.target.value)}/></label><OwnerHexInput key={key} label="Status color" value={color} onChange={setColor}/></fieldset><button type="button" className={ui.secondary} disabled={uploadBusy||saveBusy||!own} onClick={()=>onEdit(draft=>{const style=draft.contentOverrides?.styles?.[key];if(style)delete style.textColor;})}>Use original status color</button></>;
  }
  if(titleFlowHostLocked)controls=<><p>A status follows this title. Detach it before moving or resizing the title, intro or page shell. Text and typography remain editable.</p>{controls}</>;
  if(block&&!footerBlock&&["text","heading","link"].includes(block.type))controls=<>{controls}<button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy||saveBusy} onClick={()=>requestFooterTransfer()}>Move to shared footer…</button></>;
  if(selectedHyperlink?.kind==="destination")controls=<>{controls}<div className={styles.destinationLinkActions}><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy||saveBusy} onClick={openHyperlink}>Edit hyperlink destination</button>{selectedHyperlink.source!=="social"&&<WebsiteAssetPicker disabled={uploadBusy||saveBusy} key={`pdf:${textContextKey}`} targetId={`pdf:${textContextKey}`} revision={sourceContent} kind="document" value={selectedHyperlink.href} onSelect={href=>commitSelectedPdf(href)}/>}</div></>;
  if (!titleFlowGeometryLocked && selected && supportsBoxTarget(selected, boxPage) && (!(imageBlock || imageBoxEditable) || imageEditMode === "box")) controls = <>{workspaceMode?<>{controls}<details data-owner-advanced-position><summary>Advanced positioning</summary><OwnerBoxFields layoutIdentity={selectedLayout??undefined} {...placementProps} selectBoxContents={linkedContents||selectBoxContents} key={`${page.id}:${selected}:${selectedOccurrence}`} canvasRef={canvasRef} renderVersion={content} target={selected} occurrence={selectedOccurrence} value={boxAppearance} disabled={uploadBusy||saveBusy} initialAspectLocked={initialBoxLocked} onInitialAspectLockChange={setInitialBoxLocked} onChange={changeBoxAppearance} /></details></>:<><OwnerBoxFields layoutIdentity={selectedLayout??undefined} {...placementProps} selectBoxContents={linkedContents||selectBoxContents} key={`${page.id}:${selected}:${selectedOccurrence}`} canvasRef={canvasRef} renderVersion={content} target={selected} occurrence={selectedOccurrence} value={boxAppearance} disabled={uploadBusy||saveBusy} initialAspectLocked={initialBoxLocked} onInitialAspectLockChange={setInitialBoxLocked} onChange={changeBoxAppearance} />{controls}</>}</>;
  if (!footerBlock && !selectedPlacement && block && !block.appearance?.box &&
      (block.type === "section" || block.type === "text" || block.type === "heading")) {
    const spacingOptions = [
      { key: "marginTopPx", label: "Space above section" },
      { key: "marginBottomPx", label: "Space below section" },
    ] as const;
    controls = <><fieldset>
      <legend>Section spacing</legend>
      {spacingOptions.map(({ key, label }) => <OwnerNumberInput key={key} label={label}
        value={block.appearance?.[key]} min={-Number.MAX_VALUE} max={Number.MAX_VALUE} unit="px"
        commitMode="blur" disabled={uploadBusy || saveBusy}
        hint="Use 0 to remove the default margin or a negative value to bring sections closer."
        onChange={value => editPage(page => {
          const item = page.blocks.find(candidate => candidate.id === block.id);
          if (!item || (value === undefined && !item.appearance)) return;
          item.appearance ??= {};
          if (value === undefined) delete item.appearance[key];
          else item.appearance[key] = value;
        })} />)}
    </fieldset>{controls}</>;
  }
  let repairButton: (()=>void)|undefined;
  const buttonBlock = selectedLayout && (selectedLayout.scope === "chrome" ? sourceContent.footerBlocks : sourcePage.blocks)
    ?.find(item => item.type === "link" && (
      selectedLayout.id === `block:${item.id}` ||
      selectedLayout.id === `canvas:layout.block:${selectedLayout.scope === "chrome" ? "shared-footer" : sourcePage.id}:${item.id}:link`
    ));
  if (selectedLayout && buttonBlock) {
    const scopeKey = selectedLayout.scope;
    const parentId = `block:${buttonBlock.id}`;
    const styleKey = `layout.block:${scopeKey === "chrome" ? "shared-footer" : sourcePage.id}:${buttonBlock.id}:link`;
    const linkId = `canvas:${styleKey}`;
    const parent = selectedLayoutMap[parentId];
    const link = selectedLayoutMap[linkId];
    const appearance = content.contentOverrides?.styles?.[styleKey];
    const boxOffset = (block ?? (scopeKey === "chrome" ? content.footerBlocks : page.blocks)?.find(item => item.id === buttonBlock.id))?.appearance?.box?.contentOffset;
    if (parent && link && !parent.removed && !link.removed &&
        (parent.placement?.contentOffset || boxOffset || link.placement || link.parentId !== parentId || appearance?.box)) {
      repairButton = () => {
        if(uploadBusy||saveBusy||browsing)return;
        onContentEdit(draft => {
          if (JSON.stringify(draft) !== JSON.stringify(sourceContent)) return;
          const next = structuredClone(draft);
          const scope = scopeKey === "chrome" ? "chrome" : next.pages.find(item => item.id === sourcePage.id);
          if (!scope) return;
          if (link.parentId !== parentId && !assignCanvasParent(next, scope, linkId, parentId, useMobile)) return;
          if (link.placement && !updateCanvasPlacement(next, scope, linkId, useMobile, undefined)) return;
          if (parent.placement?.contentOffset) {
            const geometry = { ...parent.placement };
            delete geometry.contentOffset;
            if (!updateCanvasPlacement(next, scope, parentId, useMobile, geometry)) return;
          }
          editContentForLayout(next, view => {
            const linkAppearance = view.contentOverrides?.styles?.[styleKey];
            if (linkAppearance?.box) delete linkAppearance.box;
            const item = (scopeKey === "chrome" ? view.footerBlocks : view.pages.find(item => item.id === sourcePage.id)?.blocks)
              ?.find(item => item.id === buttonBlock.id);
            if (item?.appearance?.box?.contentOffset) delete item.appearance.box.contentOffset;
          }, useMobile);
          Object.assign(draft, next);
        });
      };
      controls = <><button type="button" className={ui.secondary} disabled={uploadBusy || saveBusy} onClick={repairButton}>Align button with its box</button>{controls}</>;
    }
  }
  if(selectedLayout&&getCanvasNodes(sourceContent,selectedLayoutScope).find(n=>n.id===selectedLayout.id)?.movable)controls=<>{controls}<button type="button" className={ui.secondary} disabled={uploadBusy||saveBusy} onClick={()=>requestDelete(true)}>Remove box and contents…</button></>;
  const renderedDraft = assetPreview?.draft ?? itemPreview ?? (footerTransfer?.phase === "measure" ? footerTransfer.preview : sourceContent);
  const renderedContent = useMemo(() => mainCommissionStatus && renderedDraft.site.commissionStatus !== mainCommissionStatus
    ? { ...renderedDraft, site: { ...renderedDraft.site, commissionStatus: mainCommissionStatus } }
    : renderedDraft, [renderedDraft, mainCommissionStatus]);
  const sectionPanel = !browsing && inspectorOpen && <aside id={panelId} data-owner-selected-layout-id={selectedLayout?.id} ref={panelRef} className={`${styles.panel} ${workspaceMode?styles.dockedPanel:""} ${selected==="prices"?styles.pricesPanel:""}`} style={workspaceMode?undefined:movable.style} data-moving={movable.moving} aria-label={selectedTitle} onKeyDown={event => { if (event.key === "Escape" && !event.nativeEvent?.isComposing) { event.preventDefault(); if (workspaceMode) dismissSectionMenu(); else closePanel(); } }}>
        <div className={styles.panelHeader} {...(workspaceMode?{}:movable.handleProps)}><div>{!workspaceMode&&<span>{selected === "design" ? (useMobile?"WEBSITE DESIGN · INDEPENDENT MOBILE":"WEBSITE DESIGN · DESKTOP / SHARED") : selected === "site" ? "HEADER, FOOTER & BRANDING" : (useMobile?"EDITING MOBILE APPEARANCE · SHARED CONTENT":"EDITING YOUR DRAFT")}</span>}<h2>{selected?selectedTitle:"Select an item"}</h2></div><button type="button" aria-label="Close section editor" disabled={uploadBusy} onClick={workspaceMode ? dismissSectionMenu : closePanel}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
        {(!workspaceMode||!selected||["page-content","design","site"].includes(selected))&&<div className={styles.panelNav}><button type="button" aria-pressed={selected === "page-content"} disabled={uploadBusy} onClick={() => choose("page-content")}>Page content</button><button type="button" aria-pressed={selected === "design"} disabled={uploadBusy} onClick={() => choose("design")}>Design</button><button type="button" aria-pressed={selected === "site"} disabled={uploadBusy} onClick={() => choose("site")}>Header & footer</button></div>}<div className={styles.panelContent} data-owner-fields><CanvasPlacementEditingContext value={!!selectedPlacement}>{selected?controls:<p>Select an item on the canvas to edit it.</p>}</CanvasPlacementEditingContext><details className={styles.inspectorMore}><summary>More settings</summary>{draftNameControl}{selectedLayout&&selectedBoxName&&<div className={styles.inlineBoxName}><Field label="Content box name" value={boxName} onChange={value=>setBoxNameDraft({id:selectedLayout.id,original:selectedBoxName,value})}/><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy||saveBusy||!boxName.trim()||boxName.trim().length>120||boxName.trim()===selectedBoxName} onClick={()=>onContentEdit(draft=>{const scope=selectedLayout.scope==="chrome"?"chrome":draft.pages.find(p=>p.id===sourcePage.id);if(scope)renameCanvasNode(draft,scope,selectedLayout.id,useMobile,boxName);})}>Rename box</button></div>}{selectedLayout&&(()=>{const scope=selectedLayout.scope,modelScope=scope==="chrome"?"chrome":sourcePage,layout=resolveCanvasLayout(sourceContent,modelScope,useMobile),nodes=getCanvasNodes(sourceContent,modelScope),node=nodes.find(n=>n.id===selectedLayout.id);if(!node?.movable)return null;const choices=nodes.filter(n=>n.canContain&&!layout[n.id]?.removed&&canAssignCanvasParent(sourceContent,modelScope,node.id,n.id,useMobile));const choiceKey=`${sourcePage.id}:${scope}:${node.id}:${useMobile}`;const destination=parentChoice?.id===choiceKey?parentChoice.value:"";return <><OwnerSelect label="Move into box" placeholder="Choose a box…" value={destination} options={choices.map(n=>({value:n.id,label:layout[n.id]?.label??n.label}))} onChange={value=>{if(!uploadBusy&&!saveBusy)setParentChoice({id:choiceKey,value});}}/><button type="button" className={ui.secondary} disabled={uploadBusy||saveBusy||!choices.some(n=>n.id===destination)} onClick={()=>moveLayer(scope,node.id,destination)}>Move into box</button><button type="button" className={ui.secondary} disabled={uploadBusy||saveBusy||!layout[node.id]?.parentId||!canAssignCanvasParent(sourceContent,modelScope,node.id,null,useMobile)} onClick={()=>moveLayer(scope,node.id,null)}>Move to canvas</button></>;})()}</details></div>
        {(!workspaceMode||uploadBusy)&&<div className={styles.panelFooter}>{(!workspaceMode || uploadBusy)&&<span>{uploadBusy ? "Finish or cancel your upload before closing." : "Changes appear on your page as you type."}</span>}<button type="button" className={ui.primary} disabled={uploadBusy} onClick={workspaceMode ? dismissSectionMenu : closePanel}>Done</button></div>}
      </aside>;
  return <section ref={builderRef} className={`${styles.builder} ${workspaceMode?styles.workspaceBuilder:""}`} aria-label="Visual website builder" data-builder-device={device} data-builder-mode={browsing ? "view" : "edit"}>
    <div className={styles.toolbar}>
      <div className={styles.pagePicker}><OwnerSelect label={browsing ? "Viewing page" : "Editing page"} value={page.id} options={activePages.map(item => ({ value: item.id, label: editorPageName(item) }))} onChange={id => { const target = activePages.find(item => item.id === id); if (target && !uploadBusy) { closePanel(); onPageChange(target); } }} />{!browsing&&<button type="button" disabled={saveBusy||uploadBusy} onClick={()=>setRenamePage({id:page.id,name:editorPageName(sourcePage)})}>Rename page in editor</button>}
      {renamePage?.id===page.id&&!browsing&&<form onSubmit={event=>{event.preventDefault();const name=renamePage.name.trim();if(!name||saveBusy||uploadBusy)return;onContentEdit(draft=>{const target=draft.pages.find(p=>p.id===sourcePage.id);if(target)renameCanvasNode(draft,target,pageNameNode(target),false,name);});setRenamePage(null);}}><Field label="Page name in editor" value={renamePage.name} onChange={name=>setRenamePage({id:page.id,name:name.slice(0,80)})}/><button type="submit" disabled={!renamePage.name.trim()||saveBusy||uploadBusy}>Save name</button><button type="button" onClick={()=>setRenamePage(null)}>Cancel</button></form>}</div>
      <div className={styles.viewToolsGroup}><div className={styles.viewTools}><div className={styles.editModeSwitch} aria-label="Builder mode">{browsing ? <button data-owner-button type="button" className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy} onClick={() => changeMode(false)}>Edit website</button> : <button data-owner-button type="button" className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy} onClick={() => changeMode(true)}>Exit edit mode</button>}</div>{onRequestDiscard&&<button data-owner-button type="button" className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy||saveBusy} onClick={()=>{if(!uploadBusy&&!saveBusy)onRequestDiscard();}}>Discard Edits</button>}<div className={styles.deviceSwitch} aria-label="Preview width"><button type="button" aria-label="Desktop view" title="Desktop view" aria-pressed={device === "desktop"} disabled={uploadBusy} onClick={() => {if(uploadBusy)return;endBlockDrag();setSelected(null);setDevice("desktop");}}><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="13" rx="2" /><path d="M12 16v5m-4 0h8" /></svg></button><button type="button" aria-label="Mobile view" title="Mobile view" aria-pressed={device === "mobile"} disabled={uploadBusy} onClick={() => {if(uploadBusy)return;endBlockDrag();setSelected(null);setDevice("mobile");}}><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M10 5h4m-3 14h2" /></svg></button></div></div>
      {!browsing&&<div className={styles.quickTools}><button type="button" data-owner-button className={`${buttons.button} ${buttons.primary} ${buttons.compact}`} aria-pressed={selected === "design"} {...panelOpener("design")} onClick={event => choose("design", event?.currentTarget, true)}>Design</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} aria-pressed={selected === "site"} {...panelOpener("site")} onClick={event => choose("site", event?.currentTarget, true)}>Header & footer</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} aria-pressed={selected === "page"} {...panelOpener("page")} onClick={event => choose("page", event?.currentTarget, true)}>Page settings</button>{sourcePage.builtinKey==="prices"&&<button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy||saveBusy} onClick={openPriceColors}>Edit all Price Colors</button>}</div>}
      {!browsing&&<div className={styles.sectionHistoryActions}>{(onUndo || onRedo) && <div className={styles.historyActions} aria-label="Draft history">
          <button data-owner-button type="button" className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={saveBusy || uploadBusy || !canUndo} onClick={onUndo} title="Undo draft edit (Ctrl/Cmd+Z)" aria-keyshortcuts="Control+Z Meta+Z">Undo</button>
          <button data-owner-button type="button" className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={saveBusy || uploadBusy || !canRedo} onClick={onRedo} title="Redo draft edit (Ctrl/Cmd+Shift+Z)" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z">Redo</button>
        </div>}
      <button type="button" data-owner-button className={`${styles.addSection} ${buttons.button} ${buttons.secondary} ${buttons.compact}`} {...panelOpener("sections")} onClick={event => openItems(event.clientX || 16,event.clientY || 100)}>Add Item</button></div>}
        <div className={styles.builderSaveActions}>
          {onPopOut && <button data-owner-button type="button" className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy} title="Open a read-only draft preview in another window" onClick={() => { if (!uploadBusy) onPopOut(); }}>Popout Preview ↗</button>}

          {onSave && <button data-owner-button type="button" className={`${buttons.button} ${buttons.primary} ${buttons.compact}`} disabled={saveBusy || uploadBusy} onClick={() => { if (!saveBusy && !uploadBusy) onSave(); }}>Save</button>}
        </div>
      </div>

    </div>
    <details className={styles.moreControls}><summary>More editing tools</summary>
    <div className={styles.layoutScope}><Toggle disabled={uploadBusy} label="Independent mobile layout" checked={!!sourceContent.design?.mobileLayoutEnabled} onChange={enabled=>{if(uploadBusy)return;endBlockDrag();setSelected(null);onContentEdit(draft=>{if(enabled)initializeMobileLayout(draft);else{draft.design??={};draft.design.mobileLayoutEnabled=false;}});}} hint="Off: both previews share layout. On: mobile geometry, appearance and section membership can differ; text and prices remain shared. Turning off preserves mobile edits."/></div>
    <p className={styles.draftDisclaimer}>{draftSaveStatus ?? "Your edits stay private. Save opens your draft and publication choices."} Switching pages, selections or preview modes never publishes or deletes content.</p>
    <div className={styles.actionbar}>
      <p>{uploadBusy ? "Uploading your photo… finish or cancel it before changing sections." : browsing ? "Viewing your private draft, including unsaved changes. Choose Edit website to make changes. Switching modes never publishes your work." : "Choose a piece to move, resize or tilt it. Use More settings to move it into another box or back onto the canvas. Boxes move with their contents by default. Your layout can overlap or extend outside boxes."}</p>
      {!browsing && <div><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy} onClick={openPageManager}>Manage pages</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy} onClick={openNewPage}>＋ New page</button></div>}
    </div>
    {!browsing && <div className={styles.contextbar}>
      <button type="button" aria-pressed={selected === "page-content"} {...panelOpener("page-content")} onClick={event => choose("page-content", event?.currentTarget, true)}>Page content</button>
      {page.builtinKey === "home" && <><button type="button" {...panelOpener("home-copy")} onClick={event => choose("home-copy", event?.currentTarget, true)}>Welcome text</button><button type="button" {...panelOpener("home-image")} onClick={event => choose("home-image", event?.currentTarget, true)}>Main photo</button></>}
      {page.builtinKey === "gallery" && <><span>{content.gallery.length} photos · newest first</span><button type="button" onClick={addPhoto}>＋ Add a photo</button></>}
      {page.builtinKey === "premades" && <><button type="button" {...panelOpener("shop")} onClick={event => choose("shop", event?.currentTarget, true)}>Shop: {content.site.showPremades ? "on" : "off"} <span aria-hidden="true">⌄</span></button>{liveShopKnown && content.site.showPremades !== liveShopVisibility && liveShopVisibility !== null && <button type="button" className={styles.applyShop} disabled={!canUpdateLiveShop} onClick={onUpdateLiveShop}>Update live</button>}<button type="button" onClick={addPremade}>＋ Add a premade</button><span>{!content.site.showPremades ? "Shop is off. You can still edit every listing below." : "Hidden listings appear here for editing only."}</span></>}
      {page.builtinKey === "contact" && <><button type="button" {...panelOpener("contact")} onClick={event => choose("contact", event?.currentTarget, true)}>Contact details</button><button type="button" {...panelOpener("site")} onClick={event => choose("site", event?.currentTarget, true)}>Header & footer</button><button type="button" {...panelOpener("status")} onClick={event => choose("status", event?.currentTarget, true)}>Commission status</button></>}
      {page.builtinKey === "commissions" && <button type="button" {...panelOpener("status")} onClick={event => choose("status", event?.currentTarget, true)}>Commission status</button>}
      <button type="button" disabled={uploadBusy} aria-pressed={selected==="prices"} onClick={()=>{if(!uploadBusy&&!saveBusy)setPricesOpen(true);}}>Edit prices &amp; options here</button>

    </div>}
    {!browsing && canvasBoxes.length > 0 && <div className={styles.boxPicker}><OwnerSelect label="Select a content box" placeholder="Choose text, a photo or a section…" value={canvasBoxes.some(box => box.target === selected && box.occurrence === selectedOccurrence) ? `${selected}#${selectedOccurrence}` : ""} options={canvasBoxes} onChange={value => { if (uploadBusy) return; const box = canvasBoxes.find(box => box.value === value); if (!box) return; const node = canvasRef.current && findCanvasBoxTarget(canvasRef.current, box.target, box.occurrence); choose(box.target, node ?? undefined); setSelectedOccurrence(box.occurrence); node?.scrollIntoView({ block: "nearest", behavior: "auto" }); }} /><span>Registered content boxes, including template headings. Repeated labels share their appearance.</span></div>}
    {!browsing && <OwnerHeaderEditor content={content} onEdit={onEdit} open={navigationOpen} onOpenChange={changeNavigationOpen} disabled={uploadBusy} />}
    </details>
    <div ref={toolbarRef} className={styles.textToolbarDock} data-owner-formatting-dock>
      {!browsing&&<OwnerTextFormattingBar resizeHandles={showResizeHandles} onResizeHandlesChange={value=>{setShowResizeHandles(value);if(value)setInlineTarget(null);}} canHyperlink={selectedHyperlink?.kind==="destination"||selectedHyperlink?.kind==="inline"&&!!styleRange} shove={shove} onShoveChange={value=>{if(uploadBusy||saveBusy||browsing)return;shoveGesture.current=null;if(shoveMemory)shoveMemory.current=value;setShove(value);setShoveNotice("");}} computed={toolbarComputed} selectionStyles={selectedRichRuns.map(run=>run.style??{})} marks={textMarks} selectionKey={formattingKey} active={!!selectedText&&!!inlineTextId} selected={!!styleRange} caretActive={!!typingCaret} disabled={uploadBusy||saveBusy} fonts={sourceContent.fonts} onStyle={formatSelectedText} onReset={()=>formatSelectedText(null)} onLink={()=>openHyperlink()} onEdit={()=>{if(selectedText)setInlineTarget(selected);}}>
      {workspaceMode && <>

      <button type="button" disabled={uploadBusy||saveBusy} onClick={event=>{
        const rect=event.currentTarget.getBoundingClientRect();openItems(rect.left,rect.bottom+6);
      }}>+ Add</button>
      <button type="button" disabled={uploadBusy||saveBusy} onClick={startSpaceCut}>Remove space</button>
      {styleRange&&!typingCaret&&toolbarComputed?.fontSize&&(selected==="page-title"||selected==="core-text:home.title"||block?.type==="heading")&&
        <OwnerTitleSizeHandle key={textContextKey} size={toolbarComputed.fontSize} onSize={fontSize=>{if(!uploadBusy&&!saveBusy)formatSelectedText({fontSize});}}/>}
      {device==="mobile"&&<button type="button" disabled={uploadBusy||saveBusy} onClick={reflowMobilePage} title="Restore responsive flow for this page in the mobile layout. Undo restores the previous positions.">Reflow mobile page</button>}
      {selected&&(selectedPlacement||supportsBoxTarget(selected,boxPage))&&!titleFlowGeometryLocked&&<button type="button" disabled={uploadBusy||saveBusy} aria-pressed={selectedPlacement?!!selectedPlacement.aspectLocked:boxAppearance?.box?.aspectLocked??initialBoxLocked} onClick={()=>{
        if(selectedPlacement)changePlacement({...selectedPlacement,aspectLocked:!selectedPlacement.aspectLocked});
        else if(boxAppearance?.box)changeBoxAppearance({...boxAppearance,box:{...boxAppearance.box,aspectLocked:!boxAppearance.box.aspectLocked}});
        else setInitialBoxLocked(!initialBoxLocked);
      }}>Lock ratio</button>}
      {hasFrameOffset&&!repairButton&&<button type="button" disabled={uploadBusy||saveBusy} onClick={reconnectContents}>Reconnect contents</button>}
      {repairButton&&<button type="button" disabled={uploadBusy||saveBusy} onClick={repairButton}>Align button</button>}
      {assetLibraryKey&&<button type="button" disabled={uploadBusy||saveBusy} onClick={()=>openAssets()}>Assets</button>}
      {!!assetIds?.length&&<button type="button" onClick={saveAssetSelection} disabled={saveBusy||uploadBusy}>Save selection as asset ({assetIds.length})</button>}
      <div className={styles.sectionMenu} onKeyDown={event => {
        if (event.key !== "Escape" || event.defaultPrevented || !inspectorOpen || uploadBusy) return;
        event.preventDefault();
        dismissSectionMenu();
      }}>
        <button ref={sectionMenuButton} type="button" data-owner-button
          className={styles.sectionToggle}
          aria-expanded={inspectorOpen} aria-controls={inspectorOpen ? panelId : undefined}
          disabled={uploadBusy||saveBusy} onClick={() => inspectorOpen ? dismissSectionMenu() : setInspectorOpen(true)}>
          Edit Section
        </button>
        {sectionPanel}
      </div>
      </>}
      </OwnerTextFormattingBar>}

    </div>

    {textWidthWarning&&<p className={styles.help} role="status" data-owner-text-width-warning>{textWidthWarning}</p>}
    {clipboardNotice&&<p className={styles.help} role="status" data-owner-frame-clipboard-notice>{clipboardNotice}</p>}
    {flowDetach&&<div ref={flowSizingRef} aria-hidden="true" inert style={{position:"fixed",left:0,top:0,width:"100vw",height:0,maxWidth:"none",overflow:"hidden",visibility:"hidden",pointerEvents:"none"}}><CommissionStatusSizingSamples content={sourceContent} blockId={flowDetach.block.id} mobile={useMobile}/></div>}
    {itemPreview&&addingItem?.block.type==="commission-status"&&addingItem.block.textOnly&&<div ref={statusSizingRef} aria-hidden="true" inert style={{position:"fixed",left:0,top:0,width:"100vw",height:0,maxWidth:"none",overflow:"hidden",visibility:"hidden",pointerEvents:"none"}}><CommissionStatusSizingSamples content={itemPreview} blockId={addingItem.block.id} mobile={useMobile}/></div>}

    <div className={`${styles.stage} ${workspaceMode?styles.workspaceStage:""}`} data-device={device}>
      <div className={styles.previewViewport} data-preview-device={device} role="region" aria-label={device==="desktop"?"Full-width website preview; scroll horizontally to see the whole page":"Mobile website preview"} tabIndex={device==="desktop"?0:undefined}>
      <div ref={canvasRef} style={device==="desktop"&&previewViewportWidth?{width:previewViewportWidth,maxWidth:"none",boxSizing:"content-box"}:undefined} tabIndex={-1} className={`${styles.canvas} ${!browsing ? styles.editing : ""}`} onContextMenu={event=>{if(browsing||uploadBusy||saveBusy)return;if(event.target instanceof HTMLElement&&event.target.closest("input,textarea,select,[contenteditable]"))return;event.preventDefault();let editTarget:string|undefined;if(event.target instanceof HTMLElement){const nearest=event.target.closest<HTMLElement>("[data-owner-edit]");const target=nearest&&canvasRef.current?resolveCanvasClickTarget(sourceContent,sourcePage,canvasRef.current,nearest):nearest;editTarget=target?.dataset.ownerEdit;if(editTarget)choose(editTarget,target??undefined,false);}setContextMenu({x:event.clientX,y:event.clientY,target:editTarget});}} onPointerDownCapture={() => { dragClickGuard.current = false; }} onClickCapture={capture} onKeyDownCapture={capture} onDragStartCapture={beginBlockDrag} onDragOver={overBlock} onDrop={dropBlock} onDragEnd={endBlockDrag}>
        <SiteContentFrame forceCanvasSlots={flowDetach?{scope:"page",id:"__root"}:footerTransfer?.phase==="measure"?{scope:"chrome",id:"canvas:layout.site.footer"}:drawingSpace&&!cuttingSpace||addingItem||assetPreview?{scope:"page",id:"__root"}:deleteIntent?{scope:deleteIntent.scope,id:deleteIntent.parentId??"__root",omitNodeId:deleteIntent.id}:placementIntent?{scope:placementIntent.scope,id:placementIntent.parentId??"__root",omitNodeId:placementIntent.id}:undefined} content={renderedContent} page={assetPreview?.draft.pages.find(p=>p.id===sourcePage.id)??itemPreview?.pages.find(p=>p.id===sourcePage.id)??(footerTransfer?.phase==="measure"?footerTransfer.preview.pages.find(p=>p.id===sourcePage.id)??sourcePage:sourcePage)} layoutViewport={device} mode="editor" editable={!browsing} onEditCommissionForm={workspaceMode ? undefined : onEditCommissionForm} onNavigate={target => { if (!uploadBusy) { closePanel(); onPageChange(target); } }} />
        {!browsing&&inlineTarget&&inlineTarget===selected&&selectedText&&<OwnerCanvasTextEditor key={`${sourcePage.id}:${inlineTarget}:${selectedLayout?.scope??"page"}:${selectedLayout?.id??selectedOccurrence}:${useMobile}:${clipboardScopeKey??"owner-mounted"}`} canvasRef={canvasRef} target={inlineTarget} identity={selectedLayout??undefined} value={selectedText.value} inputKind={selectedText.inputKind} horizontalGrowth={horizontalText} runs={inlineRuns} focusRequest={textFocusRequest} onUndo={()=>{clearPendingTyping();onUndo?.();}} onRedo={()=>{clearPendingTyping();onRedo?.();}} links={selectedText.links} disabled={uploadBusy||saveBusy} onCommit={commitInlineText} onCancel={()=>{clearPendingTyping();setInlineTarget(null);}} onSelection={receiveInlineSelection} onHyperlink={requestInlineHyperlink}/> }
        {!browsing && selected && (imageStyleKey || imageBlock) && (imageStyleKey === "site.logo" || imageEditMode === "photo") && <OwnerCanvasImageTools key={`${page.id}:${selected}:${selectedOccurrence}`} canvasRef={canvasRef} renderVersion={content} target={selected} occurrence={selectedOccurrence} value={selectedImageAppearance} disabled={uploadBusy||saveBusy} onReplace={imageStyleKey==="site.logo"?()=>setInspectorOpen(true):undefined} onChange={changeImageAppearance} />}
        {assetPreview&&!assetPreview.point&&!browsing&&<div className={styles.itemPlacement} style={interactionArea} data-owner-canvas-controls role="region" aria-label="Place saved asset" onClick={event=>{event.stopPropagation();setAssetPreview({...assetPreview,point:{x:event.clientX,y:event.clientY}});}}><span className={styles.spacePrompt}>Click to place the asset <button type="button" onClick={event=>{event.stopPropagation();setAssetPreview(null);}}>Cancel</button></span></div>}
        {addingItem&&!browsing&&<div className={styles.itemPlacement} style={interactionArea} data-owner-canvas-controls role="region" aria-label="Click to place the new item; scroll to choose a location, or Escape to cancel" onClick={event=>{if(event.button!==0||addingItem.point||uploadBusy||saveBusy)return;event.preventDefault();event.stopPropagation();setAddingItem({...addingItem,point:{x:event.clientX,y:event.clientY}});}}><span className={styles.spacePrompt}>Click to place {blockLabels[addingItem.block.type]} · Scroll to choose a location · Escape cancels</span></div>}
        {drawingSpace&&!browsing&&<div className={styles.spaceDrawing} style={interactionArea} data-owner-canvas-controls data-owner-space-drawing tabIndex={0} role="region" aria-label={cuttingSpace?"Draw over blank space to remove it":"Draw Canvas Space in any direction; Escape cancels"} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();spaceDrag.current=null;setSpacePreview(null);setDrawingSpace(false);}}} onPointerDown={event=>{if(event.button!==0||uploadBusy||saveBusy)return;const map=spaceGestureMap();if(!map)return;event.preventDefault();event.stopPropagation();spaceDrag.current={pointer:event.pointerId,start:{x:event.clientX,y:event.clientY},map,source:sourceContent,pageId:sourcePage.id,mobile:useMobile};event.currentTarget.setPointerCapture?.(event.pointerId);}} onPointerMove={event=>{const drag=spaceDrag.current;if(!drag||drag.pointer!==event.pointerId)return;const rect=event.currentTarget.getBoundingClientRect();setSpacePreview({left:Math.min(drag.start.x,event.clientX)-rect.left,top:Math.min(drag.start.y,event.clientY)-rect.top,width:Math.abs(event.clientX-drag.start.x),height:Math.abs(event.clientY-drag.start.y)});}} onPointerUp={event=>finishSpace(event)} onPointerCancel={event=>finishSpace(event,true)} onLostPointerCapture={event=>{if(spaceDrag.current)finishSpace(event,true);}}>{spacePreview&&<div className={styles.spacePreview} style={spacePreview}/>}<span className={styles.spacePrompt}>{cuttingSpace?"Draw over the gap · Escape cancels":"Drag to draw Canvas Space · Escape cancels"}</span></div>}
        {!browsing && !titleFlowGeometryLocked && !(inlineTarget===selected&&selectedText) && selected && (boxStyleKey || selected === "page-title" || boxEditableBlock) && (!(imageBlock || imageBoxEditable) || imageEditMode === "box") && !repairButton && <OwnerCanvasBoxTools constrainTextWidth={block?.type==="text"||block?.type==="heading"||horizontalText} showResizeHandles={showResizeHandles} onCopyBox={clipboardScopeKey&&sharedFrameClipboard?copyBox:undefined} onPasteBox={hasFrameClipboard&&frameClipboard.current?.scopeKey===clipboardScopeKey?()=>void pasteBox():undefined} onCanvasMoveStart={shove?startShove:undefined} onCanvasMovePreview={(point,snapshot)=>{previewShove(snapshot);if(!footerBlock&&block&&["text","heading","link"].includes(block.type)){const frame=footerFrame();if(frame){if(overFooter(point))frame.dataset.ownerFooterDrop="true";else delete frame.dataset.ownerFooterDrop;}}}} onCanvasMoveCancel={()=>{clearFooterHighlight();shoveGesture.current=null;}} onCanvasMoveCommit={shove||(!footerBlock&&block&&["text","heading","link"].includes(block.type))?(capture,point,next)=>{clearFooterHighlight();if(!footerBlock&&block&&["text","heading","link"].includes(block.type)&&overFooter(point)){shoveGesture.current=null;return requestFooterTransfer(capture);}return commitShove(capture,next);}:undefined} layoutIdentity={selectedLayout??undefined} {...placementProps} selectBoxContents={linkedContents||selectBoxContents} onSelectBoxContents={linkedContents?undefined:selected=>setContentsSelection(selected?null:contentsSelectionKey)} key={`${page.id}:${selected}:${selectedOccurrence}`} canvasRef={canvasRef} renderVersion={content} target={selected} occurrence={selectedOccurrence} value={boxAppearance} disabled={uploadBusy||saveBusy} initialAspectLocked={initialBoxLocked} onInitialAspectLockChange={setInitialBoxLocked} onChange={changeBoxAppearance} onEditContent={() => {if(selectedLayout?.id===`canvas:layout.page:${page.id}:intro`||selectedLayout?.id==="canvas:layout.home.intro"){selectTitle();return;}if(selectedText){setInspectorOpen(false);setInlineTarget(selected);}else setInspectorOpen(true);}} onDelete={selectedLayout&&getCanvasNodes(sourceContent,selectedLayoutScope).find(n=>n.id===selectedLayout.id)?.movable?()=>requestDelete():undefined} onSelectParent={selectedLayout&&selectedLayoutMap[selectedLayout.id]?.parentId?selectParent:undefined} reparentId={undefined} sectionOrder={layoutOrder} />}
      </div>
      </div>
      {!workspaceMode && selected && controls && sectionPanel}
    </div>
    {assetLibraryOpen&&!browsing&&<div ref={shelfRef} role="dialog" aria-label="Assets" className={styles.assetShelf} onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();setOpenAssetLibraryKey(null);}}}><strong>Assets</strong> <button type="button" onClick={()=>setOpenAssetLibraryKey(null)}>Done</button>
      <p>Hold Alt and left-click each box to select it. Alt-click again to deselect. Choose Save selection as asset. To reuse it, click Add to page and choose a spot, or drag it onto the canvas.</p>
      {pendingAsset&&<form onSubmit={event=>{event.preventDefault();saveAsset();}}><Field label="Asset name" value={assetName} onChange={value=>setAssetName(value.slice(0,80))} required/><button type="submit" disabled={!assetName.trim()}>{variantRoot?"Save as variant":"Save asset"}</button></form>}
      {editingAsset&&<div><Field label="Saved asset name" value={editingAsset.name} onChange={name=>setEditingAsset({...editingAsset,name:name.slice(0,80)})}/>
        {editingAsset.clip.blocks.map((b,index)=>Object.entries(b).filter(([key,value])=>typeof value==="string"&&["label","heading","text","body","caption","note","actionLabel","alt","href"].includes(key)).map(([key,value])=><Field key={b.id+key} label={b.type+" "+key} value={String(value)} onChange={value=>setEditingAsset(changeAssetField(editingAsset,index,key,value))}/>))}
        {editingAsset.clip.blocks.map((b,index)=>{if(b.type!=="link")return null;const design=assetButtonDesign(editingAsset,index);
          return <fieldset key={b.id}><legend>{b.label||"Button"}</legend><OwnerSelect label="Button style" value={design.preset} options={BUTTON_PRESETS.map(value=>({label:value,value}))} onChange={value=>{const preset=BUTTON_PRESETS.find(p=>p===value);if(preset)changeAssetButton(editingAsset,index,{...design,preset});}}/>
            <OwnerHexInput label="Button background" value={design.imported?.backgroundColor??"#800014"} onChange={backgroundColor=>changeAssetButton(editingAsset,index,{...design,imported:{...design.imported,backgroundColor}})}/>
            <OwnerHexInput label="Button text color" value={design.imported?.color??"#ffffff"} onChange={color=>changeAssetButton(editingAsset,index,{...design,imported:{...design.imported,color}})}/></fieldset>;})}
        {!pendingAsset&&<button type="button" onClick={()=>{setPendingAsset({...editingAsset.clip,sourceBinding:JSON.stringify(sourceContent)});setAssetName(editingAsset.name+" variant");}}>Save as variant…</button>}
        <button type="button" disabled={!editingAsset.name.trim()||saveBusy||uploadBusy} onClick={()=>void overwriteAsset(editingAsset)}>Save and update linked copies</button></div>}
      {builderAssets.map(asset=><div className={styles.savedAsset} key={asset.id}><span>{asset.name}</span><button type="button" onClick={()=>{setEditingAsset(structuredClone(asset));setPendingAsset(null);}}>Edit asset</button><button type="button" draggable={!saveBusy&&!uploadBusy} onDragStart={event=>{dragAsset.current=asset;event.dataTransfer.effectAllowed="copy";event.dataTransfer.setData("text/plain",asset.name);}} onDragEnd={()=>{dragAsset.current=null;}} disabled={uploadBusy||saveBusy} onClick={()=>void insertAsset(asset)}>Add to page</button><button type="button" aria-label={`Remove asset ${asset.name}`} onClick={()=>storeAssets(builderAssets.filter(item=>item.id!==asset.id))}>Remove</button></div>)}
      {clipboardNotice&&<p role="status">{clipboardNotice}</p>}
    </div>}
    {itemPicker&&!browsing&&<div ref={pickerRef} role="dialog" aria-label="Add item" tabIndex={-1}
      className={styles.itemPicker} style={{"--picker-x":`${itemPicker.x}px`,"--picker-y":`${itemPicker.y}px`} as CSSProperties}
      onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setItemPicker(null);}}}>
      <header><strong>Add item</strong><button type="button" className={styles.pickerClose} aria-label="Close add item" onClick={()=>setItemPicker(null)}>×</button></header>
      <p>Drag an item onto the page or click to place it.</p>
      <div className={styles.itemChoices}>{(Object.entries(blockLabels) as [PageBlock["type"],string][]).map(([type,label])=>
        <button type="button" key={type} draggable={type!=="canvas-space"} disabled={uploadBusy||saveBusy||sourcePage.blocks.length>=100}
          onDragStart={event=>{
            if(type==="canvas-space")return;
            draggingItem.current={type,source:sourceContent,pageId:sourcePage.id,mobile:useMobile};
            event.dataTransfer.effectAllowed="copy";
            event.dataTransfer.setData("text/plain",label);
          }} onDragEnd={()=>{draggingItem.current=null;}} onClick={()=>beginItem(type)}>{label}</button>
      )}</div>
    </div>}
    {shoveRemoval&&<Dialog title="Remove item and restore spacing?" onClose={()=>setShoveRemoval(null)} actions={<><button type="button" data-owner-button className={buttons.button+" "+buttons.secondary} onClick={()=>setShoveRemoval(null)}>Cancel</button><button type="button" data-owner-button className={buttons.button+" "+buttons.secondary} onClick={()=>{shoveRemoval.remove(false);setShoveRemoval(null);}}>Remove and keep spacing</button><button type="button" data-owner-button className={buttons.button+" "+buttons.primary} onClick={()=>{shoveRemoval.remove(true);setShoveRemoval(null);}}>Remove and restore spacing</button></>}><p>Restore the neighboring boxes to their positions before Shove. Boxes moved since then keep their newer positions.</p></Dialog>}
    {contextMenu&&!browsing&&<div ref={contextMenuRef} role="menu" aria-label="Builder actions" className={styles.canvasContextMenu} style={{left:Math.max(8,Math.min(contextMenu.x,typeof window!=="undefined"?window.innerWidth-180:contextMenu.x)),top:Math.max(8,Math.min(contextMenu.y,typeof window!=="undefined"?window.innerHeight-290:contextMenu.y))}} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setContextMenu(null);canvasRef.current?.focus();}else if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)){event.preventDefault();const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")),at=items.indexOf(document.activeElement as HTMLButtonElement),next=event.key==="Home"?0:event.key==="End"?items.length-1:(at+(event.key==="ArrowDown"?1:-1)+items.length)%items.length;items[next]?.focus();}}}>{linkedRoot&&<button type="button" role="menuitem" onClick={editPlacedAsset}>Edit linked asset or save variant</button>}{assetLibraryKey&&(!!assetIds?.length||selectedLayout?.scope==="page"&&(selectedLayout.id.startsWith("block:")||["canvas:layout.commissions.status","template-text:commissions.statusLabel","canvas:layout.commissions.statusValue"].includes(selectedLayout.id)))&&<button role="menuitem" type="button" onClick={saveAssetSelection}>Save as asset{assetIds?.length?` (${assetIds.length})`:""}</button>}{contextMenu.target&&<button role="menuitem" type="button" onClick={()=>{setContextMenu(null);setInspectorOpen(true);requestAnimationFrame(()=>panelRef.current?.querySelector<HTMLButtonElement>('button[aria-label="Close section editor"]')?.focus({preventScroll:true}));}}>Edit Section</button>}<button role="menuitem" type="button" disabled={!clipboardScopeKey||!sharedFrameClipboard||!selectedLayout||saveBusy||uploadBusy} onClick={()=>{setContextMenu(null);copyBox();}}>Copy box</button><button role="menuitem" type="button" disabled={!clipboardScopeKey||frameClipboard.current?.scopeKey!==clipboardScopeKey||!hasFrameClipboard||saveBusy||uploadBusy} onClick={()=>{setContextMenu(null);void pasteBox();}}>Paste box</button><button role="menuitem" type="button" disabled={!onSave||saveBusy||uploadBusy} onClick={()=>{if(saveBusy||uploadBusy)return;setContextMenu(null);onSave?.();}}>Save</button><button role="menuitem" type="button" onClick={()=>{openItems(contextMenu.x,contextMenu.y);}}>Add Item</button>{workspaceMode&&<button role="menuitem" type="button" onClick={startSpaceCut}>Remove space</button>}<button role="menuitem" type="button" onClick={()=>{setContextMenu(null);openNewPage();}}>New Page</button></div>}
    {footerTransfer?.phase==="confirm"&&<Dialog title="Move this item to the shared footer?" dismissDisabled={uploadBusy||saveBusy} onClose={()=>{if(!uploadBusy&&!saveBusy)setFooterTransfer(null);}} actions={<><button type="button" onClick={()=>setFooterTransfer(null)} disabled={uploadBusy||saveBusy}>Keep on this page</button><button type="button" disabled={uploadBusy||saveBusy} onClick={()=>{if(!footerTransferCurrent(footerTransfer)){setFooterTransfer(null);setAnnouncement("The page or view changed. Nothing was moved.");return;}setFooterTransfer({...footerTransfer,phase:"measure"});}}>Move to shared footer</button></>}><p>This item will appear in the footer on every page, in both layouts—even if its current page is hidden. It becomes sitewide when you explicitly publish Website structure &amp; design.</p><p>The active layout keeps its measured position. The other layout keeps its own existing placement or uses footer flow; review it separately. This is one draft edit that Undo can restore. Nothing is published automatically.</p></Dialog>}
    {priceColors&&<Dialog title="Edit all Price Colors" dismissDisabled={uploadBusy||saveBusy} onClose={closePriceColors} actions={<><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} disabled={uploadBusy||saveBusy} onClick={closePriceColors}>Cancel</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.primary}`} disabled={!priceColorsCurrent()||!/^#[0-9a-f]{6}$/i.test(priceColors.color)} onClick={commitPriceColors}>Apply all price colors</button></>}><p>Changes all displayed price amounts, including currency symbols and separators, for {priceColors.mobile?"the independent mobile layout":"the desktop/shared layout"}. Values stay unchanged. This is one draft edit you can Undo; nothing is published.</p><label>Price color <input type="color" aria-label="All price color" disabled={!priceColorsCurrent()} value={/^#[0-9a-f]{6}$/i.test(priceColors.color)?priceColors.color:"#315b50"} onChange={event=>setPriceColors({...priceColors,color:event.target.value})}/></label><Field label="Price color hex" readOnly={!priceColorsCurrent()} value={priceColors.color} onChange={color=>{if(priceColorsCurrent())setPriceColors({...priceColors,color});}}/>{!priceColorsCurrent()&&<p role="status">The draft or view changed. Close this dialog and reopen it before applying.</p>}</Dialog>}
    {pricesOpen&&<Dialog title="Prices & options" wide maximizable dismissDisabled={uploadBusy||saveBusy} onClose={()=>{if(!uploadBusy&&!saveBusy)setPricesOpen(false);}} actions={<button type="button" disabled={uploadBusy||saveBusy} onClick={()=>setPricesOpen(false)}>Done</button>}><OwnerPricesManager content={content} onEdit={onEdit} onRemove={onRemove} disabled={uploadBusy||saveBusy}/></Dialog>}
    {!browsing&&linkRequest&&linkRequest.contextKey===textContextKey&&selectedText&&<OwnerHyperlinkDialog key={linkRequest.requestId}
      href={inlineLinkAtSelection(linkRequest.value,linkRequest)?.href??""}
      targetId={textContextKey} revision={sourceContent} selectionText={inlinePlainText(linkRequest.value).slice(linkRequest.start,linkRequest.end)}
      disabled={uploadBusy||saveBusy} onClose={()=>setLinkRequest(null)} onApply={href=>{
        const label=inlinePlainText(linkRequest.value).slice(linkRequest.start,linkRequest.end);
        const value=href===null?removeInlineHyperlink(linkRequest.value,linkRequest):applyInlineHyperlink(linkRequest.value,linkRequest,label,href,"selection");
        if(value===null||!commitInlineText(linkRequest.value,value))return false;
        setLinkRequest(null);return true;
      }}/>}
    {!browsing&&destinationLink&&<OwnerHyperlinkDialog key={`${destinationLink.pageId}:${destinationLink.target}:${destinationLink.identity?.id??""}`} href={destinationLink.destination.href} targetId={`pdf:${textContextKey}`} revision={sourceContent} allowDocument={destinationLink.destination.source!=="social"} canRemove={destinationLink.destination.source!=="block"} removeLabel={destinationLink.destination.source==="template"||destinationLink.destination.defaultHref?"Restore original link":"Remove link"} disabled={uploadBusy||saveBusy} onApply={href=>commitDestinationLink(href)} onClose={()=>{if(!uploadBusy&&!saveBusy)closeDestinationLink();}}/>}
    {!browsing&&shoveNotice&&<p role="status" aria-live="polite">{shoveNotice}</p>}
    <p className={styles.srOnly} role="status" aria-live="polite">{announcement}</p>
    <div className={styles.canvasFooter}><span>Only you can see this draft.</span>{!browsing && <button type="button" {...panelOpener("sections")} onClick={event => openItems(event.clientX || 16,event.clientY || 100)}>Add Item to {page.title}</button>}</div>
  </section>;
}
