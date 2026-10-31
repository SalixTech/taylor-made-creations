"use client";
import { useCanvasSceneNode, canvasNodeAttributes } from "./CanvasSceneContext";
import {CanvasScene,type CanvasMarker,type ForceCanvasSlot} from "./CanvasScene";
import { PhotoLoading } from "./PhotoLoading";

import {LayoutAppearance} from "./LayoutAppearance";
import { GeometryBox } from "./GeometryBox";
import { resolveElementAppearance } from "@/owner/appearance";
import { validElementBox } from "@/owner/box-geometry";
import CommissionForm from "./CommissionForm";
import { Dialog as OwnerDialog } from "@/owner/OwnerDialog";
import Image from "next/image";
import Link from "next/link";
import { createContext, useContext, useState, type ReactElement, type ReactNode, type CSSProperties } from "react";
import { useFursuitGalleryView } from "@/components/FursuitGallery";
import { PremadeGallery } from "@/components/PremadeGallery";
import { useOwnerMediaSource } from "@/owner/media-client";
import { parseInlineLinks, templateSupportsInlineLinks } from "@/owner/inline-links";
import { getOwnerSocialLinks } from "@/owner/social-links";
import { Brand, SpadeMark } from "@/components/Brand";
import { PremadeTags, PremadePurchaseInfo, PremadeListingLink } from "./PremadeProduct";
import { premadeHref, thirdPartyListingUrl } from "./storefront-model";
import { SiteFontLoader } from "./SiteFontLoader";
import { CopyrightRange } from "./Copyright";
import termStyles from "@/components/Terms.module.css";
import { isSafeImageSource, type OwnerContent, type OwnerPage, type PageBlock } from "@/owner/model";
import { useNavigationDisclosure } from "./use-navigation-disclosure";
import { DropdownChevron } from "./DropdownChevron";
import { getHeaderNavigation } from "@/owner/header-navigation";
import { getPreviewPage, OWNER_PREVIEW_ROOT, resolveSiteDestination } from "@/owner/preview-model";
import styles from "@/owner/OwnerSitePreview.module.css";
import { getTemplateText, getTemplateImage, getTemplateLink, getSiteThemeStyle, getSiteThemeAttributes, resolveSiteDesign, getElementAppearanceStyle, getElementAppearanceAttributes, getImageAppearanceStyle, getImageFrameStyle, type ElementAppearance } from "@/owner/site-design";

import {useMobileSiteLayout} from "@/owner/use-mobile-site-layout";

export type SiteRenderMode = "public" | "private-preview" | "editor";
type RenderOptions = { forceCanvasSlots?:ForceCanvasSlot; onEditCommissionForm?: () => void; mode: SiteRenderMode; mobileLayout?: boolean; editable?: boolean; onNavigate?: (page: OwnerPage) => void };
const RenderContext = createContext<RenderOptions>({ mode: "private-preview" });
/** Adds no DOM when uncustomized; semantic targets keep outer cards separate
 * from nested copy, and the same saved appearance renders in public mode. */
function CanvasTarget({content,styleKey,children,inline=false,image=false}: {content:OwnerContent;styleKey:string;children:ReactElement;inline?:boolean;image?:boolean}) {
  const {mode,editable,mobileLayout}=useContext(RenderContext),appearance=resolveElementAppearance(content.contentOverrides?.styles?.[styleKey],!!mobileLayout),target=`canvas:${styleKey}`;
  return <LayoutAppearance appearance={appearance} inline={inline} image={image} target={target} editable={mode==="editor"&&editable}>{children}</LayoutAppearance>;
}
function useDestination(content: OwnerContent, href: string) {
  const { mode } = useContext(RenderContext);
  return resolveSiteDestination(content, href, mode === "public" ? "public" : "preview");
}
function ContentLink({ content, href, children, className, editTarget, appearance: rawAppearance, navPageId }: { content: OwnerContent; href: string; children: ReactNode; className?: string; editTarget?: string; appearance?: ElementAppearance; navPageId?: string }) {
  const { mode, onNavigate, editable, mobileLayout } = useContext(RenderContext);
  const appearance=resolveElementAppearance(rawAppearance,!!mobileLayout);
  const edit = { "data-owner-nav-page": mode === "editor" && editable ? navPageId : undefined, ...(editTarget ? editorTarget(mode === "editor" && editable && !validElementBox(appearance?.box), editTarget, "link label and destination") : {}), ...appearanceProps(appearance) };
  const destination = useDestination(content, href);
  const wrapped = (element: ReactNode) => <GeometryBox inline={editTarget !== "template-link:home.pricesCard" && editTarget !== "template-link:home.careCard"} appearance={appearance} box={appearance?.box} target={editTarget} editable={mode === "editor" && editable}>{element}</GeometryBox>;
  if (!destination) return mode === "public" ? null : wrapped(<span className={styles.muted} {...edit}>{children} <small>(destination unavailable)</small></span>);
  if (destination.kind !== "page") return wrapped(<a {...edit} href={destination.href} className={className} download={destination.kind === "download" || undefined} target={destination.kind === "external" && destination.href.startsWith("https:") ? "_blank" : undefined} rel={destination.kind === "external" ? "noopener noreferrer" : undefined}>{children}</a>);
  return wrapped(<Link {...edit} href={destination.href} className={className} onClick={event => {
    if (mode !== "editor") return;
    event.preventDefault();
    const url = new URL(destination.href, "https://preview.invalid");
    const slug = url.pathname.replace(/^\/taylor\/preview\/?/, "");
    const target = getPreviewPage(content, slug ? [decodeURIComponent(slug)] : []);
    if (target) onNavigate?.(target);
  }}>{children}</Link>);
}

function InlineLinkedText({ content, text }: { content: OwnerContent; text: string }) {
  return <>{parseInlineLinks(text).map((part, index) => part.href ? <ContentLink key={index} content={content} href={part.href} className="inline-content-link">{part.text}</ContentLink> : part.text)}</>;
}

const money = (value: number) => `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function editorTarget(editable: boolean | undefined, target: string, label: string) {
  return editable ? { "data-owner-edit": target, tabIndex: 0, "aria-label": `Edit ${label}` } : {};
}

function appearanceProps(appearance?: ElementAppearance) {
  const visual=validElementBox(appearance?.box)?{...appearance,widthPercent:undefined,heightPercent:undefined}:appearance;
  return { ...getElementAppearanceAttributes(visual), style: getElementAppearanceStyle(visual) };
}

function TemplateText({ content, field, variables }: { content: OwnerContent; field: string; variables?: Record<string, string> }) {
  const { mode, editable, mobileLayout } = useContext(RenderContext);
  const appearance = resolveElementAppearance(content.contentOverrides?.styles?.[field],!!mobileLayout), target = `template-text:${field}`;
  const text = templateSupportsInlineLinks(field) ? <InlineLinkedText content={content} text={getTemplateText(content, field, variables)} /> : getTemplateText(content, field, variables);
  return <GeometryBox inline appearance={appearance} box={appearance?.box} target={target} editable={mode === "editor" && editable}><span {...editorTarget(mode === "editor" && editable && !validElementBox(appearance?.box), target, "page text")} {...appearanceProps(appearance)}>{text}</span></GeometryBox>;
}
function TemplateLink({ content, field, className = "text-link", children }: { content: OwnerContent; field: string; className?: string; children?: ReactNode }) {
  const link = getTemplateLink(content, field);
  return <ContentLink content={content} href={link.href} className={className} editTarget={`template-link:${field}`} appearance={content.contentOverrides?.styles?.[field]}>{children ?? link.label}</ContentLink>;
}
function CoreText({ content, styleKey, children }: { content: OwnerContent; styleKey: string; children: ReactNode }) {
  const { mode, editable, mobileLayout } = useContext(RenderContext), appearance = resolveElementAppearance(content.contentOverrides?.styles?.[styleKey],!!mobileLayout);
  return <GeometryBox inline appearance={appearance} box={appearance?.box} target={`core-text:${styleKey}`} editable={mode === "editor" && editable}><span {...editorTarget(mode === "editor" && editable && !validElementBox(appearance?.box), `core-text:${styleKey}`, "text box")} {...appearanceProps(appearance)}>{children}</span></GeometryBox>;
}
function TemplateImage({ content, field }: { content: OwnerContent; field: string }) {
  const { mode, editable, mobileLayout } = useContext(RenderContext);
  const photo = getTemplateImage(content, field);
  const appearance = resolveElementAppearance(content.contentOverrides?.styles?.[field],!!mobileLayout);
  return <GeometryBox contentMode="image" appearance={appearance} box={appearance?.box} target={`template-image:${field}`} editable={mode === "editor" && editable}><div {...editorTarget(mode === "editor" && editable && !validElementBox(appearance?.box), `template-image:${field}`, "template image")}><PreviewImage key={photo.src} src={photo.src} alt={photo.alt} appearance={appearance} /></div></GeometryBox>;
}

type IntroProps={ content: OwnerContent; page: OwnerPage; eyebrow: ReactNode; title: string; children?: ReactNode; editTarget?: string };
function Intro(props:IntroProps){return buildIntro(props,useContext(RenderContext));}
function buildIntro({content,page,eyebrow,title,children,editTarget="page"}:IntroProps,{mode,editable,mobileLayout}:RenderOptions){
  const appearance = resolveElementAppearance(page.titleAppearance ?? content.contentOverrides?.styles?.[`${page.builtinKey}.title`],!!mobileLayout);
  const boxed = validElementBox(appearance?.box);
  const titleAppearance = boxed ? { ...appearance, widthPercent: undefined, heightPercent: undefined } : appearance;
  return <CanvasTarget content={content} styleKey={`layout.page:${page.id}:intro`}><div className="page-intro" data-owner-content-editor={editTarget}><p className="eyebrow">{eyebrow}</p><h1 {...appearanceProps(titleAppearance)}><GeometryBox inline appearance={appearance} box={appearance?.box} target="page-title" editable={mode === "editor" && editable}><span {...editorTarget(mode === "editor" && editable && !boxed, "page-title", "page title")}>{title}</span></GeometryBox></h1>{children && <div className="intro-copy">{children}</div>}</div></CanvasTarget>;
}

function PreviewImage({ src, alt, hero = false, imageStyle, appearance, layoutAppearance = true }: { src: string; alt: string; hero?: boolean; imageStyle?: CSSProperties; appearance?: ElementAppearance; layoutAppearance?: boolean }) {
  const { mode } = useContext(RenderContext);
  const [failed, setFailed] = useState(false);
  const media = useOwnerMediaSource(src, mode !== "public");
  if (!isSafeImageSource(src) || failed || media.error) return <div className={styles.unavailable} role="status">This photo could not be displayed. {alt}</div>;
  if (!media.src) return <div className={styles.unavailable} role="status"><PhotoLoading /></div>;
  const imageAppearance = appearance && (!layoutAppearance||validElementBox(appearance.box)) ? { ...appearance, widthPercent: undefined, heightPercent: undefined } : appearance;
  return <div data-owner-image-frame className={`${styles.image} ${hero ? styles.hero : ""}`} {...appearanceProps(imageAppearance)} style={{ ...getElementAppearanceStyle(imageAppearance), ...getImageFrameStyle(appearance) }}>
    <Image src={media.src} alt={alt} fill unoptimized loading={hero ? "eager" : "lazy"} fetchPriority={hero ? "high" : undefined} style={{ ...imageStyle, ...getImageAppearanceStyle(appearance) }} sizes={hero ? "(max-width:1140px) 95vw, 1084px" : "(max-width:650px) 94vw, 700px"} onError={() => setFailed(true)} />
  </div>;
}


/** Empty authored rectangle: its geometry is independent of content and remains a legal parent. */
function CanvasSpaceSurface({target,widthPx,heightPx,box,style,editable,...rest}:{target:string;widthPx:number;heightPx:number;box?:import("@/owner/box-geometry").ElementBox;style:CSSProperties;editable:boolean}) {
  const scene=useCanvasSceneNode(target),placement=scene?.placement;
  return <div {...rest} {...(!box&&!placement?canvasNodeAttributes(scene):{})} data-owner-edit={editable&&!box&&!placement?target:undefined} data-owner-canvas-space="true" aria-hidden={editable?undefined:true} style={{...style,width:placement?"100%":box?"100%":widthPx,height:placement?.heightPx??box?.heightPx??heightPx,position:"relative",minWidth:0}}/>;
}
type BlocksProps={blocks:readonly PageBlock[];content:OwnerContent;presentation?:"terms"|"care"};
export function ContentBlocks(props:BlocksProps){return buildContentBlocks(props,useContext(RenderContext));}
function buildContentBlocks({blocks,content,presentation}:BlocksProps,{mode,editable,mobileLayout}:RenderOptions){
  const pageId=content.pages.find(page=>page.blocks===blocks)?.id ?? content.pages.find(page=>blocks.length>0&&page.blocks.some(block=>block===blocks[0]))?.id;
  const ordered=blocks.map((block,index)=>({block,index})).sort((a,b)=>(mobileLayout?(a.block.mobileOrder??a.index)-(b.block.mobileOrder??b.index):a.index-b.index)||a.index-b.index);
  const parent=(block:PageBlock)=>mobileLayout&&block.mobileParentId!==undefined?block.mobileParentId:block.parentId??null;
  const child=(block:PageBlock,part:string,node:ReactElement,image=false)=><CanvasTarget content={content} styleKey={`layout.block:${pageId}:${block.id}:${part}`} inline={node.type==="span"||node.type==="strong"} image={image}>{node}</CanvasTarget>;
  const render=(parentId:string|null,ancestors:ReadonlySet<string>=new Set()):ReactNode=>ordered.filter(({block})=>parent(block)===parentId).map(({block})=>{
    if(ancestors.has(block.id))return null;
    const appearance=resolveElementAppearance(block.appearance,!!mobileLayout),boxed=validElementBox(appearance?.box);
    const visual=boxed?{...appearance,widthPercent:undefined,heightPercent:undefined}:appearance;
    const edit={...editorTarget(mode==="editor"&&editable&&!boxed,`block:${block.id}`,`${block.type} block`),...appearanceProps(visual)};
    const element=(()=>{
      if(block.type==="section")return <section {...edit} className={styles.block} data-owner-section-frame={block.id}>{block.heading&&child(block,"heading",<h2>{block.heading}</h2>)}<div data-owner-section-id={mode==="editor"&&editable?block.id:undefined} style={{minHeight:mode==="editor"&&editable?64:undefined}}>{render(block.id,new Set([...ancestors,block.id]))}</div></section>;
      if(block.type==="heading")return block.level===3?<h3 {...edit} id={`block-${block.id}`} className={styles.block}>{block.text}</h3>:<h2 {...edit} id={`block-${block.id}`} className={styles.block}>{block.text}</h2>;
      if(block.type==="divider")return <hr data-site-section-divider="true" {...edit} className={styles.divider}/>;
      if(block.type==="canvas-space")return <CanvasSpaceSurface target={`block:${block.id}`} widthPx={block.widthPx} heightPx={block.heightPx} box={appearance?.box} style={getElementAppearanceStyle(visual)} editable={mode==="editor"&&!!editable}/>;
      if(block.type==="spacer")return <div {...edit} aria-hidden={mode==="editor"&&editable?undefined:true} style={{...getElementAppearanceStyle(visual),height:block.size==="small"?16:block.size==="large"?64:32}}/>;
      if(block.type==="list"){const List=block.style==="numbered"?"ol":"ul";return <List {...edit} className={styles.contentList}>{block.items.map((item,index)=><li key={index}><CanvasTarget inline content={content} styleKey={`layout.block:${pageId}:${block.id}:list-${index}`}><span>{item}</span></CanvasTarget></li>)}</List>;}
      if(block.type==="faq")return <section {...edit} className={styles.faq}>{block.items.map(item=><details key={item.id} open={mode==="editor"&&editable?true:undefined}><summary onClick={mode==="editor"&&editable?event=>event.preventDefault():undefined}>{child(block,`faq-${item.id}-question`,<span>{item.question}</span>)}</summary>{child(block,`faq-${item.id}-answer`,<p><InlineLinkedText content={content} text={item.answer}/></p>)}</details>)}</section>;
      if(block.type==="feature")return <section {...edit} className={`${styles.feature} ${block.imageSide==="right"?styles.imageRight:""}`}>{child(block,"photo",<div><PreviewImage key={block.src} src={block.src} alt={block.alt} appearance={appearance} layoutAppearance={false}/></div>,true)}<div>{block.heading&&child(block,"heading",<h2>{block.heading}</h2>)}{child(block,"body",<p><InlineLinkedText content={content} text={block.body}/></p>)}</div></section>;
      if(block.type==="text"&&presentation==="terms"){
        if(block.id==="terms-agreement")return <p {...edit} className={termStyles.agreement}><InlineLinkedText content={content} text={block.body}/></p>;
        return <section {...edit} id={`block-${block.id}`} className={termStyles.section}>{block.heading&&child(block,"heading",<h2>{block.heading}</h2>)}{block.body&&child(block,"body",<ul>{block.body.split(/\n\s*\n/).map((paragraph,index)=><li key={index}><InlineLinkedText content={content} text={paragraph}/></li>)}</ul>)}</section>;
      }
      if(block.type==="text"&&presentation==="care")return <section {...edit} id={`block-${block.id}`} className={styles.careBlock}>{block.heading&&child(block,"heading",<h2>{block.heading}</h2>)}{child(block,"body",<div>{block.body.split(/\n\s*\n/).filter(Boolean).map((paragraph,index)=><p key={index}><InlineLinkedText content={content} text={paragraph}/></p>)}</div>)}</section>;
      if(block.type==="text")return <section {...edit} id={`block-${block.id}`} className={styles.block}>{block.heading&&child(block,"heading",<h2>{block.heading}</h2>)}{block.body&&child(block,"body",<p><InlineLinkedText content={content} text={block.body}/></p>)}</section>;
      if(block.type==="image")return <figure {...edit} className={styles.block}>{child(block,"photo",<div><PreviewImage key={block.src} src={block.src} alt={block.alt} appearance={appearance} layoutAppearance={false}/></div>,true)}{block.caption&&child(block,"caption",<figcaption><InlineLinkedText content={content} text={block.caption}/></figcaption>)}</figure>;
      if(block.type==="link")return <div {...edit} className={styles.block}><ContentLink content={content} href={block.href} className="text-link" editTarget={`canvas:layout.block:${pageId}:${block.id}:link`} appearance={content.contentOverrides?.styles?.[`layout.block:${pageId}:${block.id}:link`]}>{block.label} →</ContentLink></div>;
      return null;
    })();
    return <GeometryBox key={block.id} appearance={appearance} box={appearance?.box} target={`block:${block.id}`} editable={mode==="editor"&&editable}>{element}</GeometryBox>;
  });
  return <div className={presentation?styles.structuredBlocks:styles.blocks} data-owner-section-id={mode==="editor"&&editable?"__root":undefined}>{render(null)}</div>;
}

function HomePreview({content,page}:{content:OwnerContent;page:OwnerPage}) {
  const {home}=content,{mode,editable,mobileLayout}=useContext(RenderContext),photoCredit=getTemplateText(content,"home.photoCredit");
  const imageAppearance=resolveElementAppearance(content.contentOverrides?.styles?.["home.image"],!!mobileLayout);
  return <PageScene content={content} page={page}><>
    <CanvasTarget content={content} styleKey="layout.home.intro"><section className="home-intro"><p className="eyebrow"><CoreText content={content} styleKey="home.eyebrow">{home.eyebrow}</CoreText></p><h1><span className="original-style-title"><CoreText content={content} styleKey="home.title">{home.title}</CoreText></span></h1><p><CoreText content={content} styleKey="home.description"><InlineLinkedText content={content} text={home.description}/></CoreText></p><CanvasTarget content={content} styleKey="layout.home.actions"><div className="actions"><TemplateLink content={content} field="home.galleryButton" className="button"/><TemplateLink content={content} field="home.pricesButton"/></div></CanvasTarget></section></CanvasTarget>
    <GeometryBox contentMode="image" appearance={imageAppearance} box={imageAppearance?.box} target="home-image" editable={mode==="editor"&&editable}><section className="home-art" aria-label={`${content.site.name} fursuit collage`} {...editorTarget(mode==="editor"&&editable&&!validElementBox(imageAppearance?.box),"home-image","home page photo and caption")}><PreviewImage key={home.image.src} src={home.image.src} alt={home.image.alt} hero appearance={imageAppearance}/>{(home.caption.trim()||photoCredit.trim())&&<div className="image-caption">{home.caption.trim()&&<CoreText content={content} styleKey="home.caption"><InlineLinkedText content={content} text={home.caption}/></CoreText>}{photoCredit.trim()&&<span className="image-caption-credit"><TemplateText content={content} field="home.photoCredit"/></span>}</div>}</section></GeometryBox>
    <CanvasTarget content={content} styleKey="layout.home.commissionStrip"><section className="commission-strip"><div><p className="eyebrow"><TemplateText content={content} field="home.stripEyebrow"/></p><h2><TemplateText content={content} field="home.stripTitle"/></h2><p><TemplateText content={content} field="home.stripBody"/></p></div><TemplateLink content={content} field="home.commissionsButton" className="button outline"/></section></CanvasTarget>
    <CanvasTarget content={content} styleKey="layout.home.linkCards"><section className="home-links"><TemplateLink content={content} field="home.pricesCard" className=""><span><TemplateText content={content} field="home.pricesEyebrow"/></span><CanvasTarget content={content} styleKey="layout.home.pricesCardTitle"><h3>{getTemplateLink(content,"home.pricesCard").label}</h3></CanvasTarget><p><TemplateText content={content} field="home.pricesBody"/></p></TemplateLink><TemplateLink content={content} field="home.careCard" className=""><span><TemplateText content={content} field="home.careEyebrow"/></span><CanvasTarget content={content} styleKey="layout.home.careCardTitle"><h3>{getTemplateLink(content,"home.careCard").label}</h3></CanvasTarget><p><TemplateText content={content} field="home.careBody"/></p></TemplateLink></section></CanvasTarget>
    {(page.blocks.length>0||mode==="editor"&&editable)&&<div className="page-shell home-extra-content" style={{minHeight:page.blocks.length?0:32,paddingBottom:page.blocks.length?undefined:0}}><ContentBlocks blocks={page.blocks} content={content}/></div>}
  </></PageScene>;
}
function PricesPreview({content,page}:{content:OwnerContent;page:OwnerPage}) {
  const examplesPage=content.pages.find(item=>item.builtinKey==="examples"&&!item.trashedAt);
  return <PageScene content={content} page={page}><CanvasTarget content={content} styleKey={`layout.page:${page.id}:shell`}><div className="page-shell"><Intro content={content} page={page} eyebrow={<TemplateText content={content} field="prices.eyebrow"/>} title={page.title} editTarget="prices"><p><CoreText content={content} styleKey="prices.intro"><InlineLinkedText content={content} text={content.prices.intro}/></CoreText></p></Intro>
    <CanvasTarget content={content} styleKey="layout.prices.grid"><div className="price-grid">{content.prices.groups.map((group,index)=><CanvasTarget key={group.id} content={content} styleKey={`layout.price-group:${group.id}`}><section className="price-card"><CanvasTarget inline content={content} styleKey={`layout.price-group:${group.id}:number`}><span className="eyebrow">{String(index+1).padStart(2,"0")}</span></CanvasTarget><CanvasTarget content={content} styleKey={`layout.price-group:${group.id}:title`}><h2>{group.title}</h2></CanvasTarget><CanvasTarget content={content} styleKey={`layout.price-group:${group.id}:note`}><p>{group.note}</p></CanvasTarget>
      {examplesPage&&<ContentLink content={content} className="text-link example-link" href={`/${examplesPage.slug}#${encodeURIComponent(group.title.toLowerCase())}`} editTarget={`canvas:layout.price-group:${group.id}:examples`} appearance={content.contentOverrides?.styles?.[`layout.price-group:${group.id}:examples`]}><TemplateText content={content} field="prices.exampleLabel" variables={{category:group.title.toLowerCase()}}/></ContentLink>}
      {group.items.map(item=><CanvasTarget key={item.id} content={content} styleKey={`layout.price-item:${item.id}`}><div className="price-item"><div><CanvasTarget content={content} styleKey={`layout.price-item:${item.id}:name`}><h3>{item.name}</h3></CanvasTarget><CanvasTarget content={content} styleKey={`layout.price-item:${item.id}:detail`}><p>{item.detail}</p></CanvasTarget></div><CanvasTarget inline content={content} styleKey={`layout.price-item:${item.id}:amount`}><strong>{money(item.price)}<small><TemplateText content={content} field="prices.startingAt"/></small></strong></CanvasTarget></div></CanvasTarget>)}
    </section></CanvasTarget>)}</div></CanvasTarget>
    <div className="two-columns">{([['parts',content.prices.parts],['extras',content.prices.extras]] as const).map(([title,items])=><CanvasTarget key={title} content={content} styleKey={`layout.prices.${title}`}><section><h2><TemplateText content={content} field={`prices.${title}Title`}/></h2><dl className="price-list">{items.map(item=><CanvasTarget key={item.id} content={content} styleKey={`layout.price-${title}:${item.id}`}><div><dt><CanvasTarget inline content={content} styleKey={`layout.price-${title}:${item.id}:name`}><span>{item.name}</span></CanvasTarget></dt><dd><CanvasTarget inline content={content} styleKey={`layout.price-${title}:${item.id}:amount`}><span>{money(item.price)}{title==="parts"?"+":""}</span></CanvasTarget></dd></div></CanvasTarget>)}</dl></section></CanvasTarget>)}</div>
    <ContentBlocks blocks={page.blocks} content={content}/><CanvasTarget content={content} styleKey="layout.prices.end"><div className="end-note"><h2><TemplateText content={content} field="prices.endTitle"/></h2><p><TemplateText content={content} field="prices.endBody"/></p><TemplateLink content={content} field="prices.commissionsButton" className="button"/></div></CanvasTarget>
  </div></CanvasTarget></PageScene>;
}

function GalleryPreview({ content, page }: { content: OwnerContent; page: OwnerPage }) {
  const { mode, editable } = useContext(RenderContext);
  const photos = content.gallery.filter(photo => ((mode === "editor" && editable) || photo.visible) && isSafeImageSource(photo.src));
  const galleryView=useFursuitGalleryView({photos,unoptimized:true,privateMedia:mode!=="public",editor:mode==="editor"&&editable,decorate:(photo,part,element)=><CanvasTarget key={`${photo.id}-${part}`} content={content} styleKey={`layout.gallery:${photo.id}${part==="card"?"":`:${part}`}`} image={part==="photo"}>{element}</CanvasTarget>});
  return <PageScene content={content} page={page}><CanvasTarget content={content} styleKey={`layout.page:${page.id}:shell`}><div className="page-shell"><Intro content={content} page={page} eyebrow={<TemplateText content={content} field="gallery.eyebrow" />} title={page.title}><p><TemplateText content={content} field="gallery.intro" /></p></Intro>
    <CanvasTarget content={content} styleKey="layout.gallery.grid"><div>{photos.length ? galleryView : null}</div></CanvasTarget>{!photos.length && <div className="empty-state"><h2><TemplateText content={content} field="gallery.emptyTitle" /></h2><p><TemplateText content={content} field="gallery.emptyBody" /></p></div>}
    <ContentBlocks blocks={page.blocks} content={content} />
    <CanvasTarget content={content} styleKey="layout.gallery.end"><div className="end-note"><h2><TemplateText content={content} field="gallery.endTitle" /></h2><TemplateLink content={content} field="gallery.commissionsButton" /></div></CanvasTarget>
  </div></CanvasTarget></PageScene>;
}

function CommissionsPreview({ content, page }: { content: OwnerContent; page: OwnerPage }) {
  const { mode, editable, onEditCommissionForm } = useContext(RenderContext);
  const [formOpen, setFormOpen] = useState(false);
  const formAction = (field: "commissions.requestButton" | "commissions.formButton", className: string) => <CanvasTarget content={content} styleKey={`layout.${field}`}>{mode === "editor" ? <button type="button" className={className} onClick={() => setFormOpen(true)}><TemplateText content={content} field={field} /></button> : <Link className={className} href={`${mode === "public" ? "" : OWNER_PREVIEW_ROOT}/${encodeURIComponent(page.slug)}/request`}><TemplateText content={content} field={field} /></Link>}</CanvasTarget>;
  return <PageScene content={content} page={page}><CanvasTarget content={content} styleKey={`layout.page:${page.id}:shell`}><div className="page-shell"><Intro content={content} page={page} eyebrow={<TemplateText content={content} field="commissions.eyebrow" />} title={page.title}><p><TemplateText content={content} field="commissions.intro" /></p></Intro>
    <CanvasTarget content={content} styleKey="layout.commissions.status"><section className="status-panel" aria-labelledby="owner-preview-status-label" {...editorTarget(mode === "editor" && editable, "status", "commission status")}><div className="status-summary"><span id="owner-preview-status-label" className="status-label"><TemplateText content={content} field="commissions.statusLabel" /></span><CanvasTarget content={content} styleKey="layout.commissions.statusValue"><h2 className={content.site.commissionStatus === "Closed" ? "status-closed" : content.site.commissionStatus === "Waitlist" ? styles.waitlist : "status-available"}>{content.site.commissionStatus}</h2></CanvasTarget></div><CanvasTarget content={content} styleKey="layout.commissions.statusNote"><p className="status-copy"><InlineLinkedText content={content} text={content.site.statusNote} /></p></CanvasTarget>
      {content.site.commissionStatus === "Open!" && formAction("commissions.requestButton", "button status-action")}
    </section></CanvasTarget>
    <CanvasTarget content={content} styleKey="layout.commissions.columns"><div className="two-columns"><CanvasTarget content={content} styleKey="layout.commissions.steps"><section><h2><TemplateText content={content} field="commissions.stepsTitle" /></h2><ol className="steps"><li><CanvasTarget content={content} styleKey="layout.commissions.step1"><div><h3><TemplateText content={content} field="commissions.stepOneTitle" /></h3><p><TemplateText content={content} field="commissions.stepOneBody" /></p></div></CanvasTarget></li><li><CanvasTarget content={content} styleKey="layout.commissions.step2"><div><h3><TemplateText content={content} field="commissions.stepTwoTitle" /></h3><p><TemplateText content={content} field="commissions.stepTwoBody" /></p><TemplateLink content={content} field="commissions.pricesLink" /></div></CanvasTarget></li><li><CanvasTarget content={content} styleKey="layout.commissions.step3"><div><h3><TemplateText content={content} field="commissions.stepThreeTitle" /></h3><p><TemplateText content={content} field="commissions.stepThreeBody" /></p><TemplateLink content={content} field="commissions.termsLink" /></div></CanvasTarget></li></ol></section></CanvasTarget>
      <CanvasTarget content={content} styleKey="layout.commissions.form"><section className="form-preview">{mode !== "public" && (onEditCommissionForm ? <button type="button" className="button outline" onClick={onEditCommissionForm}>Edit commission form</button> : mode === "private-preview" ? <Link className="button outline" href="/taylor/commission-form">Edit commission form</Link> : null)}<span className="eyebrow"><TemplateText content={content} field="commissions.formEyebrow" /></span><h2><TemplateText content={content} field="commissions.formTitle" /></h2><p><TemplateText content={content} field="commissions.formBody" /></p>{formAction("commissions.formButton", "button")}</section></CanvasTarget></div></CanvasTarget>
    {formOpen && <OwnerDialog title="Commission form preview" wide maximizable onClose={() => setFormOpen(false)} actions={<button type="button" className="button" onClick={() => setFormOpen(false)}>Close preview</button>}><CommissionForm previewContent={content} additionalPartsQuantities={content.site.additionalPartsQuantities === true} configuration={content.commissionForm ?? {}} /></OwnerDialog>}
    <ContentBlocks blocks={page.blocks} content={content} />
  </div></CanvasTarget></PageScene>;
}

function PremadesPreview({ content, page }: { content: OwnerContent; page: OwnerPage }) {
  const { mode, editable } = useContext(RenderContext);
  const listings = mode === "editor" && editable ? content.premades : content.site.showPremades ? content.premades.filter(item => item.visible && !item.isDraft) : [];
  return <PageScene content={content} page={page}><CanvasTarget content={content} styleKey={`layout.page:${page.id}:shell`}><div className="page-shell"><Intro content={content} page={page} eyebrow={<TemplateText content={content} field="premades.eyebrow" />} title={page.title}><p><TemplateText content={content} field="premades.intro" /></p></Intro>
    {mode === "editor" && editable && !content.site.showPremades && <p className={styles.editorNotice}>Premades are hidden from the public site. You can still edit your listings here.</p>}
    {content.site.catalogMode && <p className="storefront-notice">Catalog mode · Select an item for details and where to purchase. Listings do not guarantee current availability.</p>}
    {listings.some(item => item.soldChannel === "con") && <p className="storefront-notice">Convention listings are a catalog and do not necessarily reflect current availability. Confirm at the booth.</p>}
    {listings.length ? <CanvasTarget content={content} styleKey="layout.premades.grid"><div className="gallery-grid">{listings.map(item => <CanvasTarget key={item.id} content={content} styleKey={`layout.premade:${item.id}`}><article className={styles.listing} {...editorTarget(mode === "editor" && editable, `premade:${item.id}`, `${item.name} premade`)}>
      {mode === "editor" && editable && !item.visible && <p className={styles.editorNotice}>Hidden listing · only visible while editing</p>}
      <CanvasTarget content={content} image styleKey={`layout.premade:${item.id}:photo`}><div><PremadeGallery key={`${item.id}-${item.coverPhotoId ?? item.image}`} item={item} mode={mode} listingHref={mode === "public" ? (!content.site.catalogMode && thirdPartyListingUrl(item)) || premadeHref(page, item) : undefined} external={mode === "public" && !content.site.catalogMode && Boolean(thirdPartyListingUrl(item))} /></div></CanvasTarget><CanvasTarget content={content} styleKey={`layout.premade:${item.id}:tags`}><div><PremadeTags item={item} /></div></CanvasTarget><CanvasTarget content={content} styleKey={`layout.premade:${item.id}:title`}><h2>{mode === "public" ? <PremadeListingLink content={content} page={page} item={item}>{item.name}</PremadeListingLink> : item.name}</h2></CanvasTarget><CanvasTarget content={content} styleKey={`layout.premade:${item.id}:body`}><p>{item.description}</p></CanvasTarget>{item.price !== null && <CanvasTarget content={content} styleKey={`layout.premade:${item.id}:price`}><p className={styles.price}>{money(item.price)} USD</p></CanvasTarget>}<CanvasTarget content={content} styleKey={`layout.premade:${item.id}:purchase`}><div>{mode === "public" ? <PremadeListingLink content={content} page={page} item={item} /> : <PremadePurchaseInfo content={content} item={item} preview />}</div></CanvasTarget>
    </article></CanvasTarget>)}</div></CanvasTarget>
      : <div className="empty-state"><SpadeMark /><h2><TemplateText content={content} field="premades.emptyTitle" /></h2><p><TemplateText content={content} field="premades.emptyBody" /></p><TemplateLink content={content} field="premades.galleryLink" /></div>}
    <ContentBlocks blocks={page.blocks} content={content} />
  </div></CanvasTarget></PageScene>;
}

function ContactPreview({ content, page }: { content: OwnerContent; page: OwnerPage }) {
  const { mode, editable, mobileLayout } = useContext(RenderContext);
  const { site } = content;
  const contacts = getOwnerSocialLinks(content);
  return <PageScene content={content} page={page}><CanvasTarget content={content} styleKey={`layout.page:${page.id}:shell`}><div className="page-shell"><Intro content={content} page={page} eyebrow={<TemplateText content={content} field="contact.eyebrow" />} title={page.title}><p><TemplateText content={content} field="contact.intro" /></p></Intro>
    <CanvasTarget content={content} styleKey="layout.contact.columns"><div className="two-columns"><CanvasTarget content={content} styleKey="layout.contact.details"><section className="contact-details" {...editorTarget(mode === "editor" && editable, "contact", "contact details")}><h2><TemplateText content={content} field="contact.detailsTitle" /></h2>{site.telegram && <p><TemplateText content={content} field="contact.detailsBody" /></p>}
      {contacts.filter(contact => contact.value).map(contact => {
        const destination = contact.url ? resolveSiteDestination(content, contact.url, mode === "public" ? "public" : "preview") : null;
        return <CanvasTarget key={contact.id} content={content} styleKey={`layout.contact-row:${contact.id}`}>{destination ? <a className="contact-row" href={destination.href} target={contact.url?.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer"><CanvasTarget inline content={content} styleKey={`layout.contact-row:${contact.id}:label`}><span>{site.socialLinks === undefined ? <TemplateText content={content} field={`contact.${contact.id}Label`} /> : contact.label}</span></CanvasTarget><CanvasTarget inline content={content} styleKey={`layout.contact-row:${contact.id}:value`}><strong>{contact.value} {contact.url?.startsWith("mailto:") ? "" : "↗"}</strong></CanvasTarget></a>
          : <div className="contact-row" key={contact.id}><CanvasTarget inline content={content} styleKey={`layout.contact-row:${contact.id}:label`}><span>{site.socialLinks === undefined ? <TemplateText content={content} field={`contact.${contact.id}Label`} /> : contact.label}</span></CanvasTarget><CanvasTarget inline content={content} styleKey={`layout.contact-row:${contact.id}:value`}><strong>{contact.value}</strong></CanvasTarget></div>}</CanvasTarget>;
      })}
      {!contacts.some(contact => contact.value) && <p>No contact methods are currently available.</p>}
    </section></CanvasTarget><CanvasTarget content={content} styleKey="layout.contact.form"><section className="form-preview"><h2><TemplateText content={content} field="contact.formTitle" /></h2><p>The message form is not connected. Please use the contact details shown to get in touch.</p><fieldset disabled><label><TemplateText content={content} field="contact.nameLabel" /><input placeholder={getTemplateText(content, "contact.namePlaceholder")} {...appearanceProps(resolveElementAppearance(content.contentOverrides?.styles?.["contact.namePlaceholder"],mobileLayout)) } /></label><label><TemplateText content={content} field="contact.emailFieldLabel" /><input type="email" placeholder={getTemplateText(content, "contact.emailPlaceholder")} {...appearanceProps(resolveElementAppearance(content.contentOverrides?.styles?.["contact.emailPlaceholder"],mobileLayout)) } /></label><label><TemplateText content={content} field="contact.messageLabel" /><textarea rows={5} placeholder={getTemplateText(content, "contact.messagePlaceholder")} {...appearanceProps(resolveElementAppearance(content.contentOverrides?.styles?.["contact.messagePlaceholder"],mobileLayout)) } /></label><button disabled className="button" type="button">Messaging not connected</button></fieldset></section></CanvasTarget></div></CanvasTarget>
    <ContentBlocks blocks={page.blocks} content={content} />
  </div></CanvasTarget></PageScene>;
}

function ExamplesPreview({ content, page }: { content: OwnerContent; page: OwnerPage }) {
  return <PageScene content={content} page={page}><CanvasTarget content={content} styleKey={`layout.page:${page.id}:shell`}><div className="page-shell"><Intro content={content} page={page} eyebrow={<TemplateText content={content} field="examples.eyebrow" />} title={page.title}><p><TemplateText content={content} field="examples.intro" /></p></Intro>
    {["heads", "partials", "fullsuits"].map(id => <CanvasTarget key={id} content={content} styleKey={`layout.examples.${id}`}><section className="example-section" id={id}><h2><TemplateText content={content} field={`examples.${id}Title`} /></h2><TemplateImage content={content} field={`examples.${id}`} /><TemplateLink content={content} field="examples.pricesLink" className="text-link example-link" /></section></CanvasTarget>)}
    <ContentBlocks blocks={page.blocks} content={content} /><TemplateLink content={content} field="examples.galleryButton" className="button" />
  </div></CanvasTarget></PageScene>;
}


function Scene({content,page,children,chrome=false}:{content:OwnerContent;page:OwnerPage;children:ReactNode;chrome?:boolean}){
 const options=useContext(RenderContext);
 const markers:CanvasMarker[]=[
 {type:CanvasTarget,target:p=>`canvas:${p.styleKey}`},{type:TemplateText,target:p=>`template-text:${p.field}`},{type:TemplateLink,target:p=>`template-link:${p.field}`},{type:CoreText,target:p=>`core-text:${p.styleKey}`},{type:TemplateImage,target:p=>`template-image:${p.field}`},{type:ContentLink,target:p=>typeof p.editTarget==='string'?p.editTarget:null},{type:GeometryBox,target:p=>typeof p.target==='string'?p.target:null},
 {type:Intro,target:()=>null,expand:p=>buildIntro(p as IntroProps,options)},
 {type:ContentBlocks,target:()=>null,expand:p=>buildContentBlocks(p as BlocksProps,options)}];
 return <CanvasScene content={content} scope={chrome?'chrome':page} mobile={!!options.mobileLayout} editable={options.mode==='editor'&&options.editable} markers={markers} forceCanvasSlots={options.forceCanvasSlots}>{children}</CanvasScene>;
}
function PageScene(props:{content:OwnerContent;page:OwnerPage;children:ReactNode}){return <Scene {...props}/>;}

function ContentPageBody({ content, page }: { content: OwnerContent; page: OwnerPage }) {
  switch (page.builtinKey) {
    case "home": return <HomePreview content={content} page={page} />;
    case "prices": return <PricesPreview content={content} page={page} />;
    case "gallery": return <GalleryPreview content={content} page={page} />;
    case "commissions": return <CommissionsPreview content={content} page={page} />;
    case "premades": return <PremadesPreview content={content} page={page} />;
    case "contact": return <ContactPreview content={content} page={page} />;
    case "examples": return <ExamplesPreview content={content} page={page} />;
    default: return <PageScene content={content} page={page}><CanvasTarget content={content} styleKey={`layout.page:${page.id}:shell`}><div className={`page-shell ${page.builtinKey ? "narrow" : ""} ${page.builtinKey === "terms" ? termStyles.terms : page.builtinKey === "suitcare" ? styles.carePage : ""}`}>
      <Intro content={content} page={page} eyebrow={page.builtinKey ? <TemplateText content={content} field={`${page.builtinKey}.eyebrow`} /> : content.site.name.toUpperCase()} title={page.title} />
      {page.blocks.length ? <ContentBlocks content={content} blocks={page.blocks} presentation={page.builtinKey === "terms" ? "terms" : page.builtinKey === "suitcare" ? "care" : undefined} /> : <div className="empty-state"><h2><TemplateText content={content} field="site.emptyTitle" /></h2><p><TemplateText content={content} field="site.emptyBody" /></p></div>}
      {!page.blocks.length && <ContentBlocks content={content} blocks={page.blocks} />}
    </div></CanvasTarget></PageScene>;
  }
}

export interface ContentPageProps { forceCanvasSlots?:ForceCanvasSlot; layoutViewport?: "desktop"|"mobile"; children?: ReactNode; onEditCommissionForm?: () => void; content: OwnerContent; page: OwnerPage; mode?: SiteRenderMode; editable?: boolean; onNavigate?: (page: OwnerPage) => void }
/** No persistence or requests: always renders exactly the supplied content, including unsaved edits. */
export function ContentPage({ content, page, mode = "private-preview", editable = false, onNavigate, layoutViewport, forceCanvasSlots }: ContentPageProps) {
  const mobileLayout=useMobileSiteLayout(content.design?.mobileLayoutEnabled===true,layoutViewport);
  return <RenderContext value={{ mode, editable, onNavigate, mobileLayout, forceCanvasSlots }}><ContentPageBody content={content} page={page} /></RenderContext>;
}
export function SiteContentFrame({ content, page, mode = "private-preview", editable = false, onNavigate, children, onEditCommissionForm, layoutViewport, forceCanvasSlots }: ContentPageProps) {
  const mobileLayout=useMobileSiteLayout(content.design?.mobileLayoutEnabled===true,layoutViewport);
  const themedContent={design:resolveSiteDesign(content.design,mobileLayout)};
  const root = mode === "public" ? "/" : OWNER_PREVIEW_ROOT;
  const navigation = getHeaderNavigation(content);
  const dropdown = useNavigationDisclosure(`${mode}:${page.id}:${editable}`);
  return <RenderContext value={{ mode, editable, onNavigate, onEditCommissionForm, mobileLayout, forceCanvasSlots }}><div className={`selected-design ${mode === "editor" ? styles.editorFrame : ""}`} data-site-render-mode={mode} {...getSiteThemeAttributes(themedContent)} style={getSiteThemeStyle(themedContent)}>
    <SiteFontLoader fonts={content.fonts} privateFonts={mode !== "public"} />
    <Scene chrome content={content} page={page}><CanvasTarget content={content} styleKey="layout.site.header"><header className={`site-header ${styles.siteHeader}`} {...editorTarget(mode === "editor" && editable, "site", "site header and navigation")}><div className="header-inner"><CanvasTarget content={content} styleKey="layout.site.headerBrand"><div onClick={event => { if (mode === "editor") { event.preventDefault(); const home = getPreviewPage(content, []); if (home) onNavigate?.(home); } }}><Brand href={root} name={content.site.name} logo={getTemplateImage(content, "site.logo")} privateMedia={mode !== "public"} appearance={resolveElementAppearance(content.contentOverrides?.styles?.["site.brand"],mobileLayout)} logoAppearance={resolveElementAppearance(content.contentOverrides?.styles?.["site.logo"],mobileLayout)} editable={mode === "editor" && editable} /></div></CanvasTarget><div className={`header-right ${styles.menu}`}><span className="small-label"><TemplateText content={content} field="site.headerTagline" /></span><CanvasTarget content={content} styleKey="layout.site.navigation"><nav aria-label="Site preview navigation">{navigation.main.map(item => <ContentLink key={item.id} content={content} navPageId={item.pageId} editTarget={`canvas:layout.navigation:${item.id}`} appearance={content.contentOverrides?.styles?.[`layout.navigation:${item.id}`]} href={item.href}>{item.label}</ContentLink>)}{content.site.moreEnabled && navigation.more.length > 0 && <CanvasTarget content={content} styleKey="layout.site.more"><details ref={dropdown} className="nav-more" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.removeAttribute("open"); event.currentTarget.querySelector("summary")?.focus(); } }} onClick={event => { if (event.target instanceof HTMLElement && event.target.closest("a")) event.currentTarget.removeAttribute("open"); }}><summary>More <DropdownChevron className="nav-more-chevron" /></summary><div className="nav-more-menu">{navigation.more.map(item => <ContentLink key={item.id} content={content} navPageId={item.pageId} editTarget={`canvas:layout.navigation:${item.id}`} appearance={content.contentOverrides?.styles?.[`layout.navigation:${item.id}`]} href={item.href}>{item.label}</ContentLink>)}</div></details></CanvasTarget>}</nav></CanvasTarget></div></div></header></CanvasTarget>
    {children ?? <ContentPageBody content={content} page={page} />}
    <CanvasTarget content={content} styleKey="layout.site.footer"><footer className={styles.siteFooter}><div className="footer-top"><CanvasTarget content={content} styleKey="layout.site.footerBrand"><div onClick={event => { if (mode === "editor") { event.preventDefault(); const home = getPreviewPage(content, []); if (home) onNavigate?.(home); } }}><Brand footer href={root} name={content.site.name} logo={getTemplateImage(content, "site.logo")} privateMedia={mode !== "public"} appearance={resolveElementAppearance(content.contentOverrides?.styles?.["site.brand"],mobileLayout)} logoAppearance={resolveElementAppearance(content.contentOverrides?.styles?.["site.logo"],mobileLayout)} editable={mode === "editor" && editable} /></div></CanvasTarget><span><TemplateText content={content} field="site.footerTagline" /></span></div><div className="footer-bottom"><span><CopyrightRange /> <span {...editorTarget(mode === "editor" && editable, "site", "business name")}>{content.site.name}</span>. All rights reserved.</span><div><TemplateLink content={content} field="site.footerTerms" className="" /><TemplateLink content={content} field="site.footerContact" className="" /></div></div></footer></CanvasTarget>
  </Scene></div></RenderContext>;
}
export function SiteContentBlocks({ content, blocks, presentation, mode = "public" }: { content: OwnerContent; blocks: readonly PageBlock[]; presentation?: "terms" | "care"; mode?: SiteRenderMode }) {
  const mobileLayout=useMobileSiteLayout(content.design?.mobileLayoutEnabled===true);
  return <RenderContext value={{ mode,mobileLayout }}><ContentBlocks content={content} blocks={blocks} presentation={presentation} /></RenderContext>;
}
