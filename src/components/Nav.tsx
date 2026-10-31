"use client";
import type {ReactElement,ReactNode} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNavigationDisclosure } from "./use-navigation-disclosure";
import { DropdownChevron } from "./DropdownChevron";
import { TRELLO_BOARD_URL } from "@/owner/header-navigation";
export type NavLink = { href: string; label: string; id?: string };
const defaultLinks = [["/", "Home"], ["/prices", "Prices"], ["/gallery", "Fursuit Gallery"], ["/commissions", "Commissions"], ["/premades", "Premades"], ["/suitcare", "Suit Care"], ["/contact", "Contact"], ["/terms", "TOS"], [TRELLO_BOARD_URL, "Trello"]].map(([href, label]) => ({ href, label }));
export function Nav({ showPremades, links = defaultLinks, moreLinks = [], moreEnabled = false, decorate }: { decorate?: (key:string,element:ReactElement)=>ReactNode; showPremades: boolean; links?: NavLink[]; moreLinks?: NavLink[]; moreEnabled?: boolean }) {
  const path = usePathname();
  const dropdown = useNavigationDisclosure(path);
  const wrap=(key:string,element:ReactElement)=>decorate?decorate(key,element):element;
  const render = ({ href, label, id }: NavLink) => wrap(`layout.navigation:${id??href}`,href.startsWith("https://")
    ? <a key={id ?? href} href={href} target="_blank" rel="noopener noreferrer" onClick={() => dropdown.current?.removeAttribute("open")}>{label}</a>
    : <Link key={id ?? href} href={href} aria-current={(path === href || (href !== "/" && path.startsWith(`${href}/`))) ? "page" : undefined} onClick={() => dropdown.current?.removeAttribute("open")}>{label}</Link>);
  return wrap("layout.site.navigation",<nav aria-label="Main navigation">{links.filter(({ href }) => href !== "/premades" || showPremades).map(render)}{moreEnabled && moreLinks.length > 0 && wrap("layout.site.more",<details className="nav-more" ref={dropdown} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dropdown.current?.removeAttribute("open"); dropdown.current?.querySelector("summary")?.focus(); } }}><summary>More <DropdownChevron className="nav-more-chevron" /></summary><div className="nav-more-menu">{moreLinks.map(render)}</div></details>)}</nav>);
}
