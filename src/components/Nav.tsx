"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
export type NavLink = { href: string; label: string; id?: string };
const defaultLinks = [["/", "Home"], ["/prices", "Prices"], ["/gallery", "Fursuit Gallery"], ["/commissions", "Commissions"], ["/premades", "Premades"], ["/suitcare", "Suit Care"], ["/contact", "Contact"]].map(([href, label]) => ({ href, label }));
export function Nav({ showPremades, links = defaultLinks, moreLinks = [], moreEnabled = false }: { showPremades: boolean; links?: NavLink[]; moreLinks?: NavLink[]; moreEnabled?: boolean }) {
  const path = usePathname();
  const dropdown = useRef<HTMLDetailsElement>(null);
  useEffect(() => { dropdown.current?.removeAttribute("open"); }, [path]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (event.target instanceof Node && !dropdown.current?.contains(event.target)) dropdown.current?.removeAttribute("open"); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const render = ({ href, label, id }: NavLink) => <Link key={id ?? href} href={href} aria-current={(path === href || (href !== "/" && path.startsWith(`${href}/`))) ? "page" : undefined} onClick={() => dropdown.current?.removeAttribute("open")}>{label}</Link>;
  return <nav aria-label="Main navigation">{links.filter(({ href }) => href !== "/premades" || showPremades).map(render)}{moreEnabled && moreLinks.length > 0 && <details className="nav-more" ref={dropdown} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); dropdown.current?.removeAttribute("open"); dropdown.current?.querySelector("summary")?.focus(); } }}><summary>More <span aria-hidden="true">⌄</span></summary><div className="nav-more-menu">{moreLinks.map(render)}</div></details>}</nav>;
}
