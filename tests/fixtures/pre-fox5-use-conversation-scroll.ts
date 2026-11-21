"use client";
import { useEffect, useLayoutEffect, type RefObject } from "react";

export function isConversationAtBottom(logRef: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">): boolean {
  return logRef.scrollHeight - logRef.scrollTop - logRef.clientHeight < 64;
}
export function followConversationBottom(logRef: Pick<HTMLElement, "scrollHeight" | "scrollTop"> | null, pinnedRef: boolean): void {
  if (logRef && pinnedRef) logRef.scrollTop = logRef.scrollHeight;
}
/** Layout first, then the next frame/size change: opening a hidden panel and
 * delayed wrapping cannot clip the newest bubble. Scrolled-back readers stay put. */
export function useConversationScroll(logRef: RefObject<HTMLDivElement | null>, pinnedRef: RefObject<boolean>, visible: boolean, revision: string) {
  useLayoutEffect(() => { if (visible) pinnedRef.current = true; }, [visible, pinnedRef]);
  useLayoutEffect(() => {
    if (!visible) return;
    const element = logRef.current;
    const follow = () => followConversationBottom(element, pinnedRef.current);
    follow(); const frame = requestAnimationFrame(follow);
    let observer: ResizeObserver | undefined;
    if (element && typeof ResizeObserver !== "undefined") { observer = new ResizeObserver(follow); observer.observe(element); for (const child of element.children) observer.observe(child); }
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [visible, revision, logRef, pinnedRef]);
  // Fonts can finish loading without a new message or React render.
  useEffect(() => { let active = true; void document.fonts?.ready.then(() => { if (active && visible) followConversationBottom(logRef.current, pinnedRef.current); }); return () => { active = false; }; }, [visible, logRef, pinnedRef]);
}
