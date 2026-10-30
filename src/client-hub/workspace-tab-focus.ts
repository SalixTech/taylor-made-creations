/** Only explicit tab navigation calls this; live messages never move the page. */
export function focusWorkspaceTab(workspace: HTMLElement, composer: HTMLElement | null, chat: boolean) {
  // Popup workspaces own their scroll container. Never move the page behind a dialog.
  if (workspace.closest('dialog,[role="dialog"]')) return;
  const viewport = window.visualViewport;
  const top = viewport?.offsetTop ?? 0, bottom = top + (viewport?.height ?? window.innerHeight);
  if (!Number.isFinite(bottom)) return;
  let clearance = top + 12;
  for (const header of document.querySelectorAll('header')) {
    const style = window.getComputedStyle(header), bounds = header.getBoundingClientRect();
    if ((style.position === 'sticky' || style.position === 'fixed') && bounds.top <= top + 1 && bounds.bottom > top && bounds.bottom < bottom) clearance = Math.max(clearance, bounds.bottom + 12);
  }
  const bounds = workspace.getBoundingClientRect(), target = chat && composer ? composer.getBoundingClientRect() : bounds;
  // Prefer the workspace heading, but never leave a fitting composer clipped below the viewport.
  let delta = bounds.top - clearance;
  if (chat && composer && target.height <= bottom - clearance - 12) delta = Math.max(delta, target.bottom - bottom + 12);
  else if (chat && composer) delta = target.top - clearance;
  window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: 'auto' });
}
