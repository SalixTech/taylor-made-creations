import { PublishedRoute } from "@/server/PublishedRoute";
import { ClientHub } from "@/components/Pages";
export const metadata = {title:"Client hub"};
export default function Page() { return <PublishedRoute slug={["client-hub"]} fallback={<ClientHub />} />; }
