/** Full-card visual feedback without moving the grid: the original is the stable placeholder. */
export function createNavigationDragGhost(card: HTMLElement, x: number, y: number) {
  const bounds = card.getBoundingClientRect();
  const ghost = card.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  ghost.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  ghost.dataset.dragGhost = "true";
  Object.assign(ghost.style, { position: "fixed", left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`, margin: "0", pointerEvents: "none", zIndex: "100", opacity: "0.96", transform: "translate3d(0,0,0)", transition: "none" });
  card.parentElement?.appendChild(ghost);
  card.dataset.dragging = "true";
  return {
    move(nextX: number, nextY: number) { ghost.style.transform = `translate3d(${nextX - x}px,${nextY - y}px,0)`; },
    remove() { ghost.remove(); delete card.dataset.dragging; },
  };
}

export function navigationDropAfter(bounds: { left: number; top: number; width: number; height: number }, x: number, y: number, columns: boolean) {
  return columns ? x >= bounds.left + bounds.width / 2 : y >= bounds.top + bounds.height / 2;
}
