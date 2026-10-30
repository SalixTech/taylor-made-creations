"use client";
import Link from "next/link";
import type { OwnerPage } from "@/owner/model";
import { pageHref } from "@/owner/model";
import CommissionForm from "./CommissionForm";
export function CommissionRequestPage({ page }: { page: OwnerPage }) {
  return <div className="page-shell"><div className="page-intro"><p className="eyebrow">LET’S MEET YOUR CHARACTER</p><h1>Commission request</h1><p>Share your character, review your choices, and send a private request to Taylor. No payment is taken.</p></div><p><Link className="text-link" href={pageHref(page)}>← {page.title}</Link></p><CommissionForm /></div>;
}
