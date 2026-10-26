import type { CSSProperties } from "react";

/** Deliberately bounded creative tokens; never a free-form style, class or HTML field. */
export type ElementAppearance = {
  textColor?: string;
  backgroundColor?: string;
  font?: "original" | "sans" | "serif" | "rounded" | "mono";
  fontId?: string;
  fontSize?: number;
  headingAlign?: "left" | "center" | "right";
  bodyAlign?: "left" | "center" | "right";
  widthPercent?: number;
  heightPercent?: number;
  textSize?: "small" | "standard" | "large";
  align?: "left" | "center" | "right";
  imageFit?: "cover" | "contain";
  imagePositionX?: number;
  imagePositionY?: number;
};
const fonts = { original: "'MS Reference Sans Serif',Arial,Helvetica,sans-serif", sans: "Arial,Helvetica,sans-serif", serif: "Georgia,'Times New Roman',serif", rounded: "'Trebuchet MS',Arial,sans-serif", mono: "'Courier New',monospace" };
const scales = { small: 0.85, standard: 1, large: 1.2 };
const color = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const bounded = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const alignment = (value: unknown): value is "left" | "center" | "right" => value === "left" || value === "center" || value === "right";
export function customFontFamily(id: unknown): string | null { return typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(id) ? `TMCFont_${id}` : null; }
const position = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
/** Rendering is defensive even before the strict save/publish validation boundary. */
export function getElementAppearanceStyle(appearance?: ElementAppearance): CSSProperties {
  if (!appearance || typeof appearance !== "object") return {};
  const style: Record<string, string | number> = {};
  if (color(appearance.textColor)) style["--element-text-color"] = appearance.textColor;
  if (color(appearance.backgroundColor)) style["--element-background"] = appearance.backgroundColor;
  if (typeof appearance.font === "string" && Object.hasOwn(fonts, appearance.font)) style["--element-font"] = fonts[appearance.font];
  if (typeof appearance.textSize === "string" && Object.hasOwn(scales, appearance.textSize)) style["--element-text-scale"] = scales[appearance.textSize];
  const customFont = customFontFamily(appearance.fontId);
  if (customFont) style["--element-font"] = `'${customFont}',Arial,Helvetica,sans-serif`;
  if (bounded(appearance.fontSize, 8, 144)) style["--element-font-size"] = `${appearance.fontSize}px`;
  if (alignment(appearance.align)) style.textAlign = appearance.align;
  if (alignment(appearance.headingAlign)) style["--element-heading-align"] = appearance.headingAlign;
  if (alignment(appearance.bodyAlign)) style["--element-body-align"] = appearance.bodyAlign;
  if (bounded(appearance.widthPercent, 10, 100)) { style.width = `${appearance.widthPercent}%`; style.maxWidth = "100%"; }
  if (bounded(appearance.heightPercent, 10, 200)) style.minHeight = `${appearance.heightPercent}vh`;
  return style as CSSProperties;
}
export function getElementAppearanceAttributes(appearance?: ElementAppearance) {
  const style = getElementAppearanceStyle(appearance) as Record<string, unknown>;
  const imageStyle = getImageAppearanceStyle(appearance);
  return {
    "data-element-appearance": Object.keys(style).length || Object.keys(imageStyle).length ? "true" : undefined,
    "data-element-text-color": style["--element-text-color"] ? "true" : undefined,
    "data-element-background": style["--element-background"] ? "true" : undefined,
    "data-element-font": style["--element-font"] ? "true" : undefined,
    "data-element-text-size": style["--element-text-scale"] ? "true" : undefined,
    "data-element-font-size": style["--element-font-size"] ? "true" : undefined,
    "data-element-heading-align": style["--element-heading-align"] ? "true" : undefined,
    "data-element-body-align": style["--element-body-align"] ? "true" : undefined,
    "data-element-align": style.textAlign as "left" | "center" | "right" | undefined,
  };
}
export function getImageAppearanceStyle(appearance?: ElementAppearance): CSSProperties {
  if (!appearance || typeof appearance !== "object") return {};
  const style: CSSProperties = {};
  if (appearance.imageFit === "cover" || appearance.imageFit === "contain") style.objectFit = appearance.imageFit;
  if (position(appearance.imagePositionX) || position(appearance.imagePositionY)) style.objectPosition = `${position(appearance.imagePositionX) ? appearance.imagePositionX : 50}% ${position(appearance.imagePositionY) ? appearance.imagePositionY : 50}%`;
  return style;
}
