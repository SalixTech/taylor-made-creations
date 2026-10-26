import { PublishedRoute } from "@/server/PublishedRoute";
import { Terms } from "@/components/Pages";
export const metadata = {title:"Terms of service"};
export default function Page() { return <PublishedRoute slug={["terms"]} fallback={<Terms />} />; }
