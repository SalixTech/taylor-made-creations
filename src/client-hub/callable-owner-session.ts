"use client";
import { assertHubWindowSession } from "@/client-hub/window-session";

import { getOwnerFirebaseClient, readOwnerFirebaseConfig } from "@/owner/firebase-client";

/** Only for authenticated Hub callables, never for authorizing a browser read.
 * The callable independently verifyIdToken(..., true)-checks revocation on every
 * request. Avoid reloading the Auth profile + forcing another token round trip
 * before that same server check on every chat send/save. */
export async function hubCallableOwnerSession() {
  const config = readOwnerFirebaseConfig();
  if (config.status !== "ready" || config.options.projectId !== "taylor-made-creations" || config.ownerUid !== "a4ARjp0z8ZOByKlC2AfGzmMRj843") throw new Error("The private owner connection is not configured. Ask Salix to check the Firebase setup.");
  const connection = getOwnerFirebaseClient(config), user = connection.auth.currentUser;
  if (!user || user.uid !== config.ownerUid) throw new Error("Sign in with Taylor’s owner account to continue.");
  const assertCurrent = () => {
    assertHubWindowSession("owner", user.uid); if (connection.auth.currentUser !== user || connection.auth.currentUser?.uid !== config.ownerUid) throw new Error("Your owner session changed. Sign in again to continue."); };
  await user.getIdToken(false);
  assertCurrent();
  return { auth: connection.auth, assertCurrent };
}
