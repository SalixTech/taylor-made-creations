"use client";
import { getFunctions, httpsCallable } from "firebase/functions";
import { taylorOwnerSession } from "./taylor-services-client";
export async function callOwnerIntake(name: string, input: unknown) {
  const session = await taylorOwnerSession();
  const response = await httpsCallable(getFunctions(session.auth.app, "us-central1"), name)(input);
  session.assertCurrent();
  if (!response.data || typeof response.data !== "object" || Array.isArray(response.data)) throw new Error("The request response could not be verified.");
  return response.data as Record<string, unknown>;
}
export type IntakeCapabilities = { referencePurgeConfigured: boolean };
export async function readIntakeCapabilities(): Promise<IntakeCapabilities> {
  const value = await callOwnerIntake("tmcGetIntakeCapabilities", {});
  if (typeof value.referencePurgeConfigured !== "boolean") throw new Error("Reference cleanup setup could not be checked.");
  return { referencePurgeConfigured: value.referencePurgeConfigured };
}
export type ReferencePurge = { status: "pending" | "failed" | "complete"; fromVersion: number; requestedAt: string; completedAt: string | null };
export async function denyCommissionRequest(requestId: string, expectedVersion: number) {
  const result = await callOwnerIntake("tmcDenyCommissionRequest", { requestId, expectedVersion, confirmDenial: true });
  if (result.status !== "denied" || !Number.isSafeInteger(result.version) || ![expectedVersion, expectedVersion + 1].includes(result.version as number)) throw new Error("The denial was not confirmed. Refresh before trying again.");
  const purge = result.referencePurge as ReferencePurge | undefined;
  if (purge !== undefined && !["pending", "failed", "complete"].includes(purge.status)) throw new Error("The request's previous cleanup state needs review. Refresh before continuing.");
  return { status: "denied" as const, version: result.version as number, ...(purge ? { referencePurge: purge } : {}) };
}
export function referenceDisplayName(character: string, createdAt: string | null, index: number, contentType: string, fallback: string) {
  const date = createdAt ? new Date(createdAt) : null;
  const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[contentType];
  // New server names use the original reserved submission date, which can
  // precede createdAt when an interrupted submission completes after midnight.
  const canonical = /-TMC-(\d{4}-\d{2}-\d{2})-(\d+)\.(jpg|png|webp)$/.exec(fallback);
  if (canonical && extension === canonical[3] && Number(canonical[2]) === index + 1 && fallback.length <= 180 && !/[\\/<>:"|?*\u0000-\u001f\u007f]/.test(fallback)) {
    const submitted = new Date(`${canonical[1]}T00:00:00.000Z`);
    if (Number.isFinite(submitted.getTime()) && submitted.toISOString().slice(0, 10) === canonical[1]) return fallback;
  }
  if (!date || !Number.isFinite(date.getTime()) || !extension) return fallback.replace(/[\\/]/g, "_");
  const name = character.normalize("NFKC").replace(/[\\/<>:"|?*\u0000-\u001f\u007f]/g, "-").trim().replace(/[. ]+$/g, "").slice(0, 100) || "Character";
  return `${name}-TMC-${date.toISOString().slice(0, 10)}-${index + 1}.${extension}`;
}
