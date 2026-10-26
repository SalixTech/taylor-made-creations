import { PublishedRoute } from "@/server/PublishedRoute";
import { Contact } from "@/components/Pages";
export const metadata = {title:"Contact"};
export default function Page() { return <PublishedRoute slug={["contact"]} fallback={<Contact />} />; }
