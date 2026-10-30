import { ClientHub } from "@/client-hub/ClientHub";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client hub", robots: { index: false, follow: false } };

// Private client access stays available while the public storefront is under construction.
// Client records are fetched only after code authentication and are never server serialized.
export default function Page() { return <ClientHub />; }
