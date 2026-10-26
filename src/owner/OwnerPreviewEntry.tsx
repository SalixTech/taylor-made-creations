"use client";

import { FirebaseOwnerGate } from "./FirebaseOwnerGate";
import { OwnerSitePreview } from "./OwnerSitePreview";

/** Direct preview links receive exactly the same owner authentication gate. */
export default function OwnerPreviewEntry({ slug }: { slug: string[] }) {
  return <FirebaseOwnerGate>{({ store, userEmail, signOut }) =>
    <OwnerSitePreview slug={slug} store={store} mode="cloud" userEmail={userEmail} onSignOut={signOut} />
  }</FirebaseOwnerGate>;
}
