import { PublishedRoute } from "@/server/PublishedRoute";
import Link from "next/link";
import { Intro } from "@/components/Pages";
import CommissionForm from "@/components/CommissionForm";
export const metadata = { title: "Commission form preview" };
function Request(){return <div className="page-shell"><Intro eyebrow="LET’S MEET YOUR CHARACTER" title="Commission request preview"><p>Try the form and review your choices locally. Requests, reference uploads and payments are not connected.</p></Intro><p><Link className="text-link" href="/commissions">← Commission information</Link></p><CommissionForm/></div>}

export default function Page() { return <PublishedRoute slug={["commissions/request"]} fallback={<Request />} request />; }
