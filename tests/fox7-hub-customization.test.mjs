import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceLoader } from "./scout-source-loader.mjs";
const model = sourceLoader()("src/client-hub/model.ts");
const project = { projectId: "11111111-1111-4111-8111-111111111111", clientId: "TMC-0123456789ABCDEF", title: "Fox", summary: "", status: "queued", progress: null, progressSource: "manual", trackingUrl: null, requestId: null, version: 1, createdAt: "2026-10-28T00:00:00.000Z", updatedAt: "2026-10-28T00:00:00.000Z" };
test("legacy projects decode unchanged and use static milestone fallback, not current owner defaults", () => {
 const decoded = model.decodeClientHubProject(project);
 assert.equal(decoded.milestones, undefined);
 assert.deepEqual(model.getProjectMilestones(decoded), model.DEFAULT_HUB_MILESTONES);
});
test("custom milestone snapshots preserve identifiers with at least three independent display nodes", () => {
 const milestones = [...model.DEFAULT_HUB_MILESTONES.slice(0, 2), { id: "fitting", label: "Fitting", status: "in-progress" }, ...model.DEFAULT_HUB_MILESTONES.slice(2)];
 const decoded = model.decodeClientHubProject({ ...project, milestones, activeMilestoneId: "fitting", ownerArchived: false });
 assert.deepEqual(model.getProjectMilestones(decoded), milestones);
 assert.equal(decoded.activeMilestoneId, "fitting");
 for (const invalid of [milestones.slice(0, 2), [...milestones, milestones[0]]]) assert.throws(() => model.validateHubMilestones(invalid));
});
test("custom labels can occupy many rows without disabling legacy mutual exclusions", () => {
 const labels = ["paid-100", ...Array.from({ length: 20 }, (_, index) => `custom:Label ${index}`)];
 assert.deepEqual(model.validateClientHubInformationTags(labels), labels);
 assert.throws(() => model.validateClientHubInformationTags([...labels, "paid-partial"]));
 assert.throws(() => model.validateClientHubInformationTags(["custom:<x>\nunsafe"]));
});
test("legacy hidden display nodes round trip while presentation guarantees three visible nodes", () => {
 const milestones=model.DEFAULT_HUB_MILESTONES.map(node=>({...node,hidden:node.id==='completed'}));
 assert.equal(model.decodeClientHubProject({...project,milestones}).milestones.find(node=>node.id==='completed').hidden,true);
 assert.throws(()=>model.validateHubMilestones(milestones.map(node=>({...node,hidden:'true'}))));
 assert.equal(model.validateHubMilestones(milestones.filter(node=>node.id!=='completed')).length,4);
 const hidden=milestones.slice(0,3).map(node=>({...node,hidden:true}));
 assert.equal(model.getProjectMilestones({milestones:hidden}).filter(node=>!node.hidden).length,3);
 assert.equal(hidden.every(node=>node.hidden),true);
});
