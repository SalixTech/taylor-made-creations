export const metadata = { title: "Taylor’s Space", robots: { index: false, follow: false } };

export default async function TaylorPage() {
  // The workspace and saved preview have distinct routes and the same owner gate.
  const { default: OwnerWorkspaceEntry } = await import("@/owner/OwnerWorkspaceEntry");
  return <OwnerWorkspaceEntry />;
}
