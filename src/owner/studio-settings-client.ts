"use client";
import { doc, getFirestore, onSnapshot } from "firebase/firestore";
import { onIdTokenChanged } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { taylorOwnerSession } from "./taylor-services-client";
export type StudioSettings = { schemaVersion: 1; photoNamingMode: "automatic" | "original"; informationTagOrder: string[]; customLabelCatalog: string[]; revision: number; whimsyEnabled: boolean; whimsyTerms: string[]; updateRequestCooldownDays: number; updateRequestCooldownResetAt: string | null; updatedAt: string | null };
export type StudioSettingsPatch = Partial<Pick<StudioSettings, "whimsyEnabled" | "whimsyTerms" | "updateRequestCooldownDays" | "photoNamingMode" | "informationTagOrder" | "customLabelCatalog">>;
export const emptyStudioSettings = (): StudioSettings => ({ schemaVersion: 1, photoNamingMode: "automatic", informationTagOrder: [], customLabelCatalog: [], revision: 0, whimsyEnabled: true, whimsyTerms: [], updateRequestCooldownDays: 7, updateRequestCooldownResetAt: null, updatedAt: null });
export function decodeStudioSettings(raw: unknown): StudioSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Studio preferences could not be read safely.");
  const value = raw as Record<string, unknown>, date = (item: unknown) => item === null || typeof item === "string" && Number.isFinite(Date.parse(item));
  if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || typeof value.whimsyEnabled !== "boolean" || !Array.isArray(value.whimsyTerms) || value.whimsyTerms.length > 24 || value.whimsyTerms.some(word => typeof word !== "string" || [...word].length < 1 || [...word].length > 32 || !/^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(word)) || new Set(value.whimsyTerms.map(word => (word as string).toLocaleLowerCase())).size !== value.whimsyTerms.length || !Number.isInteger(value.updateRequestCooldownDays) || (value.updateRequestCooldownDays as number) < 0 || (value.updateRequestCooldownDays as number) > 365 || !date(value.updateRequestCooldownResetAt) || !date(value.updatedAt)) throw new Error("Studio preferences could not be read safely.");
  if (value.photoNamingMode !== undefined && !["automatic", "original"].includes(String(value.photoNamingMode)) || value.informationTagOrder !== undefined && (!Array.isArray(value.informationTagOrder) || value.informationTagOrder.some(item => typeof item !== "string"))) throw new Error("Studio preferences could not be read safely.");
  const catalog = value.customLabelCatalog ?? [];
  if (!Array.isArray(catalog) || catalog.length > 100 || catalog.some(item => typeof item !== "string" || !/^custom:[^\x00-\x1f\x7f]{1,60}$/.test(item) || item.slice(7) !== item.slice(7).trim() || !item.slice(7).trim()) || new Set(catalog.map(item => item.normalize("NFC").toLowerCase())).size !== catalog.length) throw new Error("Saved custom labels could not be read safely.");
  return { customLabelCatalog: [...catalog], schemaVersion: 1, photoNamingMode: value.photoNamingMode === "original" ? "original" : "automatic", informationTagOrder: Array.isArray(value.informationTagOrder) ? [...value.informationTagOrder] as string[] : [], revision: value.revision as number, whimsyEnabled: value.whimsyEnabled, whimsyTerms: [...value.whimsyTerms] as string[], updateRequestCooldownDays: value.updateRequestCooldownDays as number, updateRequestCooldownResetAt: value.updateRequestCooldownResetAt as string | null, updatedAt: value.updatedAt as string | null };
}
export type StudioSettingsSession = { assertCurrent: () => void; save: (input: { operationId: string; expectedRevision: number; patch: StudioSettingsPatch; resetUpdateRequestCooldown?: true }) => Promise<StudioSettings>; close: () => void };
export async function connectStudioSettings(onData: (value: StudioSettings) => void, onError: (error: unknown) => void): Promise<StudioSettingsSession> {
  const session = await taylorOwnerSession(), stops: (() => void)[] = []; let active = true;
  const assertCurrent = () => { if (!active) throw new Error("Your owner session changed. Reopen Settings."); session.assertCurrent(); };
  const close = () => { active = false; stops.splice(0).forEach(stop => stop()); };
  assertCurrent();
  const track = (stop: () => void) => { if (active) stops.push(stop); else stop(); };
  const fail = (error: unknown) => { if (!active) return; close(); onError(error); };
  track(onSnapshot(doc(getFirestore(session.auth.app), "ownerStudioSettings", "current"), { includeMetadataChanges: true }, snapshot => {
    if (!active || snapshot.metadata.fromCache) return;
    try { assertCurrent(); onData(snapshot.exists() ? decodeStudioSettings(snapshot.data()) : emptyStudioSettings()); } catch (error) { fail(error); }
  }, fail));
  track(onIdTokenChanged(session.auth, () => { if (!active) return; try { assertCurrent(); } catch (error) { fail(error); } }, fail));
  return { assertCurrent, close, save: async input => { assertCurrent(); const response = await httpsCallable<unknown, { settings: unknown }>(getFunctions(session.auth.app, "us-central1"), "tmcOwnerSaveSettings")(input); assertCurrent(); return decodeStudioSettings(response.data.settings); } };
}
