"use client";
import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { readClientHubFirebaseConfig } from "@/client-hub/client";
function functions() {
  const config = readClientHubFirebaseConfig();
  if (config.status !== "ready") throw new Error("Online requests need connection setup. Please contact Taylor directly; nothing has been sent.");
  const existing = getApps().find(app => app.name === "tmc-public-intake");
  if (existing && Object.entries(config.options).some(([key, value]) => existing.options[key as keyof FirebaseOptions] !== value)) throw new Error("The request connection changed. Reload this page before sending; nothing has been sent.");
  const app = existing ?? initializeApp(config.options, "tmc-public-intake");
  return getFunctions(app, "us-central1");
}
/** Safe support metadata, never the submitted contact details or Firebase tokens. */
export class PublicIntakeError extends Error {
  constructor(message: string, public readonly code: string, public readonly endpoint: string, public readonly supportCode: string | null = null) {
    super(message); this.name = "PublicIntakeError";
  }
}
export async function sendPublicIntake(name: "tmcHubRequestCode" | "tmcSubmitCommissionRequest", input: unknown) {
  try {
    const result = await httpsCallable<unknown, { accepted: boolean; message: string }>(functions(), name, { timeout: 70_000 })(input);
    if (result.data?.accepted !== true || typeof result.data.message !== "string" || !result.data.message.trim()) throw new PublicIntakeError("The request was not confirmed. Your details are still here. Retry to safely resume the same request.", "invalid-response", name);
    return result.data;
  } catch (cause) {
    if (cause instanceof PublicIntakeError) throw cause;
    const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
    const details = cause && typeof cause === "object" && "details" in cause ? cause.details : null;
    const reason = details && typeof details === "object" && "supportCode" in details ? details.supportCode : null;
    const supportCode = typeof reason === "string" && ["INTAKE_BACKEND_ACCESS", "INTAKE_BACKEND_UNAVAILABLE"].includes(reason) ? reason : null;
    if (code === "functions/resource-exhausted") throw new PublicIntakeError("Too many requests. Please wait before trying again. Your details are still here.", code, name);
    if (["functions/invalid-argument", "functions/failed-precondition", "functions/already-exists"].includes(code) && cause instanceof Error) throw new PublicIntakeError(cause.message, code, name);
    if (["functions/not-found", "functions/unimplemented"].includes(code)) throw new PublicIntakeError("The online request service is not set up yet. Your details are still here. Please contact Taylor so the connection can be checked.", code, name);
    if (["functions/permission-denied", "functions/unauthenticated"].includes(code) || supportCode === "INTAKE_BACKEND_ACCESS") throw new PublicIntakeError("The online request service needs an access check. Your request was not confirmed and your details are still here. Please contact Taylor.", code, name, supportCode);
    if (code) throw new PublicIntakeError("Online requests could not be reached or confirmed. Your details are still here. Retry to safely resume the same request.", code, name, supportCode);
    throw cause;
  }
}
/** Optimized copies are explicitly disclosed; original files are never modified. */
export async function prepareIntakeReference(file: File): Promise<{ fileName: string; contentType: string; base64: string }> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("Image preparation is not available in this browser.");
    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("A reference image could not be prepared.")), "image/jpeg", .88));
    if (blob.size > 2 * 1024 * 1024) throw new Error("A reference is too detailed to upload safely. Please choose a smaller copy.");
    const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
    return { fileName: `${file.name.replace(/\.[^.]+$/, "").replace(/[\\/]/g, "_").slice(0, 170)}.jpg`, contentType: "image/jpeg", base64: btoa(binary) };
  } finally { bitmap.close(); }
}
