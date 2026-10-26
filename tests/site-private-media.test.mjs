import { test } from "node:test";
import assert from "node:assert/strict";
import { harness, content } from "./owner-ui-harness.mjs";

const source = "/api/media/12345678-1234-4234-8234-123456789abc";
const modes = ["public", "private-preview", "editor"];
function setup(mode) {
  const h = harness(), calls = [];
  h.currentContext = { mode, editable: false };
  let result;
  h.overrides["@/owner/media-client"] = { useOwnerMediaSource(src, enabled) { calls.push({ src, enabled }); return result ?? { src: enabled ? "blob:authorized-private-photo" : src, error: null }; } };
  const site = h.load("src/components/SiteContent.tsx"), data = h.load("src/owner/defaults.ts").createDefaultOwnerContent();
  return { h, calls, site, data, setResult: value => { result = value; } };
}
function renderLeaf(t, node) {
  t.h.hooks = [];
  t.h.render(node.type, node.props);
  return t.h.find(n => n.type === "Image");
}

test("uploaded home, image block and feature images authorize only private render modes, including noneditable editor preview", () => {
  for (const mode of modes) for (const kind of ["home", "image", "feature"]) {
    const t = setup(mode);
    if (kind === "home") {
      t.data.home.image = { src: source, alt: "Uploaded private home photo" };
      const page = t.data.pages.find(p => p.builtinKey === "home");
      t.h.render(t.site.ContentPage, { content: t.data, page, mode, editable: false });
      const body = t.h.tree.props.children; t.h.render(body.type, body.props);
      const home = t.h.tree; t.h.render(home.type, home.props);
    } else {
      const block = kind === "image" ? { id: "upload", type: "image", src: source, alt: "Uploaded block photo", caption: "Caption" } : { id: "feature", type: "feature", src: source, alt: "Uploaded feature photo", heading: "Feature", body: "Text", imageSide: "left" };
      t.h.render(t.site.ContentBlocks, { content: t.data, blocks: [block] });
    }
    const imageNode = t.h.find(n => typeof n.type === "function" && n.type.name === "PreviewImage");
    assert.ok(imageNode, kind);
    const rendered = renderLeaf(t, imageNode);
    assert.deepEqual(t.calls.at(-1), { src: source, enabled: mode !== "public" });
    assert.equal(rendered.props.src, mode === "public" ? source : "blob:authorized-private-photo");
    assert.equal(rendered.props.unoptimized, true);
    assert.equal(t.h.all(n => n.props["data-owner-edit"]).length, 0);
    t.h.unmount();
  }
});

test("gallery page forwards private media separately from editing, and both card and lightbox use authorized sources", () => {
  for (const mode of modes) {
    const t = setup(mode);
    t.data.gallery = [{ id: "upload", name: "Uploaded", src: source, alt: "Uploaded gallery photo", width: 300, height: 200, visible: true }];
    const page = t.data.pages.find(p => p.builtinKey === "gallery");
    t.h.render(t.site.ContentPage, { content: t.data, page, mode, editable: false });
    const body = t.h.tree.props.children; t.h.render(body.type, body.props);
    const galleryPage = t.h.tree; t.h.render(galleryPage.type, galleryPage.props);
    const gallery = t.h.find(n => typeof n.type === "function" && n.type.name === "FursuitGallery");
    assert.equal(gallery.props.privateMedia, mode !== "public");
    assert.equal(Boolean(gallery.props.editor), false);
    t.h.render(gallery.type, gallery.props);
    const cardImage = t.h.find(n => typeof n.type === "function" && n.type.name === "GalleryImage");
    t.h.find(n => n.type === "button" && n.props["aria-haspopup"] === "dialog").props.onClick({ currentTarget: { focus() {} } });
    t.h.render(gallery.type, gallery.props);
    const expandedImage = t.h.find(n => typeof n.type === "function" && n.type.name === "GalleryImage" && n.props.expanded);
    assert.ok(expandedImage);
    t.h.unmount();
    for (const imageNode of [cardImage, expandedImage]) {
      const image = renderLeaf(t, imageNode);
      assert.deepEqual(t.calls.at(-1), { src: source, enabled: mode !== "public" });
      assert.equal(image.props.src, mode === "public" ? source : "blob:authorized-private-photo");
      assert.equal(image.props.alt, "Uploaded gallery photo");
    }
    t.h.unmount();
  }
});

test("standalone gallery defaults to public media and never enables owner authorization", () => {
  const t = setup("private-preview"), { FursuitGallery } = t.h.load("src/components/FursuitGallery.tsx");
  t.h.render(FursuitGallery, { photos: [{ name: "Public", src: source, alt: "Public uploaded photo", width: 300, height: 200 }] });
  const imageNode = t.h.find(n => typeof n.type === "function" && n.type.name === "GalleryImage");
  const image = renderLeaf(t, imageNode);
  assert.deepEqual(t.calls.at(-1), { src: source, enabled: false });
  assert.equal(image.props.src, source);
  t.h.unmount();
});

test("private image loading and permission errors do not fall back to unauthenticated image URLs", () => {
  for (const kind of ["block", "gallery"]) for (const result of [{ src: null, error: null }, { src: null, error: "Permission denied" }]) {
    const t = setup("private-preview");
    t.setResult(result);
    if (kind === "block") t.h.render(t.site.ContentBlocks, { content: t.data, blocks: [{ id: "image", type: "image", src: source, alt: "Private photo", caption: "" }] });
    else t.h.render(t.h.load("src/components/FursuitGallery.tsx").FursuitGallery, { photos: [{ name: "Private", src: source, alt: "Private photo", width: 300, height: 200 }], privateMedia: true });
    const imageNode = t.h.find(n => typeof n.type === "function" && /^(?:PreviewImage|GalleryImage)$/.test(n.type.name));
    assert.equal(renderLeaf(t, imageNode), undefined);
    assert.match(content(t.h.tree), result.error ? /unavailable|could not be displayed/ : /Loading photo/);
    assert.equal(t.calls.at(-1).enabled, true);
    t.h.unmount();
  }
});
