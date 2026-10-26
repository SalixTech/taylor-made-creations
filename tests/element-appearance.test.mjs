import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { harness } from "./owner-ui-harness.mjs";
const h = harness();
const { getElementAppearanceStyle: style, getElementAppearanceAttributes: attrs, getImageAppearanceStyle: image } = h.load("src/owner/appearance.ts");

test("element appearance maps only bounded typed tokens to CSS", () => {
  const value = { textColor: "#012345", backgroundColor: "#fedcba", font: "serif", textSize: "large", align: "center", imageFit: "cover", imagePositionX: 0, imagePositionY: 100 };
  assert.deepEqual(style(value), { "--element-text-color": "#012345", "--element-background": "#fedcba", "--element-font": "Georgia,'Times New Roman',serif", "--element-text-scale": 1.2, textAlign: "center" });
  assert.deepEqual(image(value), { objectFit: "cover", objectPosition: "0% 100%" });
  assert.equal(attrs(value)["data-element-appearance"], "true");
  assert.equal(attrs(value)["data-element-align"], "center");
  assert.deepEqual(style(), {});
  assert.deepEqual(image(), {});
  assert.equal(attrs()["data-element-appearance"], undefined);
});

test("defensive element rendering rejects CSS injection, inherited tokens, invalid numbers and unbounded positions", () => {
  const malicious = { textColor: "red;background:url(https://evil.invalid)", backgroundColor: "#fff", font: "constructor", textSize: "__proto__", align: "left;position:fixed", imageFit: "fill", imagePositionX: Infinity, imagePositionY: -1, css: "display:none" };
  assert.deepEqual(style(malicious), {});
  assert.deepEqual(image(malicious), {});
  assert.equal(attrs(malicious)["data-element-appearance"], undefined);
  for (const value of [NaN, Infinity, -0.1, 100.1, "50", null]) assert.deepEqual(image({ imagePositionX: value }), {});
  assert.deepEqual(image({ imagePositionY: 20 }), { objectPosition: "50% 20%" });
});

test("brand passes editable text and image appearance without changing private-media behavior", () => {
  const local = harness();
  local.overrides["@/owner/media-client"] = { useOwnerMediaSource: source => ({ src: source, error: null }) };
  const { Brand } = local.load("src/components/Brand.tsx");
  local.render(Brand, { appearance: { textColor: "#112233", font: "mono" }, logoAppearance: { imageFit: "cover", imagePositionX: 25 }, privateMedia: true });
  assert.equal(local.tree.props.style["--element-text-color"], "#112233");
  const logo = local.find(n => typeof n.type === "function" && n.type.name === "BrandLogo");
  assert.equal(logo.props.privateMedia, true);
  local.hooks = [];
  local.render(logo.type, logo.props);
  assert.deepEqual(local.find(n => n.type === "Image").props.style, { objectFit: "cover", objectPosition: "25% 50%" });
});

test("appearance CSS supports core paragraphs, nested block links and disabled-form placeholders", () => {
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  for (const selector of [
    'p[data-element-text-size="true"]',
    '.brand[data-element-align]>span',
    '.home-intro>p[data-element-text-size="true"]',
    'p.eyebrow[data-element-text-size="true"]',
    '[data-element-text-size="true"] p',
    '[data-element-text-size="true"] a',
    ':is(input,textarea)[data-element-text-size="true"]',
    ':is(input,textarea)[data-element-text-color="true"]::placeholder',
    ':is(input,textarea)[data-element-font="true"]::placeholder',
  ]) assert.ok(css.includes(selector), selector);
  assert.match(css, /figcaption,a\)\{color:var\(--element-text-color\)/);
  assert.match(css, /figcaption,a\)\{font-family:var\(--element-font\)/);
});
