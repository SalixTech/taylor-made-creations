/** Temporary display-only hold. Never changes saved/account theme preferences. */
export function ownerLightGuarded(scope: string, environment = process.env.NODE_ENV): boolean {
  return scope === "owner" && environment === "production";
}
export const FOX_COOLDOWN_MS = 60_000;
export function foxCooldownSeconds(until: number, now: number): number {
  return Number.isFinite(until) && Number.isFinite(now) ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}
