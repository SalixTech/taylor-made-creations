export const metadata = { title: "Taylor’s private site preview", robots: { index: false, follow: false } };

export default async function TaylorPreviewPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  // Direct preview links stay behind the same owner gate as the workspace.
  const { default: OwnerPreviewEntry } = await import("@/owner/OwnerPreviewEntry");
  const { slug } = await params;
  return <OwnerPreviewEntry slug={slug ?? []} />;
}
