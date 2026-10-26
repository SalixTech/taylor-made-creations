"use client";

import type { OwnerFont } from "./model";

export const FONT_UPLOAD_MAX_BYTES = 4_000_000;
export const FONT_UPLOAD_ACCEPT = ".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf";
export const OWNER_FONT_SOURCE_PATTERN = /^\/api\/(?:cloud-fonts|fonts)\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const FONT_CONTENT_TYPES = { woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf" } as const;
export function isOwnerFont(value: unknown): value is OwnerFont {
  if (!value || typeof value !== "object") return false;
  const font = value as Partial<OwnerFont>;
  return typeof font.id === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(font.id) && typeof font.src === "string" && OWNER_FONT_SOURCE_PATTERN.test(font.src) && typeof font.name === "string" && !!font.name.trim() && font.name.length <= 100 && typeof font.format === "string" && Object.hasOwn(FONT_CONTENT_TYPES, font.format);
}
export function ownerFontRecord(font: OwnerFont): OwnerFont {
  return { id: font.id, name: font.name, src: font.src, format: font.format };
}
export async function uploadOwnerFont(file: File, signal?: AbortSignal): Promise<OwnerFont> {
  const format = file.name.toLowerCase().split(".").pop() as keyof typeof FONT_CONTENT_TYPES;
  if (!Object.hasOwn(FONT_CONTENT_TYPES, format)) throw new Error("Choose a WOFF, WOFF2, TTF or OTF file. SVG fonts, archives and font collections are not supported.");
  if (!file.size || file.size > FONT_UPLOAD_MAX_BYTES) throw new Error("Each font must be non-empty and 4 MB or smaller.");
  const { uploadCloudFont } = await import("./cloud-files-client");
  const { cloudFileToOwnerFont } = await import("./cloud-files-model");
  const record = await uploadCloudFont(file, { signal });
  const font = cloudFileToOwnerFont(record);
  if (!font) throw new Error("The saved font could not be added to your draft.");
  return font;
}
