import { notFound } from "next/navigation";
import { PublishedRoute } from "@/server/PublishedRoute";
import { getPublishedSite } from "@/server/published-site";
import { UnderConstruction } from "@/components/UnderConstruction";
export default async function CustomPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  // Include malformed/deeper public URLs before Next's not-found boundary streams.
  if ((await getPublishedSite()).status === "locked") return <UnderConstruction />;
  if (slug.length < 1 || slug.length > 2 || (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug[0]) || slug[0].length > 64) || (slug.length === 2 && (!slug[1] || slug[1].includes("/") || slug[1].length > 150))) notFound();
  return <PublishedRoute slug={slug} />;
}
