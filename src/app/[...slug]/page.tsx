import { notFound } from "next/navigation";
import { PublishedRoute } from "@/server/PublishedRoute";
export default async function CustomPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  if (slug.length < 1 || slug.length > 2 || (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug[0]) || slug[0].length > 64) || (slug.length === 2 && (!slug[1] || slug[1].includes("/") || slug[1].length > 150))) notFound();
  return <PublishedRoute slug={slug} />;
}
