import { PublishedRoute } from "@/server/PublishedRoute";
import { Gallery } from "@/components/Pages";
export const metadata = {title:"Gallery"};
export default function Page() { return <PublishedRoute slug={["gallery"]} fallback={<Gallery />} />; }
