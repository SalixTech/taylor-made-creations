import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { harness, content as textContent } from "./owner-ui-harness.mjs";

function setup() {
  const h = harness();
  const content = h.load("src/owner/defaults.ts").createDefaultOwnerContent();
  h.overrides["./PublicSiteContext"] = { usePublicOwnerContent: () => content, usePublicSiteState: () => ({ status: "published" }) };
  return { h, content };
}

test("public frame inherits only website tokens, and excludes every owner and private preview route", () => {
  const { h, content } = setup();
  const { PublicSiteFrame } = h.load("src/components/PublicSiteFrame.tsx");
  h.render(PublicSiteFrame, { children: "Website" });
  assert.deepEqual(h.tree.props.style, {});
  assert.equal(h.tree.props["data-site-theme"], undefined);
  content.design = { colors: { accent: "#123456", headerText: "#fefefe" }, bodyFont: "serif", buttonRadius: "pill" };
  h.pathname = "/gallery";
  h.render(PublicSiteFrame, { children: "Website" });
  assert.equal(h.tree.props.style["--site-accent"], "#123456");
  assert.equal(h.tree.props.style["--site-button-radius"], "999px");
  assert.equal(h.tree.props["data-site-theme"], "true");
  for (const path of ["/taylor", "/taylor/preview", "/taylor/preview/gallery", "/owner", "/owner/preview"]) {
    h.pathname = path;
    h.render(PublicSiteFrame, { children: "Owner controls" });
    assert.deepEqual(h.tree.props.style, {}, path);
    assert.equal(h.tree.props["data-site-theme"], undefined, path);
  }
  h.pathname = "/contact";
  h.render(PublicSiteFrame, { children: "Website" });
  assert.equal(h.tree.props.style["--site-accent"], "#123456");
});

test("public chrome uses edited logo, tagline, labels and safe destinations without restoring trashed pages", () => {
  const { h, content } = setup();
  content.contentOverrides = { text: { "site.headerTagline": "Made with joy", "site.footerTagline": "Your character, your way." }, images: { "site.logo": { src: "/images/heads.webp", alt: "My studio mark" } }, links: { "site.footerContact": { label: "Say hello", href: "https://example.com/hello" } } };
  const { PublicHeader, PublicFooter } = h.load("src/components/PublicChrome.tsx");
  h.render(PublicHeader);
  assert.match(textContent(h.tree), /Made with joy/);
  const brand = h.find(n => typeof n.type === "function" && n.type.name === "Brand");
  assert.deepEqual(brand.props.logo, { src: "/images/heads.webp", alt: "My studio mark" });
  assert.equal(brand.props.privateMedia, undefined);
  h.render(PublicFooter);
  assert.match(textContent(h.tree), /Your character, your way/);
  const terms = h.find(n => typeof n.type === "function" && n.props.field === "site.footerTerms");
  const contact = h.find(n => typeof n.type === "function" && n.props.field === "site.footerContact");
  h.render(contact.type, contact.props);
  assert.equal(h.tree.props.href, "https://example.com/hello");
  assert.equal(h.tree.props.rel, "noopener noreferrer");
  assert.equal(textContent(h.tree), "Say hello");
  content.pages.find(p => p.builtinKey === "terms").trashedAt = "2026-10-25T10:00:00.000Z";
  h.render(terms.type, terms.props);
  assert.equal(h.tree, null);
});

test("brand authenticates uploaded logos only in private previews, with no unauthorized URL fallback", () => {
  const src = "/api/media/12345678-1234-4234-8234-123456789abc";
  for (const privateMedia of [false, true]) {
    const h = harness(), calls = [];
    let result;
    h.overrides["@/owner/media-client"] = { useOwnerMediaSource(source, enabled) { calls.push({ source, enabled }); return result ?? { src: enabled ? "blob:private-logo" : source, error: null }; } };
    const { Brand } = h.load("src/components/Brand.tsx");
    h.render(Brand, { logo: { src, alt: "Studio logo" }, privateMedia });
    const logo = h.find(n => typeof n.type === "function" && n.type.name === "BrandLogo");
    h.hooks = [];
    h.render(logo.type, logo.props);
    assert.deepEqual(calls.at(-1), { source: src, enabled: privateMedia });
    const image = h.find(n => n.type === "Image");
    assert.equal(image.props.src, privateMedia ? "blob:private-logo" : src);
    assert.equal(image.props.unoptimized, true);
    result = { src: null, error: "Permission denied" };
    h.render(logo.type, logo.props);
    assert.equal(h.find(n => n.type === "Image"), undefined);
  }
});

test("theme CSS is opt-in on the site frame and uses explicit hidden-content choices", () => {
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8").split("/* Creative controls")[1];
  assert.ok(css);
  assert.match(css, /\.selected-design\[data-site-theme="true"\]/);
  assert.match(css, /data-site-home-intro="full"/);
  assert.match(css, /data-site-header-tagline="visible"/);
  assert.match(css, /data-site-button-radius="true"/);
  assert.doesNotMatch(css, /(?:^|\n)\s*(?::root|body)\s*\{/);
});
