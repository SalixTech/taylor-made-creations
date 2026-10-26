import { PublishedRoute } from "@/server/PublishedRoute";
import { Commissions } from "@/components/Pages";
export const metadata = { title: "Commissions" };
export default function Page() { return <PublishedRoute slug={["commissions"]} fallback={<Commissions />} />; }
