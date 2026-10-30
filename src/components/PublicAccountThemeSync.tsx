"use client";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { isOrdinaryPublicThemeRoute, watchPublicThemeAccount, type PublicThemeAccount } from "./theme-public-account";
function ConnectedPublicTheme({ pathname }: { pathname: string }) {
  const initialPath = useRef(pathname);
  const [verified, setVerified] = useState<{ account: PublicThemeAccount; Component: ComponentType<{ role: "owner" | "client"; accountKey: string }> } | null>(null);
  useEffect(() => {
    let active = true, revision = 0;
    const stop = watchPublicThemeAccount(initialPath.current, account => {
      const request = ++revision; setVerified(null); if (!account) return;
      void import("./AccountThemeSync").then(module => { if (!active || request !== revision) return; account.assertCurrent(); setVerified({ account, Component: module.AccountThemeSync }); }).catch(() => { if (active && request === revision) setVerified(null); });
    });
    return () => { active = false; ++revision; stop(); };
  }, []);
  if (!verified) return null;
  const { account, Component } = verified;
  return <Component key={`${account.role}:${account.accountKey}`} role={account.role} accountKey={account.accountKey} />;
}
/** Mount/unmount a separate child at the route boundary, so an old verified
 * account cannot briefly reappear when returning from another private role. */
export function PublicAccountThemeSync({ pathname }: { pathname: string }) {
  return isOrdinaryPublicThemeRoute(pathname) ? <ConnectedPublicTheme pathname={pathname} /> : null;
}
