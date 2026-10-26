import { test } from "node:test";
import assert from "node:assert/strict";
import { harness, nodes, content } from "./owner-ui-harness.mjs";

const photos = [
  { id: "front", src: "/images/heads.webp", alt: "Front of the blue character" },
  { id: "back", src: "/images/partials.webp", alt: "Back of the blue character" },
  { id: "side", src: "/images/fullsuits.webp", alt: "Side of the blue character" },
];
const listing = (changes = {}) => ({ id: "blue", name: "Blue", image: photos[1].src, alt: photos[1].alt, photos, coverPhotoId: "back", description: "A premade character", price: 621, visible: true, ...changes });
function fixture(item = listing(), mode = "public") {
  const h = harness();
  const calls = [];
  h.overrides["@/owner/media-client"] = { useOwnerMediaSource: (src, enabled) => { calls.push({ src, enabled }); return { src: enabled ? "blob:private-authorized" : src, error: null }; } };
  const { PremadeGallery } = h.load("src/components/PremadeGallery.tsx");
  const render = () => h.render(PremadeGallery, { item, mode });
  const button = label => h.find(node => node.type === "button" && node.props["aria-label"] === label);
  const cover = () => h.find(node => node.type === "button" && node.props["aria-haspopup"] === "dialog");
  const modal = () => h.find(node => node.type === "dialog");
  return { h, calls, render, button, cover, modal };
}

test("legacy cover fallback is stable and photo helpers preserve all supplied photos without mutation", () => {
  const h = harness(), helpers = h.load("src/owner/premade-gallery.ts");
  const legacy = listing({ photos: undefined, coverPhotoId: undefined });
  assert.deepEqual(helpers.getPremadePhotos(legacy), [{ id: "legacy-blue", src: legacy.image, alt: legacy.alt }]);
  assert.equal(helpers.getPremadePhotos(listing({ id: "a".repeat(96), photos: [] }))[0].id, "legacy-photo");
  const many = Array.from({ length: 1201 }, (_, i) => ({ id: `photo-${i}`, src: "/images/heads.webp", alt: `View ${i}` }));
  const item = listing({ photos: many, coverPhotoId: "photo-1200" });
  assert.equal(helpers.getPremadePhotos(item), many);
  assert.equal(helpers.getPremadePhotos(item).length, 1201);
  assert.equal(helpers.getPremadeCoverPhoto(item), many[1200]);
  assert.equal(many[0].id, "photo-0");
  assert.equal(helpers.getPremadeCoverPhoto(listing({ coverPhotoId: "removed" })).id, "front");
});

test("selected cover starts displayed; thumbnail selection retains individual alt text", () => {
  const t = fixture(); t.render();
  assert.match(t.cover().props["aria-label"], /photo 2 of 3/);
  assert.equal(t.button(`Show photo 2 of 3: ${photos[1].alt}`).props["aria-pressed"], true);
  t.button(`Show photo 3 of 3: ${photos[2].alt}`).props.onClick(); t.render();
  assert.match(t.cover().props["aria-label"], /photo 3 of 3/);
  assert.equal(t.button(`Show photo 3 of 3: ${photos[2].alt}`).props["aria-pressed"], true);
  const image = nodes(t.cover()).find(n => typeof n.type === "function");
  assert.equal(image.props.photo.alt, photos[2].alt);
  t.h.unmount();
});

test("every photo receives a selectable thumbnail without an arbitrary gallery cutoff", () => {
  const many = Array.from({ length: 1201 }, (_, index) => ({ id: `photo-${index}`, src: "/images/heads.webp", alt: `Angle ${index + 1}` }));
  const t = fixture(listing({ photos: many, coverPhotoId: "photo-1200" })); t.render();
  assert.equal(t.h.all(n => n.type === "button" && n.props["aria-pressed"] !== undefined).length, 1201);
  assert.equal(t.button("Show photo 1201 of 1201: Angle 1201").props["aria-pressed"], true);
  assert.match(t.cover().props["aria-label"], /photo 1201 of 1201/);
  t.h.unmount();
});

test("lightbox arrows wrap, Escape closes and restores scroll and focus; reopening stays usable", () => {
  const t = fixture(); t.render(); t.cover().props.onClick(); t.render();
  const dialog = t.modal().props.ref.current;
  assert.equal(dialog.open, true);
  assert.equal(t.h.document.body.style.overflow, "hidden");
  assert.equal(t.h.focusLog.at(-1), "Close enlarged premade photo");
  let prevented = 0;
  t.modal().props.onKeyDown({ key: "ArrowRight", preventDefault() { prevented++; } }); t.render();
  assert.match(content(t.modal()), /3 \/ 3/);
  t.button("Next premade photo").props.onClick(); t.render();
  assert.match(content(t.modal()), /1 \/ 3/);
  t.modal().props.onKeyDown({ key: "ArrowLeft", preventDefault() { prevented++; } }); t.render();
  assert.match(content(t.modal()), /3 \/ 3/);
  t.modal().props.onCancel({ preventDefault() { prevented++; } }); t.render();
  assert.equal(dialog.open, false);
  assert.equal(t.h.document.body.style.overflow, "auto");
  assert.equal(t.h.focusLog.at(-1), "Enlarge photo 3 of 3 of Blue");
  assert.equal(prevented, 3);
  t.cover().props.onClick(); t.render();
  assert.equal(dialog.open, true);
  t.button("Close enlarged premade photo").props.onClick(); t.render();
  assert.equal(dialog.open, false);
  t.h.unmount();
});

test("backdrop closes, inside click does not, and unmount removes modal scroll lock", () => {
  const t = fixture(); t.render(); t.cover().props.onClick(); t.render();
  t.modal().props.onClick({ target: {}, currentTarget: {} }); t.render();
  assert.equal(t.modal().props.ref.current.open, true);
  const backdrop = {};
  t.modal().props.onClick({ target: backdrop, currentTarget: backdrop }); t.render();
  assert.equal(t.modal().props.ref.current.open, false);
  t.cover().props.onClick(); t.render(); t.h.unmount();
  assert.equal(t.h.document.body.style.overflow, "auto");
});

test("single legacy image still enlarges without thumbnails or misleading browse controls", () => {
  const t = fixture(listing({ photos: undefined, coverPhotoId: undefined })); t.render();
  assert.equal(t.h.all(n => n.type === "button" && n.props["aria-pressed"] !== undefined).length, 0);
  t.cover().props.onClick(); t.render();
  assert.equal(t.button("Previous premade photo").props.disabled, true);
  assert.equal(t.button("Next premade photo").props.disabled, true);
  assert.doesNotMatch(content(t.modal()), /Use arrow keys/);
  t.h.unmount();
});

test("public photo renderer disables owner authorization; private photo renderer uses authorized blob", () => {
  for (const mode of ["public", "private-preview", "editor"]) {
    const t = fixture(listing(), mode); t.render();
    const image = nodes(t.cover()).find(n => typeof n.type === "function");
    t.h.render(image.type, image.props);
    assert.equal(t.calls.at(-1).enabled, mode !== "public");
    assert.equal(t.h.tree.props.src, mode === "public" ? photos[1].src : "blob:private-authorized");
    assert.equal(t.h.tree.props.alt, photos[1].alt);
    assert.equal(t.h.tree.props.unoptimized, true);
    t.h.unmount();
  }
});

function renderPage(mode, builtinKey, mutate = () => {}, editable = mode === "editor") {
  const h = harness();
  h.currentContext = { mode, editable };
  h.overrides["@/owner/media-client"] = { useOwnerMediaSource: src => ({ src, error: null }) };
  const site = h.load("src/components/SiteContent.tsx"), data = h.load("src/owner/defaults.ts").createDefaultOwnerContent();
  mutate(data);
  const page = data.pages.find(page => page.builtinKey === builtinKey);
  h.render(site.ContentPage, { content: data, page, mode, editable });
  const body = h.tree.props.children; h.render(body.type, body.props);
  if (typeof h.tree.type === "function") { const view = h.tree; h.render(view.type, view.props); }
  return { h, site, data };
}

test("hidden premades and photos are editable only in editor, never public or private site preview", () => {
  for (const mode of ["public", "private-preview", "editor"]) {
    const t = renderPage(mode, "premades", data => { data.site.showPremades = false; data.premades = [listing({ visible: false })]; });
    const article = t.h.find(n => n.type === "article");
    assert.equal(Boolean(article), mode === "editor");
    if (article) { assert.equal(article.props["data-owner-edit"], "premade:blue"); assert.equal(article.props.tabIndex, 0); }
    t.h.unmount();
    const gallery = renderPage(mode, "gallery", data => { data.gallery = [{ id: "hidden", name: "Hidden", src: "/images/heads.webp", alt: "Hidden photo", width: 200, height: 200, visible: false }]; });
    const grid = gallery.h.find(n => typeof n.type === "function" && n.type.name === "FursuitGallery");
    assert.equal(Boolean(grid), mode === "editor");
    if (grid) { gallery.h.render(grid.type, grid.props); assert.equal(gallery.h.find(n => n.type === "figure").props["data-owner-edit"], "gallery:hidden"); }
    gallery.h.unmount();
  }
});

test("block editing annotations stay out of public/preview markup and spacer editing remains accessible", () => {
  for (const mode of ["public", "private-preview", "editor"]) {
    const t = renderPage(mode, "home");
    t.h.render(t.site.ContentBlocks, { content: t.data, blocks: [{ id: "space", type: "spacer", size: "small" }, { id: "heading", type: "heading", text: "Heading", level: 2 }] });
    const elements = nodes(t.h.tree).slice(1);
    assert.equal(elements.filter(n => n.props["data-owner-edit"]).length, mode === "editor" ? 2 : 0);
    const spacer = elements.find(n => n.type === "div");
    assert.equal(spacer.props["aria-hidden"], mode === "editor" ? undefined : true);
    t.h.unmount();
  }
});


test("editor browsing/preview mode matches public visibility and contains no editing hooks", () => {
  const t = renderPage("editor", "premades", data => { data.site.showPremades = false; data.premades = [listing({ visible: false })]; }, false);
  assert.equal(t.h.find(n => n.type === "article"), undefined);
  assert.equal(t.h.all(n => n.props["data-owner-edit"]).length, 0);
  t.h.render(t.site.ContentBlocks, { content: t.data, blocks: [{ id: "space", type: "spacer", size: "small" }] });
  assert.equal(t.h.all(n => n.props["data-owner-edit"]).length, 0);
  assert.equal(t.h.find(n => n.props["aria-hidden"] === true).props.tabIndex, undefined);
  t.h.unmount();
});
