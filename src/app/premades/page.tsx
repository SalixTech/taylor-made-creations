import { PublishedRoute } from "@/server/PublishedRoute";
import { Premades } from "@/components/Pages";
export const metadata = {title:"Premades"};
export default function Page() { return <PublishedRoute slug={["premades"]} fallback={<Premades />} />; }
