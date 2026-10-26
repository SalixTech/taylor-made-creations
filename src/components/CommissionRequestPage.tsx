"use client";
import Link from "next/link";
import type { OwnerPage } from "@/owner/model";
import { pageHref } from "@/owner/model";
import CommissionForm from "./CommissionForm";
export function CommissionRequestPage({ page }: { page: OwnerPage }) {
  return <div className="page-shell"><div className="page-intro"><p className="eyebrow">LET’S MEET YOUR CHARACTER</p><h1>Commission request preview</h1><p>Try the form and review your choices locally. Requests, reference uploads and payments are not connected.</p></div><p><Link className="text-link" href={pageHref(page)}>← {page.title}</Link></p><CommissionForm /></div>;
}
