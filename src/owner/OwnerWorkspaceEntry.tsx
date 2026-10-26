"use client";

import { FirebaseOwnerGate } from "./FirebaseOwnerGate";
import OwnerPortal from "./OwnerPortal";

/** Authentication must resolve before the editor or its private data is mounted. */
export default function OwnerWorkspaceEntry() {
  return <FirebaseOwnerGate>{({ store, userEmail, signOut }) =>
    <OwnerPortal store={store} mode="cloud" userEmail={userEmail} onSignOut={signOut} />
  }</FirebaseOwnerGate>;
}
