export const STUDIO_OWNER_UID = "a4ARjp0z8ZOByKlC2AfGzmMRj843";
export const STUDIO_OWNER_UIDS: readonly string[] = Object.freeze([STUDIO_OWNER_UID, "VhnIFsEQFqRtS8u98mP921wim4J3"]);
export function isStudioOwnerUid(uid: unknown): uid is string {
  return typeof uid === "string" && STUDIO_OWNER_UIDS.includes(uid);
}
