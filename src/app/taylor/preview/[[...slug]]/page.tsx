import { notFound } from "next/navigation";

export const metadata = { title: "Taylor’s private site preview", robots: { index: false, follow: false } };

export default async function TaylorPreviewPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { default: OwnerPreviewEntry } = await import("@/owner/OwnerPreviewEntry");
  const { slug } = await params;
  return <OwnerPreviewEntry slug={slug ?? []} />;
}
