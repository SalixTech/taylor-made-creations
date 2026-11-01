import {getTemplateText} from "./site-design";
import { getMoreNavigation, getVisibleNavigation, isPageAvailable, pageHref, type OwnerContent, type OwnerPage } from "./model";

export const TRELLO_BOARD_URL = "https://trello.com/b/mjEvvCqI/";
export type HeaderNavigationLink = { id: string; href: string; label: string; pageId?: string };

function pageLink(page: OwnerPage): HeaderNavigationLink {
  return { id: page.id, pageId: page.id, href: pageHref(page), label: page.builtinKey === "terms" && page.navLabel === "Terms of service" ? "TOS" : page.navLabel };
}

/** Older drafts can have More enabled without any assigned pages. Keep the
 * switch functional without mutating a saved draft or exposing unlisted pages. */
export function getAutomaticMorePage(content: OwnerContent): OwnerPage | undefined {
  if (!content.site.moreEnabled || getMoreNavigation(content).some(page => page.builtinKey !== "terms")) return undefined;
  return getVisibleNavigation(content).filter(page => page.builtinKey !== "home" && page.builtinKey !== "terms").at(-1);
}

/** Required top links do not change saved placements or resurrect hidden/trashed pages. */
export function getHeaderNavigation(content: OwnerContent): { main: HeaderNavigationLink[]; more: HeaderNavigationLink[] } {
  const automatic = getAutomaticMorePage(content);
  const main = getVisibleNavigation(content).filter(page => page.id !== automatic?.id).map(pageLink);
  const terms = content.pages.find(page => page.builtinKey === "terms" && isPageAvailable(content, page));
  if (terms && !main.some(link => link.pageId === terms.id)) main.push(pageLink(terms));
  main.push({ id: "trello-board", href: TRELLO_BOARD_URL, label: getTemplateText(content,"site.trelloLabel") });
  return { main, more: automatic ? [pageLink(automatic)] : getMoreNavigation(content).filter(page => page.builtinKey !== "terms").map(pageLink) };
}
