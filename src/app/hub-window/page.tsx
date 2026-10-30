import { Suspense } from "react";
import { HubWindowRoute } from "@/client-hub/HubWindowRoute";
export const dynamic = "force-dynamic";
export const metadata = { title: "Private Hub window", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
/** No private records or credentials are fetched or serialized by this route. */
export default function Page() { return <Suspense fallback={<p>Checking your private Hub window…</p>}><HubWindowRoute /></Suspense>; }
