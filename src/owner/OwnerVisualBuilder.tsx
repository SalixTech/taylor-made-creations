"use client";

import { useCallback, useEffect, useLayoutEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type PointerEvent } from "react";
import { SiteContentFrame } from "@/components/SiteContent";
import { COMMISSION_STATUSES, newOwnerId, validatePageSlug, type OwnerContent, type OwnerPage, type PageBlock } from "./model";
import { Dialog, Field, ImagePicker, ImagePickerFramingContext, MoveButtons, OwnerSelect, Toggle } from "./OwnerFields";
import { OwnerBlocksEditor, createBlock } from "./OwnerBlocksEditor";
import { PremadePhotoEditor } from "./PremadePhotoEditor";
import { OwnerDesignPanel } from "./OwnerDesignPanel";
import { OwnerAppearancePanel, OwnerElementAppearance, CanvasPlacementEditingContext } from "./OwnerAppearancePanel";
import { OwnerHeaderEditor, OwnerPageNavigation } from "./OwnerHeaderEditor";
import { OwnerCanvasBoxTools, OwnerBoxFields } from "./OwnerCanvasBoxTools";
import { BOX_BLOCK_TYPES, boxStyleKeyForTarget, boxTargetLabel, supportsBoxTarget, findCanvasBoxTarget } from "./box-targets";
import { initializeMobileLayout, contentForLayout, editContentForLayout, reorderById } from "./builder-interactions";
import { OwnerPricesManager } from "./OwnerPricesManager";
import { OwnerTemplateEditor } from "./OwnerTemplateEditor";
import { DESIGN_SELECT_FIELDS, IMAGE_FIELDS, LINK_FIELDS, TEXT_FIELDS } from "./site-design";
import ui from "./OwnerPortal.module.css";
import styles from "./OwnerVisualBuilder.module.css";
import buttons from "./OwnerButton.module.css";
import { OwnerLinkedTextField } from "./OwnerLinkedTextField";
import {OwnerCanvasTextEditor} from "./OwnerCanvasTextEditor";
import {OwnerTextFormattingBar} from "./OwnerTextFormattingBar";
import {getInlineTextId,getInlineTextRuns,applyInlineTextStyle,resetInlineTextStyle,type InlineTextStyle} from "./rich-text";
import {canvasTextField,changeCanvasText} from "./canvas-text-adapter";
import {inlinePlainText,type InlineSelection} from "./inline-text-editing";
import {readComputedPriceAppearance,readComputedTextAppearance,type ComputedTextAppearance} from "./editable-text-dom";
import { OwnerCanvasImageTools } from "./OwnerCanvasImageTools";
import type { ElementAppearance } from "./appearance";
import { getCanvasNodes, resolveCanvasLayout, canAssignCanvasParent, assignCanvasParent, updateCanvasPlacement, stepCanvasNode, removeCanvasNode, renameCanvasNode, type CanvasPlacement } from "./canvas-layout";
import { canvasSpacePlacementFromDrag, captureCanvasSpaceParent } from "./canvas-space";
import type { Affine } from "./box-geometry";
import { captureCanvasFrame, placeCapturedCanvasFrame, type CapturedCanvasFrame } from "./canvas-placement-geometry";
import { transferPageBlockToFooter } from "./shared-footer";
import {captureFrameClipboard,pasteFrameClipboard,type FrameClipboardSessionRef} from "./frame-clipboard";
import { useMovablePanel } from "./use-movable-panel";

type Props = {
  workspaceMode?:boolean;
  frameClipboard?:FrameClipboardSessionRef;
  clipboardScopeKey?:string;
  draftNameControl?:ReactNode;
  content: OwnerContent;
  page: OwnerPage;
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
const blockLabels: Record<PageBlock["type"], string> = { text: "Text", image: "Photo", link: "Button", heading: "Heading", list: "List", divider: "Divider", spacer: "Space", faq: "Questions & answers", feature: "Photo + text", "canvas-space": "Add Canvas Space", section: "Section container", "commission-status":"Commission status" };
const selectionLabels: Record<string, string> = { site: "Header & footer", design: "Website design", "page-content": "Page content", "home-copy": "Welcome text", "home-image": "Main photo", status: "Commission availability", contact: "Contact details", page: "Page settings", sections: "Add Item", shop: "Premade shop", prices: "Prices & options" };
function move<T extends { id: string }>(items: T[], id: string, direction: -1 | 1) { const from = items.findIndex(item => item.id === id); const to = from + direction; if (from >= 0 && to >= 0 && to < items.length) [items[from], items[to]] = [items[to], items[from]]; }

/** The public renderer IS the canvas. Only the selected piece gets editing controls. */
export function OwnerVisualBuilder({ frameClipboard:sharedFrameClipboard,clipboardScopeKey,workspaceMode=false, draftNameControl, content:sourceContent, page:sourcePage, onEdit:onContentEdit, onPageChange, onManagePages, onAddPage, onEditCommissionForm, onRemove, liveShopVisibility, liveShopKnown = true, liveShopReadError, onRetryLiveShop, canUpdateLiveShop, onUpdateLiveShop, uploadBusy = false, browsing, onBrowsingChange, onSave, saveBusy = false, draftSaveStatus, onPopOut, onRequestDiscard, onUndo, onRedo, canUndo = false, canRedo = false }: Props) {
  const panelId = useId();
  const builderRef=useRef<HTMLElement>(null),toolbarRef=useRef<HTMLDivElement>(null);
  const [computedText,setComputedText]=useState<{key:string;appearance:ComputedTextAppearance|null}|null>(null);
  const [parentChoice,setParentChoice]=useState<{id:string;value:string}|null>(null);
  useLayoutEffect(()=>{const root=builderRef.current,bar=toolbarRef.current;if(!root||!bar)return;const measure=()=>root.style?.setProperty?.("--builder-toolbar-height",`${bar.getBoundingClientRect().height}px`);measure();const observer=typeof ResizeObserver==="undefined"?null:new ResizeObserver(measure);observer?.observe(bar);window.addEventListener("resize",measure);return()=>{observer?.disconnect();window.removeEventListener("resize",measure);};},[browsing]);
  const navigationTarget = useRef<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [inlineTarget,setInlineTarget]=useState<string|null>(null);
  const [inlineSelection,setInlineSelection]=useState<InlineSelection|null>(null);
  const inlineSelectionScope=useRef("");
  const linkRequestSequence=useRef(0);
  const [linkRequest,setLinkRequest]=useState<(InlineSelection & {requestId:number;contextKey:string})|null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedOccurrence, setSelectedOccurrence] = useState(0);
  const [selectedLayout, setSelectedLayout] = useState<{scope:"page"|"chrome";id:string}|null>(null);
  const [footerTransfer,setFooterTransfer]=useState<{source:OwnerContent;pageId:string;blockId:string;newId:string;mobile:boolean;capture:CapturedCanvasFrame;preview:OwnerContent;viewport:number[];phase:"confirm"|"measure"}|null>(null);
  const applyingFooter=useRef<typeof footerTransfer>(null);
  const [placementIntent,setPlacementIntent]=useState<{scope:"page"|"chrome";id:string;parentId:string|null;pageId:string;mobile:boolean;source:OwnerContent;capture:CapturedCanvasFrame;relative?:{id:string;after:boolean}}|null>(null);
  const [deleteIntent,setDeleteIntent]=useState<{scope:"page"|"chrome";id:string;parentId:string|null;pageId:string;mobile:boolean;source:OwnerContent;captures:Record<string,CapturedCanvasFrame>}|null>(null);
  const [drawingSpace,setDrawingSpace]=useState(false);
  const [contextMenu,setContextMenu]=useState<{x:number;y:number}|null>(null);
  const contextMenuRef=useRef<HTMLDivElement>(null);
  const [boxNameDraft,setBoxNameDraft]=useState<{id:string;original:string;value:string}|null>(null);
  const [spacePreview,setSpacePreview]=useState<{left:number;top:number;width:number;height:number}|null>(null);
  const spaceDrag=useRef<{pointer:number;start:{x:number;y:number};map:Affine;source:OwnerContent;pageId:string;mobile:boolean}|null>(null);
  const applyingDelete=useRef<typeof deleteIntent>(null);
  const applyingPlacement=useRef<typeof placementIntent>(null);
  const [contentsSelection,setContentsSelection]=useState<string|null>(null);
  const [initialBoxLocked, setInitialBoxLocked] = useState(true);
  const [canvasBoxes, setCanvasBoxes] = useState<{ target: string; occurrence: number; value: string; label: string }[]>([]);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [pricesOpen,setPricesOpen]=useState(false);
  const [announcement, setAnnouncement] = useState("");
  const localFrameClipboard=useRef<FrameClipboardSessionRef["current"]>(null),clipboardBusy=useRef(false),clipboardAbort=useRef<AbortController|null>(null);
  const frameClipboard=sharedFrameClipboard??localFrameClipboard;
  const clipboardScope=useRef(clipboardScopeKey);clipboardScope.current=clipboardScopeKey;
  if(frameClipboard.current&&frameClipboard.current.scopeKey!==clipboardScopeKey)frameClipboard.current=null;
  const [clipboardNotice,setClipboardNotice]=useState("");
  const [hasFrameClipboard,setHasFrameClipboard]=useState(()=>!!clipboardScopeKey&&frameClipboard.current?.scopeKey===clipboardScopeKey);
  const draggingNav = useRef<string | null>(null);
  const dragClickGuard = useRef(false);
  const [imageEditMode, setImageEditMode] = useState<"photo" | "box">("box");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
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
  const panelRef = useRef<HTMLElement>(null);
  const movable = useMovablePanel(panelRef, workspaceMode || !selected || !inspectorOpen, {memoryKey:"section-editor",defaultPosition:{x:55,y:90}});
  const lastTarget = useRef<HTMLElement | null>(null);
  const activePages = sourceContent.pages.filter(item => !item.trashedAt).sort((a, b) => a.order - b.order);
  const photo = content.gallery.find(item => selected === `gallery:${item.id}`);
  const premade = content.premades.find(item => selected === `premade:${item.id}`);
  const footerBlock=content.footerBlocks?.find(item=>selected===`block:${item.id}`);
  const footerPage=useMemo(()=>({...page,id:"shared-footer",blocks:content.footerBlocks??[]}),[page,content.footerBlocks]);
  const boxPage=useMemo(()=>({...page,blocks:[...page.blocks,...(content.footerBlocks??[])]}),[page,content.footerBlocks]);
  const block = page.blocks.find(item => selected === `block:${item.id}`)??footerBlock;
  const boxEditableBlock = block && BOX_BLOCK_TYPES.includes(block.type);
  const coreStyleKey = selected?.startsWith("core-text:") ? selected.slice(10) : null;
  const imageStyleKey = selected === "home-image" ? "home.image" : selected?.startsWith("template-image:") ? selected.slice(15) : null;
  const imageBoxEditable = imageStyleKey && imageStyleKey !== "site.logo";
  const boxStyleKey = boxStyleKeyForTarget(selected);
  const boxAppearance = block?.appearance ?? (selected === "page-title" ? page.titleAppearance ?? content.contentOverrides?.styles?.[`${page.builtinKey}.title`] : boxStyleKey ? content.contentOverrides?.styles?.[boxStyleKey] : undefined);
  const selectedLayoutScope=selectedLayout?.scope==="chrome"?"chrome":sourcePage;
  const selectedPlacement=selectedLayout?resolveCanvasLayout(sourceContent,selectedLayoutScope,useMobile)[selectedLayout.id]?.placement:undefined;
  const selectedLayoutMap=resolveCanvasLayout(sourceContent,selectedLayoutScope,useMobile);
  const selectedSiblings=selectedLayout?Object.entries(selectedLayoutMap).filter(([,entry])=>entry.parentId===selectedLayoutMap[selectedLayout.id]?.parentId).sort((a,b)=>a[1].order-b[1].order).map(([id])=>id):[];
  const selectedBoxName=selectedLayout?(selectedLayoutMap[selectedLayout.id]?.label??getCanvasNodes(sourceContent,selectedLayoutScope).find(node=>node.id===selectedLayout.id)?.label):undefined;
  const boxName=selectedLayout&&boxNameDraft?.id===selectedLayout.id&&boxNameDraft.original===selectedBoxName?boxNameDraft.value:selectedBoxName??"";
  const layoutOrder=selectedLayout&&getCanvasNodes(sourceContent,selectedLayoutScope).find(node=>node.id===selectedLayout.id)?.movable?{index:selectedSiblings.indexOf(selectedLayout.id),count:selectedSiblings.length,onMove:(direction:-1|1)=>{const current=deleteContext.current;if(!deleteMounted.current||current.source!==sourceContent||current.pageId!==sourcePage.id||current.mobile!==useMobile||current.selection?.id!==selectedLayout.id||current.selection?.scope!==selectedLayout.scope||current.uploadBusy||current.saveBusy||current.browsing)return;onContentEdit(draft=>{const scope=selectedLayout.scope==="chrome"?"chrome":draft.pages.find(item=>item.id===sourcePage.id);if(scope)stepCanvasNode(draft,scope,selectedLayout.id,direction,useMobile);});}}:undefined;
  function changePlacement(placement:CanvasPlacement){
    if(uploadBusy||saveBusy||browsing||!selectedLayout)return;
    onContentEdit(draft=>{const scope=selectedLayout.scope==="chrome"?"chrome":draft.pages.find(item=>item.id===sourcePage.id);if(scope&&JSON.stringify(resolveCanvasLayout(draft,scope,useMobile)[selectedLayout.id])===JSON.stringify(selectedLayoutMap[selectedLayout.id]))updateCanvasPlacement(draft,scope,selectedLayout.id,useMobile,placement);});
  }
  function resetPlacement(){if(selectedPlacement)changePlacement({...selectedPlacement,matrix:{a:1,b:0,c:0,d:1,e:0,f:0},contentOffset:{xPx:0,yPx:0}});}
  const placementHandlers=useRef({changePlacement,resetPlacement});useLayoutEffect(()=>{placementHandlers.current={changePlacement,resetPlacement};});
  const placementProps=useMemo(()=>selectedPlacement&&selectedLayout?{placement:selectedPlacement,resolvePlacementDestination:(canvas:HTMLDivElement)=>layoutDestination(selectedLayout.scope,resolveCanvasLayout(sourceContent,selectedLayout.scope==="chrome"?"chrome":sourcePage,useMobile)[selectedLayout.id]?.parentId??null,canvas),onPlacementChange:(next:CanvasPlacement)=>placementHandlers.current.changePlacement(next),onResetPlacement:()=>placementHandlers.current.resetPlacement()}:{},[selectedPlacement,selectedLayout,sourceContent,sourcePage,useMobile]);
  function changeBoxAppearance(value: ElementAppearance) {
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
  const selectedText=canvasTextField(sourceContent,sourcePage,selected);
  const textContextKey=`${sourcePage.id}:${selected}:${selectedLayout?.scope??"page"}:${selectedLayout?.id??selectedOccurrence}:${useMobile}`;
  function requestInlineHyperlink(selection:InlineSelection){const current=deleteContext.current;if(!deleteMounted.current||current.source!==sourceContent||current.pageId!==sourcePage.id||current.mobile!==useMobile||current.selection?.id!==selectedLayout?.id||current.selection?.scope!==selectedLayout?.scope||current.target!==selected||current.uploadBusy||current.saveBusy||current.browsing)return;inlineSelectionScope.current=textContextKey;setInlineSelection(selection);setLinkRequest({...selection,requestId:++linkRequestSequence.current,contextKey:textContextKey});setInspectorOpen(true);}
  function commitInlineText(expected:string,value:string){const current=deleteContext.current;if(!deleteMounted.current||!selected||current.source!==sourceContent||current.pageId!==sourcePage.id||current.mobile!==useMobile||current.selection?.id!==selectedLayout?.id||current.selection?.scope!==selectedLayout?.scope||current.target!==selected||current.uploadBusy||current.saveBusy||current.browsing)return false;let changed=false;onContentEdit(draft=>{changed=changeCanvasText(draft,sourcePage.id,selected,expected,value);});return changed;}
  const inlineTextId=selected?getInlineTextId(sourceContent,sourcePage.id,selected):null;
  const inlineRuns=useMemo(()=>inlineTextId?getInlineTextRuns(sourceContent,inlineTextId,useMobile):[],[sourceContent,inlineTextId,useMobile]);
  const formattingSelection=inlineSelectionScope.current===textContextKey&&inlineSelection&&selectedText&&inlineSelection.value===selectedText.value&&inlineSelection.end>inlineSelection.start?inlineSelection:null;
  const selectedRichRuns=(()=>{let offset=0;return inlineRuns.filter(run=>{const start=offset;offset+=run.text.length;return formattingSelection&&start<formattingSelection.end&&offset>formattingSelection.start;});})();
  const formattingKey=`${textContextKey}:${formattingSelection?.start}:${formattingSelection?.end}:${selectedText?.value}`;
  useLayoutEffect(()=>{
    const canvas=canvasRef.current,frame=canvas&&selected?findCanvasBoxTarget(canvas,selected,selectedOccurrence,selectedLayout??undefined):null;
    if(!frame||!selectedText||browsing)return;
    const nested=frame.querySelectorAll?Array.from(frame.querySelectorAll<HTMLElement>('[data-owner-edit]')).filter(node=>node.dataset.ownerEdit===selected):[];
    const node=nested.at(-1)??frame;let alive=true;
    const measure=()=>{if(!alive)return;const appearance=selectedText.inputKind==="money"?readComputedPriceAppearance(node.querySelector<HTMLElement>("[data-owner-inline-value]")??node,selectedText.value,formattingSelection):readComputedTextAppearance(node,selectedText.links?inlinePlainText(selectedText.value):selectedText.value,formattingSelection);setComputedText(previous=>previous?.key===formattingKey&&JSON.stringify(previous.appearance)===JSON.stringify(appearance)?previous:{key:formattingKey,appearance});};
    measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);observer?.observe(node);window.addEventListener('resize',measure);document.fonts?.addEventListener?.('loadingdone',measure);
    return()=>{alive=false;observer?.disconnect();window.removeEventListener('resize',measure);document.fonts?.removeEventListener?.('loadingdone',measure);};
  },[formattingKey,sourceContent,selected,selectedOccurrence,selectedLayout,selectedText,formattingSelection,browsing]);
  const textMarks={bold:!!selectedRichRuns.length&&selectedRichRuns.every(run=>run.style?.bold===true),italic:!!selectedRichRuns.length&&selectedRichRuns.every(run=>run.style?.italic===true),underline:!!selectedRichRuns.length&&selectedRichRuns.every(run=>run.style?.underline===true)};
  function formatSelectedText(style:InlineTextStyle|null){const current=deleteContext.current,range=formattingSelection;if(!range||!selected||!deleteMounted.current||current.source!==sourceContent||current.pageId!==sourcePage.id||current.mobile!==useMobile||current.target!==selected||current.selection?.id!==selectedLayout?.id||current.selection?.scope!==selectedLayout?.scope||current.uploadBusy||current.saveBusy||current.browsing)return;let changed=false;onContentEdit(draft=>{changed=style?applyInlineTextStyle(draft,sourcePage.id,selected,range,style,useMobile):resetInlineTextStyle(draft,sourcePage.id,selected,range,useMobile);});if(!changed)setAnnouncement("Select the current text again before changing its formatting.");}
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
    canvas.querySelectorAll<HTMLElement>("[data-owner-nav-page]").forEach(node => { node.draggable = !browsing && !uploadBusy; });
  }, [selected, selectedOccurrence, browsing, content, page, uploadBusy, sourceContent, sourcePage, useMobile]);
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

  function closeCanvasMenu() { canvasRef.current?.querySelectorAll<HTMLDetailsElement>(".nav-more[open]").forEach(menu => { menu.open = false; }); }
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
    closeCanvasMenu(); spaceDrag.current=null;setDrawingSpace(false);setSpacePreview(null); setSelected(null); setNavigationOpen(false); navigationTarget.current = null; lastTarget.current = null;
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
    closeCanvasMenu();
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
    if (toggle && inspectorOpen && selected === target && selectedOccurrence === nextOccurrence) { closePanel(); return; }
    if (selected !== target || selectedOccurrence !== nextOccurrence) { setInitialBoxLocked(true); setContentsSelection(null); }
    const liveElement=element ?? (canvasRef.current?findCanvasBoxTarget(canvasRef.current,target,nextOccurrence):null);
    const frame=liveElement?.closest<HTMLElement>("[data-owner-layout-id]");
    setSelectedLayout(frame?.dataset.ownerLayoutId?{scope:frame.dataset.ownerLayoutScope==="chrome"?"chrome":"page",id:frame.dataset.ownerLayoutId}:createdIdentity??null);
    setSelectedOccurrence(nextOccurrence); setSelected(target); setInspectorOpen(true);setInlineTarget(null);setInlineSelection(null);
  }
  function capture(event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) {
    if (browsing || !(event.target instanceof HTMLElement)) return;
    // Canvas controls own Escape and arrow keys for their active gesture.
    // Do not close the inspector first and swallow their cancellation event.
    if (event.target.closest("[data-owner-canvas-controls]") && !("key" in event && event.key==="Delete")) return;
    if ("key" in event && event.key === "Escape" && (draggingNav.current)) { event.preventDefault(); event.stopPropagation(); endBlockDrag(); return; }
    if ("key" in event && event.key === "Escape" && selected) { event.preventDefault(); event.stopPropagation(); if (inspectorOpen) closePanel(); else setSelected(null); return; }
    if (!("key" in event) && dragClickGuard.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); return; }
    // More is an actual disclosure even while editing; do not select the surrounding header.
    if (event.target.closest(".nav-more > summary")) return;
    if ("key" in event && event.nativeEvent?.isComposing) return;
    if ("key" in event && event.key === "Delete" && !event.target.closest("input,textarea,select,[contenteditable],[role=textbox]")) { if(selectedLayout){event.preventDefault();event.stopPropagation();requestDelete();}return; }
    if ("key" in event && event.key !== "Enter" && event.key !== " ") return;
    const nav = event.target.closest<HTMLElement>("[data-owner-nav-page]");
    if (nav && canvasRef.current?.contains(nav)) { event.preventDefault(); event.stopPropagation(); choose(`nav:${nav.dataset.ownerNavPage}`, nav, true); return; }
    const target = event.target.closest<HTMLElement>("[data-owner-edit]");
    if (!target || !canvasRef.current?.contains(target)) { if (!("key" in event)) { setSelected(null); setSelectedLayout(null); setInspectorOpen(false); } return; }
    event.preventDefault(); event.stopPropagation();
    const text=canvasTextField(sourceContent,sourcePage,target.dataset.ownerEdit!);
    // Legacy section panels retain click/keyboard toggle behavior. A text leaf
    // instead enters native editing; the dedicated workspace inspector stays put.
    choose(target.dataset.ownerEdit!, target, !workspaceMode&&!text);
    if(!("key" in event)||event.key==="Enter"){setInlineTarget(text?target.dataset.ownerEdit!:null);setInlineSelection(null);}
  }
  function canvasNav(event: DragEvent<HTMLDivElement>) { const node = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-owner-nav-page]") : null; return node && canvasRef.current?.contains(node) ? node : null; }
  function beginBlockDrag(event: DragEvent<HTMLDivElement>) {
    const toolbar=event.target instanceof HTMLElement?event.target.closest<HTMLElement>("[data-owner-reparent-id]"):null;
    if(event.target instanceof HTMLElement&&event.target.closest("[data-owner-canvas-controls]")&&!toolbar){event.preventDefault();return;}if(browsing||uploadBusy||saveBusy)return;
    const nav=canvasNav(event);if(nav?.dataset.ownerNavPage&&activePages.some(item=>item.id===nav.dataset.ownerNavPage)){draggingNav.current=nav.dataset.ownerNavPage;event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",nav.dataset.ownerNavPage);event.dataTransfer.setDragImage?.(nav,16,16);nav.dataset.ownerDragging="true";setSelected(null);return;}
    event.preventDefault();
  }

  function overBlock(event:DragEvent<HTMLDivElement>){if(browsing||uploadBusy||saveBusy||!draggingNav.current)return;const node=canvasNav(event);if(!node)return;event.preventDefault();event.dataTransfer.dropEffect="move";canvasRef.current?.querySelectorAll<HTMLElement>("[data-owner-drop]").forEach(item=>delete item.dataset.ownerDrop);node.dataset.ownerDrop="true";}
  function endBlockDrag(){if(draggingNav.current)dragClickGuard.current=true;canvasRef.current?.querySelectorAll<HTMLElement>("[data-owner-dragging],[data-owner-drop]").forEach(item=>{delete item.dataset.ownerDragging;delete item.dataset.ownerDrop;});draggingNav.current=null;}
  function dropBlock(event:DragEvent<HTMLDivElement>){
    if(!browsing&&!uploadBusy&&!saveBusy&&draggingNav.current){const nav=canvasNav(event),sourceId=draggingNav.current;if(nav?.dataset.ownerNavPage){event.preventDefault();event.stopPropagation();const targetId=nav.dataset.ownerNavPage,rect=nav.getBoundingClientRect(),after=event.clientX>rect.left+rect.width/2;onEdit(draft=>{const active=draft.pages.filter(item=>!item.trashedAt).sort((a,b)=>a.order-b.order),slots=active.map(item=>item.order);if(reorderById(active,sourceId,targetId,after))active.forEach((item,index)=>{item.order=slots[index];});});setAnnouncement("Navigation order updated in your draft.");}endBlockDrag();return;}
    endBlockDrag();
  }
  function reorderLayout(draft:OwnerContent,scope:OwnerPage|"chrome",id:string,targetId:string,after:boolean,mobile:boolean){
    const graph=resolveCanvasLayout(draft,scope,mobile);if(id===targetId||!graph[id]||graph[id].parentId!==graph[targetId]?.parentId)return;
    const siblings=Object.entries(graph).filter(([,entry])=>entry.parentId===graph[id].parentId).sort((a,b)=>a[1].order-b[1].order).map(([key])=>key);
    const desired=siblings.filter(key=>key!==id),at=desired.indexOf(targetId);if(at<0)return;desired.splice(at+(after?1:0),0,id);
    let index=siblings.indexOf(id);const to=desired.indexOf(id);while(index!==to){const direction=index<to?1:-1;if(!stepCanvasNode(draft,scope,id,direction,mobile))break;index+=direction;}
  }
  function copyBox(){
    const current=deleteContext.current;if(!clipboardScopeKey||clipboardScope.current!==clipboardScopeKey||!sharedFrameClipboard||!deleteMounted.current||current.source!==sourceContent||current.pageId!==sourcePage.id||current.selection?.id!==selectedLayout?.id||current.selection?.scope!==selectedLayout?.scope||current.browsing||current.saveBusy||current.uploadBusy||!selectedLayout||selectedLayout.scope!=="page"){setClipboardNotice("Select a page box to copy. Header and footer units are not copied here.");return;}
    try{clipboardAbort.current?.abort();frameClipboard.current={scopeKey:clipboardScopeKey,value:captureFrameClipboard(sourceContent,sourcePage.id,selectedLayout.id)};setHasFrameClipboard(true);setClipboardNotice("Box copied for this builder session. Paste box on another page creates independent contents at the new page origin; nothing is published.");}catch(error){setClipboardNotice(error instanceof Error?error.message:"This box cannot be copied safely.");}
  }
  async function pasteBox(){
    const session=frameClipboard.current,copied=session?.value,current=deleteContext.current;if(!clipboardScopeKey||clipboardScope.current!==clipboardScopeKey||!sharedFrameClipboard||session?.scopeKey!==clipboardScopeKey||!copied||clipboardBusy.current||!deleteMounted.current||current.source!==sourceContent||current.pageId!==sourcePage.id||current.browsing||current.saveBusy||current.uploadBusy)return;
    clipboardBusy.current=true;const abort=new AbortController();clipboardAbort.current=abort;setClipboardNotice("Checking this box’s assets before pasting…");
    try{const {verifyFrameClipboardAssets}=await import("./frame-clipboard-assets");abort.signal.throwIfAborted();const assetSession=await verifyFrameClipboardAssets(copied.assets,abort.signal),latest=deleteContext.current;if(!deleteMounted.current||clipboardScope.current!==clipboardScopeKey||frameClipboard.current!==session||frameClipboard.current?.scopeKey!==clipboardScopeKey||latest.source!==sourceContent||latest.pageId!==sourcePage.id||latest.mobile!==useMobile||latest.browsing||latest.saveBusy||latest.uploadBusy)throw Error("The page or draft changed while checking the box. Nothing was pasted.");
      assetSession.assertCurrent();const result=pasteFrameClipboard(sourceContent,sourcePage.id,copied,{newId:newOwnerId,verifiedAssets:new Set(copied.assets)});let changed=false;
      onContentEdit(draft=>{assetSession.assertCurrent();if(JSON.stringify(draft)!==JSON.stringify(sourceContent))return;Object.assign(draft,result.content);changed=true;});
      if(!changed)throw Error("The current draft changed. Copy the box again before pasting.");frameClipboard.current={scopeKey:clipboardScopeKey,value:result.clipboard};setSelected(result.rootId);setSelectedLayout({scope:"page",id:result.rootId});setInlineTarget(null);setInspectorOpen(true);setClipboardNotice("Independent box pasted in your draft at this page’s origin. Both layouts retain their own styles and contents. Undo removes this copy.");
    }catch(error){if(deleteMounted.current)setClipboardNotice(error instanceof Error?error.message:"This box could not be pasted safely.");}finally{clipboardBusy.current=false;if(clipboardAbort.current===abort)clipboardAbort.current=null;}
  }
  function layoutFrame(scope:"page"|"chrome",id:string){return Array.from(canvasRef.current?.querySelectorAll<HTMLElement>("[data-owner-layout-id]")??[]).find(node=>node.dataset.ownerLayoutId===id&&node.dataset.ownerLayoutScope===scope)??null;}
  function layoutDestination(scope:"page"|"chrome",parentId:string|null,canvas=canvasRef.current){return Array.from(canvas?.querySelectorAll<HTMLElement>("[data-owner-placement-content]")??[]).find(node=>node.dataset.ownerPlacementContent===(parentId??"__root")&&node.dataset.ownerLayoutScope===scope)??null;}
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
  useEffect(()=>{if(!contextMenu)return;contextMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();const outside=(event:Event)=>{if(!contextMenuRef.current?.contains(event.target as Node))setContextMenu(null);};const close=()=>setContextMenu(null);document.addEventListener("pointerdown",outside);window.addEventListener("blur",close);return()=>{document.removeEventListener("pointerdown",outside);window.removeEventListener("blur",close);};},[contextMenu]);
  function moveLayer(scope:"page"|"chrome",id:string,parentId:string|null,relative?:{id:string;after:boolean}){
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

  function requestDelete(withContents=false){
    if(uploadBusy||saveBusy||browsing||!selectedLayout)return;
    const selection={...selectedLayout},source=sourceContent,modelScope=selection.scope==="chrome"?"chrome":sourcePage;
    const node=getCanvasNodes(source,modelScope).find(node=>node.id===selection.id);if(!node?.movable)return;
    onRemove(withContents?"Remove this box and its contents from the canvas?":"Remove this box from the canvas?",withContents?"This removes this box and all of its nested contents from this layout. Original media files are retained. Nothing is saved or published automatically. Undo restores the draft.":"Only this box is removed from this layout. Its contents stay where they are on the canvas. Original media files are retained. Nothing is saved or published automatically.",()=>{
      const current=deleteContext.current;
      if(!deleteMounted.current||current.source!==source||current.pageId!==sourcePage.id||current.mobile!==useMobile||current.browsing||current.uploadBusy||current.saveBusy||current.selection?.id!==selection.id||current.selection?.scope!==selection.scope)return;
      if(withContents){onContentEdit(draft=>{if(JSON.stringify(draft)!==JSON.stringify(source))return;const scope=selection.scope==="chrome"?"chrome":draft.pages.find(p=>p.id===sourcePage.id);if(scope)removeCanvasNode(draft,scope,selection.id,useMobile,true);});setSelected(null);setSelectedLayout(null);setInspectorOpen(false);return;}
      const map=resolveCanvasLayout(source,modelScope,useMobile),captures:Record<string,CapturedCanvasFrame>={};
      for(const [id,entry]of Object.entries(map)){if(entry.removed||entry.parentId!==selection.id)continue;const descriptor=getCanvasNodes(source,modelScope).find(node=>node.id===id),frame=layoutFrame(selection.scope,id);
        if(!descriptor?.movable||!frame){setAnnouncement("These contents must stay together as a functional unit. Move them out first, or explicitly remove the box and its contents. Nothing changed.");return;}
        const key=boxStyleKeyForTarget(descriptor.styleTarget),appearance=descriptor.styleTarget.startsWith("block:")?page.blocks.find(b=>`block:${b.id}`===descriptor.styleTarget)?.appearance:descriptor.styleTarget==="page-title"?page.titleAppearance:key?content.contentOverrides?.styles?.[key]:undefined;
        const captured=captureCanvasFrame(frame,entry.placement?undefined:appearance?.box);if(!captured){setAnnouncement("The contents cannot be measured safely right now. Nothing was removed.");return;}if(entry.placement?.contentOffset)captured.contentOffset={...entry.placement.contentOffset};if(entry.placement?.aspectLocked!==undefined)captured.aspectLocked=entry.placement.aspectLocked;captures[id]=captured;
      }
      setDeleteIntent({scope:selection.scope,id:selection.id,parentId:map[selection.id].parentId,pageId:sourcePage.id,mobile:useMobile,source,captures});
    });
  }
  /* eslint-disable react-hooks/set-state-in-effect -- Finite child rebasing is committed atomically after measuring a temporary destination. */
  useLayoutEffect(()=>{const intent=deleteIntent;if(!intent||applyingDelete.current===intent)return;applyingDelete.current=intent;
    if(uploadBusy||saveBusy||browsing||intent.source!==sourceContent||intent.pageId!==sourcePage.id||intent.mobile!==useMobile){setDeleteIntent(null);setAnnouncement("The layout changed before removal. Nothing was removed.");return;}
    const destination=layoutDestination(intent.scope,intent.parentId),placements:Record<string,CanvasPlacement>={};
    for(const [id,captured]of Object.entries(intent.captures)){const placement=destination?placeCapturedCanvasFrame(captured,destination):null;if(!placement){setDeleteIntent(null);setAnnouncement("The contents cannot keep their positions safely. Nothing was removed.");return;}placements[id]=placement;}
    let changed=false;onContentEdit(draft=>{if(JSON.stringify(draft)!==JSON.stringify(intent.source))return;const scope=intent.scope==="chrome"?"chrome":draft.pages.find(p=>p.id===intent.pageId);if(scope)changed=removeCanvasNode(draft,scope,intent.id,intent.mobile,false,placements);});setDeleteIntent(null);
    if(changed){setSelected(null);setSelectedLayout(null);setInspectorOpen(false);setAnnouncement("Box removed; its contents kept their positions. Undo restores it.");}else setAnnouncement("Removal could not be applied safely. Nothing changed.");
  },[deleteIntent,sourceContent,sourcePage.id,useMobile,uploadBusy,saveBusy,browsing,onContentEdit]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(()=>{const cancel=()=>{spaceDrag.current=null;setSpacePreview(null);setDrawingSpace(false);};const hidden=()=>{if(document.hidden)cancel();};const escape=(event:globalThis.KeyboardEvent)=>{if(event.key==="Escape"&&drawingSpace){event.preventDefault();event.stopImmediatePropagation();cancel();}};window.addEventListener("blur",cancel);document.addEventListener("visibilitychange",hidden);window.addEventListener("keydown",escape,true);return()=>{spaceDrag.current=null;window.removeEventListener("blur",cancel);document.removeEventListener("visibilitychange",hidden);window.removeEventListener("keydown",escape,true);};},[drawingSpace]);
  /* eslint-disable react-hooks/set-state-in-effect -- Switching layout/session invalidates a pending pointer transaction. */
  useEffect(()=>{spaceDrag.current=null;setSpacePreview(null);setDrawingSpace(false);},[browsing,sourcePage.id,useMobile]);
  /* eslint-enable react-hooks/set-state-in-effect */
  function finishSpace(event:PointerEvent<HTMLDivElement>,cancel=false){
    const drag=spaceDrag.current;if(!drag||drag.pointer!==event.pointerId)return;spaceDrag.current=null;setSpacePreview(null);
    if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(cancel){setDrawingSpace(false);return;}
    const parent=layoutDestination("page",null),map=parent?captureCanvasSpaceParent(parent):null;
    const placement=map?canvasSpacePlacementFromDrag(drag.start,{x:event.clientX,y:event.clientY},map):null;
    if(!placement||JSON.stringify(map)!==JSON.stringify(drag.map)||drag.source!==sourceContent||drag.pageId!==sourcePage.id||drag.mobile!==useMobile||browsing||document.hidden||uploadBusy||saveBusy){setDrawingSpace(false);setAnnouncement("Canvas changed or the drawn space was empty. Nothing was added.");return;}
    const id=newOwnerId("block");let changed=false;
    onContentEdit(draft=>{if(JSON.stringify(draft)!==JSON.stringify(drag.source))return;const page=draft.pages.find(p=>p.id===drag.pageId);if(!page||page.blocks.length>=100)return;page.blocks.push({id,type:"canvas-space",widthPx:placement.widthPx,heightPx:placement.heightPx});changed=assignCanvasParent(draft,page,`block:${id}`,null,drag.mobile,placement);if(!changed)page.blocks=page.blocks.filter(b=>b.id!==id);});
    setDrawingSpace(false);if(changed){setSelected(`block:${id}`);setSelectedLayout({scope:"page",id:`block:${id}`});setSelectedOccurrence(0);setInspectorOpen(true);setAnnouncement("Canvas Space added. Resize any edge or corner; Undo removes it.");}
  }
  function selectLayer(scope:"page"|"chrome",id:string){
    if(uploadBusy||browsing)return;
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
  if(selected==="prices")controls=<><p className={ui.help}>Click price text or amounts directly on the canvas. Open Prices &amp; options for structured groups and options.</p><button type="button" disabled={uploadBusy||saveBusy} onClick={()=>setPricesOpen(true)}>Edit prices &amp; options here</button></>;
  if(selected?.startsWith("canvas:")&&boxStyleKey)controls=<><OwnerElementAppearance content={content} styleKey={boxStyleKey} onEdit={onEdit}/><button type="button" className={ui.secondary} onClick={()=>{const node=canvasRef.current&&findCanvasBoxTarget(canvasRef.current,selected!,selectedOccurrence),editor=node?.dataset.ownerContentEditor??node?.querySelector<HTMLElement>("[data-owner-content-editor]")?.dataset.ownerContentEditor;if(editor)choose(editor);else setAnnouncement("Use the nested text or content box picker to edit this content.");}}>Edit content</button>{boxStyleKey.includes("price")&&<button type="button" className={ui.secondary} onClick={()=>{if(!uploadBusy&&!saveBusy)setPricesOpen(true);}}>Edit prices &amp; options here</button>}</>;
  if (selected === "design") controls = <OwnerDesignPanel content={content} onEdit={onEdit} onReset={() => onRemove(`Restore the original ${useMobile?"mobile":"desktop"} design?`, `This resets colors, fonts, spacing, photo framing and layout for the ${useMobile?"independent mobile":"desktop/shared"} layout in your draft. The other independent layout is preserved. Your writing, photos, pages and prices stay unchanged. Nothing is published.`, () => onEdit(draft => { delete draft.design; if (draft.contentOverrides) delete draft.contentOverrides.styles; for (const page of draft.pages) { delete page.titleAppearance; for (const block of page.blocks) delete block.appearance; } }))} />;
  if (selected?.startsWith("template-") && templateField) controls = <OwnerTemplateEditor key={selected} content={content} onEdit={onEdit} target={selected} />;
  if (coreStyleKey) controls = <>{coreStyleKey.startsWith("home.") ? <OwnerLinkedTextField contextKey={`${textContextKey}:${coreStyleKey}`} label="Text" multiline value={content.home[coreStyleKey.slice(5) as "title" | "eyebrow" | "description" | "caption"]} onChange={value => onEdit(draft => { draft.home[coreStyleKey.slice(5) as "title" | "eyebrow" | "description" | "caption"] = value; })} /> : coreStyleKey === "prices.intro" ? <OwnerLinkedTextField contextKey={`${textContextKey}:prices.intro`} label="Prices introduction" multiline value={content.prices.intro} onChange={value => onEdit(draft => { draft.prices.intro = value; })} /> : null}<OwnerElementAppearance content={content} styleKey={coreStyleKey} onEdit={onEdit} /></>;
  if (selected === "page-title") controls = <><Field label="Page title" value={page.title} onChange={value => editPage(target => { target.title = value; })} />{pageTitleAppearance}</>;
  if (selected === "site") controls = <>
    <Field label="Business name" value={content.site.name} onChange={value => onEdit(draft => { draft.site.name = value; })} hint="This appears in your website header and footer." />
    <OwnerElementAppearance content={content} styleKey="site.brand" onEdit={onEdit} />
    <OwnerSelect label="Header tagline visibility" value={content.design?.headerTagline ?? "hidden"} options={DESIGN_SELECT_FIELDS.find(field => field.key === "headerTagline")!.options} onChange={value => onEdit(draft => { draft.design = { ...draft.design, headerTagline: value === "visible" ? "visible" : "hidden" }; })} />
    <OwnerTemplateEditor key="site-template" content={content} onEdit={onEdit} group="site" />
  </>;
  const homeCopyControls = <>
    <Field label="Main heading" value={content.home.title} onChange={value => onEdit(draft => { draft.home.title = value; })} />
    <OwnerElementAppearance content={content} styleKey="home.title" onEdit={onEdit} />
    <OwnerSelect label="Home introduction layout" value={content.design?.homeIntro ?? "title-only"} options={DESIGN_SELECT_FIELDS.find(field => field.key === "homeIntro")!.options} onChange={value => onEdit(draft => { draft.design = { ...draft.design, homeIntro: value === "full" ? "full" : "title-only" }; })} hint="The original layout shows just the title. Choose the full introduction to show your eyebrow, description and buttons." />
    <Field label="Welcome eyebrow" value={content.home.eyebrow} onChange={value => onEdit(draft => { draft.home.eyebrow = value; })} />
    <OwnerElementAppearance content={content} styleKey="home.eyebrow" onEdit={onEdit} />
    <OwnerLinkedTextField contextKey={`${textContextKey}:home.description`} label="Welcome description" multiline value={content.home.description} onChange={value => onEdit(draft => { draft.home.description = value; })} />
    <OwnerElementAppearance content={content} styleKey="home.description" onEdit={onEdit} />
  </>;
  if (selected === "home-copy") controls = homeCopyControls;
  if (selected === "page-content") controls = <>
    {page.builtinKey === "home" ? homeCopyControls : <Field label="Page title" value={page.title} onChange={value => editPage(target => { target.title = value; })} required />}
    {page.builtinKey !== "home" && pageTitleAppearance}
    {page.builtinKey === "prices" && <><OwnerLinkedTextField contextKey={`${textContextKey}:prices.intro`} label="Prices introduction" value={content.prices.intro} multiline onChange={value => onEdit(draft => { draft.prices.intro = value; })} /><OwnerElementAppearance content={content} styleKey="prices.intro" onEdit={onEdit} /></>}
    {page.builtinKey && <OwnerTemplateEditor key={`template-${page.id}`} content={content} onEdit={onEdit} group={page.builtinKey} />}
    <div className={styles.sectionDirectory}><h3>Sections on this page</h3>{page.blocks.length ? page.blocks.map((item, index) => <button key={item.id} type="button" onClick={() => choose(`block:${item.id}`,undefined,false,{scope:"page",id:`block:${item.id}`} )}><span>{index + 1}. {blockLabels[item.type]}</span></button>) : <p className={ui.help}>Add Item to include more words, photos, buttons or questions and answers.</p>}<button type="button" onClick={() => choose("sections")}>Add Item</button></div>
  </>;
  if (selected === "home-image") controls = <>
    <ImagePicker key="home-image" src={content.home.image.src} alt={content.home.image.alt} onSource={value => onEdit(draft => { draft.home.image.src = value; })} onAlt={value => onEdit(draft => { draft.home.image.alt = value; })} />
    <OwnerElementAppearance content={content} styleKey="home.image" onEdit={onEdit} />
    <OwnerLinkedTextField contextKey={`${textContextKey}:home.caption`} label="Caption beneath the main photo" value={content.home.caption} onChange={value => onEdit(draft => { draft.home.caption = value; })} />
    <OwnerElementAppearance content={content} styleKey="home.caption" onEdit={onEdit} />
    <OwnerTemplateEditor content={content} onEdit={onEdit} target="template-text:home.photoCredit" />
  </>;
  if (selected === "status") controls = <>
    <OwnerSelect label="Commission status" value={content.site.commissionStatus} options={COMMISSION_STATUSES.map(value => ({ value, label: value }))} onChange={value => onEdit(draft => { draft.site.commissionStatus = value as OwnerContent["site"]["commissionStatus"]; })} />
    <OwnerLinkedTextField contextKey={`${textContextKey}:site.statusNote`} label="A note for visitors" multiline value={content.site.statusNote} onChange={value => onEdit(draft => { draft.site.statusNote = value; })} />
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
      <OwnerLinkedTextField contextKey={`${textContextKey}:premade:${premade.id}:description`} label="Description" multiline value={premade.description} onChange={value => onEdit(draft => { const item = draft.premades.find(item => item.id === premade.id); if (item) item.description = value; })} />
      <PremadePhotoEditor key={premade.id} item={premade} onChange={patch => onEdit(draft => { const item = draft.premades.find(item => item.id === premade.id); if (item) Object.assign(item, patch); })} />
      <Toggle label="Show this listing" checked={premade.visible} onChange={value => onEdit(draft => { const item = draft.premades.find(item => item.id === premade.id); if (item) item.visible = value; })} hint="Hidden listings are only shown in this builder. The shop switch must also be on for visitors to see it." />
      <div className={styles.itemActions}><span>Listing {index + 1} of {content.premades.length}</span><MoveButtons label={premade.name} index={index} length={content.premades.length} onMove={direction => onEdit(draft => move(draft.premades, premade.id, direction))} /></div>
      <button type="button" className={ui.dangerLink} onClick={() => removeSelected(`Remove “${premade.name}”?`, "This removes the listing from your draft. Its photos are not deleted, and the live site stays unchanged until you publish.", () => onEdit(draft => { draft.premades = draft.premades.filter(item => item.id !== premade.id); }))}>Remove listing</button>
    </>;
  }
  if (block) controls = <OwnerBlocksEditor content={content} onEditContent={onEdit} layoutOrder={layoutOrder} mobileLayout={useMobile} fonts={content.fonts} page={footerBlock?footerPage:page} focusedBlockId={block.id} hideAddPalette hideReorder onEdit={footerBlock?change=>onEdit(draft=>{const target={...page,id:"shared-footer",blocks:draft.footerBlocks??[]};change(target);draft.footerBlocks=target.blocks;}):editPage} onRemove={() => requestDelete()} />;
  if (selected === "sections") controls = <><p className={ui.help}>Add an item to the page, then edit it directly on the canvas. New items are independent. Existing saved layouts stay unchanged; boxes move with their contents by default; frame-only movement is optional.</p><div className={styles.palette}>{(Object.entries(blockLabels) as [PageBlock["type"], string][]).filter(([type])=>type!=="commission-status").map(([type, label]) => <button type="button" key={type} draggable={false} disabled={uploadBusy || page.blocks.length >= 100} onClick={() => { if (uploadBusy || page.blocks.length >= 100) return; if(type==="canvas-space"){setSelected(null);setSelectedLayout(null);setInspectorOpen(false);setDrawingSpace(true);setAnnouncement("Drag in any direction to draw Canvas Space. Escape cancels.");return;} const next = createBlock(type); editPage(target => { target.blocks.push(next); }); choose(`block:${next.id}`,undefined,false,{scope:"page",id:`block:${next.id}`}); }}><span aria-hidden="true">＋</span>{label}</button>)}</div></>;


  if (imageBlock || imageBoxEditable) controls = <ImagePickerFramingContext.Provider value={<><div className={styles.modeSwitch} aria-label="Image editing target"><button type="button" aria-pressed={imageEditMode === "photo"} onClick={() => setImageEditMode("photo")}>Photo framing</button><button type="button" aria-pressed={imageEditMode === "box"} onClick={() => setImageEditMode("box")}>Whole content box</button></div>{imageEditMode === "box" && <p className={ui.help}>Move, resize or tilt the whole content box. Photo framing changes only the image size and crop.</p>}</>}>{controls}</ImagePickerFramingContext.Provider>;
  if(selectedText && !selected?.startsWith("template-link:") && block?.type!=="link"){const field=selectedText;controls=<>{field.inputKind==="money"?<><p>Edit the amount directly on the canvas. Prices are shared across your draft.</p><button type="button" onClick={()=>setInlineTarget(selected)}>Edit amount</button><button type="button" onClick={()=>setPricesOpen(true)}>Prices &amp; options</button></>:field.links?<OwnerLinkedTextField label="Text" multiline value={field.value} selectionHint={inlineSelectionScope.current===textContextKey?inlineSelection??undefined:undefined} contextKey={textContextKey} linkRequest={linkRequest?.contextKey===textContextKey?linkRequest:undefined} onChange={value=>commitInlineText(field.value,value)}/>:<><Field label="Text" multiline value={field.value} onChange={value=>commitInlineText(field.value,value)}/><small>This label uses its containing item. Button destinations are edited on the button; prices are shared with Prices & options.</small></>}</>;}
  if(block&&!footerBlock&&["text","heading","link"].includes(block.type))controls=<>{controls}<button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy||saveBusy} onClick={()=>requestFooterTransfer()}>Move to shared footer…</button></>;
  if (selected && supportsBoxTarget(selected, boxPage) && (!(imageBlock || imageBoxEditable) || imageEditMode === "box")) controls = <>{workspaceMode?<>{controls}<details data-owner-advanced-position><summary>Advanced positioning</summary><OwnerBoxFields layoutIdentity={selectedLayout??undefined} {...placementProps} selectBoxContents={selectBoxContents} key={`${page.id}:${selected}:${selectedOccurrence}`} canvasRef={canvasRef} renderVersion={content} target={selected} occurrence={selectedOccurrence} value={boxAppearance} disabled={uploadBusy||saveBusy} initialAspectLocked={initialBoxLocked} onInitialAspectLockChange={setInitialBoxLocked} onChange={changeBoxAppearance} /></details></>:<><OwnerBoxFields layoutIdentity={selectedLayout??undefined} {...placementProps} selectBoxContents={selectBoxContents} key={`${page.id}:${selected}:${selectedOccurrence}`} canvasRef={canvasRef} renderVersion={content} target={selected} occurrence={selectedOccurrence} value={boxAppearance} disabled={uploadBusy||saveBusy} initialAspectLocked={initialBoxLocked} onInitialAspectLockChange={setInitialBoxLocked} onChange={changeBoxAppearance} />{controls}</>}</>;
  if(selectedLayout&&getCanvasNodes(sourceContent,selectedLayoutScope).find(n=>n.id===selectedLayout.id)?.movable)controls=<>{controls}<button type="button" className={ui.secondary} disabled={uploadBusy||saveBusy} onClick={()=>requestDelete(true)}>Remove box and contents…</button></>;
  return <section ref={builderRef} className={styles.builder} aria-label="Visual website builder" data-builder-mode={browsing ? "view" : "edit"}>
    <div className={styles.toolbar}>
      <div className={styles.pagePicker}><OwnerSelect label={browsing ? "Viewing page" : "Editing page"} value={page.id} options={activePages.map(item => ({ value: item.id, label: item.title }))} onChange={id => { const target = activePages.find(item => item.id === id); if (target && !uploadBusy) { closePanel(); onPageChange(target); } }} /></div>
      <div className={styles.viewToolsGroup}><div className={styles.viewTools}><div className={styles.editModeSwitch} aria-label="Builder mode">{browsing ? <button data-owner-button type="button" className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy} onClick={() => changeMode(false)}>Edit website</button> : <button data-owner-button type="button" className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy} onClick={() => changeMode(true)}>Exit edit mode</button>}</div>{onRequestDiscard&&<button data-owner-button type="button" className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy||saveBusy} onClick={()=>{if(!uploadBusy&&!saveBusy)onRequestDiscard();}}>Discard Edits</button>}<div className={styles.deviceSwitch} aria-label="Preview width"><button type="button" aria-label="Desktop view" title="Desktop view" aria-pressed={device === "desktop"} disabled={uploadBusy} onClick={() => {if(uploadBusy)return;endBlockDrag();setSelected(null);setDevice("desktop");}}><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="13" rx="2" /><path d="M12 16v5m-4 0h8" /></svg></button><button type="button" aria-label="Mobile view" title="Mobile view" aria-pressed={device === "mobile"} disabled={uploadBusy} onClick={() => {if(uploadBusy)return;endBlockDrag();setSelected(null);setDevice("mobile");}}><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M10 5h4m-3 14h2" /></svg></button></div></div>
      {!browsing&&<div className={styles.quickTools}><button type="button" data-owner-button className={`${buttons.button} ${buttons.primary} ${buttons.compact}`} aria-pressed={selected === "design"} {...panelOpener("design")} onClick={event => choose("design", event?.currentTarget, true)}>Design</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} aria-pressed={selected === "site"} {...panelOpener("site")} onClick={event => choose("site", event?.currentTarget, true)}>Header & footer</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} aria-pressed={selected === "page"} {...panelOpener("page")} onClick={event => choose("page", event?.currentTarget, true)}>Page settings</button></div>}
      {!browsing&&<div className={styles.sectionHistoryActions}>{(onUndo || onRedo) && <div className={styles.historyActions} aria-label="Draft history">
          <button data-owner-button type="button" className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={saveBusy || uploadBusy || !canUndo} onClick={onUndo} title="Undo draft edit (Ctrl/Cmd+Z)" aria-keyshortcuts="Control+Z Meta+Z">Undo</button>
          <button data-owner-button type="button" className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={saveBusy || uploadBusy || !canRedo} onClick={onRedo} title="Redo draft edit (Ctrl/Cmd+Shift+Z)" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z">Redo</button>
        </div>}
      <button type="button" data-owner-button className={`${styles.addSection} ${buttons.button} ${buttons.secondary} ${buttons.compact}`} {...panelOpener("sections")} onClick={event => choose("sections", event?.currentTarget, true)}>Add Item</button></div>}
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
    <div ref={toolbarRef} className={styles.textToolbarDock}>
      {!browsing&&<OwnerTextFormattingBar computed={computedText?.key===formattingKey?computedText.appearance:null} selectionStyles={selectedRichRuns.map(run=>run.style??{})} marks={textMarks} selectionKey={formattingKey} active={!!selectedText} selected={!!formattingSelection} disabled={uploadBusy||saveBusy} fonts={sourceContent.fonts} onStyle={formatSelectedText} onReset={()=>formatSelectedText(null)} onLink={()=>{if(formattingSelection&&selectedText?.links)requestInlineHyperlink(formattingSelection);else setAnnouncement("This button label uses the containing button destination.");}} onEdit={()=>{if(selectedText)setInlineTarget(selected);}}/>}
    </div>
    {clipboardNotice&&<p className={styles.help} role="status" data-owner-frame-clipboard-notice>{clipboardNotice}</p>}
    <div className={styles.layoutIndicator} role="status"><strong>{useMobile?"Editing independent mobile layout":device==="mobile"?"Mobile preview · editing shared layout":"Editing desktop layout"}</strong></div>
    <div className={`${styles.stage} ${workspaceMode&&!browsing?styles.workspaceStage:""}`} data-device={device}>
      <div ref={canvasRef} tabIndex={-1} className={`${styles.canvas} ${!browsing ? styles.editing : ""}`} onContextMenu={event=>{if(browsing||uploadBusy||saveBusy)return;if(event.target instanceof HTMLElement&&event.target.closest("input,textarea,select,[contenteditable]"))return;event.preventDefault();if(event.target instanceof HTMLElement){const target=event.target.closest<HTMLElement>("[data-owner-edit]");if(target?.dataset.ownerEdit)choose(target.dataset.ownerEdit,target,false);}setContextMenu({x:event.clientX,y:event.clientY});}} onPointerDownCapture={() => { dragClickGuard.current = false; }} onClickCapture={capture} onKeyDownCapture={capture} onDragStartCapture={beginBlockDrag} onDragOver={overBlock} onDrop={dropBlock} onDragEnd={endBlockDrag}>
        <SiteContentFrame forceCanvasSlots={footerTransfer?.phase==="measure"?{scope:"chrome",id:"canvas:layout.site.footer"}:drawingSpace?{scope:"page",id:"__root"}:deleteIntent?{scope:deleteIntent.scope,id:deleteIntent.parentId??"__root",omitNodeId:deleteIntent.id}:placementIntent?{scope:placementIntent.scope,id:placementIntent.parentId??"__root",omitNodeId:placementIntent.id}:undefined} content={footerTransfer?.phase==="measure"?footerTransfer.preview:sourceContent} page={footerTransfer?.phase==="measure"?footerTransfer.preview.pages.find(p=>p.id===sourcePage.id)??sourcePage:sourcePage} layoutViewport={device} mode="editor" editable={!browsing} onEditCommissionForm={workspaceMode ? undefined : onEditCommissionForm} onNavigate={target => { if (!uploadBusy) { closePanel(); onPageChange(target); } }} />
        {!browsing&&inlineTarget&&inlineTarget===selected&&selectedText&&<OwnerCanvasTextEditor key={`${sourcePage.id}:${inlineTarget}:${selectedLayout?.scope??"page"}:${selectedLayout?.id??selectedOccurrence}:${useMobile}`} canvasRef={canvasRef} target={inlineTarget} identity={selectedLayout??undefined} value={selectedText.value} inputKind={selectedText.inputKind} runs={inlineRuns} onUndo={onUndo} onRedo={onRedo} links={selectedText.links} disabled={uploadBusy||saveBusy} onCommit={commitInlineText} onCancel={()=>setInlineTarget(null)} onSelection={range=>{inlineSelectionScope.current=textContextKey;setInlineSelection(range);}} onHyperlink={requestInlineHyperlink}/> }
        {!browsing && selected && (imageStyleKey || imageBlock) && (imageStyleKey === "site.logo" || imageEditMode === "photo") && <OwnerCanvasImageTools key={`${page.id}:${selected}:${selectedOccurrence}`} canvasRef={canvasRef} renderVersion={content} target={selected} occurrence={selectedOccurrence} value={selectedImageAppearance} disabled={uploadBusy} onChange={changeImageAppearance} />}
        {drawingSpace&&!browsing&&<div className={styles.spaceDrawing} data-owner-canvas-controls data-owner-space-drawing tabIndex={0} role="region" aria-label="Draw Canvas Space in any direction; Escape cancels" onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();spaceDrag.current=null;setSpacePreview(null);setDrawingSpace(false);}}} onPointerDown={event=>{if(event.button!==0||uploadBusy||saveBusy)return;const parent=layoutDestination("page",null),map=parent?captureCanvasSpaceParent(parent):null;if(!map)return;event.preventDefault();event.stopPropagation();spaceDrag.current={pointer:event.pointerId,start:{x:event.clientX,y:event.clientY},map,source:sourceContent,pageId:sourcePage.id,mobile:useMobile};event.currentTarget.setPointerCapture?.(event.pointerId);}} onPointerMove={event=>{const drag=spaceDrag.current;if(!drag||drag.pointer!==event.pointerId)return;const rect=event.currentTarget.getBoundingClientRect();setSpacePreview({left:Math.min(drag.start.x,event.clientX)-rect.left,top:Math.min(drag.start.y,event.clientY)-rect.top,width:Math.abs(event.clientX-drag.start.x),height:Math.abs(event.clientY-drag.start.y)});}} onPointerUp={event=>finishSpace(event)} onPointerCancel={event=>finishSpace(event,true)} onLostPointerCapture={event=>{if(spaceDrag.current)finishSpace(event,true);}}>{spacePreview&&<div className={styles.spacePreview} style={spacePreview}/>}<span className={styles.spacePrompt}>Drag to draw Canvas Space · Escape cancels</span></div>}
        {!browsing && selected && (boxStyleKey || selected === "page-title" || boxEditableBlock) && (!(imageBlock || imageBoxEditable) || imageEditMode === "box") && <OwnerCanvasBoxTools onCopyBox={clipboardScopeKey&&sharedFrameClipboard?copyBox:undefined} onPasteBox={hasFrameClipboard&&frameClipboard.current?.scopeKey===clipboardScopeKey?()=>void pasteBox():undefined} onCanvasMovePreview={point=>{if(!footerBlock&&block&&["text","heading","link"].includes(block.type)){const frame=footerFrame();if(frame){if(overFooter(point))frame.dataset.ownerFooterDrop="true";else delete frame.dataset.ownerFooterDrop;}}}} onCanvasMoveCancel={clearFooterHighlight} onCanvasMoveCommit={!footerBlock&&block&&["text","heading","link"].includes(block.type)?(capture,point)=>{clearFooterHighlight();return overFooter(point)?requestFooterTransfer(capture):false;}:undefined} layoutIdentity={selectedLayout??undefined} {...placementProps} selectBoxContents={selectBoxContents} onSelectBoxContents={selected=>setContentsSelection(selected?null:contentsSelectionKey)} key={`${page.id}:${selected}:${selectedOccurrence}`} canvasRef={canvasRef} renderVersion={content} target={selected} occurrence={selectedOccurrence} value={boxAppearance} disabled={uploadBusy||saveBusy} initialAspectLocked={initialBoxLocked} onInitialAspectLockChange={setInitialBoxLocked} onChange={changeBoxAppearance} onEditContent={() => {setInspectorOpen(true);if(selectedText)setInlineTarget(selected);}} onDelete={selectedLayout&&getCanvasNodes(sourceContent,selectedLayoutScope).find(n=>n.id===selectedLayout.id)?.movable?()=>requestDelete():undefined} onSelectParent={selectedLayout&&selectedLayoutMap[selectedLayout.id]?.parentId?selectParent:undefined} reparentId={undefined} sectionOrder={layoutOrder} />}
      </div>
      {!browsing && (workspaceMode||selected&&inspectorOpen&&controls) && <aside id={panelId} data-owner-selected-layout-id={selectedLayout?.id} ref={panelRef} className={`${styles.panel} ${workspaceMode?styles.dockedPanel:""} ${selected==="prices"?styles.pricesPanel:""}`} style={workspaceMode?undefined:movable.style} data-moving={movable.moving} aria-label={selectedTitle} onKeyDown={event => { if (event.key === "Escape" && !event.nativeEvent?.isComposing) { event.preventDefault(); closePanel(); } }}>
        <div className={styles.panelHeader} {...(workspaceMode?{}:movable.handleProps)}><div><span>{selected === "design" ? (useMobile?"WEBSITE DESIGN · INDEPENDENT MOBILE":"WEBSITE DESIGN · DESKTOP / SHARED") : selected === "site" ? "HEADER, FOOTER & BRANDING" : (useMobile?"EDITING MOBILE APPEARANCE · SHARED CONTENT":"EDITING YOUR DRAFT")}</span><h2>{selected?selectedTitle:"Select an item"}</h2></div><button type="button" aria-label="Close section editor" disabled={uploadBusy} onClick={closePanel}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
        <div className={styles.panelNav}><button type="button" aria-pressed={selected === "page-content"} disabled={uploadBusy} onClick={() => choose("page-content")}>Page content</button><button type="button" aria-pressed={selected === "design"} disabled={uploadBusy} onClick={() => choose("design")}>Design</button><button type="button" aria-pressed={selected === "site"} disabled={uploadBusy} onClick={() => choose("site")}>Header & footer</button></div><div className={styles.panelContent} data-owner-fields><details className={styles.inspectorMore}><summary>More settings</summary>{draftNameControl}{selectedLayout&&selectedBoxName&&<div className={styles.inlineBoxName}><Field label="Content box name" value={boxName} onChange={value=>setBoxNameDraft({id:selectedLayout.id,original:selectedBoxName,value})}/><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy||saveBusy||!boxName.trim()||boxName.trim().length>120||boxName.trim()===selectedBoxName} onClick={()=>onContentEdit(draft=>{const scope=selectedLayout.scope==="chrome"?"chrome":draft.pages.find(p=>p.id===sourcePage.id);if(scope)renameCanvasNode(draft,scope,selectedLayout.id,useMobile,boxName);})}>Rename box</button></div>}{selectedLayout&&(()=>{const scope=selectedLayout.scope,modelScope=scope==="chrome"?"chrome":sourcePage,layout=resolveCanvasLayout(sourceContent,modelScope,useMobile),nodes=getCanvasNodes(sourceContent,modelScope),node=nodes.find(n=>n.id===selectedLayout.id);if(!node?.movable)return null;const choices=nodes.filter(n=>n.canContain&&!layout[n.id]?.removed&&canAssignCanvasParent(sourceContent,modelScope,node.id,n.id,useMobile));const choiceKey=`${sourcePage.id}:${scope}:${node.id}:${useMobile}`;const destination=parentChoice?.id===choiceKey?parentChoice.value:"";return <><OwnerSelect label="Move into box" placeholder="Choose a box…" value={destination} options={choices.map(n=>({value:n.id,label:layout[n.id]?.label??n.label}))} onChange={value=>{if(!uploadBusy&&!saveBusy)setParentChoice({id:choiceKey,value});}}/><button type="button" className={ui.secondary} disabled={uploadBusy||saveBusy||!choices.some(n=>n.id===destination)} onClick={()=>moveLayer(scope,node.id,destination)}>Move into box</button><button type="button" className={ui.secondary} disabled={uploadBusy||saveBusy||!layout[node.id]?.parentId||!canAssignCanvasParent(sourceContent,modelScope,node.id,null,useMobile)} onClick={()=>moveLayer(scope,node.id,null)}>Move to canvas</button></>;})()}</details><CanvasPlacementEditingContext value={!!selectedPlacement}>{selected?controls:<p>Click text to type directly on your website. Select an item to change its font, size, color or link here. Drag its on-canvas handles to resize or rotate it.</p>}</CanvasPlacementEditingContext></div>
        <div className={styles.panelFooter}><span>{uploadBusy ? "Finish or cancel your upload before closing." : "Changes appear on your page as you type."}</span><button type="button" className={ui.primary} disabled={uploadBusy || (workspaceMode && !selected)} onClick={closePanel}>{workspaceMode?"Clear selection":"Done"}</button></div>
      </aside>}
    </div>
    {contextMenu&&!browsing&&<div ref={contextMenuRef} role="menu" aria-label="Builder actions" className={styles.canvasContextMenu} style={{left:Math.max(8,Math.min(contextMenu.x,typeof window!=="undefined"?window.innerWidth-180:contextMenu.x)),top:Math.max(8,Math.min(contextMenu.y,typeof window!=="undefined"?window.innerHeight-210:contextMenu.y))}} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setContextMenu(null);canvasRef.current?.focus();}else if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)){event.preventDefault();const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button")),at=items.indexOf(document.activeElement as HTMLButtonElement),next=event.key==="Home"?0:event.key==="End"?items.length-1:(at+(event.key==="ArrowDown"?1:-1)+items.length)%items.length;items[next]?.focus();}}}><button role="menuitem" type="button" disabled={!clipboardScopeKey||!sharedFrameClipboard||!selectedLayout||saveBusy||uploadBusy} onClick={()=>{setContextMenu(null);copyBox();}}>Copy box</button><button role="menuitem" type="button" disabled={!clipboardScopeKey||frameClipboard.current?.scopeKey!==clipboardScopeKey||!hasFrameClipboard||saveBusy||uploadBusy} onClick={()=>{setContextMenu(null);void pasteBox();}}>Paste box</button><button role="menuitem" type="button" disabled={!onSave||saveBusy||uploadBusy} onClick={()=>{if(saveBusy||uploadBusy)return;setContextMenu(null);onSave?.();}}>Save</button><button role="menuitem" type="button" onClick={()=>{setContextMenu(null);choose("sections");}}>Add Item</button><button role="menuitem" type="button" onClick={()=>{setContextMenu(null);openNewPage();}}>New Page</button></div>}
    {footerTransfer?.phase==="confirm"&&<Dialog title="Move this item to the shared footer?" dismissDisabled={uploadBusy||saveBusy} onClose={()=>{if(!uploadBusy&&!saveBusy)setFooterTransfer(null);}} actions={<><button type="button" onClick={()=>setFooterTransfer(null)} disabled={uploadBusy||saveBusy}>Keep on this page</button><button type="button" disabled={uploadBusy||saveBusy} onClick={()=>{if(!footerTransferCurrent(footerTransfer)){setFooterTransfer(null);setAnnouncement("The page or view changed. Nothing was moved.");return;}setFooterTransfer({...footerTransfer,phase:"measure"});}}>Move to shared footer</button></>}><p>This item will appear in the footer on every page, in both layouts—even if its current page is hidden. It becomes sitewide when you explicitly publish Website structure &amp; design.</p><p>The active layout keeps its measured position. The other layout keeps its own existing placement or uses footer flow; review it separately. This is one draft edit that Undo can restore. Nothing is published automatically.</p></Dialog>}
    {pricesOpen&&<Dialog title="Prices & options" wide maximizable dismissDisabled={uploadBusy||saveBusy} onClose={()=>{if(!uploadBusy&&!saveBusy)setPricesOpen(false);}} actions={<button type="button" disabled={uploadBusy||saveBusy} onClick={()=>setPricesOpen(false)}>Done</button>}><OwnerPricesManager content={content} onEdit={onEdit} onRemove={onRemove} disabled={uploadBusy||saveBusy}/></Dialog>}
    <p className={styles.srOnly} role="status" aria-live="polite">{announcement}</p>
    <div className={styles.canvasFooter}><span>Only you can see this draft.</span>{!browsing && <button type="button" {...panelOpener("sections")} onClick={event => choose("sections", event?.currentTarget, true)}>Add Item to {page.title}</button>}</div>
  </section>;
}
