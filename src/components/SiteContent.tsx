"use client";

import Image from "next/image";
import Link from "next/link";
import { createContext, useContext, useState, type ReactNode, type CSSProperties } from "react";
import { FursuitGallery } from "@/components/FursuitGallery";
import { PremadeGallery } from "@/components/PremadeGallery";
import { useOwnerMediaSource } from "@/owner/media-client";
import { Brand, BrandMark } from "@/components/Brand";
import { PremadeTags, PremadePurchaseInfo, PremadeListingLink } from "./PremadeProduct";
import { premadeHref, thirdPartyListingUrl } from "./storefront-model";
import { SiteFontLoader } from "./SiteFontLoader";
import { CopyrightRange } from "./Copyright";
import termStyles from "@/components/Terms.module.css";
import { getVisibleNavigation, getMoreNavigation, isSafeImageSource, type OwnerContent, type OwnerPage, type PageBlock } from "@/owner/model";
import { getPreviewPage, OWNER_PREVIEW_ROOT, resolveSiteDestination } from "@/owner/preview-model";
import styles from "@/owner/OwnerSitePreview.module.css";
import { getTemplateText, getTemplateImage, getTemplateLink, getSiteThemeStyle, getSiteThemeAttributes, getElementAppearanceStyle, getElementAppearanceAttributes, getImageAppearanceStyle, type ElementAppearance } from "@/owner/site-design";

export type SiteRenderMode = "public" | "private-preview" | "editor";
type RenderOptions = { mode: SiteRenderMode; editable?: boolean; onNavigate?: (page: OwnerPage) => void };
const RenderContext = createContext<RenderOptions>({ mode: "private-preview" });
function useDestination(content: OwnerContent, href: string) {
  const { mode } = useContext(RenderContext);
  return resolveSiteDestination(content, href, mode === "public" ? "public" : "preview");
}
function ContentLink({ content, href, children, className, editTarget, appearance, navPageId }: { content: OwnerContent; href: string; children: ReactNode; className?: string; editTarget?: string; appearance?: ElementAppearance; navPageId?: string }) {
  const { mode, onNavigate, editable } = useContext(RenderContext);
  const edit = { "data-owner-nav-page": mode === "editor" && editable ? navPageId : undefined, ...(editTarget ? editorTarget(mode === "editor" && editable, editTarget, "link label and destination") : {}), ...appearanceProps(appearance) };
  const destination = useDestination(content, href);
  if (!destination) return mode === "public" ? null : <span className={styles.muted} {...edit}>{children} <small>— destination unavailable</small></span>;
  if (destination.kind !== "page") return <a {...edit} href={destination.href} className={className} download={destination.kind === "download" || undefined} target={destination.kind === "external" && destination.href.startsWith("https:") ? "_blank" : undefined} rel={destination.kind === "external" ? "noopener noreferrer" : undefined}>{children}</a>;
  return <Link {...edit} href={destination.href} className={className} onClick={event => {
    if (mode !== "editor") return;
    event.preventDefault();
    const url = new URL(destination.href, "https://preview.invalid");
    const slug = url.pathname.replace(/^\/taylor\/preview\/?/, "");
    const target = getPreviewPage(content, slug ? [decodeURIComponent(slug)] : []);
    if (target) onNavigate?.(target);
  }}>{children}</Link>;
}

const money = (value: number) => `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function editorTarget(editable: boolean | undefined, target: string, label: string) {
  return editable ? { "data-owner-edit": target, tabIndex: 0, "aria-label": `Edit ${label}` } : {};
}

function appearanceProps(appearance?: ElementAppearance) {
  return { ...getElementAppearanceAttributes(appearance), style: getElementAppearanceStyle(appearance) };
}

function TemplateText({ content, field, variables }: { content: OwnerContent; field: string; variables?: Record<string, string> }) {
  const { mode, editable } = useContext(RenderContext);
  return <span {...editorTarget(mode === "editor" && editable, `template-text:${field}`, "page text")} {...appearanceProps(content.contentOverrides?.styles?.[field])}>{getTemplateText(content, field, variables)}</span>;
}
function TemplateLink({ content, field, className = "text-link", children }: { content: OwnerContent; field: string; className?: string; children?: ReactNode }) {
  const link = getTemplateLink(content, field);
  return <ContentLink content={content} href={link.href} className={className} editTarget={`template-link:${field}`} appearance={content.contentOverrides?.styles?.[field]}>{children ?? link.label}</ContentLink>;
}
function TemplateImage({ content, field }: { content: OwnerContent; field: string }) {
  const { mode, editable } = useContext(RenderContext);
  const photo = getTemplateImage(content, field);
  return <div {...editorTarget(mode === "editor" && editable, `template-image:${field}`, "template image")}><PreviewImage key={photo.src} src={photo.src} alt={photo.alt} appearance={content.contentOverrides?.styles?.[field]} /></div>;
}

function Intro({ content, page, eyebrow, title, children, editTarget = "page" }: { content: OwnerContent; page: OwnerPage; eyebrow: ReactNode; title: string; children?: ReactNode; editTarget?: string }) {
  const { mode, editable } = useContext(RenderContext);
  return <div className="page-intro" {...editorTarget(mode === "editor" && editable, editTarget, editTarget === "prices" ? "prices and options" : "page heading")}><p className="eyebrow">{eyebrow}</p><h1 {...appearanceProps(page.titleAppearance ?? content.contentOverrides?.styles?.[`${page.builtinKey}.title`])}>{title}</h1>{children && <div className="intro-copy">{children}</div>}</div>;
}

function PreviewImage({ src, alt, hero = false, imageStyle, appearance, layoutAppearance = true }: { src: string; alt: string; hero?: boolean; imageStyle?: CSSProperties; appearance?: ElementAppearance; layoutAppearance?: boolean }) {
  const { mode } = useContext(RenderContext);
  const [failed, setFailed] = useState(false);
  const media = useOwnerMediaSource(src, mode !== "public");
  if (!isSafeImageSource(src) || failed || media.error) return <div className={styles.unavailable} role="status">This photo could not be displayed. {alt}</div>;
  if (!media.src) return <div className={styles.unavailable} role="status">Loading photo…</div>;
  const imageAppearance = appearance && !layoutAppearance ? { ...appearance, widthPercent: undefined, heightPercent: undefined } : appearance;
  return <div className={`${styles.image} ${hero ? styles.hero : ""}`} {...appearanceProps(imageAppearance)}>
    <Image src={media.src} alt={alt} fill unoptimized loading={hero ? "eager" : "lazy"} fetchPriority={hero ? "high" : undefined} style={{ ...imageStyle, ...getImageAppearanceStyle(appearance) }} sizes={hero ? "(max-width:1140px) 95vw, 1084px" : "(max-width:650px) 94vw, 700px"} onError={() => setFailed(true)} />
  </div>;
}


export function ContentBlocks({ blocks, content, presentation }: { blocks: readonly PageBlock[]; content: OwnerContent; presentation?: "terms" | "care" }) {
  const { mode, editable } = useContext(RenderContext);
  return <div className={presentation ? styles.structuredBlocks : styles.blocks}>{blocks.map(block => {
    const edit = { ...editorTarget(mode === "editor" && editable, `block:${block.id}`, `${block.type} block`), ...appearanceProps(block.appearance) };
    if (block.type === "heading") return block.level === 3 ? <h3 key={block.id} {...edit} id={`block-${block.id}`} className={styles.block}>{block.text}</h3> : <h2 key={block.id} {...edit} id={`block-${block.id}`} className={styles.block}>{block.text}</h2>;
    if (block.type === "divider") return <hr key={block.id} {...edit} className={styles.divider} />;
    if (block.type === "spacer") return <div key={block.id} {...edit} aria-hidden={mode === "editor" && editable ? undefined : true} style={{ ...getElementAppearanceStyle(block.appearance), height: block.size === "small" ? 16 : block.size === "large" ? 64 : 32 }} />;
    if (block.type === "list") { const List = block.style === "numbered" ? "ol" : "ul"; return <List key={block.id} {...edit} className={styles.contentList}>{block.items.map((item, index) => <li key={index}>{item}</li>)}</List>; }
    if (block.type === "faq") return <section key={block.id} {...edit} className={styles.faq}>{block.items.map(item => <details key={item.id} open={mode === "editor" && editable ? true : undefined}><summary onClick={mode === "editor" && editable ? event => event.preventDefault() : undefined}>{item.question}</summary><p>{item.answer}</p></details>)}</section>;
    if (block.type === "feature") return <section key={block.id} {...edit} className={`${styles.feature} ${block.imageSide === "right" ? styles.imageRight : ""}`}><PreviewImage key={block.src} src={block.src} alt={block.alt} appearance={block.appearance} layoutAppearance={false} /><div>{block.heading && <h2>{block.heading}</h2>}<p>{block.body}</p></div></section>;
    if (block.type === "text" && presentation === "terms") {
      if (block.id === "terms-agreement") return <p key={block.id} {...edit} className={termStyles.agreement}>{block.body}</p>;
      return <section key={block.id} {...edit} id={`block-${block.id}`} className={termStyles.section}>
        {block.heading && <h2>{block.heading}</h2>}
        {block.body && <ul>{block.body.split(/\n\s*\n/).map((paragraph, index) => <li key={index}>{paragraph}</li>)}</ul>}
      </section>;
    }
    if (block.type === "text" && presentation === "care") return <section key={block.id} {...edit} id={`block-${block.id}`} className={styles.careBlock}>
      {block.heading && <h2>{block.heading}</h2>}
      {block.body.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </section>;
    if (block.type === "text") return <section key={block.id} {...edit} id={`block-${block.id}`} className={styles.block}>
      {block.heading && <h2>{block.heading}</h2>}
      {block.body && <p>{block.body}</p>}
    </section>;
    if (block.type === "image") return <figure key={block.id} {...edit} className={styles.block}>
      <PreviewImage key={block.src} src={block.src} alt={block.alt} appearance={block.appearance} layoutAppearance={false} />
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>;
    if (block.type === "link") return <div key={block.id} {...edit} className={styles.block}><ContentLink content={content} href={block.href} className="text-link">{block.label} →</ContentLink></div>;
    return null;
  })}</div>;
}

function HomePreview({ content, page }: { content: OwnerContent; page: OwnerPage }) {
  const { home } = content;
  const { mode, editable } = useContext(RenderContext);
  return <>
    <section className="home-intro" {...editorTarget(mode === "editor" && editable, "home-copy", "home page introduction")}><p className="eyebrow" {...appearanceProps(content.contentOverrides?.styles?.["home.eyebrow"])}>{home.eyebrow}</p><h1><span className="original-style-title" {...appearanceProps(content.contentOverrides?.styles?.["home.title"])}>{home.title}</span></h1><p {...appearanceProps(content.contentOverrides?.styles?.["home.description"])}>{home.description}</p>
      <div className="actions"><TemplateLink content={content} field="home.galleryButton" className="button" /><TemplateLink content={content} field="home.pricesButton" /></div>
    </section>
    <section className="home-art" aria-label={`${content.site.name} fursuit collage`} {...editorTarget(mode === "editor" && editable, "home-image", "home page photo and caption")}><PreviewImage key={home.image.src} src={home.image.src} alt={home.image.alt} hero appearance={content.contentOverrides?.styles?.["home.image"]} />
      <div className="image-caption"><span {...appearanceProps(content.contentOverrides?.styles?.["home.caption"])}>{home.caption}</span><span>{content.site.name.toUpperCase()}</span></div>
    </section>
    <section className="commission-strip"><div><p className="eyebrow"><TemplateText content={content} field="home.stripEyebrow" /></p><h2><TemplateText content={content} field="home.stripTitle" /></h2><p><TemplateText content={content} field="home.stripBody" /></p></div><TemplateLink content={content} field="home.commissionsButton" className="button outline" /></section>
    <section className="home-links"><TemplateLink content={content} field="home.pricesCard" className=""><span><TemplateText content={content} field="home.pricesEyebrow" /></span><h3>{getTemplateLink(content, "home.pricesCard").label}</h3><p><TemplateText content={content} field="home.pricesBody" /></p></TemplateLink><TemplateLink content={content} field="home.careCard" className=""><span><TemplateText content={content} field="home.careEyebrow" /></span><h3>{getTemplateLink(content, "home.careCard").label}</h3><p><TemplateText content={content} field="home.careBody" /></p></TemplateLink></section>
    {page.blocks.length > 0 && <div className="page-shell"><ContentBlocks blocks={page.blocks} content={content} /></div>}
  </>;
}

function PricesPreview({ content, page }: { content: OwnerContent; page: OwnerPage }) {
  const { mode, editable } = useContext(RenderContext);
  const examplesPage = content.pages.find(item => item.builtinKey === "examples" && !item.trashedAt);
  return <div className="page-shell"><Intro content={content} page={page} eyebrow={<TemplateText content={content} field="prices.eyebrow" />} title={page.title} editTarget="prices"><p {...appearanceProps(content.contentOverrides?.styles?.["prices.intro"])}>{content.prices.intro}</p></Intro>
    <div className="price-grid" {...editorTarget(mode === "editor" && editable, "prices", "prices and options")}>{content.prices.groups.map((group, index) => <section className="price-card" key={group.id}>
      <span className="eyebrow">{String(index + 1).padStart(2, "0")}</span><h2>{group.title}</h2><p>{group.note}</p>
      {examplesPage && <ContentLink content={content} className="text-link example-link" href={`/${examplesPage.slug}#${encodeURIComponent(group.title.toLowerCase())}`}><TemplateText content={content} field="prices.exampleLabel" variables={{ category: group.title.toLowerCase() }} /></ContentLink>}
      {group.items.map(item => <div className="price-item" key={item.id}><div><h3>{item.name}</h3><p>{item.detail}</p></div><strong>{money(item.price)}<small><TemplateText content={content} field="prices.startingAt" /></small></strong></div>)}
    </section>)}</div>
    <div className="two-columns">{([['parts', content.prices.parts], ['extras', content.prices.extras]] as const).map(([title, items]) => <section key={title}><h2><TemplateText content={content} field={`prices.${title}Title`} /></h2><dl className="price-list">{items.map(item => <div key={item.id}><dt>{item.name}</dt><dd>{money(item.price)}{title === "parts" ? "+" : ""}</dd></div>)}</dl></section>)}</div>
    <ContentBlocks blocks={page.blocks} content={content} />
    <div className="end-note"><h2><TemplateText content={content} field="prices.endTitle" /></h2><p><TemplateText content={content} field="prices.endBody" /></p><TemplateLink content={content} field="prices.commissionsButton" className="button" /></div>
  </div>;
}

function GalleryPreview({ content, page }: { content: OwnerContent; page: OwnerPage }) {
  const { mode, editable } = useContext(RenderContext);
  const photos = content.gallery.filter(photo => ((mode === "editor" && editable) || photo.visible) && isSafeImageSource(photo.src));
  return <div className="page-shell"><Intro content={content} page={page} eyebrow={<TemplateText content={content} field="gallery.eyebrow" />} title={page.title}><p><TemplateText content={content} field="gallery.intro" /></p></Intro>
    {photos.length ? <FursuitGallery photos={photos} unoptimized privateMedia={mode !== "public"} editor={mode === "editor" && editable} /> : <div className="empty-state"><h2><TemplateText content={content} field="gallery.emptyTitle" /></h2><p><TemplateText content={content} field="gallery.emptyBody" /></p></div>}
    <ContentBlocks blocks={page.blocks} content={content} />
    <div className="end-note"><h2><TemplateText content={content} field="gallery.endTitle" /></h2><TemplateLink content={content} field="gallery.commissionsButton" /></div>
  </div>;
}

function CommissionsPreview({ content, page }: { content: OwnerContent; page: OwnerPage }) {
  const { mode, editable } = useContext(RenderContext);
  return <div className="page-shell"><Intro content={content} page={page} eyebrow={<TemplateText content={content} field="commissions.eyebrow" />} title={page.title}><p><TemplateText content={content} field="commissions.intro" /></p></Intro>
    <section className="status-panel" aria-labelledby="owner-preview-status-label" {...editorTarget(mode === "editor" && editable, "status", "commission status")}><div className="status-summary"><span id="owner-preview-status-label" className="status-label"><TemplateText content={content} field="commissions.statusLabel" /></span><h2 className={content.site.commissionStatus === "Closed" ? "status-closed" : content.site.commissionStatus === "Waitlist" ? styles.waitlist : "status-available"}>{content.site.commissionStatus}</h2></div><p className="status-copy">{content.site.statusNote}</p>
      {content.site.commissionStatus === "Open!" && (mode === "public" ? <Link className="button status-action" href={`/${page.slug}/request`}><TemplateText content={content} field="commissions.requestButton" /></Link> : <button className="button status-action" type="button" disabled title="Use the public site to try the commission form"><TemplateText content={content} field="commissions.requestButton" /></button>)}
    </section>
    <div className="two-columns"><section><h2><TemplateText content={content} field="commissions.stepsTitle" /></h2><ol className="steps"><li><h3><TemplateText content={content} field="commissions.stepOneTitle" /></h3><p><TemplateText content={content} field="commissions.stepOneBody" /></p></li><li><h3><TemplateText content={content} field="commissions.stepTwoTitle" /></h3><p><TemplateText content={content} field="commissions.stepTwoBody" /></p><TemplateLink content={content} field="commissions.pricesLink" /></li><li><h3><TemplateText content={content} field="commissions.stepThreeTitle" /></h3><p><TemplateText content={content} field="commissions.stepThreeBody" /></p><TemplateLink content={content} field="commissions.termsLink" /></li></ol></section>
      <section className="form-preview"><span className="eyebrow"><TemplateText content={content} field="commissions.formEyebrow" /></span><h2><TemplateText content={content} field="commissions.formTitle" /></h2><p><TemplateText content={content} field="commissions.formBody" /></p>{mode === "public" ? <Link className="button" href={`/${page.slug}/request`}><TemplateText content={content} field="commissions.formButton" /></Link> : <><button className="button" type="button" disabled>{content.contentOverrides?.text?.["commissions.formButton"] !== undefined || content.contentOverrides?.styles?.["commissions.formButton"] ? <TemplateText content={content} field="commissions.formButton" /> : "Requests are not connected"}</button><small>This owner preview cannot submit a commission or take a payment.</small></>}</section></div>
    <ContentBlocks blocks={page.blocks} content={content} />
  </div>;
}

function PremadesPreview({ content, page }: { content: OwnerContent; page: OwnerPage }) {
  const { mode, editable } = useContext(RenderContext);
  const listings = mode === "editor" && editable ? content.premades : content.site.showPremades ? content.premades.filter(item => item.visible) : [];
  return <div className="page-shell"><Intro content={content} page={page} eyebrow={<TemplateText content={content} field="premades.eyebrow" />} title={page.title}><p><TemplateText content={content} field="premades.intro" /></p></Intro>
    {mode === "editor" && editable && !content.site.showPremades && <p className={styles.editorNotice}>Premades are hidden from the public site. You can still edit your listings here.</p>}
    {content.site.catalogMode && <p className="storefront-notice">Catalog mode · Select an item for details and where to purchase. Listings do not guarantee current availability.</p>}
    {listings.some(item => item.soldChannel === "con") && <p className="storefront-notice">Convention listings are a catalog and do not necessarily reflect current availability. Confirm at the booth.</p>}
    {listings.length ? <div className="gallery-grid">{listings.map(item => <article key={item.id} className={styles.listing} {...editorTarget(mode === "editor" && editable, `premade:${item.id}`, `${item.name} premade`)}>
      {mode === "editor" && editable && !item.visible && <p className={styles.editorNotice}>Hidden listing · only visible while editing</p>}
      <PremadeGallery key={`${item.id}-${item.coverPhotoId ?? item.image}`} item={item} mode={mode} listingHref={mode === "public" ? (!content.site.catalogMode && thirdPartyListingUrl(item)) || premadeHref(page, item) : undefined} external={mode === "public" && !content.site.catalogMode && Boolean(thirdPartyListingUrl(item))} /><PremadeTags item={item} /><h2>{mode === "public" ? <PremadeListingLink content={content} page={page} item={item}>{item.name}</PremadeListingLink> : item.name}</h2><p>{item.description}</p>{item.price !== null && <p className={styles.price}>{money(item.price)} USD</p>}{mode === "public" ? <PremadeListingLink content={content} page={page} item={item} /> : <PremadePurchaseInfo content={content} item={item} preview />}
    </article>)}</div>
      : <div className="empty-state"><BrandMark logo={getTemplateImage(content, "site.logo")} privateMedia={mode !== "public"} /><h2><TemplateText content={content} field="premades.emptyTitle" /></h2><p><TemplateText content={content} field="premades.emptyBody" /></p><TemplateLink content={content} field="premades.galleryLink" /></div>}
    <ContentBlocks blocks={page.blocks} content={content} />
  </div>;
}

function ContactPreview({ content, page }: { content: OwnerContent; page: OwnerPage }) {
  const { mode, editable } = useContext(RenderContext);
  const { site } = content;
  const contacts = [
    { id: "telegram", label: getTemplateText(content, "contact.telegramLabel"), value: site.telegram ? `@${site.telegram}` : "", href: `https://t.me/${encodeURIComponent(site.telegram)}` },
    { id: "discord", label: getTemplateText(content, "contact.discordLabel"), value: site.discord, href: null },
    { id: "tiktok", label: getTemplateText(content, "contact.tiktokLabel"), value: site.tiktok ? `@${site.tiktok}` : "", href: `https://www.tiktok.com/@${encodeURIComponent(site.tiktok)}` },
    { id: "twitch", label: getTemplateText(content, "contact.twitchLabel"), value: site.twitch, href: `https://www.twitch.tv/${encodeURIComponent(site.twitch)}` },
    { id: "email", label: getTemplateText(content, "contact.emailLabel"), value: site.email, href: `mailto:${site.email}` },
  ];
  return <div className="page-shell"><Intro content={content} page={page} eyebrow={<TemplateText content={content} field="contact.eyebrow" />} title={page.title}><p><TemplateText content={content} field="contact.intro" /></p></Intro>
    <div className="two-columns"><section className="contact-details" {...editorTarget(mode === "editor" && editable, "contact", "contact details")}><h2><TemplateText content={content} field="contact.detailsTitle" /></h2>{site.telegram && <p><TemplateText content={content} field="contact.detailsBody" /></p>}
      {contacts.filter(contact => contact.value).map(contact => {
        const destination = contact.href ? resolveSiteDestination(content, contact.href, mode === "public" ? "public" : "preview") : null;
        return destination ? <a key={contact.id} className="contact-row" href={destination.href} target={contact.id === "email" ? undefined : "_blank"} rel="noopener noreferrer"><span><TemplateText content={content} field={`contact.${contact.id}Label`} /></span><strong>{contact.value} {contact.id === "email" ? "" : "↗"}</strong></a>
          : <div className="contact-row" key={contact.id}><span><TemplateText content={content} field={`contact.${contact.id}Label`} /></span><strong>{contact.value}</strong></div>;
      })}
      {!contacts.some(contact => contact.value) && <p>No contact methods are currently available.</p>}
    </section><section className="form-preview"><h2><TemplateText content={content} field="contact.formTitle" /></h2><p>The message form is not connected. Please use the contact details shown to get in touch.</p><fieldset disabled><label><TemplateText content={content} field="contact.nameLabel" /><input placeholder={getTemplateText(content, "contact.namePlaceholder")} {...appearanceProps(content.contentOverrides?.styles?.["contact.namePlaceholder"]) } /></label><label><TemplateText content={content} field="contact.emailFieldLabel" /><input type="email" placeholder={getTemplateText(content, "contact.emailPlaceholder")} {...appearanceProps(content.contentOverrides?.styles?.["contact.emailPlaceholder"]) } /></label><label><TemplateText content={content} field="contact.messageLabel" /><textarea rows={5} placeholder={getTemplateText(content, "contact.messagePlaceholder")} {...appearanceProps(content.contentOverrides?.styles?.["contact.messagePlaceholder"]) } /></label><button disabled className="button" type="button">Messaging not connected</button></fieldset></section></div>
    <ContentBlocks blocks={page.blocks} content={content} />
  </div>;
}

function ExamplesPreview({ content, page }: { content: OwnerContent; page: OwnerPage }) {
  return <div className="page-shell"><Intro content={content} page={page} eyebrow={<TemplateText content={content} field="examples.eyebrow" />} title={page.title}><p><TemplateText content={content} field="examples.intro" /></p></Intro>
    {["heads", "partials", "fullsuits"].map(id => <section className="example-section" key={id} id={id}><h2><TemplateText content={content} field={`examples.${id}Title`} /></h2><TemplateImage content={content} field={`examples.${id}`} /><TemplateLink content={content} field="examples.pricesLink" className="text-link example-link" /></section>)}
    <ContentBlocks blocks={page.blocks} content={content} /><TemplateLink content={content} field="examples.galleryButton" className="button" />
  </div>;
}

function ContentPageBody({ content, page }: { content: OwnerContent; page: OwnerPage }) {
  switch (page.builtinKey) {
    case "home": return <HomePreview content={content} page={page} />;
    case "prices": return <PricesPreview content={content} page={page} />;
    case "gallery": return <GalleryPreview content={content} page={page} />;
    case "commissions": return <CommissionsPreview content={content} page={page} />;
    case "premades": return <PremadesPreview content={content} page={page} />;
    case "contact": return <ContactPreview content={content} page={page} />;
    case "examples": return <ExamplesPreview content={content} page={page} />;
    default: return <div className={`page-shell ${page.builtinKey ? "narrow" : ""} ${page.builtinKey === "terms" ? termStyles.terms : page.builtinKey === "suitcare" ? styles.carePage : ""}`}>
      <Intro content={content} page={page} eyebrow={page.builtinKey ? <TemplateText content={content} field={`${page.builtinKey}.eyebrow`} /> : content.site.name.toUpperCase()} title={page.title} />
      {page.blocks.length ? <ContentBlocks content={content} blocks={page.blocks} presentation={page.builtinKey === "terms" ? "terms" : page.builtinKey === "suitcare" ? "care" : undefined} /> : <div className="empty-state"><h2><TemplateText content={content} field="site.emptyTitle" /></h2><p><TemplateText content={content} field="site.emptyBody" /></p></div>}
    </div>;
  }
}

export interface ContentPageProps { content: OwnerContent; page: OwnerPage; mode?: SiteRenderMode; editable?: boolean; onNavigate?: (page: OwnerPage) => void }
/** No persistence or requests: always renders exactly the supplied content, including unsaved edits. */
export function ContentPage({ content, page, mode = "private-preview", editable = false, onNavigate }: ContentPageProps) {
  return <RenderContext value={{ mode, editable, onNavigate }}><ContentPageBody content={content} page={page} /></RenderContext>;
}
export function SiteContentFrame({ content, page, mode = "private-preview", editable = false, onNavigate }: ContentPageProps) {
  const root = mode === "public" ? "/" : OWNER_PREVIEW_ROOT;
  return <RenderContext value={{ mode, editable, onNavigate }}><div className={`selected-design ${mode === "editor" ? styles.editorFrame : ""}`} data-site-render-mode={mode} {...getSiteThemeAttributes(content)} style={getSiteThemeStyle(content)}>
    <SiteFontLoader fonts={content.fonts} privateFonts={mode !== "public"} />
    <header className={`site-header ${styles.siteHeader}`} {...editorTarget(mode === "editor" && editable, "site", "site header and navigation")}><div className="header-inner"><div onClick={event => { if (mode === "editor") { event.preventDefault(); const home = getPreviewPage(content, []); if (home) onNavigate?.(home); } }}><Brand href={root} name={content.site.name} logo={getTemplateImage(content, "site.logo")} privateMedia={mode !== "public"} appearance={content.contentOverrides?.styles?.["site.brand"]} logoAppearance={content.contentOverrides?.styles?.["site.logo"]} editable={mode === "editor" && editable} /></div><div className={`header-right ${styles.menu}`}><span className="small-label"><TemplateText content={content} field="site.headerTagline" /></span><nav aria-label="Site preview navigation">{getVisibleNavigation(content).map(item => <ContentLink key={item.id} content={content} navPageId={item.id} href={item.slug ? `/${item.slug}` : "/"}>{item.navLabel}</ContentLink>)}{content.site.moreEnabled && getMoreNavigation(content).length > 0 && <details className="nav-more"><summary>More <span aria-hidden="true">⌄</span></summary><div className="nav-more-menu">{getMoreNavigation(content).map(item => <ContentLink key={item.id} content={content} navPageId={item.id} href={item.slug ? `/${item.slug}` : "/"}>{item.navLabel}</ContentLink>)}</div></details>}</nav></div></div></header>
    <ContentPageBody content={content} page={page} />
    <footer className={styles.siteFooter}><div className="footer-top"><div onClick={event => { if (mode === "editor") { event.preventDefault(); const home = getPreviewPage(content, []); if (home) onNavigate?.(home); } }}><Brand footer href={root} name={content.site.name} logo={getTemplateImage(content, "site.logo")} privateMedia={mode !== "public"} appearance={content.contentOverrides?.styles?.["site.brand"]} logoAppearance={content.contentOverrides?.styles?.["site.logo"]} editable={mode === "editor" && editable} /></div><span><TemplateText content={content} field="site.footerTagline" /></span></div><div className="footer-bottom"><span><CopyrightRange /> <span {...editorTarget(mode === "editor" && editable, "site", "business name")}>{content.site.name}</span></span><div><TemplateLink content={content} field="site.footerTerms" className="" /><TemplateLink content={content} field="site.footerContact" className="" /></div></div></footer>
  </div></RenderContext>;
}
export function SiteContentBlocks({ content, blocks, presentation, mode = "public" }: { content: OwnerContent; blocks: readonly PageBlock[]; presentation?: "terms" | "care"; mode?: SiteRenderMode }) {
  return <RenderContext value={{ mode }}><ContentBlocks content={content} blocks={blocks} presentation={presentation} /></RenderContext>;
}
