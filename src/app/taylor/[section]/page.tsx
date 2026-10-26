import { notFound } from "next/navigation";
import { ownerSectionFromSlug } from "@/owner/owner-navigation";

export const metadata = { title: "Taylor’s Space", robots: { index: false, follow: false } };

export default async function TaylorSectionPage({ params, searchParams }: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { section: slug } = await params;
  const section = ownerSectionFromSlug(slug);
  if (!section) notFound();
  const query = await searchParams;
  const pageId = section === "pages" && typeof query?.page === "string" ? query.page : undefined;
  const { default: OwnerWorkspaceEntry } = await import("@/owner/OwnerWorkspaceEntry");
  return <OwnerWorkspaceEntry initialSection={section} initialPageId={pageId} />;
}
