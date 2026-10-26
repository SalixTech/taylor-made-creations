import { PublishedRoute } from "@/server/PublishedRoute";
import { Home } from "@/components/Pages";
export default function Page() { return <PublishedRoute slug={[]} fallback={<Home />} />; }
