"use client";

import type { OwnerFont } from "./model";

export const FONT_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const FONT_UPLOAD_ACCEPT = ".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf";
export const OWNER_FONT_SOURCE_PATTERN = /^\/api\/fonts\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const FONT_CONTENT_TYPES = { woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf" } as const;
export function isOwnerFont(value: unknown): value is OwnerFont {
  if (!value || typeof value !== "object") return false;
  const font = value as Partial<OwnerFont>;
  return typeof font.id === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(font.id) && typeof font.src === "string" && OWNER_FONT_SOURCE_PATTERN.test(font.src) && typeof font.name === "string" && !!font.name.trim() && font.name.length <= 100 && typeof font.format === "string" && Object.hasOwn(FONT_CONTENT_TYPES, font.format);
}
export function ownerFontRecord(font: OwnerFont): OwnerFont {
  return { id: font.id, name: font.name, src: font.src, format: font.format };
}
export async function uploadOwnerFont(file: File, rightsConfirmed: boolean, signal?: AbortSignal): Promise<OwnerFont> {
  if (!rightsConfirmed) throw new Error("Confirm that you have permission to use and embed this font on your website.");
  const format = file.name.toLowerCase().split(".").pop() as keyof typeof FONT_CONTENT_TYPES;
  if (!Object.hasOwn(FONT_CONTENT_TYPES, format)) throw new Error("Choose a WOFF, WOFF2, TTF or OTF file. SVG fonts, archives and font collections are not supported.");
  if (!file.size || file.size > FONT_UPLOAD_MAX_BYTES) throw new Error("Each font must be non-empty and 4 MB or smaller.");
  const { taylorOwnerSession, responseObject } = await import("./taylor-services-client");
  const session = await taylorOwnerSession();
  session.assertCurrent();
  // Browser font MIME support varies; infer declared type from a strict extension and verify its binary on the server.
  const response = await fetch("/api/taylor/fonts", { method: "POST", headers: { Authorization: `Bearer ${session.token}`, "Content-Type": FONT_CONTENT_TYPES[format], "X-TMC-Font-Rights": "confirmed" }, body: file, cache: "no-store", credentials: "same-origin", signal });
  const body = await responseObject(response);
  session.assertCurrent();
  if (!isOwnerFont(body.font)) throw new Error("The server did not return a valid saved font. Your draft has not changed.");
  return ownerFontRecord(body.font);
}
