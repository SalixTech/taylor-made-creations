import { redirect } from "next/navigation";

export const metadata = { title: "Taylor’s private site preview", robots: { index: false, follow: false } };

export default async function OwnerPreviewPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  redirect(`/taylor/preview${slug?.length ? `/${slug.map(encodeURIComponent).join("/")}` : ""}`);
}
