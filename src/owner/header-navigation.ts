import { getMoreNavigation, getVisibleNavigation, isPageAvailable, pageHref, type OwnerContent, type OwnerPage } from "./model";

export const TRELLO_BOARD_URL = "https://trello.com/b/mjEvvCqI/";
export type HeaderNavigationLink = { id: string; href: string; label: string; pageId?: string };

function pageLink(page: OwnerPage): HeaderNavigationLink {
  return { id: page.id, pageId: page.id, href: pageHref(page), label: page.builtinKey === "terms" && page.navLabel === "Terms of service" ? "TOS" : page.navLabel };
}

/** Required top links do not change saved placements or resurrect hidden/trashed pages. */
export function getHeaderNavigation(content: OwnerContent): { main: HeaderNavigationLink[]; more: HeaderNavigationLink[] } {
  const main = getVisibleNavigation(content).map(pageLink);
  const terms = content.pages.find(page => page.builtinKey === "terms" && isPageAvailable(content, page));
  if (terms && !main.some(link => link.pageId === terms.id)) main.push(pageLink(terms));
  main.push({ id: "trello-board", href: TRELLO_BOARD_URL, label: "Trello" });
  return { main, more: getMoreNavigation(content).filter(page => page.builtinKey !== "terms").map(pageLink) };
}
