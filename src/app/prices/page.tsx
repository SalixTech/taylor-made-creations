import { PublishedRoute } from "@/server/PublishedRoute";
import { Prices } from "@/components/Pages";
export const metadata = {title:"Fursuit prices"};
export default function Page() { return <PublishedRoute slug={["prices"]} fallback={<Prices />} />; }
