import { CodeRecovery } from "@/intake/CodeRecovery";
export const dynamic = "force-dynamic";
export const metadata = { title: "Request a client code", robots: { index: false, follow: false } };
export default function Page() { return <CodeRecovery />; }
