"use client";
import Link from "next/link";
import { BUILD_HOST, websiteHostRole } from "./website-hosts";
import { useEffect, useState } from "react";
import { FirebaseOwnerGate, type FirebaseOwnerSession } from "./FirebaseOwnerGate";
import { assertPublishedOwnerSnapshot, publicContentToOwnerContent, type PublishedOwnerSnapshot } from "./model";
import { taylorOwnerSession } from "./taylor-services-client";
import { getPreviewPage, OWNER_PREVIEW_ROOT } from "./preview-model";
import { SiteContentFrame } from "@/components/SiteContent";
import { WorkspaceLoading } from "@/components/WorkspaceLoading";
function Preview({ session, pathname }: { session: FirebaseOwnerSession; pathname: string }) {
  const [snapshot, setSnapshot] = useState<PublishedOwnerSnapshot | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true; const controller = new AbortController();
    void (async () => {
      try {
        session.recoveryIdentity.assertCurrent();
        const owner = await taylorOwnerSession();
        const response = await fetch("/api/beta-publication", { headers: { Authorization: `Bearer ${owner.token}` }, cache: "no-store", credentials: "same-origin", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error("No beta publication is available. Publish from the beta builder, then reload this preview.");
        assertPublishedOwnerSnapshot(body.snapshot); owner.assertCurrent(); session.recoveryIdentity.assertCurrent();
        if (active) setSnapshot(body.snapshot);
      } catch (cause) { if (active && !controller.signal.aborted) { setSnapshot(null); setError(cause instanceof Error ? cause.message : "Beta preview unavailable."); } }
    })();
    return () => { active = false; controller.abort(); };
  }, [session.recoveryIdentity]);
  if (error) return <section role="alert"><h1>Beta preview unavailable</h1><p>{error}</p></section>;
  if (!snapshot) return <WorkspaceLoading title="Loading beta preview" />;
  const configuredBuildHost = process.env.NEXT_PUBLIC_TMC_BUILD_PREVIEW_HOST ?? "";
  const buildHost = configuredBuildHost || BUILD_HOST;
  // The server already checks paired deployment configuration; validate the link too.
  if (websiteHostRole(buildHost, process.env.NEXT_PUBLIC_TMC_BETA_PREVIEW_HOST ?? "", configuredBuildHost) !== "build") throw new Error("The builder preview hostname is not configured safely.");
  const content = publicContentToOwnerContent(snapshot.content);
  const relative = pathname.startsWith(OWNER_PREVIEW_ROOT) ? pathname.slice(OWNER_PREVIEW_ROOT.length) : pathname;
  const page = getPreviewPage(content, relative.split("/").filter(Boolean));
  if (!page || page.builtinKey === "client-hub") return <section><h1>Page unavailable in beta preview</h1><Link href="/">Return to beta home</Link></section>;
  return <><aside>Private beta preview · No changes to the main website. <a href={`https://${buildHost}/`} target="_blank" rel="noopener noreferrer">Open builder</a> <button type="button" onClick={() => void session.signOut()}>Sign out</button></aside><SiteContentFrame content={content} page={page} mode="private-preview" /></>;
}
/** No private data is embedded in server HTML. Firestore and media enforce owner access. */
export function BetaWebsiteEntry({ pathname = "/" }: { pathname?: string }) { return <FirebaseOwnerGate>{session => <Preview session={session} pathname={pathname} />}</FirebaseOwnerGate>; }
