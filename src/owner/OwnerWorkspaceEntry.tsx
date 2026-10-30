"use client";

import { FirebaseOwnerGate } from "./FirebaseOwnerGate";
import OwnerPortal from "./OwnerPortal";
import type { OwnerSection } from "./owner-navigation";

/** Authentication must resolve before the editor or its private data is mounted. */
export default function OwnerWorkspaceEntry({ initialSection = "overview", initialPageId }: { initialSection?: OwnerSection; initialPageId?: string }) {
  return <FirebaseOwnerGate>{({ store, userEmail, signOut, recoveryIdentity }) =>
    <OwnerPortal store={store} recoveryIdentity={recoveryIdentity} mode="cloud" userEmail={userEmail} onSignOut={signOut} initialSection={initialSection} initialPageId={initialPageId} />
  }</FirebaseOwnerGate>;
}
