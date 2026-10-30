"use client";
import { useEffect, useLayoutEffect, useRef, type RefObject, type UIEvent } from "react";

export function isConversationAtBottom(log: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">): boolean {
  return log.scrollHeight - log.scrollTop - log.clientHeight < 64;
}
export function followConversationBottom(log: Pick<HTMLElement, "scrollHeight" | "scrollTop"> | null, pinned: boolean): void {
  if (log && pinned) log.scrollTop = log.scrollHeight;
}
/** A queued scroll event from an earlier programmatic follow can arrive after
 * content/viewport growth, at the same scrollTop but farther from the new bottom.
 * That is not a reader scrolling back.
 * Only actual movement away from the bottom can release follow; reaching bottom re-enables it. */
export function updateConversationPin(log: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">, pinned: boolean, previousTop: number): boolean {
  if (isConversationAtBottom(log)) return true;
  return Math.abs(log.scrollTop - (Number.isFinite(previousTop) ? previousTop : 0)) > 1 ? false : pinned;
}
/** Use the live scrollport after every layout, frame and measured size change.
 * Hidden-panel scroll events cannot undo the next opening's bottom position. */
export function useConversationScroll(logRef: RefObject<HTMLDivElement | null>, pinnedRef: RefObject<boolean>, visible: boolean, revision: string) {
  const previousTop = useRef(0);
  useLayoutEffect(() => { if (visible) pinnedRef.current = true; }, [visible, pinnedRef]);
  useLayoutEffect(() => {
    if (!visible) return;
    const element = logRef.current;
    const follow = () => { followConversationBottom(element, pinnedRef.current); if (element) previousTop.current = element.scrollTop; };
    follow(); const frame = requestAnimationFrame(follow);
    let observer: ResizeObserver | undefined;
    if (element && typeof ResizeObserver !== "undefined") { observer = new ResizeObserver(follow); observer.observe(element); for (const child of element.children) observer.observe(child); }
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [visible, revision, logRef, pinnedRef]);
  useEffect(() => { let active = true; void document.fonts?.ready.then(() => { if (active && visible) { followConversationBottom(logRef.current, pinnedRef.current); if (logRef.current) previousTop.current = logRef.current.scrollTop; } }); return () => { active = false; }; }, [visible, logRef, pinnedRef]);
  return (event: UIEvent<HTMLDivElement>) => {
    if (!visible) return;
    const element = event.currentTarget;
    pinnedRef.current = updateConversationPin(element, pinnedRef.current, previousTop.current);
    previousTop.current = element.scrollTop;
  };
}
