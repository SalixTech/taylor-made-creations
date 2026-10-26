/** Shared, reference-counted lock so nested previews/modals cannot strand page scroll. */
type ScrollState = { count: number; body: HTMLElement; html?: HTMLElement; bodyStyle: {overflow:string;position:string;top:string;width:string;paddingRight:string}; htmlOverflow:string; scrollY:number };
const locks = new WeakMap<Document, ScrollState>();
export function lockPageScroll(): () => void {
  if (typeof document === "undefined" || typeof window === "undefined") return () => {};
  const existing = locks.get(document);
  let state = existing;
  if (state) state.count++;
  else {
    const body = document.body, html = document.documentElement;
    state = { count:1, body, html, bodyStyle:{overflow:body.style.overflow,position:body.style.position,top:body.style.top,width:body.style.width,paddingRight:body.style.paddingRight}, htmlOverflow:html?.style.overflow ?? "", scrollY:window.scrollY || 0 };
    locks.set(document, state);
    const gap = Math.max(0, (window.innerWidth || 0) - (html?.clientWidth || window.innerWidth || 0));
    const padding = typeof window.getComputedStyle === "function" ? parseFloat(window.getComputedStyle(body).paddingRight) || 0 : 0;
    body.style.overflow = "hidden"; body.style.position = "fixed"; body.style.top = `-${state.scrollY}px`; body.style.width = "100%";
    if (gap) body.style.paddingRight = `${padding + gap}px`;
    if (html) html.style.overflow = "hidden";
  }
  let released = false;
  const ownerDocument = document;
  return () => {
    if (released) return; released = true;
    const current = locks.get(ownerDocument);
    if (!current || --current.count > 0) return;
    locks.delete(ownerDocument);
    Object.assign(current.body.style, current.bodyStyle);
    if (current.html) current.html.style.overflow = current.htmlOverflow;
    window.scrollTo({ top:current.scrollY, behavior:"instant" });
  };
}
