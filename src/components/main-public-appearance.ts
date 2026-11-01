/** MAIN-only presentation policy. Owner and client workspaces keep their existing themes. */
export function isMainPublicRoute(pathname: string): boolean {
  return !/^\/(?:taylor|owner)(?:\/|$)/.test(pathname) && pathname !== "/client-hub" && !pathname.startsWith("/client-hub/") && pathname !== "/hub-window";
}
