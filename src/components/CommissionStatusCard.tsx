import Link from "next/link";
import type { CommissionStatus } from "@/content/site";

export function CommissionStatusCard({ status, note }: { status: CommissionStatus; note: string }) {
  return <section className="status-panel" aria-labelledby="commission-status-label">
    <div className="status-summary">
      <span id="commission-status-label" className="status-label">COMMISSION STATUS</span>
      <h2 className={status === "Closed" ? "status-closed" : "status-available"}>{status}</h2>
    </div>
    <p className="status-copy">{note}</p>
    {status === "Open!" && <Link className="button status-action" href="/commissions/request">Commission Me <span aria-hidden="true">→</span></Link>}
  </section>;
}
