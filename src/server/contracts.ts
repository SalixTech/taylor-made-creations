/** Future backend boundary only. No database, billing, auth or submission exists. */
export type FutureService = "commission-requests" | "client-hub" | "payments" | "owner-content";
export const connectedServices: readonly FutureService[] = [];
