import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Taylor’s Space", robots: { index: false, follow: false } };

export default async function TaylorPage() {
  // Production remains closed until the complete owner workflow is verified.
  if (process.env.NODE_ENV !== "development") notFound();
  const { default: OwnerWorkspaceEntry } = await import("@/owner/OwnerWorkspaceEntry");
  return <OwnerWorkspaceEntry />;
}
