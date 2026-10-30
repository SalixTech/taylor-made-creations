import { CLIENT_HUB_COMPACT_CODE, CLIENT_HUB_LEGACY_CODE, normalizeClientHubCode } from "./model";

export const CODE_SEGMENT_LENGTHS = [3, 3, 3, 2] as const;
export type CodeSegments = [string, string, string, string];
export function codeSegments(value: string): CodeSegments {
  const parts = value.split("-");
  return CODE_SEGMENT_LENGTHS.map((length, index) => cleanCodeSegment(parts[index] ?? "", index).slice(0, length)) as CodeSegments;
}
export function cleanCodeSegment(value: string, index: number): string {
  return value.toUpperCase().replace(index === 2 ? /[^0-9]/g : index === 0 ? /[^A-Z0-9]/g : /[^A-Z]/g, "");
}
export function joinCodeSegments(parts: CodeSegments): string { return parts.some(Boolean) ? parts.join("-") : ""; }
export function pastedSignInCode(value: string): { kind: "compact" | "legacy"; value: string } | null {
  const input = value.trim();
  if (CLIENT_HUB_LEGACY_CODE.test(input)) return { kind: "legacy", value: input };
  const compact = normalizeClientHubCode(input);
  if (CLIENT_HUB_COMPACT_CODE.test(compact)) return { kind: "compact", value: compact };
  if (/^[A-Za-z0-9]{3}[A-Za-z]{3}[0-9]{3}[A-Za-z]{2}$/.test(input)) return { kind: "compact", value: `${input.slice(0, 3)}-${input.slice(3, 6)}-${input.slice(6, 9)}-${input.slice(9)}`.toUpperCase() };
  return null;
}
