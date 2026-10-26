import { redirect } from "next/navigation";

export const metadata = { title: "Taylor’s Space", robots: { index: false, follow: false } };

/** Keep old workspace bookmarks on the canonical authenticated workspace. */
export default async function OwnerPage() {
  redirect("/taylor");
}
