"use client";

import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { SiteContentFrame } from "@/components/SiteContent";
import { COMMISSION_STATUSES, newOwnerId, validatePageSlug, type OwnerContent, type OwnerPage, type PageBlock } from "./model";
import { Field, ImagePicker, MoveButtons, OwnerSelect, Toggle } from "./OwnerFields";
import { OwnerBlocksEditor, createBlock } from "./OwnerBlocksEditor";
import { PremadePhotoEditor } from "./PremadePhotoEditor";
import { OwnerDesignPanel } from "./OwnerDesignPanel";
import { OwnerAppearancePanel, OwnerElementAppearance } from "./OwnerAppearancePanel";
import { OwnerHeaderEditor, OwnerPageNavigation } from "./OwnerHeaderEditor";
import { OwnerCanvasBoxTools, OwnerBoxFields } from "./OwnerCanvasBoxTools";
import { BOX_BLOCK_TYPES, boxStyleKeyForTarget, boxTargetLabel, supportsBoxTarget, findCanvasBoxTarget } from "./box-targets";
import { reorderById } from "./builder-interactions";
import { OwnerTemplateEditor } from "./OwnerTemplateEditor";
import { DESIGN_SELECT_FIELDS, IMAGE_FIELDS, LINK_FIELDS, TEXT_FIELDS } from "./site-design";
import ui from "./OwnerPortal.module.css";
import styles from "./OwnerVisualBuilder.module.css";
import buttons from "./OwnerButton.module.css";
import { OwnerLinkedTextField } from "./OwnerLinkedTextField";
import { OwnerCanvasImageTools } from "./OwnerCanvasImageTools";
import type { ElementAppearance } from "./appearance";
import { useMovablePanel } from "./use-movable-panel";

type Props = {
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
  onUndo?: () => void; onRedo?: () => void; canUndo?: boolean; canRedo?: boolean;
  browsing: boolean;
  onBrowsingChange: (browsing: boolean) => void;
};
const blockLabels: Record<PageBlock["type"], string> = { text: "Text", image: "Photo", link: "Button", heading: "Heading", list: "List", divider: "Divider", spacer: "Space", faq: "Questions & answers", feature: "Photo + text" };
const selectionLabels: Record<string, string> = { site: "Header & footer", design: "Website design", "page-content": "Page content", "home-copy": "Welcome text", "home-image": "Main photo", status: "Commission availability", contact: "Contact details", page: "Page settings", sections: "Add a section", shop: "Premade shop" };
function move<T extends { id: string }>(items: T[], id: string, direction: -1 | 1) { const from = items.findIndex(item => item.id === id); const to = from + direction; if (from >= 0 && to >= 0 && to < items.length) [items[from], items[to]] = [items[to], items[from]]; }

/** The public renderer IS the canvas. Only the selected piece gets editing controls. */
export function OwnerVisualBuilder({ content, page, onEdit, onPageChange, onManagePages, onAddPage, onPrices, onEditCommissionForm, onRemove, liveShopVisibility, liveShopKnown = true, liveShopReadError, onRetryLiveShop, canUpdateLiveShop, onUpdateLiveShop, uploadBusy = false, browsing, onBrowsingChange, onSave, saveBusy = false, draftSaveStatus, onPopOut, onUndo, onRedo, canUndo = false, canRedo = false }: Props) {
  const panelId = useId();
  const navigationTarget = useRef<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedOccurrence, setSelectedOccurrence] = useState(0);
  const [initialBoxLocked, setInitialBoxLocked] = useState(true);
  const [canvasBoxes, setCanvasBoxes] = useState<{ target: string; occurrence: number; value: string; label: string }[]>([]);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const draggingNav = useRef<string | null>(null);
  const dragClickGuard = useRef(false);
  const draggingBlock = useRef<{ id: string; pageId: string } | null>(null);
  const [imageEditMode, setImageEditMode] = useState<"photo" | "box">("box");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const canvasRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const movable = useMovablePanel(panelRef, !selected || !inspectorOpen);
  const lastTarget = useRef<HTMLElement | null>(null);
  const activePages = content.pages.filter(item => !item.trashedAt).sort((a, b) => a.order - b.order);
  const photo = content.gallery.find(item => selected === `gallery:${item.id}`);
  const premade = content.premades.find(item => selected === `premade:${item.id}`);
  const block = page.blocks.find(item => selected === `block:${item.id}`);
  const boxEditableBlock = block && BOX_BLOCK_TYPES.includes(block.type);
  const coreStyleKey = selected?.startsWith("core-text:") ? selected.slice(10) : null;
  const imageStyleKey = selected === "home-image" ? "home.image" : selected?.startsWith("template-image:") ? selected.slice(15) : null;
  const imageBoxEditable = imageStyleKey && imageStyleKey !== "site.logo";
  const boxStyleKey = boxStyleKeyForTarget(selected);
  const boxAppearance = block?.appearance ?? (selected === "page-title" ? page.titleAppearance ?? content.contentOverrides?.styles?.[`${page.builtinKey}.title`] : boxStyleKey ? content.contentOverrides?.styles?.[boxStyleKey] : undefined);
  function changeBoxAppearance(value: ElementAppearance) {
    if (uploadBusy || !supportsBoxTarget(selected, page)) return;
    onEdit(draft => {
      if (block) { const item = draft.pages.find(item => item.id === page.id)?.blocks.find(item => item.id === block.id); if (item) item.appearance = value; }
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
  const selectedTitle = templateField?.label ?? (photo ? "Edit photo" : premade ? "Edit premade" : block ? blockLabels[block.type] : selectionLabels[selected ?? ""] ?? "Edit section");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const counts = new Map<string, number>(), boxes: typeof canvasBoxes = [];
    canvas.querySelectorAll<HTMLElement>("[data-owner-edit]").forEach(node => {
      const target = node.dataset.ownerEdit ?? "", occurrence = counts.get(target) ?? 0;
      counts.set(target, occurrence + 1);
      node.dataset.ownerSelected = String(!browsing && target === selected && occurrence === selectedOccurrence);
      const supported = supportsBoxTarget(target, page);
      node.dataset.ownerBoxSupported = String(supported);
      if (supported && (!node.getClientRects || node.getClientRects().length)) boxes.push({ target, occurrence, value: `${target}#${occurrence}`, label: `${boxTargetLabel(target, page)}${occurrence ? ` · instance ${occurrence + 1}` : ""}` });
      if (target.startsWith("block:")) node.draggable = !browsing && !uploadBusy;
    });
    setCanvasBoxes(current => JSON.stringify(current) === JSON.stringify(boxes) ? current : boxes);
    canvas.querySelectorAll<HTMLElement>("[data-owner-nav-page]").forEach(node => { node.draggable = !browsing && !uploadBusy; });
  }, [selected, selectedOccurrence, browsing, content, page, uploadBusy]);
  useEffect(() => {
    if (!selected || !inspectorOpen) return;
    const panel = panelRef.current;
    panel?.scrollTo?.({ top: 0 });
    const focus = panel?.querySelector<HTMLElement>("[data-owner-fields] input:not([type=file]):not([type=hidden]), [data-owner-fields] textarea, [data-owner-fields] button, [data-owner-fields] [tabindex='0']");
    focus?.focus({ preventScroll: true });
  }, [selected, selectedOccurrence, inspectorOpen]);

  function closeCanvasMenu() { canvasRef.current?.querySelectorAll<HTMLDetailsElement>(".nav-more[open]").forEach(menu => { menu.open = false; }); }
  function closePanel() {
    if (uploadBusy) return;
    setInspectorOpen(false);
    // Materialization replaces the original text node with a transformed frame.
    // Resolve the live occurrence instead of focusing the detached old span.
    const current = selected && canvasRef.current ? findCanvasBoxTarget(canvasRef.current, selected, selectedOccurrence) : null;
    (current ?? lastTarget.current)?.focus({ preventScroll: true });
    // Done closes fields, not the selected content box. Its measured affine
    // outline remains aligned with the rendered rotation until deselected.
    if (!supportsBoxTarget(selected, page)) setSelected(null);
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
    closeCanvasMenu(); setSelected(null); setNavigationOpen(false); navigationTarget.current = null; lastTarget.current = null;
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
  function choose(target: string, element?: HTMLElement, toggle = false) {
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
    if (target === "prices") { onPrices(); return; }
    // External openers toggle; switching within the inspector keeps its original focus return target.
    if (element) lastTarget.current = element;
    const occurrence = element && canvasRef.current ? Array.from(canvasRef.current.querySelectorAll<HTMLElement>("[data-owner-edit]")).filter(node => node.dataset.ownerEdit === target).indexOf(element) : 0;
    const nextOccurrence = Math.max(0, occurrence);
    if (toggle && inspectorOpen && selected === target && selectedOccurrence === nextOccurrence) { closePanel(); return; }
    if (selected !== target || selectedOccurrence !== nextOccurrence) setInitialBoxLocked(true);
    setSelectedOccurrence(nextOccurrence); setSelected(target); setInspectorOpen(true);
  }
  function capture(event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) {
    if (browsing || !(event.target instanceof HTMLElement)) return;
    // Canvas controls own Escape and arrow keys for their active gesture.
    // Do not close the inspector first and swallow their cancellation event.
    if (event.target.closest("[data-owner-canvas-controls]")) return;
    if ("key" in event && event.key === "Escape" && (draggingNav.current || draggingBlock.current)) { event.preventDefault(); event.stopPropagation(); endBlockDrag(); return; }
    if ("key" in event && event.key === "Escape" && selected) { event.preventDefault(); event.stopPropagation(); if (inspectorOpen) closePanel(); else setSelected(null); return; }
    if (!("key" in event) && dragClickGuard.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); return; }
    // More is an actual disclosure even while editing; do not select the surrounding header.
    if (event.target.closest(".nav-more > summary")) return;
    if ("key" in event && event.nativeEvent?.isComposing) return;
    if ("key" in event && event.key !== "Enter" && event.key !== " ") return;
    const nav = event.target.closest<HTMLElement>("[data-owner-nav-page]");
    if (nav && canvasRef.current?.contains(nav)) { event.preventDefault(); event.stopPropagation(); choose(`nav:${nav.dataset.ownerNavPage}`, nav, true); return; }
    const target = event.target.closest<HTMLElement>("[data-owner-edit]");
    if (!target || !canvasRef.current?.contains(target)) return;
    event.preventDefault(); event.stopPropagation();
    choose(target.dataset.ownerEdit!, target, true);
  }
  function canvasBlock(event: DragEvent<HTMLDivElement>) { const node = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-owner-edit^='block:']") : null; return node && canvasRef.current?.contains(node) ? node : null; }
  function canvasNav(event: DragEvent<HTMLDivElement>) { const node = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-owner-nav-page]") : null; return node && canvasRef.current?.contains(node) ? node : null; }
  function beginBlockDrag(event: DragEvent<HTMLDivElement>) { if (event.target instanceof HTMLElement && event.target.closest("[data-owner-canvas-controls]")) { event.preventDefault(); return; } if (browsing || uploadBusy) return; const nav = canvasNav(event); if (nav?.dataset.ownerNavPage && activePages.some(item => item.id === nav.dataset.ownerNavPage)) { draggingBlock.current = null; draggingNav.current = nav.dataset.ownerNavPage; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", nav.dataset.ownerNavPage); event.dataTransfer.setDragImage?.(nav, 16, 16); nav.dataset.ownerDragging = "true"; setSelected(null); return; } const node = canvasBlock(event); if (!node) return; draggingNav.current = null; const id = node.dataset.ownerEdit?.slice(6); if (!id || !page.blocks.some(item => item.id === id)) return; draggingBlock.current = { id, pageId: page.id }; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id); event.dataTransfer.setDragImage?.(node, Math.max(0, event.clientX - node.getBoundingClientRect().left), Math.max(0, event.clientY - node.getBoundingClientRect().top)); node.dataset.ownerDragging = "true"; setSelected(null); }
  function overBlock(event: DragEvent<HTMLDivElement>) { if (browsing || uploadBusy) return; if (draggingNav.current) { const nav = canvasNav(event); if (nav) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; canvasRef.current?.querySelectorAll<HTMLElement>("[data-owner-drop]").forEach(item => delete item.dataset.ownerDrop); nav.dataset.ownerDrop = "true"; } return; } if (draggingBlock.current?.pageId !== page.id) return; const node = canvasBlock(event); if (!node) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; canvasRef.current?.querySelectorAll<HTMLElement>("[data-owner-drop]").forEach(item => delete item.dataset.ownerDrop); node.dataset.ownerDrop = "true"; }
  function endBlockDrag() { if (draggingNav.current || draggingBlock.current) dragClickGuard.current = true; canvasRef.current?.querySelectorAll<HTMLElement>("[data-owner-dragging]").forEach(item => delete item.dataset.ownerDragging); draggingNav.current = null; draggingBlock.current = null; canvasRef.current?.querySelectorAll<HTMLElement>("[data-owner-drop]").forEach(item => delete item.dataset.ownerDrop); }
  function dropBlock(event: DragEvent<HTMLDivElement>) { if (!browsing && !uploadBusy && draggingNav.current) { const nav = canvasNav(event); const sourceId = draggingNav.current; if (nav?.dataset.ownerNavPage) { event.preventDefault(); event.stopPropagation(); const targetId = nav.dataset.ownerNavPage; const rect = nav.getBoundingClientRect(); const after = event.clientX > rect.left + rect.width / 2; onEdit(draft => { const active = draft.pages.filter(item => !item.trashedAt).sort((a, b) => a.order - b.order); const slots = active.map(item => item.order); if (reorderById(active, sourceId, targetId, after)) active.forEach((item, index) => { item.order = slots[index]; }); }); setAnnouncement("Navigation order updated in your draft."); } endBlockDrag(); return; } const source = draggingBlock.current; const node = canvasBlock(event); if (browsing || uploadBusy || source?.pageId !== page.id || !node) { endBlockDrag(); return; } event.preventDefault(); event.stopPropagation(); const targetId = node.dataset.ownerEdit!.slice(6); const rect = node.getBoundingClientRect(); const after = event.clientY > rect.top + rect.height / 2; editPage(target => { reorderById(target.blocks, source.id, targetId, after); }); endBlockDrag(); setSelected(`block:${source.id}`); setAnnouncement("Section order updated in your draft."); }
  function editPage(change: (target: OwnerPage) => void) { onEdit(draft => { const target = draft.pages.find(item => item.id === page.id); if (target) change(target); }); }
  function addPhoto() {
    if (uploadBusy || browsing) return;
    const id = newOwnerId("photo");
    onEdit(draft => { draft.gallery.unshift({ id, name: "New photo", src: "/images/home-collage.webp", alt: "Taylor Made Creations fursuit work", width: 1996, height: 960, visible: true }); });
    choose(`gallery:${id}`); canvasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function addPremade() {
    if (uploadBusy || browsing) return;
    const id = newOwnerId("premade");
    onEdit(draft => { draft.premades.unshift({ id, name: "New premade", image: "/images/home-collage.webp", alt: "Premade fursuit", description: "", price: null, visible: false }); });
    choose(`premade:${id}`); canvasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function removeSelected(title: string, description: string, remove: () => void) { onRemove(title, description, () => { remove(); closePanel(); }); }

  const pageTitleAppearance = page.kind === "custom"
    ? <OwnerAppearancePanel fonts={content.fonts} label="Page title appearance" value={page.titleAppearance} onEdit={change => editPage(target => { target.titleAppearance ??= {}; change(target.titleAppearance); })} onReset={() => editPage(target => { delete target.titleAppearance; })} />
    : <OwnerElementAppearance content={content} styleKey={`${page.builtinKey}.title`} onEdit={onEdit} />;
  let controls: ReactNode = null;
  if (selected === "design") controls = <OwnerDesignPanel content={content} onEdit={onEdit} onReset={() => onRemove("Restore the original website design?", "This resets global and individual colors, fonts, spacing, photo framing and layout in your draft. Your writing, photos, pages and prices stay unchanged. Nothing is published.", () => onEdit(draft => { delete draft.design; if (draft.contentOverrides) delete draft.contentOverrides.styles; for (const page of draft.pages) { delete page.titleAppearance; for (const block of page.blocks) delete block.appearance; } }))} />;
  if (selected?.startsWith("template-") && templateField) controls = <OwnerTemplateEditor key={selected} content={content} onEdit={onEdit} target={selected} />;
  if (coreStyleKey) controls = <>{coreStyleKey.startsWith("home.") ? <OwnerLinkedTextField label="Text" multiline value={content.home[coreStyleKey.slice(5) as "title" | "eyebrow" | "description" | "caption"]} onChange={value => onEdit(draft => { draft.home[coreStyleKey.slice(5) as "title" | "eyebrow" | "description" | "caption"] = value; })} /> : coreStyleKey === "prices.intro" ? <OwnerLinkedTextField label="Prices introduction" multiline value={content.prices.intro} onChange={value => onEdit(draft => { draft.prices.intro = value; })} /> : null}<OwnerElementAppearance content={content} styleKey={coreStyleKey} onEdit={onEdit} /></>;
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
    <OwnerLinkedTextField label="Welcome description" multiline value={content.home.description} onChange={value => onEdit(draft => { draft.home.description = value; })} />
    <OwnerElementAppearance content={content} styleKey="home.description" onEdit={onEdit} />
  </>;
  if (selected === "home-copy") controls = homeCopyControls;
  if (selected === "page-content") controls = <>
    {page.builtinKey === "home" ? homeCopyControls : <Field label="Page title" value={page.title} onChange={value => editPage(target => { target.title = value; })} required />}
    {page.builtinKey !== "home" && pageTitleAppearance}
    {page.builtinKey === "prices" && <><OwnerLinkedTextField label="Prices introduction" value={content.prices.intro} multiline onChange={value => onEdit(draft => { draft.prices.intro = value; })} /><OwnerElementAppearance content={content} styleKey="prices.intro" onEdit={onEdit} /></>}
    {page.builtinKey && <OwnerTemplateEditor key={`template-${page.id}`} content={content} onEdit={onEdit} group={page.builtinKey} />}
    <div className={styles.sectionDirectory}><h3>Sections on this page</h3>{page.blocks.length ? page.blocks.map((item, index) => <button key={item.id} type="button" onClick={() => choose(`block:${item.id}`)}><span>{index + 1}. {blockLabels[item.type]}</span></button>) : <p className={ui.help}>Add a section to include more words, photos, buttons or questions and answers.</p>}<button type="button" onClick={() => choose("sections")}>＋ Add a section</button></div>
  </>;
  if (selected === "home-image") controls = <>
    <ImagePicker key="home-image" src={content.home.image.src} alt={content.home.image.alt} onSource={value => onEdit(draft => { draft.home.image.src = value; })} onAlt={value => onEdit(draft => { draft.home.image.alt = value; })} />
    <OwnerElementAppearance content={content} styleKey="home.image" onEdit={onEdit} />
    <OwnerLinkedTextField label="Caption beneath the main photo" value={content.home.caption} onChange={value => onEdit(draft => { draft.home.caption = value; })} />
    <OwnerElementAppearance content={content} styleKey="home.caption" onEdit={onEdit} />
    <OwnerTemplateEditor content={content} onEdit={onEdit} target="template-text:home.photoCredit" />
  </>;
  if (selected === "status") controls = <>
    <OwnerSelect label="Commission status" value={content.site.commissionStatus} options={COMMISSION_STATUSES.map(value => ({ value, label: value }))} onChange={value => onEdit(draft => { draft.site.commissionStatus = value as OwnerContent["site"]["commissionStatus"]; })} />
    <OwnerLinkedTextField label="A note for visitors" multiline value={content.site.statusNote} onChange={value => onEdit(draft => { draft.site.statusNote = value; })} />
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
      <OwnerLinkedTextField label="Description" multiline value={premade.description} onChange={value => onEdit(draft => { const item = draft.premades.find(item => item.id === premade.id); if (item) item.description = value; })} />
      <PremadePhotoEditor key={premade.id} item={premade} onChange={patch => onEdit(draft => { const item = draft.premades.find(item => item.id === premade.id); if (item) Object.assign(item, patch); })} />
      <Toggle label="Show this listing" checked={premade.visible} onChange={value => onEdit(draft => { const item = draft.premades.find(item => item.id === premade.id); if (item) item.visible = value; })} hint="Hidden listings are only shown in this builder. The shop switch must also be on for visitors to see it." />
      <div className={styles.itemActions}><span>Listing {index + 1} of {content.premades.length}</span><MoveButtons label={premade.name} index={index} length={content.premades.length} onMove={direction => onEdit(draft => move(draft.premades, premade.id, direction))} /></div>
      <button type="button" className={ui.dangerLink} onClick={() => removeSelected(`Remove “${premade.name}”?`, "This removes the listing from your draft. Its photos are not deleted, and the live site stays unchanged until you publish.", () => onEdit(draft => { draft.premades = draft.premades.filter(item => item.id !== premade.id); }))}>Remove listing</button>
    </>;
  }
  if (block) controls = <OwnerBlocksEditor fonts={content.fonts} page={page} focusedBlockId={block.id} hideAddPalette onEdit={editPage} onRemove={(_block, remove) => removeSelected("Remove this section?", "This removes the section from your draft. The live website is not changed until you publish.", remove)} />;
  if (selected === "sections") controls = <><p className={ui.help}>Choose what to add. It appears below your page content, ready for you to make it yours.</p><div className={styles.palette}>{(Object.entries(blockLabels) as [PageBlock["type"], string][]).map(([type, label]) => <button type="button" key={type} disabled={uploadBusy || page.blocks.length >= 100} onClick={() => { if (uploadBusy || page.blocks.length >= 100) return; const next = createBlock(type); editPage(target => { target.blocks.push(next); }); choose(`block:${next.id}`); }}><span aria-hidden="true">＋</span>{label}</button>)}</div></>;

  if (imageBlock || imageBoxEditable) controls = <><div className={styles.modeSwitch} aria-label="Image editing target"><button type="button" aria-pressed={imageEditMode === "photo"} onClick={() => setImageEditMode("photo")}>Photo framing</button><button type="button" aria-pressed={imageEditMode === "box"} onClick={() => setImageEditMode("box")}>Whole content box</button></div>{imageEditMode === "box" && <p className={ui.help}>Move, resize or tilt the whole content box. Photo framing changes only the image size and crop.</p>}{controls}</>;
  if (selected && supportsBoxTarget(selected, page) && (!(imageBlock || imageBoxEditable) || imageEditMode === "box")) controls = <><OwnerBoxFields key={`${page.id}:${selected}:${selectedOccurrence}`} canvasRef={canvasRef} renderVersion={content} target={selected} occurrence={selectedOccurrence} value={boxAppearance} disabled={uploadBusy} initialAspectLocked={initialBoxLocked} onInitialAspectLockChange={setInitialBoxLocked} onChange={changeBoxAppearance} />{controls}</>;
  return <section className={styles.builder} aria-label="Visual website builder" data-builder-mode={browsing ? "view" : "edit"}>
    <div className={styles.toolbar}>
      <div className={styles.pagePicker}><OwnerSelect label={browsing ? "Viewing page" : "Editing page"} value={page.id} options={activePages.map(item => ({ value: item.id, label: item.title }))} onChange={id => { const target = activePages.find(item => item.id === id); if (target && !uploadBusy) { closePanel(); onPageChange(target); } }} /></div>
      <div className={styles.viewToolsGroup}><div className={styles.viewTools}><div className={styles.modeSwitch} aria-label="Builder mode">{browsing ? <button type="button" disabled={uploadBusy} onClick={() => changeMode(false)}>Edit website</button> : <button type="button" disabled={uploadBusy} onClick={() => changeMode(true)}>Exit edit mode</button>}</div><div className={styles.deviceSwitch} aria-label="Preview width"><button type="button" aria-label="Desktop view" title="Desktop view" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="13" rx="2" /><path d="M12 16v5m-4 0h8" /></svg></button><button type="button" aria-label="Mobile view" title="Mobile view" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M10 5h4m-3 14h2" /></svg></button></div></div>
        <div className={styles.builderSaveActions}>
          {onPopOut && <button data-owner-button type="button" className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy} title="Open a read-only draft preview in another window" onClick={() => { if (!uploadBusy) onPopOut(); }}>Popout Preview ↗</button>}

          {onSave && <button data-owner-button type="button" className={`${buttons.button} ${buttons.primary} ${buttons.compact}`} disabled={saveBusy || uploadBusy} onClick={() => { if (!saveBusy && !uploadBusy) onSave(); }}>Save</button>}
        </div>
      </div>
    </div>
    <p className={styles.draftDisclaimer}>{draftSaveStatus ?? "Your edits stay private. Save opens your draft and publication choices."} Switching pages, selections or preview modes never publishes or deletes content.</p>
    <div className={styles.actionbar}>
      <p>{uploadBusy ? "Uploading your photo… finish or cancel it before changing sections." : browsing ? "Viewing your private draft, including unsaved changes. Choose Edit website to make changes. Switching modes never publishes your work." : "Select a supported box, then drag its content to move it. Resize from any edge or corner, enter a size, or use the round handle to tilt. Hold Shift for proportions or rotation snaps. Drag unselected sections or navigation items to reorder; selected sections also have arrow buttons. Price colors: Design → Website colors → Price text."}</p>
      {!browsing && <div><button type="button" data-owner-button className={`${buttons.button} ${buttons.primary} ${buttons.compact}`} aria-pressed={selected === "design"} {...panelOpener("design")} onClick={event => choose("design", event?.currentTarget, true)}>Design</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} aria-pressed={selected === "site"} {...panelOpener("site")} onClick={event => choose("site", event?.currentTarget, true)}>Header & footer</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} aria-pressed={selected === "page"} {...panelOpener("page")} onClick={event => choose("page", event?.currentTarget, true)}>Page settings</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy} onClick={openPageManager}>Manage pages</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={uploadBusy} onClick={openNewPage}>＋ New page</button></div>}
    </div>
    {!browsing && <div className={styles.contextbar}>
      <button type="button" aria-pressed={selected === "page-content"} {...panelOpener("page-content")} onClick={event => choose("page-content", event?.currentTarget, true)}>Page content</button>
      {page.builtinKey === "home" && <><button type="button" {...panelOpener("home-copy")} onClick={event => choose("home-copy", event?.currentTarget, true)}>Welcome text</button><button type="button" {...panelOpener("home-image")} onClick={event => choose("home-image", event?.currentTarget, true)}>Main photo</button></>}
      {page.builtinKey === "gallery" && <><span>{content.gallery.length} photos · newest first</span><button type="button" onClick={addPhoto}>＋ Add a photo</button></>}
      {page.builtinKey === "premades" && <><button type="button" {...panelOpener("shop")} onClick={event => choose("shop", event?.currentTarget, true)}>Shop: {content.site.showPremades ? "on" : "off"} <span aria-hidden="true">⌄</span></button>{liveShopKnown && content.site.showPremades !== liveShopVisibility && liveShopVisibility !== null && <button type="button" className={styles.applyShop} disabled={!canUpdateLiveShop} onClick={onUpdateLiveShop}>Update live</button>}<button type="button" onClick={addPremade}>＋ Add a premade</button><span>{!content.site.showPremades ? "Shop is off. You can still edit every listing below." : "Hidden listings appear here for editing only."}</span></>}
      {page.builtinKey === "contact" && <><button type="button" {...panelOpener("contact")} onClick={event => choose("contact", event?.currentTarget, true)}>Contact details</button><button type="button" {...panelOpener("site")} onClick={event => choose("site", event?.currentTarget, true)}>Header & footer</button><button type="button" {...panelOpener("status")} onClick={event => choose("status", event?.currentTarget, true)}>Commission status</button></>}
      {page.builtinKey === "commissions" && <button type="button" {...panelOpener("status")} onClick={event => choose("status", event?.currentTarget, true)}>Commission status</button>}
      {page.builtinKey === "prices" && <button type="button" disabled={uploadBusy} onClick={() => { if (!uploadBusy) onPrices(); }}>Edit prices & options →</button>}
      <div className={styles.sectionHistoryActions}>{(onUndo || onRedo) && <div className={styles.historyActions} aria-label="Draft history">
          <button data-owner-button type="button" className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={saveBusy || uploadBusy || !canUndo} onClick={onUndo} title="Undo draft edit (Ctrl/Cmd+Z)" aria-keyshortcuts="Control+Z Meta+Z">Undo</button>
          <button data-owner-button type="button" className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={saveBusy || uploadBusy || !canRedo} onClick={onRedo} title="Redo draft edit (Ctrl/Cmd+Shift+Z)" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z">Redo</button>
        </div>}
      <button type="button" className={styles.addSection} {...panelOpener("sections")} onClick={event => choose("sections", event?.currentTarget, true)}>＋ Add a section</button></div>
    </div>}
    {!browsing && canvasBoxes.length > 0 && <div className={styles.boxPicker}><OwnerSelect label="Select a content box" placeholder="Choose text, a photo or a section…" value={canvasBoxes.some(box => box.target === selected && box.occurrence === selectedOccurrence) ? `${selected}#${selectedOccurrence}` : ""} options={canvasBoxes} onChange={value => { if (uploadBusy) return; const box = canvasBoxes.find(box => box.value === value); if (!box) return; const node = canvasRef.current && findCanvasBoxTarget(canvasRef.current, box.target, box.occurrence); choose(box.target, node ?? undefined); setSelectedOccurrence(box.occurrence); node?.scrollIntoView({ block: "nearest", behavior: "auto" }); }} /><span>Registered content boxes, including template headings. Repeated labels share their appearance.</span></div>}
    {!browsing && <OwnerHeaderEditor content={content} onEdit={onEdit} open={navigationOpen} onOpenChange={changeNavigationOpen} disabled={uploadBusy} />}
    <div className={styles.stage} data-device={device}>
      <div ref={canvasRef} className={`${styles.canvas} ${!browsing ? styles.editing : ""}`} onPointerDownCapture={() => { dragClickGuard.current = false; }} onClickCapture={capture} onKeyDownCapture={capture} onDragStartCapture={beginBlockDrag} onDragOver={overBlock} onDrop={dropBlock} onDragEnd={endBlockDrag}>
        <SiteContentFrame content={content} page={page} mode="editor" editable={!browsing} onEditCommissionForm={onEditCommissionForm} onNavigate={target => { if (!uploadBusy) { closePanel(); onPageChange(target); } }} />
        {!browsing && selected && (imageStyleKey || imageBlock) && (imageStyleKey === "site.logo" || imageEditMode === "photo") && <OwnerCanvasImageTools key={`${page.id}:${selected}:${selectedOccurrence}`} canvasRef={canvasRef} renderVersion={content} target={selected} occurrence={selectedOccurrence} value={selectedImageAppearance} disabled={uploadBusy} onChange={changeImageAppearance} />}
        {!browsing && selected && (boxStyleKey || selected === "page-title" || boxEditableBlock) && (!(imageBlock || imageBoxEditable) || imageEditMode === "box") && <OwnerCanvasBoxTools key={`${page.id}:${selected}:${selectedOccurrence}`} canvasRef={canvasRef} renderVersion={content} target={selected} occurrence={selectedOccurrence} value={boxAppearance} disabled={uploadBusy} initialAspectLocked={initialBoxLocked} onInitialAspectLockChange={setInitialBoxLocked} onChange={changeBoxAppearance} onEditContent={() => setInspectorOpen(true)} sectionOrder={block ? { index: page.blocks.findIndex(item => item.id === block.id), count: page.blocks.length, onMove: direction => { if (uploadBusy) return; editPage(target => move(target.blocks, block.id, direction)); setAnnouncement("Section order updated in your draft."); } } : undefined} />}
      </div>
      {!browsing && selected && inspectorOpen && controls && <aside id={panelId} ref={panelRef} className={styles.panel} style={movable.style} data-moving={movable.moving} aria-label={selectedTitle} onKeyDown={event => { if (event.key === "Escape" && !event.nativeEvent?.isComposing) { event.preventDefault(); closePanel(); } }}>
        <div className={styles.panelHeader} {...movable.handleProps}><div><span>{selected === "design" ? "APPLIES ACROSS YOUR WEBSITE" : selected === "site" ? "HEADER, FOOTER & BRANDING" : "EDITING YOUR DRAFT"}</span><h2>{selectedTitle}</h2></div><button type="button" aria-label="Close section editor" disabled={uploadBusy} onClick={closePanel}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
        <div className={styles.panelNav}><button type="button" aria-pressed={selected === "page-content"} disabled={uploadBusy} onClick={() => choose("page-content")}>Page content</button><button type="button" aria-pressed={selected === "design"} disabled={uploadBusy} onClick={() => choose("design")}>Design</button><button type="button" aria-pressed={selected === "site"} disabled={uploadBusy} onClick={() => choose("site")}>Header & footer</button></div><div className={styles.panelContent} data-owner-fields>{controls}</div>
        <div className={styles.panelFooter}><span>{uploadBusy ? "Finish or cancel your upload before closing." : "Changes appear on your page as you type."}</span><button type="button" className={ui.primary} disabled={uploadBusy} onClick={closePanel}>Done</button></div>
      </aside>}
    </div>
    <p className={styles.srOnly} role="status" aria-live="polite">{announcement}</p>
    <div className={styles.canvasFooter}><span>Only you can see this draft.</span>{!browsing && <button type="button" {...panelOpener("sections")} onClick={event => choose("sections", event?.currentTarget, true)}>＋ Add a section to {page.title}</button>}</div>
  </section>;
}
