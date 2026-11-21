import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceLoader } from "./scout-source-loader.mjs";

const { measureGapCut, marginAfterGapCut } = sourceLoader()("src/owner/canvas-gap.ts");
const section = { left: 50, right: 400, top: 320, bottom: 480 };

test("draw to remove only an empty band and accept either drag direction", () => {
  const start = { x: 100, y: 225 };
  const end = { x: 200, y: 275 };
  assert.equal(measureGapCut(section, [], start, end), 50);
  assert.equal(measureGapCut(section, [], end, start), 50);
  assert.equal(measureGapCut(section, [], start, { ...end, y: 340 }), 0);
  assert.equal(measureGapCut(section, [], { x: 5, y: 225 }, { x: 40, y: 275 }), 0);
});

test("drawing in one column never brings a section through content in another column", () => {
  const besideDrawing = { left: 300, right: 390, top: 240, bottom: 300 };
  assert.equal(measureGapCut(section, [besideDrawing], { x: 100, y: 220 }, { x: 200, y: 280 }), 0);
  assert.equal(measureGapCut(section, [besideDrawing], { x: 100, y: 303 }, { x: 200, y: 315 }), 12);
});

test("flow reduction accounts for collapsed margins and repeated cuts", () => {
  assert.equal(marginAfterGapCut(90, 0, 20), 70);
  assert.equal(marginAfterGapCut(40, 30, 5), 35);
  assert.equal(marginAfterGapCut(40, 30, 20), -10);
  assert.equal(marginAfterGapCut(-10, 30, 5), -15);
  assert.equal(marginAfterGapCut(20, -15, 12), null);
});
