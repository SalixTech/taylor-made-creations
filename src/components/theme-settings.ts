export const THEME_AREAS = ["public", "owner", "hub"] as const;
export type ThemeArea = typeof THEME_AREAS[number];
export type ThemeMode = "light" | "dark";
export type ThemeChoice = ThemeMode | "inherit";
export type ThemeModes = Record<ThemeArea, ThemeChoice>;
export type ThemePreferences = { schemaVersion: 1; revision: number; modes: ThemeModes };
export type ThemeDefaults = ThemePreferences & { defaultMode: ThemeMode };
export const emptyThemeModes = (): ThemeModes => ({ public: "inherit", owner: "inherit", hub: "inherit" });
export const initialThemeDefaults = (): ThemeDefaults => ({ schemaVersion: 1, revision: 0, defaultMode: "light", modes: { public: "inherit", owner: "dark", hub: "inherit" } });
export function decodeThemePreferences(value: unknown, defaults = false): ThemePreferences | ThemeDefaults {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Display settings could not be read.");
  const data = value as Record<string, unknown>, allowed = defaults ? ["schemaVersion", "revision", "modes", "defaultMode"] : ["schemaVersion", "revision", "modes"];
  if (Object.keys(data).length !== allowed.length || Object.keys(data).some(key => !allowed.includes(key)) || data.schemaVersion !== 1 || !Number.isSafeInteger(data.revision) || Number(data.revision) < 1 || Number(data.revision) >= Number.MAX_SAFE_INTEGER) throw new Error("Display settings need refreshing.");
  if (!data.modes || typeof data.modes !== "object" || Array.isArray(data.modes) || Object.keys(data.modes).length !== 3 || Object.keys(data.modes).some(key => !THEME_AREAS.includes(key as ThemeArea))) throw new Error("Display areas are invalid.");
  const modes = data.modes as Record<string, unknown>;
  if (THEME_AREAS.some(area => !["inherit", "light", "dark"].includes(String(modes[area])))) throw new Error("Choose light, dark, or the site default.");
  if (defaults && !["light", "dark"].includes(String(data.defaultMode))) throw new Error("The site display default is invalid.");
  return { schemaVersion: 1, revision: Number(data.revision), modes: { ...modes } as ThemeModes, ...(defaults ? { defaultMode: data.defaultMode as ThemeMode } : {}) };
}
export function resolveThemeMode(area: ThemeArea, defaults: ThemeDefaults, preference?: ThemeModes): ThemeMode {
  const own = preference?.[area]; if (own === "light" || own === "dark") return own;
  // MAIN public visitors start light; explicit browser/account choices still win.
  if (area === "public") return "light";
  const mode = defaults.modes[area]; return mode === "inherit" ? defaults.defaultMode : mode;
}
