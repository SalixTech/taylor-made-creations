import type { OwnerPage } from "./model";

/** A builder selection must never leak into a template section's preview. */
export function resolveWorkspacePage(pages: OwnerPage[], section: string, selectedId?: string, builtin?: OwnerPage["builtinKey"]): OwnerPage | undefined {
  const active = pages.filter(page => !page.trashedAt);
  const home = active.find(page => page.builtinKey === "home");
  if (section === "pages") return active.find(page => page.id === selectedId) ?? home;
  return active.find(page => page.builtinKey === builtin) ?? home;
}
