import { test } from "node:test";
import assert from "node:assert/strict";
import { harness, content } from "./owner-ui-harness.mjs";

test("Edit Section toggles a single inspector under the formatting bar without writing a draft", () => {
  const h = harness();
  h.overrides["./toolbar-viewport"] = { trackToolbarViewport: () => () => {} };
  h.overrides["./use-preview-viewport-width"] = { usePreviewViewportWidth: () => 1280 };
  const value = h.load("src/owner/defaults.ts").createDefaultOwnerContent();
  const { OwnerVisualBuilder } = h.load("src/owner/OwnerVisualBuilder.tsx");
  const noop = () => {};
  const props = {
    workspaceMode: true, content: value, page: value.pages[0], browsing: false,
    onEdit: () => assert.fail("Opening the inspector must never edit the draft"),
    onPageChange: noop, onManagePages: noop, onAddPage: noop,
    onRemove: noop, onBrowsingChange: noop,
  };
  const render = () => h.render(OwnerVisualBuilder, props);
  const button = label => h.find(node => node.type === "button" && content(node) === label);
  const panel = () => h.find(node => node.type === "aside");
  render();
  assert.equal(button("Edit Section").props["aria-expanded"], false);
  assert.equal(panel(), undefined);

  button("Edit Section").props.onClick();
  render();
  assert.equal(button("Edit Section").props["aria-expanded"], true);
  assert.equal(button("Edit Section").props["aria-controls"], panel().props.id);
  assert.equal(h.all(node => node.type === "aside").length, 1);
  const dock = h.find(node => node.props["data-owner-formatting-dock"]);
  assert.ok(content(dock).includes("Edit Section"));
  assert.ok(content(dock).includes("Page content"));

  button("Done").props.onClick();
  render();
  assert.equal(panel(), undefined);

  button("Design").props.onClick({});
  render();
  assert.equal(panel().props["aria-label"], "Website design");
  button("Edit Section").props.onClick();
  render();
  assert.equal(panel(), undefined);
  props.browsing = true;
  render();
  assert.equal(button("Edit Section"), undefined);
  h.unmount();
});

test("section spacing and button alignment edit only the selected draft layout", () => {
  const h = harness();
  h.overrides["./toolbar-viewport"] = { trackToolbarViewport: () => () => {} };
  h.overrides["./use-preview-viewport-width"] = { usePreviewViewportWidth: () => 1280 };
  const graph = h.load("src/owner/canvas-layout.ts");
  const value = h.load("src/owner/defaults.ts").createDefaultOwnerContent();
  const page = value.pages.find(item => item.builtinKey === "suitcare");
  page.blocks = [
    { id: "care-section", type: "text", heading: "General care", body: "Brush gently." },
    { id: "detergent", type: "link", label: "SA8 detergent", href: "https://example.com", buttonAppearance: { preset: "pill" } },
  ];
  const buttonId = "block:detergent";
  const linkId = `canvas:layout.block:${page.id}:detergent:link`;
  const placement = {
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 20, f: 30 },
    widthPx: 200, heightPx: 54, contentOffset: { xPx: 0, yPx: 70 },
  };
  assert.ok(graph.assignCanvasParent(value, page, buttonId, null, false, placement));
  assert.ok(graph.assignCanvasParent(value, page, linkId, null, false, placement));
  graph.initializeCanvasMobileLayouts(value);
  const mobile = structuredClone(graph.resolveCanvasLayout(value, page, true));

  class Element {
    constructor(id) { this.dataset = { ownerLayoutId: id, ownerLayoutScope: "page", ownerEdit: id }; }
    closest(selector) { return ["[data-owner-layout-id]", "[data-owner-edit]"].includes(selector) ? this : null; }
    querySelectorAll() { return []; }
  }
  h.globals.HTMLElement = Element;
  const { OwnerVisualBuilder } = h.load("src/owner/OwnerVisualBuilder.tsx");
  const noop = () => {};
  const props = {
    workspaceMode: true, content: value, page, browsing: false,
    onEdit(change) {
      const draft = structuredClone(props.content);
      change(draft);
      props.content = draft;
      props.page = draft.pages.find(item => item.id === page.id);
    },
    onPageChange: noop, onManagePages: noop, onAddPage: noop,
    onRemove: noop, onBrowsingChange: noop,
  };
  const render = () => h.render(OwnerVisualBuilder, props);
  const button = label => h.find(node => node.type === "button" && content(node) === label);
  const select = id => {
    const target = new Element(id);
    const canvas = h.find(node => node.props.onClickCapture);
    canvas.props.ref.current.contains = () => true;
    canvas.props.ref.current.querySelectorAll = () => [target];
    canvas.props.onClickCapture({ target, preventDefault: noop, stopPropagation: noop });
    render();
  };

  render();
  select("block:care-section");
  button("Edit Section").props.onClick();
  render();
  h.find(node => node.props.label === "Space above section").props.onChange(-24);
  render();
  assert.equal(props.page.blocks[0].appearance.marginTopPx, -24);
  assert.equal(page.blocks[0].appearance, undefined);

  select(buttonId);
  button("Align button with its box").props.onClick();
  const layout = graph.resolveCanvasLayout(props.content, props.page);
  assert.equal(layout[linkId].parentId, buttonId);
  assert.equal(layout[linkId].placement, undefined);
  assert.deepEqual(layout[buttonId].placement.matrix, placement.matrix);
  assert.equal(layout[buttonId].placement.contentOffset, undefined);
  assert.equal(props.page.blocks[1].href, page.blocks[1].href);
  assert.deepEqual(graph.resolveCanvasLayout(props.content, props.page, true), mobile);
  h.unmount();
});
