import { PublishedRoute } from "@/server/PublishedRoute";
import { SuitCare } from "@/components/SuitCare";
export const metadata = { title: "Suit Care", alternates: { canonical: "/suitcare" } };
export default function Page() { return <PublishedRoute slug={["suitcare"]} fallback={<SuitCare />} />; }
